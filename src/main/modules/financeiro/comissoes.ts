// Comissões de venda e de intermediação de locação: a receber pela imobiliária e rateio aos beneficiários.
//
// Regra (Q23): a parte de cada corretor/parceiro só vira "a pagar" na proporção do que a imobiliária
// efetivamente recebeu. O valor recebido é apurado no razão (receita de comissão de venda 3.2.01 ou de
// intermediação 3.1.02), por isso estornos são refletidos automaticamente na próxima sincronização.
import { and, eq, inArray } from 'drizzle-orm'
import type { ComissaoDto, LinhaComissaoBeneficiario } from '@shared/dto-crm'
import { erro } from '@shared/erros'
import { ratear } from '@shared/financeiro/calculos'
import { hojeIso } from '@shared/financeiro/datas'
import { PAPEIS_RATEIO, rateioPadraoSchema, rateioSchema, type RateioInput, type RateioPadrao, type RateioValidado } from '@shared/schemas-crm'
import { comissao, comissaoLiberacao, comissaoRateio, configuracao, titulo, vendaParcela } from '../../infra/db/schema'
import { agoraIso, exigir, pode, type Ator, type Infra } from '../../nucleo/contexto'
import { lerConfig } from '../configuracoes/configuracoes'
import { auditar, type Autor } from '../seguranca/auditoria'
import { idConta } from './razao'
import { baixasAtivas, cancelarTitulo, criarTitulo } from './titulos'

export const CONTA_RECEITA_COMISSAO = { VENDA: '3.2.01', LOCACAO: '3.1.02' } as const
export const CONTA_DESPESA_COMISSAO = '4.1.03'

type Comissao = typeof comissao.$inferSelect

/** Títulos cujos recebimentos geram receita para a comissão de venda (título próprio e sinais pela imobiliária). */
function titulosDaComissao(infra: Infra, c: Comissao): number[] {
  const ids = c.tituloId ? [c.tituloId] : []
  if (c.vendaId) ids.push(...infra.db.select({ t: vendaParcela.tituloId }).from(vendaParcela).where(eq(vendaParcela.vendaId, c.vendaId)).all().flatMap((r) => (r.t ? [r.t] : [])))
  return ids
}

/** Valor da comissão já recebido pela imobiliária (líquido de estornos), limitado ao valor da comissão. */
export function recebidoComissao(infra: Infra, c: Comissao): number {
  const conta = idConta(infra, CONTA_RECEITA_COMISSAO[c.origem])
  let v = 0
  if (c.origem === 'LOCACAO') {
    v = (infra.bruto.prepare('SELECT coalesce(sum(credito_centavos - debito_centavos), 0) v FROM partida WHERE conta_gerencial_id = ? AND contrato_id = ?').get(conta, c.contratoId) as { v: number }).v
  } else {
    const ids = titulosDaComissao(infra, c)
    if (ids.length) v = (infra.bruto.prepare(`SELECT coalesce(sum(credito_centavos - debito_centavos), 0) v FROM partida WHERE conta_gerencial_id = ? AND titulo_id IN (${ids.map(() => '?').join(',')})`).get(conta, ...ids) as { v: number }).v
  }
  return Math.max(0, Math.min(c.valorCentavos, v))
}

/**
 * Quanto de cada parte do rateio deve estar liberado para um valor recebido.
 * Parcial: arredonda para baixo (nunca diminui à medida que o recebido cresce). Integral: o valor exato do rateio.
 */
export function alvoLiberacao(recebido: number, valorComissao: number, rateio: { percentualBp: number; valorCentavos: number }[]): number[] {
  if (recebido >= valorComissao) return rateio.map((r) => r.valorCentavos)
  return rateio.map((r) => Math.floor((recebido * r.percentualBp) / 10_000))
}

