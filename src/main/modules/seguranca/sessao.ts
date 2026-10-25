// Sessão do usuário mantida no processo principal (a interface nunca guarda credenciais).
import { erro } from '@shared/erros'
import type { SessaoDto } from '@shared/dto'
import type { UsuarioSessao } from '../../nucleo/contexto'

export class GerenciadorSessao {
  private usuario: UsuarioSessao | null = null
  private ultimaAtividade = 0
  private bloqueada = false
  private deveTrocarSenha = false

  constructor(
    private readonly inatividadeMs: () => number,
    private readonly relogio: () => number = Date.now
  ) {}

  iniciar(u: UsuarioSessao, deveTrocarSenha: boolean): void {
    this.usuario = u
    this.bloqueada = false
    this.deveTrocarSenha = deveTrocarSenha
    this.ultimaAtividade = this.relogio()
  }

  encerrar(): void {
    this.usuario = null
    this.bloqueada = false
  }

  bloquear(): void {
    if (this.usuario) this.bloqueada = true
  }

  desbloquear(): void {
    this.bloqueada = false
    this.ultimaAtividade = this.relogio()
  }

  senhaTrocada(): void {
    this.deveTrocarSenha = false
  }

  atualizarPermissoes(u: UsuarioSessao): void {
    if (this.usuario?.id === u.id) this.usuario = u
  }

  /** Verifica inatividade; aplica bloqueio se o tempo limite foi excedido. */
  private conferirInatividade(): void {
    if (this.usuario && !this.bloqueada && this.relogio() - this.ultimaAtividade > this.inatividadeMs()) this.bloqueada = true
  }

  registrarAtividade(): void {
    this.conferirInatividade()
    if (!this.bloqueada) this.ultimaAtividade = this.relogio()
  }

  /** Usuário apto a operar. Lança erro se não autenticado, bloqueado ou com troca de senha pendente. */
  exigirAtivo(permitirTrocaPendente = false): UsuarioSessao {
    if (!this.usuario) throw erro.naoAutenticado()
    this.conferirInatividade()
    if (this.bloqueada) throw erro.bloqueada()
    if (this.deveTrocarSenha && !permitirTrocaPendente) throw erro.regra('É necessário trocar a senha antes de continuar.')
    this.ultimaAtividade = this.relogio()
    return this.usuario
  }

  atual(): UsuarioSessao | null {
    return this.usuario
  }

  dto(inatividadeMinutos: number): SessaoDto | null {
    if (!this.usuario) return null
    this.conferirInatividade()
    return {
      usuario: { id: this.usuario.id, nome: this.usuario.nome, login: this.usuario.login, perfil: this.usuario.perfilNome },
      permissoes: [...this.usuario.permissoes],
      deveTrocarSenha: this.deveTrocarSenha,
      bloqueada: this.bloqueada,
      inatividadeMinutos
    }
  }
}
