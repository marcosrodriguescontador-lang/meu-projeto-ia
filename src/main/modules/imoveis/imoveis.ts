// Cadastro de imóveis com proprietários, ofertas de venda/locação independentes, características e pesquisa.
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { CaracteristicaDto, HistoricoSituacaoDto, ImovelDetalhe, ImovelDoProprietario, ImovelResumo, IndicadoresImoveis, OfertaDto, PaginaResultado, RegistroAuditoria } from '@shared/dto'
import { erro } from '@shared/erros'
import {
  alterarSituacaoSchema,
  imovelSchema,
  listarImoveisSchema,
  SITUACOES_OFERTA,
  SITUACOES_POR_MODALIDADE,
  validarProprietarios,
  type AlterarSituacaoInput,
  type ImovelDados,
  type ImovelInput,
  type ListarImoveisInput,
  type Modalidade,
  type SituacaoOferta
} from '@shared/schemas'
import { caracteristica, imovel, imovelCaracteristica, imovelOferta, imovelProprietario, ofertaSituacaoHist, pessoa, pessoaPapel, usuario } from '../../infra/db/schema'
import { agoraIso, exigir, pode, type Ator, type Infra } from '../../nucleo/contexto'
import { proximoNumero } from '../../nucleo/sequencia'
import { normalizarBusca } from '../../nucleo/texto'
import { auditar, historicoEntidade } from '../seguranca/auditoria'
import { miniaturaCapa } from './fotos'

const ativo = isNull(imovel.excluidoEm)
const MODALIDADES: Modalidade[] = ['VENDA', 'LOCACAO']
/** Situações que indicam negócio em andamento ou concluído (bloqueiam exclusão/desativação). */
const SITUACOES_COMPROMETIDAS: SituacaoOferta[] = ['RESERVADO', 'EM_NEGOCIACAO', 'ALUGADO', 'VENDIDO']

function obterAtivo(infra: Infra, id: number) {
  const i = infra.db.select().from(imovel).where(and(eq(imovel.id, id), ativo)).get()
  if (!i) throw erro.naoEncontrado('Imóvel')
  return i
}

function ofertasDe(infra: Infra, imovelId: number): OfertaDto[] {
  return infra.db
    .select({ id: imovelOferta.id, modalidade: imovelOferta.modalidade, valorCentavos: imovelOferta.valorCentavos, comissaoBp: imovelOferta.comissaoBp, situacao: imovelOferta.situacao, situacaoDesde: imovelOferta.situacaoDesde })
    .from(imovelOferta)
    .where(eq(imovelOferta.imovelId, imovelId))
    .orderBy(asc(imovelOferta.modalidade))
    .all()
}

function proprietariosDe(infra: Infra, imovelId: number) {
  return infra.db
    .select({ pessoaId: imovelProprietario.pessoaId, nome: pessoa.nome, documento: pessoa.documento, percentualBp: imovelProprietario.percentualBp, principal: imovelProprietario.principal })
    .from(imovelProprietario)
    .innerJoin(pessoa, eq(pessoa.id, imovelProprietario.pessoaId))
    .where(eq(imovelProprietario.imovelId, imovelId))
    .orderBy(sql`${imovelProprietario.principal} DESC`, asc(pessoa.nome))
    .all()
}

export function obterImovel(infra: Infra, ator: Ator, id: number): ImovelDetalhe {
  exigir(ator, 'imoveis.ver')
  const i = obterAtivo(infra, id)
  const corretor = i.corretorId ? infra.db.select({ id: pessoa.id, nome: pessoa.nome }).from(pessoa).where(eq(pessoa.id, i.corretorId)).get() ?? null : null
  return {
    id: i.id,
    codigo: i.codigo,
    tipo: i.tipo,
    finalidade: i.finalidade,
    cep: i.cep,
    logradouro: i.logradouro,
    numero: i.numero,
    complemento: i.complemento,
    bairro: i.bairro,
    cidade: i.cidade,
    uf: i.uf,
    areaConstruida: i.areaConstruida,
    areaTerreno: i.areaTerreno,
    dormitorios: i.dormitorios,
    suites: i.suites,
    banheiros: i.banheiros,
    vagas: i.vagas,
    descricaoComercial: i.descricaoComercial,
    condominioCentavos: i.condominioCentavos,
    iptuAnualCentavos: i.iptuAnualCentavos,
    corretor,
    caracteristicas: infra.db.select({ id: imovelCaracteristica.caracteristicaId }).from(imovelCaracteristica).where(eq(imovelCaracteristica.imovelId, id)).all().map((r) => r.id),
    ofertas: ofertasDe(infra, id),
    criadoEm: i.criadoEm,
    atualizadoEm: i.atualizadoEm,
    internos: pode(ator, 'imoveis.dados_internos.ver')
      ? { matricula: i.matricula, cartorio: i.cartorio, inscricaoMunicipal: i.inscricaoMunicipal, observacoesInternas: i.observacoesInternas, proprietarios: proprietariosDe(infra, id) }
      : null
  }
}

