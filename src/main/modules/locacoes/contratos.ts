// Contratos de locação: cadastro, ativação, encargos recorrentes, lançamentos avulsos e aditivos.
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm'
import type { ContratoDetalhe, ContratoResumo, EncargoDto, LancamentoAvulsoDto, ParteContratoDto } from '@shared/dto-financeiro'
import { erro } from '@shared/erros'
import { proximoDiaUtil } from '@shared/financeiro/calendario'
import { adicionarMesesData, competenciaDe, hojeIso } from '@shared/financeiro/datas'
import { aditivoSchema, contratoSchema, lancamentoAvulsoSchema, type AditivoInput, type ContratoDados, type ContratoInput, type LancamentoAvulsoInput } from '@shared/schemas-locacao'
import {
  aditivo,
  aluguelVigencia,
  contratoEncargo,
  contratoLancamento,
  contratoLocacao,
  contratoParte,
  imovel,
  imovelOferta,
  imovelProprietario,
  indiceEconomico,
  ofertaSituacaoHist,
  partida,
  pessoa,
  pessoaPapel,
  repasse,
  titulo
} from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { proximoNumero } from '../../nucleo/sequencia'
import { auditar, historicoEntidade } from '../seguranca/auditoria'
import { feriadosLocais } from '../financeiro/cadastros'
import { CONTAS, estornarLancamento, registrarLancamento, type PartidaNova } from '../financeiro/razao'
import { ratear } from '@shared/financeiro/calculos'
import { criarTitulo } from '../financeiro/titulos'

export function obterContratoBruto(infra: Infra, id: number) {
  const c = infra.db.select().from(contratoLocacao).where(eq(contratoLocacao.id, id)).get()
  if (!c) throw erro.naoEncontrado('Contrato')
  return c
}

function partesDo(infra: Infra, contratoId: number): ParteContratoDto[] {
  return infra.db
    .select({ pessoaId: contratoParte.pessoaId, nome: pessoa.nome, documento: pessoa.documento, papel: contratoParte.papel, percentualBp: contratoParte.percentualBp, principal: contratoParte.principal })
    .from(contratoParte)
    .innerJoin(pessoa, eq(pessoa.id, contratoParte.pessoaId))
    .where(eq(contratoParte.contratoId, contratoId))
    .orderBy(asc(contratoParte.papel), sql`${contratoParte.principal} DESC`, asc(pessoa.nome))
    .all()
}

export function locatarioPrincipal(infra: Infra, contratoId: number): number {
  const l = partesDo(infra, contratoId).filter((p) => p.papel === 'LOCATARIO')
  return (l.find((p) => p.principal) ?? l[0])!.pessoaId
}

export function encargosDo(infra: Infra, contratoId: number): EncargoDto[] {
  return infra.db
    .select({
      id: contratoEncargo.id,
      tipo: contratoEncargo.tipo,
      descricao: contratoEncargo.descricao,
      valorCentavos: contratoEncargo.valorCentavos,
      competenciaInicio: contratoEncargo.competenciaInicio,
      competenciaFim: contratoEncargo.competenciaFim,
      proporcional: contratoEncargo.proporcional,
      destino: contratoEncargo.destino,
      beneficiarioId: contratoEncargo.beneficiarioId,
      beneficiarioNome: pessoa.nome
    })
    .from(contratoEncargo)
    .leftJoin(pessoa, eq(pessoa.id, contratoEncargo.beneficiarioId))
    .where(and(eq(contratoEncargo.contratoId, contratoId), eq(contratoEncargo.ativo, true)))
    .orderBy(asc(contratoEncargo.id))
    .all()
}

export function vigencias(infra: Infra, contratoId: number) {
  return infra.db
    .select({ competencia: aluguelVigencia.competencia, valorCentavos: aluguelVigencia.valorCentavos, origem: aluguelVigencia.origem })
    .from(aluguelVigencia)
    .where(eq(aluguelVigencia.contratoId, contratoId))
    .orderBy(asc(aluguelVigencia.competencia))
    .all()
}

/** Valor do aluguel vigente na competência. */
export function aluguelVigente(infra: Infra, contratoId: number, competencia: string): number {
  const v = infra.db
    .select({ v: aluguelVigencia.valorCentavos })
    .from(aluguelVigencia)
    .where(and(eq(aluguelVigencia.contratoId, contratoId), lte(aluguelVigencia.competencia, competencia)))
    .orderBy(desc(aluguelVigencia.competencia))
    .limit(1)
    .get()
  if (!v) throw erro.regra('Contrato sem valor de aluguel vigente para a competência.')
  return v.v
}

