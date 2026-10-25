import { afterEach, describe, expect, it } from 'vitest'
import { verificarIntegridadeAuditoria, listarAuditoria } from '../src/main/modules/seguranca/auditoria'
import { Autenticacao, configurarInicial } from '../src/main/modules/seguranca/autenticacao'
import { listarPerfis, criarPerfil, atualizarPerfil } from '../src/main/modules/seguranca/perfis'
import { GerenciadorSessao } from '../src/main/modules/seguranca/sessao'
import { atualizarUsuario, criarUsuario, carregarUsuarioSessao } from '../src/main/modules/seguranca/usuarios'
import { listarPessoas } from '../src/main/modules/pessoas/pessoas'
import { ambienteConfigurado, SENHA_ADMIN } from './apoio'

let limpar: (() => void)[] = []
afterEach(() => {
  limpar.forEach((f) => f())
  limpar = []
})
async function amb(agora?: () => Date) {
  const a = await ambienteConfigurado(agora)
  limpar.push(() => {
    a.fechar()
    a.apagar()
  })
  return a
}

describe('configuração inicial e login', () => {
  it('não permite configurar duas vezes', async () => {
    const { infra } = await amb()
    await expect(
      configurarInicial(infra, {
        empresa: { razaoSocial: 'X', nomeFantasia: 'X', cnpj: '', creci: '1' },
        admin: { nome: 'Outro', login: 'outro', senha: 'SenhaForte123', confirmacao: 'SenhaForte123' },
        backup: { senha: 'BackupForte123', confirmacao: 'BackupForte123' }
      })
    ).rejects.toThrow('já foi configurado')
  })

  it('armazena a senha com Argon2id e nunca em texto puro', async () => {
    const { infra } = await amb()
    const r = infra.bruto.prepare("SELECT senha_hash FROM usuario WHERE login='admin'").get() as { senha_hash: string }
    expect(r.senha_hash.startsWith('$argon2id$')).toBe(true)
    expect(r.senha_hash).not.toContain(SENHA_ADMIN)
  })

  it('bloqueia o usuário após tentativas inválidas e não revela se o login existe', async () => {
    const { infra } = await amb()
    const auth = new Autenticacao(infra, new GerenciadorSessao(() => 600_000))
    await expect(auth.entrar({ login: 'naoexiste', senha: 'x' })).rejects.toThrow('Usuário ou senha inválidos')
    for (let i = 0; i < 4; i++) await expect(auth.entrar({ login: 'admin', senha: 'errada' })).rejects.toThrow('Usuário ou senha inválidos')
    await expect(auth.entrar({ login: 'admin', senha: 'errada' })).rejects.toThrow('bloqueado')
    await expect(auth.entrar({ login: 'admin', senha: SENHA_ADMIN })).rejects.toThrow('bloqueado')
  })

  it('exige troca de senha no primeiro acesso de usuário criado por administrador', async () => {
    const { infra, admin } = await amb()
    const perfil = listarPerfis(infra, admin).find((p) => p.nome === 'Corretor')!
    await criarUsuario(infra, admin, { nome: 'João Corretor', login: 'joao', email: '', perfilId: perfil.id, pessoaId: null, ativo: true, senhaInicial: 'Temporaria123' })
    const auth = new Autenticacao(infra, new GerenciadorSessao(() => 600_000))
    const s = await auth.entrar({ login: 'joao', senha: 'Temporaria123' })
    expect(s.deveTrocarSenha).toBe(true)
    expect(() => auth.sessao.exigirAtivo()).toThrow('trocar a senha')
    await auth.trocarSenha({ senhaAtual: 'Temporaria123', novaSenha: 'NovaSenha2026', confirmacao: 'NovaSenha2026' })
    expect(auth.sessao.exigirAtivo().login).toBe('joao')
  })
})

describe('sessão e inatividade', () => {
  it('bloqueia a sessão após o tempo de inatividade e exige senha para desbloquear', async () => {
    const { infra } = await amb()
    let agora = 0
    const auth = new Autenticacao(infra, new GerenciadorSessao(() => 60_000, () => agora))
    await auth.entrar({ login: 'admin', senha: SENHA_ADMIN })
    agora = 30_000
    expect(auth.sessao.exigirAtivo().login).toBe('admin')
    agora = 100_000
    expect(() => auth.sessao.exigirAtivo()).toThrow('inatividade')
    await expect(auth.desbloquear('errada')).rejects.toThrow('Senha incorreta')
    await auth.desbloquear(SENHA_ADMIN)
    expect(auth.sessao.exigirAtivo().login).toBe('admin')
  })
})