// ───── Validações de referência ─────

function pessoaAtiva(infra: Infra, id: number) {
  return infra.db.select({ id: pessoa.id, nome: pessoa.nome }).from(pessoa).where(and(eq(pessoa.id, id), isNull(pessoa.excluidoEm))).get()
}

function temPapel(infra: Infra, pessoaId: number, papel: string): boolean {
  return !!infra.db.select({ p: pessoaPapel.papel }).from(pessoaPapel).where(and(eq(pessoaPapel.pessoaId, pessoaId), eq(pessoaPapel.papel, papel))).get()
}

function validarReferencias(infra: Infra, ator: Ator, d: ImovelDados, ignorarId?: number): void {
  if (d.corretorId) {
    if (!pessoaAtiva(infra, d.corretorId)) throw erro.validacao('Corretor não encontrado.', { corretorId: 'Corretor não encontrado' })
    if (!temPapel(infra, d.corretorId, 'CORRETOR')) throw erro.validacao('A pessoa indicada não está cadastrada como corretor.', { corretorId: 'Não é corretor' })
  }
  if (d.caracteristicas.length) {
    const validas = infra.db.select({ id: caracteristica.id }).from(caracteristica).where(and(inArray(caracteristica.id, d.caracteristicas), eq(caracteristica.ativa, true))).all()
    if (validas.length !== new Set(d.caracteristicas).size) throw erro.validacao('Característica inválida.')
  }
  if (pode(ator, 'imoveis.dados_internos.ver') && d.matricula) {
    const cond = [eq(imovel.matricula, d.matricula), eq(imovel.cartorio, d.cartorio ?? ''), ativo]
    if (ignorarId) cond.push(ne(imovel.id, ignorarId))
    const dup = infra.db.select({ codigo: imovel.codigo }).from(imovel).where(and(...cond)).get()
    if (dup) throw erro.conflito(`Matrícula já cadastrada no imóvel código ${dup.codigo}.`, { matricula: 'Matrícula já cadastrada' })
  }
}

/** Valida e grava proprietários; adiciona o papel PROPRIETARIO a quem ainda não o possui. */
function gravarProprietarios(infra: Infra, ator: Ator, imovelId: number, lista: ImovelDados['proprietarios']): string[] {
  const falha = validarProprietarios(lista)
  if (falha) throw erro.validacao(falha, { proprietarios: falha })
  const papeisAdicionados: string[] = []
  for (const p of lista) {
    const ps = pessoaAtiva(infra, p.pessoaId)
    if (!ps) throw erro.validacao('Proprietário não encontrado.')
    if (!temPapel(infra, p.pessoaId, 'PROPRIETARIO')) {
      infra.db.insert(pessoaPapel).values({ pessoaId: p.pessoaId, papel: 'PROPRIETARIO' }).run()
      auditar(infra, ator, { acao: 'PAPEL_ADICIONADO', entidade: 'pessoa', entidadeId: p.pessoaId, descricao: `Papel Proprietário adicionado ao vincular imóvel #${imovelId}` })
      papeisAdicionados.push(ps.nome)
    }
  }
  const principal = lista.findIndex((p) => p.principal)
  infra.db.delete(imovelProprietario).where(eq(imovelProprietario.imovelId, imovelId)).run()
  infra.db
    .insert(imovelProprietario)
    .values(lista.map((p, i) => ({ imovelId, pessoaId: p.pessoaId, percentualBp: p.percentual, principal: principal === -1 ? i === 0 : i === principal })))
    .run()
  return papeisAdicionados
}