export function ultimaCompetenciaGerada(infra: Infra, contratoId: number): string | null {
  const r = infra.bruto
    .prepare(`SELECT max(competencia) c FROM titulo WHERE contrato_id = ? AND origem = 'COBRANCA_LOCACAO' AND situacao <> 'CANCELADO'`)
    .get(contratoId) as { c: string | null }
  return r.c
}

function enderecoImovel(i: { logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string }) {
  return `${i.logradouro}, ${i.numero}${i.complemento ? ` — ${i.complemento}` : ''} · ${i.bairro}, ${i.cidade}`
}

export function obterContrato(infra: Infra, ator: Ator, id: number): ContratoDetalhe {
  exigir(ator, 'locacoes.ver')
  const c = obterContratoBruto(infra, id)
  const im = infra.db.select().from(imovel).where(eq(imovel.id, c.imovelId)).get()!
  const ind = c.indiceId ? infra.db.select().from(indiceEconomico).where(eq(indiceEconomico.id, c.indiceId)).get() : null
  return {
    id: c.id,
    numero: c.numero,
    situacao: c.situacao,
    tipo: c.tipo,
    imovel: { id: im.id, codigo: im.codigo, endereco: enderecoImovel(im) },
    partes: partesDo(infra, id),
    dataInicio: c.dataInicio,
    dataFim: c.dataFim,
    aluguelCentavos: c.aluguelCentavos,
    diaVencimento: c.diaVencimento,
    indiceId: c.indiceId,
    indiceSigla: ind?.sigla ?? null,
    periodicidadeReajusteMeses: c.periodicidadeReajusteMeses,
    proximoReajuste: c.proximoReajuste,
    reajusteNegativo: c.reajusteNegativo,
    taxaAdministracaoBp: c.taxaAdministracaoBp,
    taxaIntermediacaoBp: c.taxaIntermediacaoBp,
    multaAtrasoBp: c.multaAtrasoBp,
    jurosMesBp: c.jurosMesBp,
    destinoEncargos: c.destinoEncargos,
    multaRescisoriaAlugueis: c.multaRescisoriaAlugueis,
    garantiaTipo: c.garantiaTipo,
    garantiaValorCentavos: c.garantiaValorCentavos,
    garantiaSeguradora: c.garantiaSeguradora,
    garantiaApolice: c.garantiaApolice,
    garantiaVigenciaFim: c.garantiaVigenciaFim,
    observacoes: c.observacoes,
    encargos: encargosDo(infra, id),
    vigencias: vigencias(infra, id),
    ultimaCompetenciaGerada: ultimaCompetenciaGerada(infra, id),
    ativadoEm: c.ativadoEm,
    encerradoEm: c.encerradoEm,
    criadoEm: c.criadoEm,
    atualizadoEm: c.atualizadoEm
  }
}

export function listarContratos(infra: Infra, ator: Ator, f: { situacao?: string; busca?: string; vencendoDias?: number; imovelId?: number; pessoaId?: number } = {}): ContratoResumo[] {
  exigir(ator, 'locacoes.ver')
  const cond: string[] = []
  const p: unknown[] = []
  const hoje = hojeIso(infra.agora())
  if (f.situacao) (cond.push('c.situacao = ?'), p.push(f.situacao))
  if (f.imovelId) (cond.push('c.imovel_id = ?'), p.push(f.imovelId))
  if (f.pessoaId) (cond.push('EXISTS (SELECT 1 FROM contrato_parte cp WHERE cp.contrato_id = c.id AND cp.pessoa_id = ?)'), p.push(f.pessoaId))
  if (f.vencendoDias) (cond.push("c.situacao = 'ATIVO' AND c.data_fim BETWEEN ? AND date(?, '+' || ? || ' days')"), p.push(hoje, hoje, f.vencendoDias))
  if (f.busca) {
    const b = `%${f.busca.toLowerCase()}%`
    cond.push(`(CAST(c.numero AS TEXT) = ? OR CAST(i.codigo AS TEXT) = ? OR lower(i.logradouro) LIKE ? OR lower(i.bairro) LIKE ?
      OR EXISTS (SELECT 1 FROM contrato_parte cp JOIN pessoa pe ON pe.id = cp.pessoa_id WHERE cp.contrato_id = c.id AND lower(pe.nome) LIKE ?))`)
    p.push(f.busca.trim(), f.busca.trim(), b, b, b)
  }
  const linhas = infra.bruto
    .prepare(
      `SELECT c.id, c.numero, c.situacao, c.tipo, c.imovel_id imovelId, i.codigo imovelCodigo,
        i.logradouro || ', ' || i.numero || coalesce(' — ' || i.complemento, '') || ' · ' || i.bairro imovelEndereco,
        coalesce((SELECT pe.nome FROM contrato_parte cp JOIN pessoa pe ON pe.id = cp.pessoa_id WHERE cp.contrato_id = c.id AND cp.papel = 'LOCATARIO' ORDER BY cp.principal DESC LIMIT 1), '') locatario,
        coalesce((SELECT group_concat(pe.nome, ', ') FROM contrato_parte cp JOIN pessoa pe ON pe.id = cp.pessoa_id WHERE cp.contrato_id = c.id AND cp.papel = 'LOCADOR'), '') locadores,
        c.data_inicio dataInicio, c.data_fim dataFim, c.aluguel_centavos aluguelCentavos, c.dia_vencimento diaVencimento, c.proximo_reajuste proximoReajuste,
        (SELECT count(*) FROM titulo t WHERE t.contrato_id = c.id AND t.sentido = 'RECEBER' AND t.situacao IN ('ABERTO','PARCIAL') AND t.vencimento < ?) emAtraso
       FROM contrato_locacao c JOIN imovel i ON i.id = c.imovel_id ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
       ORDER BY CASE c.situacao WHEN 'ATIVO' THEN 0 WHEN 'RASCUNHO' THEN 1 ELSE 2 END, c.numero DESC`
    )
    .all(hoje, ...p) as ContratoResumo[]
  return linhas
}

