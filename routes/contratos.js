import { Router } from 'express';
import { get, run, listar, termo } from '../db.js';
import { erro, texto, inteiro, centavos, dataIso, hojeIso } from '../lib/http.js';
import { exigir } from '../lib/sessao.js';
import { validarCpfCnpj, validarCPF, somenteDigitos } from '../lib/validacao.js';
import { interpretarCondicao } from '../lib/parcelas.js';
import { FORMAS_PAGAMENTO } from '../lib/pedidos.js';

export const router = Router();
const acesso = exigir('contratos');
const STATUS = ['rascunho', 'vigente', 'encerrado', 'cancelado'];

function percentual(v, nome) {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw erro(400, `${nome} inválido(a).`);
  return Math.round(n * 100) / 100;
}

function validar(b) {
  const d = {
    tipo: b.tipo === 'compra' ? 'compra' : 'venda',
    data: dataIso(b.data) || hojeIso(),
    cliente_id: inteiro(b.cliente_id) || null,
    pedido_id: inteiro(b.pedido_id) || null,
    parte_nome: texto(b.parte_nome, 150),
    parte_documento: somenteDigitos(b.parte_documento),
    parte_ie: texto(b.parte_ie, 20).toUpperCase(),
    parte_endereco: texto(b.parte_endereco, 300),
    objeto: texto(b.objeto, 500),
    forma_pagamento: texto(b.forma_pagamento, 20),
    condicao_tipo: texto(b.condicao_tipo, 10),
    condicao_valor: texto(b.condicao_valor, 500),
    local_entrega: texto(b.local_entrega, 300),
    prazo_entrega: texto(b.prazo_entrega, 120),
    vigencia_inicio: dataIso(b.vigencia_inicio),
    vigencia_fim: dataIso(b.vigencia_fim),
    multa: percentual(b.multa, 'Multa'),
    juros: percentual(b.juros, 'Juros'),
    foro: texto(b.foro, 150),
    receituario: texto(b.receituario, 60),
    defensivos: b.defensivos === false ? 0 : 1,
    testemunha1_nome: texto(b.testemunha1_nome, 120),
    testemunha1_cpf: somenteDigitos(b.testemunha1_cpf),
    testemunha2_nome: texto(b.testemunha2_nome, 120),
    testemunha2_cpf: somenteDigitos(b.testemunha2_cpf),
    observacoes: texto(b.observacoes, 2000),
    status: STATUS.includes(b.status) ? b.status : 'rascunho',
  };
  if (d.parte_nome.length < 3) throw erro(400, `Informe o ${d.tipo === 'venda' ? 'comprador' : 'fornecedor'}.`);
  if (!validarCpfCnpj(d.parte_documento)) throw erro(400, 'CPF/CNPJ da outra parte inválido.');
  if (d.cliente_id && !get('SELECT id FROM clientes WHERE id = ?', d.cliente_id)) throw erro(400, 'Cliente inválido.');
  if (d.pedido_id && !get('SELECT id FROM pedidos WHERE id = ?', d.pedido_id)) throw erro(400, 'Pedido inválido.');
  if (!FORMAS_PAGAMENTO.includes(d.forma_pagamento)) throw erro(400, 'Forma de pagamento inválida.');
  if (d.condicao_tipo === 'avista') d.condicao_valor = '';
  const cond = interpretarCondicao(d.condicao_tipo, d.condicao_valor, d.vigencia_inicio || d.data);
  if (cond.erro) throw erro(400, cond.erro);
  if (d.vigencia_inicio && d.vigencia_fim && d.vigencia_fim < d.vigencia_inicio) throw erro(400, 'O fim da vigência é anterior ao início.');
  for (const n of [1, 2]) {
    if (d[`testemunha${n}_cpf`] && !validarCPF(d[`testemunha${n}_cpf`])) throw erro(400, `CPF da testemunha ${n} inválido.`);
  }
  if (!Array.isArray(b.itens) || !b.itens.length) throw erro(400, 'Inclua pelo menos um item no contrato.');
  const itens = b.itens.slice(0, 100).map((it, i) => {
    const descricao = texto(it.descricao, 200);
    const quantidade = Number(String(it.quantidade ?? '').replace(',', '.'));
    const preco_unit = centavos(it.preco_unit);
    if (!descricao) throw erro(400, `Item ${i + 1}: informe a descrição.`);
    if (!Number.isFinite(quantidade) || quantidade <= 0) throw erro(400, `Item ${i + 1}: quantidade inválida.`);
    if (preco_unit < 0) throw erro(400, `Item ${i + 1}: preço inválido.`);
    return { descricao, unidade: texto(it.unidade, 6).toUpperCase(), quantidade: Math.round(quantidade * 1000) / 1000,
      preco_unit, total: Math.round(quantidade * preco_unit) };
  });
  d.itens = JSON.stringify(itens);
  d.valor = itens.reduce((s, i) => s + i.total, 0);
  return d;
}

