// Títulos a receber e a pagar: composição por itens, saldo derivado das baixas e situação.
import { and, asc, eq, sql } from 'drizzle-orm'
import type { BaixaDto, InadimplenciaLinha, PreviaRecebimento, TituloDetalhe, TituloItemDto, TituloResumo } from '@shared/dto-financeiro'
import { erro } from '@shared/erros'
import { calcularEncargos } from '@shared/financeiro/calculos'
import { diferencaDias, hojeIso } from '@shared/financeiro/datas'
import { baixa, contaFinanceira, contratoLancamento, titulo, tituloItem, usuario } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar, type Autor } from '../seguranca/auditoria'

/** Títulos gerenciados por vendas e comissões: cancelamento e renegociação só pelo próprio módulo. */
export const ORIGENS_GERENCIADAS = ['COMISSAO_VENDA', 'COMISSAO_CORRETOR', 'SINAL_VENDA', 'PARCELA_VENDA']

export type DestinoItem = 'PROPRIETARIO' | 'TERCEIRO' | 'IMOBILIARIA' | 'CAUCAO' | 'PASSIVO' | 'DESPESA'

export interface ItemNovo {
  tipo: string
  descricao: string
  valor: number
  destino: DestinoItem
  beneficiarioId?: number | null
  contaGerencialId?: number | null
  taxaBp?: number
  taxaTipo?: 'ADMINISTRACAO' | 'INTERMEDIACAO' | null
  lancamentoAvulsoId?: number | null
}

export interface TituloNovo {
  sentido: 'RECEBER' | 'PAGAR'
  origem: string
  contratoId?: number | null
  pessoaId: number
  descricao: string
  competencia?: string | null
  emissao: string
  vencimentoOriginal: string
  vencimento: string
  recurso: 'PROPRIO' | 'TERCEIROS'
  multaBp?: number
  jurosMesBp?: number
  destinoEncargos?: 'PROPRIETARIO' | 'IMOBILIARIA'
  chave?: string | null
  renegociacaoId?: number | null
  repasseId?: number | null
  itens: ItemNovo[]
}

/** Cria o título com seus itens (dentro de transação). Itens com valor zero são descartados. */
export function criarTitulo(infra: Infra, ator: Autor, t: TituloNovo): number {
  const itens = t.itens.filter((i) => i.valor !== 0)
  const valor = itens.reduce((s, i) => s + i.valor, 0)
  if (valor <= 0) throw erro.regra(`Título "${t.descricao}" sem valor a ${t.sentido === 'RECEBER' ? 'receber' : 'pagar'}.`)
  if (t.chave && infra.db.select({ id: titulo.id }).from(titulo).where(eq(titulo.chaveIdempotencia, t.chave)).get()) throw erro.conflito(`Título já gerado (${t.chave}).`)
  const { id } = infra.db
    .insert(titulo)
    .values({
      sentido: t.sentido,
      origem: t.origem,
      contratoId: t.contratoId ?? null,
      pessoaId: t.pessoaId,
      descricao: t.descricao,
      competencia: t.competencia ?? null,
      emissao: t.emissao,
      vencimentoOriginal: t.vencimentoOriginal,
      vencimento: t.vencimento,
      valorCentavos: valor,
      situacao: 'ABERTO',
      recurso: t.recurso,
      multaBp: t.multaBp ?? 0,
      jurosMesBp: t.jurosMesBp ?? 0,
      destinoEncargos: t.destinoEncargos ?? 'PROPRIETARIO',
      chaveIdempotencia: t.chave ?? null,
      renegociacaoId: t.renegociacaoId ?? null,
      repasseId: t.repasseId ?? null,
      criadoPor: ator.id,
      atualizadoPor: ator.id
    })
    .returning({ id: titulo.id })
    .get()
  infra.db
    .insert(tituloItem)
    .values(
      itens.map((i) => ({
        tituloId: id,
        tipo: i.tipo,
        descricao: i.descricao,
        valorCentavos: i.valor,
        destino: i.destino,
        beneficiarioId: i.beneficiarioId ?? null,
        contaGerencialId: i.contaGerencialId ?? null,
        taxaBp: i.taxaBp ?? 0,
        taxaTipo: i.taxaTipo ?? null,
        lancamentoAvulsoId: i.lancamentoAvulsoId ?? null
      }))
    )
    .run()
  return id
}

export function obterTituloBruto(infra: Infra, id: number) {
  const t = infra.db.select().from(titulo).where(eq(titulo.id, id)).get()
  if (!t) throw erro.naoEncontrado('Título')
  return t
}

