import { Router } from 'express';
import { get, all, run, tx, listar, termo } from '../db.js';
import { erro, texto, inteiro, centavos, dataIso, hojeIso } from '../lib/http.js';
import { exigir } from '../lib/sessao.js';
import { conferirChave, decomporChave } from '../lib/chave-nfe.js';
import { montarFicha } from '../lib/ficha.js';
import { carregarPedido } from './pedidos.js';
import { dadosEmpresa } from './config.js';

export const router = Router();
const acesso = exigir('notas');

const SELECT_NOTA = `n.*, p.cliente_id, c.nome AS cliente_nome, c.documento AS cliente_documento, p.total AS pedido_total`;
const FROM_NOTA = 'notas n JOIN pedidos p ON p.id = n.pedido_id JOIN clientes c ON c.id = p.cliente_id';

export function fichaDoPedido(pedidoId, dataBase = hojeIso()) {
  const pedido = carregarPedido(pedidoId);
  if (!pedido) throw erro(404, 'Pedido não encontrado.');
  const produtos = {};
  for (const pr of all(`SELECT * FROM produtos WHERE id IN (${pedido.itens.map(() => '?').join(',') || 'NULL'})`, ...pedido.itens.map((i) => i.produto_id))) {
    produtos[pr.id] = pr;
  }
  return { pedido, ficha: montarFicha(pedido, dadosEmpresa(), produtos, dataBase) };
}

router.get('/notas/a-emitir', acesso, (req, res) => {
  res.json(all(`SELECT p.id, p.data, p.total, p.aprovado_em, c.nome AS cliente_nome, c.municipio, c.uf, u.nome AS vendedor_nome
    FROM pedidos p JOIN clientes c ON c.id = p.cliente_id JOIN users u ON u.id = p.vendedor_id
    WHERE p.status = 'Aprovado' ORDER BY p.data, p.id`));
});

router.get('/notas/ficha/:pedidoId', acesso, (req, res) => {
  const { pedido, ficha } = fichaDoPedido(inteiro(req.params.pedidoId));
  res.json({ ...ficha, pedido: { id: pedido.id, status: pedido.status, total: pedido.total, data: pedido.data } });
});

router.get('/notas', acesso, (req, res) => {
  const where = [];
  const params = [];
  if (['emitida', 'cancelada'].includes(req.query.status)) { where.push('n.status = ?'); params.push(req.query.status); }
  if (req.query.busca) {
    const n = inteiro(String(req.query.busca).replace(/\D/g, ''));
    where.push(`(c.nome LIKE ? ESCAPE '\\'${n ? ' OR n.numero = ? OR n.pedido_id = ?' : ''})`);
    params.push(termo(req.query.busca));
    if (n) params.push(n, n);
  }
  if (req.query.semCanhoto === '1') where.push("n.data_entrega IS NULL AND n.status = 'emitida'");
  res.json(listar({ select: SELECT_NOTA, from: FROM_NOTA, where, params, ordem: 'n.data_emissao DESC, n.numero DESC', pagina: req.query.pagina }));
});

router.get('/notas/:id', acesso, (req, res) => {
  const n = get(`SELECT ${SELECT_NOTA} FROM ${FROM_NOTA} WHERE n.id = ?`, inteiro(req.params.id));
  if (!n) throw erro(404, 'Nota não encontrada.');
  res.json(n);
});

