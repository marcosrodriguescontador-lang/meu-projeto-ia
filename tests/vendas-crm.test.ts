import { afterEach, describe, expect, it } from 'vitest'
import { estornarBaixa, pagar, receber } from '../src/main/modules/financeiro/baixas'
import { salvarContaFinanceira } from '../src/main/modules/financeiro/cadastros'
import { alterarRateio, alvoLiberacao, cancelarComissao, comissoesPorBeneficiario, obterComissao } from '../src/main/modules/financeiro/comissoes'
import { CONTAS, saldoConta } from '../src/main/modules/financeiro/razao'
import { gerarRelatorio } from '../src/main/modules/financeiro/relatorios'
import { posicaoTerceiros } from '../src/main/modules/financeiro/tesouraria'
import { cancelarTitulo, listarTitulos, obterTitulo } from '../src/main/modules/financeiro/titulos'
import { gerarCobrancas } from '../src/main/modules/locacoes/cobrancas'
import { agenda, agendarVisita, concluirAtividade, criarAtividade, registrarResultadoVisita } from '../src/main/modules/crm/agenda'
import { criarLead, descartarLead, listarLeads, obterLead, sugerirImoveis } from '../src/main/modules/crm/leads'
import { concluirLocacao, criarNegocio, indicadoresFunil, listarNegocios, moverEtapa, obterNegocio } from '../src/main/modules/crm/negocios'
import { criarImovel, obterImovel } from '../src/main/modules/imoveis/imoveis'
import { criarPessoa } from '../src/main/modules/pessoas/pessoas'
import { listarPerfis } from '../src/main/modules/seguranca/perfis'
import { carregarUsuarioSessao, criarUsuario } from '../src/main/modules/seguranca/usuarios'
import { registrarProposta, responderProposta } from '../src/main/modules/vendas/propostas'
import { alterarSituacaoVenda, informarParcelaPaga, registrarComissaoLocacao, registrarVenda } from '../src/main/modules/vendas/vendas'
import type { VendaInput } from '../src/shared/schemas-crm'
import { ratear } from '../src/shared/financeiro/calculos'
import { ambienteConfigurado, imovelBase, pessoaFisica } from './apoio'
import { cenario, limpezas, razaoIntegro } from './cenario-locacao'

afterEach(() => {
  limpezas.splice(0).forEach((f) => f())
})

const RATEIO = (captador: number, vendedor: number) => [
  { papel: 'IMOBILIARIA' as const, beneficiarioId: null, percentual: '50' },
  { papel: 'CAPTADOR' as const, beneficiarioId: captador, percentual: '20' },
  { papel: 'VENDEDOR' as const, beneficiarioId: vendedor, percentual: '30' }
]

