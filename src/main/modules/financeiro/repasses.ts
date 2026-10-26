// Repasses: transformam saldos de terceiros (proprietários, beneficiários, cauções) em títulos a pagar,
// com rastreabilidade de cada partida que compõe o valor (demonstrativo).
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { ExtratoLinha, RepasseDto, SaldoRepasse } from '@shared/dto-financeiro'
import { erro } from '@shared/erros'
import { formatarData, hojeIso } from '@shared/financeiro/datas'
import { partida, pessoa, repasse } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'
import { CONTAS, idConta } from './razao'
import { baixasAtivas, cancelarTitulo, criarTitulo, saldoTitulo } from './titulos'

export type TipoRepasse = 'PROPRIETARIO' | 'TERCEIRO' | 'CAUCAO'
const CONTA_POR_TIPO: Record<TipoRepasse, string> = { PROPRIETARIO: CONTAS.PROPRIETARIOS, TERCEIRO: CONTAS.TERCEIROS, CAUCAO: CONTAS.CAUCOES }
const ORIGEM_POR_TIPO: Record<TipoRepasse, string> = { PROPRIETARIO: 'REPASSE', TERCEIRO: 'PAGAMENTO_TERCEIRO', CAUCAO: 'DEVOLUCAO_CAUCAO' }
const ROTULO: Record<TipoRepasse, string> = { PROPRIETARIO: 'Repasse ao proprietário', TERCEIRO: 'Pagamento a terceiro', CAUCAO: 'Devolução de caução' }

export function saldosARepassar(infra: Infra, ator: Ator, tipo?: TipoRepasse): SaldoRepasse[] {
  exigir(ator, 'financeiro.ver')
  const tipos: TipoRepasse[] = tipo ? [tipo] : ['PROPRIETARIO', 'TERCEIRO', 'CAUCAO']
  const saida: SaldoRepasse[] = []
  for (const t of tipos) {
    const linhas = infra.bruto
      .prepare(
        `SELECT p.pessoa_id pessoaId, pe.nome pessoa, sum(p.credito_centavos - p.debito_centavos) saldo, count(*) n
         FROM partida p JOIN pessoa pe ON pe.id = p.pessoa_id
         WHERE p.conta_gerencial_id = ? AND p.repasse_id IS NULL GROUP BY p.pessoa_id HAVING saldo <> 0 ORDER BY pe.nome`
      )
      .all(idConta(infra, CONTA_POR_TIPO[t])) as { pessoaId: number; pessoa: string; saldo: number; n: number }[]
    saida.push(...linhas.map((l) => ({ tipo: t, pessoaId: l.pessoaId, pessoa: l.pessoa, saldoCentavos: l.saldo, lancamentos: l.n })))
  }
  return saida
}

function linhasExtrato(infra: Infra, where: string, params: unknown[]): ExtratoLinha[] {
  return infra.bruto
    .prepare(
      `SELECT p.id partidaId, l.data, p.historico, c.numero contratoNumero,
        (SELECT i.logradouro || ', ' || i.numero || coalesce(' — ' || i.complemento, '') FROM imovel i WHERE i.id = c.imovel_id) imovel,
        p.credito_centavos creditoCentavos, p.debito_centavos debitoCentavos
       FROM partida p JOIN lancamento l ON l.id = p.lancamento_id LEFT JOIN contrato_locacao c ON c.id = p.contrato_id
       WHERE ${where} ORDER BY l.data, p.id`
    )
    .all(...params) as ExtratoLinha[]
}

export function extratoPendente(infra: Infra, ator: Ator, tipo: TipoRepasse, pessoaId: number): ExtratoLinha[] {
  exigir(ator, 'financeiro.ver')
  return linhasExtrato(infra, 'p.conta_gerencial_id = ? AND p.pessoa_id = ? AND p.repasse_id IS NULL', [idConta(infra, CONTA_POR_TIPO[tipo]), pessoaId])
}

/** Demonstrativo: partidas que compõem o repasse (sem o próprio pagamento). */
export function demonstrativoRepasse(infra: Infra, ator: Ator, repasseId: number): { repasse: RepasseDto; linhas: ExtratoLinha[] } {
  exigir(ator, 'financeiro.ver')
  const r = obterRepasse(infra, repasseId)
  return { repasse: r, linhas: linhasExtrato(infra, "p.repasse_id = ? AND (p.titulo_id IS NULL OR p.titulo_id <> coalesce(?, 0))", [repasseId, r.tituloId]) }
}

function obterRepasse(infra: Infra, id: number): RepasseDto {
  const r = infra.db
    .select({ id: repasse.id, tipo: repasse.tipo, pessoaId: repasse.pessoaId, pessoa: pessoa.nome, data: repasse.data, valorCentavos: repasse.valorCentavos, situacao: repasse.situacao, tituloId: repasse.tituloId, criadoEm: repasse.criadoEm })
    .from(repasse)
    .innerJoin(pessoa, eq(pessoa.id, repasse.pessoaId))
    .where(eq(repasse.id, id))
    .get()
  if (!r) throw erro.naoEncontrado('Repasse')
  return { ...r, saldoTituloCentavos: r.tituloId && r.situacao !== 'CANCELADO' ? saldoTitulo(infra, r.tituloId) : 0 }
}

