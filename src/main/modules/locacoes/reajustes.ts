// Reajuste anual pelo índice contratual — sempre confirmado por um usuário (Q13).
import { and, eq, isNotNull, lte } from 'drizzle-orm'
import type { ReajustePendente } from '@shared/dto-financeiro'
import { erro } from '@shared/erros'
import { acumularVariacoes, aplicarReajuste, competenciasDoReajuste } from '@shared/financeiro/calculos'
import { adicionarDias, adicionarMesesData, competenciaDe, formatarData, hojeIso } from '@shared/financeiro/datas'
import { aluguelVigencia, contratoLocacao, indiceEconomico, reajuste } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'
import { variacoesIndice } from '../financeiro/cadastros'
import { aluguelVigente, listarContratos, ultimaCompetenciaGerada } from './contratos'
import { adicionarMeses } from '@shared/financeiro/datas'

function calcular(infra: Infra, c: typeof contratoLocacao.$inferSelect): ReajustePendente {
  const resumo = listarContratos(infra, { id: null, login: 'sistema' }, {}).find((x) => x.id === c.id)!
  const comps = competenciasDoReajuste(c.proximoReajuste!, c.periodicidadeReajusteMeses)
  const valorAtual = aluguelVigente(infra, c.id, adicionarMeses(competenciaDe(c.proximoReajuste!), -1))
  const sigla = c.indiceId ? (infra.db.select({ s: indiceEconomico.sigla }).from(indiceEconomico).where(eq(indiceEconomico.id, c.indiceId)).get()?.s ?? null) : null
  const valores = c.indiceId ? variacoesIndice(infra, c.indiceId, comps) : new Map<string, number>()
  const faltantes = comps.filter((x) => !valores.has(x))
  let acumulado: number | null = null
  let aplicado: number | null = null
  let novo: number | null = null
  if (!faltantes.length) {
    acumulado = acumularVariacoes(comps.map((x) => valores.get(x)!))
    const r = aplicarReajuste(valorAtual, acumulado, c.reajusteNegativo)
    aplicado = r.aplicadoPpm
    novo = r.novoValor
  }
  return {
    contratoId: c.id,
    contratoNumero: c.numero,
    locatario: resumo.locatario,
    imovel: resumo.imovelEndereco,
    dataBase: c.proximoReajuste!,
    indiceSigla: sigla,
    valorAtualCentavos: valorAtual,
    competencias: comps,
    faltantes,
    acumuladoPpm: acumulado,
    aplicadoPpm: aplicado,
    novoValorCentavos: novo
  }
}

/** Contratos com aniversário de reajuste até a data informada (padrão: próximos 45 dias). */
export function reajustesPendentes(infra: Infra, ator: Ator, ate?: string): ReajustePendente[] {
  exigir(ator, 'locacoes.ver')
  const limite = ate ?? adicionarDias(hojeIso(infra.agora()), 45)
  return infra.db
    .select()
    .from(contratoLocacao)
    .where(and(eq(contratoLocacao.situacao, 'ATIVO'), isNotNull(contratoLocacao.proximoReajuste), lte(contratoLocacao.proximoReajuste, limite)))
    .all()
    .map((c) => calcular(infra, c))
}

function validarVigencia(infra: Infra, c: typeof contratoLocacao.$inferSelect) {
  const comp = competenciaDe(c.proximoReajuste!)
  const ultima = ultimaCompetenciaGerada(infra, c.id)
  if (ultima && ultima >= comp) throw erro.regra(`A cobrança de ${comp} já foi gerada com o valor antigo. Cancele-a antes de reajustar.`)
  return comp
}

