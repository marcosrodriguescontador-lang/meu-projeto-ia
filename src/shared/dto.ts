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
}
