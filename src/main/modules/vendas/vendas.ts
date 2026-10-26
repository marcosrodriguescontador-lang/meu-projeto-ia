// Venda: registro do negócio fechado, forma de pagamento, comissão a receber e rateio.
// Registrar a venda NÃO gera recebimento: cria apenas títulos a receber (comissão e, se for o caso,
// valores que transitarão pela imobiliária como recursos de terceiros).
import { and, eq, inArray } from 'drizzle-orm'
import type { ParcelaVendaDto, VendaDto } from '@shared/dto-crm'
import { erro } from '@shared/erros'
import { percentualDe, ratear } from '@shared/financeiro/calculos'
import { proximoDiaUtil } from '@shared/financeiro/calendario'
import { hojeIso } from '@shared/financeiro/datas'
import { comissaoLocacaoSchema, situacaoVendaSchema, SITUACOES_VENDA, vendaSchema, type ComissaoLocacaoInput, type SituacaoVendaInput, type VendaInput } from '@shared/schemas-crm'
import { comissao, imovelOferta, imovelProprietario, negocio, proposta, titulo, venda, vendaParcela, vendaParte } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { carteira, exigirCarteira } from '../crm/carteira'
import { ordemEtapa, registrarEtapa } from '../crm/etapas'
import { locadoresDoContrato } from '../financeiro/baixas'
import { feriadosLocais } from '../financeiro/cadastros'
import { CONTA_RECEITA_COMISSAO, gravarRateio, sincronizarComissao } from '../financeiro/comissoes'
import { idConta } from '../financeiro/razao'
import { baixasAtivas, cancelarTitulo, criarTitulo, type ItemNovo } from '../financeiro/titulos'
import { aplicarSituacaoOferta } from '../imoveis/imoveis'
import { auditar } from '../seguranca/auditoria'

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function negocioAcessivel(infra: Infra, ator: Ator, id: number) {
  const n = infra.db.select().from(negocio).where(eq(negocio.id, id)).get()
  if (!n) throw erro.naoEncontrado('Negócio')
  exigirCarteira(carteira(infra, ator), n)
  return n
}