async function ambiente() {
  const relogio = { agora: new Date('2026-10-05T12:00:00Z') }
  const a = await ambienteConfigurado(() => relogio.agora)
  limpezas.push(() => (a.fechar(), a.apagar()))
  const { infra, admin } = a
  const maria = criarPessoa(infra, admin, pessoaFisica()).id
  const pedro = criarPessoa(infra, admin, pessoaFisica({ nome: 'Pedro Comprador', documento: '526.018.159-06', estadoCivil: '', regimeBens: '', papeis: ['COMPRADOR'] })).id
  const ana = criarPessoa(infra, admin, pessoaFisica({ nome: 'Ana Captadora', documento: '083.016.613-05', estadoCivil: '', regimeBens: '', papeis: ['CORRETOR'], creci: '123456-F' })).id
  const bruno = criarPessoa(infra, admin, pessoaFisica({ nome: 'Bruno Vendedor', documento: '186.091.390-34', estadoCivil: '', regimeBens: '', papeis: ['CORRETOR'], creci: '654321-F' })).id
  const imovelId = criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '100', principal: true }], { corretorId: ana, venda: { ativa: true, valor: '500.000,00', comissao: '6' } })).id
  const conta = (titularidade: 'PROPRIO' | 'TERCEIROS') =>
    salvarContaFinanceira(infra, admin, null, { nome: `Banco ${titularidade}`, tipo: 'CORRENTE', titularidade, saldoInicial: titularidade === 'PROPRIO' ? '50.000,00' : '0', dataSaldoInicial: '2026-09-01', ativa: true, bancoCodigo: '', agencia: '', conta: '' }).id
  const propria = conta('PROPRIO')
  const terceiros = conta('TERCEIROS')
  const origem = (infra.bruto.prepare("SELECT id FROM origem_lead WHERE nome = 'Portal imobiliário'").get() as { id: number }).id
  const irPara = (d: string) => (relogio.agora = new Date(`${d}T12:00:00Z`))
  const lancamentos = () => (infra.bruto.prepare('SELECT count(*) n FROM lancamento').get() as { n: number }).n
  const receberTitulo = (tituloId: number, valor: number, data: string, contaId = propria) => {
    irPara(data)
    return receber(infra, admin, { tituloId, data, valorRecebido: valor / 100, desconto: '', dispensarEncargos: false, contaFinanceiraId: contaId, forma: 'PIX', observacao: '' })
  }
  /** Lead → negócio → visita → proposta → contraproposta → aceite. */
  const negociar = () => {
    const leadId = criarLead(infra, admin, { nome: 'Pedro Comprador', telefone: '(11) 97777-6666', email: '', pessoaId: pedro, origemId: origem, corretorId: bruno, interesse: 'COMPRA', tipoImovel: 'APARTAMENTO', bairros: 'Bela Vista, Centro', valorMin: '400.000,00', valorMax: '600.000,00', dormitoriosMin: 2, observacoes: '', consentimentoContato: true, idExterno: 'PORTAL-1' }).id
    const negocioId = criarNegocio(infra, admin, { tipo: 'VENDA', titulo: 'Apto Paulista — Pedro', leadId, imovelId, valorEstimado: '500.000,00' }).id
    return { leadId, negocioId }
  }
  const vendaPadrao = (negocioId: number, extra: Partial<VendaInput> = {}): VendaInput => ({
    negocioId,
    dataContrato: '2026-10-05',
    valor: '500.000,00',
    compradores: [{ pessoaId: pedro, percentual: '100' }],
    vendedores: [{ pessoaId: maria, percentual: '100' }],
    parcelas: [
      { tipo: 'SINAL', descricao: 'Sinal', valor: '50.000,00', vencimento: '2026-10-05', viaImobiliaria: false },
      { tipo: 'FINANCIAMENTO', descricao: 'Financiamento Caixa', valor: '450.000,00', vencimento: '2026-12-01', viaImobiliaria: false }
    ],
    financiamentoBanco: 'Caixa',
    comissaoPercentual: '6',
    comissaoPagadorId: maria,
    comissaoVencimento: '2026-10-10',
    comissaoDescontadaDoSinal: false,
    rateio: RATEIO(ana, bruno),
    observacoes: '',
    ...extra
  })
  return { ...a, relogio, irPara, maria, pedro, ana, bruno, imovelId, propria, terceiros, origem, lancamentos, receberTitulo, negociar, vendaPadrao }
}