// ───── Cadastro ─────

function pessoaAtiva(infra: Infra, id: number) {
  const p = infra.db.select({ id: pessoa.id, nome: pessoa.nome }).from(pessoa).where(and(eq(pessoa.id, id), isNull(pessoa.excluidoEm))).get()
  if (!p) throw erro.validacao('Pessoa não encontrada.')
  return p
}

function garantirPapel(infra: Infra, ator: Ator, pessoaId: number, papel: 'LOCATARIO' | 'FIADOR', contexto: string): void {
  const tem = infra.db.select({ p: pessoaPapel.papel }).from(pessoaPapel).where(and(eq(pessoaPapel.pessoaId, pessoaId), eq(pessoaPapel.papel, papel))).get()
  if (!tem) {
    infra.db.insert(pessoaPapel).values({ pessoaId, papel }).run()
    auditar(infra, ator, { acao: 'PAPEL_ADICIONADO', entidade: 'pessoa', entidadeId: pessoaId, descricao: `Papel ${papel === 'LOCATARIO' ? 'Locatário' : 'Fiador'} adicionado (${contexto})` })
  }
}

function proprietariosDoImovel(infra: Infra, imovelId: number) {
  return infra.db.select().from(imovelProprietario).where(eq(imovelProprietario.imovelId, imovelId)).all()
}

function validarCadastro(infra: Infra, d: ContratoDados, id: number | null): void {
  const im = infra.db.select().from(imovel).where(and(eq(imovel.id, d.imovelId), isNull(imovel.excluidoEm))).get()
  if (!im) throw erro.validacao('Imóvel não encontrado.', { imovelId: 'Imóvel não encontrado' })
  const oferta = infra.db.select().from(imovelOferta).where(and(eq(imovelOferta.imovelId, d.imovelId), eq(imovelOferta.modalidade, 'LOCACAO'))).get()
  if (!oferta) throw erro.regra('O imóvel não possui oferta de locação cadastrada.')
  const donos = proprietariosDoImovel(infra, d.imovelId)
  if (!donos.length) throw erro.regra('O imóvel não possui proprietários cadastrados.')
  for (const l of d.locatarios) {
    pessoaAtiva(infra, l.pessoaId)
    if (donos.some((o) => o.pessoaId === l.pessoaId)) throw erro.validacao('O proprietário não pode ser locatário do próprio imóvel.', { locatarios: 'Locatário é proprietário' })
  }
  for (const f of d.fiadores) pessoaAtiva(infra, f)
  for (const e of d.encargos) if (e.beneficiarioId) pessoaAtiva(infra, e.beneficiarioId)
  const outro = infra.db
    .select({ numero: contratoLocacao.numero })
    .from(contratoLocacao)
    .where(and(eq(contratoLocacao.imovelId, d.imovelId), eq(contratoLocacao.situacao, 'ATIVO'), id ? ne(contratoLocacao.id, id) : undefined))
    .get()
  if (outro) throw erro.regra(`O imóvel já possui o contrato ativo nº ${outro.numero}.`)
}