function gravarCaracteristicas(infra: Infra, imovelId: number, ids: number[]): void {
  infra.db.delete(imovelCaracteristica).where(eq(imovelCaracteristica.imovelId, imovelId)).run()
  const unicos = [...new Set(ids)]
  if (unicos.length) infra.db.insert(imovelCaracteristica).values(unicos.map((caracteristicaId) => ({ imovelId, caracteristicaId }))).run()
}

function registrarSituacao(infra: Infra, ator: Ator, ofertaId: number, de: string | null, para: SituacaoOferta, motivo: string): void {
  const ts = agoraIso(infra)
  infra.db.insert(ofertaSituacaoHist).values({ ofertaId, de, para, motivo, usuarioId: ator.id, ts }).run()
  if (de !== null) infra.db.update(imovelOferta).set({ situacao: para, situacaoDesde: ts, atualizadoPor: ator.id, atualizadoEm: ts }).where(eq(imovelOferta.id, ofertaId)).run()
}

/**
 * Altera a situação da oferta por decorrência de outro módulo (negociação, venda, distrato), dentro da
 * transação do chamador. Vendido inativa a oferta de locação (salvo imóvel alugado). Retorna se mudou.
 */
export function aplicarSituacaoOferta(infra: Infra, ator: Ator, imovelId: number, modalidade: Modalidade, para: SituacaoOferta, motivo: string, somenteDe?: SituacaoOferta[]): boolean {
  const o = infra.db.select().from(imovelOferta).where(and(eq(imovelOferta.imovelId, imovelId), eq(imovelOferta.modalidade, modalidade))).get()
  if (!o || o.situacao === para || (somenteDe && !somenteDe.includes(o.situacao as SituacaoOferta))) return false
  registrarSituacao(infra, ator, o.id, o.situacao, para, motivo)
  if (modalidade === 'VENDA' && para === 'VENDIDO') {
    const loc = infra.db.select().from(imovelOferta).where(and(eq(imovelOferta.imovelId, imovelId), eq(imovelOferta.modalidade, 'LOCACAO'))).get()
    if (loc && !['INATIVO', 'ALUGADO'].includes(loc.situacao)) registrarSituacao(infra, ator, loc.id, loc.situacao, 'INATIVO', `Imóvel vendido (oferta de venda #${o.id})`)
  }
  return true
}

/** Sincroniza as ofertas com o cadastro: cria, atualiza valores, desativa ou reativa. */
function gravarOfertas(infra: Infra, ator: Ator, imovelId: number, d: ImovelDados): void {
  const existentes = ofertasDe(infra, imovelId)
  for (const modalidade of MODALIDADES) {
    const entrada = modalidade === 'VENDA' ? d.venda : d.locacao
    const atual = existentes.find((o) => o.modalidade === modalidade)
    const rotulo = modalidade === 'VENDA' ? 'venda' : 'locação'
    if (entrada.ativa) {
      if (!atual) {
        const ts = agoraIso(infra)
        const { id } = infra.db
          .insert(imovelOferta)
          .values({ imovelId, modalidade, valorCentavos: entrada.valor!, comissaoBp: entrada.comissao, situacao: 'DISPONIVEL', situacaoDesde: ts, criadoPor: ator.id, atualizadoPor: ator.id })
          .returning({ id: imovelOferta.id })
          .get()
        registrarSituacao(infra, ator, id, null, 'DISPONIVEL', `Oferta de ${rotulo} cadastrada`)
      } else {
        infra.db
          .update(imovelOferta)
          .set({ valorCentavos: entrada.valor!, comissaoBp: entrada.comissao, atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) })
          .where(eq(imovelOferta.id, atual.id))
          .run()
        if (atual.situacao === 'INATIVO') registrarSituacao(infra, ator, atual.id, 'INATIVO', 'DISPONIVEL', `Oferta de ${rotulo} reativada no cadastro`)
      }
    } else if (atual && atual.situacao !== 'INATIVO') {
      if (SITUACOES_COMPROMETIDAS.includes(atual.situacao as SituacaoOferta))
        throw erro.regra(`A oferta de ${rotulo} está "${SITUACOES_OFERTA[atual.situacao as SituacaoOferta]}". Altere a situação antes de desativá-la.`)
      registrarSituacao(infra, ator, atual.id, atual.situacao, 'INATIVO', `Oferta de ${rotulo} desativada no cadastro`)
    }
  }
}