describe('CRM: leads, funil, visitas e propostas', () => {
  it('percorre o funil com histórico, visita, proposta e contraproposta imutáveis', async () => {
    const c = await ambiente()
    const { leadId, negocioId } = c.negociar()
    expect(obterLead(c.infra, c.admin, leadId).situacao).toBe('CONVERTIDO')
    expect(sugerirImoveis(c.infra, c.admin, leadId).map((i) => i.imovelId)).toEqual([c.imovelId])
    // Visita agendada não pode conflitar; realizada avança o negócio para a etapa Visita.
    const visita = agendarVisita(c.infra, c.admin, { imovelId: c.imovelId, negocioId, dataHora: '2026-10-06T10:00' }).id
    expect(() => agendarVisita(c.infra, c.admin, { imovelId: c.imovelId, negocioId, dataHora: '2026-10-06T10:00' })).toThrow('Já há visita')
    expect(() => registrarResultadoVisita(c.infra, c.admin, { visitaId: visita, situacao: 'REALIZADA', feedback: '', avaliacao: 4 })).toThrow('ainda não aconteceu')
    c.irPara('2026-10-07')
    registrarResultadoVisita(c.infra, c.admin, { visitaId: visita, situacao: 'REALIZADA', feedback: 'Gostou da vista', avaliacao: 4 })
    expect(obterNegocio(c.infra, c.admin, negocioId).etapa).toBe('VISITA')
    const p1 = registrarProposta(c.infra, c.admin, { negocioId, autor: 'CLIENTE', valor: '460.000,00', sinal: '46.000,00', parcelas: [], financiamentoBanco: 'Caixa', financiamento: '400.000,00', condicoes: 'Sujeito à aprovação do crédito', validade: '2026-10-15' }).id
    expect(obterNegocio(c.infra, c.admin, negocioId).etapa).toBe('PROPOSTA')
    expect(() => registrarProposta(c.infra, c.admin, { negocioId, autor: 'CLIENTE', valor: '470.000,00', parcelas: [] })).toThrow('proposta em análise')
    expect(() => registrarProposta(c.infra, c.admin, { negocioId, anteriorId: p1, autor: 'CLIENTE', valor: '470.000,00', parcelas: [] })).toThrow('outra parte')
    const p2 = registrarProposta(c.infra, c.admin, { negocioId, anteriorId: p1, autor: 'PROPRIETARIO', valor: '500.000,00', sinal: '50.000,00', parcelas: [], financiamentoBanco: 'Caixa', financiamento: '450.000,00' }).id
    const n = obterNegocio(c.infra, c.admin, negocioId)
    expect(n.etapa).toBe('NEGOCIACAO')
    expect(n.propostas.map((p) => [p.versao, p.situacao, p.saldoCentavos])).toEqual([
      [2, 'EM_ANALISE', 0],
      [1, 'CONTRAPROPOSTA', 1_400_000]
    ])
    expect(() => c.infra.bruto.prepare('UPDATE proposta SET valor_centavos = 1 WHERE id = ?').run(p1)).toThrow('não podem ser alteradas')
    responderProposta(c.infra, c.admin, { propostaId: p2, situacao: 'ACEITA' })
    expect(obterImovel(c.infra, c.admin, c.imovelId).ofertas.find((o) => o.modalidade === 'VENDA')!.situacao).toBe('EM_NEGOCIACAO')
    expect(n.historico.map((h) => h.para)).toEqual(['ATENDIMENTO', 'VISITA', 'PROPOSTA', 'NEGOCIACAO'])
    expect(() => c.infra.bruto.prepare('DELETE FROM negocio_etapa_hist').run()).toThrow()
  })

  it('tarefas na agenda e regras do funil (perda com motivo, conclusão só por venda/contrato)', async () => {
    const c = await ambiente()
    const { leadId, negocioId } = c.negociar()
    const t = criarAtividade(c.infra, c.admin, { negocioId, tipo: 'LIGACAO', titulo: 'Retornar sobre financiamento', agendadaPara: '2026-10-04T09:00' }).id
    criarAtividade(c.infra, c.admin, { leadId, tipo: 'WHATSAPP', titulo: 'Enviar fotos', agendadaPara: '2026-10-08T15:00' })
    const itens = agenda(c.infra, c.admin, { de: '2026-10-05', ate: '2026-10-12' })
    expect(itens.map((i) => [i.titulo, i.atrasada])).toEqual([
      ['Retornar sobre financiamento', true],
      ['Enviar fotos', false]
    ])
    concluirAtividade(c.infra, c.admin, t, 'Crédito pré-aprovado')
    expect(agenda(c.infra, c.admin, { de: '2026-10-05', ate: '2026-10-12' })).toHaveLength(1)
    expect(() => moverEtapa(c.infra, c.admin, { negocioId, etapa: 'CONCLUIDO' })).toThrow('escritura')
    expect(() => moverEtapa(c.infra, c.admin, { negocioId, etapa: 'CONTRATO' })).toThrow('Registre a venda')
    expect(() => moverEtapa(c.infra, c.admin, { negocioId, etapa: 'PERDIDO' })).toThrow()
    moverEtapa(c.infra, c.admin, { negocioId, etapa: 'PERDIDO', motivoPerda: 'Preço' })
    expect(() => descartarLead(c.infra, c.admin, leadId, 'Sem interesse')).not.toThrow()
    moverEtapa(c.infra, c.admin, { negocioId, etapa: 'ATENDIMENTO', observacao: 'Cliente voltou' })
    expect(obterNegocio(c.infra, c.admin, negocioId).historico.at(-1)!.observacao).toBe('Reaberto: Cliente voltou')
  })

  it('corretor sem carteira toda vê e atua só nos próprios clientes', async () => {
    const c = await ambiente()
    const { negocioId } = c.negociar() // corretor: Bruno
    const perfil = listarPerfis(c.infra, c.admin).find((p) => p.nome === 'Corretor')!
    const mk = async (login: string, pessoaId: number) => carregarUsuarioSessao(c.infra, (await criarUsuario(c.infra, c.admin, { nome: login, login, email: '', perfilId: perfil.id, pessoaId, ativo: true, senhaInicial: 'Corretor12345' })).id)
    const bruno = await mk('bruno', c.bruno)
    const ana = await mk('ana', c.ana)
    expect(listarNegocios(c.infra, bruno).map((n) => n.id)).toEqual([negocioId])
    expect(listarNegocios(c.infra, ana)).toEqual([])
    expect(listarLeads(c.infra, ana)).toEqual([])
    expect(() => obterNegocio(c.infra, ana, negocioId)).toThrow('permissão')
    const proprio = criarLead(c.infra, ana, { nome: 'Cliente da Ana', telefone: '11 90000-0000', origemId: c.origem, corretorId: c.bruno, interesse: 'LOCACAO', consentimentoContato: true })
    expect(obterLead(c.infra, ana, proprio.id).corretorId).toBe(c.ana) // sempre para si
    expect(() => registrarVenda(c.infra, bruno, c.vendaPadrao(negocioId))).toThrow('permissão')
  })
})