function gravarPartes(infra: Infra, contratoId: number, d: ContratoDados): void {
  infra.db.delete(contratoParte).where(eq(contratoParte.contratoId, contratoId)).run()
  const donos = proprietariosDoImovel(infra, d.imovelId)
  const principalLoc = d.locatarios.findIndex((l) => l.principal)
  infra.db
    .insert(contratoParte)
    .values([
      ...donos.map((o) => ({ contratoId, pessoaId: o.pessoaId, papel: 'LOCADOR' as const, percentualBp: o.percentualBp, principal: o.principal })),
      ...d.locatarios.map((l, i) => ({ contratoId, pessoaId: l.pessoaId, papel: 'LOCATARIO' as const, percentualBp: 0, principal: principalLoc === -1 ? i === 0 : i === principalLoc })),
      ...d.fiadores.map((f) => ({ contratoId, pessoaId: f, papel: 'FIADOR' as const, percentualBp: 0, principal: false }))
    ])
    .run()
}

function gravarEncargos(infra: Infra, ator: Ator, contratoId: number, d: ContratoDados): void {
  infra.db.update(contratoEncargo).set({ ativo: false, atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) }).where(eq(contratoEncargo.contratoId, contratoId)).run()
  if (d.encargos.length)
    infra.db
      .insert(contratoEncargo)
      .values(
        d.encargos.map((e) => ({
          contratoId,
          tipo: e.tipo,
          descricao: e.descricao,
          valorCentavos: e.valor!,
          competenciaInicio: e.competenciaInicio,
          competenciaFim: e.competenciaFim,
          proporcional: e.proporcional,
          destino: e.destino,
          beneficiarioId: e.destino === 'TERCEIRO' ? e.beneficiarioId : null,
          criadoPor: ator.id,
          atualizadoPor: ator.id
        }))
      )
      .run()
}

const colunas = (d: ContratoDados) => ({
  imovelId: d.imovelId,
  tipo: d.tipo,
  dataInicio: d.dataInicio,
  dataFim: d.dataFim,
  aluguelCentavos: d.aluguel!,
  diaVencimento: d.diaVencimento,
  indiceId: d.indiceId,
  periodicidadeReajusteMeses: d.periodicidadeReajusteMeses,
  reajusteNegativo: d.reajusteNegativo,
  taxaAdministracaoBp: d.taxaAdministracao,
  taxaIntermediacaoBp: d.taxaIntermediacao,
  multaAtrasoBp: d.multaAtraso,
  jurosMesBp: d.jurosMes,
  destinoEncargos: d.destinoEncargos,
  multaRescisoriaAlugueis: d.multaRescisoriaAlugueis,
  garantiaTipo: d.garantiaTipo,
  garantiaValorCentavos: d.garantiaValor,
  garantiaSeguradora: d.garantiaSeguradora,
  garantiaApolice: d.garantiaApolice,
  garantiaVigenciaFim: d.garantiaVigenciaFim,
  observacoes: d.observacoes
})

/** Campos alteráveis após a ativação (valores e datas mudam apenas por reajuste, aditivo ou rescisão). */
const colunasOperacionais = (d: ContratoDados) => ({
  diaVencimento: d.diaVencimento,
  indiceId: d.indiceId,
  periodicidadeReajusteMeses: d.periodicidadeReajusteMeses,
  reajusteNegativo: d.reajusteNegativo,
  taxaAdministracaoBp: d.taxaAdministracao,
  multaAtrasoBp: d.multaAtraso,
  jurosMesBp: d.jurosMes,
  destinoEncargos: d.destinoEncargos,
  multaRescisoriaAlugueis: d.multaRescisoriaAlugueis,
  garantiaSeguradora: d.garantiaSeguradora,
  garantiaApolice: d.garantiaApolice,
  garantiaVigenciaFim: d.garantiaVigenciaFim,
  observacoes: d.observacoes
})

