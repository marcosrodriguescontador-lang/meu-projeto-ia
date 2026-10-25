// Regras de cálculo financeiro. Todas as funções são puras e trabalham com centavos inteiros.
import { adicionarDias, competenciaDe, diasNoMes, diferencaDias, partesCompetencia, primeiroDia, ultimoDia, adicionarMeses } from './datas'

/** Divisão inteira com arredondamento half-even ("arredondamento bancário"). */
export function dividirArredondando(numerador: number, denominador: number): number {
  if (denominador <= 0) throw new Error('Denominador deve ser positivo')
  const negativo = numerador < 0
  const n = Math.abs(numerador)
  const q = Math.floor(n / denominador)
  const r = n - q * denominador
  const dobro = 2 * r
  let res = q
  if (dobro > denominador || (dobro === denominador && q % 2 === 1)) res = q + 1
  return negativo ? -res : res
}

export function percentualDe(centavos: number, bp: number): number {
  return dividirArredondando(centavos * bp, 10_000)
}

/**
 * Rateia `total` conforme pesos (maiores restos). A soma é sempre exatamente `total`.
 * Empates favorecem o primeiro item (ex.: proprietário principal).
 */
export function ratear(total: number, pesos: number[]): number[] {
  if (!pesos.length) return []
  const somaPesos = pesos.reduce((s, p) => s + p, 0)
  if (somaPesos <= 0 || pesos.some((p) => p < 0)) throw new Error('Pesos de rateio inválidos')
  const sinal = total < 0 ? -1 : 1
  const t = Math.abs(total)
  const exatos = pesos.map((p) => (t * p) / somaPesos)
  const base = exatos.map(Math.floor)
  let resto = t - base.reduce((s, v) => s + v, 0)
  const ordem = exatos.map((e, i) => ({ i, f: e - base[i]! })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (const { i } of ordem) {
    if (resto <= 0) break
    base[i]!++
    resto--
  }
  return base.map((v) => v * sinal)
}

/**
 * Distribui `total` entre itens proporcionalmente aos saldos (que podem ser negativos, ex.: descontos).
 * Nenhum item recebe além do próprio saldo; a soma é exatamente `total`.
 */
export function alocarProporcional(total: number, saldos: number[]): number[] {
  const soma = saldos.reduce((s, v) => s + v, 0)
  if (total < 0 || total > soma) throw new Error('Valor a alocar excede o saldo')
  if (total === soma) return [...saldos]
  if (total === 0) return saldos.map(() => 0)
  const exatos = saldos.map((s) => (s * total) / soma)
  const base = exatos.map(Math.floor)
  let resto = total - base.reduce((s, v) => s + v, 0)
  const ordem = exatos.map((e, i) => ({ i, f: e - base[i]! })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (const { i } of ordem) {
    if (resto <= 0) break
    base[i]!++
    resto--
  }
  return base
}

// ───── Aluguel por competência ─────

export interface PeriodoContrato {
  dataInicio: string
  /** Último dia de ocupação (fim do contrato ou entrega das chaves); null = em vigor. */
  dataFimOcupacao: string | null
}

/** Dias ocupados dentro da competência e total de dias do mês (pro rata por dias reais — Q11). */
export function diasOcupados(p: PeriodoContrato, competencia: string): { dias: number; diasMes: number } {
  const { ano, mes } = partesCompetencia(competencia)
  const dm = diasNoMes(ano, mes)
  const ini = p.dataInicio > primeiroDia(competencia) ? p.dataInicio : primeiroDia(competencia)
  const fimMes = ultimoDia(competencia)
  const fim = p.dataFimOcupacao && p.dataFimOcupacao < fimMes ? p.dataFimOcupacao : fimMes
  const dias = ini > fim ? 0 : diferencaDias(ini, fim) + 1
  return { dias, diasMes: dm }
}

export function valorProporcional(valorMensal: number, dias: number, diasMes: number): number {
  if (dias >= diasMes) return valorMensal
  return dividirArredondando(valorMensal * dias, diasMes)
}

/** Vencimento contratual da competência: dia fixo do mês seguinte (aluguel pós-pago, art. 42 da Lei 8.245/91). */
export function vencimentoDaCompetencia(competencia: string, dia: number): string {
  const seguinte = adicionarMeses(competencia, 1)
  const { ano, mes } = partesCompetencia(seguinte)
  return `${seguinte}-${String(Math.min(dia, diasNoMes(ano, mes))).padStart(2, '0')}`
}

// ───── Encargos por atraso ─────

export interface ParametrosEncargos {
  vencimentoOriginal: string
  vencimentoUtil: string
  dataPagamento: string
  multaBp: number
  jurosMesBp: number
}

/** Dias de atraso contados do vencimento original, apenas se o pagamento ocorrer após o vencimento útil. */
export function diasDeAtraso(p: Pick<ParametrosEncargos, 'vencimentoOriginal' | 'vencimentoUtil' | 'dataPagamento'>): number {
  if (p.dataPagamento <= p.vencimentoUtil) return 0
  return diferencaDias(p.vencimentoOriginal, p.dataPagamento)
}

/** Multa e juros (pro rata die, mês de 30 dias) sobre o principal em atraso — Q6. */
export function calcularEncargos(principal: number, p: ParametrosEncargos): { dias: number; multa: number; juros: number } {
  const dias = diasDeAtraso(p)
  if (dias <= 0 || principal <= 0) return { dias: 0, multa: 0, juros: 0 }
  return { dias, multa: percentualDe(principal, p.multaBp), juros: dividirArredondando(principal * p.jurosMesBp * dias, 10_000 * 30) }
}

/**
 * Decompõe um valor recebido em principal, multa e juros. Se o valor cobre o saldo com encargos, quita tudo;
 * se for menor (pagamento parcial em atraso), os encargos incidem proporcionalmente ao principal amortizado.
 */
export function decomporPagamento(valorRecebido: number, saldo: number, p: ParametrosEncargos, dispensarEncargos = false): { principal: number; multa: number; juros: number; dias: number } {
  if (valorRecebido <= 0) throw new Error('Valor recebido deve ser positivo')
  const enc = calcularEncargos(saldo, p)
  if (dispensarEncargos || enc.dias === 0) {
    if (valorRecebido > saldo) throw new Error('Valor recebido excede o saldo do título')
    return { principal: valorRecebido, multa: 0, juros: 0, dias: enc.dias }
  }
  const totalDevido = saldo + enc.multa + enc.juros
  if (valorRecebido > totalDevido) throw new Error('Valor recebido excede o saldo com encargos')
  if (valorRecebido === totalDevido) return { principal: saldo, multa: enc.multa, juros: enc.juros, dias: enc.dias }
  // Fator = 1 + multa + juros pro rata (em 1/300.000 avos para manter inteiros).
  const den = 300_000 + 30 * p.multaBp + p.jurosMesBp * enc.dias
  let principal = Math.floor((valorRecebido * 300_000) / den)
  let multa = percentualDe(principal, p.multaBp)
  let juros = valorRecebido - principal - multa
  while (juros < 0 && principal > 0) {
    principal--
    multa = percentualDe(principal, p.multaBp)
    juros = valorRecebido - principal - multa
  }
  return { principal, multa, juros, dias: enc.dias }
}

// ───── Reajuste ─────

/** Acumula variações mensais (ppm) de forma composta. Resultado em ppm, arredondado. */
export function acumularVariacoes(variacoesPpm: number[]): number {
  const fator = variacoesPpm.reduce((f, v) => f * (1 + v / 1_000_000), 1)
  return Math.round((fator - 1) * 1_000_000)
}

/** Novo valor do aluguel. Índice negativo só reduz o valor se o contrato permitir (Q13). */
export function aplicarReajuste(valor: number, acumuladoPpm: number, permitirNegativo: boolean): { aplicadoPpm: number; novoValor: number } {
  const aplicado = acumuladoPpm < 0 && !permitirNegativo ? 0 : acumuladoPpm
  return { aplicadoPpm: aplicado, novoValor: dividirArredondando(valor * (1_000_000 + aplicado), 1_000_000) }
}

/** As 12 competências imediatamente anteriores ao mês do aniversário (ex.: base mar/2027 → mar/2026 a fev/2027). */
export function competenciasDoReajuste(dataBase: string, periodicidadeMeses = 12): string[] {
  const c = competenciaDe(dataBase)
  return Array.from({ length: periodicidadeMeses }, (_, i) => adicionarMeses(c, i - periodicidadeMeses))
}

// ───── Rescisão ─────

/** Multa rescisória proporcional ao período restante (art. 4º da Lei 8.245/91) — Q17. */
export function multaRescisoria(p: { aluguel: number; quantidadeAlugueis: number; dataInicio: string; dataFim: string; dataEntrega: string }): {
  valor: number
  diasTotais: number
  diasRestantes: number
  memoria: string
} {
  const diasTotais = diferencaDias(p.dataInicio, p.dataFim) + 1
  const diasRestantes = Math.max(0, diferencaDias(p.dataEntrega, p.dataFim))
  if (diasRestantes === 0 || diasTotais <= 0) return { valor: 0, diasTotais, diasRestantes: 0, memoria: 'Entrega após o término do prazo: multa não aplicável.' }
  const base = p.aluguel * p.quantidadeAlugueis
  const valor = dividirArredondando(base * diasRestantes, diasTotais)
  return {
    valor,
    diasTotais,
    diasRestantes,
    memoria: `${p.quantidadeAlugueis} aluguéis (${(base / 100).toFixed(2)}) × ${diasRestantes} dias restantes ÷ ${diasTotais} dias de contrato = ${(valor / 100).toFixed(2)}`
  }
}

export { adicionarDias }