/** Itens com o valor já quitado (pago + desconto) por baixas não estornadas. */
export function itensComSaldo(infra: Infra, tituloId: number) {
  const linhas = infra.bruto
    .prepare(
      `SELECT ti.*, coalesce((SELECT sum(bi.pago_centavos + bi.desconto_centavos) FROM baixa_item bi JOIN baixa b ON b.id = bi.baixa_id
         WHERE bi.titulo_item_id = ti.id AND b.estornada = 0), 0) quitado
       FROM titulo_item ti WHERE ti.titulo_id = ? ORDER BY ti.id`
    )
    .all(tituloId) as {
    id: number
    tipo: string
    descricao: string
    valor_centavos: number
    destino: DestinoItem
    beneficiario_id: number | null
    conta_gerencial_id: number | null
    taxa_bp: number
    taxa_tipo: 'ADMINISTRACAO' | 'INTERMEDIACAO' | null
    lancamento_avulso_id: number | null
    quitado: number
  }[]
  return linhas.map((l) => ({ ...l, saldo: l.valor_centavos - l.quitado }))
}

export function saldoTitulo(infra: Infra, tituloId: number): number {
  return itensComSaldo(infra, tituloId).reduce((s, i) => s + i.saldo, 0)
}

/** Recalcula a situação a partir das baixas (exceto títulos cancelados ou renegociados). */
export function atualizarSituacao(infra: Infra, tituloId: number): string {
  const t = obterTituloBruto(infra, tituloId)
  if (t.situacao === 'CANCELADO' || t.situacao === 'RENEGOCIADO') return t.situacao
  const saldo = saldoTitulo(infra, tituloId)
  const situacao = saldo === 0 ? 'LIQUIDADO' : saldo === t.valorCentavos ? 'ABERTO' : 'PARCIAL'
  if (situacao !== t.situacao) infra.db.update(titulo).set({ situacao, atualizadoEm: agoraIso(infra) }).where(eq(titulo.id, tituloId)).run()
  return situacao
}

export function baixasAtivas(infra: Infra, tituloId: number): number {
  return infra.db.select({ n: sql<number>`count(*)` }).from(baixa).where(and(eq(baixa.tituloId, tituloId), eq(baixa.estornada, false))).get()!.n
}

/** Cancela título sem baixas ativas. Lançamentos avulsos incluídos voltam a ficar pendentes. */
export function cancelarTitulo(infra: Infra, ator: Ator, id: number, motivo: string, interno = false): void {
  if (!interno) exigir(ator, 'financeiro.estornar')
  if (!motivo || motivo.trim().length < 5) throw erro.validacao('Informe o motivo do cancelamento.')
  const run = () => {
    const t = obterTituloBruto(infra, id)
    if (['CANCELADO', 'RENEGOCIADO', 'LIQUIDADO'].includes(t.situacao)) throw erro.regra('Título não pode ser cancelado nesta situação.')
    if (baixasAtivas(infra, id)) throw erro.regra('Título possui baixas. Estorne-as antes de cancelar.')
    if (t.repasseId && !interno) throw erro.regra('Título de repasse: cancele o repasse.')
    if (!interno && ORIGENS_GERENCIADAS.includes(t.origem)) throw erro.regra('Título de venda/comissão: cancele pela venda ou pela comissão.')
    infra.db
      .update(titulo)
      .set({ situacao: 'CANCELADO', motivoCancelamento: motivo.trim(), chaveIdempotencia: t.chaveIdempotencia ? `${t.chaveIdempotencia}:CANCELADO:${id}` : null, atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) })
      .where(eq(titulo.id, id))
      .run()
    infra.db.update(contratoLancamento).set({ situacao: 'PENDENTE', tituloId: null }).where(and(eq(contratoLancamento.tituloId, id), eq(contratoLancamento.situacao, 'INCLUIDO'))).run()
    auditar(infra, ator, { acao: 'TITULO_CANCELADO', entidade: 'titulo', entidadeId: id, descricao: `${t.descricao} — motivo: ${motivo.trim()}` })
  }
  if (interno) run()
  else infra.bruto.transaction(run)()
}

// ───── Consultas ─────

const SQL_SALDO = `(t.valor_centavos - coalesce((SELECT sum(bi.pago_centavos + bi.desconto_centavos) FROM baixa_item bi JOIN baixa b ON b.id = bi.baixa_id
  JOIN titulo_item ti ON ti.id = bi.titulo_item_id WHERE ti.titulo_id = t.id AND b.estornada = 0), 0))`

