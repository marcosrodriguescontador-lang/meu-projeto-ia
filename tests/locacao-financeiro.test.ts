import { afterEach, describe, expect, it } from 'vitest'
import { estornarBaixa, pagar, receber } from '../src/main/modules/financeiro/baixas'
import { salvarContaFinanceira, salvarValorIndice, saldoContaFinanceira, listarIndices } from '../src/main/modules/financeiro/cadastros'
import { CONTAS, saldoConta, saldoPendenteRepasse, verificarRazao } from '../src/main/modules/financeiro/razao'
import { renegociar } from '../src/main/modules/financeiro/renegociacao'
import { cancelarRepasse, demonstrativoRepasse, gerarRepasse, saldosARepassar } from '../src/main/modules/financeiro/repasses'
import { cancelarTitulo, inadimplencia, listarTitulos, obterTitulo, previaRecebimento } from '../src/main/modules/financeiro/titulos'
import { alterarSituacao, criarImovel, obterImovel } from '../src/main/modules/imoveis/imoveis'
import { gerarCobrancas, previaCobrancas } from '../src/main/modules/locacoes/cobrancas'
import { ativarContrato, cancelarLancamento, criarLancamento, obterContrato, registrarAditivo, salvarContrato } from '../src/main/modules/locacoes/contratos'
import { aplicarReajusteContrato, dispensarReajuste, reajustesPendentes } from '../src/main/modules/locacoes/reajustes'
import { rescindir, simularRescisao } from '../src/main/modules/locacoes/rescisao'
import { atualizarPessoa, criarPessoa } from '../src/main/modules/pessoas/pessoas'
import { criarPerfil } from '../src/main/modules/seguranca/perfis'
import { carregarUsuarioSessao, criarUsuario } from '../src/main/modules/seguranca/usuarios'
import type { ContratoInput } from '../src/shared/schemas-locacao'
import { ambienteConfigurado, imovelBase, pessoaFisica } from './apoio'

let limpar: (() => void)[] = []
afterEach(() => {
  limpar.forEach((f) => f())
  limpar = []
})

/** Cenário padrão: imóvel de Maria (60%) e João (40%), locado a Carlos; condomínio repassado ao condomínio. */
async function cenario(opcoes: Partial<ContratoInput> = {}, inicio = '2026-08-05') {
  const relogio = { agora: new Date(`${inicio}T12:00:00Z`) }
  const a = await ambienteConfigurado(() => relogio.agora)
  limpar.push(() => (a.fechar(), a.apagar()))
  const { infra, admin } = a
  const maria = criarPessoa(infra, admin, pessoaFisica()).id
  const joao = criarPessoa(infra, admin, pessoaFisica({ nome: 'João Souza', documento: '111.444.777-35', estadoCivil: '', regimeBens: '' })).id
  const carlos = criarPessoa(infra, admin, pessoaFisica({ nome: 'Carlos Locatário', documento: '390.533.447-05', estadoCivil: '', regimeBens: '', papeis: ['LOCATARIO'] })).id
  const condominio = criarPessoa(infra, admin, { ...pessoaFisica({ nome: 'Condomínio Edifício Aurora', documento: '11.222.333/0001-81', papeis: ['FORNECEDOR'] }), tipo: 'PJ', estadoCivil: '', regimeBens: '', nascimento: '' }).id
  const imovelId = criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '60', principal: true }, { pessoaId: joao, percentual: '40', principal: false }])).id
  const banco = salvarContaFinanceira(infra, admin, null, { nome: 'Banco — recursos de terceiros', tipo: 'CORRENTE', titularidade: 'TERCEIROS', saldoInicial: '0', dataSaldoInicial: '2026-08-01', ativa: true, bancoCodigo: '', agencia: '', conta: '' }).id
  const igpm = listarIndices(infra).find((i) => i.sigla === 'IGP-M')!.id
  const entrada: ContratoInput = {
    imovelId,
    tipo: 'RESIDENCIAL',
    locatarios: [{ pessoaId: carlos, principal: true }],
    fiadores: [],
    dataInicio: '2026-08-11',
    dataFim: '2029-08-10',
    aluguel: '2.000,00',
    diaVencimento: '10',
    indiceId: igpm,
    periodicidadeReajusteMeses: 12,
    reajusteNegativo: false,
    taxaAdministracao: '10',
    taxaIntermediacao: '0',
    multaAtraso: '10',
    jurosMes: '1',
    destinoEncargos: 'PROPRIETARIO',
    multaRescisoriaAlugueis: '3',
    garantiaTipo: 'SEM_GARANTIA',
    garantiaValor: '',
    garantiaSeguradora: '',
    garantiaApolice: '',
    garantiaVigenciaFim: '',
    observacoes: '',
    encargos: [{ tipo: 'CONDOMINIO', descricao: 'Condomínio', valor: '500,00', competenciaInicio: '2026-08', competenciaFim: '', proporcional: true, destino: 'TERCEIRO', beneficiarioId: condominio }],
    ...opcoes
  }
  const contratoId = salvarContrato(infra, admin, null, entrada).id
  ativarContrato(infra, admin, contratoId)
  const irPara = (data: string) => (relogio.agora = new Date(`${data}T12:00:00Z`))
  const cobranca = (competencia: string) => listarTitulos(infra, admin, { contratoId, competencia, origem: 'COBRANCA_LOCACAO' }).itens.filter((t) => t.situacao !== 'CANCELADO')[0]!
  const receberIntegral = (tituloId: number, data: string, extra: Partial<Parameters<typeof receber>[2]> = {}) => {
    irPara(data)
    const p = previaRecebimento(infra, admin, tituloId, data)
    return receber(infra, admin, { tituloId, data, valorRecebido: p.totalDevidoCentavos / 100, desconto: '', dispensarEncargos: false, contaFinanceiraId: banco, forma: 'PIX', observacao: '', ...extra })
  }
  return { ...a, relogio, irPara, maria, joao, carlos, condominio, imovelId, banco, igpm, contratoId, entrada, cobranca, receberIntegral }
}