function colunas(d: ImovelDados) {
  return {
    tipo: d.tipo,
    finalidade: d.finalidade,
    cep: d.cep,
    logradouro: d.logradouro,
    numero: d.numero,
    complemento: d.complemento,
    bairro: d.bairro,
    cidade: d.cidade,
    uf: d.uf,
    enderecoBusca: normalizarBusca(`${d.logradouro} ${d.numero} ${d.complemento ?? ''} ${d.bairro} ${d.cidade} ${d.cep}`),
    areaConstruida: d.areaConstruida,
    areaTerreno: d.areaTerreno,
    dormitorios: d.dormitorios,
    suites: d.suites,
    banheiros: d.banheiros,
    vagas: d.vagas,
    descricaoComercial: d.descricaoComercial,
    condominioCentavos: d.condominio,
    iptuAnualCentavos: d.iptuAnual,
    corretorId: d.corretorId
  }
}

const colunasInternas = (d: ImovelDados) => ({ matricula: d.matricula, cartorio: d.cartorio, inscricaoMunicipal: d.inscricaoMunicipal, observacoesInternas: d.observacoesInternas })

export function criarImovel(infra: Infra, ator: Ator, entrada: ImovelInput): { id: number } {
  exigir(ator, 'imoveis.criar')
  exigir(ator, 'imoveis.dados_internos.ver')
  const d = imovelSchema.parse(entrada)
  return infra.bruto.transaction(() => {
    validarReferencias(infra, ator, d)
    const { id } = infra.db
      .insert(imovel)
      .values({ ...colunas(d), ...colunasInternas(d), codigo: proximoNumero(infra.db, 'imovel'), criadoPor: ator.id, atualizadoPor: ator.id })
      .returning({ id: imovel.id })
      .get()
    gravarProprietarios(infra, ator, id, d.proprietarios)
    gravarCaracteristicas(infra, id, d.caracteristicas)
    gravarOfertas(infra, ator, id, d)
    auditar(infra, ator, { acao: 'IMOVEL_CRIADO', entidade: 'imovel', entidadeId: id, descricao: `${d.logradouro}, ${d.numero} — ${d.bairro}`, depois: d })
    return { id }
  })()
}

function estadoParaAuditoria(infra: Infra, id: number) {
  const i = obterAtivo(infra, id)
  const { criadoEm: _a, atualizadoEm: _b, criadoPor: _c, atualizadoPor: _d, enderecoBusca: _e, ...resto } = i
  return {
    ...resto,
    proprietarios: proprietariosDe(infra, id).map((p) => ({ pessoaId: p.pessoaId, percentual: p.percentualBp, principal: p.principal })),
    caracteristicas: infra.db.select({ id: imovelCaracteristica.caracteristicaId }).from(imovelCaracteristica).where(eq(imovelCaracteristica.imovelId, id)).all().map((r) => r.id),
    ofertas: ofertasDe(infra, id).map((o) => ({ modalidade: o.modalidade, valor: o.valorCentavos, comissao: o.comissaoBp, situacao: o.situacao }))
  }
}

export function atualizarImovel(infra: Infra, ator: Ator, id: number, entrada: ImovelInput): void {
  exigir(ator, 'imoveis.editar')
  const d = imovelSchema.parse(entrada)
  const internos = pode(ator, 'imoveis.dados_internos.ver')
  infra.bruto.transaction(() => {
    const antes = estadoParaAuditoria(infra, id)
    validarReferencias(infra, ator, d, id)
    // Sem acesso aos dados internos, matrícula, observações e proprietários são preservados.
    infra.db
      .update(imovel)
      .set({ ...colunas(d), ...(internos ? colunasInternas(d) : {}), atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) })
      .where(eq(imovel.id, id))
      .run()
    if (internos) gravarProprietarios(infra, ator, id, d.proprietarios)
    gravarCaracteristicas(infra, id, d.caracteristicas)
    gravarOfertas(infra, ator, id, d)
    auditar(infra, ator, { acao: 'IMOVEL_ALTERADO', entidade: 'imovel', entidadeId: id, descricao: `Código ${antes.codigo}`, antes, depois: estadoParaAuditoria(infra, id) })
  })()
}

