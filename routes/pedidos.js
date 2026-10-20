import { Router } from 'express';
import { db, get, all, run, tx, listar, termo } from '../db.js';
import { erro, texto, inteiro, centavos, dataIso, hojeIso } from '../lib/http.js';
import { exigir } from '../lib/sessao.js';
import { pode } from '../lib/permissoes.js';
import { interpretarCondicao } from '../lib/parcelas.js';
import { ORIGENS, FORMAS_PAGAMENTO, STATUS, MODALIDADES_FRETE, calcularTotais } from '../lib/pedidos.js';

export const router = Router();

const SELECT_LISTA = `p.id, p.data, p.status, p.total, p.origem, p.forma_pagamento, p.vendedor_id, p.cliente_id,
  c.nome AS cliente_nome, c.municipio AS cliente_municipio, u.nome AS vendedor_nome`;
const FROM_LISTA = 'pedidos p JOIN clientes c ON c.id = p.cliente_id JOIN users u ON u.id = p.vendedor_id';

export function carregarPedido(id) {
  const p = get(`SELECT p.*, u.nome AS vendedor_nome, a.nome AS aprovado_por_nome FROM pedidos p
    JOIN users u ON u.id = p.vendedor_id LEFT JOIN users a ON a.id = p.aprovado_por WHERE p.id = ?`, id);
  if (!p) return null;
  p.cliente = get('SELECT * FROM clientes WHERE id = ?', p.cliente_id);
  p.itens = all(`SELECT i.*, pr.codigo FROM pedido_itens i JOIN produtos pr ON pr.id = i.produto_id
    WHERE i.pedido_id = ? ORDER BY i.id`, id);
  return p;
}

// Garante que o usuário pode ver o pedido.
function pedidoVisivel(req, id) {
  const p = carregarPedido(id);
  if (!p || (!pode(req.user.perfil, 'pedidos_todos') && p.vendedor_id !== req.user.id)) throw erro(404, 'Pedido não encontrado.');
  return p;
}

function validar(req, body) {
  const gestao = pode(req.user.perfil, 'pedidos_todos');
  const d = {
    data: dataIso(body.data) || hojeIso(),
    vendedor_id: gestao ? inteiro(body.vendedor_id, req.user.id) : req.user.id,
    cliente_id: inteiro(body.cliente_id),
    origem: texto(body.origem, 20),
    desconto: centavos(body.desconto),
    frete: centavos(body.frete),
    modalidade_frete: String(body.modalidade_frete ?? '9'),
    forma_pagamento: texto(body.forma_pagamento, 20),
    condicao_tipo: texto(body.condicao_tipo, 10),
    condicao_valor: texto(body.condicao_valor, 500),
    data_entrega: body.data_entrega ? dataIso(body.data_entrega) : null,
    receituario: texto(body.receituario, 60),
    observacoes: texto(body.observacoes, 2000),
  };
  if (!get('SELECT id FROM users WHERE id = ?', d.vendedor_id)) throw erro(400, 'Vendedor inválido.');
  const cliente = get('SELECT id, ativo FROM clientes WHERE id = ?', d.cliente_id);
  if (!cliente) throw erro(400, 'Escolha o cliente.');
  if (!ORIGENS.includes(d.origem)) throw erro(400, 'Escolha a origem do pedido.');
  if (!FORMAS_PAGAMENTO.includes(d.forma_pagamento)) throw erro(400, 'Escolha a forma de pagamento.');
  if (!(d.modalidade_frete in MODALIDADES_FRETE)) throw erro(400, 'Modalidade de frete inválida.');
  if (body.data_entrega && !d.data_entrega) throw erro(400, 'Data de entrega inválida.');
  if (d.data_entrega && d.data_entrega < d.data) throw erro(400, 'A data de entrega não pode ser anterior à data do pedido.');
  if (d.condicao_tipo === 'avista') d.condicao_valor = '';
  const cond = interpretarCondicao(d.condicao_tipo, d.condicao_valor, d.data);
  if (cond.erro) throw erro(400, cond.erro);
  if (cond.vencimentos.some((v) => v && v < d.data)) throw erro(400, 'Há vencimento anterior à data do pedido.');
  if (d.desconto < 0 || d.frete < 0) throw erro(400, 'Desconto e frete não podem ser negativos.');

  if (!Array.isArray(body.itens) || !body.itens.length) throw erro(400, 'Inclua pelo menos um item no pedido.');
  if (body.itens.length > 200) throw erro(400, 'Itens demais no pedido.');
  const itens = body.itens.map((it, i) => {
    const prod = get('SELECT id, descricao, unidade, ativo FROM produtos WHERE id = ?', inteiro(it.produto_id));
    if (!prod) throw erro(400, `Item ${i + 1}: escolha o produto.`);
    const quantidade = Number(String(it.quantidade ?? '').replace(',', '.'));
    if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 1e7) throw erro(400, `Item ${i + 1}: quantidade inválida.`);
    const preco_unit = centavos(it.preco_unit);
    if (preco_unit < 0) throw erro(400, `Item ${i + 1}: preço inválido.`);
    return { produto_id: prod.id, descricao: prod.descricao, unidade: texto(it.unidade, 6).toUpperCase() || prod.unidade,
      quantidade: Math.round(quantidade * 1000) / 1000, preco_unit };
  });
  // O total é sempre recalculado aqui no servidor.
  const t = calcularTotais(itens, d.desconto, d.frete);
  if (d.desconto > t.subtotal) throw erro(400, 'O desconto não pode ser maior que a soma dos itens.');
  return { ...d, itens: t.itens, subtotal: t.subtotal, total: t.total };
}