export function listarRepasses(infra: Infra, ator: Ator, f: { situacao?: string; pessoaId?: number; tipo?: TipoRepasse } = {}): RepasseDto[] {
  exigir(ator, 'financeiro.ver')
  const cond = []
  if (f.situacao) cond.push(eq(repasse.situacao, f.situacao as 'ABERTO'))
  if (f.pessoaId) cond.push(eq(repasse.pessoaId, f.pessoaId))
  if (f.tipo) cond.push(eq(repasse.tipo, f.tipo))
  return infra.db
    .select({ id: repasse.id })
    .from(repasse)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(repasse.id))
    .limit(500)
    .all()
    .map((x) => obterRepasse(infra, x.id))
}

/**
 * Gera o repasse do saldo pendente da pessoa: marca as partidas que o compõem e cria o título a pagar.
 * Saldo zero ou devedor não gera repasse (o débito é compensado nos próximos créditos).
 */
export function gerarRepasse(infra: Infra, ator: Ator, e: { tipo: TipoRepasse; pessoaId: number; vencimento: string; contratoId?: number | null }, interno = false): RepasseDto {
  if (!interno) exigir(ator, 'financeiro.repasses')
  const run = () => {
    const contaId = idConta(infra, CONTA_POR_TIPO[e.tipo])
    const cond = [eq(partida.contaGerencialId, contaId), eq(partida.pessoaId, e.pessoaId), isNull(partida.repasseId)]
    if (e.contratoId) cond.push(eq(partida.contratoId, e.contratoId))
    const saldo = infra.db.select({ s: sql<number>`coalesce(sum(${partida.creditoCentavos} - ${partida.debitoCentavos}), 0)` }).from(partida).where(and(...cond)).get()!.s
    if (saldo <= 0) throw erro.regra(saldo < 0 ? `Saldo devedor de ${(-saldo / 100).toFixed(2)}: não há valor a repassar.` : 'Não há saldo a repassar.')
    const nome = infra.db.select({ n: pessoa.nome }).from(pessoa).where(eq(pessoa.id, e.pessoaId)).get()!.n
    const { id } = infra.db
      .insert(repasse)
      .values({ tipo: e.tipo, pessoaId: e.pessoaId, contaGerencialId: contaId, data: hojeIso(infra.agora()), valorCentavos: saldo, situacao: 'ABERTO', criadoEm: agoraIso(infra), criadoPor: ator.id })
      .returning({ id: repasse.id })
      .get()
    infra.db.update(partida).set({ repasseId: id }).where(and(...cond)).run()
    const tituloId = criarTitulo(infra, ator, {
      sentido: 'PAGAR',
      origem: ORIGEM_POR_TIPO[e.tipo],
      contratoId: e.contratoId ?? null,
      pessoaId: e.pessoaId,
      descricao: `${ROTULO[e.tipo]} nº ${id} — ${nome}`,
      emissao: hojeIso(infra.agora()),
      vencimentoOriginal: e.vencimento,
      vencimento: e.vencimento,
      recurso: 'TERCEIROS',
      repasseId: id,
      itens: [{ tipo: e.tipo, descricao: ROTULO[e.tipo], valor: saldo, destino: 'PASSIVO', beneficiarioId: e.pessoaId, contaGerencialId: contaId }]
    })
    infra.db.update(repasse).set({ tituloId }).where(eq(repasse.id, id)).run()
    auditar(infra, ator, { acao: 'REPASSE_GERADO', entidade: 'repasse', entidadeId: id, descricao: `${ROTULO[e.tipo]} — ${nome}: ${(saldo / 100).toFixed(2)}, vencimento ${formatarData(e.vencimento)}` })
    return obterRepasse(infra, id)
  }
  return interno ? run() : infra.bruto.transaction(run)()
}

/** Gera repasses para todos os proprietários com saldo positivo. */
export function gerarRepassesEmLote(infra: Infra, ator: Ator, vencimento: string): { gerados: RepasseDto[]; ignorados: { pessoa: string; motivo: string }[] } {
  exigir(ator, 'financeiro.repasses')
  const gerados: RepasseDto[] = []
  const ignorados: { pessoa: string; motivo: string }[] = []
  for (const s of saldosARepassar(infra, ator, 'PROPRIETARIO')) {
    if (s.saldoCentavos <= 0) {
      ignorados.push({ pessoa: s.pessoa, motivo: `Saldo devedor ${(s.saldoCentavos / 100).toFixed(2)}` })
      continue
    }
    gerados.push(gerarRepasse(infra, ator, { tipo: 'PROPRIETARIO', pessoaId: s.pessoaId, vencimento }))
  }
  return { gerados, ignorados }
}

export function cancelarRepasse(infra: Infra, ator: Ator, id: number, motivo: string): void {
  exigir(ator, 'financeiro.repasses')
  if (!motivo || motivo.trim().length < 5) throw erro.validacao('Informe o motivo.')
  infra.bruto.transaction(() => {
    const r = obterRepasse(infra, id)
    if (r.situacao !== 'ABERTO') throw erro.regra('Somente repasses em aberto podem ser cancelados.')
    if (r.tituloId && baixasAtivas(infra, r.tituloId)) throw erro.regra('Repasse com pagamento registrado. Estorne o pagamento antes.')
    infra.db.update(partida).set({ repasseId: null }).where(eq(partida.repasseId, id)).run()
    if (r.tituloId) cancelarTitulo(infra, ator, r.tituloId, `Repasse nº ${id} cancelado: ${motivo}`, true)
    infra.db.update(repasse).set({ situacao: 'CANCELADO', motivoCancelamento: motivo.trim() }).where(eq(repasse.id, id)).run()
    auditar(infra, ator, { acao: 'REPASSE_CANCELADO', entidade: 'repasse', entidadeId: id, descricao: `${r.pessoa}: ${(r.valorCentavos / 100).toFixed(2)} — motivo: ${motivo.trim()}` })
  })()
}
