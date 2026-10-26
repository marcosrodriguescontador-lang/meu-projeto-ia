import ExcelJS from 'exceljs'
import { afterEach, describe, expect, it } from 'vitest'
import { estornarBaixa, pagar } from '../src/main/modules/financeiro/baixas'
import { salvarContaFinanceira, saldoContaFinanceira } from '../src/main/modules/financeiro/cadastros'
import { conciliar, desfazerConciliacao, ignorarLinha, importarExtrato, lancarDaLinha, listarLinhas, movimentosPendentes, resumoConciliacao, sugestoes } from '../src/main/modules/financeiro/conciliacao'
import { relatorioHtml, relatorioXlsx } from '../src/main/modules/financeiro/exportacao'
import { CONTAS, saldoConta } from '../src/main/modules/financeiro/razao'
import { dadosDimob, fluxoCaixa, gerarRelatorio } from '../src/main/modules/financeiro/relatorios'
import { gerarRepasse } from '../src/main/modules/financeiro/repasses'
import { categoriasManuais, criarCategoria, criarTituloManual, estornarTransferencia, posicaoTerceiros, transferir } from '../src/main/modules/financeiro/tesouraria'
import { listarTitulos, obterTitulo } from '../src/main/modules/financeiro/titulos'
import { gerarCobrancas } from '../src/main/modules/locacoes/cobrancas'
import { criarLancamento } from '../src/main/modules/locacoes/contratos'
import { cenario, limpezas, razaoIntegro } from './cenario-locacao'

afterEach(() => {
  limpezas.splice(0).forEach((f) => f())
})

const categoria = (c: Awaited<ReturnType<typeof cenario>>, natureza: 'RECEITA' | 'DESPESA', trecho: string) => categoriasManuais(c.infra, natureza).find((x) => x.nome.includes(trecho))!.id

function contaPropria(c: Awaited<ReturnType<typeof cenario>>, saldo = '5.000,00') {
  return salvarContaFinanceira(c.infra, c.admin, null, { nome: 'Banco — conta própria', tipo: 'CORRENTE', titularidade: 'PROPRIO', saldoInicial: saldo, dataSaldoInicial: '2026-08-01', ativa: true, bancoCodigo: '', agencia: '', conta: '' }).id
}

function ofx(transacoes: { data: string; valor: string; fitid: string; memo: string }[], saldo: string, dataSaldo: string) {
  return Buffer.from(
    `OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0341<ACCTID>1234-5</BANKACCTFROM><BANKTRANLIST>
${transacoes.map((t) => `<STMTTRN><TRNTYPE>OTHER<DTPOSTED>${t.data.replace(/-/g, '')}<TRNAMT>${t.valor}<FITID>${t.fitid}<MEMO>${t.memo}</STMTTRN>`).join('\n')}
</BANKTRANLIST><LEDGERBAL><BALAMT>${saldo}<DTASOF>${dataSaldo.replace(/-/g, '')}</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`,
    'latin1'
  )
}

