// Contas financeiras (caixa e bancos), índices econômicos e feriados locais.
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import type { ContaFinanceiraDto, FeriadoDto, IndiceDto } from '@shared/dto-financeiro'
import { erro } from '@shared/erros'
import { validarDataIso } from '@shared/financeiro/datas'
import { contaFinanceiraSchema, indiceValorSchema, type ContaFinanceiraInput, type IndiceValorInput } from '@shared/schemas-locacao'
import { contaFinanceira, feriado, indiceEconomico, indiceValor, partida } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'

export function saldoContaFinanceira(infra: Infra, id: number, ate?: string): number {
  const c = infra.db.select().from(contaFinanceira).where(eq(contaFinanceira.id, id)).get()
  if (!c) throw erro.naoEncontrado('Conta financeira')
  const r = infra.bruto
    .prepare(
      `SELECT coalesce(sum(p.debito_centavos - p.credito_centavos), 0) s FROM partida p JOIN lancamento l ON l.id = p.lancamento_id
       WHERE p.conta_financeira_id = ? ${ate ? 'AND l.data <= ?' : ''}`
    )
    .get(...(ate ? [id, ate] : [id])) as { s: number }
  return c.saldoInicialCentavos + r.s
}

export function listarContasFinanceiras(infra: Infra, ator: Ator, incluirInativas = false): ContaFinanceiraDto[] {
  exigir(ator, 'financeiro.ver')
  return infra.db
    .select()
    .from(contaFinanceira)
    .where(incluirInativas ? undefined : eq(contaFinanceira.ativa, true))
    .orderBy(asc(contaFinanceira.nome))
    .all()
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      bancoCodigo: c.bancoCodigo,
      agencia: c.agencia,
      conta: c.conta,
      titularidade: c.titularidade,
      saldoInicialCentavos: c.saldoInicialCentavos,
      dataSaldoInicial: c.dataSaldoInicial,
      ativa: c.ativa,
      saldoAtualCentavos: saldoContaFinanceira(infra, c.id)
    }))
}

export function salvarContaFinanceira(infra: Infra, ator: Ator, id: number | null, entrada: ContaFinanceiraInput): { id: number } {
  exigir(ator, 'financeiro.contas')
  const d = contaFinanceiraSchema.parse(entrada)
  return infra.bruto.transaction(() => {
    const dup = infra.db
      .select({ id: contaFinanceira.id })
      .from(contaFinanceira)
      .where(id ? and(eq(contaFinanceira.nome, d.nome), ne(contaFinanceira.id, id)) : eq(contaFinanceira.nome, d.nome))
      .get()
    if (dup) throw erro.conflito('Já existe uma conta com este nome.', { nome: 'Nome já utilizado' })
    if (id) {
      const antes = infra.db.select().from(contaFinanceira).where(eq(contaFinanceira.id, id)).get()
      if (!antes) throw erro.naoEncontrado('Conta financeira')
      const movimentada = infra.db.select({ n: sql<number>`count(*)` }).from(partida).where(eq(partida.contaFinanceiraId, id)).get()!.n > 0
      if (movimentada && (antes.saldoInicialCentavos !== d.saldoInicial || antes.dataSaldoInicial !== d.dataSaldoInicial || antes.titularidade !== d.titularidade))
        throw erro.regra('Conta já movimentada: saldo inicial, data e titularidade não podem ser alterados.')
      infra.db
        .update(contaFinanceira)
        .set({ ...d, saldoInicialCentavos: d.saldoInicial, atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) })
        .where(eq(contaFinanceira.id, id))
        .run()
      auditar(infra, ator, { acao: 'CONTA_FINANCEIRA_ALTERADA', entidade: 'conta_financeira', entidadeId: id, antes, depois: d })
      return { id }
    }
    const r = infra.db
      .insert(contaFinanceira)
      .values({ ...d, saldoInicialCentavos: d.saldoInicial, criadoPor: ator.id, atualizadoPor: ator.id })
      .returning({ id: contaFinanceira.id })
      .get()
    auditar(infra, ator, { acao: 'CONTA_FINANCEIRA_CRIADA', entidade: 'conta_financeira', entidadeId: r.id, depois: d })
    return r
  })()
}

