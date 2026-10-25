// Contrato RPC entre interface e processo principal: método → [entrada, saída].
import type * as D from './dto'
import type * as S from './schemas'

type P<T> = T

export interface ContratoApi {
  'sistema.estado': [void, D.EstadoSistema]
  'sistema.configurarInicial': [S.ConfiguracaoInicialInput, void]
  'sistema.escolherBackup': [void, string | null]
  'sistema.inspecionarBackup': [{ arquivo: string; senha: string }, D.ResumoBackup]
  'sistema.restaurarInicial': [{ arquivo: string; senha: string }, void]

  'auth.entrar': [S.LoginInput, D.SessaoDto]
  'auth.sair': [void, void]
  'auth.sessao': [void, D.SessaoDto | null]
  'auth.atividade': [void, void]
  'auth.bloquear': [void, void]
  'auth.desbloquear': [{ senha: string }, D.SessaoDto]
  'auth.trocarSenha': [S.TrocarSenhaInput, void]

  'usuarios.listar': [void, D.UsuarioDto[]]
  'usuarios.criar': [S.CriarUsuarioInput, D.UsuarioDto]
  'usuarios.atualizar': [{ id: number; dados: S.UsuarioInput }, D.UsuarioDto]
  'usuarios.redefinirSenha': [{ id: number; senhaTemporaria: string }, void]
  'usuarios.desbloquear': [{ id: number }, void]

  'perfis.listar': [void, D.PerfilDto[]]
  'perfis.criar': [S.PerfilInput, D.PerfilDto]
  'perfis.atualizar': [{ id: number; dados: S.PerfilInput }, D.PerfilDto]
  'perfis.excluir': [{ id: number }, void]

  'pessoas.listar': [S.ListarPessoasInput, D.PaginaResultado<D.PessoaResumo>]
  'pessoas.obter': [{ id: number }, D.PessoaDetalhe]
  'pessoas.criar': [S.PessoaInput, { id: number }]
  'pessoas.atualizar': [{ id: number; dados: S.PessoaInput }, void]
  'pessoas.excluir': [{ id: number; motivo: string }, void]
  'pessoas.verificarDocumento': [{ documento: string; ignorarId?: number }, { id: number; nome: string } | null]
  'pessoas.historico': [{ id: number }, D.RegistroAuditoria[]]

  'bancarios.adicionar': [{ pessoaId: number; dados: S.DadoBancarioInput }, { id: number }]
  'bancarios.atualizar': [{ id: number; dados: S.DadoBancarioInput }, void]
  'bancarios.remover': [{ id: number }, void]
  'bancarios.revelar': [{ id: number }, D.DadoBancarioRevelado]

  'anexos.listar': [{ entidade: 'pessoa'; entidadeId: number }, D.AnexoDto[]]
  'anexos.adicionar': [{ entidade: 'pessoa'; entidadeId: number; categoria: string }, D.AnexoDto[]]
  'anexos.abrir': [{ id: number }, void]
  'anexos.salvarComo': [{ id: number }, boolean]
  'anexos.remover': [{ id: number; motivo: string }, void]

  'auditoria.listar': [
    { entidade?: string; usuario?: string; de?: string; ate?: string; busca?: string; pagina?: number; porPagina?: number },
    D.PaginaResultado<D.RegistroAuditoria>
  ]
  'auditoria.verificar': [void, { integra: boolean; total: number; primeiroInvalido: number | null }]

  'backup.listar': [void, D.BackupRegistroDto[]]
  'backup.executar': [{ destino?: string | null }, D.BackupRegistroDto]
  'backup.escolherDestino': [void, string | null]
  'backup.escolherArquivo': [void, string | null]
  'backup.inspecionar': [{ arquivo: string; senha: string }, D.ResumoBackup]
  'backup.restaurar': [{ arquivo: string; senha: string; confirmacao: string }, void]
  'backup.alterarSenha': [{ senhaAtual: string; novaSenha: string }, void]

  'config.obter': [void, D.ConfiguracoesDto]
  'config.salvarEmpresa': [S.EmpresaInput, void]
  'config.salvarSeguranca': [S.SegurancaConfig, void]
  'config.salvarBackup': [S.BackupConfig, void]

  'painel.indicadores': [void, D.IndicadoresPainel]
}

export type MetodoApi = keyof ContratoApi
export type EntradaApi<M extends MetodoApi> = P<ContratoApi[M][0]>
export type SaidaApi<M extends MetodoApi> = P<ContratoApi[M][1]>

export type RespostaRpc<T> = { ok: true; dados: T } | { ok: false; erro: import('./erros').ErroSerializado }
