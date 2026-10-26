// Importação de extratos (OFX/CSV) e conciliação bancária com sugestões automáticas.
import { and, eq } from 'drizzle-orm'
import { erro } from '@shared/erros'
import { diferencaDias } from '@shared/financeiro/datas'
import { decodificarExtrato, detectarSeparador, dividirCsv, lerCsv, lerOfx, type ExtratoLido, type MapaCsv } from '@shared/financeiro/extratos'
import { sha256 } from '../../infra/crypto'
import { conciliacao, contaFinanceira, extratoImportacao, extratoLinha, partida } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'
import { saldoContaFinanceira } from './cadastros'
import { CONTAS, idConta } from './razao'
import { criarTituloManual } from './tesouraria'
import type { ResultadoImportacao, LinhaExtratoDto, MovimentoPendente, Sugestao, ResumoConciliacao } from '@shared/dto-financeiro'
export type { ResultadoImportacao, LinhaExtratoDto, MovimentoPendente, Sugestao, ResumoConciliacao }

export function previaCsv(bytes: Uint8Array): { separador: string; linhas: string[][] } {
  const texto = decodificarExtrato(bytes)
  const separador = detectarSeparador(texto)
  return { separador, linhas: dividirCsv(texto, separador).slice(0, 12) }
}

/**
 * Importa o extrato para a conta. O mesmo arquivo não é aceito duas vezes, e transações já importadas
 * (mesma chave) são ignoradas — arquivos com períodos sobrepostos não duplicam lançamentos.
 */
export function importarExtrato(infra: Infra, ator: Ator, e: { contaId: number; arquivo: string; bytes: Uint8Array; mapaCsv?: MapaCsv | null; conciliarAutomatico?: boolean }): ResultadoImportacao {
  exigir(ator, 'financeiro.receber')
  const conta = infra.db.select().from(contaFinanceira).where(eq(contaFinanceira.id, e.contaId)).get()
  if (!conta) throw erro.naoEncontrado('Conta financeira')
  const hash = sha256(Buffer.from(e.bytes))
  if (infra.db.select({ id: extratoImportacao.id }).from(extratoImportacao).where(and(eq(extratoImportacao.contaFinanceiraId, conta.id), eq(extratoImportacao.sha256, hash))).get())
    throw erro.conflito('Este arquivo já foi importado para esta conta.')
  const texto = decodificarExtrato(e.bytes)
  let lido: ExtratoLido
  try {
    lido = /<OFX>/i.test(texto) ? lerOfx(texto) : lerCsv(texto, e.mapaCsv ?? (() => { throw new Error('Informe o mapeamento das colunas do CSV.') })())
  } catch (err) {
    throw erro.validacao(err instanceof Error ? err.message : String(err))
  }
  if (!lido.transacoes.length) throw erro.validacao('Nenhuma transação encontrada no arquivo.')
  const r = infra.bruto.transaction(() => {
    const { id } = infra.db
      .insert(extratoImportacao)
      .values({
        contaFinanceiraId: conta.id,
        arquivo: e.arquivo.slice(0, 200),
        formato: lido.formato,
        sha256: hash,
        periodoInicio: lido.inicio,
        periodoFim: lido.fim,
        saldoFinalCentavos: lido.saldoFinal,
        dataSaldoFinal: lido.dataSaldoFinal ?? lido.fim,
        linhasLidas: lido.transacoes.length,
        linhasNovas: 0,
        importadoEm: agoraIso(infra),
        importadoPor: ator.id
      })
      .returning({ id: extratoImportacao.id })
      .get()
    let novas = 0
    for (const t of lido.transacoes) {
      const res = infra.db
        .insert(extratoLinha)
        .values({ importacaoId: id, contaFinanceiraId: conta.id, data: t.data, valorCentavos: t.valor, descricao: t.descricao, documento: t.documento, chave: t.chave })
        .onConflictDoNothing()
        .run()
      novas += res.changes
    }
    infra.bruto.prepare('UPDATE extrato_importacao SET linhas_novas = ? WHERE id = ?').run(novas, id)
    auditar(infra, ator, { acao: 'EXTRATO_IMPORTADO', entidade: 'conta_financeira', entidadeId: conta.id, descricao: `${e.arquivo}: ${lido.transacoes.length} transação(ões), ${novas} nova(s)` })
    return { importacaoId: id, lidas: lido.transacoes.length, novas, duplicadas: lido.transacoes.length - novas, conciliadasAutomaticamente: 0 }
  })()
  if (e.conciliarAutomatico !== false) r.conciliadasAutomaticamente = conciliarAutomaticamente(infra, ator, conta.id)
  return r
}

