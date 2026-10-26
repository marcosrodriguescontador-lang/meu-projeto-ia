// Datas como texto ISO 'AAAA-MM-DD' e competências 'AAAA-MM', com aritmética em UTC (sem fuso horário).

const DIA = 86_400_000

export function paraData(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a!, m! - 1, d!))
}

export function paraIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function hojeIso(agora = new Date()): string {
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

/** Data e hora local no formato AAAA-MM-DDTHH:MM. */
export function agoraLocal(agora = new Date()): string {
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function adicionarDias(iso: string, dias: number): string {
  return paraIso(new Date(paraData(iso).getTime() + dias * DIA))
}

/** Dias corridos de `de` até `ate` (positivo se `ate` é posterior). */
export function diferencaDias(de: string, ate: string): number {
  return Math.round((paraData(ate).getTime() - paraData(de).getTime()) / DIA)
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

export function competenciaDe(iso: string): string {
  return iso.slice(0, 7)
}

export function partesCompetencia(c: string): { ano: number; mes: number } {
  const [ano, mes] = c.split('-').map(Number)
  return { ano: ano!, mes: mes! }
}

export function adicionarMeses(c: string, n: number): string {
  const { ano, mes } = partesCompetencia(c)
  const t = ano * 12 + (mes - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

export function primeiroDia(c: string): string {
  return `${c}-01`
}

export function ultimoDia(c: string): string {
  const { ano, mes } = partesCompetencia(c)
  return `${c}-${String(diasNoMes(ano, mes)).padStart(2, '0')}`
}

/** Mesmo dia `n` meses depois, limitado ao último dia do mês (31/01 + 1 mês = 28 ou 29/02). */
export function adicionarMesesData(iso: string, n: number): string {
  const c = adicionarMeses(competenciaDe(iso), n)
  const { ano, mes } = partesCompetencia(c)
  const dia = Math.min(Number(iso.slice(8, 10)), diasNoMes(ano, mes))
  return `${c}-${String(dia).padStart(2, '0')}`
}

export function validarCompetencia(c: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(c)
}

export function validarDataIso(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  return paraIso(paraData(iso)) === iso
}

export function formatarCompetencia(c: string): string {
  const { ano, mes } = partesCompetencia(c)
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][mes - 1]}/${ano}`
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