const razaoIntegro = (infra: Parameters<typeof verificarRazao>[0]) => {
  const v = verificarRazao(infra)
  expect(v.desbalanceados).toEqual([])
  expect(v.somaGeral).toBe(0)
}

describe('contrato de locação', () => {
  it('ativação marca o imóvel como alugado e impede alteração manual e segundo contrato', async () => {
    const c = await cenario()
    const im = obterImovel(c.infra, c.admin, c.imovelId)
    const loc = im.ofertas.find((o) => o.modalidade === 'LOCACAO')!
    expect(loc.situacao).toBe('ALUGADO')
    expect(im.ofertas.find((o) => o.modalidade === 'VENDA')!.situacao).toBe('DISPONIVEL')
    expect(() => alterarSituacao(c.infra, c.admin, { ofertaId: loc.id, situacao: 'DISPONIVEL', motivo: 'teste' })).toThrow('contrato ativo')
    expect(() => salvarContrato(c.infra, c.admin, null, c.entrada)).toThrow('já possui o contrato ativo')
    const contrato = obterContrato(c.infra, c.admin, c.contratoId)
    expect(contrato.partes.filter((p) => p.papel === 'LOCADOR').map((p) => p.percentualBp)).toEqual([6000, 4000])
    expect(contrato.proximoReajuste).toBe('2027-08-11')
    expect(() => atualizarPessoa(c.infra, c.admin, c.carlos, pessoaFisica({ nome: 'Carlos Locatário', documento: '390.533.447-05', estadoCivil: '', regimeBens: '', papeis: ['FIADOR'] }))).toThrow('Locatário')
  })

  it('valida caução até 3 aluguéis e fiança com fiador', async () => {
    const c = await cenario()
    expect(() => salvarContrato(c.infra, c.admin, null, { ...c.entrada, garantiaTipo: 'CAUCAO', garantiaValor: '7.000,00' })).toThrow()
    expect(() => salvarContrato(c.infra, c.admin, null, { ...c.entrada, garantiaTipo: 'FIANCA' })).toThrow()
  })
})