export interface FiltroTitulos {
  sentido?: 'RECEBER' | 'PAGAR'
  situacao?: string
  pessoaId?: number
  contratoId?: number
  origem?: string
  vencimentoDe?: string
  vencimentoAte?: string
  competencia?: string
  busca?: string
  pagina?: number
  porPagina?: number
}

export function listarTitulos(infra: Infra, ator: Ator, f: FiltroTitulos): { itens: TituloResumo[]; total: number; somaSaldo: number } {
  exigir(ator, 'financeiro.ver')
  const hoje = hojeIso(infra.agora())
  const cond: string[] = []
  const p: unknown[] = []
  const add = (c: string, ...v: unknown[]) => (cond.push(c), p.push(...v))
  if (f.sentido) add('t.sentido = ?', f.sentido)
  if (f.situacao === 'VENCIDO') add(`t.situacao IN ('ABERTO','PARCIAL') AND t.vencimento < ?`, hoje)
  else if (f.situacao === 'EM_ABERTO') cond.push(`t.situacao IN ('ABERTO','PARCIAL')`)
  else if (f.situacao) add('t.situacao = ?', f.situacao)
  if (f.pessoaId) add('t.pessoa_id = ?', f.pessoaId)
  if (f.contratoId) add('t.contrato_id = ?', f.contratoId)
  if (f.origem) add('t.origem = ?', f.origem)
  if (f.vencimentoDe) add('t.vencimento >= ?', f.vencimentoDe)
  if (f.vencimentoAte) add('t.vencimento <= ?', f.vencimentoAte)
  if (f.competencia) add('t.competencia = ?', f.competencia)
  if (f.busca) add('(lower(p.nome) LIKE ? OR lower(t.descricao) LIKE ? OR CAST(c.numero AS TEXT) = ?)', `%${f.busca.toLowerCase()}%`, `%${f.busca.toLowerCase()}%`, f.busca.trim())
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  const base = `FROM titulo t JOIN pessoa p ON p.id = t.pessoa_id LEFT JOIN contrato_locacao c ON c.id = t.contrato_id ${where}`
  const tot = infra.bruto.prepare(`SELECT count(*) n, coalesce(sum(${SQL_SALDO}), 0) s ${base}`).get(...p) as { n: number; s: number }
  const porPagina = Math.min(f.porPagina ?? 100, 500)
  const linhas = infra.bruto
    .prepare(
      `SELECT t.id, t.sentido, t.origem, t.descricao, t.competencia, t.pessoa_id pessoaId, p.nome pessoa, t.contrato_id contratoId, c.numero contratoNumero,
        t.vencimento, t.valor_centavos valorCentavos, ${SQL_SALDO} saldoCentavos, t.situacao
       ${base} ORDER BY t.vencimento, t.id LIMIT ? OFFSET ?`
    )
    .all(...p, porPagina, ((f.pagina ?? 1) - 1) * porPagina) as Omit<TituloResumo, 'diasAtraso'>[]
  return {
    itens: linhas.map((l) => ({ ...l, diasAtraso: ['ABERTO', 'PARCIAL'].includes(l.situacao) && l.vencimento < hoje ? diferencaDias(l.vencimento, hoje) : 0 })),
    total: tot.n,
    somaSaldo: tot.s
  }
}