export function alterarSituacao(infra: Infra, ator: Ator, entrada: AlterarSituacaoInput): void {
  exigir(ator, 'imoveis.situacao')
  const { ofertaId, situacao, motivo } = alterarSituacaoSchema.parse(entrada)
  infra.bruto.transaction(() => {
    const o = infra.db.select().from(imovelOferta).where(eq(imovelOferta.id, ofertaId)).get()
    if (!o) throw erro.naoEncontrado('Oferta')
    const im = obterAtivo(infra, o.imovelId)
    if (!SITUACOES_POR_MODALIDADE[o.modalidade].includes(situacao))
      throw erro.validacao(`Situação "${SITUACOES_OFERTA[situacao]}" não se aplica à ${o.modalidade === 'VENDA' ? 'venda' : 'locação'}.`)
    if (o.situacao === situacao) throw erro.regra('A oferta já está nesta situação.')
    if (o.modalidade === 'LOCACAO') {
      const contrato = infra.bruto.prepare("SELECT numero FROM contrato_locacao WHERE imovel_id = ? AND situacao = 'ATIVO'").get(o.imovelId) as { numero: number } | undefined
      if (contrato) throw erro.regra(`A situação da locação é definida pelo contrato ativo nº ${contrato.numero}. Para liberar o imóvel, registre a rescisão.`)
    }
    registrarSituacao(infra, ator, o.id, o.situacao, situacao, motivo)
    let complemento = ''
    // Imóvel vendido deixa de ser ofertado para locação (salvo se já estiver alugado: o contrato segue).
    if (o.modalidade === 'VENDA' && situacao === 'VENDIDO') {
      const loc = infra.db.select().from(imovelOferta).where(and(eq(imovelOferta.imovelId, o.imovelId), eq(imovelOferta.modalidade, 'LOCACAO'))).get()
      if (loc && !['INATIVO', 'ALUGADO'].includes(loc.situacao)) {
        registrarSituacao(infra, ator, loc.id, loc.situacao, 'INATIVO', `Imóvel vendido (oferta de venda #${o.id})`)
        complemento = '; oferta de locação inativada'
      }
    }
    auditar(infra, ator, {
      acao: 'SITUACAO_ALTERADA',
      entidade: 'imovel',
      entidadeId: o.imovelId,
      descricao: `Código ${im.codigo} — ${o.modalidade === 'VENDA' ? 'Venda' : 'Locação'}: ${SITUACOES_OFERTA[o.situacao as SituacaoOferta]} → ${SITUACOES_OFERTA[situacao]} (${motivo})${complemento}`
    })
  })()
}

export function excluirImovel(infra: Infra, ator: Ator, id: number, motivo: string): void {
  exigir(ator, 'imoveis.excluir')
  if (!motivo || motivo.trim().length < 5) throw erro.validacao('Informe o motivo da exclusão.', { motivo: 'Descreva o motivo' })
  infra.bruto.transaction(() => {
    const antes = estadoParaAuditoria(infra, id)
    const comprometida = antes.ofertas.find((o) => ['RESERVADO', 'EM_NEGOCIACAO', 'ALUGADO'].includes(o.situacao))
    if (comprometida) throw erro.regra(`Não é possível excluir: oferta de ${comprometida.modalidade === 'VENDA' ? 'venda' : 'locação'} está "${SITUACOES_OFERTA[comprometida.situacao as SituacaoOferta]}".`)
    infra.db.update(imovel).set({ excluidoEm: agoraIso(infra), excluidoPor: ator.id, motivoExclusao: motivo.trim() }).where(eq(imovel.id, id)).run()
    auditar(infra, ator, { acao: 'IMOVEL_EXCLUIDO', entidade: 'imovel', entidadeId: id, descricao: `Código ${antes.codigo} — motivo: ${motivo.trim()}`, antes })
  })()
}