describe('geração mensal de cobranças', () => {
  it('é idempotente: gerar duas vezes não duplica', async () => {
    const c = await cenario()
    expect(gerarCobrancas(c.infra, c.admin, '2026-09').geradas).toBe(1)
    const r = gerarCobrancas(c.infra, c.admin, '2026-09')
    expect(r).toMatchObject({ geradas: 0, jaGeradas: 1 })
    expect(listarTitulos(c.infra, c.admin, { contratoId: c.contratoId, competencia: '2026-09' }).total).toBe(1)
    expect(previaCobrancas(c.infra, c.admin, '2026-09')[0]!.situacao).toBe('JA_GERADA')
  })

  it('primeira competência proporcional por dias reais e vencimento no mês seguinte', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-08')
    const t = obterTitulo(c.infra, c.admin, c.cobranca('2026-08').id)
    // 21 de 31 dias: 2.000 × 21/31 = 1.354,84; condomínio 500 × 21/31 = 338,71
    expect(t.itens.map((i) => [i.tipo, i.valorCentavos])).toEqual([['ALUGUEL', 135_484], ['CONDOMINIO', 33_871]])
    expect(t.vencimento).toBe('2026-09-10')
  })

  it('prorroga vencimento que cai em fim de semana ou feriado', async () => {
    const c = await cenario({ diaVencimento: '15' })
    gerarCobrancas(c.infra, c.admin, '2026-10')
    const t = obterTitulo(c.infra, c.admin, c.cobranca('2026-10').id)
    expect(t.vencimentoOriginal).toBe('2026-11-15') // domingo e feriado
    expect(t.vencimento).toBe('2026-11-16')
  })

  it('emitir cobrança não movimenta caixa, receita nem repasse', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    expect(verificarRazao(c.infra).lancamentos).toBe(0)
    expect(saldoContaFinanceira(c.infra, c.banco)).toBe(0)
    expect(saldosARepassar(c.infra, c.admin)).toEqual([])
  })
})