describe('contas a pagar e receber da imobiliária', () => {
  it('valida forma e dados de quitação', async () => {
    const c = await cenario()
    c.irPara('2026-10-20')
    const base = { sentido: 'PAGAR' as const, pessoaId: c.condominio, categoriaId: categoria(c, 'DESPESA', 'tarifas'), descricao: 'Tarifa', valor: '19,90', parcelas: 1, primeiroVencimento: '2026-10-20', competencia: '2026-10', documento: '' }
    expect(() => criarTituloManual(c.infra, c.admin, { ...base, quitado: true, contaFinanceiraId: c.banco, forma: 'DEBITO' as never, dataQuitacao: '2026-10-20' })).toThrow()
    expect(() => criarTituloManual(c.infra, c.admin, { ...base, quitado: true, contaFinanceiraId: null, forma: null, dataQuitacao: '' })).toThrow()
  })

  it('lança, paga e classifica despesas e receitas próprias', async () => {
    const c = await cenario()
    const propria = contaPropria(c)
    c.irPara('2026-10-20')
    const tarifas = categoria(c, 'DESPESA', 'tarifas')
    criarTituloManual(c.infra, c.admin, { sentido: 'PAGAR', pessoaId: c.condominio, categoriaId: tarifas, descricao: 'Tarifa bancária', valor: '19,90', parcelas: 1, primeiroVencimento: '2026-10-20', competencia: '2026-10', documento: '', quitado: true, contaFinanceiraId: propria, forma: 'TRANSFERENCIA', dataQuitacao: '2026-10-20' })
    expect(saldoContaFinanceira(c.infra, propria)).toBe(500_000 - 1_990)
    const { titulos } = criarTituloManual(c.infra, c.admin, { sentido: 'PAGAR', pessoaId: c.condominio, categoriaId: categoria(c, 'DESPESA', 'sistemas'), descricao: 'Licença anual', valor: '1.000,00', parcelas: 3, primeiroVencimento: '2026-11-05', competencia: '2026-11', documento: '', quitado: false, contaFinanceiraId: null, forma: null, dataQuitacao: '' })
    const parcelas = titulos.map((id) => obterTitulo(c.infra, c.admin, id))
    expect(parcelas.map((p) => p.valorCentavos)).toEqual([33_334, 33_333, 33_333])
    expect(parcelas.map((p) => p.vencimento)).toEqual(['2026-11-05', '2026-12-07', '2027-01-05'])
    criarTituloManual(c.infra, c.admin, { sentido: 'RECEBER', pessoaId: c.carlos, categoriaId: categoria(c, 'RECEITA', 'avaliações'), descricao: 'Laudo de avaliação', valor: '800,00', parcelas: 1, primeiroVencimento: '2026-10-20', competencia: '2026-10', documento: '', quitado: true, contaFinanceiraId: propria, forma: 'PIX', dataQuitacao: '2026-10-20' })
    const res = gerarRelatorio(c.infra, c.admin, 'resultado', { ano: 2026 })
    const total = res.linhas.find((l) => l.destaque === 'total')!
    expect(total.m10).toBe(80_000 - 1_990)
    expect(() => criarTituloManual(c.infra, c.admin, { sentido: 'RECEBER', pessoaId: c.carlos, categoriaId: c.infra.bruto.prepare("SELECT id FROM conta_gerencial WHERE codigo = '3.1.01'").pluck().get() as number, descricao: 'x', valor: '1', parcelas: 1, primeiroVencimento: '2026-10-20', competencia: '2026-10', documento: '', quitado: false, contaFinanceiraId: null, forma: null, dataQuitacao: '' })).toThrow()
    const nova = criarCategoria(c.infra, c.admin, { natureza: 'DESPESA', nome: 'Eventos' })
    expect(nova.codigo).toBe('4.8.01')
    razaoIntegro(c.infra)
  })
})

describe('transferências e separação de recursos', () => {
  it('só permite levar para a conta própria o que pertence à imobiliária', async () => {
    const c = await cenario()
    const propria = contaPropria(c, '0')
    gerarCobrancas(c.infra, c.admin, '2026-09')
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    const pos = posicaoTerceiros(c.infra)
    expect(pos.saldoContasTerceiros).toBe(250_000)
    expect(pos.totalPassivo).toBe(230_000) // 1.800 aos proprietários + 500 ao condomínio
    expect(pos.recursosPropriosEmContasDeTerceiros).toBe(20_000) // a taxa
    expect(() => transferir(c.infra, c.admin, { origemId: c.banco, destinoId: propria, valor: '200,01', data: '2026-10-09', descricao: 'Taxas de outubro' })).toThrow('recursos de terceiros')
    const { id } = transferir(c.infra, c.admin, { origemId: c.banco, destinoId: propria, valor: '200,00', data: '2026-10-09', descricao: 'Taxas de outubro' })
    expect(saldoContaFinanceira(c.infra, propria)).toBe(20_000)
    expect(posicaoTerceiros(c.infra).recursosPropriosEmContasDeTerceiros).toBe(0)
    estornarTransferencia(c.infra, c.admin, id, 'Transferência em duplicidade')
    expect(saldoContaFinanceira(c.infra, propria)).toBe(0)
    expect(() => transferir(c.infra, c.admin, { origemId: propria, destinoId: c.banco, valor: '1,00', data: '2026-10-09', descricao: 'x teste' })).toThrow('Saldo insuficiente')
    razaoIntegro(c.infra)
  })
})