export function registrarVenda(infra: Infra, ator: Ator, entrada: VendaInput): { vendaId: number; comissaoId: number | null } {
  exigir(ator, 'vendas.registrar')
  const d = vendaSchema.parse(entrada)
  const n = negocioAcessivel(infra, ator, d.negocioId)
  if (n.tipo !== 'VENDA') throw erro.regra('Este negócio é de locação: conclua-o vinculando o contrato de locação.')
  if (n.etapa === 'CONCLUIDO' || n.etapa === 'PERDIDO') throw erro.regra('Negócio encerrado.')
  if (!n.imovelId) throw erro.regra('Informe o imóvel do negócio.')
  if (infra.db.select({ id: venda.id }).from(venda).where(eq(venda.negocioId, n.id)).get()) throw erro.regra('Este negócio já tem venda registrada.')
  if (d.dataContrato > hojeIso(infra.agora())) throw erro.validacao('A data do contrato não pode ser futura.', { dataContrato: 'Data futura' })
  if (d.propostaId) {
    const p = infra.db.select().from(proposta).where(and(eq(proposta.id, d.propostaId), eq(proposta.negocioId, n.id))).get()
    if (!p || p.situacao !== 'ACEITA') throw erro.regra('A proposta vinculada deve estar aceita.')
  }
  const oferta = infra.db.select().from(imovelOferta).where(and(eq(imovelOferta.imovelId, n.imovelId), eq(imovelOferta.modalidade, 'VENDA'))).get()
  if (!oferta || ['VENDIDO', 'INATIVO', 'INDISPONIVEL'].includes(oferta.situacao)) throw erro.regra('O imóvel não está ofertado para venda.')
  const donos = new Set(infra.db.select({ p: imovelProprietario.pessoaId }).from(imovelProprietario).where(eq(imovelProprietario.imovelId, n.imovelId)).all().map((r) => r.p))
  if (d.vendedores.some((v) => !donos.has(v.pessoaId))) throw erro.validacao('Os vendedores devem ser proprietários do imóvel no cadastro.', { vendedores: 'Não é proprietário' })
  if (d.compradores.some((c) => d.vendedores.some((v) => v.pessoaId === c.pessoaId))) throw erro.validacao('Comprador e vendedor não podem ser a mesma pessoa.', { compradores: 'Também é vendedor' })
  const valorComissao = percentualDe(d.valor!, d.comissaoPercentual)
  const sinalImob = d.parcelas.findIndex((p) => p.tipo === 'SINAL' && p.viaImobiliaria)
  if (d.comissaoDescontadaDoSinal && valorComissao > (d.parcelas[sinalImob]?.valor ?? 0)) throw erro.validacao('O sinal é menor que a comissão a descontar.', { comissaoDescontadaDoSinal: 'Sinal insuficiente' })
  const feriados = feriadosLocais(infra)
  const receitaComissao = idConta(infra, CONTA_RECEITA_COMISSAO.VENDA)
  const comprador = d.compradores[0]!.pessoaId
  const vendedoresPct = d.vendedores.map((v) => v.percentual)

  return infra.bruto.transaction(() => {
    const { id: vendaId } = infra.db
      .insert(venda)
      .values({ negocioId: n.id, imovelId: n.imovelId!, propostaId: d.propostaId, dataContrato: d.dataContrato, valorCentavos: d.valor!, financiamentoBanco: d.financiamentoBanco, financiamentoCentavos: d.parcelas.filter((p) => p.tipo === 'FINANCIAMENTO').reduce((s, p) => s + p.valor!, 0), situacao: 'CONTRATADA', observacoes: d.observacoes, criadoPor: ator.id, atualizadoPor: ator.id })
      .returning({ id: venda.id })
      .get()
    infra.db
      .insert(vendaParte)
      .values([...d.compradores.map((p) => ({ vendaId, pessoaId: p.pessoaId, papel: 'COMPRADOR' as const, percentualBp: p.percentual })), ...d.vendedores.map((p) => ({ vendaId, pessoaId: p.pessoaId, papel: 'VENDEDOR' as const, percentualBp: p.percentual }))])
      .run()
    d.parcelas.forEach((p, k) => {
      let tituloId: number | null = null
      if (p.viaImobiliaria) {
        // Valor do vendedor que transita pela imobiliária: recurso de terceiros, repassado depois (Q25).
        const comissaoNoSinal = d.comissaoDescontadaDoSinal && k === sinalImob ? valorComissao : 0
        const partes = ratear(p.valor! - comissaoNoSinal, vendedoresPct)
        const itens: ItemNovo[] = partes.map((v, i) => ({ tipo: 'VENDA', descricao: `${p.descricao} — vendedor`, valor: v, destino: 'TERCEIRO', beneficiarioId: d.vendedores[i]!.pessoaId }))
        if (comissaoNoSinal) itens.push({ tipo: 'COMISSAO', descricao: 'Comissão de intermediação (retida do sinal)', valor: comissaoNoSinal, destino: 'IMOBILIARIA', contaGerencialId: receitaComissao })
        tituloId = criarTitulo(infra, ator, {
          sentido: 'RECEBER',
          origem: p.tipo === 'SINAL' ? 'SINAL_VENDA' : 'PARCELA_VENDA',
          pessoaId: comprador,
          descricao: `${p.descricao} — venda nº ${vendaId}`,
          emissao: hojeIso(infra.agora()),
          vencimentoOriginal: p.vencimento,
          vencimento: proximoDiaUtil(p.vencimento, feriados),
          recurso: 'TERCEIROS',
          destinoEncargos: 'IMOBILIARIA',
          itens
        })
      }
      infra.db.insert(vendaParcela).values({ vendaId, tipo: p.tipo, descricao: p.descricao, valorCentavos: p.valor!, vencimento: p.vencimento, viaImobiliaria: p.viaImobiliaria, tituloId }).run()
    })

    let comissaoId: number | null = null
    if (valorComissao > 0) {
      let tituloComissao: number | null = null
      if (!d.comissaoDescontadaDoSinal)
        tituloComissao = criarTitulo(infra, ator, {
          sentido: 'RECEBER',
          origem: 'COMISSAO_VENDA',
          pessoaId: d.comissaoPagadorId!,
          descricao: `Comissão de intermediação — venda nº ${vendaId}`,
          emissao: hojeIso(infra.agora()),
          vencimentoOriginal: d.comissaoVencimento!,
          vencimento: proximoDiaUtil(d.comissaoVencimento!, feriados),
          recurso: 'PROPRIO',
          destinoEncargos: 'IMOBILIARIA',
          itens: [{ tipo: 'COMISSAO', descricao: 'Comissão de intermediação', valor: valorComissao, destino: 'IMOBILIARIA', contaGerencialId: receitaComissao }]
        })
      comissaoId = infra.db
        .insert(comissao)
        .values({ origem: 'VENDA', vendaId, negocioId: n.id, baseCentavos: d.valor!, percentualBp: d.comissaoPercentual, valorCentavos: valorComissao, pagadorId: d.comissaoDescontadaDoSinal ? comprador : d.comissaoPagadorId, tituloId: tituloComissao, criadoPor: ator.id, atualizadoPor: ator.id })
        .returning({ id: comissao.id })
        .get().id
      gravarRateio(infra, comissaoId, d.rateio)
    }

    if (!n.clienteId) infra.db.update(negocio).set({ clienteId: comprador }).where(eq(negocio.id, n.id)).run()
    if (ordemEtapa(n.etapa) < ordemEtapa('CONTRATO')) registrarEtapa(infra, ator, n.id, n.etapa, 'CONTRATO', `Venda nº ${vendaId} registrada`)
    aplicarSituacaoOferta(infra, ator, n.imovelId!, 'VENDA', 'VENDIDO', `Venda nº ${vendaId} (negócio nº ${n.id})`)
    auditar(infra, ator, {
      acao: 'VENDA_REGISTRADA',
      entidade: 'negocio',
      entidadeId: n.id,
      descricao: `Venda nº ${vendaId}: ${reais(d.valor!)} em ${d.dataContrato}; comissão ${reais(valorComissao)} (${d.comissaoPercentual / 100}%)${d.comissaoDescontadaDoSinal ? ' retida do sinal' : ''} — nenhum valor recebido`,
      depois: d
    })
    return { vendaId, comissaoId }
  })()
}