describe('venda e comissões', () => {
  it('registrar a venda não gera recebimento nem movimento no razão', async () => {
    const c = await ambiente()
    const { negocioId } = c.negociar()
    const antes = c.lancamentos()
    const { vendaId, comissaoId } = registrarVenda(c.infra, c.admin, c.vendaPadrao(negocioId))
    expect(c.lancamentos()).toBe(antes)
    expect(saldoConta(c.infra, '3.2.01')).toBe(0)
    const com = obterComissao(c.infra, c.admin, comissaoId!)
    expect(com).toMatchObject({ valorCentavos: 3_000_000, recebidoCentavos: 0 })
    expect(com.rateio.map((r) => [r.papel, r.valorCentavos, r.liberadoCentavos])).toEqual([
      ['IMOBILIARIA', 1_500_000, 0],
      ['CAPTADOR', 600_000, 0],
      ['VENDEDOR', 900_000, 0]
    ])
    expect(listarTitulos(c.infra, c.admin, { origem: 'COMISSAO_CORRETOR' }).total).toBe(0)
    const n = obterNegocio(c.infra, c.admin, negocioId)
    expect(n.etapa).toBe('CONTRATO')
    expect(n.venda).toMatchObject({ id: vendaId, situacao: 'CONTRATADA' })
    expect(obterImovel(c.infra, c.admin, c.imovelId).ofertas.find((o) => o.modalidade === 'VENDA')!.situacao).toBe('VENDIDO')
    expect(() => cancelarTitulo(c.infra, c.admin, com.tituloId!, 'Teste manual')).toThrow('pela venda ou pela comissão')
    // Pagamento direto entre as partes: só informado.
    informarParcelaPaga(c.infra, c.admin, n.venda!.parcelas[0]!.id, '2026-10-05')
    expect(c.lancamentos()).toBe(antes)
    alterarSituacaoVenda(c.infra, c.admin, { vendaId, situacao: 'ESCRITURADA', data: '2026-10-05' })
    expect(obterNegocio(c.infra, c.admin, negocioId).etapa).toBe('CONCLUIDO')
  })

  it('comissão do corretor só vira "a pagar" após o recebimento, proporcionalmente, e acompanha estornos', async () => {
    const c = await ambiente()
    const { negocioId } = c.negociar()
    const { comissaoId } = registrarVenda(c.infra, c.admin, c.vendaPadrao(negocioId))
    const tituloComissao = obterComissao(c.infra, c.admin, comissaoId!).tituloId!
    const b1 = c.receberTitulo(tituloComissao, 1_000_000, '2026-10-06') // 1/3 da comissão
    let com = obterComissao(c.infra, c.admin, comissaoId!)
    expect(com.recebidoCentavos).toBe(1_000_000)
    expect(com.rateio.map((r) => r.liberadoCentavos)).toEqual([0, 200_000, 300_000])
    expect(com.rateioEditavel).toBe(false)
    expect(() => alterarRateio(c.infra, c.admin, comissaoId!, RATEIO(c.bruno, c.ana))).toThrow('não pode mais ser alterado')
    const aPagar = listarTitulos(c.infra, c.admin, { origem: 'COMISSAO_CORRETOR' }).itens
    expect(aPagar.map((t) => t.valorCentavos).sort()).toEqual([200_000, 300_000])
    // Paga a parte da captadora.
    const tituloAna = aPagar.find((t) => t.valorCentavos === 200_000)!.id
    pagar(c.infra, c.admin, { tituloId: tituloAna, data: '2026-10-06', valor: '2.000,00', contaFinanceiraId: c.propria, forma: 'PIX', observacao: '' })
    // Recebe o restante.
    const b2 = c.receberTitulo(tituloComissao, 2_000_000, '2026-10-07')
    com = obterComissao(c.infra, c.admin, comissaoId!)
    expect(com.rateio.map((r) => [r.liberadoCentavos, r.pagoCentavos])).toEqual([
      [0, 0],
      [600_000, 200_000],
      [900_000, 0]
    ])
    // Estornar o 2º recebimento cancela as liberações ainda não pagas que dependiam dele.
    estornarBaixa(c.infra, c.admin, { baixaId: b2.baixaId, motivo: 'Cheque devolvido' })
    com = obterComissao(c.infra, c.admin, comissaoId!)
    expect(com.rateio.map((r) => r.liberadoCentavos)).toEqual([0, 200_000, 300_000])
    // Estornar o 1º recebimento é bloqueado: a parte da captadora já foi paga.
    expect(() => estornarBaixa(c.infra, c.admin, { baixaId: b1.baixaId, motivo: 'Erro de digitação' })).toThrow('Ana Captadora')
    // Resultado: receita de comissão 10.000; despesa de comissão paga 2.000.
    expect(saldoConta(c.infra, '3.2.01')).toBe(1_000_000)
    expect(saldoConta(c.infra, '4.1.03')).toBe(-200_000)
    const rel = gerarRelatorio(c.infra, c.admin, 'comissoes')
    expect(rel.linhas.map((l) => [l.beneficiario, l.previsto, l.liberado, l.pago, l.aPagar])).toEqual([
      ['Ana Captadora', 600_000, 200_000, 200_000, 0],
      ['Bruno Vendedor', 900_000, 300_000, 0, 300_000]
    ])
    expect(comissoesPorBeneficiario(c.infra, c.admin)).toHaveLength(2)
    razaoIntegro(c.infra)
  })

  it('comissão retida do sinal que transita pela imobiliária: vendedor recebe o líquido como recurso de terceiros', async () => {
    const c = await ambiente()
    const { negocioId } = c.negociar()
    const { vendaId, comissaoId } = registrarVenda(
      c.infra,
      c.admin,
      c.vendaPadrao(negocioId, {
        parcelas: [
          { tipo: 'SINAL', descricao: 'Sinal', valor: '50.000,00', vencimento: '2026-10-06', viaImobiliaria: true },
          { tipo: 'FINANCIAMENTO', descricao: 'Financiamento', valor: '450.000,00', vencimento: '2026-12-01', viaImobiliaria: false }
        ],
        comissaoDescontadaDoSinal: true,
        comissaoPagadorId: null,
        comissaoVencimento: ''
      })
    )
    const sinal = obterNegocio(c.infra, c.admin, negocioId).venda!.parcelas.find((p) => p.tipo === 'SINAL')!
    const t = obterTitulo(c.infra, c.admin, sinal.tituloId!)
    expect(t).toMatchObject({ pessoaId: c.pedro, recurso: 'TERCEIROS', valorCentavos: 5_000_000 })
    expect(t.itens.map((i) => [i.destino, i.valorCentavos])).toEqual([
      ['TERCEIRO', 2_000_000],
      ['IMOBILIARIA', 3_000_000]
    ])
    expect(obterComissao(c.infra, c.admin, comissaoId!).tituloId).toBeNull()
    c.receberTitulo(sinal.tituloId!, 5_000_000, '2026-10-06', c.terceiros)
    expect(saldoConta(c.infra, CONTAS.TERCEIROS)).toBe(2_000_000) // devido à vendedora
    expect(obterComissao(c.infra, c.admin, comissaoId!).rateio.map((r) => r.liberadoCentavos)).toEqual([0, 600_000, 900_000])
    // A comissão recebida pertence à imobiliária mesmo estando na conta de terceiros.
    expect(posicaoTerceiros(c.infra).recursosPropriosEmContasDeTerceiros).toBe(3_000_000)
    expect(obterNegocio(c.infra, c.admin, negocioId).venda!.parcelas.find((p) => p.tipo === 'SINAL')!.situacao).toBe('PAGA')
    expect(vendaId).toBeGreaterThan(0)
    razaoIntegro(c.infra)
  })

  it('distrato cancela valores não recebidos, devolve o imóvel à venda e mantém a comissão para decisão', async () => {
    const c = await ambiente()
    const { negocioId } = c.negociar()
    const { vendaId, comissaoId } = registrarVenda(
      c.infra,
      c.admin,
      c.vendaPadrao(negocioId, {
        parcelas: [
          { tipo: 'SINAL', descricao: 'Sinal', valor: '50.000,00', vencimento: '2026-10-06', viaImobiliaria: true },
          { tipo: 'FINANCIAMENTO', descricao: 'Financiamento', valor: '450.000,00', vencimento: '2026-12-01', viaImobiliaria: false }
        ]
      })
    )
    const r = alterarSituacaoVenda(c.infra, c.admin, { vendaId, situacao: 'DISTRATADA', data: '2026-10-05', motivo: 'Financiamento negado' })
    expect(r.avisos).toEqual(['A comissão foi mantida. Se não for devida, cancele-a em Comissões.'])
    const n = obterNegocio(c.infra, c.admin, negocioId)
    expect(n).toMatchObject({ etapa: 'PERDIDO', motivoPerda: 'Distrato: Financiamento negado' })
    expect(n.venda!.parcelas.map((p) => p.situacao)).toEqual(['CANCELADA', 'CANCELADA'])
    expect(obterImovel(c.infra, c.admin, c.imovelId).ofertas.find((o) => o.modalidade === 'VENDA')!.situacao).toBe('DISPONIVEL')
    cancelarComissao(c.infra, c.admin, comissaoId!, 'Distrato sem comissão devida')
    expect(obterTitulo(c.infra, c.admin, obterComissao(c.infra, c.admin, comissaoId!).tituloId!).situacao).toBe('CANCELADO')
    expect(() => alterarSituacaoVenda(c.infra, c.admin, { vendaId, situacao: 'CONCLUIDA', data: '2026-10-05' })).toThrow()
  })

  it('indicadores de conversão vêm do histórico real de etapas', async () => {
    const c = await ambiente()
    const a = c.negociar()
    registrarVenda(c.infra, c.admin, c.vendaPadrao(a.negocioId))
    alterarSituacaoVenda(c.infra, c.admin, { vendaId: obterNegocio(c.infra, c.admin, a.negocioId).venda!.id, situacao: 'CONCLUIDA', data: '2026-10-05' })
    const b = criarNegocio(c.infra, c.admin, { tipo: 'VENDA', titulo: 'Outro cliente', clienteId: c.maria, imovelId: c.imovelId }).id
    moverEtapa(c.infra, c.admin, { negocioId: b, etapa: 'VISITA' })
    moverEtapa(c.infra, c.admin, { negocioId: b, etapa: 'PERDIDO', motivoPerda: 'Preço' })
    criarNegocio(c.infra, c.admin, { tipo: 'VENDA', titulo: 'Terceiro', clienteId: c.pedro })
    const ind = indicadoresFunil(c.infra, c.admin, { tipo: 'VENDA', de: '2026-10-01', ate: '2026-10-31' })
    expect(ind).toMatchObject({ total: 3, ganhos: 1, perdidos: 1, emAndamento: 1, taxaGanhoBp: 5000, valorGanhoCentavos: 50_000_000 })
    expect(ind.etapas.map((e) => [e.etapa, e.alcancaram])).toEqual([
      ['CAPTACAO', 3],
      ['ATENDIMENTO', 3],
      ['VISITA', 2],
      ['PROPOSTA', 1],
      ['NEGOCIACAO', 1],
      ['CONTRATO', 1],
      ['CONCLUIDO', 1]
    ])
    expect(ind.etapas.find((e) => e.etapa === 'ATENDIMENTO')!.conversaoProximaBp).toBe(6667)
    expect(ind.motivosPerda).toEqual([{ motivo: 'Preço', quantidade: 1 }])
    expect(ind.porOrigem.find((o) => o.origem === 'Portal imobiliário')).toMatchObject({ leads: 1, negocios: 1, ganhos: 1 })
  })
})