export function obterTitulo(infra: Infra, ator: Ator, id: number): TituloDetalhe {
  exigir(ator, 'financeiro.ver')
  const t = obterTituloBruto(infra, id)
  const base = infra.bruto
    .prepare(
      `SELECT t.id, t.sentido, t.origem, t.descricao, t.competencia, t.pessoa_id pessoaId, p.nome pessoa, t.contrato_id contratoId, c.numero contratoNumero,
        t.vencimento, t.valor_centavos valorCentavos, ${SQL_SALDO} saldoCentavos, t.situacao
       FROM titulo t JOIN pessoa p ON p.id = t.pessoa_id LEFT JOIN contrato_locacao c ON c.id = t.contrato_id WHERE t.id = ?`
    )
    .get(id) as Omit<TituloResumo, 'diasAtraso'>
  const hoje = hojeIso(infra.agora())
  const nomes = new Map((infra.bruto.prepare('SELECT id, nome FROM pessoa').all() as { id: number; nome: string }[]).map((r) => [r.id, r.nome]))
  const itens: TituloItemDto[] = itensComSaldo(infra, id).map((i) => ({
    id: i.id,
    tipo: i.tipo,
    descricao: i.descricao,
    valorCentavos: i.valor_centavos,
    saldoCentavos: i.saldo,
    destino: i.destino,
    beneficiario: i.beneficiario_id ? (nomes.get(i.beneficiario_id) ?? null) : null,
    taxaBp: i.taxa_bp,
    taxaTipo: i.taxa_tipo
  }))
  const baixas: BaixaDto[] = infra.db
    .select({
      id: baixa.id,
      data: baixa.data,
      principalCentavos: baixa.principalCentavos,
      multaCentavos: baixa.multaCentavos,
      jurosCentavos: baixa.jurosCentavos,
      descontoCentavos: baixa.descontoCentavos,
      totalCentavos: baixa.totalCentavos,
      conta: contaFinanceira.nome,
      forma: baixa.forma,
      observacao: baixa.observacao,
      estornada: baixa.estornada,
      estornoMotivo: baixa.estornoMotivo,
      usuario: usuario.login
    })
    .from(baixa)
    .leftJoin(contaFinanceira, eq(contaFinanceira.id, baixa.contaFinanceiraId))
    .leftJoin(usuario, eq(usuario.id, baixa.criadoPor))
    .where(eq(baixa.tituloId, id))
    .orderBy(asc(baixa.id))
    .all()
  return {
    ...base,
    diasAtraso: ['ABERTO', 'PARCIAL'].includes(base.situacao) && base.vencimento < hoje ? diferencaDias(base.vencimento, hoje) : 0,
    vencimentoOriginal: t.vencimentoOriginal,
    emissao: t.emissao,
    recurso: t.recurso,
    multaBp: t.multaBp,
    jurosMesBp: t.jurosMesBp,
    destinoEncargos: t.destinoEncargos,
    itens,
    baixas,
    motivoCancelamento: t.motivoCancelamento,
    renegociacaoId: t.renegociacaoId,
    repasseId: t.repasseId
  }
}

export function previaRecebimento(infra: Infra, ator: Ator, tituloId: number, data: string): PreviaRecebimento {
  exigir(ator, 'financeiro.ver')
  const t = obterTituloBruto(infra, tituloId)
  const saldo = saldoTitulo(infra, tituloId)
  const enc = calcularEncargos(saldo, { vencimentoOriginal: t.vencimentoOriginal, vencimentoUtil: t.vencimento, dataPagamento: data, multaBp: t.multaBp, jurosMesBp: t.jurosMesBp })
  return { saldoCentavos: saldo, diasAtraso: enc.dias, multaCentavos: enc.multa, jurosCentavos: enc.juros, totalDevidoCentavos: saldo + enc.multa + enc.juros }
}

/** Títulos a receber vencidos, com encargos calculados até a data de referência. */
export function inadimplencia(infra: Infra, ator: Ator, dataRef?: string): InadimplenciaLinha[] {
  exigir(ator, 'financeiro.ver')
  const hoje = dataRef ?? hojeIso(infra.agora())
  const linhas = infra.bruto
    .prepare(
      `SELECT t.id, t.contrato_id, c.numero, p.nome, t.descricao, t.vencimento, t.vencimento_original, t.multa_bp, t.juros_mes_bp, ${SQL_SALDO} saldo,
        (SELECT i.logradouro || ', ' || i.numero || ' — ' || i.bairro FROM imovel i WHERE i.id = c.imovel_id) imovel
       FROM titulo t JOIN pessoa p ON p.id = t.pessoa_id LEFT JOIN contrato_locacao c ON c.id = t.contrato_id
       WHERE t.sentido = 'RECEBER' AND t.situacao IN ('ABERTO','PARCIAL') AND t.vencimento < ? ORDER BY t.vencimento`
    )
    .all(hoje) as { id: number; contrato_id: number | null; numero: number | null; nome: string; descricao: string; vencimento: string; vencimento_original: string; multa_bp: number; juros_mes_bp: number; saldo: number; imovel: string | null }[]
  return linhas.map((l) => {
    const e = calcularEncargos(l.saldo, { vencimentoOriginal: l.vencimento_original, vencimentoUtil: l.vencimento, dataPagamento: hoje, multaBp: l.multa_bp, jurosMesBp: l.juros_mes_bp })
    return {
      tituloId: l.id,
      contratoId: l.contrato_id,
      contratoNumero: l.numero,
      pessoa: l.nome,
      imovel: l.imovel,
      descricao: l.descricao,
      vencimento: l.vencimento,
      diasAtraso: e.dias,
      saldoCentavos: l.saldo,
      multaCentavos: e.multa,
      jurosCentavos: e.juros,
      totalCentavos: l.saldo + e.multa + e.juros
    }
  })
}