router.post('/notas', acesso, (req, res) => {
  const b = req.body;
  const pedido = get('SELECT id, status, total FROM pedidos WHERE id = ?', inteiro(b.pedido_id));
  if (!pedido) throw erro(404, 'Pedido não encontrado.');
  if (pedido.status !== 'Aprovado') throw erro(400, `Só é possível registrar nota de pedido aprovado (situação atual: ${pedido.status}).`);
  const chave = String(b.chave ?? '').replace(/\D/g, '');
  const dados = decomporChave(chave);
  const numero = String(b.numero ?? '').trim() || dados.numero;
  const serie = String(b.serie ?? '').trim() || dados.serie;
  const dataEmissao = dataIso(b.data_emissao);
  if (!dataEmissao) throw erro(400, 'Informe a data de emissão.');
  if (dataEmissao > hojeIso()) throw erro(400, 'A data de emissão não pode ser futura.');
  const empresa = dadosEmpresa();
  if (!empresa.cnpj) throw erro(400, 'Cadastre o CNPJ da empresa em Configurações antes de registrar notas.');
  const erros = conferirChave(chave, { cnpjEmpresa: empresa.cnpj, ufEmpresa: empresa.uf, numero, serie, dataEmissao });
  if (erros.length) throw erro(400, erros.join(' '));
  const valor = b.valor === '' || b.valor == null ? pedido.total : centavos(b.valor);
  if (valor <= 0) throw erro(400, 'Valor da nota inválido.');
  const dataEntrega = b.data_entrega ? dataIso(b.data_entrega) : null;
  if (b.data_entrega && !dataEntrega) throw erro(400, 'Data do comprovante de entrega inválida.');
  if (dataEntrega && dataEntrega < dataEmissao) throw erro(400, 'A data de entrega não pode ser anterior à emissão.');
  if (get('SELECT id FROM notas WHERE chave = ?', chave)) throw erro(409, 'Esta chave de acesso já foi registrada.');
  if (get("SELECT id FROM notas WHERE numero = ? AND serie = ? AND status = 'emitida'", Number(numero), Number(serie))) {
    throw erro(409, `Já existe nota ativa com número ${numero}, série ${serie}.`);
  }
  const id = tx(() => {
    const r = run(`INSERT INTO notas (pedido_id, chave, numero, serie, data_emissao, valor, data_entrega, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, pedido.id, chave, Number(numero), Number(serie), dataEmissao, valor, dataEntrega, req.user.id);
    run("UPDATE pedidos SET status = 'Faturado', atualizado_em = datetime('now') WHERE id = ?", pedido.id);
    return Number(r.lastInsertRowid);
  });
  res.status(201).json({ ...get(`SELECT ${SELECT_NOTA} FROM ${FROM_NOTA} WHERE n.id = ?`, id),
    aviso: valor !== pedido.total ? 'Atenção: o valor da nota é diferente do total do pedido.' : null });
});

router.put('/notas/:id/canhoto', acesso, (req, res) => {
  const n = get('SELECT id, data_emissao, status FROM notas WHERE id = ?', inteiro(req.params.id));
  if (!n) throw erro(404, 'Nota não encontrada.');
  const d = req.body.data_entrega ? dataIso(req.body.data_entrega) : null;
  if (req.body.data_entrega && !d) throw erro(400, 'Data inválida.');
  if (d && d < n.data_emissao) throw erro(400, 'A data de entrega não pode ser anterior à emissão.');
  run('UPDATE notas SET data_entrega = ? WHERE id = ?', d, n.id);
  res.json({ ok: true });
});

router.post('/notas/:id/cancelar', acesso, (req, res) => {
  const n = get('SELECT id, pedido_id, status FROM notas WHERE id = ?', inteiro(req.params.id));
  if (!n) throw erro(404, 'Nota não encontrada.');
  if (n.status !== 'emitida') throw erro(400, 'Esta nota já está cancelada.');
  const motivo = texto(req.body.motivo, 300);
  if (motivo.length < 3) throw erro(400, 'Informe o motivo do cancelamento.');
  const r = tx(() => {
    run(`UPDATE notas SET status = 'cancelada', motivo_cancelamento = ?, cancelada_em = datetime('now') WHERE id = ?`, motivo, n.id);
    run(`UPDATE pedidos SET status = 'Aprovado', atualizado_em = datetime('now') WHERE id = ?`, n.pedido_id);
    return cancelarDuplicatasDaNota(n.id);
  });
  res.json({ ok: true, duplicatasCanceladas: r });
});

// Cancela as duplicatas em aberto da nota (a tabela de duplicatas é criada no módulo Duplicatas).
function cancelarDuplicatasDaNota(notaId) {
  if (!get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'duplicatas'")) return 0;
  return Number(run("UPDATE duplicatas SET status = 'cancelada' WHERE nota_id = ? AND status = 'aberta'", notaId).changes);
}
