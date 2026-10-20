import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarParcelas, dividirValor, interpretarCondicao } from '../lib/parcelas.js';

test('divisão com arredondamento na última parcela', () => {
  assert.deepEqual(dividirValor(10000, 3), [3333, 3333, 3334]);
  assert.deepEqual(dividirValor(529900, 3), [176633, 176633, 176634]);
  assert.deepEqual(dividirValor(100, 1), [100]);
  assert.deepEqual(dividirValor(1, 2), [0, 1]);
  for (const [t, n] of [[999999, 7], [12345, 4], [100001, 12]]) {
    assert.equal(dividirValor(t, n).reduce((a, b) => a + b, 0), t, 'soma igual ao total');
  }
});

test('prazo em dias (30/60/90) a partir da data base', () => {
  const p = gerarParcelas({ total: 100000, tipo: 'dias', valor: '30/60/90', dataBase: '2026-01-31' });
  assert.deepEqual(p.map((x) => x.vencimento), ['2026-03-02', '2026-04-01', '2026-05-01']);
  assert.deepEqual(p.map((x) => x.valor), [33333, 33333, 33334]);
  assert.deepEqual(p.map((x) => `${x.numero}/${x.de}`), ['1/3', '2/3', '3/3']);
});

test('datas fixas e à vista', () => {
  const p = gerarParcelas({ total: 50000, tipo: 'datas', valor: '30/04/2027; 30/05/2027', dataBase: '2026-10-20' });
  assert.deepEqual(p.map((x) => x.vencimento), ['2027-04-30', '2027-05-30']);
  const v = gerarParcelas({ total: 50000, tipo: 'avista', valor: '', dataBase: '2026-10-20' });
  assert.equal(v.length, 1);
  assert.equal(v[0].vencimento, null);
  assert.equal(v[0].valor, 50000);
});

test('condições inválidas', () => {
  assert.ok(interpretarCondicao('dias', '', '2026-01-01').erro);
  assert.ok(interpretarCondicao('dias', '60/30', '2026-01-01').erro, 'fora de ordem');
  assert.ok(interpretarCondicao('datas', '31/02/2027', '2026-01-01').erro, 'data inexistente');
  assert.ok(interpretarCondicao('xyz', '', '2026-01-01').erro);
  assert.throws(() => gerarParcelas({ total: 1, tipo: 'dias', valor: 'abc', dataBase: '2026-01-01' }));
});