function liberacoesAtivas(infra: Infra, rateioId: number) {
  return infra.db
    .select({ id: comissaoLiberacao.id, valor: comissaoLiberacao.valorCentavos, tituloId: comissaoLiberacao.tituloId })
    .from(comissaoLiberacao)
    .where(and(eq(comissaoLiberacao.rateioId, rateioId), eq(comissaoLiberacao.cancelada, false)))
    .all()
}

function descricaoComissao(infra: Infra, c: Comissao): string {
  if (c.origem === 'LOCACAO') {
    const n = infra.bruto.prepare('SELECT numero FROM contrato_locacao WHERE id = ?').get(c.contratoId) as { numero: number } | undefined
    return `intermediação da locação — contrato nº ${n?.numero ?? c.contratoId}`
  }
  const i = infra.bruto.prepare('SELECT im.codigo FROM venda v JOIN imovel im ON im.id = v.imovel_id WHERE v.id = ?').get(c.vendaId) as { codigo: number } | undefined
  return `venda nº ${c.vendaId} — imóvel ${i?.codigo ?? ''}`.trim()
}

/** Ajusta as liberações de uma comissão ao valor recebido (dentro da transação do chamador). */
export function sincronizarComissao(infra: Infra, ator: Autor, comissaoId: number, data: string, baixaId: number | null = null): void {
  const c = infra.db.select().from(comissao).where(eq(comissao.id, comissaoId)).get()
  if (!c || c.situacao !== 'ATIVA') return
  const rateio = infra.db.select().from(comissaoRateio).where(eq(comissaoRateio.comissaoId, c.id)).orderBy(comissaoRateio.ordem).all()
  const alvo = alvoLiberacao(recebidoComissao(infra, c), c.valorCentavos, rateio)
  const despesa = idConta(infra, CONTA_DESPESA_COMISSAO)
  rateio.forEach((r, k) => {
    if (r.papel === 'IMOBILIARIA' || !r.beneficiarioId) return
    let ativas = liberacoesAtivas(infra, r.id)
    let liberado = ativas.reduce((s, l) => s + l.valor, 0)
    // Recebimento estornado: cancela liberações ainda não pagas, das mais recentes para as mais antigas.
    for (const l of [...ativas].reverse()) {
      if (liberado <= alvo[k]!) break
      if (baixasAtivas(infra, l.tituloId)) continue
      cancelarTitulo(infra, ator as Ator, l.tituloId, 'Recebimento da comissão estornado', true)
      infra.db.update(comissaoLiberacao).set({ cancelada: true }).where(eq(comissaoLiberacao.id, l.id)).run()
      liberado -= l.valor
    }
    if (liberado > alvo[k]!) {
      const nome = (infra.bruto.prepare('SELECT nome FROM pessoa WHERE id = ?').get(r.beneficiarioId) as { nome: string }).nome
      throw erro.regra(`A comissão de ${nome} já foi paga com base neste recebimento. Estorne o pagamento ao beneficiário antes.`)
    }
    ativas = liberacoesAtivas(infra, r.id)
    const falta = alvo[k]! - liberado
    if (falta <= 0) return
    const papel = PAPEIS_RATEIO[r.papel]
    const tituloId = criarTitulo(infra, ator, {
      sentido: 'PAGAR',
      origem: 'COMISSAO_CORRETOR',
      pessoaId: r.beneficiarioId,
      descricao: `Comissão (${papel.toLowerCase()} ${r.percentualBp / 100}%) — ${descricaoComissao(infra, c)}`,
      emissao: data,
      vencimentoOriginal: data,
      vencimento: data,
      recurso: 'PROPRIO',
      itens: [{ tipo: 'COMISSAO', descricao: `Comissão — ${papel}`, valor: falta, destino: 'DESPESA', contaGerencialId: despesa }]
    })
    infra.db.insert(comissaoLiberacao).values({ rateioId: r.id, baixaId, valorCentavos: falta, tituloId, criadoEm: agoraIso(infra) }).run()
    auditar(infra, ator, { acao: 'COMISSAO_LIBERADA', entidade: 'comissao', entidadeId: c.id, descricao: `${papel}: ${(falta / 100).toFixed(2)} liberado(s) após recebimento` })
  })
}

