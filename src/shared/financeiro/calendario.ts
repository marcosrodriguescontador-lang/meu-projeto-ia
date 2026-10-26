// Dias úteis bancários: fins de semana, feriados nacionais (fixos e móveis) e feriados locais cadastrados.
import { adicionarDias, paraData } from './datas'

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Feriados nacionais e dias sem expediente bancário (Carnaval e Corpus Christi). */
export function feriadosNacionais(ano: number): Map<string, string> {
  const p = pascoa(ano)
  const fixos: [string, string][] = [
    ['01-01', 'Confraternização Universal'],
    ['04-21', 'Tiradentes'],
    ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência do Brasil'],
    ['10-12', 'Nossa Senhora Aparecida'],
    ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'],
    ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
    ['12-25', 'Natal']
  ]
  const mapa = new Map<string, string>(fixos.map(([md, n]) => [`${ano}-${md}`, n]))
  mapa.set(adicionarDias(p, -48), 'Carnaval (segunda-feira)')
  mapa.set(adicionarDias(p, -47), 'Carnaval (terça-feira)')
  mapa.set(adicionarDias(p, -2), 'Sexta-feira Santa')
  mapa.set(adicionarDias(p, 60), 'Corpus Christi')
  return mapa
}

export function ehDiaUtil(iso: string, feriadosLocais: ReadonlySet<string> = new Set()): boolean {
  const dia = paraData(iso).getUTCDay()
  if (dia === 0 || dia === 6) return false
  if (feriadosLocais.has(iso)) return false
  return !feriadosNacionais(Number(iso.slice(0, 4))).has(iso)
}

/** A própria data, se útil; senão o próximo dia útil. */
export function proximoDiaUtil(iso: string, feriadosLocais: ReadonlySet<string> = new Set()): string {
  let d = iso
  while (!ehDiaUtil(d, feriadosLocais)) d = adicionarDias(d, 1)
  return d
}