// ───── Consultas ─────

interface LinhaLista {
  id: number
  codigo: number
  tipo: string
  finalidade: string
  logradouro: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  uf: string
  dormitorios: number
  suites: number
  vagas: number
  area_construida: number | null
  area_terreno: number | null
  corretor: string | null
  v_id: number | null
  v_valor: number | null
  v_comissao: number | null
  v_situacao: string | null
  v_desde: string | null
  l_id: number | null
  l_valor: number | null
  l_comissao: number | null
  l_situacao: string | null
  l_desde: string | null
}

function oferta(modalidade: Modalidade, id: number | null, valor: number | null, comissao: number | null, situacao: string | null, desde: string | null): OfertaDto | null {
  return id == null ? null : { id, modalidade, valorCentavos: valor!, comissaoBp: comissao!, situacao: situacao!, situacaoDesde: desde! }
}

export async function listarImoveis(infra: Infra, ator: Ator, entrada: ListarImoveisInput, comCapa = true): Promise<PaginaResultado<ImovelResumo>> {
  exigir(ator, 'imoveis.ver')
  const f = listarImoveisSchema.parse(entrada)
  if (f.proprietarioId) exigir(ator, 'imoveis.dados_internos.ver')
  const cond: string[] = ['i.excluido_em IS NULL']
  const p: unknown[] = []
  const add = (c: string, ...v: unknown[]) => {
    cond.push(c)
    p.push(...v)
  }
  if (f.busca) {
    const termo = f.busca.trim()
    if (/^\d+$/.test(termo)) add('(i.codigo = ? OR i.endereco_busca LIKE ?)', Number(termo), `%${termo}%`)
    else {
      const n = `%${normalizarBusca(termo)}%`
      add("(i.endereco_busca LIKE ? OR lower(coalesce(i.descricao_comercial,'')) LIKE ?)", n, `%${termo.toLowerCase()}%`)
    }
  }
  if (f.tipo) add('i.tipo = ?', f.tipo)
  if (f.finalidade) add('i.finalidade = ?', f.finalidade)
  if (f.cidade) add('i.cidade = ? COLLATE NOCASE', f.cidade)
  if (f.bairro) add('i.bairro = ? COLLATE NOCASE', f.bairro)
  if (f.dormitoriosMin) add('i.dormitorios >= ?', f.dormitoriosMin)
  if (f.suitesMin) add('i.suites >= ?', f.suitesMin)
  if (f.vagasMin) add('i.vagas >= ?', f.vagasMin)
  if (f.areaMin) add('coalesce(i.area_construida, i.area_terreno, 0) >= ?', f.areaMin)
  if (f.corretorId) add('i.corretor_id = ?', f.corretorId)
  if (f.proprietarioId) add('EXISTS (SELECT 1 FROM imovel_proprietario ip WHERE ip.imovel_id = i.id AND ip.pessoa_id = ?)', f.proprietarioId)
  if (f.caracteristicas?.length) {
    const ids = [...new Set(f.caracteristicas)]
    add(`(SELECT count(*) FROM imovel_caracteristica ic WHERE ic.imovel_id = i.id AND ic.caracteristica_id IN (${ids.map(() => '?').join(',')})) = ?`, ...ids, ids.length)
  }
  // Filtros de oferta: aplicados à modalidade escolhida ou a qualquer uma.
  const ofertaCond: string[] = []
  const ofertaP: unknown[] = []
  if (f.modalidade) (ofertaCond.push('o.modalidade = ?'), ofertaP.push(f.modalidade))
  if (f.situacao) (ofertaCond.push('o.situacao = ?'), ofertaP.push(f.situacao))
  if (f.precoMin != null) (ofertaCond.push('o.valor_centavos >= ?'), ofertaP.push(f.precoMin))
  if (f.precoMax != null) (ofertaCond.push('o.valor_centavos <= ?'), ofertaP.push(f.precoMax))
  if (ofertaCond.length) add(`EXISTS (SELECT 1 FROM imovel_oferta o WHERE o.imovel_id = i.id AND ${ofertaCond.join(' AND ')})`, ...ofertaP)

  const where = cond.join(' AND ')
  const base = `FROM imovel i
    LEFT JOIN imovel_oferta v ON v.imovel_id = i.id AND v.modalidade = 'VENDA'
    LEFT JOIN imovel_oferta l ON l.imovel_id = i.id AND l.modalidade = 'LOCACAO'
    LEFT JOIN pessoa c ON c.id = i.corretor_id
    WHERE ${where}`
  const valorOrdem = f.modalidade === 'LOCACAO' ? 'l.valor_centavos' : f.modalidade === 'VENDA' ? 'v.valor_centavos' : 'coalesce(v.valor_centavos, l.valor_centavos)'
  const ordem = { codigo: 'i.codigo', recentes: 'i.id DESC', valor_asc: `${valorOrdem} IS NULL, ${valorOrdem} ASC`, valor_desc: `${valorOrdem} IS NULL, ${valorOrdem} DESC` }[f.ordenar]
  const total = (infra.bruto.prepare(`SELECT count(*) n ${base}`).get(...p) as { n: number }).n
  const linhas = infra.bruto
    .prepare(
      `SELECT i.id, i.codigo, i.tipo, i.finalidade, i.logradouro, i.numero, i.complemento, i.bairro, i.cidade, i.uf, i.dormitorios, i.suites, i.vagas,
        i.area_construida, i.area_terreno, c.nome corretor,
        v.id v_id, v.valor_centavos v_valor, v.comissao_bp v_comissao, v.situacao v_situacao, v.situacao_desde v_desde,
        l.id l_id, l.valor_centavos l_valor, l.comissao_bp l_comissao, l.situacao l_situacao, l.situacao_desde l_desde
       ${base} ORDER BY ${ordem}, i.codigo LIMIT ? OFFSET ?`
    )
    .all(...p, f.porPagina, (f.pagina - 1) * f.porPagina) as LinhaLista[]
  const itens: ImovelResumo[] = []
  for (const r of linhas) {
    itens.push({
      id: r.id,
      codigo: r.codigo,
      tipo: r.tipo,
      finalidade: r.finalidade,
      endereco: `${r.logradouro}, ${r.numero}${r.complemento ? ` — ${r.complemento}` : ''}`,
      bairro: r.bairro,
      cidade: r.cidade,
      uf: r.uf,
      dormitorios: r.dormitorios,
      suites: r.suites,
      vagas: r.vagas,
      areaConstruida: r.area_construida,
      areaTerreno: r.area_terreno,
      venda: oferta('VENDA', r.v_id, r.v_valor, r.v_comissao, r.v_situacao, r.v_desde),
      locacao: oferta('LOCACAO', r.l_id, r.l_valor, r.l_comissao, r.l_situacao, r.l_desde),
      corretor: r.corretor,
      capa: comCapa ? await miniaturaCapa(infra, r.id) : null
    })
  }
  return { itens, total, pagina: f.pagina, porPagina: f.porPagina }
}