/** Chamado após recebimento ou estorno de um título: sincroniza as comissões ligadas a ele. */
export function sincronizarPorTitulo(infra: Infra, ator: Autor, tituloId: number, data: string, baixaId: number | null = null): void {
  const t = infra.db.select({ origem: titulo.origem, contratoId: titulo.contratoId }).from(titulo).where(eq(titulo.id, tituloId)).get()
  if (!t) return
  const ids = new Set<number>()
  for (const r of infra.db.select({ id: comissao.id }).from(comissao).where(and(eq(comissao.tituloId, tituloId), eq(comissao.situacao, 'ATIVA'))).all()) ids.add(r.id)
  const venda = infra.db.select({ v: vendaParcela.vendaId }).from(vendaParcela).where(eq(vendaParcela.tituloId, tituloId)).get()
  if (venda) for (const r of infra.db.select({ id: comissao.id }).from(comissao).where(and(eq(comissao.vendaId, venda.v), eq(comissao.situacao, 'ATIVA'))).all()) ids.add(r.id)
  if (t.contratoId)
    for (const r of infra.db.select({ id: comissao.id }).from(comissao).where(and(eq(comissao.contratoId, t.contratoId), eq(comissao.origem, 'LOCACAO'), eq(comissao.situacao, 'ATIVA'))).all()) ids.add(r.id)
  for (const id of ids) sincronizarComissao(infra, ator, id, data, baixaId)
}

/** Grava o rateio já validado (valores exatos pelo maior resto). Só é permitido antes de qualquer liberação. */
export function gravarRateio(infra: Infra, comissaoId: number, r: RateioValidado): void {
  const c = infra.db.select().from(comissao).where(eq(comissao.id, comissaoId)).get()
  if (!c) throw erro.naoEncontrado('Comissão')
  const atuais = infra.db.select({ id: comissaoRateio.id }).from(comissaoRateio).where(eq(comissaoRateio.comissaoId, comissaoId)).all()
  if (atuais.length && infra.db.select({ id: comissaoLiberacao.id }).from(comissaoLiberacao).where(inArray(comissaoLiberacao.rateioId, atuais.map((a) => a.id))).get())
    throw erro.regra('Já há valores liberados para esta comissão; o rateio não pode mais ser alterado.')
  if (atuais.length) infra.db.delete(comissaoRateio).where(eq(comissaoRateio.comissaoId, comissaoId)).run()
  const valores = ratear(c.valorCentavos, r.map((x) => x.percentual))
  infra.db
    .insert(comissaoRateio)
    .values(r.map((x, i) => ({ comissaoId, papel: x.papel, beneficiarioId: x.beneficiarioId, percentualBp: x.percentual, valorCentavos: valores[i]!, ordem: i })))
    .run()
}

export function alterarRateio(infra: Infra, ator: Ator, comissaoId: number, entrada: RateioInput): void {
  exigir(ator, 'comissoes.gerenciar')
  infra.bruto.transaction(() => {
    gravarRateio(infra, comissaoId, rateioSchema.parse(entrada))
    sincronizarComissao(infra, ator, comissaoId, hojeIso(infra.agora()))
    auditar(infra, ator, { acao: 'COMISSAO_RATEIO_ALTERADO', entidade: 'comissao', entidadeId: comissaoId, depois: entrada })
  })()
}