// ───── Conciliação ─────

export function listarLinhas(infra: Infra, ator: Ator, contaId: number, situacao?: string): LinhaExtratoDto[] {
  exigir(ator, 'financeiro.ver')
  return infra.bruto
    .prepare(
      `SELECT l.id, l.data, l.valor_centavos valorCentavos, l.descricao, l.documento, l.situacao, l.motivo_ignorar motivoIgnorar,
        c.partida_id partidaId, p.historico historicoSistema, coalesce(c.automatica, 0) automatica
       FROM extrato_linha l LEFT JOIN conciliacao c ON c.extrato_linha_id = l.id LEFT JOIN partida p ON p.id = c.partida_id
       WHERE l.conta_financeira_id = ? ${situacao ? 'AND l.situacao = ?' : ''} ORDER BY l.data DESC, l.id DESC`
    )
    .all(...(situacao ? [contaId, situacao] : [contaId]))
    .map((r) => ({ ...(r as LinhaExtratoDto), automatica: !!(r as { automatica: number }).automatica }))
}

/**
 * Movimentos do sistema ainda não conciliados. Pares lançamento/estorno sem nenhuma conciliação
 * se anulam e não aparecem (erro de digitação corrigido não exige movimento bancário).
 */
export function movimentosPendentes(infra: Infra, contaId: number): MovimentoPendente[] {
  const linhas = infra.bruto
    .prepare(
      `SELECT p.id partidaId, l.data, p.historico, p.debito_centavos - p.credito_centavos valorCentavos, l.id lancamento, l.estorno_de_id estornoDe,
        (SELECT e.id FROM lancamento e WHERE e.estorno_de_id = l.id) estornadoPor
       FROM partida p JOIN lancamento l ON l.id = p.lancamento_id
       WHERE p.conta_financeira_id = ? AND p.conta_gerencial_id = ? AND NOT EXISTS (SELECT 1 FROM conciliacao c WHERE c.partida_id = p.id)
       ORDER BY l.data, p.id`
    )
    .all(contaId, idConta(infra, CONTAS.DISPONIBILIDADES)) as (MovimentoPendente & { lancamento: number; estornoDe: number | null; estornadoPor: number | null })[]
  const pendentes = new Set(linhas.map((l) => l.lancamento))
  return linhas
    .filter((l) => !(l.estornadoPor && pendentes.has(l.estornadoPor)) && !(l.estornoDe && pendentes.has(l.estornoDe)))
    .map(({ partidaId, data, historico, valorCentavos }) => ({ partidaId, data, historico, valorCentavos }))
}

/** Sugere pares com o mesmo valor (sinal incluído) e data próxima (até 5 dias), priorizando a menor distância. */
export function sugestoes(infra: Infra, contaId: number): Sugestao[] {
  const linhas = infra.db.select().from(extratoLinha).where(and(eq(extratoLinha.contaFinanceiraId, contaId), eq(extratoLinha.situacao, 'PENDENTE'))).all()
  const movs = movimentosPendentes(infra, contaId)
  const usados = new Set<number>()
  const saida: Sugestao[] = []
  const ordenadas = [...linhas].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)
  for (const l of ordenadas) {
    const candidatos = movs
      .filter((m) => !usados.has(m.partidaId) && m.valorCentavos === l.valorCentavos && Math.abs(diferencaDias(m.data, l.data)) <= 5)
      .map((m) => ({ m, d: Math.abs(diferencaDias(m.data, l.data)) }))
      .sort((a, b) => a.d - b.d || a.m.partidaId - b.m.partidaId)
    if (!candidatos.length) continue
    usados.add(candidatos[0]!.m.partidaId)
    saida.push({ linhaId: l.id, partidaId: candidatos[0]!.m.partidaId, diasDiferenca: candidatos[0]!.d, unica: candidatos.length === 1 })
  }
  return saida
}

