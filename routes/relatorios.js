import { Router } from 'express';
import { all, get } from '../db.js';
import { erro, inteiro, dataIso, hojeIso } from '../lib/http.js';
import { exigir } from '../lib/sessao.js';
import { pode } from '../lib/permissoes.js';
import { STATUS } from '../lib/pedidos.js';
import { AGRUPAMENTOS, agruparPorPeriodo, totalizar, ranking } from '../lib/relatorios.js';

export const router = Router();

router.get('/relatorios/vendas', exigir('relatorios'), (req, res) => {
  const q = req.query;
  const agrupar = q.agrupar || 'mes';
  if (!(agrupar in AGRUPAMENTOS)) throw erro(400, 'Agrupamento inválido.');
  const de = dataIso(q.de);
  const ate = dataIso(q.ate);
  if (!de || !ate) throw erro(400, 'Informe o período (de/até).');
  if (de > ate) throw erro(400, 'A data inicial é maior que a final.');
  const where = ['p.data BETWEEN ? AND ?'];
  const params = [de, ate];
  // Vendedor enxerga apenas os próprios dados.
  const vendedor = pode(req.user.perfil, 'relatorios_todos') ? inteiro(q.vendedor) : req.user.id;
  if (vendedor) { where.push('p.vendedor_id = ?'); params.push(vendedor); }
  // Status: padrão = todos menos cancelados.
  if (STATUS.includes(q.status)) { where.push('p.status = ?'); params.push(q.status); }
  else if (q.status !== 'todos') where.push("p.status <> 'Cancelado'");
  const produto = inteiro(q.produto);

  // Sem produto: cada pedido vale pelo total (com desconto e frete).
  // Com produto: soma apenas os itens daquele produto e informa a quantidade.
  const vendas = produto
    ? all(`SELECT p.id AS pedido_id, p.data, p.vendedor_id, u.nome AS vendedor_nome, i.total AS valor, i.quantidade
        FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id JOIN users u ON u.id = p.vendedor_id
        WHERE ${where.join(' AND ')} AND i.produto_id = ?`, ...params, produto)
    : all(`SELECT p.id AS pedido_id, p.data, p.vendedor_id, u.nome AS vendedor_nome, p.total AS valor
        FROM pedidos p JOIN users u ON u.id = p.vendedor_id WHERE ${where.join(' AND ')}`, ...params);

  const itens = all(`SELECT p.id AS pedido_id, i.produto_id, pr.codigo || ' – ' || pr.descricao AS produto_nome, i.unidade,
      i.total AS valor, i.quantidade
    FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id JOIN produtos pr ON pr.id = i.produto_id
    WHERE ${where.join(' AND ')}${produto ? ' AND i.produto_id = ?' : ''}`, ...params, ...(produto ? [produto] : []));

  res.json({
    filtros: { de, ate, agrupar, vendedor, produto, status: q.status || '',
      produtoNome: produto ? get('SELECT codigo || \' – \' || descricao AS n, unidade FROM produtos WHERE id = ?', produto) : null },
    periodos: agruparPorPeriodo(vendas, agrupar),
    totais: totalizar(vendas),
    porVendedor: ranking(vendas, 'vendedor_id', 'vendedor_nome'),
    porProduto: ranking(itens, 'produto_id', 'produto_nome', (v) => ({ unidade: v.unidade })),
  });
});

// Cartões da tela Início.
router.get('/inicio', (req, res) => {
  const hoje = hojeIso();
  const inicioMes = `${hoje.slice(0, 8)}01`;
  const gestao = pode(req.user.perfil, 'pedidos_todos');
  const filtro = gestao ? '' : ' AND vendedor_id = ?';
  const p = gestao ? [] : [req.user.id];
  const out = {
    vendasMes: get(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS valor FROM pedidos
      WHERE data >= ? AND data <= ? AND status <> 'Cancelado'${filtro}`, inicioMes, hoje, ...p),
    aguardandoAprovacao: get(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS valor FROM pedidos WHERE status = 'Recebido'${filtro}`, ...p),
    aprovadosSemNota: get(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS valor FROM pedidos WHERE status = 'Aprovado'${filtro}`, ...p),
    duplicatas: null,
  };
  if (pode(req.user.perfil, 'duplicatas')) {
    const em7 = new Date(Date.UTC(...hoje.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) + 7 * 86400000).toISOString().slice(0, 10);
    out.duplicatas = {
      vencidas: get(`SELECT COUNT(*) AS n, COALESCE(SUM(valor), 0) AS valor FROM duplicatas
        WHERE status = 'aberta' AND vencimento IS NOT NULL AND vencimento < ?`, hoje),
      aVencer: get(`SELECT COUNT(*) AS n, COALESCE(SUM(valor), 0) AS valor FROM duplicatas
        WHERE status = 'aberta' AND vencimento BETWEEN ? AND ?`, hoje, em7),
    };
  }
  res.json(out);
});
