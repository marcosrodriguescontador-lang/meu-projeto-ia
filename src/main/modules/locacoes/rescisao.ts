// Rescisão do contrato: aluguel proporcional, multa rescisória (art. 4º), devolução de caução e liberação do imóvel.
import { and, eq } from 'drizzle-orm'
import type { MemoriaRescisao } from '@shared/dto-financeiro'
import { erro } from '@shared/erros'
import { proximoDiaUtil } from '@shared/financeiro/calendario'
import { diasOcupados, multaRescisoria, valorProporcional } from '@shared/financeiro/calculos'
import { adicionarDias, adicionarMeses, competenciaDe, formatarCompetencia, formatarData, hojeIso } from '@shared/financeiro/datas'
import { rescisaoSchema, type RescisaoInput } from '@shared/schemas-locacao'
import { contratoLancamento, contratoLocacao, imovelOferta, ofertaSituacaoHist, rescisao, titulo } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'
import { feriadosLocais } from '../financeiro/cadastros'
import { CONTAS, idConta } from '../financeiro/razao'
import { gerarRepasse } from '../financeiro/repasses'
import { baixasAtivas, cancelarTitulo, criarTitulo, type ItemNovo } from '../financeiro/titulos'
import { chaveCobranca, montarCobranca } from './cobrancas'
import { aluguelVigente, locatarioPrincipal, obterContratoBruto, ultimaCompetenciaGerada } from './contratos'

function saldoCaucao(infra: Infra, contratoId: number, locatarioId: number): number {
  const r = infra.bruto
    .prepare(`SELECT coalesce(sum(credito_centavos - debito_centavos), 0) s FROM partida WHERE conta_gerencial_id = ? AND pessoa_id = ? AND contrato_id = ? AND repasse_id IS NULL`)
    .get(idConta(infra, CONTAS.CAUCOES), locatarioId, contratoId) as { s: number }
  return r.s
}

export function simularRescisao(infra: Infra, ator: Ator, contratoId: number, dataEntrega: string): MemoriaRescisao {
  exigir(ator, 'locacoes.ver')
  const c = obterContratoBruto(infra, contratoId)
  const comp = competenciaDe(dataEntrega)
  const aluguel = aluguelVigente(infra, c.id, comp < competenciaDe(c.dataInicio) ? competenciaDe(c.dataInicio) : comp)
  const m = multaRescisoria({ aluguel, quantidadeAlugueis: c.multaRescisoriaAlugueis, dataInicio: c.dataInicio, dataFim: c.dataFim, dataEntrega })
  const d = diasOcupados({ dataInicio: c.dataInicio, dataFimOcupacao: dataEntrega }, comp)
  const abertos = (infra.bruto.prepare(`SELECT count(*) n FROM titulo WHERE contrato_id = ? AND sentido = 'RECEBER' AND situacao IN ('ABERTO','PARCIAL')`).get(c.id) as { n: number }).n
  return {
    multaCalculadaCentavos: m.valor,
    diasTotais: m.diasTotais,
    diasRestantes: m.diasRestantes,
    memoria: m.memoria,
    aluguelProporcionalCentavos: valorProporcional(aluguel, d.dias, d.diasMes),
    competenciaFinal: comp,
    saldoCaucaoCentavos: saldoCaucao(infra, c.id, locatarioPrincipal(infra, c.id)),
    titulosEmAberto: abertos
  }
}