describe('importação de extrato e conciliação', () => {
  it('importa OFX, concilia automaticamente, não duplica e confere o saldo com o banco', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    const arq1 = ofx([{ data: '2026-10-09', valor: '2500.00', fitid: 'A1', memo: 'PIX CARLOS' }, { data: '2026-10-10', valor: '-19.90', fitid: 'A2', memo: 'TARIFA' }], '2480.10', '2026-10-10')
    const r = importarExtrato(c.infra, c.admin, { contaId: c.banco, arquivo: 'out.ofx', bytes: arq1 })
    expect(r).toMatchObject({ lidas: 2, novas: 2, conciliadasAutomaticamente: 1 })
    expect(() => importarExtrato(c.infra, c.admin, { contaId: c.banco, arquivo: 'out.ofx', bytes: arq1 })).toThrow('já foi importado')
    // Arquivo com período sobreposto: só a transação nova entra.
    const arq2 = ofx([{ data: '2026-10-10', valor: '-19.90', fitid: 'A2', memo: 'TARIFA' }, { data: '2026-10-12', valor: '15.00', fitid: 'A3', memo: 'RENDIMENTO' }], '2495.10', '2026-10-12')
    expect(importarExtrato(c.infra, c.admin, { contaId: c.banco, arquivo: 'out2.ofx', bytes: arq2 })).toMatchObject({ lidas: 2, novas: 1 })
    expect(listarLinhas(c.infra, c.admin, c.banco)).toHaveLength(3)

    c.irPara('2026-10-13')
    let resumo = resumoConciliacao(c.infra, c.admin, c.banco)
    expect(resumo.diferencaCentavos).toBe(-490) // tarifa e rendimento ainda não lançados no sistema
    const [rend, tarifa] = listarLinhas(c.infra, c.admin, c.banco, 'PENDENTE')
    lancarDaLinha(c.infra, c.admin, tarifa!.id, { categoriaId: categoria(c, 'DESPESA', 'tarifas'), pessoaId: c.condominio, descricao: 'Tarifa de pacote' })
    lancarDaLinha(c.infra, c.admin, rend!.id, { categoriaId: categoria(c, 'RECEITA', 'rendimentos'), pessoaId: c.condominio, descricao: 'Rendimento' })
    resumo = resumoConciliacao(c.infra, c.admin, c.banco)
    expect(resumo).toMatchObject({ diferencaCentavos: 0, linhasPendentes: 0, movimentosPendentes: 0 })
    razaoIntegro(c.infra)
  })

  it('sugere pares por valor e data, permite desfazer e ignorar; pares estornados não ficam pendentes', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    gerarCobrancas(c.infra, c.admin, '2026-10')
    const b1 = c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    estornarBaixa(c.infra, c.admin, { baixaId: b1.baixaId, motivo: 'Lançado na conta errada' })
    expect(movimentosPendentes(c.infra, c.banco)).toHaveLength(0)
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    importarExtrato(c.infra, c.admin, { contaId: c.banco, arquivo: 'x.ofx', bytes: ofx([{ data: '2026-10-13', valor: '2500.00', fitid: 'B1', memo: 'PIX' }, { data: '2026-10-14', valor: '-3.50', fitid: 'B2', memo: 'DUPLICIDADE BANCO' }], '2496.50', '2026-10-14'), conciliarAutomatico: false })
    const s = sugestoes(c.infra, c.banco)
    expect(s).toHaveLength(1)
    expect(s[0]!.diasDiferenca).toBe(4)
    conciliar(c.infra, c.admin, c.banco, s[0]!.linhaId, s[0]!.partidaId)
    expect(() => conciliar(c.infra, c.admin, c.banco, s[0]!.linhaId, s[0]!.partidaId)).toThrow()
    desfazerConciliacao(c.infra, c.admin, s[0]!.linhaId)
    expect(listarLinhas(c.infra, c.admin, c.banco, 'PENDENTE')).toHaveLength(2)
    const dup = listarLinhas(c.infra, c.admin, c.banco).find((l) => l.valorCentavos === -350)!
    ignorarLinha(c.infra, c.admin, dup.id, 'Tarifa estornada pelo banco no dia seguinte')
    expect(listarLinhas(c.infra, c.admin, c.banco, 'IGNORADA')).toHaveLength(1)
    expect(() => c.infra.bruto.prepare('DELETE FROM extrato_linha').run()).toThrow()
  })
})

