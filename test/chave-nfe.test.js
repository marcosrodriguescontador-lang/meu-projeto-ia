import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarChaveNFe, conferirChave, dvChave, decomporChave } from '../lib/chave-nfe.js';

// Chave de exemplo do Manual de Orientação do Contribuinte da NF-e.
const EXEMPLO = '52060433009911002506550120000007800267301615';
const base = `352610${'11222333000181'}55001000000123112345678`;
const VALIDA = base + dvChave(base);

test('dígito verificador (módulo 11)', () => {
  assert.equal(dvChave(EXEMPLO.slice(0, 43)), 5);
  assert.ok(validarChaveNFe(EXEMPLO).ok);
  assert.ok(validarChaveNFe(VALIDA).ok);
});

test('chave com dígito errado, tamanho errado ou modelo errado', () => {
  const errada = VALIDA.slice(0, 43) + ((Number(VALIDA[43]) + 1) % 10);
  assert.ok(!validarChaveNFe(errada).ok);
  assert.ok(!validarChaveNFe(VALIDA.slice(0, 40)).ok);
  const b65 = `352610${'11222333000181'}65001000000123112345678`;
  assert.ok(!validarChaveNFe(b65 + dvChave(b65)).ok, 'modelo 65 (NFC-e) é recusado');
});

test('decompõe número e série', () => {
  const d = decomporChave(VALIDA);
  assert.equal(d.numero, '123');
  assert.equal(d.serie, '1');
  assert.equal(d.cnpj, '11222333000181');
  assert.equal(d.ano, 2026);
  assert.equal(d.mes, 10);
});

test('confere CNPJ, UF, número, série e mês com a empresa', () => {
  const ok = { cnpjEmpresa: '11.222.333/0001-81', ufEmpresa: 'SP', numero: '123', serie: '1', dataEmissao: '2026-10-20' };
  assert.deepEqual(conferirChave(VALIDA, ok), []);
  assert.equal(conferirChave(VALIDA, { ...ok, cnpjEmpresa: '04252011000110' }).length, 1);
  assert.equal(conferirChave(VALIDA, { ...ok, numero: '124' }).length, 1);
  assert.equal(conferirChave(VALIDA, { ...ok, serie: '2' }).length, 1);
  assert.equal(conferirChave(VALIDA, { ...ok, dataEmissao: '2026-11-01' }).length, 1);
  assert.equal(conferirChave(VALIDA, { ...ok, ufEmpresa: 'PR' }).length, 1);
});
