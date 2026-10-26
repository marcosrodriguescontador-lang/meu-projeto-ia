// Razão gerencial em partidas dobradas. Toda movimentação financeira gera um lançamento balanceado e imutável.
import { and, eq, isNull, sql } from 'drizzle-orm'
import { erro } from '@shared/erros'
import { contaGerencial, lancamento, partida } from '../../infra/db/schema'
import { agoraIso, type Infra } from '../../nucleo/contexto'
import type { Autor } from '../seguranca/auditoria'

export const CONTAS = {
  DISPONIBILIDADES: '1.1.01',
  PROPRIETARIOS: '2.1.01',
  TERCEIROS: '2.1.02',
  CAUCOES: '2.1.03',
  RECEITA_ADMINISTRACAO: '3.1.01',
  RECEITA_INTERMEDIACAO: '3.1.02',
  RECEITA_ENCARGOS: '3.1.03',
  RECEITA_OUTRAS: '3.1.04'
} as const
export type CodigoConta = (typeof CONTAS)[keyof typeof CONTAS]

const cache = new WeakMap<Infra, Map<string, number>>()

export function idConta(infra: Infra, codigo: string): number {
  let m = cache.get(infra)
  if (!m) cache.set(infra, (m = new Map()))
  let id = m.get(codigo)
  if (id === undefined) {
    const r = infra.db.select({ id: contaGerencial.id }).from(contaGerencial).where(eq(contaGerencial.codigo, codigo)).get()
    if (!r) throw new Error(`Conta gerencial ${codigo} inexistente`)
    id = r.id
    m.set(codigo, id)
  }
  return id
}

export interface PartidaNova {
  conta: CodigoConta | string
  /** Valor com sinal: positivo = débito, negativo = crédito. */
  valor: number
  historico: string
  pessoaId?: number | null
  contaFinanceiraId?: number | null
  contratoId?: number | null
  tituloId?: number | null
  repasseId?: number | null
}

export const debito = (p: Omit<PartidaNova, 'valor'> & { valor: number }): PartidaNova => ({ ...p, valor: p.valor })
export const credito = (p: Omit<PartidaNova, 'valor'> & { valor: number }): PartidaNova => ({ ...p, valor: -p.valor })

/** Grava um lançamento balanceado (Σ débitos = Σ créditos). Deve ser chamado dentro de transação. */
export function registrarLancamento(
  infra: Infra,
  ator: Autor,
  l: { data: string; historico: string; origem: string; origemId?: number | null; estornoDeId?: number | null; partidas: PartidaNova[] }
): number {
  const partidas = l.partidas.filter((p) => p.valor !== 0)
  if (!partidas.length) throw erro.regra('Lançamento sem valores.')
  const soma = partidas.reduce((s, p) => s + p.valor, 0)
  if (soma !== 0) throw new Error(`Lançamento desbalanceado (diferença de ${soma} centavos): ${l.historico}`)
  if (partidas.some((p) => !Number.isInteger(p.valor))) throw new Error('Valores de partida devem ser inteiros (centavos)')
  const { id } = infra.db
    .insert(lancamento)
    .values({ data: l.data, historico: l.historico, origem: l.origem, origemId: l.origemId ?? null, estornoDeId: l.estornoDeId ?? null, criadoEm: agoraIso(infra), criadoPor: ator.id })
    .returning({ id: lancamento.id })
    .get()
  infra.db
    .insert(partida)
    .values(
      partidas.map((p) => ({
        lancamentoId: id,
        contaGerencialId: idConta(infra, p.conta),
        pessoaId: p.pessoaId ?? null,
        contaFinanceiraId: p.contaFinanceiraId ?? null,
        contratoId: p.contratoId ?? null,
        tituloId: p.tituloId ?? null,
        debitoCentavos: p.valor > 0 ? p.valor : 0,
        creditoCentavos: p.valor < 0 ? -p.valor : 0,
        historico: p.historico,
        repasseId: p.repasseId ?? null
      }))
    )
    .run()
  return id
}