export function salvarContrato(infra: Infra, ator: Ator, id: number | null, entrada: ContratoInput): { id: number } {
  exigir(ator, 'locacoes.gerenciar')
  const d = contratoSchema.parse(entrada)
  return infra.bruto.transaction(() => {
    if (!id) {
      validarCadastro(infra, d, null)
      const { id: novo } = infra.db
        .insert(contratoLocacao)
        .values({ ...colunas(d), numero: proximoNumero(infra.db, 'contrato'), situacao: 'RASCUNHO', criadoPor: ator.id, atualizadoPor: ator.id })
        .returning({ id: contratoLocacao.id })
        .get()
      gravarPartes(infra, novo, d)
      gravarEncargos(infra, ator, novo, d)
      auditar(infra, ator, { acao: 'CONTRATO_CRIADO', entidade: 'contrato', entidadeId: novo, depois: d })
      return { id: novo }
    }
    const atual = obterContratoBruto(infra, id)
    const antes = obterContrato(infra, ator, id)
    if (atual.situacao === 'RASCUNHO') {
      validarCadastro(infra, d, id)
      infra.db.update(contratoLocacao).set({ ...colunas(d), atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) }).where(eq(contratoLocacao.id, id)).run()
      gravarPartes(infra, id, d)
    } else if (atual.situacao === 'ATIVO') {
      if (d.imovelId !== atual.imovelId || d.dataInicio !== atual.dataInicio || d.dataFim !== atual.dataFim || d.aluguel !== atual.aluguelCentavos || d.garantiaTipo !== atual.garantiaTipo || d.tipo !== atual.tipo)
        throw erro.regra('Contrato ativo: imóvel, tipo, datas, aluguel e garantia mudam somente por aditivo, reajuste ou rescisão.')
      const locAtuais = antes.partes.filter((p) => p.papel === 'LOCATARIO').map((p) => p.pessoaId).sort()
      if (JSON.stringify(locAtuais) !== JSON.stringify(d.locatarios.map((l) => l.pessoaId).sort())) throw erro.regra('Contrato ativo: a troca de locatários exige aditivo e novo contrato.')
      infra.db.update(contratoLocacao).set({ ...colunasOperacionais(d), atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) }).where(eq(contratoLocacao.id, id)).run()
      infra.db.delete(contratoParte).where(and(eq(contratoParte.contratoId, id), eq(contratoParte.papel, 'FIADOR'))).run()
      if (d.fiadores.length) infra.db.insert(contratoParte).values(d.fiadores.map((f) => ({ contratoId: id, pessoaId: f, papel: 'FIADOR' as const }))).run()
      for (const f of d.fiadores) garantirPapel(infra, ator, f, 'FIADOR', `contrato nº ${atual.numero}`)
    } else throw erro.regra('Contrato encerrado não pode ser alterado.')
    gravarEncargos(infra, ator, id, d)
    auditar(infra, ator, { acao: 'CONTRATO_ALTERADO', entidade: 'contrato', entidadeId: id, descricao: `Contrato nº ${atual.numero}`, antes, depois: d })
    return { id }
  })()
}

/** Ativa o contrato: congela partes, marca o imóvel como alugado, define vigência e gera a cobrança da caução. */
export function ativarContrato(infra: Infra, ator: Ator, id: number): void {
  exigir(ator, 'locacoes.gerenciar')
  infra.bruto.transaction(() => {
    const c = obterContratoBruto(infra, id)
    if (c.situacao !== 'RASCUNHO') throw erro.regra('Somente contratos em rascunho podem ser ativados.')
    const det = obterContrato(infra, ator, id)
    validarCadastro(
      infra,
      { ...(contratoSchema.parse({ ...paraEntrada(det) }) as ContratoDados) },
      id
    )
    const locadores = det.partes.filter((p) => p.papel === 'LOCADOR')
    if (locadores.reduce((s, p) => s + p.percentualBp, 0) !== 10_000) throw erro.regra('Participação dos locadores não soma 100%.')
    // Locadores refletem os proprietários atuais do imóvel no momento da ativação.
    gravarPartes(infra, id, contratoSchema.parse(paraEntrada(det)) as ContratoDados)
    for (const p of det.partes) if (p.papel !== 'LOCADOR') garantirPapel(infra, ator, p.pessoaId, p.papel as 'LOCATARIO' | 'FIADOR', `contrato nº ${c.numero}`)

    const oferta = infra.db.select().from(imovelOferta).where(and(eq(imovelOferta.imovelId, c.imovelId), eq(imovelOferta.modalidade, 'LOCACAO'))).get()!
    if (['VENDIDO', 'INATIVO', 'INDISPONIVEL'].includes(oferta.situacao)) throw erro.regra(`A oferta de locação do imóvel está "${oferta.situacao.toLowerCase()}".`)
    const ts = agoraIso(infra)
    if (oferta.situacao !== 'ALUGADO') {
      infra.db.insert(ofertaSituacaoHist).values({ ofertaId: oferta.id, de: oferta.situacao, para: 'ALUGADO', motivo: `Contrato de locação nº ${c.numero} ativado`, usuarioId: ator.id, ts }).run()
      infra.db.update(imovelOferta).set({ situacao: 'ALUGADO', situacaoDesde: ts }).where(eq(imovelOferta.id, oferta.id)).run()
    }
    infra.db.insert(aluguelVigencia).values({ contratoId: id, competencia: competenciaDe(c.dataInicio), valorCentavos: c.aluguelCentavos, origem: 'CONTRATO', criadoEm: ts, criadoPor: ator.id }).run()
    infra.db
      .update(contratoLocacao)
      .set({ situacao: 'ATIVO', ativadoEm: ts, proximoReajuste: c.indiceId ? adicionarMesesData(c.dataInicio, c.periodicidadeReajusteMeses) : null, atualizadoPor: ator.id, atualizadoEm: ts })
      .where(eq(contratoLocacao.id, id))
      .run()
    if (c.garantiaTipo === 'CAUCAO' && c.garantiaValorCentavos) {
      const venc = proximoDiaUtil(c.dataInicio, feriadosLocais(infra))
      criarTitulo(infra, ator, {
        sentido: 'RECEBER',
        origem: 'CAUCAO',
        contratoId: id,
        pessoaId: locatarioPrincipal(infra, id),
        descricao: `Caução — contrato nº ${c.numero}`,
        emissao: hojeIso(infra.agora()),
        vencimentoOriginal: c.dataInicio,
        vencimento: venc,
        recurso: 'TERCEIROS',
        chave: `LOC:${id}:CAUCAO`,
        itens: [{ tipo: 'CAUCAO', descricao: 'Caução (garantia locatícia)', valor: c.garantiaValorCentavos, destino: 'CAUCAO' }]
      })
    }
    auditar(infra, ator, { acao: 'CONTRATO_ATIVADO', entidade: 'contrato', entidadeId: id, descricao: `Contrato nº ${c.numero} ativado; imóvel marcado como alugado` })
  })()
}

