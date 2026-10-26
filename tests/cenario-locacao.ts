import { receber } from '../src/main/modules/financeiro/baixas'
import { listarIndices, salvarContaFinanceira } from '../src/main/modules/financeiro/cadastros'
import { listarTitulos, previaRecebimento } from '../src/main/modules/financeiro/titulos'
import { criarImovel } from '../src/main/modules/imoveis/imoveis'
import { ativarContrato, salvarContrato } from '../src/main/modules/locacoes/contratos'
import { criarPessoa } from '../src/main/modules/pessoas/pessoas'
import { verificarRazao } from '../src/main/modules/financeiro/razao'
import type { ContratoInput } from '../src/shared/schemas-locacao'
import { ambienteConfigurado, imovelBase, pessoaFisica } from './apoio'
import { expect } from 'vitest'

export const limpezas: (() => void)[] = []

/** Cenário padrão: imóvel de Maria (60%) e João (40%), locado a Carlos; condomínio repassado ao condomínio. */
export async function cenario(opcoes: Partial<ContratoInput> = {}, inicio = '2026-08-05') {
  const relogio = { agora: new Date(`${inicio}T12:00:00Z`) }
  const a = await ambienteConfigurado(() => relogio.agora)
  limpezas.push(() => (a.fechar(), a.apagar()))
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

export const razaoIntegro = (infra: Parameters<typeof verificarRazao>[0]) => {
  const v = verificarRazao(infra)
  expect(v.desbalanceados).toEqual([])
  expect(v.somaGeral).toBe(0)
}
