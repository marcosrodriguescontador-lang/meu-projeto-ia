import { eq, sql } from 'drizzle-orm'
import { erro } from '@shared/erros'
import type { SessaoDto } from '@shared/dto'
import { configuracaoInicialSchema, loginSchema, trocarSenhaSchema, type ConfiguracaoInicialInput, type LoginInput, type TrocarSenhaInput } from '@shared/schemas'
import { perfil, usuario } from '../../infra/db/schema'
import { agoraIso, SISTEMA, type Infra } from '../../nucleo/contexto'
import { gravarConfig, lerConfig, PADROES } from '../configuracoes/configuracoes'
import { auditar } from './auditoria'
import { PERFIL_ADMIN, sincronizarPerfisSistema } from './perfis'
import { conferirSenha, gerarHashSenha, hashParaComparacaoCega } from './senhas'
import type { GerenciadorSessao } from './sessao'
import { carregarUsuarioSessao } from './usuarios'

const CREDENCIAIS_INVALIDAS = 'Usuário ou senha inválidos.'

export function estaConfigurado(infra: Infra): boolean {
  return infra.db.select({ n: sql<number>`count(*)` }).from(usuario).get()!.n > 0
}

export async function configurarInicial(infra: Infra, entrada: ConfiguracaoInicialInput): Promise<void> {
  if (estaConfigurado(infra)) throw erro.regra('O sistema já foi configurado.')
  const dados = configuracaoInicialSchema.parse(entrada)
  const senhaHash = await gerarHashSenha(dados.admin.senha)
  await infra.cofre.definirSenhaBackup(dados.backup.senha)
  sincronizarPerfisSistema(infra)
  infra.bruto.transaction(() => {
    if (estaConfigurado(infra)) throw erro.regra('O sistema já foi configurado.')
    const admin = infra.db.select({ id: perfil.id }).from(perfil).where(eq(perfil.nome, PERFIL_ADMIN)).get()!
    gravarConfig(infra, SISTEMA, 'empresa', { ...dados.empresa })
    gravarConfig(infra, SISTEMA, 'seguranca', PADROES.seguranca)
    gravarConfig(infra, SISTEMA, 'backup', PADROES.backup)
    const { id } = infra.db
      .insert(usuario)
      .values({ nome: dados.admin.nome, login: dados.admin.login, senhaHash, perfilId: admin.id, senhaAlteradaEm: agoraIso(infra) })
      .returning({ id: usuario.id })
      .get()
    auditar(infra, SISTEMA, { acao: 'SISTEMA_CONFIGURADO', entidade: 'sistema', descricao: `Configuração inicial; administrador "${dados.admin.login}" criado`, depois: { empresa: dados.empresa, adminId: id } })
  })()
}

export class Autenticacao {
  private falhasDesbloqueio = 0

  constructor(
    private readonly infra: Infra,
    readonly sessao: GerenciadorSessao
  ) {}

  private inatividade(): number {
    return lerConfig(this.infra, 'seguranca')!.inatividadeMinutos
  }

  dto(): SessaoDto | null {
    return this.sessao.dto(this.inatividade())
  }