export function aplicarReajusteContrato(infra: Infra, ator: Ator, contratoId: number): ReajustePendente {
  exigir(ator, 'locacoes.reajustar')
  return infra.bruto.transaction(() => {
    const c = infra.db.select().from(contratoLocacao).where(eq(contratoLocacao.id, contratoId)).get()
    if (!c || c.situacao !== 'ATIVO' || !c.proximoReajuste) throw erro.regra('Contrato sem reajuste pendente.')
    if (!c.indiceId) throw erro.regra('Contrato sem índice de reajuste.')
    const calc = calcular(infra, c)
    if (calc.faltantes.length) throw erro.regra(`Índice ${calc.indiceSigla} sem valores para: ${calc.faltantes.join(', ')}. Cadastre-os em Índices.`)
    const comp = validarVigencia(infra, c)
    const ts = agoraIso(infra)
    const { id } = infra.db
      .insert(reajuste)
      .values({
        contratoId: c.id,
        dataBase: c.proximoReajuste,
        indiceId: c.indiceId,
        competenciaInicial: calc.competencias[0],
        competenciaFinal: calc.competencias.at(-1),
        acumuladoPpm: calc.acumuladoPpm,
        aplicadoPpm: calc.aplicadoPpm!,
        valorAnteriorCentavos: calc.valorAtualCentavos,
        valorNovoCentavos: calc.novoValorCentavos!,
        situacao: 'APLICADO',
        criadoEm: ts,
        criadoPor: ator.id
      })
      .returning({ id: reajuste.id })
      .get()
    infra.db.insert(aluguelVigencia).values({ contratoId: c.id, competencia: comp, valorCentavos: calc.novoValorCentavos!, origem: 'REAJUSTE', origemId: id, criadoEm: ts, criadoPor: ator.id }).run()
    infra.db
      .update(contratoLocacao)
      .set({ aluguelCentavos: calc.novoValorCentavos!, proximoReajuste: adicionarMesesData(c.proximoReajuste, c.periodicidadeReajusteMeses), atualizadoPor: ator.id, atualizadoEm: ts })
      .where(eq(contratoLocacao.id, c.id))
      .run()
    auditar(infra, ator, {
      acao: 'REAJUSTE_APLICADO',
      entidade: 'contrato',
      entidadeId: c.id,
      descricao: `Contrato nº ${c.numero}: ${calc.indiceSigla} acumulado ${((calc.acumuladoPpm ?? 0) / 10_000).toFixed(4)}% (aplicado ${((calc.aplicadoPpm ?? 0) / 10_000).toFixed(4)}%); ${(calc.valorAtualCentavos / 100).toFixed(2)} → ${(calc.novoValorCentavos! / 100).toFixed(2)} a partir de ${comp}`
    })
    return calc
  })()
}

export function dispensarReajuste(infra: Infra, ator: Ator, contratoId: number, motivo: string): void {
  exigir(ator, 'locacoes.reajustar')
  if (!motivo || motivo.trim().length < 5) throw erro.validacao('Informe o motivo (ex.: acordo com o proprietário).')
  infra.bruto.transaction(() => {
    const c = infra.db.select().from(contratoLocacao).where(eq(contratoLocacao.id, contratoId)).get()
    if (!c || c.situacao !== 'ATIVO' || !c.proximoReajuste) throw erro.regra('Contrato sem reajuste pendente.')
    const valor = aluguelVigente(infra, c.id, competenciaDe(c.proximoReajuste))
    infra.db
      .insert(reajuste)
      .values({ contratoId: c.id, dataBase: c.proximoReajuste, indiceId: c.indiceId, aplicadoPpm: 0, valorAnteriorCentavos: valor, valorNovoCentavos: valor, situacao: 'DISPENSADO', motivo: motivo.trim(), criadoEm: agoraIso(infra), criadoPor: ator.id })
      .run()
    infra.db.update(contratoLocacao).set({ proximoReajuste: adicionarMesesData(c.proximoReajuste, c.periodicidadeReajusteMeses) }).where(eq(contratoLocacao.id, c.id)).run()
    auditar(infra, ator, { acao: 'REAJUSTE_DISPENSADO', entidade: 'contrato', entidadeId: c.id, descricao: `Contrato nº ${c.numero}, base ${formatarData(c.proximoReajuste)} — motivo: ${motivo.trim()}` })
  })()
}

export function historicoReajustes(infra: Infra, ator: Ator, contratoId: number) {
  exigir(ator, 'locacoes.ver')
  return infra.db.select().from(reajuste).where(eq(reajuste.contratoId, contratoId)).all()
}

export { aluguelVigencia }