export function exigirContaAtiva(infra: Infra, id: number) {
  const c = infra.db.select().from(contaFinanceira).where(eq(contaFinanceira.id, id)).get()
  if (!c || !c.ativa) throw erro.validacao('Conta financeira inválida ou inativa.', { contaFinanceiraId: 'Conta inválida' })
  return c
}

// ───── Índices ─────

export function listarIndices(infra: Infra): IndiceDto[] {
  const indices = infra.db.select().from(indiceEconomico).orderBy(asc(indiceEconomico.sigla)).all()
  return indices.map((i) => ({
    ...i,
    valores: infra.db
      .select({ competencia: indiceValor.competencia, variacaoPpm: indiceValor.variacaoPpm })
      .from(indiceValor)
      .where(eq(indiceValor.indiceId, i.id))
      .orderBy(sql`${indiceValor.competencia} DESC`)
      .all()
  }))
}

export function salvarValorIndice(infra: Infra, ator: Ator, entrada: IndiceValorInput): void {
  exigir(ator, 'indices.gerenciar')
  const d = indiceValorSchema.parse(entrada)
  if (Math.abs(d.variacao) > 200_000) throw erro.validacao('Variação mensal acima de 20%: confira o valor digitado.', { variacao: 'Valor fora do esperado' })
  infra.bruto.transaction(() => {
    const antes = infra.db.select().from(indiceValor).where(and(eq(indiceValor.indiceId, d.indiceId), eq(indiceValor.competencia, d.competencia))).get()
    infra.db
      .insert(indiceValor)
      .values({ indiceId: d.indiceId, competencia: d.competencia, variacaoPpm: d.variacao, informadoPor: ator.id, informadoEm: agoraIso(infra) })
      .onConflictDoUpdate({ target: [indiceValor.indiceId, indiceValor.competencia], set: { variacaoPpm: d.variacao, informadoPor: ator.id, informadoEm: agoraIso(infra) } })
      .run()
    auditar(infra, ator, { acao: 'INDICE_INFORMADO', entidade: 'indice', entidadeId: d.indiceId, descricao: `${d.competencia}: ${(d.variacao / 10_000).toFixed(4)}%`, antes: antes ?? undefined })
  })()
}

export function variacoesIndice(infra: Infra, indiceId: number, competencias: string[]): Map<string, number> {
  const linhas = infra.db.select().from(indiceValor).where(eq(indiceValor.indiceId, indiceId)).all()
  const m = new Map(linhas.map((l) => [l.competencia, l.variacaoPpm]))
  return new Map(competencias.filter((c) => m.has(c)).map((c) => [c, m.get(c)!]))
}

// ───── Feriados locais ─────

export function feriadosLocais(infra: Infra): Set<string> {
  return new Set(infra.db.select({ d: feriado.data }).from(feriado).all().map((f) => f.d))
}

export function listarFeriados(infra: Infra): FeriadoDto[] {
  return infra.db.select().from(feriado).orderBy(asc(feriado.data)).all()
}

export function salvarFeriado(infra: Infra, ator: Ator, d: { data: string; descricao: string; abrangencia: string }): void {
  exigir(ator, 'indices.gerenciar')
  if (!validarDataIso(d.data)) throw erro.validacao('Data inválida.')
  if (!d.descricao.trim()) throw erro.validacao('Informe a descrição.')
  infra.bruto.transaction(() => {
    infra.db
      .insert(feriado)
      .values({ data: d.data, descricao: d.descricao.trim().slice(0, 120), abrangencia: d.abrangencia === 'ESTADUAL' ? 'ESTADUAL' : 'MUNICIPAL' })
      .onConflictDoUpdate({ target: feriado.data, set: { descricao: d.descricao.trim().slice(0, 120) } })
      .run()
    auditar(infra, ator, { acao: 'FERIADO_CADASTRADO', entidade: 'feriado', descricao: `${d.data} — ${d.descricao}` })
  })()
}

export function removerFeriado(infra: Infra, ator: Ator, id: number): void {
  exigir(ator, 'indices.gerenciar')
  infra.bruto.transaction(() => {
    const f = infra.db.select().from(feriado).where(eq(feriado.id, id)).get()
    if (!f) throw erro.naoEncontrado('Feriado')
    infra.db.delete(feriado).where(eq(feriado.id, id)).run()
    auditar(infra, ator, { acao: 'FERIADO_REMOVIDO', entidade: 'feriado', descricao: `${f.data} — ${f.descricao}` })
  })()
}