describe('recebimentos', () => {
  it('recebimento integral: proprietários creditados por participação, taxa como única receita própria', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const t = c.cobranca('2026-09')
    c.receberIntegral(t.id, '2026-10-09')
    expect(obterTitulo(c.infra, c.admin, t.id).situacao).toBe('LIQUIDADO')
    expect(saldoContaFinanceira(c.infra, c.banco)).toBe(250_000)
    // Aluguel 2.000: Maria 1.200 − 120; João 800 − 80; condomínio 500 ao condomínio; taxa 200.
    expect(saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.maria)).toBe(108_000)
    expect(saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.joao)).toBe(72_000)
    expect(saldoPendenteRepasse(c.infra, CONTAS.TERCEIROS, c.condominio)).toBe(50_000)
    expect(saldoConta(c.infra, CONTAS.RECEITA_ADMINISTRACAO)).toBe(20_000)
    expect(saldoConta(c.infra, CONTAS.RECEITA_OUTRAS) + saldoConta(c.infra, CONTAS.RECEITA_ENCARGOS) + saldoConta(c.infra, CONTAS.RECEITA_INTERMEDIACAO)).toBe(0)
    razaoIntegro(c.infra)
  })

  it('pagamento antecipado não gera encargos', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const r = c.receberIntegral(c.cobranca('2026-09').id, '2026-09-25')
    expect(r).toMatchObject({ multa: 0, juros: 0, total: 250_000 })
  })

  it('recebimento parcial deixa saldo e credita só o recebido (taxa proporcional)', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const t = c.cobranca('2026-09')
    c.irPara('2026-10-05')
    receber(c.infra, c.admin, { tituloId: t.id, data: '2026-10-05', valorRecebido: '1.000,00', desconto: '', dispensarEncargos: false, contaFinanceiraId: c.banco, forma: 'PIX', observacao: '' })
    const det = obterTitulo(c.infra, c.admin, t.id)
    expect(det.situacao).toBe('PARCIAL')
    expect(det.saldoCentavos).toBe(150_000)
    // 1.000 → 800 aluguel + 200 condomínio; taxa 10% sobre 800.
    expect(saldoConta(c.infra, CONTAS.RECEITA_ADMINISTRACAO)).toBe(8_000)
    expect(saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.maria) + saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.joao)).toBe(72_000)
    c.receberIntegral(t.id, '2026-10-09')
    expect(obterTitulo(c.infra, c.admin, t.id).situacao).toBe('LIQUIDADO')
    expect(saldoConta(c.infra, CONTAS.RECEITA_ADMINISTRACAO)).toBe(20_000)
    razaoIntegro(c.infra)
  })

  it('atraso: multa 10% e juros pro rata vão para os proprietários (Q5), sem taxa sobre encargos', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const t = c.cobranca('2026-09')
    const r = c.receberIntegral(t.id, '2026-10-15') // 5 dias
    expect(r).toMatchObject({ principal: 250_000, multa: 25_000, juros: 417 })
    expect(saldoConta(c.infra, CONTAS.RECEITA_ENCARGOS)).toBe(0)
    expect(saldoConta(c.infra, CONTAS.RECEITA_ADMINISTRACAO)).toBe(20_000)
    expect(saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.maria) + saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.joao)).toBe(180_000 + 25_417)
    razaoIntegro(c.infra)
  })

  it('encargos podem ser da imobiliária quando o contrato prevê', async () => {
    const c = await cenario({ destinoEncargos: 'IMOBILIARIA' })
    gerarCobrancas(c.infra, c.admin, '2026-09')
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-15')
    expect(saldoConta(c.infra, CONTAS.RECEITA_ENCARGOS)).toBe(25_417)
  })

  it('desconto e dispensa de encargos exigem permissão específica', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const t = c.cobranca('2026-09')
    const perfil = criarPerfil(c.infra, c.admin, { nome: 'Caixa', descricao: '', permissoes: ['financeiro.ver', 'financeiro.receber'] })
    const u = await criarUsuario(c.infra, c.admin, { nome: 'Caixa', login: 'caixa', email: '', perfilId: perfil.id, pessoaId: null, ativo: true, senhaInicial: 'Caixa1234567' })
    const s = carregarUsuarioSessao(c.infra, u.id)
    c.irPara('2026-10-20')
    expect(() => receber(c.infra, s, { tituloId: t.id, data: '2026-10-20', valorRecebido: '2.500,00', desconto: '', dispensarEncargos: true, contaFinanceiraId: c.banco, forma: 'PIX', observacao: '' })).toThrow('permissão')
    expect(() => receber(c.infra, s, { tituloId: t.id, data: '2026-10-20', valorRecebido: '2.500,00', desconto: '', dispensarEncargos: false, contaFinanceiraId: c.banco, forma: 'PIX', observacao: '' })).not.toThrow()
  })

  it('desconto concedido reduz o crédito do proprietário, não a receita de outros', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const t = c.cobranca('2026-09')
    c.irPara('2026-10-09')
    receber(c.infra, c.admin, { tituloId: t.id, data: '2026-10-09', valorRecebido: '2.400,00', desconto: '100,00', dispensarEncargos: false, contaFinanceiraId: c.banco, forma: 'PIX', observacao: '' })
    const det = obterTitulo(c.infra, c.admin, t.id)
    expect(det.situacao).toBe('LIQUIDADO')
    expect(saldoContaFinanceira(c.infra, c.banco)).toBe(240_000)
    razaoIntegro(c.infra)
  })

  it('recusa recebimento com data futura ou acima do devido', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const t = c.cobranca('2026-09')
    c.irPara('2026-10-01')
    expect(() => receber(c.infra, c.admin, { tituloId: t.id, data: '2026-10-02', valorRecebido: '100', desconto: '', dispensarEncargos: false, contaFinanceiraId: c.banco, forma: 'PIX', observacao: '' })).toThrow('futura')
    expect(() => receber(c.infra, c.admin, { tituloId: t.id, data: '2026-10-01', valorRecebido: '2.600,00', desconto: '', dispensarEncargos: false, contaFinanceiraId: c.banco, forma: 'PIX', observacao: '' })).toThrow('excede')
  })
})

describe('estornos', () => {
  it('estorno reverte título, caixa, saldos e receita, com auditoria', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const t = c.cobranca('2026-09')
    const { baixaId } = c.receberIntegral(t.id, '2026-10-09')
    estornarBaixa(c.infra, c.admin, { baixaId, motivo: 'PIX devolvido pelo banco' })
    const det = obterTitulo(c.infra, c.admin, t.id)
    expect(det.situacao).toBe('ABERTO')
    expect(det.baixas[0]!.estornada).toBe(true)
    expect(saldoContaFinanceira(c.infra, c.banco)).toBe(0)
    expect(saldoConta(c.infra, CONTAS.RECEITA_ADMINISTRACAO)).toBe(0)
    expect(saldosARepassar(c.infra, c.admin)).toEqual([])
    expect(() => estornarBaixa(c.infra, c.admin, { baixaId, motivo: 'de novo' })).toThrow('já estornada')
    const aud = c.infra.bruto.prepare("SELECT descricao FROM auditoria WHERE acao = 'BAIXA_ESTORNADA'").all() as { descricao: string }[]
    expect(aud[0]!.descricao).toContain('PIX devolvido')
    razaoIntegro(c.infra)
  })

  it('razão, baixas e itens são imutáveis no banco', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    expect(() => c.infra.bruto.prepare('UPDATE partida SET credito_centavos = 1').run()).toThrow('não podem ser alteradas')
    expect(() => c.infra.bruto.prepare('DELETE FROM lancamento').run()).toThrow('não podem ser excluídos')
    expect(() => c.infra.bruto.prepare('DELETE FROM baixa').run()).toThrow('estorno')
    expect(() => c.infra.bruto.prepare('UPDATE titulo_item SET valor_centavos = 1').run()).toThrow()
    expect(() => c.infra.bruto.prepare('UPDATE titulo SET valor_centavos = 1').run()).toThrow()
  })
})

