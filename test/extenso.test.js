import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valorPorExtenso } from '../lib/extenso.js';

test('valor por extenso – casos pedidos no roteiro', () => {
  assert.equal(valorPorExtenso(100), 'um real');
  assert.equal(valorPorExtenso(10101), 'cento e um reais e um centavo');
  assert.equal(valorPorExtenso(100000), 'mil reais');
  assert.equal(valorPorExtenso(110050), 'mil e cem reais e cinquenta centavos');
  assert.equal(valorPorExtenso(200000000), 'dois milhões de reais');
});

test('valor por extenso – outros casos', () => {
  assert.equal(valorPorExtenso(0), 'zero real');
  assert.equal(valorPorExtenso(1), 'um centavo');
  assert.equal(valorPorExtenso(50), 'cinquenta centavos');
  assert.equal(valorPorExtenso(10000), 'cem reais');
  assert.equal(valorPorExtenso(1100), 'onze reais');
  assert.equal(valorPorExtenso(2100), 'vinte e um reais');
  assert.equal(valorPorExtenso(123456), 'mil, duzentos e trinta e quatro reais e cinquenta e seis centavos');
  assert.equal(valorPorExtenso(105000), 'mil e cinquenta reais');
  assert.equal(valorPorExtenso(200100), 'dois mil e um reais');
  assert.equal(valorPorExtenso(100000000), 'um milhão de reais');
  assert.equal(valorPorExtenso(100000050), 'um milhão de reais e cinquenta centavos');
  assert.equal(valorPorExtenso(150000000), 'um milhão e quinhentos mil reais');
  assert.equal(valorPorExtenso(123456789), 'um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete reais e oitenta e nove centavos');
  assert.equal(valorPorExtenso(99999999), 'novecentos e noventa e nove mil, novecentos e noventa e nove reais e noventa e nove centavos');
  assert.equal(valorPorExtenso(1478900), 'quatorze mil, setecentos e oitenta e nove reais');
});