describe('comissão de intermediação de locação', () => {
  it('rateia a intermediação recebida no 1º aluguel entre os corretores', async () => {
    const c = await cenario({ taxaIntermediacao: '100' })
    const corretor = criarPessoa(c.infra, c.admin, pessoaFisica({ nome: 'Bruno Vendedor', documento: '186.091.390-34', estadoCivil: '', regimeBens: '', papeis: ['CORRETOR'], creci: '654321-F' })).id
    const negocioId = criarNegocio(c.infra, c.admin, { tipo: 'LOCACAO', titulo: 'Locação Paulista', clienteId: c.carlos, imovelId: c.imovelId, corretorId: corretor }).id
    concluirLocacao(c.infra, c.admin, negocioId, c.contratoId)
    const rateio = [
      { papel: 'IMOBILIARIA' as const, beneficiarioId: null, percentual: '70' },
      { papel: 'VENDEDOR' as const, beneficiarioId: corretor, percentual: '30' }
    ]
    expect(() => registrarComissaoLocacao(c.infra, c.admin, { negocioId, rateio })).toThrow('primeira cobrança')
    gerarCobrancas(c.infra, c.admin, '2026-08')
    c.receberIntegral(c.cobranca('2026-08').id, '2026-09-08')
    const intermediacao = saldoConta(c.infra, '3.1.02')
    expect(intermediacao).toBeGreaterThan(0)
    const { comissaoId } = registrarComissaoLocacao(c.infra, c.admin, { negocioId, rateio })
    const com = obterComissao(c.infra, c.admin, comissaoId)
    expect(com.valorCentavos).toBe(intermediacao)
    expect(com.recebidoCentavos).toBe(intermediacao)
    expect(com.rateio[1]!.liberadoCentavos).toBe(com.rateio[1]!.valorCentavos)
    expect(listarTitulos(c.infra, c.admin, { origem: 'COMISSAO_CORRETOR' }).itens[0]!.pessoaId).toBe(corretor)
    razaoIntegro(c.infra)
  })
})

