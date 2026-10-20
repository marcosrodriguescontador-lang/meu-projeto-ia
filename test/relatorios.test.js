import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodoDe, agruparPorPeriodo, totalizar, ranking } from '../lib/relatorios.js';

test('quinzena: dias 1–15 e 16–fim', () => {
  assert.equal(periodoDe('2026-02-15', 'quinzena').chave, '2026-02-Q1');
  assert.equal(periodoDe('2026-02-16', 'quinzena').chave, '2026-02-Q2');
  assert.equal(periodoDe('2026-02-28', 'quinzena').rotulo, '2ª quinzena de fevereiro/2026');
});

test('trimestre e semestre', () => {
  assert.equal(periodoDe('2026-03-31', 'trimestre').chave, '2026-T1');
  assert.equal(periodoDe('2026-04-01', 'trimestre').chave, '2026-T2');
  assert.equal(periodoDe('2026-12-31', 'trimestre').rotulo, '4º trimestre de 2026');
  assert.equal(periodoDe('2026-06-30', 'semestre').chave, '2026-S1');
  assert.equal(periodoDe('2026-07-01', 'semestre').chave, '2026-S2');
});

test('semana começa na segunda-feira; mês e ano', () => {
  assert.equal(periodoDe('2026-10-18', 'semana').chave, '2026-10-12'); // domingo
  assert.equal(periodoDe('2026-10-19', 'semana').chave, '2026-10-19'); // segunda
  assert.equal(periodoDe('2026-10-19', 'mes').rotulo, 'outubro/2026');
  assert.equal(periodoDe('2026-10-19', 'ano').chave, '2026');
});

const VENDAS = [
  { pedido_id: 1, data: '2026-01-10', valor: 10000, vendedor_id: 1, vendedor_nome: 'A', quantidade: 2 },
  { pedido_id: 2, data: '2026-01-20', valor: 30000, vendedor_id: 2, vendedor_nome: 'B', quantidade: 1 },
  { pedido_id: 3, data: '2026-03-05', valor: 20000, vendedor_id: 1, vendedor_nome: 'A', quantidade: 3 },
  { pedido_id: 4, data: '2026-05-15', valor: 40000, vendedor_id: 2, vendedor_nome: 'B', quantidade: 4 },
  { pedido_id: 5, data: '2026-08-01', valor: 50000, vendedor_id: 1, vendedor_nome: 'A', quantidade: 5 },
];

test('agrupamento por quinzena', () => {
  const r = agruparPorPeriodo(VENDAS, 'quinzena');
  assert.deepEqual(r.map((p) => [p.chave, p.vendas, p.valor]), [
    ['2026-01-Q1', 1, 10000], ['2026-01-Q2', 1, 30000], ['2026-03-Q1', 1, 20000], ['2026-05-Q1', 1, 40000], ['2026-08-Q1', 1, 50000]]);
});

test('agrupamento por trimestre com ticket médio', () => {
  const r = agruparPorPeriodo(VENDAS, 'trimestre');
  assert.deepEqual(r.map((p) => [p.chave, p.vendas, p.valor, p.ticket]), [
    ['2026-T1', 3, 60000, 20000], ['2026-T2', 1, 40000, 40000], ['2026-T3', 1, 50000, 50000]]);
});

test('agrupamento por semestre e totais', () => {
  const r = agruparPorPeriodo(VENDAS, 'semestre');
  assert.deepEqual(r.map((p) => [p.chave, p.vendas, p.valor, p.quantidade]), [['2026-S1', 4, 100000, 10], ['2026-S2', 1, 50000, 5]]);
  assert.deepEqual(totalizar(VENDAS), { vendas: 5, valor: 150000, quantidade: 15, ticket: 30000 });
});

test('vários itens do mesmo pedido contam como uma venda', () => {
  const itens = [{ pedido_id: 9, data: '2026-01-02', valor: 100 }, { pedido_id: 9, data: '2026-01-02', valor: 200 }];
  const [p] = agruparPorPeriodo(itens, 'mes');
  assert.equal(p.vendas, 1);
  assert.equal(p.valor, 300);
  assert.equal(p.ticket, 300);
});

test('ranking por vendedor ordenado por valor', () => {
  const r = ranking(VENDAS, 'vendedor_id', 'vendedor_nome');
  assert.deepEqual(r.map((v) => [v.nome, v.vendas, v.valor]), [['A', 3, 80000], ['B', 2, 70000]]);
});
