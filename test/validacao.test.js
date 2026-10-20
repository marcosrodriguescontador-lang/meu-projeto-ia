import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarCPF, validarCNPJ, validarCpfCnpj, formatarCpfCnpj } from '../lib/validacao.js';

test('CPF válido, com ou sem pontuação', () => {
  assert.ok(validarCPF('529.982.247-25'));
  assert.ok(validarCPF('52998224725'));
  assert.ok(validarCPF('111.444.777-35'));
});

test('CPF inválido', () => {
  assert.ok(!validarCPF('529.982.247-24'), 'dígito errado');
  assert.ok(!validarCPF('111.111.111-11'), 'todos iguais');
  assert.ok(!validarCPF('1234567890'), 'curto');
  assert.ok(!validarCPF(''));
  assert.ok(!validarCPF(null));
});

test('CNPJ válido e inválido', () => {
  assert.ok(validarCNPJ('11.222.333/0001-81'));
  assert.ok(validarCNPJ('04252011000110'));
  assert.ok(!validarCNPJ('11.222.333/0001-82'));
  assert.ok(!validarCNPJ('00000000000000'));
  assert.ok(!validarCNPJ('1122233300018'));
});

test('CPF/CNPJ conforme o tamanho e formatação', () => {
  assert.ok(validarCpfCnpj('52998224725'));
  assert.ok(validarCpfCnpj('11222333000181'));
  assert.ok(!validarCpfCnpj('123'));
  assert.equal(formatarCpfCnpj('52998224725'), '529.982.247-25');
  assert.equal(formatarCpfCnpj('11222333000181'), '11.222.333/0001-81');
});
