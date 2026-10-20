// Chave de acesso da NF-e (44 dígitos), módulo ES puro (também usado no navegador).
// Estrutura: cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tpEmis(1) código(8) DV(1)

export const CODIGOS_UF = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25,
  PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };

export function dvChave(chave43) {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function decomporChave(valor) {
  const c = String(valor ?? '').replace(/\D/g, '');
  return {
    chave: c,
    cUF: c.slice(0, 2), ano: 2000 + Number(c.slice(2, 4)), mes: Number(c.slice(4, 6)),
    cnpj: c.slice(6, 20), modelo: c.slice(20, 22), serie: String(Number(c.slice(22, 25))),
    numero: String(Number(c.slice(25, 34))), tpEmis: c.slice(34, 35), codigo: c.slice(35, 43), dv: Number(c.slice(43, 44)),
  };
}

// Valida a estrutura e o dígito verificador. Retorna { ok, erros: [], dados }.
export function validarChaveNFe(valor) {
  const d = decomporChave(valor);
  const erros = [];
  if (d.chave.length !== 44) return { ok: false, erros: ['A chave de acesso deve ter 44 números.'], dados: d };
  if (dvChave(d.chave.slice(0, 43)) !== d.dv) erros.push('Dígito verificador da chave inválido. Confira a digitação.');
  if (!Object.values(CODIGOS_UF).includes(Number(d.cUF))) erros.push('Código de UF da chave inválido.');
  if (d.mes < 1 || d.mes > 12) erros.push('Mês de emissão da chave inválido.');
  if (d.modelo !== '55') erros.push(`A chave é do modelo ${d.modelo}; esperado 55 (NF-e).`);
  if (Number(d.numero) < 1) erros.push('Número da nota na chave inválido.');
  return { ok: erros.length === 0, erros, dados: d };
}

// Confere a chave contra a empresa e os dados informados. Retorna lista de erros.
export function conferirChave(valor, { cnpjEmpresa, ufEmpresa, numero, serie, dataEmissao } = {}) {
  const { ok, erros, dados } = validarChaveNFe(valor);
  if (dados.chave.length !== 44) return erros;
  const out = [...erros];
  const cnpj = String(cnpjEmpresa ?? '').replace(/\D/g, '');
  if (cnpj && dados.cnpj !== cnpj) out.push('O CNPJ contido na chave não é o CNPJ da empresa.');
  if (ufEmpresa && CODIGOS_UF[ufEmpresa] && Number(dados.cUF) !== CODIGOS_UF[ufEmpresa]) out.push('A UF da chave não é a UF da empresa.');
  if (numero != null && numero !== '' && String(Number(numero)) !== dados.numero) out.push(`O número informado (${numero}) não bate com o número da chave (${dados.numero}).`);
  if (serie != null && serie !== '' && String(Number(serie)) !== dados.serie) out.push(`A série informada (${serie}) não bate com a série da chave (${dados.serie}).`);
  if (dataEmissao) {
    const [a, m] = dataEmissao.split('-').map(Number);
    if (a !== dados.ano || m !== dados.mes) out.push('O mês/ano de emissão não bate com o mês/ano da chave.');
  }
  return out;
}

export function formatarChave(valor) {
  return String(valor ?? '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}