  async entrar(entrada: LoginInput): Promise<SessaoDto> {
    const { login, senha } = loginSchema.parse(entrada)
    const cfg = lerConfig(this.infra, 'seguranca')!
    const u = this.infra.db.select().from(usuario).where(eq(usuario.login, login)).get()
    const agora = this.infra.agora()

    if (!u) {
      await conferirSenha(await hashParaComparacaoCega(), senha)
      this.infra.bruto.transaction(() => auditar(this.infra, SISTEMA, { acao: 'LOGIN_FALHA', entidade: 'usuario', descricao: `Login inexistente: ${login.slice(0, 60)}` }))()
      throw erro.validacao(CREDENCIAIS_INVALIDAS)
    }
    if (u.bloqueadoAte && new Date(u.bloqueadoAte) > agora) {
      const hora = new Date(u.bloqueadoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      throw erro.regra(`Usuário bloqueado por excesso de tentativas até ${hora}. Procure um administrador.`)
    }

    const correta = await conferirSenha(u.senhaHash, senha)
    if (!correta) {
      const tentativas = u.tentativasFalhas + 1
      const bloquear = tentativas >= cfg.tentativasBloqueio
      this.infra.bruto.transaction(() => {
        this.infra.db
          .update(usuario)
          .set({ tentativasFalhas: bloquear ? 0 : tentativas, bloqueadoAte: bloquear ? new Date(agora.getTime() + cfg.minutosBloqueio * 60_000).toISOString() : null })
          .where(eq(usuario.id, u.id))
          .run()
        auditar(this.infra, SISTEMA, { acao: bloquear ? 'USUARIO_BLOQUEADO' : 'LOGIN_FALHA', entidade: 'usuario', entidadeId: u.id, descricao: `Tentativa ${tentativas} de ${cfg.tentativasBloqueio}` })
      })()
      if (bloquear) throw erro.regra(`Usuário bloqueado por ${cfg.minutosBloqueio} minutos após ${cfg.tentativasBloqueio} tentativas inválidas.`)
      throw erro.validacao(CREDENCIAIS_INVALIDAS)
    }
    if (!u.ativo) throw erro.regra('Usuário inativo. Procure um administrador.')

    this.infra.bruto.transaction(() => {
      this.infra.db.update(usuario).set({ tentativasFalhas: 0, bloqueadoAte: null, ultimoAcessoEm: agora.toISOString() }).where(eq(usuario.id, u.id)).run()
      auditar(this.infra, { id: u.id, login: u.login }, { acao: 'LOGIN', entidade: 'usuario', entidadeId: u.id })
    })()
    this.falhasDesbloqueio = 0
    this.sessao.iniciar(carregarUsuarioSessao(this.infra, u.id), u.deveTrocarSenha)
    return this.dto()!
  }

  sair(): void {
    const u = this.sessao.atual()
    if (u) this.infra.bruto.transaction(() => auditar(this.infra, u, { acao: 'LOGOUT', entidade: 'usuario', entidadeId: u.id }))()
    this.sessao.encerrar()
  }

  async desbloquear(senha: string): Promise<SessaoDto> {
    const atual = this.sessao.atual()
    if (!atual) throw erro.naoAutenticado()
    const u = this.infra.db.select().from(usuario).where(eq(usuario.id, atual.id)).get()
    if (!u || !u.ativo) {
      this.sessao.encerrar()
      throw erro.naoAutenticado()
    }
    if (!(await conferirSenha(u.senhaHash, senha))) {
      this.falhasDesbloqueio++
      if (this.falhasDesbloqueio >= lerConfig(this.infra, 'seguranca')!.tentativasBloqueio) {
        this.infra.bruto.transaction(() => auditar(this.infra, atual, { acao: 'SESSAO_ENCERRADA', entidade: 'usuario', entidadeId: u.id, descricao: 'Excesso de tentativas ao desbloquear' }))()
        this.sessao.encerrar()
        throw erro.naoAutenticado()
      }
      throw erro.validacao('Senha incorreta.')
    }
    this.falhasDesbloqueio = 0
    this.sessao.iniciar(carregarUsuarioSessao(this.infra, u.id), u.deveTrocarSenha)
    return this.dto()!
  }

  async trocarSenha(entrada: TrocarSenhaInput): Promise<void> {
    const atual = this.sessao.exigirAtivo(true)
    const dados = trocarSenhaSchema.parse(entrada)
    const u = this.infra.db.select().from(usuario).where(eq(usuario.id, atual.id)).get()!
    if (!(await conferirSenha(u.senhaHash, dados.senhaAtual))) throw erro.validacao('Senha atual incorreta.', { senhaAtual: 'Senha atual incorreta' })
    const senhaHash = await gerarHashSenha(dados.novaSenha)
    this.infra.bruto.transaction(() => {
      this.infra.db.update(usuario).set({ senhaHash, deveTrocarSenha: false, senhaAlteradaEm: agoraIso(this.infra) }).where(eq(usuario.id, u.id)).run()
      auditar(this.infra, atual, { acao: 'SENHA_ALTERADA', entidade: 'usuario', entidadeId: u.id })
    })()
    this.sessao.senhaTrocada()
  }
}