const TRANSICOES: Record<string, string[]> = {
  CONTRATADA: ['AGUARDANDO_FINANCIAMENTO', 'ESCRITURADA', 'CONCLUIDA', 'DISTRATADA'],
  AGUARDANDO_FINANCIAMENTO: ['ESCRITURADA', 'CONCLUIDA', 'DISTRATADA'],
  ESCRITURADA: ['CONCLUIDA'],
  CONCLUIDA: [],
  DISTRATADA: []
}

/** Evolução da venda. Escritura/conclusão encerram o negócio como ganho; distrato o encerra como perdido. */
export function alterarSituacaoVenda(infra: Infra, ator: Ator, entrada: SituacaoVendaInput): { avisos: string[] } {
  exigir(ator, 'vendas.registrar')
  const d = situacaoVendaSchema.parse(entrada)
  const v = infra.db.select().from(venda).where(eq(venda.id, d.vendaId)).get()
  if (!v) throw erro.naoEncontrado('Venda')
  const n = negocioAcessivel(infra, ator, v.negocioId)
  if (!TRANSICOES[v.situacao]!.includes(d.situacao)) throw erro.regra(`Venda ${SITUACOES_VENDA[v.situacao].toLowerCase()} não pode passar a ${SITUACOES_VENDA[d.situacao].toLowerCase()}.`)
  if (d.data > hojeIso(infra.agora())) throw erro.validacao('Data futura não permitida.', { data: 'Data futura' })
  const avisos: string[] = []
  infra.bruto.transaction(() => {
    const ts = agoraIso(infra)
    infra.db
      .update(venda)
      .set({
        situacao: d.situacao,
        dataEscritura: d.situacao === 'ESCRITURADA' ? d.data : v.dataEscritura,
        distratoMotivo: d.situacao === 'DISTRATADA' ? d.motivo : null,
        distratoEm: d.situacao === 'DISTRATADA' ? d.data : null,
        atualizadoEm: ts,
        atualizadoPor: ator.id
      })
      .where(eq(venda.id, v.id))
      .run()
    if ((d.situacao === 'ESCRITURADA' || d.situacao === 'CONCLUIDA') && n.etapa !== 'CONCLUIDO') registrarEtapa(infra, ator, n.id, n.etapa, 'CONCLUIDO', `Venda ${SITUACOES_VENDA[d.situacao].toLowerCase()}`)
    if (d.situacao === 'DISTRATADA') {
      for (const p of infra.db.select().from(vendaParcela).where(eq(vendaParcela.vendaId, v.id)).all()) {
        if (p.tituloId) {
          const t = infra.db.select({ s: titulo.situacao, d: titulo.descricao }).from(titulo).where(eq(titulo.id, p.tituloId)).get()!
          if (['ABERTO', 'PARCIAL'].includes(t.s) && !baixasAtivas(infra, p.tituloId)) cancelarTitulo(infra, ator, p.tituloId, `Distrato da venda nº ${v.id}`, true)
          else if (t.s !== 'CANCELADO') avisos.push(`"${t.d}" já teve recebimento: trate a devolução ou o repasse ao vendedor.`)
        } else if (p.situacao === 'PREVISTA') infra.db.update(vendaParcela).set({ situacao: 'CANCELADA' }).where(eq(vendaParcela.id, p.id)).run()
      }
      const c = infra.db.select().from(comissao).where(and(eq(comissao.vendaId, v.id), eq(comissao.situacao, 'ATIVA'))).get()
      if (c) avisos.push('A comissão foi mantida. Se não for devida, cancele-a em Comissões.')
      registrarEtapa(infra, ator, n.id, n.etapa, 'PERDIDO', `Distrato da venda nº ${v.id}`, { motivoPerda: `Distrato: ${d.motivo}` })
      aplicarSituacaoOferta(infra, ator, v.imovelId, 'VENDA', 'DISPONIVEL', `Distrato da venda nº ${v.id}`, ['VENDIDO'])
    }
    auditar(infra, ator, { acao: 'VENDA_SITUACAO', entidade: 'negocio', entidadeId: n.id, descricao: `Venda nº ${v.id}: ${SITUACOES_VENDA[v.situacao]} → ${SITUACOES_VENDA[d.situacao]} em ${d.data}${d.motivo ? ` — ${d.motivo}` : ''}` })
  })()
  return { avisos }
}

