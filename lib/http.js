// Utilidades HTTP comuns às rotas.

export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

export const erro = (status, mensagem) => new ErroHttp(status, mensagem);

export function texto(v, max = 200) {
  return String(v ?? '').trim().slice(0, max);
}

export function inteiro(v, padrao = null) {
  const n = Number(v);
  return Number.isInteger(n) ? n : padrao;
}

// Converte "1.234,56", "1234.56" ou número (reais) em centavos inteiros.
export function centavos(v) {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return Math.round(v * 100);
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) throw erro(400, `Valor inválido: ${v}`);
  return Math.round(n * 100);
}

// Data ISO aaaa-mm-dd válida ou null. Aceita também dd/mm/aaaa.
export function dataIso(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const b = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (b) m = [null, b[3], b[2], b[1]];
  }
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function hojeIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