describe('liberação proporcional (domínio)', () => {
  it('nunca diminui à medida que o recebido cresce e termina exatamente no rateio', () => {
    let semente = 42
    const aleatorio = (n: number) => ((semente = (semente * 1_103_515_245 + 12_345) % 2 ** 31), semente % n)
    for (let caso = 0; caso < 300; caso++) {
      const partes = 2 + aleatorio(4)
      const pesos = Array.from({ length: partes }, () => 1 + aleatorio(5000))
      const soma = pesos.reduce((s, p) => s + p, 0)
      const pct = ratear(10_000, pesos) // percentuais em pontos-base somando 100%
      const valor = 1 + aleatorio(5_000_000)
      const valores = ratear(valor, pct)
      const rateio = pct.map((p, i) => ({ percentualBp: p, valorCentavos: valores[i]! }))
      let anterior = rateio.map(() => 0)
      let recebido = 0
      while (recebido < valor) {
        recebido = Math.min(valor, recebido + 1 + aleatorio(Math.ceil(valor / 3)))
        const alvo = alvoLiberacao(recebido, valor, rateio)
        alvo.forEach((v, k) => expect(v).toBeGreaterThanOrEqual(anterior[k]!))
        expect(alvo.reduce((s, v) => s + v, 0)).toBeLessThanOrEqual(recebido)
        anterior = alvo
      }
      expect(anterior).toEqual(valores)
      expect(soma).toBeGreaterThan(0)
    }
  })
})
