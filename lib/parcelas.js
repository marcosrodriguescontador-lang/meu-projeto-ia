// Condições de pagamento e geração de parcelas (módulo ES puro, também usado no navegador).
//   tipo 'avista' – uma parcela, vencimento na data base, marcada como à vista
//   tipo 'dias'   – "30/60/90": prazos em dias a partir da data base
//   tipo 'datas'  – "30/04/2027; 30/05/2027": datas fixas de vencimento

export const TIPOS_CONDICAO = { avista: 'À vista', dias: 'Prazo em dias', datas: 'Datas fixas' };

function isoValida(a, m, d) {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function somarDiasIso(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Interpreta a condição. Retorna { vencimentos: [iso|null], erro }.
export function interpretarCondicao(tipo, valor, dataBase) {
  if (tipo === 'avista') return { vencimentos: [null] };
  const partes = String(valor ?? '').split(/[\s/;,+-]+/).filter(Boolean);
  if (tipo === 'dias') {
    if (!partes.length) return { erro: 'Informe os prazos em dias (ex.: 30/60/90).' };
    const dias = partes.map(Number);
    if (dias.some((n) => !Number.isInteger(n) || n < 0 || n > 1825)) return { erro: 'Prazos inválidos. Use números de dias, como 30/60/90.' };
    if (dias.some((n, i) => i > 0 && n <= dias[i - 1])) return { erro: 'Os prazos devem estar em ordem crescente.' };
    if (dias.length > 48) return { erro: 'No máximo 48 parcelas.' };
    if (!dataBase) return { erro: 'Data base não informada.' };
    return { vencimentos: dias.map((n) => somarDiasIso(dataBase, n)) };
  }
  if (tipo === 'datas') {
    const datas = String(valor ?? '').split(/[\s;,]+/).filter(Boolean);
    if (!datas.length) return { erro: 'Informe as datas de vencimento (ex.: 30/04/2027).' };
    const isos = [];
    for (const t of datas) {
      const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) || t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return { erro: `Data inválida: ${t}. Use dd/mm/aaaa.` };
      const [a, mes, d] = t.includes('-') ? [+m[1], +m[2], +m[3]] : [+m[3], +m[2], +m[1]];
      if (!isoValida(a, mes, d)) return { erro: `Data inválida: ${t}.` };
      isos.push(`${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    if (isos.some((d, i) => i > 0 && d <= isos[i - 1])) return { erro: 'As datas devem estar em ordem crescente.' };
    if (isos.length > 48) return { erro: 'No máximo 48 parcelas.' };
    return { vencimentos: isos };
  }
  return { erro: 'Condição de pagamento inválida.' };
}

// Divide o total (centavos) em parcelas iguais; a diferença de arredondamento vai na última.
export function dividirValor(total, n) {
  const base = Math.floor(total / n);
  const valores = Array(n).fill(base);
  valores[n - 1] = total - base * (n - 1);
  return valores;
}

export function gerarParcelas({ total, tipo, valor, dataBase }) {
  const { vencimentos, erro } = interpretarCondicao(tipo, valor, dataBase);
  if (erro) throw new Error(erro);
  const valores = dividirValor(total, vencimentos.length);
  return vencimentos.map((v, i) => ({ numero: i + 1, de: vencimentos.length, vencimento: v, valor: valores[i] }));
}

export function descreverCondicao(tipo, valor) {
  if (tipo === 'avista') return 'À vista';
  if (tipo === 'dias') return `${String(valor).split(/[\s/;,+-]+/).filter(Boolean).join('/')} dias`;
  if (tipo === 'datas') return `Vencimento(s): ${String(valor).split(/[\s;,]+/).filter(Boolean).join(', ')}`;
  return '';
}