function gravarItens(pedidoId, itens) {
  run('DELETE FROM pedido_itens WHERE pedido_id = ?', pedidoId);
  const st = db.prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, descricao, unidade, quantidade, preco_unit, total)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const i of itens) st.run(pedidoId, i.produto_id, i.descricao, i.unidade, i.quantidade, i.preco_unit, i.total);
}

const COLUNAS = ['data', 'vendedor_id', 'cliente_id', 'origem', 'subtotal', 'desconto', 'frete', 'total', 'modalidade_frete',
  'forma_pagamento', 'condicao_tipo', 'condicao_valor', 'data_entrega', 'receituario', 'observacoes'];

export function podeEditarPedido(user, p) {
  if (pode(user.perfil, 'pedidos_todos')) return ['Recebido', 'Aprovado'].includes(p.status);
  return p.vendedor_id === user.id && p.status === 'Recebido';
}

router.get('/pedidos/opcoes', exigir('pedidos'), (req, res) => {
  res.json({ origens: ORIGENS, formas: FORMAS_PAGAMENTO, status: STATUS, modalidades: MODALIDADES_FRETE });
});

router.get('/pedidos', exigir('pedidos'), (req, res) => {
  const where = [];
  const params = [];
  if (!pode(req.user.perfil, 'pedidos_todos')) { where.push('p.vendedor_id = ?'); params.push(req.user.id); }
  else if (inteiro(req.query.vendedor)) { where.push('p.vendedor_id = ?'); params.push(inteiro(req.query.vendedor)); }
  if (STATUS.includes(req.query.status)) { where.push('p.status = ?'); params.push(req.query.status); }
  if (dataIso(req.query.de)) { where.push('p.data >= ?'); params.push(dataIso(req.query.de)); }
  if (dataIso(req.query.ate)) { where.push('p.data <= ?'); params.push(dataIso(req.query.ate)); }
  if (req.query.busca) {
    const n = inteiro(String(req.query.busca).replace(/\D/g, ''));
    where.push(`(c.nome LIKE ? ESCAPE '\\'${n ? ' OR p.id = ?' : ''})`);
    params.push(termo(req.query.busca));
    if (n) params.push(n);
  }
  res.json(listar({ select: SELECT_LISTA, from: FROM_LISTA, where, params, ordem: 'p.data DESC, p.id DESC',
    pagina: req.query.pagina, porPagina: req.query.porPagina }));
});