/** Converte o detalhe em entrada de formulário (reaproveita a validação do schema). */
export function paraEntrada(d: ContratoDetalhe): ContratoInput {
  const pct = (bp: number) => String(bp / 100)
  return {
    imovelId: d.imovel.id,
    tipo: d.tipo as 'RESIDENCIAL',
    locatarios: d.partes.filter((p) => p.papel === 'LOCATARIO').map((p) => ({ pessoaId: p.pessoaId, principal: p.principal })),
    fiadores: d.partes.filter((p) => p.papel === 'FIADOR').map((p) => p.pessoaId),
    dataInicio: d.dataInicio,
    dataFim: d.dataFim,
    aluguel: d.aluguelCentavos / 100,
    diaVencimento: d.diaVencimento,
    indiceId: d.indiceId,
    periodicidadeReajusteMeses: d.periodicidadeReajusteMeses,
    reajusteNegativo: d.reajusteNegativo,
    taxaAdministracao: pct(d.taxaAdministracaoBp),
    taxaIntermediacao: pct(d.taxaIntermediacaoBp),
    multaAtraso: pct(d.multaAtrasoBp),
    jurosMes: pct(d.jurosMesBp),
    destinoEncargos: d.destinoEncargos,
    multaRescisoriaAlugueis: d.multaRescisoriaAlugueis,
    garantiaTipo: d.garantiaTipo as 'SEM_GARANTIA',
    garantiaValor: d.garantiaValorCentavos != null ? d.garantiaValorCentavos / 100 : null,
    garantiaSeguradora: d.garantiaSeguradora,
    garantiaApolice: d.garantiaApolice,
    garantiaVigenciaFim: d.garantiaVigenciaFim,
    observacoes: d.observacoes,
    encargos: d.encargos.map((e) => ({ tipo: e.tipo as 'CONDOMINIO', descricao: e.descricao, valor: e.valorCentavos / 100, competenciaInicio: e.competenciaInicio, competenciaFim: e.competenciaFim, proporcional: e.proporcional, destino: e.destino, beneficiarioId: e.beneficiarioId }))
  }
}

export function excluirRascunho(infra: Infra, ator: Ator, id: number): void {
  exigir(ator, 'locacoes.gerenciar')
  infra.bruto.transaction(() => {
    const c = obterContratoBruto(infra, id)
    if (c.situacao !== 'RASCUNHO') throw erro.regra('Somente rascunhos podem ser excluídos.')
    if (infra.db.select({ id: titulo.id }).from(titulo).where(eq(titulo.contratoId, id)).get()) throw erro.regra('Rascunho com títulos vinculados.')
    infra.db.delete(contratoParte).where(eq(contratoParte.contratoId, id)).run()
    infra.db.delete(contratoEncargo).where(eq(contratoEncargo.contratoId, id)).run()
    infra.db.delete(contratoLancamento).where(eq(contratoLancamento.contratoId, id)).run()
    infra.db.delete(contratoLocacao).where(eq(contratoLocacao.id, id)).run()
    auditar(infra, ator, { acao: 'CONTRATO_RASCUNHO_EXCLUIDO', entidade: 'contrato', entidadeId: id, descricao: `Rascunho nº ${c.numero}` })
  })()
}