function validarPar(infra: Infra, contaId: number, linhaId: number, partidaId: number) {
  const l = infra.db.select().from(extratoLinha).where(eq(extratoLinha.id, linhaId)).get()
  if (!l || l.contaFinanceiraId !== contaId) throw erro.naoEncontrado('Linha do extrato')
  if (l.situacao !== 'PENDENTE') throw erro.regra('Linha do extrato já conciliada ou ignorada.')
  const p = infra.db.select().from(partida).where(eq(partida.id, partidaId)).get()
  if (!p || p.contaFinanceiraId !== contaId || p.contaGerencialId !== idConta(infra, CONTAS.DISPONIBILIDADES)) throw erro.validacao('Movimento do sistema inválido para esta conta.')
  if (infra.db.select({ x: conciliacao.extratoLinhaId }).from(conciliacao).where(eq(conciliacao.partidaId, partidaId)).get()) throw erro.regra('Movimento do sistema já conciliado.')
  if (p.debitoCentavos - p.creditoCentavos !== l.valorCentavos) throw erro.regra('Os valores do extrato e do sistema são diferentes.')
  return l
}

export function conciliar(infra: Infra, ator: Ator, contaId: number, linhaId: number, partidaId: number, automatica = false): void {
  if (!automatica) exigir(ator, 'financeiro.receber')
  const run = () => {
    const l = validarPar(infra, contaId, linhaId, partidaId)
    infra.db.insert(conciliacao).values({ extratoLinhaId: linhaId, partidaId, automatica, conciliadoEm: agoraIso(infra), conciliadoPor: ator.id }).run()
    infra.db.update(extratoLinha).set({ situacao: 'CONCILIADA' }).where(eq(extratoLinha.id, linhaId)).run()
    if (!automatica) auditar(infra, ator, { acao: 'CONCILIACAO_MANUAL', entidade: 'conta_financeira', entidadeId: contaId, descricao: `${l.data} ${l.descricao}: ${(l.valorCentavos / 100).toFixed(2)}` })
  }
  if (automatica) run()
  else infra.bruto.transaction(run)()
}

/** Concilia automaticamente apenas os pares inequívocos (único candidato com mesmo valor e data a até 3 dias). */
export function conciliarAutomaticamente(infra: Infra, ator: Ator, contaId: number): number {
  exigir(ator, 'financeiro.receber')
  return infra.bruto.transaction(() => {
    let n = 0
    for (const s of sugestoes(infra, contaId)) {
      if (!s.unica || s.diasDiferenca > 3) continue
      conciliar(infra, ator, contaId, s.linhaId, s.partidaId, true)
      n++
    }
    if (n) auditar(infra, ator, { acao: 'CONCILIACAO_AUTOMATICA', entidade: 'conta_financeira', entidadeId: contaId, descricao: `${n} par(es) conciliado(s) automaticamente` })
    return n
  })()
}

export function desfazerConciliacao(infra: Infra, ator: Ator, linhaId: number): void {
  exigir(ator, 'financeiro.receber')
  infra.bruto.transaction(() => {
    const l = infra.db.select().from(extratoLinha).where(eq(extratoLinha.id, linhaId)).get()
    if (!l || l.situacao === 'PENDENTE') throw erro.regra('Linha não está conciliada nem ignorada.')
    infra.db.delete(conciliacao).where(eq(conciliacao.extratoLinhaId, linhaId)).run()
    infra.db.update(extratoLinha).set({ situacao: 'PENDENTE', motivoIgnorar: null }).where(eq(extratoLinha.id, linhaId)).run()
    auditar(infra, ator, { acao: 'CONCILIACAO_DESFEITA', entidade: 'conta_financeira', entidadeId: l.contaFinanceiraId, descricao: `${l.data} ${l.descricao}` })
  })()
}