router.get('/pedidos/:id', exigir('pedidos'), (req, res) => {
  const p = pedidoVisivel(req, inteiro(req.params.id));
  p.podeEditar = podeEditarPedido(req.user, p);
  res.json(p);
});

router.post('/pedidos', exigir('pedidos'), (req, res) => {
  const d = validar(req, req.body);
  const id = tx(() => {
    const r = run(`INSERT INTO pedidos (${COLUNAS.join(', ')}, criado_por) VALUES (${COLUNAS.map(() => '?').join(', ')}, ?)`,
      ...COLUNAS.map((c) => d[c]), req.user.id);
    gravarItens(r.lastInsertRowid, d.itens);
    return Number(r.lastInsertRowid);
  });
  res.status(201).json(carregarPedido(id));
});

router.put('/pedidos/:id', exigir('pedidos'), (req, res) => {
  const atual = pedidoVisivel(req, inteiro(req.params.id));
  if (!podeEditarPedido(req.user, atual)) throw erro(403, `Este pedido não pode mais ser editado (situação: ${atual.status}).`);
  const d = validar(req, req.body);
  if (!pode(req.user.perfil, 'pedidos_todos')) d.vendedor_id = atual.vendedor_id;
  tx(() => {
    run(`UPDATE pedidos SET ${COLUNAS.map((c) => `${c} = ?`).join(', ')}, atualizado_em = datetime('now') WHERE id = ?`,
      ...COLUNAS.map((c) => d[c]), atual.id);
    gravarItens(atual.id, d.itens);
  });
  res.json(carregarPedido(atual.id));
});

router.post('/pedidos/:id/aprovar', exigir('pedidos_aprovar'), (req, res) => {
  const p = pedidoVisivel(req, inteiro(req.params.id));
  if (p.status !== 'Recebido') throw erro(400, `Só é possível aprovar pedidos com situação "Recebido" (atual: ${p.status}).`);
  run(`UPDATE pedidos SET status = 'Aprovado', aprovado_por = ?, aprovado_em = datetime('now'), atualizado_em = datetime('now')
    WHERE id = ?`, req.user.id, p.id);
  res.json(carregarPedido(p.id));
});

router.post('/pedidos/:id/cancelar', exigir('pedidos_aprovar'), (req, res) => {
  const p = pedidoVisivel(req, inteiro(req.params.id));
  if (!['Recebido', 'Aprovado'].includes(p.status)) {
    throw erro(400, p.status === 'Faturado'
      ? 'Pedido faturado: cancele primeiro a nota fiscal no módulo Notas Fiscais.'
      : 'Este pedido já está cancelado.');
  }
  const motivo = texto(req.body.motivo, 300);
  if (motivo.length < 3) throw erro(400, 'Informe o motivo do cancelamento.');
  run(`UPDATE pedidos SET status = 'Cancelado', motivo_cancelamento = ?, atualizado_em = datetime('now') WHERE id = ?`, motivo, p.id);
  res.json(carregarPedido(p.id));
});

router.post('/pedidos/:id/reabrir', exigir('pedidos_aprovar'), (req, res) => {
  const p = pedidoVisivel(req, inteiro(req.params.id));
  if (p.status !== 'Aprovado') throw erro(400, 'Só pedidos aprovados (sem nota) podem voltar para "Recebido".');
  run(`UPDATE pedidos SET status = 'Recebido', aprovado_por = NULL, aprovado_em = NULL, atualizado_em = datetime('now') WHERE id = ?`, p.id);
  res.json(carregarPedido(p.id));
});
