import { Router } from 'express';
import { get, run, tx, db, listar, termo } from '../db.js';
import { erro, texto, inteiro, dataIso, hojeIso } from '../lib/http.js';
import { exigir } from '../lib/sessao.js';
import { gerarParcelas } from '../lib/parcelas.js';
import { validarLinhaDigitavel } from '../lib/boleto.js';
import { BANCOS, dadosEmpresa } from './config.js';

export const router = Router();
const acesso = exigir('duplicatas');

const SELECT = `d.*, c.nome AS cliente_nome, c.documento AS cliente_documento, n.numero AS nf_numero, n.serie AS nf_serie`;
const FROM = 'duplicatas d JOIN clientes c ON c.id = d.cliente_id JOIN notas n ON n.id = d.nota_id';

function somarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function carregar(id) {
  const d = get(`SELECT ${SELECT}, n.chave AS nf_chave, n.data_emissao AS nf_emissao FROM ${FROM} WHERE d.id = ?`, id);
  if (!d) throw erro(404, 'Duplicata não encontrada.');
  d.cliente = get('SELECT * FROM clientes WHERE id = ?', d.cliente_id);
  return d;
}

router.get('/duplicatas', acesso, (req, res) => {
  const q = req.query;
  const where = [];
  const params = [];
  const hoje = hojeIso();
  if (['aberta', 'paga', 'protestada', 'cancelada'].includes(q.status)) { where.push('d.status = ?'); params.push(q.status); }
  if (q.situacao === 'vencidas') { where.push("d.status = 'aberta' AND d.vencimento < ?"); params.push(hoje); }
  if (q.situacao === 'avencer') { where.push("d.status = 'aberta' AND d.vencimento BETWEEN ? AND ?"); params.push(hoje, somarDias(hoje, 7)); }
  if (dataIso(q.venc_de)) { where.push('d.vencimento >= ?'); params.push(dataIso(q.venc_de)); }
  if (dataIso(q.venc_ate)) { where.push('d.vencimento <= ?'); params.push(dataIso(q.venc_ate)); }
  if (inteiro(q.nota)) { where.push('d.nota_id = ?'); params.push(inteiro(q.nota)); }
  if (q.busca) {
    const n = inteiro(String(q.busca).replace(/\D/g, ''));
    where.push(`(c.nome LIKE ? ESCAPE '\\'${n ? ' OR d.numero_ordem = ? OR n.numero = ?' : ''})`);
    params.push(termo(q.busca));
    if (n) params.push(n, n);
  }
  const r = listar({ select: SELECT, from: FROM, where, params, ordem: "COALESCE(d.vencimento, d.data_emissao), d.numero_ordem",
    pagina: q.pagina, porPagina: q.porPagina });
  r.vencidas = get("SELECT COUNT(*) AS n, COALESCE(SUM(valor), 0) AS valor FROM duplicatas WHERE status = 'aberta' AND vencimento < ?", hoje);
  r.hoje = hoje;
  res.json(r);
});

router.get('/duplicatas/imprimir', acesso, (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Number.isInteger).slice(0, 200);
  if (!ids.length) throw erro(400, 'Escolha as duplicatas para imprimir.');
  res.json({ empresa: dadosEmpresa(), duplicatas: ids.map(carregar) });
});

router.get('/duplicatas/:id', acesso, (req, res) => res.json(carregar(inteiro(req.params.id))));

