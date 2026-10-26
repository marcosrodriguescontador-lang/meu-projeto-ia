// Baixas (recebimentos e pagamentos) com contabilização automática e estorno.
//
// Recebimento de aluguel (exemplo): D Disponibilidades | C Proprietário (valores a repassar) | C Terceiros (condomínio)
// Apropriação da taxa: D Proprietário | C Receita de administração. Nada é receita própria além das taxas
// e dos itens destinados à imobiliária.
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { erro } from '@shared/erros'
import { alocarProporcional, decomporPagamento, percentualDe, ratear } from '@shared/financeiro/calculos'
import { hojeIso } from '@shared/financeiro/datas'
import { FORMAS_PAGAMENTO, baixaPagarSchema, baixaReceberSchema, estornoSchema, type BaixaPagarInput, type BaixaReceberInput } from '@shared/schemas-locacao'
import { baixa, baixaItem, contaGerencial, contratoParte, partida, repasse, titulo } from '../../infra/db/schema'
import { agoraIso, exigir, pode, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'
import { exigirContaAtiva, saldoContaFinanceira } from './cadastros'
import { CONTAS, estornarLancamento, registrarLancamento, type PartidaNova } from './razao'
import { atualizarSituacao, itensComSaldo, obterTituloBruto, saldoTitulo } from './titulos'

export function locadoresDoContrato(infra: Infra, contratoId: number): { pessoaId: number; percentualBp: number }[] {
  const l = infra.db
    .select({ pessoaId: contratoParte.pessoaId, percentualBp: contratoParte.percentualBp, principal: contratoParte.principal })
    .from(contratoParte)
    .where(and(eq(contratoParte.contratoId, contratoId), eq(contratoParte.papel, 'LOCADOR')))
    .all()
  return l.sort((a, b) => Number(b.principal) - Number(a.principal) || a.pessoaId - b.pessoaId)
}

function codigoConta(infra: Infra, id: number | null, padrao: string): string {
  if (!id) return padrao
  return infra.db.select({ c: contaGerencial.codigo }).from(contaGerencial).where(eq(contaGerencial.id, id)).get()?.c ?? padrao
}

const rotuloForma = (f: string) => FORMAS_PAGAMENTO[f as keyof typeof FORMAS_PAGAMENTO] ?? f

/** Valor creditado aos proprietários, rateado pela participação no contrato (o principal recebe o resto). */
function creditarProprietarios(partidas: PartidaNova[], locadores: { pessoaId: number; percentualBp: number }[], valor: number, historico: string, ctx: { contratoId: number | null; tituloId: number }) {
  const partes = ratear(valor, locadores.map((l) => l.percentualBp))
  partes.forEach((v, i) => partidas.push({ conta: CONTAS.PROPRIETARIOS, valor: -v, historico, pessoaId: locadores[i]!.pessoaId, contratoId: ctx.contratoId, tituloId: ctx.tituloId }))
  return partes
}

export interface ResultadoBaixa {
  baixaId: number
  principal: number
  multa: number
  juros: number
  desconto: number
  total: number
}

export function receber(infra: Infra, ator: Ator, entrada: BaixaReceberInput): ResultadoBaixa {
  exigir(ator, 'financeiro.receber')
  const d = baixaReceberSchema.parse(entrada)
  if ((d.desconto > 0 || d.dispensarEncargos) && !pode(ator, 'financeiro.dispensar_encargos')) throw erro.semPermissao()
  if (d.data > hojeIso(infra.agora())) throw erro.validacao('A data do recebimento não pode ser futura.', { data: 'Data futura' })
  return infra.bruto.transaction(() => {
    const t = obterTituloBruto(infra, d.tituloId)
    if (t.sentido !== 'RECEBER') throw erro.regra('Este título é a pagar.')
    if (!['ABERTO', 'PARCIAL'].includes(t.situacao)) throw erro.regra(`Título ${t.situacao.toLowerCase()} não pode receber baixa.`)
    const conta = exigirContaAtiva(infra, d.contaFinanceiraId)
    const itens = itensComSaldo(infra, t.id)
    const saldo = itens.reduce((s, i) => s + i.saldo, 0)
    if (d.desconto > saldo) throw erro.validacao('Desconto maior que o saldo.', { desconto: 'Maior que o saldo' })
    let dec: { principal: number; multa: number; juros: number }
    try {
      dec = decomporPagamento(d.valorRecebido!, saldo - d.desconto, { vencimentoOriginal: t.vencimentoOriginal, vencimentoUtil: t.vencimento, dataPagamento: d.data, multaBp: t.multaBp, jurosMesBp: t.jurosMesBp }, d.dispensarEncargos)
    } catch (e) {
      throw erro.validacao(e instanceof Error ? e.message : String(e), { valorRecebido: 'Valor inválido' })
    }
    const quitacao = dec.principal + d.desconto
    const alocado = alocarProporcional(quitacao, itens.map((i) => i.saldo))
    const descontos = d.desconto ? alocarProporcional(d.desconto, alocado) : alocado.map(() => 0)
    const total = dec.principal + dec.multa + dec.juros

    const { id: baixaId } = infra.db
      .insert(baixa)
      .values({ tituloId: t.id, data: d.data, principalCentavos: dec.principal, multaCentavos: dec.multa, jurosCentavos: dec.juros, descontoCentavos: d.desconto, totalCentavos: total, contaFinanceiraId: conta.id, forma: d.forma, observacao: d.observacao, criadoEm: agoraIso(infra), criadoPor: ator.id })
      .returning({ id: baixa.id })
      .get()
    const linhasItem = itens.map((i, k) => ({ baixaId, tituloItemId: i.id, pagoCentavos: alocado[k]! - descontos[k]!, descontoCentavos: descontos[k]! })).filter((l) => l.pagoCentavos || l.descontoCentavos)
    if (linhasItem.length) infra.db.insert(baixaItem).values(linhasItem).run()

    // Contabilização
    const ctx = { contratoId: t.contratoId, tituloId: t.id }
    const locadores = t.contratoId ? locadoresDoContrato(infra, t.contratoId) : []
    const partidas: PartidaNova[] = []
    if (total > 0) partidas.push({ conta: CONTAS.DISPONIBILIDADES, valor: total, historico: `Recebimento — ${t.descricao}`, contaFinanceiraId: conta.id, ...ctx })
    itens.forEach((item, k) => {
      const pago = alocado[k]! - descontos[k]!
      if (!pago) return
      const hist = t.descricao.startsWith(item.descricao) ? t.descricao : `${item.descricao} — ${t.descricao}`
      switch (item.destino) {
        case 'PROPRIETARIO': {
          if (!locadores.length) throw new Error('Título com valor do proprietário sem locadores no contrato')
          const partes = creditarProprietarios(partidas, locadores, pago, hist, ctx)
          if (item.taxa_bp > 0 && item.taxa_tipo && pago > 0) {
            const receita = item.taxa_tipo === 'INTERMEDIACAO' ? CONTAS.RECEITA_INTERMEDIACAO : CONTAS.RECEITA_ADMINISTRACAO
            const rotulo = item.taxa_tipo === 'INTERMEDIACAO' ? 'Taxa de intermediação' : 'Taxa de administração'
            let totalTaxa = 0
            partes.forEach((v, i) => {
              const taxa = percentualDe(v, item.taxa_bp)
              totalTaxa += taxa
              partidas.push({ conta: CONTAS.PROPRIETARIOS, valor: taxa, historico: `${rotulo} (${item.taxa_bp / 100}%) — ${t.descricao}`, pessoaId: locadores[i]!.pessoaId, ...ctx })
            })
            partidas.push({ conta: receita, valor: -totalTaxa, historico: `${rotulo} — ${t.descricao}`, ...ctx })
          }
          break
        }
        case 'TERCEIRO':
          partidas.push({ conta: CONTAS.TERCEIROS, valor: -pago, historico: hist, pessoaId: item.beneficiario_id, ...ctx })
          break
        case 'IMOBILIARIA':
          partidas.push({ conta: codigoConta(infra, item.conta_gerencial_id, CONTAS.RECEITA_OUTRAS), valor: -pago, historico: hist, ...ctx })
          break
        case 'CAUCAO':
          partidas.push({ conta: CONTAS.CAUCOES, valor: -pago, historico: hist, pessoaId: t.pessoaId, ...ctx })
          break
        default:
          throw new Error(`Destino ${item.destino} inválido em título a receber`)
      }
    })
    const encargos = dec.multa + dec.juros
    if (encargos) {
      const hist = `Multa e juros por atraso — ${t.descricao}`
      if (t.destinoEncargos === 'PROPRIETARIO' && locadores.length) creditarProprietarios(partidas, locadores, encargos, hist, ctx)
      else partidas.push({ conta: CONTAS.RECEITA_ENCARGOS, valor: -encargos, historico: hist, ...ctx })
    }
    if (partidas.length) {
      const lancamentoId = registrarLancamento(infra, ator, { data: d.data, historico: `Recebimento — ${t.descricao}`, origem: 'BAIXA', origemId: baixaId, partidas })
      infra.db.update(baixa).set({ lancamentoId }).where(eq(baixa.id, baixaId)).run()
    }
    const situacao = atualizarSituacao(infra, t.id)
    auditar(infra, ator, {
      acao: 'RECEBIMENTO_REGISTRADO',
      entidade: 'titulo',
      entidadeId: t.id,
      descricao: `${t.descricao}: ${(total / 100).toFixed(2)} (${rotuloForma(d.forma)}, ${conta.nome})${d.desconto ? `, desconto ${(d.desconto / 100).toFixed(2)}` : ''}${d.dispensarEncargos ? ', encargos dispensados' : ''} → ${situacao}`
    })
    return { baixaId, principal: dec.principal, multa: dec.multa, juros: dec.juros, desconto: d.desconto, total }
  })()
}

export function pagar(infra: Infra, ator: Ator, entrada: BaixaPagarInput): ResultadoBaixa {
  exigir(ator, 'financeiro.pagar')
  const d = baixaPagarSchema.parse(entrada)
  if (d.data > hojeIso(infra.agora())) throw erro.validacao('A data do pagamento não pode ser futura.', { data: 'Data futura' })
  return infra.bruto.transaction(() => {
    const t = obterTituloBruto(infra, d.tituloId)
    if (t.sentido !== 'PAGAR') throw erro.regra('Este título é a receber.')
    if (!['ABERTO', 'PARCIAL'].includes(t.situacao)) throw erro.regra(`Título ${t.situacao.toLowerCase()} não pode ser pago.`)
    const conta = exigirContaAtiva(infra, d.contaFinanceiraId)
    const valor = d.valor!
    const itens = itensComSaldo(infra, t.id)
    const saldo = itens.reduce((s, i) => s + i.saldo, 0)
    if (valor > saldo) throw erro.validacao('Valor maior que o saldo do título.', { valor: 'Maior que o saldo' })
    const disponivel = saldoContaFinanceira(infra, conta.id)
    if (disponivel < valor) throw erro.regra(`Saldo insuficiente em "${conta.nome}" (disponível: ${(disponivel / 100).toFixed(2)}).`)
    const alocado = alocarProporcional(valor, itens.map((i) => i.saldo))
    const { id: baixaId } = infra.db
      .insert(baixa)
      .values({ tituloId: t.id, data: d.data, principalCentavos: valor, totalCentavos: valor, contaFinanceiraId: conta.id, forma: d.forma, observacao: d.observacao, criadoEm: agoraIso(infra), criadoPor: ator.id })
      .returning({ id: baixa.id })
      .get()
    const linhas = itens.map((i, k) => ({ baixaId, tituloItemId: i.id, pagoCentavos: alocado[k]!, descontoCentavos: 0 })).filter((l) => l.pagoCentavos)
    infra.db.insert(baixaItem).values(linhas).run()
    const partidas: PartidaNova[] = [{ conta: CONTAS.DISPONIBILIDADES, valor: -valor, historico: `Pagamento — ${t.descricao}`, contaFinanceiraId: conta.id, contratoId: t.contratoId, tituloId: t.id }]
    itens.forEach((item, k) => {
      if (!alocado[k]) return
      if (item.destino === 'DESPESA') {
        partidas.push({ conta: codigoConta(infra, item.conta_gerencial_id, '4.9.99'), valor: alocado[k]!, historico: `${item.descricao} — ${t.descricao}`, pessoaId: t.pessoaId, contratoId: t.contratoId, tituloId: t.id })
        return
      }
      if (item.destino !== 'PASSIVO') throw new Error('Título a pagar com item sem conta de passivo ou despesa')
      partidas.push({
        conta: codigoConta(infra, item.conta_gerencial_id, CONTAS.TERCEIROS),
        valor: alocado[k]!,
        historico: `${item.descricao} — pagamento`,
        pessoaId: item.beneficiario_id ?? t.pessoaId,
        contratoId: t.contratoId,
        tituloId: t.id,
        repasseId: t.repasseId
      })
    })
    const lancamentoId = registrarLancamento(infra, ator, { data: d.data, historico: `Pagamento — ${t.descricao}`, origem: 'BAIXA', origemId: baixaId, partidas })
    infra.db.update(baixa).set({ lancamentoId }).where(eq(baixa.id, baixaId)).run()
    const situacao = atualizarSituacao(infra, t.id)
    if (t.repasseId && situacao === 'LIQUIDADO') infra.db.update(repasse).set({ situacao: 'PAGO' }).where(eq(repasse.id, t.repasseId)).run()
    auditar(infra, ator, { acao: 'PAGAMENTO_REGISTRADO', entidade: 'titulo', entidadeId: t.id, descricao: `${t.descricao}: ${(valor / 100).toFixed(2)} (${rotuloForma(d.forma)}, ${conta.nome}) → ${situacao}` })
    return { baixaId, principal: valor, multa: 0, juros: 0, desconto: 0, total: valor }
  })()
}

/** Estorno de baixa: lançamento inverso + baixa marcada como estornada. O título volta a ter saldo. */
export function estornarBaixa(infra: Infra, ator: Ator, entrada: { baixaId: number; motivo: string }): void {
  exigir(ator, 'financeiro.estornar')
  const d = estornoSchema.parse(entrada)
  infra.bruto.transaction(() => {
    const b = infra.db.select().from(baixa).where(eq(baixa.id, d.baixaId)).get()
    if (!b) throw erro.naoEncontrado('Baixa')
    if (b.estornada) throw erro.regra('Baixa já estornada.')
    const t = obterTituloBruto(infra, b.tituloId)
    if (t.situacao === 'RENEGOCIADO' || t.situacao === 'CANCELADO') throw erro.regra('Título renegociado ou cancelado: estorno não permitido.')
    let estornoId: number | null = null
    if (b.lancamentoId) {
      if (t.sentido === 'RECEBER') {
        // Valores já incluídos em repasse ainda não pago exigem o cancelamento do repasse antes.
        const emRepasse = infra.db
          .select({ id: repasse.id, situacao: repasse.situacao })
          .from(partida)
          .innerJoin(repasse, eq(repasse.id, partida.repasseId))
          .where(and(eq(partida.lancamentoId, b.lancamentoId), isNotNull(partida.repasseId), inArray(repasse.situacao, ['ABERTO'])))
          .get()
        if (emRepasse) throw erro.regra(`Este recebimento está no repasse nº ${emRepasse.id}, ainda não pago. Cancele o repasse antes de estornar.`)
      }
      estornoId = estornarLancamento(infra, ator, b.lancamentoId, hojeIso(infra.agora()), `Estorno da baixa #${b.id} — ${t.descricao}: ${d.motivo}`, t.sentido === 'PAGAR')
    }
    infra.db
      .update(baixa)
      .set({ estornada: true, estornoLancamentoId: estornoId, estornoMotivo: d.motivo, estornadaEm: agoraIso(infra), estornadaPor: ator.id })
      .where(eq(baixa.id, b.id))
      .run()
    atualizarSituacao(infra, t.id)
    if (t.repasseId) infra.db.update(repasse).set({ situacao: 'ABERTO' }).where(and(eq(repasse.id, t.repasseId), eq(repasse.situacao, 'PAGO'))).run()
    auditar(infra, ator, { acao: 'BAIXA_ESTORNADA', entidade: 'titulo', entidadeId: t.id, descricao: `Baixa #${b.id} de ${(b.totalCentavos / 100).toFixed(2)} estornada — motivo: ${d.motivo}` })
  })()
}

export { saldoTitulo, titulo }