describe('repasses', () => {
  it('gera repasse do saldo, paga, mostra demonstrativo e protege estornos', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const t = c.cobranca('2026-09')
    const { baixaId } = c.receberIntegral(t.id, '2026-10-09')
    const rep = gerarRepasse(c.infra, c.admin, { tipo: 'PROPRIETARIO', pessoaId: c.maria, vencimento: '2026-10-15' })
    expect(rep.valorCentavos).toBe(108_000)
    expect(saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.maria)).toBe(0)
    const dem = demonstrativoRepasse(c.infra, c.admin, rep.id)
    expect(dem.linhas.reduce((s, l) => s + l.creditoCentavos - l.debitoCentavos, 0)).toBe(108_000)
    expect(dem.linhas.some((l) => /Taxa de administração/.test(l.historico))).toBe(true)
    // Estorno do recebimento bloqueado enquanto o repasse está em aberto.
    expect(() => estornarBaixa(c.infra, c.admin, { baixaId, motivo: 'teste de bloqueio' })).toThrow('Cancele o repasse')
    pagar(c.infra, c.admin, { tituloId: rep.tituloId!, data: '2026-10-09', valor: '1.080,00', contaFinanceiraId: c.banco, forma: 'TRANSFERENCIA', observacao: '' })
    expect(demonstrativoRepasse(c.infra, c.admin, rep.id).repasse.situacao).toBe('PAGO')
    expect(saldoContaFinanceira(c.infra, c.banco)).toBe(250_000 - 108_000)
    // Após o pagamento, estornar o recebimento deixa a proprietária com saldo devedor.
    estornarBaixa(c.infra, c.admin, { baixaId, motivo: 'Cheque devolvido' })
    expect(saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.maria)).toBe(-108_000)
    expect(() => gerarRepasse(c.infra, c.admin, { tipo: 'PROPRIETARIO', pessoaId: c.maria, vencimento: '2026-11-15' })).toThrow('Saldo devedor')
    razaoIntegro(c.infra)
  })

  it('cancelar repasse devolve as partidas ao saldo pendente; pagamento sem saldo é recusado', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    const rep = gerarRepasse(c.infra, c.admin, { tipo: 'TERCEIRO', pessoaId: c.condominio, vencimento: '2026-10-15' })
    expect(rep.valorCentavos).toBe(50_000)
    cancelarRepasse(c.infra, c.admin, rep.id, 'Valor será pago junto com outubro')
    expect(saldoPendenteRepasse(c.infra, CONTAS.TERCEIROS, c.condominio)).toBe(50_000)
    const rep2 = gerarRepasse(c.infra, c.admin, { tipo: 'PROPRIETARIO', pessoaId: c.maria, vencimento: '2026-10-15' })
    const vazia = salvarContaFinanceira(c.infra, c.admin, null, { nome: 'Caixa', tipo: 'CAIXA', titularidade: 'PROPRIO', saldoInicial: '0', dataSaldoInicial: '2026-08-01', ativa: true, bancoCodigo: '', agencia: '', conta: '' }).id
    expect(() => pagar(c.infra, c.admin, { tituloId: rep2.tituloId!, data: '2026-10-09', valor: '1.080,00', contaFinanceiraId: vazia, forma: 'PIX', observacao: '' })).toThrow('Saldo insuficiente')
  })
})

