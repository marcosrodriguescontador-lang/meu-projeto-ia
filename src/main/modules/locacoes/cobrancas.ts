// Geração mensal das cobranças de aluguel (idempotente: uma por contrato e competência).
import { and, eq, lte } from 'drizzle-orm'
import type { PreviaCobranca } from '@shared/dto-financeiro'
import { erro } from '@shared/erros'
import { proximoDiaUtil } from '@shared/financeiro/calendario'
import { diasOcupados, valorProporcional, vencimentoDaCompetencia } from '@shared/financeiro/calculos'
import { competenciaDe, formatarCompetencia, formatarData, hojeIso, ultimoDia, validarCompetencia } from '@shared/financeiro/datas'
import { TIPOS_ENCARGO } from '@shared/schemas-locacao'
import { contratoLancamento, contratoLocacao, pessoa, titulo } from '../../infra/db/schema'
import { exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'
import { feriadosLocais } from '../financeiro/cadastros'
import { CONTAS, idConta } from '../financeiro/razao'
import { criarTitulo, type ItemNovo } from '../financeiro/titulos'
import { aluguelVigente, encargosDo, locatarioPrincipal } from './contratos'

type Contrato = typeof contratoLocacao.$inferSelect

export const chaveCobranca = (contratoId: number, competencia: string) => `LOC:${contratoId}:${competencia}:COBRANCA`

export interface CobrancaMontada {
  competencia: string
  vencimentoOriginal: string
  vencimento: string
  itens: ItemNovo[]
  avulsos: number[]
}

/** Monta os itens da cobrança de uma competência (sem gravar). `dataFimOcupacao` é usado na rescisão. */
export function montarCobranca(infra: Infra, c: Contrato, competencia: string, dataFimOcupacao: string | null = null): CobrancaMontada | null {
  const { dias, diasMes } = diasOcupados({ dataInicio: c.dataInicio, dataFimOcupacao }, competencia)
  if (dias <= 0) return null
  const proRata = dias < diasMes
  const sufixo = proRata ? ` (${dias}/${diasMes} dias)` : ''
  const itens: ItemNovo[] = []
  const primeira = competencia === competenciaDe(c.dataInicio)
  const intermediacao = primeira && c.taxaIntermediacaoBp > 0
  itens.push({
    tipo: 'ALUGUEL',
    descricao: `Aluguel ${formatarCompetencia(competencia)}${sufixo}`,
    valor: valorProporcional(aluguelVigente(infra, c.id, competencia), dias, diasMes),
    destino: 'PROPRIETARIO',
    taxaBp: intermediacao ? c.taxaIntermediacaoBp : c.taxaAdministracaoBp,
    taxaTipo: intermediacao ? 'INTERMEDIACAO' : c.taxaAdministracaoBp > 0 ? 'ADMINISTRACAO' : null
  })
  for (const e of encargosDo(infra, c.id)) {
    if (e.competenciaInicio > competencia || (e.competenciaFim && e.competenciaFim < competencia)) continue
    itens.push({
      tipo: e.tipo,
      descricao: `${e.descricao || TIPOS_ENCARGO[e.tipo as keyof typeof TIPOS_ENCARGO]} ${formatarCompetencia(competencia)}${e.proporcional ? sufixo : ''}`,
      valor: e.proporcional ? valorProporcional(e.valorCentavos, dias, diasMes) : e.valorCentavos,
      destino: e.destino,
      beneficiarioId: e.destino === 'TERCEIRO' ? e.beneficiarioId : null,
      contaGerencialId: e.destino === 'IMOBILIARIA' ? idConta(infra, CONTAS.RECEITA_OUTRAS) : null
    })
  }
  const avulsos = infra.db
    .select()
    .from(contratoLancamento)
    .where(and(eq(contratoLancamento.contratoId, c.id), eq(contratoLancamento.situacao, 'PENDENTE'), eq(contratoLancamento.pagador, 'LOCATARIO'), lte(contratoLancamento.competencia, competencia)))
    .all()
  for (const a of avulsos)
    itens.push({
      tipo: a.valorCentavos < 0 ? 'CREDITO' : 'AVULSO',
      descricao: a.descricao,
      valor: a.valorCentavos,
      destino: a.destino,
      beneficiarioId: a.destino === 'TERCEIRO' ? a.beneficiarioId : null,
      contaGerencialId: a.destino === 'IMOBILIARIA' ? idConta(infra, CONTAS.RECEITA_OUTRAS) : null,
      lancamentoAvulsoId: a.id
    })
  const vencimentoOriginal = vencimentoDaCompetencia(competencia, c.diaVencimento)
  return { competencia, vencimentoOriginal, vencimento: proximoDiaUtil(vencimentoOriginal, feriadosLocais(infra)), itens, avulsos: avulsos.map((a) => a.id) }
}

function bloqueio(c: Contrato, competencia: string): string | undefined {
  if (c.proximoReajuste && competenciaDe(c.proximoReajuste) <= competencia) return `Reajuste pendente desde ${formatarData(c.proximoReajuste)}: aplique ou dispense antes de gerar.`
  return undefined
}

function elegiveis(infra: Infra, competencia: string, contratoIds?: number[]): Contrato[] {
  return infra.db
    .select()
    .from(contratoLocacao)
    .where(and(eq(contratoLocacao.situacao, 'ATIVO'), lte(contratoLocacao.dataInicio, ultimoDia(competencia))))
    .all()
    .filter((c) => !contratoIds?.length || contratoIds.includes(c.id))
}

export function previaCobrancas(infra: Infra, ator: Ator, competencia: string, contratoIds?: number[]): PreviaCobranca[] {
  exigir(ator, 'financeiro.ver')
  if (!validarCompetencia(competencia)) throw erro.validacao('Competência inválida.')
  const saida: PreviaCobranca[] = []
  for (const c of elegiveis(infra, competencia, contratoIds)) {
    const loc = infra.db.select({ nome: pessoa.nome }).from(pessoa).where(eq(pessoa.id, locatarioPrincipal(infra, c.id))).get()!.nome
    const base = { contratoId: c.id, contratoNumero: c.numero, locatario: loc, competencia }
    const existente = infra.db.select().from(titulo).where(eq(titulo.chaveIdempotencia, chaveCobranca(c.id, competencia))).get()
    if (existente) {
      saida.push({ ...base, vencimento: existente.vencimento, valorCentavos: existente.valorCentavos, itens: [], situacao: 'JA_GERADA' })
      continue
    }
    const motivo = bloqueio(c, competencia)
    const m = motivo ? null : montarCobranca(infra, c, competencia)
    if (!motivo && !m) continue
    saida.push({
      ...base,
      vencimento: m?.vencimento ?? '',
      valorCentavos: m ? m.itens.reduce((s, i) => s + i.valor, 0) : 0,
      itens: m ? m.itens.map((i) => ({ tipo: i.tipo, descricao: i.descricao, valorCentavos: i.valor })) : [],
      situacao: motivo ? 'BLOQUEADA' : 'GERAR',
      motivo
    })
  }
  return saida
}

/** Gera as cobranças da competência. Executar novamente não duplica (chave de idempotência). */
export function gerarCobrancas(infra: Infra, ator: Ator, competencia: string, contratoIds?: number[]): { geradas: number; jaGeradas: number; bloqueadas: { contrato: number; motivo: string }[]; valorCentavos: number } {
  exigir(ator, 'financeiro.gerar_cobrancas')
  if (!validarCompetencia(competencia)) throw erro.validacao('Competência inválida.')
  return infra.bruto.transaction(() => {
    let geradas = 0
    let jaGeradas = 0
    let valor = 0
    const bloqueadas: { contrato: number; motivo: string }[] = []
    for (const c of elegiveis(infra, competencia, contratoIds)) {
      if (infra.db.select({ id: titulo.id }).from(titulo).where(eq(titulo.chaveIdempotencia, chaveCobranca(c.id, competencia))).get()) {
        jaGeradas++
        continue
      }
      const motivo = bloqueio(c, competencia)
      if (motivo) {
        bloqueadas.push({ contrato: c.numero, motivo })
        continue
      }
      const m = montarCobranca(infra, c, competencia)
      if (!m) continue
      const id = criarTitulo(infra, ator, {
        sentido: 'RECEBER',
        origem: 'COBRANCA_LOCACAO',
        contratoId: c.id,
        pessoaId: locatarioPrincipal(infra, c.id),
        descricao: `Aluguel ${formatarCompetencia(competencia)} — contrato nº ${c.numero}`,
        competencia,
        emissao: hojeIso(infra.agora()),
        vencimentoOriginal: m.vencimentoOriginal,
        vencimento: m.vencimento,
        recurso: 'TERCEIROS',
        multaBp: c.multaAtrasoBp,
        jurosMesBp: c.jurosMesBp,
        destinoEncargos: c.destinoEncargos,
        chave: chaveCobranca(c.id, competencia),
        itens: m.itens
      })
      for (const a of m.avulsos) infra.db.update(contratoLancamento).set({ situacao: 'INCLUIDO', tituloId: id }).where(eq(contratoLancamento.id, a)).run()
      geradas++
      valor += m.itens.reduce((s, i) => s + i.valor, 0)
    }
    auditar(infra, ator, { acao: 'COBRANCAS_GERADAS', entidade: 'titulo', descricao: `Competência ${competencia}: ${geradas} gerada(s), ${jaGeradas} já existente(s), ${bloqueadas.length} bloqueada(s); total ${(valor / 100).toFixed(2)}` })
    return { geradas, jaGeradas, bloqueadas, valorCentavos: valor }
  })()
}