/** Pagamento feito diretamente entre as partes: apenas registrado (não movimenta o caixa da imobiliária). */
export function informarParcelaPaga(infra: Infra, ator: Ator, parcelaId: number, data: string): void {
  exigir(ator, 'vendas.registrar')
  const p = infra.db.select().from(vendaParcela).where(eq(vendaParcela.id, parcelaId)).get()
  if (!p) throw erro.naoEncontrado('Parcela')
  const v = infra.db.select().from(venda).where(eq(venda.id, p.vendaId)).get()!
  negocioAcessivel(infra, ator, v.negocioId)
  if (p.viaImobiliaria) throw erro.regra('Esta parcela transita pela imobiliária: registre o recebimento em Contas a receber.')
  if (p.situacao !== 'PREVISTA') throw erro.regra('Parcela já paga ou cancelada.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hojeIso(infra.agora())) throw erro.validacao('Data inválida.')
  infra.bruto.transaction(() => {
    infra.db.update(vendaParcela).set({ situacao: 'PAGA', pagaEm: data }).where(eq(vendaParcela.id, p.id)).run()
    auditar(infra, ator, { acao: 'VENDA_PARCELA_INFORMADA', entidade: 'negocio', entidadeId: v.negocioId, descricao: `${p.descricao} (${reais(p.valorCentavos)}) paga diretamente em ${data}` })
  })()
}

export function vendaDe(infra: Infra, negocioId: number): VendaDto | null {
  const v = infra.db.select().from(venda).where(eq(venda.negocioId, negocioId)).get()
  if (!v) return null
  const partes = infra.bruto
    .prepare('SELECT vp.pessoa_id pessoaId, p.nome, vp.papel, vp.percentual_bp percentualBp FROM venda_parte vp JOIN pessoa p ON p.id = vp.pessoa_id WHERE vp.venda_id = ? ORDER BY vp.papel, p.nome')
    .all(v.id) as VendaDto['partes']
  const parcelas = infra.db.select().from(vendaParcela).where(eq(vendaParcela.vendaId, v.id)).orderBy(vendaParcela.vencimento).all()
  const situacoesTitulo = new Map(
    parcelas.some((p) => p.tituloId)
      ? infra.db.select({ id: titulo.id, s: titulo.situacao }).from(titulo).where(inArray(titulo.id, parcelas.flatMap((p) => (p.tituloId ? [p.tituloId] : [])))).all().map((t) => [t.id, t.s])
      : []
  )
  const situacaoParcela = (p: (typeof parcelas)[number]): string => {
    if (!p.tituloId) return p.situacao
    return ({ LIQUIDADO: 'PAGA', PARCIAL: 'PARCIAL', CANCELADO: 'CANCELADA', RENEGOCIADO: 'CANCELADA' } as Record<string, string>)[situacoesTitulo.get(p.tituloId) ?? ''] ?? 'PREVISTA'
  }
  return {
    id: v.id,
    negocioId: v.negocioId,
    imovelId: v.imovelId,
    imovelCodigo: (infra.bruto.prepare('SELECT codigo FROM imovel WHERE id = ?').get(v.imovelId) as { codigo: number }).codigo,
    propostaId: v.propostaId,
    dataContrato: v.dataContrato,
    valorCentavos: v.valorCentavos,
    financiamentoBanco: v.financiamentoBanco,
    financiamentoCentavos: v.financiamentoCentavos,
    situacao: v.situacao,
    dataEscritura: v.dataEscritura,
    distratoMotivo: v.distratoMotivo,
    observacoes: v.observacoes,
    partes,
    parcelas: parcelas.map(
      (p): ParcelaVendaDto => ({ id: p.id, tipo: p.tipo, descricao: p.descricao, valorCentavos: p.valorCentavos, vencimento: p.vencimento, viaImobiliaria: p.viaImobiliaria, tituloId: p.tituloId, situacao: situacaoParcela(p), pagaEm: p.pagaEm })
    ),
    comissaoId: infra.db.select({ id: comissao.id }).from(comissao).where(eq(comissao.vendaId, v.id)).get()?.id ?? null
  }
}

/**
 * Valor da intermediação de um contrato, apurado como na contabilização do recebimento: o item do aluguel é
 * rateado entre os locadores e a taxa é aplicada a cada parte.
 */
export function intermediacaoDoContrato(infra: Infra, contratoId: number): number {
  const itens = infra.bruto
    .prepare(
      `SELECT ti.valor_centavos v, ti.taxa_bp bp FROM titulo_item ti JOIN titulo t ON t.id = ti.titulo_id
       WHERE t.contrato_id = ? AND ti.taxa_tipo = 'INTERMEDIACAO' AND ti.taxa_bp > 0 AND t.situacao NOT IN ('CANCELADO','RENEGOCIADO')`
    )
    .all(contratoId) as { v: number; bp: number }[]
  const pesos = locadoresDoContrato(infra, contratoId).map((l) => l.percentualBp)
  return itens.reduce((s, i) => s + ratear(i.v, pesos).reduce((a, parte) => a + percentualDe(parte, i.bp), 0), 0)
}

/** Comissão sobre a intermediação de uma locação concluída (rateio aos corretores). */
export function registrarComissaoLocacao(infra: Infra, ator: Ator, entrada: ComissaoLocacaoInput): { comissaoId: number } {
  exigir(ator, 'comissoes.gerenciar')
  const d = comissaoLocacaoSchema.parse(entrada)
  const n = negocioAcessivel(infra, ator, d.negocioId)
  if (n.tipo !== 'LOCACAO' || n.etapa !== 'CONCLUIDO' || !n.contratoId) throw erro.regra('Disponível para negócios de locação concluídos com contrato.')
  if (infra.db.select({ id: comissao.id }).from(comissao).where(and(eq(comissao.contratoId, n.contratoId), eq(comissao.situacao, 'ATIVA'))).get()) throw erro.regra('Este contrato já tem comissão registrada.')
  const valor = intermediacaoDoContrato(infra, n.contratoId)
  if (valor <= 0) throw erro.regra('O contrato não tem taxa de intermediação cobrada. Gere a primeira cobrança antes de registrar a comissão.')
  const taxa = (infra.bruto.prepare('SELECT taxa_intermediacao_bp t FROM contrato_locacao WHERE id = ?').get(n.contratoId) as { t: number }).t
  return infra.bruto.transaction(() => {
    const { id } = infra.db
      .insert(comissao)
      .values({ origem: 'LOCACAO', contratoId: n.contratoId, negocioId: n.id, baseCentavos: Math.round((valor * 10_000) / Math.max(1, taxa)), percentualBp: taxa, valorCentavos: valor, criadoPor: ator.id, atualizadoPor: ator.id })
      .returning({ id: comissao.id })
      .get()
    gravarRateio(infra, id, d.rateio)
    // Se a intermediação já foi recebida, a liberação aos corretores é imediata.
    sincronizarComissao(infra, ator, id, hojeIso(infra.agora()))
    auditar(infra, ator, { acao: 'COMISSAO_REGISTRADA', entidade: 'comissao', entidadeId: id, descricao: `Intermediação do contrato (negócio nº ${n.id}): ${reais(valor)}`, depois: d.rateio })
    return { comissaoId: id }
  })()
}
