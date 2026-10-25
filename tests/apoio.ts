import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { protetorInseguroParaTestes } from '../src/main/infra/keystore'
import type { Infra } from '../src/main/nucleo/contexto'
import { definirCaminhos, encerrar, inicializar } from '../src/main/nucleo/inicializacao'
import { Autenticacao, configurarInicial } from '../src/main/modules/seguranca/autenticacao'
import { GerenciadorSessao } from '../src/main/modules/seguranca/sessao'
import type { PessoaInput } from '../src/shared/schemas'

export const SENHA_ADMIN = 'Administrador2026'
export const SENHA_BACKUP = 'CofreBackup2026'

export async function novoAmbiente(dir = mkdtempSync(join(tmpdir(), 'status-erp-')), agora?: () => Date) {
  const caminhos = definirCaminhos(dir)
  const infra = await inicializar({ caminhos, protetor: protetorInseguroParaTestes, versaoApp: '0.1.0-teste', agora })
  return { dir, caminhos, infra, fechar: () => encerrar(infra), apagar: () => rmSync(dir, { recursive: true, force: true }) }
}

export async function ambienteConfigurado(agora?: () => Date) {
  const amb = await novoAmbiente(undefined, agora)
  await configurarInicial(amb.infra, {
    empresa: { razaoSocial: 'Status Negócios Imobiliários Ltda', nomeFantasia: 'Status Negócios Imobiliários', cnpj: '', creci: '038595-J' },
    admin: { nome: 'Administrador', login: 'admin', senha: SENHA_ADMIN, confirmacao: SENHA_ADMIN },
    backup: { senha: SENHA_BACKUP, confirmacao: SENHA_BACKUP }
  })
  const auth = new Autenticacao(amb.infra, new GerenciadorSessao(() => 10 * 60_000))
  await auth.entrar({ login: 'admin', senha: SENHA_ADMIN })
  const admin = auth.sessao.atual()!
  return { ...amb, auth, admin }
}

export function pessoaFisica(extra: Partial<PessoaInput> = {}): PessoaInput {
  return {
    tipo: 'PF',
    nome: 'Maria da Silva Souza',
    nomeFantasia: '',
    documento: '529.982.247-25',
    rgIe: '12.345.678-9',
    orgaoEmissor: 'SSP/SP',
    nascimento: '1980-05-10',
    nacionalidade: 'Brasileira',
    estadoCivil: 'CASADO',
    regimeBens: 'COMUNHAO_PARCIAL',
    profissao: 'Engenheira',
    creci: '',
    situacao: 'ATIVO',
    observacoes: '',
    papeis: ['PROPRIETARIO'],
    enderecos: [{ tipo: 'RESIDENCIAL', cep: '01310-100', logradouro: 'Av. Paulista', numero: '1000', complemento: 'ap 12', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP', principal: true }],
    contatos: [{ tipo: 'CELULAR', valor: '(11) 98888-7777', nomeContato: '', principal: true }],
    relacoes: [],
    ...extra
  }
}

export const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

export function imovelBase(proprietarios: { pessoaId: number; percentual: string; principal: boolean }[], extra: Partial<import('../src/shared/schemas').ImovelInput> = {}): import('../src/shared/schemas').ImovelInput {
  return {
    tipo: 'APARTAMENTO',
    finalidade: 'RESIDENCIAL',
    cep: '01310-100',
    logradouro: 'Avenida Paulista',
    numero: '1000',
    complemento: 'ap 121',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    uf: 'SP',
    matricula: '12345',
    cartorio: '4º CRI de São Paulo',
    inscricaoMunicipal: '009.123.0045-1',
    areaConstruida: '85,50',
    areaTerreno: '',
    dormitorios: '3',
    suites: '1',
    banheiros: '2',
    vagas: '2',
    descricaoComercial: 'Apartamento amplo, próximo ao metrô.',
    observacoesInternas: 'Chaves na portaria.',
    condominio: '1.200,00',
    iptuAnual: '3.600,00',
    corretorId: null,
    caracteristicas: [],
    proprietarios,
    venda: { ativa: true, valor: '850.000,00', comissao: '6' },
    locacao: { ativa: true, valor: '4.500,00', comissao: '10' },
    ...extra
  }
}
