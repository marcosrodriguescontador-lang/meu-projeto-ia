import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mod10, mod11Boleto, validarLinhaDigitavel, vencimentoDoFator } from '../lib/boleto.js';
import { cfopPara, ratear, indicadorIE } from '../lib/ficha.js';

function montarLinha(banco, venc, valor, livre = '1234567890123456789012345') {
  const fator = 1000 + Math.round((Date.parse(`${venc}T00:00:00Z`) - Date.UTC(2025, 1, 22)) / 86400000);
  const v = String(valor).padStart(10, '0');
  const dv = mod11Boleto(`${banco}9${fator}${v}${livre}`);
  const c1 = `${banco}9${livre.slice(0, 5)}`;
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  return `${c1}${mod10(c1)}${c2}${mod10(c2)}${c3}${mod10(c3)}${dv}${fator}${v}`;
}

test('linha digitável: dígitos, banco, valor e vencimento', () => {
  const l = montarLinha('237', '2026-11-19', 176633);
  assert.equal(l.length, 47);
  assert.ok(validarLinhaDigitavel(l, { banco: 'Bradesco', valorCentavos: 176633, vencimento: '2026-11-19' }).ok);
  assert.ok(!validarLinhaDigitavel(l, { banco: 'Banco do Brasil' }).ok);
  assert.ok(!validarLinhaDigitavel(l, { valorCentavos: 100 }).ok);
  assert.ok(!validarLinhaDigitavel(l, { vencimento: '2026-11-20' }).ok);
  const errada = l.slice(0, 9) + ((Number(l[9]) + 1) % 10) + l.slice(10);
  assert.ok(!validarLinhaDigitavel(errada).ok);
  assert.equal(vencimentoDoFator(1000), '2025-02-22');
});

test('ficha: CFOP conforme UF, rateio e indicador de IE', () => {
  assert.equal(cfopPara('5102', 'SP', 'SP'), '5.102');
  assert.equal(cfopPara('5102', 'SP', 'PR'), '6.102');
  assert.deepEqual(ratear(1000, [1, 1, 1]), [333, 333, 334]);
  assert.deepEqual(ratear(0, [5, 5]), [0, 0]);
  assert.equal(indicadorIE('').codigo, '9');
  assert.equal(indicadorIE('ISENTO').codigo, '2');
  assert.equal(indicadorIE('123456789110').codigo, '1');
});