export function historicoSituacao(infra: Infra, ator: Ator, imovelId: number): HistoricoSituacaoDto[] {
  exigir(ator, 'imoveis.ver')
  return infra.db
    .select({ id: ofertaSituacaoHist.id, modalidade: imovelOferta.modalidade, de: ofertaSituacaoHist.de, para: ofertaSituacaoHist.para, motivo: ofertaSituacaoHist.motivo, usuario: usuario.login, ts: ofertaSituacaoHist.ts })
    .from(ofertaSituacaoHist)
    .innerJoin(imovelOferta, eq(imovelOferta.id, ofertaSituacaoHist.ofertaId))
    .leftJoin(usuario, eq(usuario.id, ofertaSituacaoHist.usuarioId))
    .where(eq(imovelOferta.imovelId, imovelId))
    .orderBy(sql`${ofertaSituacaoHist.id} DESC`)
    .all()
}

export function historicoImovel(infra: Infra, ator: Ator, id: number): RegistroAuditoria[] {
  exigir(ator, 'imoveis.ver')
  return historicoEntidade(infra, 'imovel', id)
}

export function listarCaracteristicas(infra: Infra): CaracteristicaDto[] {
  return infra.db.select({ id: caracteristica.id, nome: caracteristica.nome, grupo: caracteristica.grupo }).from(caracteristica).where(eq(caracteristica.ativa, true)).orderBy(asc(caracteristica.grupo), asc(caracteristica.nome)).all()
}

