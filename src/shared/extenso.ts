// Valor monetário por extenso (recibos e contratos).
const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const r = n % 100
  const partes: string[] = []
  if (c) partes.push(CENTENAS[c]!)
  if (r) {
    if (r < 20) partes.push(UNIDADES[r]!)
    else {
      const d = Math.floor(r / 10)
      const u = r % 10
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]!)
    }
  }
  return partes.join(' e ')
}

const ESCALAS: [string, string][] = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões']
]

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  const grupos: number[] = []
  while (n > 0) {
    grupos.push(n % 1000)
    n = Math.floor(n / 1000)
  }
  const partes: { texto: string; valor: number }[] = []
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]!
    if (!g) continue
    const nome = i === 0 ? '' : g === 1 ? ESCALAS[i]![0] : ESCALAS[i]![1]
    const texto = i === 1 && g === 1 ? 'mil' : `${ate999(g)}${nome ? ` ${nome}` : ''}`
    partes.push({ texto, valor: g })
  }
  // Conector "e" antes do último grupo quando ele é < 100 ou centena exata.
  return partes
    .map((p, i) => {
      if (i === 0) return p.texto
      const ultimo = i === partes.length - 1
      return ultimo && (p.valor < 100 || p.valor % 100 === 0) ? ` e ${p.texto}` : `, ${p.texto}`
    })
    .join('')
}

export function valorPorExtenso(centavos: number): string {
  const reais = Math.floor(Math.abs(centavos) / 100)
  const cents = Math.abs(centavos) % 100
  const partes: string[] = []
  if (reais) {
    const milhoesExatos = reais >= 1_000_000 && reais % 1_000_000 === 0
    partes.push(`${inteiroPorExtenso(reais)}${milhoesExatos ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`)
  }
  if (cents) partes.push(`${inteiroPorExtenso(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`)
  if (!partes.length) return 'zero real'
  return (centavos < 0 ? 'menos ' : '') + partes.join(' e ')
}