export function historicoContrato(infra: Infra, ator: Ator, id: number) {
  exigir(ator, 'locacoes.ver')
  return historicoEntidade(infra, 'contrato', id)
}

// ───── Lançamentos avulsos ─────

export function listarLancamentos(infra: Infra, ator: Ator, contratoId: number): LancamentoAvulsoDto[] {
  exigir(ator, 'locacoes.ver')
  return infra.db
    .select({
      id: contratoLancamento.id,
      contratoId: contratoLancamento.contratoId,
      competencia: contratoLancamento.competencia,
      descricao: contratoLancamento.descricao,
      valorCentavos: contratoLancamento.valorCentavos,
      pagador: contratoLancamento.pagador,
      destino: contratoLancamento.destino,
      beneficiarioNome: pessoa.nome,
      situacao: contratoLancamento.situacao,
      tituloId: contratoLancamento.tituloId,
      criadoEm: contratoLancamento.criadoEm
    })
    .from(contratoLancamento)
    .leftJoin(pessoa, eq(pessoa.id, contratoLancamento.beneficiarioId))
    .where(eq(contratoLancamento.contratoId, contratoId))
    .orderBy(desc(contratoLancamento.id))
    .all()
}

/**
 * Lançamento avulso. Pagador LOCATÁRIO: entra na próxima cobrança. Pagador PROPRIETÁRIO: debitado
 * imediatamente do saldo a repassar (rateado entre os locadores) e creditado ao destino.
 */
export function criarLancamento(infra: Infra, ator: Ator, entrada: LancamentoAvulsoInput): { id: number } {
  exigir(ator, 'locacoes.gerenciar')
  const d = lancamentoAvulsoSchema.parse(entrada)
  return infra.bruto.transaction(() => {
    const c = obterContratoBruto(infra, d.contratoId)
    if (c.situacao !== 'ATIVO') throw erro.regra('Lançamentos avulsos apenas em contratos ativos.')
    if (d.beneficiarioId) pessoaAtiva(infra, d.beneficiarioId)
    const { id } = infra.db
      .insert(contratoLancamento)
      .values({ ...d, valorCentavos: d.valor, situacao: d.pagador === 'LOCATARIO' ? 'PENDENTE' : 'LANCADO', criadoPor: ator.id, atualizadoPor: ator.id })
      .returning({ id: contratoLancamento.id })
      .get()
    if (d.pagador === 'PROPRIETARIO') {
      const locadores = partesDo(infra, c.id).filter((p) => p.papel === 'LOCADOR')
      const partes = ratear(d.valor, locadores.map((l) => l.percentualBp))
      const hist = `${d.descricao} — contrato nº ${c.numero}`
      const partidas: PartidaNova[] = partes.map((v, i) => ({ conta: CONTAS.PROPRIETARIOS, valor: v, historico: hist, pessoaId: locadores[i]!.pessoaId, contratoId: c.id }))
      if (d.destino === 'IMOBILIARIA') partidas.push({ conta: CONTAS.RECEITA_OUTRAS, valor: -d.valor, historico: hist, contratoId: c.id })
      else partidas.push({ conta: CONTAS.TERCEIROS, valor: -d.valor, historico: hist, pessoaId: d.beneficiarioId, contratoId: c.id })
      const lancamentoId = registrarLancamento(infra, ator, { data: hojeIso(infra.agora()), historico: hist, origem: 'LANCAMENTO_AVULSO', origemId: id, partidas })
      infra.db.update(contratoLancamento).set({ lancamentoId }).where(eq(contratoLancamento.id, id)).run()
    }
    auditar(infra, ator, { acao: 'LANCAMENTO_AVULSO_CRIADO', entidade: 'contrato', entidadeId: c.id, descricao: `${d.pagador === 'LOCATARIO' ? 'Cobrança ao locatário' : 'Débito ao proprietário'}: ${d.descricao} (${(d.valor / 100).toFixed(2)})` })
    return { id }
  })()
}