describe('controle de acesso', () => {
  it('perfil Consulta não pode criar pessoas nem ver usuários', async () => {
    const { infra, admin } = await amb()
    const consulta = listarPerfis(infra, admin).find((p) => p.nome === 'Consulta')!
    const u = await criarUsuario(infra, admin, { nome: 'Leitor', login: 'leitor', email: '', perfilId: consulta.id, pessoaId: null, ativo: true, senhaInicial: 'Leitor123456' })
    const sessao = carregarUsuarioSessao(infra, u.id)
    expect(listarPessoas(infra, sessao, {}).total).toBe(0)
    const { criarPessoa } = await import('../src/main/modules/pessoas/pessoas')
    const { pessoaFisica } = await import('./apoio')
    expect(() => criarPessoa(infra, sessao, pessoaFisica())).toThrow('permissão')
    const { listarUsuarios } = await import('../src/main/modules/seguranca/usuarios')
    expect(() => listarUsuarios(infra, sessao)).toThrow('permissão')
  })

  it('protege o perfil Administrador e o último administrador ativo', async () => {
    const { infra, admin } = await amb()
    const adm = listarPerfis(infra, admin).find((p) => p.nome === 'Administrador')!
    expect(() => atualizarPerfil(infra, admin, adm.id, { nome: 'Administrador', descricao: '', permissoes: [] })).toThrow('protegido')
    const outro = criarPerfil(infra, admin, { nome: 'Auxiliar', descricao: '', permissoes: ['pessoas.ver'] })
    expect(() => atualizarUsuario(infra, admin, admin.id, { nome: 'Administrador', login: 'admin', email: '', perfilId: outro.id, pessoaId: null, ativo: true })).toThrow('ao menos um administrador')
    expect(() => atualizarUsuario(infra, admin, admin.id, { nome: 'Administrador', login: 'admin', email: '', perfilId: adm.id, pessoaId: null, ativo: false })).toThrow('próprio usuário')
  })

  it('rejeita permissões desconhecidas', async () => {
    const { infra, admin } = await amb()
    expect(() => criarPerfil(infra, admin, { nome: 'Hack', descricao: '', permissoes: ['tudo.liberado'] })).toThrow('desconhecidas')
  })
})

describe('auditoria', () => {
  it('registra operações, nunca grava senha e detecta adulteração', async () => {
    const { infra, admin } = await amb()
    const perfil = listarPerfis(infra, admin).find((p) => p.nome === 'Corretor')!
    await criarUsuario(infra, admin, { nome: 'Ana', login: 'ana', email: '', perfilId: perfil.id, pessoaId: null, ativo: true, senhaInicial: 'SenhaDaAna123' })
    const todos = infra.bruto.prepare('SELECT * FROM auditoria').all() as Record<string, string>[]
    expect(todos.map((r) => r.acao)).toEqual(expect.arrayContaining(['SISTEMA_CONFIGURADO', 'LOGIN', 'USUARIO_CRIADO']))
    expect(JSON.stringify(todos)).not.toContain('SenhaDaAna123')
    expect(JSON.stringify(todos)).not.toContain(SENHA_ADMIN)
    expect(verificarIntegridadeAuditoria(infra).integra).toBe(true)

    expect(() => infra.bruto.prepare("UPDATE auditoria SET descricao='x'").run()).toThrow('não podem ser alterados')
    expect(() => infra.bruto.prepare('DELETE FROM auditoria').run()).toThrow('não podem ser excluídos')

    // Adulteração direta (contornando o trigger) é detectada pela cadeia de hash.
    infra.bruto.exec('DROP TRIGGER trg_auditoria_sem_update')
    infra.bruto.prepare("UPDATE auditoria SET descricao='adulterado' WHERE acao='USUARIO_CRIADO'").run()
    const v = verificarIntegridadeAuditoria(infra)
    expect(v.integra).toBe(false)
    expect(v.primeiroInvalido).not.toBeNull()
    expect(listarAuditoria(infra, { pagina: 1, porPagina: 10 }).total).toBeGreaterThan(2)
  })
})