export function rescindir(infra: Infra, ator: Ator, entrada: RescisaoInput): { tituloRescisaoId: number | null; repasseCaucaoId: number | null } {
  exigir(ator, 'locacoes.rescindir')
  const d = rescisaoSchema.parse(entrada)
  if (d.dataEntregaChaves > hojeIso(infra.agora())) throw erro.validacao('Informe a data efetiva de entrega das chaves (não pode ser futura).')
  return infra.bruto.transaction(() => {
    const c = obterContratoBruto(infra, d.contratoId)
    if (c.situacao !== 'ATIVO') throw erro.regra('Somente contratos ativos podem ser rescindidos.')
    if (d.dataEntregaChaves < c.dataInicio) throw erro.validacao('Entrega anterior ao início do contrato.')
    const compFinal = competenciaDe(d.dataEntregaChaves)
    const ultima = ultimaCompetenciaGerada(infra, c.id)
    const anterior = adicionarMeses(compFinal, -1)
    if (compFinal > competenciaDe(c.dataInicio) && (!ultima || ultima < anterior)) throw erro.regra(`Gere as cobranças até ${formatarCompetencia(anterior)} antes de rescindir.`)
    if (ultima && ultima > compFinal) throw erro.regra(`Há cobranças geradas após a entrega (${formatarCompetencia(ultima)}). Cancele-as antes.`)

    const sim = simularRescisao(infra, ator, c.id, d.dataEntregaChaves)
    const locatario = locatarioPrincipal(infra, c.id)
    const extras: ItemNovo[] = []

    // Cobrança da competência final, proporcional até a entrega.
    const existente = infra.db.select().from(titulo).where(eq(titulo.chaveIdempotencia, chaveCobranca(c.id, compFinal))).get()
    const proRata = montarCobranca(infra, c, compFinal, d.dataEntregaChaves)
    if (existente && baixasAtivas(infra, existente.id) === 0) cancelarTitulo(infra, ator, existente.id, `Substituída pela cobrança proporcional da rescisão`, true)
    if (existente && baixasAtivas(infra, existente.id) > 0) {
      const aluguelCheio = aluguelVigente(infra, c.id, compFinal)
      const diferenca = aluguelCheio - sim.aluguelProporcionalCentavos
      if (diferenca > 0) extras.push({ tipo: 'CREDITO', descricao: `Devolução proporcional do aluguel de ${formatarCompetencia(compFinal)}`, valor: -diferenca, destino: 'PROPRIETARIO' })
    } else if (proRata) {
      criarTitulo(infra, ator, {
        sentido: 'RECEBER',
        origem: 'COBRANCA_LOCACAO',
        contratoId: c.id,
        pessoaId: locatario,
        descricao: `Aluguel ${formatarCompetencia(compFinal)} (proporcional) — contrato nº ${c.numero}`,
        competencia: compFinal,
        emissao: hojeIso(infra.agora()),
        vencimentoOriginal: proRata.vencimentoOriginal,
        vencimento: proRata.vencimento,
        recurso: 'TERCEIROS',
        multaBp: c.multaAtrasoBp,
        jurosMesBp: c.jurosMesBp,
        destinoEncargos: c.destinoEncargos,
        chave: chaveCobranca(c.id, compFinal),
        itens: proRata.itens
      })
      for (const a of proRata.avulsos) infra.db.update(contratoLancamento).set({ situacao: 'INCLUIDO' }).where(eq(contratoLancamento.id, a)).run()
    }

    // Avulsos ainda pendentes (competências futuras) entram no título da rescisão.
    const pendentes = infra.db.select().from(contratoLancamento).where(and(eq(contratoLancamento.contratoId, c.id), eq(contratoLancamento.situacao, 'PENDENTE'), eq(contratoLancamento.pagador, 'LOCATARIO'))).all()
    for (const a of pendentes)
      extras.push({ tipo: a.valorCentavos < 0 ? 'CREDITO' : 'AVULSO', descricao: a.descricao, valor: a.valorCentavos, destino: a.destino, beneficiarioId: a.beneficiarioId, contaGerencialId: a.destino === 'IMOBILIARIA' ? idConta(infra, CONTAS.RECEITA_OUTRAS) : null, lancamentoAvulsoId: a.id })

    const multa = d.cobrarMulta ? sim.multaCalculadaCentavos : 0
    if (multa > 0) extras.push({ tipo: 'MULTA_RESCISORIA', descricao: `Multa rescisória proporcional (${sim.memoria})`.slice(0, 300), valor: multa, destino: 'PROPRIETARIO' })

    let tituloRescisaoId: number | null = null
    const total = extras.reduce((s, i) => s + i.valor, 0)
    if (extras.length && total <= 0) throw erro.regra('Os créditos ao locatário superam os débitos da rescisão. Ajuste os lançamentos avulsos antes de rescindir.')
    if (extras.length) {
      const venc = adicionarDias(d.dataEntregaChaves, 10)
      tituloRescisaoId = criarTitulo(infra, ator, {
        sentido: 'RECEBER',
        origem: 'RESCISAO',
        contratoId: c.id,
        pessoaId: locatario,
        descricao: `Rescisão — contrato nº ${c.numero}`,
        emissao: hojeIso(infra.agora()),
        vencimentoOriginal: venc,
        vencimento: proximoDiaUtil(venc, feriadosLocais(infra)),
        recurso: 'TERCEIROS',
        multaBp: c.multaAtrasoBp,
        jurosMesBp: c.jurosMesBp,
        destinoEncargos: c.destinoEncargos,
        chave: `LOC:${c.id}:RESCISAO`,
        itens: extras
      })
      for (const a of pendentes) infra.db.update(contratoLancamento).set({ situacao: 'INCLUIDO', tituloId: tituloRescisaoId }).where(eq(contratoLancamento.id, a.id)).run()
    }

    // Devolução da caução (título a pagar ao locatário).
    let repasseCaucaoId: number | null = null
    if (saldoCaucao(infra, c.id, locatario) > 0)
      repasseCaucaoId = gerarRepasse(infra, ator, { tipo: 'CAUCAO', pessoaId: locatario, vencimento: proximoDiaUtil(adicionarDias(d.dataEntregaChaves, 30), feriadosLocais(infra)), contratoId: c.id }, true).id

    const ts = agoraIso(infra)
    infra.db
      .insert(rescisao)
      .values({
        contratoId: c.id,
        dataEntregaChaves: d.dataEntregaChaves,
        iniciativa: d.iniciativa,
        motivo: d.motivo,
        multaCalculadaCentavos: sim.multaCalculadaCentavos,
        multaCobradaCentavos: multa,
        dispensaMotivo: d.cobrarMulta ? null : d.dispensaMotivo,
        memoria: JSON.stringify(sim),
        criadoEm: ts,
        criadoPor: ator.id
      })
      .run()
    infra.db.update(contratoLocacao).set({ situacao: 'RESCINDIDO', encerradoEm: d.dataEntregaChaves, proximoReajuste: null, atualizadoPor: ator.id, atualizadoEm: ts }).where(eq(contratoLocacao.id, c.id)).run()
    const oferta = infra.db.select().from(imovelOferta).where(and(eq(imovelOferta.imovelId, c.imovelId), eq(imovelOferta.modalidade, 'LOCACAO'))).get()
    if (oferta && oferta.situacao === 'ALUGADO') {
      infra.db.insert(ofertaSituacaoHist).values({ ofertaId: oferta.id, de: 'ALUGADO', para: 'DISPONIVEL', motivo: `Rescisão do contrato nº ${c.numero} (entrega em ${formatarData(d.dataEntregaChaves)})`, usuarioId: ator.id, ts }).run()
      infra.db.update(imovelOferta).set({ situacao: 'DISPONIVEL', situacaoDesde: ts }).where(eq(imovelOferta.id, oferta.id)).run()
    }
    auditar(infra, ator, {
      acao: 'CONTRATO_RESCINDIDO',
      entidade: 'contrato',
      entidadeId: c.id,
      descricao: `Contrato nº ${c.numero}: entrega ${formatarData(d.dataEntregaChaves)}, multa ${(multa / 100).toFixed(2)}${d.cobrarMulta ? '' : ` (dispensada: ${d.dispensaMotivo})`} — ${d.motivo}`
    })
    return { tituloRescisaoId, repasseCaucaoId }
  })()
}
