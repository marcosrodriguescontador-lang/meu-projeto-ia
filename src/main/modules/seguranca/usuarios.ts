import { and, eq, ne, sql } from 'drizzle-orm'
import type { UsuarioDto } from '@shared/dto'
import { erro } from '@shared/erros'
import { criarUsuarioSchema, senhaSchema, usuarioSchema, type CriarUsuarioInput, type UsuarioInput } from '@shared/schemas'
import { perfil, pessoa, usuario } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra, type UsuarioSessao } from '../../nucleo/contexto'
import { auditar } from './auditoria'
import { PERFIL_ADMIN, permissoesDoPerfil } from './perfis'
import { gerarHashSenha } from './senhas'

const colunas = {
  id: usuario.id,
  nome: usuario.nome,
  login: usuario.login,
  email: usuario.email,
  perfilId: usuario.perfilId,
  perfilNome: perfil.nome,
  pessoaId: usuario.pessoaId,
  ativo: usuario.ativo,
  bloqueadoAte: usuario.bloqueadoAte,
  deveTrocarSenha: usuario.deveTrocarSenha,
  ultimoAcessoEm: usuario.ultimoAcessoEm
}

function consultar(infra: Infra) {
  return infra.db.select(colunas).from(usuario).innerJoin(perfil, eq(perfil.id, usuario.perfilId))
}

export function obterUsuarioDto(infra: Infra, id: number): UsuarioDto {
  const u = consultar(infra).where(eq(usuario.id, id)).get()
  if (!u) throw erro.naoEncontrado('Usuário')
  return u
}

export function carregarUsuarioSessao(infra: Infra, id: number): UsuarioSessao {
  const u = obterUsuarioDto(infra, id)
  return { id: u.id, login: u.login, nome: u.nome, perfilId: u.perfilId, perfilNome: u.perfilNome, permissoes: new Set(permissoesDoPerfil(infra, u.perfilId)) }
}

export function listarUsuarios(infra: Infra, ator: Ator): UsuarioDto[] {
  exigir(ator, 'usuarios.ver')
  return consultar(infra).orderBy(usuario.nome).all()
}

function administradoresAtivos(infra: Infra, exceto?: number): number {
  const cond = [eq(usuario.ativo, true), eq(perfil.nome, PERFIL_ADMIN)]
  if (exceto) cond.push(ne(usuario.id, exceto))
  return infra.db
    .select({ n: sql<number>`count(*)` })
    .from(usuario)
    .innerJoin(perfil, eq(perfil.id, usuario.perfilId))
    .where(and(...cond))
    .get()!.n
}

function validarReferencias(infra: Infra, dados: { login: string; perfilId: number; pessoaId: number | null }, ignorarId?: number) {
  const dup = infra.db
    .select({ id: usuario.id })
    .from(usuario)
    .where(ignorarId ? and(eq(usuario.login, dados.login), ne(usuario.id, ignorarId)) : eq(usuario.login, dados.login))
    .get()
  if (dup) throw erro.conflito('Login já utilizado.', { login: 'Login já utilizado' })
  if (!infra.db.select({ id: perfil.id }).from(perfil).where(eq(perfil.id, dados.perfilId)).get()) throw erro.validacao('Perfil inválido.', { perfilId: 'Perfil inválido' })
  if (dados.pessoaId && !infra.db.select({ id: pessoa.id }).from(pessoa).where(eq(pessoa.id, dados.pessoaId)).get())
    throw erro.validacao('Pessoa vinculada não encontrada.', { pessoaId: 'Pessoa não encontrada' })
}

export async function criarUsuario(infra: Infra, ator: Ator, entrada: CriarUsuarioInput): Promise<UsuarioDto> {
  exigir(ator, 'usuarios.gerenciar')
  const dados = criarUsuarioSchema.parse(entrada)
  validarReferencias(infra, dados)
  const senhaHash = await gerarHashSenha(dados.senhaInicial)
  const id = infra.bruto.transaction(() => {
    const { id } = infra.db
      .insert(usuario)
      .values({ nome: dados.nome, login: dados.login, email: dados.email, perfilId: dados.perfilId, pessoaId: dados.pessoaId, ativo: dados.ativo, senhaHash, deveTrocarSenha: true, criadoPor: ator.id })
      .returning({ id: usuario.id })
      .get()
    auditar(infra, ator, { acao: 'USUARIO_CRIADO', entidade: 'usuario', entidadeId: id, depois: dados })
    return id
  })()
  return obterUsuarioDto(infra, id)
}

export function atualizarUsuario(infra: Infra, ator: Ator, id: number, entrada: UsuarioInput): UsuarioDto {
  exigir(ator, 'usuarios.gerenciar')
  const dados = usuarioSchema.parse(entrada)
  const antes = obterUsuarioDto(infra, id)
  validarReferencias(infra, dados, id)
  if (ator.id === id && !dados.ativo) throw erro.regra('Você não pode desativar o próprio usuário.')
  const novoPerfil = infra.db.select({ nome: perfil.nome }).from(perfil).where(eq(perfil.id, dados.perfilId)).get()!
  const deixaDeSerAdmin = antes.perfilNome === PERFIL_ADMIN && antes.ativo && (!dados.ativo || novoPerfil.nome !== PERFIL_ADMIN)
  if (deixaDeSerAdmin && administradoresAtivos(infra, id) === 0) throw erro.regra('É necessário manter ao menos um administrador ativo.')
  infra.bruto.transaction(() => {
    infra.db
      .update(usuario)
      .set({ ...dados, atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) })
      .where(eq(usuario.id, id))
      .run()
    auditar(infra, ator, { acao: 'USUARIO_ALTERADO', entidade: 'usuario', entidadeId: id, antes, depois: dados })
  })()
  return obterUsuarioDto(infra, id)
}

export async function redefinirSenha(infra: Infra, ator: Ator, id: number, senhaTemporaria: string): Promise<void> {
  exigir(ator, 'usuarios.gerenciar')
  const senha = senhaSchema.parse(senhaTemporaria)
  obterUsuarioDto(infra, id)
  const senhaHash = await gerarHashSenha(senha)
  infra.bruto.transaction(() => {
    infra.db
      .update(usuario)
      .set({ senhaHash, deveTrocarSenha: true, tentativasFalhas: 0, bloqueadoAte: null, senhaAlteradaEm: agoraIso(infra), atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) })
      .where(eq(usuario.id, id))
      .run()
    auditar(infra, ator, { acao: 'SENHA_REDEFINIDA', entidade: 'usuario', entidadeId: id, descricao: 'Senha temporária definida por administrador' })
  })()
}

export function desbloquearUsuario(infra: Infra, ator: Ator, id: number): void {
  exigir(ator, 'usuarios.gerenciar')
  obterUsuarioDto(infra, id)
  infra.bruto.transaction(() => {
    infra.db.update(usuario).set({ tentativasFalhas: 0, bloqueadoAte: null }).where(eq(usuario.id, id)).run()
    auditar(infra, ator, { acao: 'USUARIO_DESBLOQUEADO', entidade: 'usuario', entidadeId: id })
  })()
}