describe('relatórios', () => {
  it('valores a repassar conferem com o passivo; receitas próprias não incluem aluguel bruto', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    const rep = gerarRepasse(c.infra, c.admin, { tipo: 'PROPRIETARIO', pessoaId: c.maria, vencimento: '2026-10-15' })
    pagar(c.infra, c.admin, { tituloId: rep.tituloId!, data: '2026-10-09', valor: '500,00', contaFinanceiraId: c.banco, forma: 'PIX', observacao: '' })
    const r = gerarRelatorio(c.infra, c.admin, 'repassar')
    expect(r.totais!.total).toBe(saldoConta(c.infra, CONTAS.PROPRIETARIOS))
    expect(r.totais!.total).toBe(180_000 - 50_000)
    expect(r.observacoes![0]).toContain('confere')
    const receitas = gerarRelatorio(c.infra, c.admin, 'receitas', { de: '2026-10-01', ate: '2026-10-31' })
    expect(receitas.totais!.valor).toBe(20_000)
    const rent = gerarRelatorio(c.infra, c.admin, 'rentabilidade', { de: '2026-10-01', ate: '2026-10-31' })
    expect(rent.linhas[0]).toMatchObject({ alugueis: 200_000, administracao: 20_000, margem: 1000 })
    const pagarRel = gerarRelatorio(c.infra, c.admin, 'pagar', { de: '2026-10-01', ate: '2026-10-31' })
    expect(pagarRel.totais!.saldo).toBe(108_000 - 50_000)
  })

  it('fluxo de caixa: realizado do razão e previsto dos títulos em aberto', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    gerarCobrancas(c.infra, c.admin, '2026-10')
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    const f = fluxoCaixa(c.infra, c.admin, { mesesAnteriores: 1, mesesFuturos: 2 })
    const out = f.find((x) => x.competencia === '2026-10')!
    expect(out.entradasRealizadas).toBe(250_000)
    const nov = f.find((x) => x.competencia === '2026-11')!
    expect(nov.entradasPrevistas).toBe(250_000)
    expect(f.at(-1)!.saldoFinal).toBe(500_000)
  })

  it('base da DIMOB: aluguel e comissão por locador e mês, com IRRF informado', async () => {
    const c = await cenario()
    criarLancamento(c.infra, c.admin, { contratoId: c.contratoId, competencia: '2026-09', descricao: 'IRRF retido (locatário PJ)', valor: '-30,00', pagador: 'LOCATARIO', destino: 'PROPRIETARIO', beneficiarioId: null, natureza: 'IRRF' })
    gerarCobrancas(c.infra, c.admin, '2026-09')
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    const d = dadosDimob(c.infra, 2026)
    expect(d.map((x) => [x.locadorId === c.maria ? 'maria' : 'joao', x.mes, x.aluguel, x.comissao, x.irrf])).toEqual([
      ['maria', '10', 120_000, 12_000, 1_800],
      ['joao', '10', 80_000, 8_000, 1_200]
    ])
    const rel = gerarRelatorio(c.infra, c.admin, 'dimob', { ano: 2026 })
    expect(rel.totais).toMatchObject({ aluguel: 200_000, comissao: 20_000, irrf: 3_000 })
  })

  it('exporta para Excel com valores numéricos e para HTML com totais', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const r = gerarRelatorio(c.infra, c.admin, 'receber', { de: '2026-10-01', ate: '2026-10-31' })
    const buf = await relatorioXlsx(r, 'Status Negócios Imobiliários')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as never)
    const ws = wb.worksheets[0]!
    expect(ws.getRow(4).getCell(1).value).toBe('Vencimento')
    expect(ws.getRow(5).getCell(7).value).toBe(2500)
    const html = relatorioHtml(r, { empresa: null, logo: null, emitidoEm: new Date(), emitidoPor: 'Admin' })
    expect(html).toContain('Contas a receber por vencimento')
    expect(html).toContain('R$')
    expect(listarTitulos(c.infra, c.admin, {}).total).toBe(1)
  })
})