/** Estorno: lançamento inverso, vinculado ao original. `manterRepasse` replica a marcação de repasse das partidas. */
export function estornarLancamento(infra: Infra, ator: Autor, lancamentoId: number, data: string, historico: string, manterRepasse: boolean): number {
  const original = infra.db.select().from(lancamento).where(eq(lancamento.id, lancamentoId)).get()
  if (!original) throw erro.naoEncontrado('Lançamento')
  const ja = infra.db.select({ id: lancamento.id }).from(lancamento).where(eq(lancamento.estornoDeId, lancamentoId)).get()
  if (ja) throw erro.regra('Este lançamento já foi estornado.')
  const partidas = infra.db.select().from(partida).where(eq(partida.lancamentoId, lancamentoId)).all()
  const codigos = new Map(infra.db.select().from(contaGerencial).all().map((c) => [c.id, c.codigo]))
  return registrarLancamento(infra, ator, {
    data,
    historico,
    origem: `ESTORNO_${original.origem}`,
    origemId: original.origemId,
    estornoDeId: lancamentoId,
    partidas: partidas.map((p) => ({
      conta: codigos.get(p.contaGerencialId)!,
      valor: p.creditoCentavos - p.debitoCentavos,
      historico: `Estorno: ${p.historico}`,
      pessoaId: p.pessoaId,
      contaFinanceiraId: p.contaFinanceiraId,
      contratoId: p.contratoId,
      tituloId: p.tituloId,
      repasseId: manterRepasse ? p.repasseId : null
    }))
  })
}

/** Saldo credor (passivo) de uma pessoa numa conta, considerando só partidas ainda não incluídas em repasse. */
export function saldoPendenteRepasse(infra: Infra, codigo: string, pessoaId: number): number {
  const r = infra.db
    .select({ s: sql<number>`coalesce(sum(${partida.creditoCentavos} - ${partida.debitoCentavos}), 0)` })
    .from(partida)
    .where(and(eq(partida.contaGerencialId, idConta(infra, codigo)), eq(partida.pessoaId, pessoaId), isNull(partida.repasseId)))
    .get()!
  return r.s
}

/** Saldo de uma conta gerencial (natureza credora para passivo/receita: crédito − débito). */
export function saldoConta(infra: Infra, codigo: string, filtro: { pessoaId?: number; ate?: string; de?: string } = {}): number {
  const cond = ['p.conta_gerencial_id = ?']
  const params: unknown[] = [idConta(infra, codigo)]
  if (filtro.pessoaId) (cond.push('p.pessoa_id = ?'), params.push(filtro.pessoaId))
  if (filtro.de) (cond.push('l.data >= ?'), params.push(filtro.de))
  if (filtro.ate) (cond.push('l.data <= ?'), params.push(filtro.ate))
  const r = infra.bruto
    .prepare(`SELECT coalesce(sum(p.credito_centavos - p.debito_centavos), 0) s FROM partida p JOIN lancamento l ON l.id = p.lancamento_id WHERE ${cond.join(' AND ')}`)
    .get(...params) as { s: number }
  return r.s
}

/** Verificação de integridade do razão: lançamentos desbalanceados (deve ser sempre vazio). */
export function verificarRazao(infra: Infra): { lancamentos: number; desbalanceados: number[]; somaGeral: number } {
  const des = infra.bruto
    .prepare('SELECT lancamento_id id FROM partida GROUP BY lancamento_id HAVING sum(debito_centavos) <> sum(credito_centavos)')
    .all() as { id: number }[]
  const total = (infra.bruto.prepare('SELECT count(*) n FROM lancamento').get() as { n: number }).n
  const soma = (infra.bruto.prepare('SELECT coalesce(sum(debito_centavos - credito_centavos), 0) s FROM partida').get() as { s: number }).s
  return { lancamentos: total, desbalanceados: des.map((d) => d.id), somaGeral: soma }
}