export function localidades(infra: Infra, ator: Ator): { cidade: string; uf: string; bairros: string[] }[] {
  exigir(ator, 'imoveis.ver')
  const linhas = infra.bruto.prepare('SELECT DISTINCT cidade, uf, bairro FROM imovel WHERE excluido_em IS NULL ORDER BY cidade, bairro').all() as { cidade: string; uf: string; bairro: string }[]
  const mapa = new Map<string, { cidade: string; uf: string; bairros: string[] }>()
  for (const l of linhas) {
    const k = `${l.cidade}/${l.uf}`
    if (!mapa.has(k)) mapa.set(k, { cidade: l.cidade, uf: l.uf, bairros: [] })
    mapa.get(k)!.bairros.push(l.bairro)
  }
  return [...mapa.values()]
}

export function imoveisDoProprietario(infra: Infra, ator: Ator, pessoaId: number): ImovelDoProprietario[] {
  exigir(ator, 'imoveis.ver')
  exigir(ator, 'imoveis.dados_internos.ver')
  const linhas = infra.bruto
    .prepare(
      `SELECT i.id, i.codigo, i.tipo, i.logradouro || ', ' || i.numero || ' — ' || i.bairro || ', ' || i.cidade endereco, ip.percentual_bp percentualBp,
        (SELECT situacao FROM imovel_oferta WHERE imovel_id = i.id AND modalidade = 'VENDA') venda,
        (SELECT situacao FROM imovel_oferta WHERE imovel_id = i.id AND modalidade = 'LOCACAO') locacao
       FROM imovel_proprietario ip JOIN imovel i ON i.id = ip.imovel_id
       WHERE ip.pessoa_id = ? AND i.excluido_em IS NULL ORDER BY i.codigo`
    )
    .all(pessoaId) as ImovelDoProprietario[]
  return linhas
}

export function indicadoresImoveis(infra: Infra): IndicadoresImoveis {
  const r = infra.bruto
    .prepare(
      `SELECT
        (SELECT count(*) FROM imovel WHERE excluido_em IS NULL) total,
        count(CASE WHEN o.modalidade = 'VENDA' AND o.situacao = 'DISPONIVEL' THEN 1 END) disponiveisVenda,
        count(CASE WHEN o.modalidade = 'LOCACAO' AND o.situacao = 'DISPONIVEL' THEN 1 END) disponiveisLocacao,
        count(CASE WHEN o.modalidade = 'LOCACAO' AND o.situacao = 'ALUGADO' THEN 1 END) alugados,
        count(CASE WHEN o.situacao IN ('EM_NEGOCIACAO', 'RESERVADO') THEN 1 END) emNegociacao,
        count(CASE WHEN o.modalidade = 'VENDA' AND o.situacao = 'VENDIDO' THEN 1 END) vendidos
       FROM imovel_oferta o JOIN imovel i ON i.id = o.imovel_id AND i.excluido_em IS NULL`
    )
    .get() as IndicadoresImoveis
  return r
}

/** Usado pelo módulo de pessoas: vínculos que impedem remover papéis ou excluir a pessoa. */
export function vinculosImobiliarios(infra: Infra, pessoaId: number): { proprietarioDe: number[]; corretorDe: number[] } {
  const prop = infra.bruto
    .prepare('SELECT i.codigo FROM imovel_proprietario ip JOIN imovel i ON i.id = ip.imovel_id WHERE ip.pessoa_id = ? AND i.excluido_em IS NULL ORDER BY i.codigo')
    .all(pessoaId) as { codigo: number }[]
  const corr = infra.bruto.prepare('SELECT codigo FROM imovel WHERE corretor_id = ? AND excluido_em IS NULL ORDER BY codigo').all(pessoaId) as { codigo: number }[]
  return { proprietarioDe: prop.map((r) => r.codigo), corretorDe: corr.map((r) => r.codigo) }
}