function carregar(id) {
  const c = get('SELECT c.*, u.nome AS criado_por_nome FROM contratos c LEFT JOIN users u ON u.id = c.criado_por WHERE c.id = ?', id);
  if (!c) throw erro(404, 'Contrato não encontrado.');
  c.itens = JSON.parse(c.itens);
  c.defensivos = Boolean(c.defensivos);
  return c;
}

router.get('/contratos', acesso, (req, res) => {
  const where = [];
  const params = [];
  if (['venda', 'compra'].includes(req.query.tipo)) { where.push('tipo = ?'); params.push(req.query.tipo); }
  if (STATUS.includes(req.query.status)) { where.push('status = ?'); params.push(req.query.status); }
  if (req.query.busca) {
    const n = inteiro(String(req.query.busca).replace(/\D/g, ''));
    where.push(`(parte_nome LIKE ? ESCAPE '\\' OR objeto LIKE ? ESCAPE '\\'${n ? ' OR id = ?' : ''})`);
    params.push(termo(req.query.busca), termo(req.query.busca));
    if (n) params.push(n);
  }
  res.json(listar({ select: 'id, tipo, data, parte_nome, parte_documento, valor, status, vigencia_inicio, vigencia_fim', from: 'contratos',
    where, params, ordem: 'data DESC, id DESC', pagina: req.query.pagina }));
});

router.get('/contratos/:id', acesso, (req, res) => res.json(carregar(inteiro(req.params.id))));

const COLS = ['tipo', 'data', 'cliente_id', 'pedido_id', 'parte_nome', 'parte_documento', 'parte_ie', 'parte_endereco', 'objeto', 'itens', 'valor',
  'forma_pagamento', 'condicao_tipo', 'condicao_valor', 'local_entrega', 'prazo_entrega', 'vigencia_inicio', 'vigencia_fim', 'multa', 'juros',
  'foro', 'receituario', 'defensivos', 'testemunha1_nome', 'testemunha1_cpf', 'testemunha2_nome', 'testemunha2_cpf', 'observacoes', 'status'];

router.post('/contratos', acesso, (req, res) => {
  const d = validar(req.body);
  const r = run(`INSERT INTO contratos (${COLS.join(', ')}, criado_por) VALUES (${COLS.map(() => '?').join(', ')}, ?)`,
    ...COLS.map((c) => d[c]), req.user.id);
  res.status(201).json(carregar(Number(r.lastInsertRowid)));
});

router.put('/contratos/:id', acesso, (req, res) => {
  const atual = carregar(inteiro(req.params.id));
  if (['encerrado', 'cancelado'].includes(atual.status)) throw erro(400, `Contrato ${atual.status} não pode ser alterado.`);
  const d = validar(req.body);
  run(`UPDATE contratos SET ${COLS.map((c) => `${c} = ?`).join(', ')}, atualizado_em = datetime('now') WHERE id = ?`,
    ...COLS.map((c) => d[c]), atual.id);
  res.json(carregar(atual.id));
});

router.post('/contratos/:id/status', acesso, (req, res) => {
  const c = carregar(inteiro(req.params.id));
  if (!STATUS.includes(req.body.status)) throw erro(400, 'Situação inválida.');
  run("UPDATE contratos SET status = ?, atualizado_em = datetime('now') WHERE id = ?", req.body.status, c.id);
  res.json(carregar(c.id));
});