/** Cancela a comissão (ex.: distrato sem comissão devida). Exige que nada tenha sido recebido. */
export function cancelarComissao(infra: Infra, ator: Ator, id: number, motivo: string, interno = false): void {
  if (!interno) exigir(ator, 'comissoes.gerenciar')
  if (!motivo || motivo.trim().length < 5) throw erro.validacao('Informe o motivo.')
  const run = () => {
    const c = infra.db.select().from(comissao).where(eq(comissao.id, id)).get()
    if (!c) throw erro.naoEncontrado('Comissão')
    if (c.situacao === 'CANCELADA') throw erro.regra('Comissão já cancelada.')
    if (recebidoComissao(infra, c) > 0) throw erro.regra('A comissão já teve recebimentos. Estorne-os antes de cancelar.')
    if (c.tituloId) {
      const t = infra.db.select({ s: titulo.situacao }).from(titulo).where(eq(titulo.id, c.tituloId)).get()
      if (t && ['ABERTO', 'PARCIAL'].includes(t.s)) cancelarTitulo(infra, ator, c.tituloId, `Comissão cancelada: ${motivo}`, true)
    }
    infra.db.update(comissao).set({ situacao: 'CANCELADA', motivoCancelamento: motivo.trim(), atualizadoEm: agoraIso(infra), atualizadoPor: ator.id }).where(eq(comissao.id, id)).run()
    auditar(infra, ator, { acao: 'COMISSAO_CANCELADA', entidade: 'comissao', entidadeId: id, descricao: motivo.trim() })
  }
  if (interno) run()
  else infra.bruto.transaction(run)()
}

export function lerRateioPadrao(infra: Infra): RateioPadrao {
  return lerConfig(infra, 'rateio_comissao') ?? { itens: [{ papel: 'IMOBILIARIA', percentualBp: 10_000 }] }
}

export function salvarRateioPadrao(infra: Infra, ator: Ator, entrada: RateioPadrao): void {
  exigir(ator, 'comissoes.gerenciar')
  const d = rateioPadraoSchema.parse(entrada)
  infra.bruto.transaction(() => {
    const json = JSON.stringify(d)
    infra.db.insert(configuracao).values({ chave: 'rateio_comissao', valor: json, atualizadoPor: ator.id }).onConflictDoUpdate({ target: configuracao.chave, set: { valor: json, atualizadoEm: agoraIso(infra), atualizadoPor: ator.id } }).run()
    auditar(infra, ator, { acao: 'CONFIG_ALTERADA', entidade: 'configuracao', entidadeId: 'rateio_comissao', depois: d })
  })()
}

/** Pessoa vinculada ao usuário (corretor), usada para restringir à própria carteira. */
export function pessoaDoUsuario(infra: Infra, ator: Ator): number | null {
  if (ator.id == null) return null
  return (infra.bruto.prepare('SELECT pessoa_id p FROM usuario WHERE id = ?').get(ator.id) as { p: number | null } | undefined)?.p ?? null
}

function totaisLiberacao(infra: Infra, rateioId: number) {
  return infra.bruto
    .prepare(
      `SELECT coalesce(sum(l.valor_centavos), 0) liberado,
        coalesce(sum((SELECT coalesce(sum(bi.pago_centavos), 0) FROM baixa_item bi JOIN baixa b ON b.id = bi.baixa_id JOIN titulo_item ti ON ti.id = bi.titulo_item_id WHERE ti.titulo_id = l.titulo_id AND b.estornada = 0)), 0) pago
       FROM comissao_liberacao l WHERE l.rateio_id = ? AND l.cancelada = 0`
    )
    .get(rateioId) as { liberado: number; pago: number }
}

export function obterComissao(infra: Infra, ator: Ator, id: number): ComissaoDto {
  exigir(ator, 'comissoes.ver')
  const c = infra.db.select().from(comissao).where(eq(comissao.id, id)).get()
  if (!c) throw erro.naoEncontrado('Comissão')
  return montarDto(infra, c)
}

