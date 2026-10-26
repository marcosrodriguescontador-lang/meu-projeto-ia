// Valores monetários em centavos (inteiros) e percentuais em pontos-base (1% = 100 bp).

/** Converte texto digitado ("1.234,56", "1234.5", "R$ 10") em centavos. Retorna null se inválido. */
export function paraCentavos(texto: string | number | null | undefined): number | null {
  if (texto == null || texto === '') return null
  if (typeof texto === 'number') return Number.isFinite(texto) ? Math.round(texto * 100) : null
  let t = texto.replace(/[R$\s]/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null
  const [inteiro, frac = ''] = t.replace('-', '').split('.')
  const v = Number(inteiro) * 100 + Number(frac.padEnd(2, '0'))
  return t.startsWith('-') ? -v : v
}

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtNumero = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatarMoeda(centavos: number | null | undefined): string {
  return centavos == null ? '—' : fmtMoeda.format(centavos / 100)
}

/** Formato para campo editável: "1.234,56". */
export function centavosParaTexto(centavos: number | null | undefined): string {
  return centavos == null ? '' : fmtNumero.format(centavos / 100)
}

/** Percentual digitado ("6", "6,5", "33,33") em pontos-base. */
export function paraPontosBase(texto: string | number | null | undefined): number | null {
  if (texto == null || texto === '') return null
  const t = typeof texto === 'number' ? String(texto) : texto.replace('%', '').trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}

export function formatarPercentual(bp: number | null | undefined): string {
  if (bp == null) return '—'
  return `${(bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

/** Aplica percentual (bp) sobre valor em centavos com arredondamento half-even. */
export function aplicarPercentual(centavos: number, bp: number): number {
  const exato = (centavos * bp) / 10_000
  const piso = Math.floor(exato)
  const resto = exato - piso
  if (Math.abs(resto - 0.5) < 1e-9) return piso % 2 === 0 ? piso : piso + 1
  return Math.round(exato)
}

/** Áreas: centésimos de m² ⇄ texto "85,50". */
export function paraCentesimos(texto: string | number | null | undefined): number | null {
  return paraCentavos(texto)
}

export function formatarArea(centesimos: number | null | undefined): string {
  return centesimos == null ? '—' : `${fmtNumero.format(centesimos / 100)} m²`
}