export function cancelarLancamento(infra: Infra, ator: Ator, id: number, motivo: string): void {
  exigir(ator, 'locacoes.gerenciar')
  if (!motivo || motivo.trim().length < 5) throw erro.validacao('Informe o motivo.')
  infra.bruto.transaction(() => {
    const l = infra.db.select().from(contratoLancamento).where(eq(contratoLancamento.id, id)).get()
    if (!l) throw erro.naoEncontrado('Lançamento')
    if (l.situacao === 'CANCELADO') throw erro.regra('Lançamento já cancelado.')
    if (l.situacao === 'INCLUIDO') throw erro.regra('Lançamento já incluído em cobrança. Cancele a cobrança antes.')
    if (l.situacao === 'LANCADO' && l.lancamentoId) {
      const emRepasse = infra.db
        .select({ id: repasse.id })
        .from(partida)
        .innerJoin(repasse, eq(repasse.id, partida.repasseId))
        .where(and(eq(partida.lancamentoId, l.lancamentoId), inArray(repasse.situacao, ['ABERTO'])))
        .get()
      if (emRepasse) throw erro.regra(`Débito incluído no repasse nº ${emRepasse.id} ainda não pago. Cancele o repasse antes.`)
      estornarLancamento(infra, ator, l.lancamentoId, hojeIso(infra.agora()), `Cancelamento: ${l.descricao} — ${motivo}`, false)
    }
    infra.db.update(contratoLancamento).set({ situacao: 'CANCELADO', motivoCancelamento: motivo.trim(), atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) }).where(eq(contratoLancamento.id, id)).run()
    auditar(infra, ator, { acao: 'LANCAMENTO_AVULSO_CANCELADO', entidade: 'contrato', entidadeId: l.contratoId, descricao: `${l.descricao} — motivo: ${motivo.trim()}` })
  })()
}

// ───── Aditivos ─────

export function registrarAditivo(infra: Infra, ator: Ator, entrada: AditivoInput): void {
  exigir(ator, 'locacoes.reajustar')
  const d = aditivoSchema.parse(entrada)
  infra.bruto.transaction(() => {
    const c = obterContratoBruto(infra, d.contratoId)
    if (c.situacao !== 'ATIVO') throw erro.regra('Aditivos apenas em contratos ativos.')
    if (d.dataFimNova && d.dataFimNova <= c.dataInicio) throw erro.validacao('Novo término inválido.')
    if (d.valorNovo && d.competenciaVigencia) {
      const ultima = ultimaCompetenciaGerada(infra, c.id)
      if (ultima && d.competenciaVigencia <= ultima) throw erro.regra(`A vigência deve ser posterior à última competência já cobrada (${ultima}).`)
      if (d.competenciaVigencia < competenciaDe(c.dataInicio)) throw erro.validacao('Vigência anterior ao início do contrato.')
    }
    const ts = agoraIso(infra)
    const { id } = infra.db
      .insert(aditivo)
      .values({
        contratoId: c.id,
        tipo: d.tipo,
        data: d.data,
        descricao: d.descricao,
        dataFimAnterior: d.dataFimNova ? c.dataFim : null,
        dataFimNova: d.dataFimNova,
        valorAnteriorCentavos: d.valorNovo ? c.aluguelCentavos : null,
        valorNovoCentavos: d.valorNovo,
        criadoEm: ts,
        criadoPor: ator.id
      })
      .returning({ id: aditivo.id })
      .get()
    const set: Partial<typeof contratoLocacao.$inferInsert> = { atualizadoPor: ator.id, atualizadoEm: ts }
    if (d.dataFimNova) set.dataFim = d.dataFimNova
    if (d.valorNovo && d.competenciaVigencia) {
      infra.db
        .insert(aluguelVigencia)
        .values({ contratoId: c.id, competencia: d.competenciaVigencia, valorCentavos: d.valorNovo, origem: 'ADITIVO', origemId: id, criadoEm: ts, criadoPor: ator.id })
        .onConflictDoUpdate({ target: [aluguelVigencia.contratoId, aluguelVigencia.competencia], set: { valorCentavos: d.valorNovo, origem: 'ADITIVO', origemId: id } })
        .run()
      set.aluguelCentavos = d.valorNovo
    }
    infra.db.update(contratoLocacao).set(set).where(eq(contratoLocacao.id, c.id)).run()
    auditar(infra, ator, { acao: 'ADITIVO_REGISTRADO', entidade: 'contrato', entidadeId: c.id, descricao: `${d.tipo}: ${d.descricao}`, depois: d })
  })()
}

export function listarAditivos(infra: Infra, ator: Ator, contratoId: number) {
  exigir(ator, 'locacoes.ver')
  return infra.db.select().from(aditivo).where(eq(aditivo.contratoId, contratoId)).orderBy(desc(aditivo.id)).all()
}

/** Vínculos contratuais ativos de uma pessoa (bloqueiam remoção de papéis e exclusão). */
export function vinculosContratuais(infra: Infra, pessoaId: number): { papel: string; numero: number }[] {
  return infra.bruto
    .prepare(`SELECT cp.papel, c.numero FROM contrato_parte cp JOIN contrato_locacao c ON c.id = cp.contrato_id WHERE cp.pessoa_id = ? AND c.situacao IN ('ATIVO','RASCUNHO')`)
    .all(pessoaId) as { papel: string; numero: number }[]
}