export function ignorarLinha(infra: Infra, ator: Ator, linhaId: number, motivo: string): void {
  exigir(ator, 'financeiro.receber')
  if (!motivo || motivo.trim().length < 5) throw erro.validacao('Informe o motivo.')
  infra.bruto.transaction(() => {
    const l = infra.db.select().from(extratoLinha).where(eq(extratoLinha.id, linhaId)).get()
    if (!l || l.situacao !== 'PENDENTE') throw erro.regra('Somente linhas pendentes podem ser ignoradas.')
    infra.db.update(extratoLinha).set({ situacao: 'IGNORADA', motivoIgnorar: motivo.trim() }).where(eq(extratoLinha.id, linhaId)).run()
    auditar(infra, ator, { acao: 'EXTRATO_LINHA_IGNORADA', entidade: 'conta_financeira', entidadeId: l.contaFinanceiraId, descricao: `${l.data} ${l.descricao} (${(l.valorCentavos / 100).toFixed(2)}) — ${motivo.trim()}` })
  })()
}

/** Lança no sistema uma movimentação que só existe no extrato (tarifa, rendimento, receita) e já concilia. */
export function lancarDaLinha(infra: Infra, ator: Ator, linhaId: number, d: { categoriaId: number; pessoaId: number; descricao: string }): void {
  const l = infra.db.select().from(extratoLinha).where(eq(extratoLinha.id, linhaId)).get()
  if (!l || l.situacao !== 'PENDENTE') throw erro.regra('Linha não está pendente.')
  const sentido = l.valorCentavos < 0 ? 'PAGAR' : 'RECEBER'
  const { titulos } = criarTituloManual(infra, ator, {
    sentido,
    pessoaId: d.pessoaId,
    categoriaId: d.categoriaId,
    descricao: d.descricao || l.descricao,
    valor: Math.abs(l.valorCentavos) / 100,
    parcelas: 1,
    primeiroVencimento: l.data,
    competencia: l.data.slice(0, 7),
    documento: l.documento ?? '',
    quitado: true,
    contaFinanceiraId: l.contaFinanceiraId,
    forma: 'TRANSFERENCIA',
    dataQuitacao: l.data
  })
  const p = infra.bruto
    .prepare(
      `SELECT p.id FROM partida p JOIN lancamento la ON la.id = p.lancamento_id JOIN baixa b ON b.lancamento_id = la.id
       WHERE b.titulo_id = ? AND p.conta_financeira_id = ? AND p.conta_gerencial_id = ?`
    )
    .get(titulos[0], l.contaFinanceiraId, idConta(infra, CONTAS.DISPONIBILIDADES)) as { id: number }
  conciliar(infra, ator, l.contaFinanceiraId, linhaId, p.id)
}

/** Confronto do saldo do sistema com o último saldo informado pelo banco. */
export function resumoConciliacao(infra: Infra, ator: Ator, contaId: number): ResumoConciliacao {
  exigir(ator, 'financeiro.ver')
  const imps = infra.db.select().from(extratoImportacao).where(eq(extratoImportacao.contaFinanceiraId, contaId)).all()
  const comSaldo = imps.filter((i) => i.saldoFinalCentavos != null && i.dataSaldoFinal).sort((a, b) => (b.dataSaldoFinal! > a.dataSaldoFinal! ? 1 : -1))[0]
  const naData = comSaldo ? saldoContaFinanceira(infra, contaId, comSaldo.dataSaldoFinal!) : null
  return {
    saldoSistemaCentavos: saldoContaFinanceira(infra, contaId),
    ultimoExtrato: comSaldo ? { arquivo: comSaldo.arquivo, data: comSaldo.dataSaldoFinal, saldoCentavos: comSaldo.saldoFinalCentavos } : null,
    saldoSistemaNaDataCentavos: naData,
    diferencaCentavos: comSaldo && naData != null ? comSaldo.saldoFinalCentavos! - naData : null,
    linhasPendentes: infra.db.select().from(extratoLinha).where(and(eq(extratoLinha.contaFinanceiraId, contaId), eq(extratoLinha.situacao, 'PENDENTE'))).all().length,
    movimentosPendentes: movimentosPendentes(infra, contaId).length,
    importacoes: imps
      .sort((a, b) => b.id - a.id)
      .map((i) => ({ id: i.id, arquivo: i.arquivo, formato: i.formato, periodo: `${i.periodoInicio ?? '?'} a ${i.periodoFim ?? '?'}`, lidas: i.linhasLidas, novas: i.linhasNovas, importadoEm: i.importadoEm }))
  }
}