describe('lançamentos avulsos', () => {
  it('débito ao proprietário reduz o repasse; cobrança ao locatário entra na próxima fatura', async () => {
    const c = await cenario()
    criarLancamento(c.infra, c.admin, { contratoId: c.contratoId, competencia: '2026-09', descricao: 'Conserto de torneira', valor: '150,00', pagador: 'PROPRIETARIO', destino: 'TERCEIRO', beneficiarioId: c.condominio })
    criarLancamento(c.infra, c.admin, { contratoId: c.contratoId, competencia: '2026-09', descricao: 'Segunda via de chave', valor: '40,00', pagador: 'LOCATARIO', destino: 'IMOBILIARIA', beneficiarioId: null })
    expect(saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.maria)).toBe(-9_000)
    gerarCobrancas(c.infra, c.admin, '2026-09')
    const t = obterTitulo(c.infra, c.admin, c.cobranca('2026-09').id)
    expect(t.itens.map((i) => i.descricao)).toContain('Segunda via de chave')
    expect(t.valorCentavos).toBe(254_000)
    // Cancelar a cobrança devolve o avulso para pendente e permite gerar novamente.
    cancelarTitulo(c.infra, c.admin, t.id, 'Cobrança emitida com erro')
    expect(gerarCobrancas(c.infra, c.admin, '2026-09').geradas).toBe(1)
    expect(obterTitulo(c.infra, c.admin, c.cobranca('2026-09').id).valorCentavos).toBe(254_000)
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    expect(saldoConta(c.infra, CONTAS.RECEITA_OUTRAS)).toBe(4_000)
    razaoIntegro(c.infra)
  })

  it('crédito ao locatário por conta do proprietário e cancelamento com estorno', async () => {
    const c = await cenario()
    const { id } = criarLancamento(c.infra, c.admin, { contratoId: c.contratoId, competencia: '2026-09', descricao: 'Taxa de vistoria', valor: '200,00', pagador: 'PROPRIETARIO', destino: 'IMOBILIARIA', beneficiarioId: null })
    cancelarLancamento(c.infra, c.admin, id, 'Cobrança indevida')
    expect(saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.maria)).toBe(0)
    criarLancamento(c.infra, c.admin, { contratoId: c.contratoId, competencia: '2026-09', descricao: 'Abatimento: pintura feita pelo locatário', valor: '-300,00', pagador: 'LOCATARIO', destino: 'PROPRIETARIO', beneficiarioId: null })
    gerarCobrancas(c.infra, c.admin, '2026-09')
    expect(obterTitulo(c.infra, c.admin, c.cobranca('2026-09').id).valorCentavos).toBe(220_000)
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    // Proprietários: aluguel 2.000 − taxa 200 − abatimento 300 = 1.500
    expect(saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.maria) + saldoPendenteRepasse(c.infra, CONTAS.PROPRIETARIOS, c.joao)).toBe(150_000)
    razaoIntegro(c.infra)
  })
})

