// Renegociação de débitos: títulos originais ficam "renegociados" e o saldo (com encargos) vira novas parcelas,
// preservando a composição (aluguel, encargos, destinos e taxas) para o repasse correto.
import { inArray } from 'drizzle-orm'
import { erro } from '@shared/erros'
import { proximoDiaUtil } from '@shared/financeiro/calendario'
import { calcularEncargos, ratear } from '@shared/financeiro/calculos'
import { adicionarMesesData, formatarData, hojeIso } from '@shared/financeiro/datas'
import { renegociacaoSchema, type RenegociacaoInput } from '@shared/schemas-locacao'
import { renegociacao, titulo } from '../../infra/db/schema'
import { agoraIso, exigir, pode, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'
import { feriadosLocais } from './cadastros'
import { CONTAS, idConta } from './razao'
import { criarTitulo, itensComSaldo, type ItemNovo } from './titulos'
import { eq } from 'drizzle-orm'

export function renegociar(infra: Infra, ator: Ator, entrada: RenegociacaoInput): { renegociacaoId: number; titulos: number[] } {
  exigir(ator, 'financeiro.renegociar')
  const d = renegociacaoSchema.parse(entrada)
  if ((d.descontoEncargos > 0 || !d.incluirEncargos) && !pode(ator, 'financeiro.dispensar_encargos')) throw erro.semPermissao()
  return infra.bruto.transaction(() => {
    const originais = infra.db.select().from(titulo).where(inArray(titulo.id, d.titulos)).all()
    if (originais.length !== new Set(d.titulos).size) throw erro.validacao('Título não encontrado.')
    if (originais.some((t) => t.sentido !== 'RECEBER' || !['ABERTO', 'PARCIAL'].includes(t.situacao))) throw erro.regra('Somente títulos a receber em aberto podem ser renegociados.')
    if (new Set(originais.map((t) => t.pessoaId)).size > 1) throw erro.regra('Os títulos devem ser do mesmo devedor.')
    if (new Set(originais.map((t) => t.contratoId)).size > 1) throw erro.regra('Os títulos devem ser do mesmo contrato.')
    const base = originais[0]!

    const itens: ItemNovo[] = []
    let saldoOriginal = 0
    let encargos = 0
    for (const t of originais) {
      const its = itensComSaldo(infra, t.id).filter((i) => i.saldo !== 0)
      const saldo = its.reduce((s, i) => s + i.saldo, 0)
      saldoOriginal += saldo
      if (d.incluirEncargos) {
        const e = calcularEncargos(saldo, { vencimentoOriginal: t.vencimentoOriginal, vencimentoUtil: t.vencimento, dataPagamento: d.data, multaBp: t.multaBp, jurosMesBp: t.jurosMesBp })
        encargos += e.multa + e.juros
      }
      for (const i of its)
        itens.push({ tipo: i.tipo, descricao: i.descricao, valor: i.saldo, destino: i.destino, beneficiarioId: i.beneficiario_id, contaGerencialId: i.conta_gerencial_id, taxaBp: i.taxa_bp, taxaTipo: i.taxa_tipo })
    }
    if (d.descontoEncargos > encargos) throw erro.validacao('Desconto maior que os encargos.', { descontoEncargos: 'Maior que os encargos' })
    const encargosLiquidos = encargos - d.descontoEncargos
    if (encargosLiquidos > 0)
      itens.push(
        base.destinoEncargos === 'IMOBILIARIA'
          ? { tipo: 'ENCARGOS', descricao: 'Multa e juros renegociados', valor: encargosLiquidos, destino: 'IMOBILIARIA', contaGerencialId: idConta(infra, CONTAS.RECEITA_ENCARGOS) }
          : { tipo: 'ENCARGOS', descricao: 'Multa e juros renegociados', valor: encargosLiquidos, destino: 'PROPRIETARIO' }
      )
    const total = saldoOriginal + encargosLiquidos
    if (total <= 0) throw erro.regra('Não há saldo a renegociar.')

    const { id: renegociacaoId } = infra.db
      .insert(renegociacao)
      .values({
        pessoaId: base.pessoaId,
        contratoId: base.contratoId,
        data: d.data,
        motivo: d.motivo,
        saldoOriginalCentavos: saldoOriginal,
        encargosCentavos: encargos,
        descontoCentavos: d.descontoEncargos,
        totalCentavos: total,
        parcelas: d.parcelas,
        titulosOrigem: JSON.stringify(d.titulos),
        criadoEm: agoraIso(infra),
        criadoPor: ator.id
      })
      .returning({ id: renegociacao.id })
      .get()

    // Cada item é dividido entre as parcelas (maiores restos), preservando destino e taxa.
    const pesos = Array(d.parcelas).fill(1)
    const porParcela: ItemNovo[][] = Array.from({ length: d.parcelas }, () => [])
    for (const it of itens) ratear(it.valor, pesos).forEach((v, k) => v && porParcela[k]!.push({ ...it, valor: v, descricao: `${it.descricao} (parcela ${k + 1}/${d.parcelas})` }))
    const feriados = feriadosLocais(infra)
    const novos: number[] = []
    porParcela.forEach((its, k) => {
      const vencOriginal = adicionarMesesData(d.primeiroVencimento, k)
      novos.push(
        criarTitulo(infra, ator, {
          sentido: 'RECEBER',
          origem: 'RENEGOCIACAO',
          contratoId: base.contratoId,
          pessoaId: base.pessoaId,
          descricao: `Renegociação nº ${renegociacaoId} — parcela ${k + 1}/${d.parcelas}`,
          emissao: hojeIso(infra.agora()),
          vencimentoOriginal: vencOriginal,
          vencimento: proximoDiaUtil(vencOriginal, feriados),
          recurso: 'TERCEIROS',
          multaBp: base.multaBp,
          jurosMesBp: base.jurosMesBp,
          destinoEncargos: base.destinoEncargos,
          chave: `RENEG:${renegociacaoId}:${k + 1}`,
          renegociacaoId,
          itens: its
        })
      )
    })
    for (const t of originais) infra.db.update(titulo).set({ situacao: 'RENEGOCIADO', renegociacaoId, atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) }).where(eq(titulo.id, t.id)).run()
    auditar(infra, ator, {
      acao: 'DEBITO_RENEGOCIADO',
      entidade: 'titulo',
      entidadeId: base.id,
      descricao: `Renegociação nº ${renegociacaoId}: ${originais.length} título(s), saldo ${(saldoOriginal / 100).toFixed(2)} + encargos ${(encargos / 100).toFixed(2)} − desconto ${(d.descontoEncargos / 100).toFixed(2)} = ${(total / 100).toFixed(2)} em ${d.parcelas}x a partir de ${formatarData(d.primeiroVencimento)} — ${d.motivo}`
    })
    return { renegociacaoId, titulos: novos }
  })()
}
