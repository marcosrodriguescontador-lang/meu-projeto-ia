// Objetos de transferência entre processo principal e interface.
import type { Permissao } from './permissoes'
import type { BackupConfig, Papel, PessoaDados, SegurancaConfig } from './schemas'

export interface PaginaResultado<T> {
  itens: T[]
  total: number
  pagina: number
  porPagina: number
}

export interface EstadoSistema {
  configurado: boolean
  versaoApp: string
  versaoSchema: string
  empresa: EmpresaConfig | null
  erroInicializacao?: string
}

export interface EmpresaConfig {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string | null
  creci: string
  endereco?: string | null
  telefone?: string | null
  email?: string | null
}

export interface SessaoDto {
  usuario: { id: number; nome: string; login: string; perfil: string }
  permissoes: Permissao[]
  deveTrocarSenha: boolean
  bloqueada: boolean
  inatividadeMinutos: number
}

export interface UsuarioDto {
  id: number
  nome: string
  login: string
  email: string | null
  perfilId: number
  perfilNome: string
  pessoaId: number | null
  /** Pessoa do cadastro vinculada (ex.: o corretor), usada para restringir à própria carteira. */
  pessoaNome: string | null
  ativo: boolean
  bloqueadoAte: string | null
  deveTrocarSenha: boolean
  ultimoAcessoEm: string | null
}

export interface PerfilDto {
  id: number
  nome: string
  descricao: string | null
  sistema: boolean
  permissoes: Permissao[]
  usuarios: number
}

export interface PessoaResumo {
  id: number
  codigo: number
  tipo: 'PF' | 'PJ'
  nome: string
  nomeFantasia: string | null
  documento: string
  situacao: string
  papeis: Papel[]
  contatoPrincipal: string | null
  cidadeUf: string | null
}

export interface DadoBancarioDto {
  id: number
  bancoCodigo: string
  bancoNome: string
  tipoConta: string
  contaMascara: string
  pixTipo: string | null
  titularNome: string
  titularDocumento: string
  principal: boolean
}

export interface DadoBancarioRevelado extends DadoBancarioDto {
  agencia: string
  conta: string
  digito: string
  pixChave: string | null
}

export interface PessoaDetalhe extends Omit<PessoaDados, 'relacoes'> {
  id: number
  codigo: number
  criadoEm: string
  atualizadoEm: string
  relacoes: { pessoaId: number; tipo: string; nome: string; documento: string }[]
  dadosBancarios: DadoBancarioDto[] | null
}

export interface AnexoDto {
  id: number
  categoria: string
  nomeOriginal: string
  mime: string
  tamanho: number
  criadoEm: string
  criadoPor: number | null
}

export interface RegistroAuditoria {
  id: number
  ts: string
  usuarioId: number | null
  usuarioLogin: string | null
  acao: string
  entidade: string
  entidadeId: string | null
  descricao: string | null
  antes: string | null
  depois: string | null
  estacao: string | null
  hashAnterior: string
  hash: string
}

export interface BackupRegistroDto {
  id: number
  ts: string
  tipo: 'MANUAL' | 'AUTOMATICO' | 'PRE_RESTAURACAO'
  arquivo: string
  tamanho: number | null
  sha256: string | null
  versaoApp: string
  versaoSchema: string
  validado: boolean
  resultado: string
  mensagem: string | null
}

export interface ResumoBackup {
  criadoEm: string
  versaoApp: string
  versaoSchema: string
  empresa: string | null
  contagens: Record<string, number>
  arquivos: number
  tamanhoTotal: number
}

export interface ConfiguracoesDto {
  empresa: EmpresaConfig | null
  seguranca: SegurancaConfig
  backup: BackupConfig
  caminhoDados: string
}

export interface IndicadoresPainel {
  pessoasPorPapel: Record<string, number>
  totalPessoas: number
  usuariosAtivos: number
  ultimoBackup: { ts: string; resultado: string } | null
  backupAtrasado: boolean
  imoveis: IndicadoresImoveis | null
  financeiro: import('./dto-financeiro').IndicadoresFinanceiros | null
  crm: IndicadoresCrm | null
}

export interface IndicadoresCrm {
  negociosVenda: number
  negociosLocacao: number
  leadsNovosMes: number
  tarefasHoje: number
  tarefasAtrasadas: number
  visitasProximos7Dias: number
}

// ───────────── Imóveis ─────────────

export interface OfertaDto {
  id: number
  modalidade: 'VENDA' | 'LOCACAO'
  valorCentavos: number
  comissaoBp: number
  situacao: string
  situacaoDesde: string
}

export interface ImovelResumo {
  id: number
  codigo: number
  tipo: string
  finalidade: string
  endereco: string
  bairro: string
  cidade: string
  uf: string
  dormitorios: number
  suites: number
  vagas: number
  areaConstruida: number | null
  areaTerreno: number | null
  venda: OfertaDto | null
  locacao: OfertaDto | null
  corretor: string | null
  capa: string | null
}

export interface ProprietarioImovelDto {
  pessoaId: number
  nome: string
  documento: string
  percentualBp: number
  principal: boolean
}

export interface ImovelDetalhe {
  id: number
  codigo: number
  tipo: string
  finalidade: string
  cep: string
  logradouro: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  uf: string
  areaConstruida: number | null
  areaTerreno: number | null
  dormitorios: number
  suites: number
  banheiros: number
  vagas: number
  descricaoComercial: string | null
  condominioCentavos: number | null
  iptuAnualCentavos: number | null
  corretor: { id: number; nome: string } | null
  caracteristicas: number[]
  ofertas: OfertaDto[]
  criadoEm: string
  atualizadoEm: string
  /** Presente apenas com a permissão imoveis.dados_internos.ver. */
  internos: {
    matricula: string | null
    cartorio: string | null
    inscricaoMunicipal: string | null
    observacoesInternas: string | null
    proprietarios: ProprietarioImovelDto[]
  } | null
}

export interface CaracteristicaDto {
  id: number
  nome: string
  grupo: string
}

export interface HistoricoSituacaoDto {
  id: number
  modalidade: 'VENDA' | 'LOCACAO'
  de: string | null
  para: string
  motivo: string | null
  usuario: string | null
  ts: string
}

export interface FotoDto {
  id: number
  ordem: number
  capa: boolean
  legenda: string | null
  nome: string
  miniatura: string
}

export interface ImovelDoProprietario {
  id: number
  codigo: number
  tipo: string
  endereco: string
  percentualBp: number
  venda: string | null
  locacao: string | null
}

export interface IndicadoresImoveis {
  total: number
  disponiveisVenda: number
  disponiveisLocacao: number
  alugados: number
  emNegociacao: number
  vendidos: number
}