function montarDto(infra: Infra, c: Comissao): ComissaoDto {
  const nomes = (pid: number | null) => (pid ? ((infra.bruto.prepare('SELECT nome FROM pessoa WHERE id = ?').get(pid) as { nome: string } | undefined)?.nome ?? null) : null)
  const rateio = infra.db.select().from(comissaoRateio).where(eq(comissaoRateio.comissaoId, c.id)).orderBy(comissaoRateio.ordem).all()
  return {
    id: c.id,
    origem: c.origem,
    descricao: descricaoComissao(infra, c),
    vendaId: c.vendaId,
    contratoId: c.contratoId,
    negocioId: c.negocioId,
    baseCentavos: c.baseCentavos,
    percentualBp: c.percentualBp,
    valorCentavos: c.valorCentavos,
    pagador: nomes(c.pagadorId),
    tituloId: c.tituloId,
    recebidoCentavos: recebidoComissao(infra, c),
    situacao: c.situacao,
    motivoCancelamento: c.motivoCancelamento,
    criadoEm: c.criadoEm,
    rateio: rateio.map((r) => {
      const t = r.papel === 'IMOBILIARIA' ? { liberado: 0, pago: 0 } : totaisLiberacao(infra, r.id)
      return { id: r.id, papel: r.papel, beneficiarioId: r.beneficiarioId, beneficiario: nomes(r.beneficiarioId), percentualBp: r.percentualBp, valorCentavos: r.valorCentavos, liberadoCentavos: t.liberado, pagoCentavos: t.pago }
    }),
    rateioEditavel: !rateio.some((r) => r.papel !== 'IMOBILIARIA' && totaisLiberacao(infra, r.id).liberado > 0) && c.situacao === 'ATIVA'
  }
}

export function listarComissoes(infra: Infra, ator: Ator, f: { situacao?: 'ATIVA' | 'CANCELADA'; origem?: 'VENDA' | 'LOCACAO' } = {}): ComissaoDto[] {
  exigir(ator, 'comissoes.ver')
  const todas = infra.db.select().from(comissao).orderBy(comissao.id).all().reverse()
  const filtradas = todas.filter((c) => (!f.situacao || c.situacao === f.situacao) && (!f.origem || c.origem === f.origem))
  const dtos = filtradas.map((c) => montarDto(infra, c))
  if (pode(ator, 'crm.carteira_toda')) return dtos
  // Sem acesso à carteira toda: apenas comissões em que o usuário é beneficiário.
  const pessoa = pessoaDoUsuario(infra, ator)
  return dtos.filter((d) => d.rateio.some((r) => r.beneficiarioId != null && r.beneficiarioId === pessoa))
}

/** Posição por beneficiário (relatório "Comissões por corretor"). */
export function comissoesPorBeneficiario(infra: Infra, ator: Ator): LinhaComissaoBeneficiario[] {
  exigir(ator, 'comissoes.ver')
  const linhas = new Map<number, LinhaComissaoBeneficiario>()
  for (const c of infra.db.select().from(comissao).where(eq(comissao.situacao, 'ATIVA')).all()) {
    for (const r of infra.db.select().from(comissaoRateio).where(eq(comissaoRateio.comissaoId, c.id)).all()) {
      if (!r.beneficiarioId) continue
      const t = totaisLiberacao(infra, r.id)
      const l = linhas.get(r.beneficiarioId) ?? { pessoaId: r.beneficiarioId, nome: '', comissoes: 0, previstoCentavos: 0, liberadoCentavos: 0, pagoCentavos: 0 }
      l.comissoes++
      l.previstoCentavos += r.valorCentavos
      l.liberadoCentavos += t.liberado
      l.pagoCentavos += t.pago
      linhas.set(r.beneficiarioId, l)
    }
  }
  const pessoa = pode(ator, 'crm.carteira_toda') ? null : pessoaDoUsuario(infra, ator)
  return [...linhas.values()]
    .filter((l) => pessoa === null ? pode(ator, 'crm.carteira_toda') : l.pessoaId === pessoa)
    .map((l) => ({ ...l, nome: (infra.bruto.prepare('SELECT nome FROM pessoa WHERE id = ?').get(l.pessoaId) as { nome: string }).nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