describe('reajuste e aditivo', () => {
  it('bloqueia a geração até aplicar o reajuste e usa o novo valor', async () => {
    const c = await cenario()
    for (const comp of ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'])
      salvarValorIndice(c.infra, c.admin, { indiceId: c.igpm, competencia: comp, variacao: '0,5' })
    c.irPara('2027-08-01')
    for (let m = 8; m <= 12; m++) gerarCobrancas(c.infra, c.admin, `2026-${String(m).padStart(2, '0')}`)
    for (let m = 1; m <= 7; m++) gerarCobrancas(c.infra, c.admin, `2027-0${m}`)
    const r = gerarCobrancas(c.infra, c.admin, '2027-08')
    expect(r.bloqueadas[0]!.motivo).toContain('Reajuste pendente')
    expect(() => aplicarReajusteContrato(c.infra, c.admin, c.contratoId)).toThrow('2027-07')
    salvarValorIndice(c.infra, c.admin, { indiceId: c.igpm, competencia: '2027-07', variacao: '0,5' })
    const p = reajustesPendentes(c.infra, c.admin)[0]!
    expect(p.acumuladoPpm).toBe(61_678) // 1,005^12 − 1
    aplicarReajusteContrato(c.infra, c.admin, c.contratoId)
    gerarCobrancas(c.infra, c.admin, '2027-08')
    const t = obterTitulo(c.infra, c.admin, c.cobranca('2027-08').id)
    expect(t.itens[0]!.valorCentavos).toBe(212_336)
    expect(obterTitulo(c.infra, c.admin, c.cobranca('2027-07').id).itens[0]!.valorCentavos).toBe(200_000)
    expect(obterContrato(c.infra, c.admin, c.contratoId).proximoReajuste).toBe('2028-08-11')
  })

  it('índice negativo não reduz o aluguel; dispensa registra motivo', async () => {
    const c = await cenario()
    for (let i = 0; i < 12; i++) {
      const comp = `${i < 5 ? 2026 : 2027}-${String(((7 + i) % 12) + 1).padStart(2, '0')}`
      salvarValorIndice(c.infra, c.admin, { indiceId: c.igpm, competencia: comp, variacao: '-0,2' })
    }
    c.irPara('2027-08-01')
    const p = reajustesPendentes(c.infra, c.admin)[0]!
    expect(p.acumuladoPpm).toBeLessThan(0)
    expect(p.novoValorCentavos).toBe(200_000)
    dispensarReajuste(c.infra, c.admin, c.contratoId, 'Acordo com o proprietário')
    expect(reajustesPendentes(c.infra, c.admin)).toHaveLength(0)
  })

  it('aditivo de valor vale a partir da competência indicada e não retroage', async () => {
    const c = await cenario()
    c.irPara('2026-10-01')
    gerarCobrancas(c.infra, c.admin, '2026-09')
    expect(() => registrarAditivo(c.infra, c.admin, { contratoId: c.contratoId, tipo: 'ALTERACAO_VALOR', data: '2026-10-01', descricao: 'Redução negociada', valorNovo: '1.800,00', competenciaVigencia: '2026-09', dataFimNova: '' })).toThrow('posterior')
    registrarAditivo(c.infra, c.admin, { contratoId: c.contratoId, tipo: 'ALTERACAO_VALOR', data: '2026-10-01', descricao: 'Redução negociada', valorNovo: '1.800,00', competenciaVigencia: '2026-10', dataFimNova: '' })
    gerarCobrancas(c.infra, c.admin, '2026-10')
    expect(obterTitulo(c.infra, c.admin, c.cobranca('2026-10').id).itens[0]!.valorCentavos).toBe(180_000)
  })
})

describe('primeiro aluguel e caução', () => {
  it('taxa de intermediação no primeiro aluguel e administração a partir do segundo (Q8)', async () => {
    const c = await cenario({ taxaIntermediacao: '100', dataInicio: '2026-08-01', dataFim: '2029-07-31' })
    gerarCobrancas(c.infra, c.admin, '2026-08')
    gerarCobrancas(c.infra, c.admin, '2026-09')
    c.receberIntegral(c.cobranca('2026-08').id, '2026-09-10')
    c.receberIntegral(c.cobranca('2026-09').id, '2026-10-09')
    expect(saldoConta(c.infra, CONTAS.RECEITA_INTERMEDIACAO)).toBe(200_000)
    expect(saldoConta(c.infra, CONTAS.RECEITA_ADMINISTRACAO)).toBe(20_000)
    razaoIntegro(c.infra)
  })

  it('caução recebida é recurso de terceiros e é devolvida na rescisão', async () => {
    const c = await cenario({ garantiaTipo: 'CAUCAO', garantiaValor: '6.000,00' })
    const cau = listarTitulos(c.infra, c.admin, { contratoId: c.contratoId, origem: 'CAUCAO' }).itens[0]!
    c.receberIntegral(cau.id, '2026-08-11')
    expect(saldoConta(c.infra, CONTAS.CAUCOES)).toBe(600_000)
    expect(saldoConta(c.infra, CONTAS.RECEITA_OUTRAS) + saldoConta(c.infra, CONTAS.RECEITA_ADMINISTRACAO)).toBe(0)
    c.irPara('2026-09-20')
    gerarCobrancas(c.infra, c.admin, '2026-08')
    const r = rescindir(c.infra, c.admin, { contratoId: c.contratoId, dataEntregaChaves: '2026-09-20', iniciativa: 'LOCATARIO', motivo: 'Mudança de cidade', cobrarMulta: true, dispensaMotivo: '' })
    expect(r.repasseCaucaoId).not.toBeNull()
    const devol = listarTitulos(c.infra, c.admin, { origem: 'DEVOLUCAO_CAUCAO' }).itens[0]!
    expect(devol.valorCentavos).toBe(600_000)
    expect(devol.pessoaId).toBe(c.carlos)
    razaoIntegro(c.infra)
  })
})

describe('rescisão', () => {
  it('cobra aluguel proporcional, multa proporcional e libera o imóvel', async () => {
    const c = await cenario()
    c.irPara('2027-03-15')
    for (const comp of ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']) gerarCobrancas(c.infra, c.admin, comp)
    const sim = simularRescisao(c.infra, c.admin, c.contratoId, '2027-03-15')
    expect(sim.aluguelProporcionalCentavos).toBe(96_774) // 15/31 de 2.000
    expect(sim.diasRestantes).toBe(879)
    const r = rescindir(c.infra, c.admin, { contratoId: c.contratoId, dataEntregaChaves: '2027-03-15', iniciativa: 'LOCATARIO', motivo: 'Compra de imóvel próprio', cobrarMulta: true, dispensaMotivo: '' })
    const final = obterTitulo(c.infra, c.admin, c.cobranca('2027-03').id)
    expect(final.itens.find((i) => i.tipo === 'ALUGUEL')!.valorCentavos).toBe(96_774)
    const resc = obterTitulo(c.infra, c.admin, r.tituloRescisaoId!)
    expect(resc.itens[0]!.tipo).toBe('MULTA_RESCISORIA')
    expect(resc.itens[0]!.valorCentavos).toBe(sim.multaCalculadaCentavos)
    expect(obterContrato(c.infra, c.admin, c.contratoId).situacao).toBe('RESCINDIDO')
    expect(obterImovel(c.infra, c.admin, c.imovelId).ofertas.find((o) => o.modalidade === 'LOCACAO')!.situacao).toBe('DISPONIVEL')
    expect(gerarCobrancas(c.infra, c.admin, '2027-04').geradas).toBe(0)
  })

  it('exige cobranças geradas até o mês anterior e permite dispensar a multa com motivo', async () => {
    const c = await cenario()
    c.irPara('2026-11-05')
    expect(() => rescindir(c.infra, c.admin, { contratoId: c.contratoId, dataEntregaChaves: '2026-11-05', iniciativa: 'MUTUO', motivo: 'Acordo', cobrarMulta: false, dispensaMotivo: 'Acordo entre as partes' })).toThrow('Gere as cobranças')
    for (const comp of ['2026-08', '2026-09', '2026-10']) gerarCobrancas(c.infra, c.admin, comp)
    const r = rescindir(c.infra, c.admin, { contratoId: c.contratoId, dataEntregaChaves: '2026-11-05', iniciativa: 'MUTUO', motivo: 'Acordo', cobrarMulta: false, dispensaMotivo: 'Acordo entre as partes' })
    expect(r.tituloRescisaoId).toBeNull()
  })
})

describe('inadimplência e renegociação', () => {
  it('lista vencidos com encargos e renegocia preservando a destinação dos valores', async () => {
    const c = await cenario()
    gerarCobrancas(c.infra, c.admin, '2026-09')
    gerarCobrancas(c.infra, c.admin, '2026-10')
    c.irPara('2026-11-20')
    const inad = inadimplencia(c.infra, c.admin)
    expect(inad).toHaveLength(2)
    expect(inad[0]!.diasAtraso).toBe(41)
    const encargos = inad.reduce((s, l) => s + l.multaCentavos + l.jurosCentavos, 0)
    const saldo = inad.reduce((s, l) => s + l.saldoCentavos, 0)
    const r = renegociar(c.infra, c.admin, { titulos: inad.map((l) => l.tituloId), data: '2026-11-20', incluirEncargos: true, descontoEncargos: '', parcelas: 3, primeiroVencimento: '2026-12-10', motivo: 'Acordo com o locatário' })
    expect(r.titulos).toHaveLength(3)
    const parcelas = r.titulos.map((id) => obterTitulo(c.infra, c.admin, id))
    expect(parcelas.reduce((s, p) => s + p.valorCentavos, 0)).toBe(saldo + encargos)
    expect(inad.map((l) => obterTitulo(c.infra, c.admin, l.tituloId).situacao)).toEqual(['RENEGOCIADO', 'RENEGOCIADO'])
    expect(inadimplencia(c.infra, c.admin)).toHaveLength(0)
    c.receberIntegral(parcelas[0]!.id, '2026-12-10')
    expect(saldoPendenteRepasse(c.infra, CONTAS.TERCEIROS, c.condominio)).toBe(33_334) // 1/3 de 1.000 de condomínio
    expect(saldoConta(c.infra, CONTAS.RECEITA_ADMINISTRACAO)).toBeGreaterThan(0)
    razaoIntegro(c.infra)
  })
})