// Gera uma duplicata por parcela da condição de pagamento do pedido.
router.post('/duplicatas/gerar', acesso, (req, res) => {
  const nota = get("SELECT * FROM notas WHERE id = ? AND status = 'emitida'", inteiro(req.body.nota_id));
  if (!nota) throw erro(404, 'Nota fiscal não encontrada ou cancelada.');
  if (get("SELECT id FROM duplicatas WHERE nota_id = ? AND status <> 'cancelada'", nota.id)) {
    throw erro(409, 'As duplicatas desta nota já foram geradas.');
  }
  const pedido = get('SELECT * FROM pedidos WHERE id = ?', nota.pedido_id);
  let parcelas;
  try {
    parcelas = gerarParcelas({ total: nota.valor, tipo: pedido.condicao_tipo, valor: pedido.condicao_valor, dataBase: nota.data_emissao });
  } catch (e) {
    throw erro(400, e.message);
  }
  const cfg = dadosEmpresa();
  const banco = BANCOS.includes(req.body.banco) ? req.body.banco : (cfg.banco_padrao || '');
  const ids = tx(() => {
    let ordem = get('SELECT COALESCE(MAX(numero_ordem), 0) AS n FROM duplicatas').n;
    const st = db.prepare(`INSERT INTO duplicatas (numero_ordem, nota_id, pedido_id, cliente_id, numero_fatura, parcela, parcelas,
      data_emissao, vencimento, valor, banco, praca_pagamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    return parcelas.map((p) => Number(st.run(++ordem, nota.id, pedido.id, pedido.cliente_id, String(nota.numero), p.numero, p.de,
      nota.data_emissao, p.vencimento, p.valor, banco, cfg.praca_pagamento || '').lastInsertRowid));
  });
  res.status(201).json({ ids, quantidade: ids.length });
});

router.put('/duplicatas/:id', acesso, (req, res) => {
  const d = carregar(inteiro(req.params.id));
  if (d.status === 'cancelada') throw erro(400, 'Duplicata cancelada não pode ser alterada.');
  const b = req.body;
  const banco = texto(b.banco, 40);
  if (banco && !BANCOS.includes(banco)) throw erro(400, 'Banco inválido.');
  const linha = String(b.linha_digitavel ?? '').replace(/\D/g, '');
  if (linha) {
    const v = validarLinhaDigitavel(linha, { banco, valorCentavos: d.valor, vencimento: d.vencimento });
    if (!v.ok) throw erro(400, v.erros.join(' '));
  }
  const aceite = b.data_aceite ? dataIso(b.data_aceite) : null;
  if (b.data_aceite && !aceite) throw erro(400, 'Data do aceite inválida.');
  run(`UPDATE duplicatas SET banco = ?, nosso_numero = ?, linha_digitavel = ?, praca_pagamento = ?, data_aceite = ?, observacoes = ?
    WHERE id = ?`, banco, texto(b.nosso_numero, 30), linha, texto(b.praca_pagamento, 120), aceite, texto(b.observacoes, 500), d.id);
  res.json(carregar(d.id));
});

router.post('/duplicatas/:id/pagar', acesso, (req, res) => {
  const d = carregar(inteiro(req.params.id));
  if (!['aberta', 'protestada'].includes(d.status)) throw erro(400, `Duplicata ${d.status} não pode ser marcada como paga.`);
  const data = dataIso(req.body.data_pagamento) || hojeIso();
  if (data > hojeIso()) throw erro(400, 'A data de pagamento não pode ser futura.');
  run("UPDATE duplicatas SET status = 'paga', data_pagamento = ? WHERE id = ?", data, d.id);
  res.json(carregar(d.id));
});

router.post('/duplicatas/:id/protestar', acesso, (req, res) => {
  const d = carregar(inteiro(req.params.id));
  if (d.status !== 'aberta') throw erro(400, 'Só duplicatas em aberto podem ser marcadas como protestadas.');
  const data = dataIso(req.body.data_protesto) || hojeIso();
  run("UPDATE duplicatas SET status = 'protestada', data_protesto = ? WHERE id = ?", data, d.id);
  res.json(carregar(d.id));
});

router.post('/duplicatas/:id/reabrir', acesso, (req, res) => {
  const d = carregar(inteiro(req.params.id));
  if (!['paga', 'protestada'].includes(d.status)) throw erro(400, 'Só duplicatas pagas ou protestadas podem voltar para "aberta".');
  run("UPDATE duplicatas SET status = 'aberta', data_pagamento = NULL, data_protesto = NULL WHERE id = ?", d.id);
  res.json(carregar(d.id));
});
