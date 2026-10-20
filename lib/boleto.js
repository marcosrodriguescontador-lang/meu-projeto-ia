// Validação da linha digitável de boleto bancário (47 números).
// Campos: AAABC.CCCCX DDDDD.DDDDDY EEEEE.EEEEEZ K UUUUVVVVVVVVVV

export const CODIGOS_BANCO = { Bradesco: '237', 'Banco do Brasil': '001' };

export function mod10(numero) {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    let p = Number(numero[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

export function mod11Boleto(numero) {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += Number(numero[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

// Data de vencimento a partir do fator (considera o reinício do fator em 22/02/2025).
// Data de vencimento a partir do fator. O fator conta dias desde 07/10/1997 e, ao chegar a 9999
// (21/02/2025), recomeçou em 1000 no dia 22/02/2025. Para fatores de 1000 em diante usamos o ciclo atual.
export function vencimentoDoFator(fator) {
  if (!fator || fator < 1000) return null;
  return new Date(Date.UTC(2025, 1, 22) + (fator - 1000) * 86400000).toISOString().slice(0, 10);
}

export function validarLinhaDigitavel(valor, { banco, valorCentavos, vencimento } = {}) {
  const l = String(valor ?? '').replace(/\D/g, '');
  const erros = [];
  if (l.length !== 47) return { ok: false, erros: ['A linha digitável deve ter 47 números.'] };
  if (mod10(l.slice(0, 9)) !== Number(l[9])) erros.push('Dígito do 1º campo da linha digitável inválido.');
  if (mod10(l.slice(10, 20)) !== Number(l[20])) erros.push('Dígito do 2º campo da linha digitável inválido.');
  if (mod10(l.slice(21, 31)) !== Number(l[31])) erros.push('Dígito do 3º campo da linha digitável inválido.');
  const codigoBarras = l.slice(0, 4) + l[32] + l.slice(33, 47) + l.slice(4, 9) + l.slice(10, 20) + l.slice(21, 31);
  if (mod11Boleto(codigoBarras.slice(0, 4) + codigoBarras.slice(5)) !== Number(l[32])) erros.push('Dígito verificador geral do boleto inválido.');
  const dados = { banco: l.slice(0, 3), fator: Number(l.slice(33, 37)), valor: Number(l.slice(37, 47)), codigoBarras };
  dados.vencimento = vencimentoDoFator(dados.fator);
  if (!erros.length) {
    if (banco && CODIGOS_BANCO[banco] && dados.banco !== CODIGOS_BANCO[banco]) erros.push(`O boleto é do banco ${dados.banco}, mas a duplicata está para ${banco}.`);
    if (valorCentavos != null && dados.valor && dados.valor !== valorCentavos) erros.push('O valor do boleto é diferente do valor da duplicata.');
    if (vencimento && dados.vencimento && dados.vencimento !== vencimento) erros.push('O vencimento do boleto é diferente do vencimento da duplicata.');
  }
  return { ok: erros.length === 0, erros, dados };
}
