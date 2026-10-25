import { and, eq, ne, sql } from 'drizzle-orm'
import type { PerfilDto } from '@shared/dto'
import { erro } from '@shared/erros'
import { PERFIS_PADRAO, PERMISSOES, TODAS_PERMISSOES, type Permissao } from '@shared/permissoes'
import { perfilSchema, type PerfilInput } from '@shared/schemas'
import { perfil, perfilPermissao, usuario } from '../../infra/db/schema'
import { exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from './auditoria'

export const PERFIL_ADMIN = 'Administrador'

export function permissoesDoPerfil(infra: Infra, perfilId: number): Permissao[] {
  return infra.db
    .select({ p: perfilPermissao.permissao })
    .from(perfilPermissao)
    .where(eq(perfilPermissao.perfilId, perfilId))
    .all()
    .map((r) => r.p as Permissao)
    .filter((p) => p in PERMISSOES)
}

/** Cria os perfis padrão e garante que o Administrador tenha todas as permissões (inclusive as de versões novas). */
export function sincronizarPerfisSistema(infra: Infra): void {
  infra.bruto.transaction(() => {
    for (const p of PERFIS_PADRAO) {
      const existente = infra.db.select().from(perfil).where(eq(perfil.nome, p.nome)).get()
      if (!existente) {
        const { id } = infra.db.insert(perfil).values({ nome: p.nome, descricao: p.descricao, sistema: p.nome === PERFIL_ADMIN }).returning({ id: perfil.id }).get()
        if (p.permissoes.length) infra.db.insert(perfilPermissao).values(p.permissoes.map((permissao) => ({ perfilId: id, permissao }))).run()
      } else if (existente.nome === PERFIL_ADMIN) {
        infra.db.insert(perfilPermissao).values(TODAS_PERMISSOES.map((permissao) => ({ perfilId: existente.id, permissao }))).onConflictDoNothing().run()
      }
    }
  })()
}

export function listarPerfis(infra: Infra, ator: Ator): PerfilDto[] {
  exigir(ator, 'usuarios.ver')
  const contagem = new Map(
    infra.db
      .select({ perfilId: usuario.perfilId, n: sql<number>`count(*)` })
      .from(usuario)
      .groupBy(usuario.perfilId)
      .all()
      .map((r) => [r.perfilId, r.n])
  )
  return infra.db
    .select()
    .from(perfil)
    .orderBy(perfil.nome)
    .all()
    .map((p) => ({ id: p.id, nome: p.nome, descricao: p.descricao, sistema: p.sistema, permissoes: permissoesDoPerfil(infra, p.id), usuarios: contagem.get(p.id) ?? 0 }))
}

function validar(infra: Infra, entrada: PerfilInput, ignorarId?: number) {
  const dados = perfilSchema.parse(entrada)
  const invalidas = dados.permissoes.filter((p) => !(p in PERMISSOES))
  if (invalidas.length) throw erro.validacao(`Permissões desconhecidas: ${invalidas.join(', ')}`)
  const duplicado = infra.db
    .select({ id: perfil.id })
    .from(perfil)
    .where(ignorarId ? and(eq(perfil.nome, dados.nome), ne(perfil.id, ignorarId)) : eq(perfil.nome, dados.nome))
    .get()
  if (duplicado) throw erro.conflito('Já existe um perfil com este nome.', { nome: 'Nome já utilizado' })
  return { ...dados, permissoes: [...new Set(dados.permissoes)] as Permissao[] }
}

export function criarPerfil(infra: Infra, ator: Ator, entrada: PerfilInput): PerfilDto {
  exigir(ator, 'perfis.gerenciar')
  const dados = validar(infra, entrada)
  const id = infra.bruto.transaction(() => {
    const { id } = infra.db.insert(perfil).values({ nome: dados.nome, descricao: dados.descricao, criadoPor: ator.id }).returning({ id: perfil.id }).get()
    if (dados.permissoes.length) infra.db.insert(perfilPermissao).values(dados.permissoes.map((permissao) => ({ perfilId: id, permissao }))).run()
    auditar(infra, ator, { acao: 'PERFIL_CRIADO', entidade: 'perfil', entidadeId: id, depois: dados })
    return id
  })()
  return listarPerfis(infra, ator).find((p) => p.id === id)!
}

export function atualizarPerfil(infra: Infra, ator: Ator, id: number, entrada: PerfilInput): PerfilDto {
  exigir(ator, 'perfis.gerenciar')
  const atual = infra.db.select().from(perfil).where(eq(perfil.id, id)).get()
  if (!atual) throw erro.naoEncontrado('Perfil')
  if (atual.sistema) throw erro.regra('O perfil Administrador é protegido e não pode ser alterado.')
  const dados = validar(infra, entrada, id)
  infra.bruto.transaction(() => {
    const antes = { nome: atual.nome, descricao: atual.descricao, permissoes: permissoesDoPerfil(infra, id) }
    infra.db.update(perfil).set({ nome: dados.nome, descricao: dados.descricao, atualizadoPor: ator.id, atualizadoEm: infra.agora().toISOString() }).where(eq(perfil.id, id)).run()
    infra.db.delete(perfilPermissao).where(eq(perfilPermissao.perfilId, id)).run()
    if (dados.permissoes.length) infra.db.insert(perfilPermissao).values(dados.permissoes.map((permissao) => ({ perfilId: id, permissao }))).run()
    auditar(infra, ator, { acao: 'PERFIL_ALTERADO', entidade: 'perfil', entidadeId: id, antes, depois: dados })
  })()
  return listarPerfis(infra, ator).find((p) => p.id === id)!
}

export function excluirPerfil(infra: Infra, ator: Ator, id: number): void {
  exigir(ator, 'perfis.gerenciar')
  const atual = infra.db.select().from(perfil).where(eq(perfil.id, id)).get()
  if (!atual) throw erro.naoEncontrado('Perfil')
  if (atual.sistema) throw erro.regra('O perfil Administrador não pode ser excluído.')
  const emUso = infra.db.select({ n: sql<number>`count(*)` }).from(usuario).where(eq(usuario.perfilId, id)).get()!.n
  if (emUso) throw erro.regra(`Perfil em uso por ${emUso} usuário(s). Altere o perfil desses usuários antes de excluir.`)
  infra.bruto.transaction(() => {
    const antes = { nome: atual.nome, permissoes: permissoesDoPerfil(infra, id) }
    infra.db.delete(perfil).where(eq(perfil.id, id)).run()
    auditar(infra, ator, { acao: 'PERFIL_EXCLUIDO', entidade: 'perfil', entidadeId: id, antes })
  })()
}
