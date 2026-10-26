// Trilha de auditoria append-only com encadeamento de hash (adulteração detectável).
import { asc, desc, eq, and, gte, lte, like, or, sql, type SQL } from 'drizzle-orm'
import type { RegistroAuditoria, PaginaResultado } from '@shared/dto'
import { sha256 } from '../../infra/crypto'
import { auditoria } from '../../infra/db/schema'
import { agoraIso, type Infra } from '../../nucleo/contexto'

export interface Autor {
  id: number | null
  login: string
}

const GENESIS = '0'.repeat(64)
const REMOVER = /^(senha|senhaHash|senha_hash|senhaInicial|novaSenha|senhaAtual|confirmacao)$/i
const MASCARAR = /^(agencia|conta|digito|pixChave|chavePix)$/i

/** Remove senhas e mascara dados bancários antes de gravar na auditoria. */
export function sanitizarAuditoria(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sanitizarAuditoria)
  if (valor && typeof valor === 'object') {
    const saida: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor)) {
      if (REMOVER.test(k)) continue
      if (/cifrad/i.test(k)) continue
      if (MASCARAR.test(k) && v != null && typeof v !== 'object') saida[k] = '***'
      else saida[k] = sanitizarAuditoria(v)
    }
    return saida
  }
  return valor
}

export interface EventoAuditoria {
  acao: string
  entidade: string
  entidadeId?: string | number | null
  descricao?: string
  antes?: unknown
  depois?: unknown
}

function calcularHash(r: Omit<typeof auditoria.$inferInsert, 'hash' | 'id'>): string {
  return sha256(
    JSON.stringify([r.hashAnterior, r.ts, r.usuarioId ?? null, r.usuarioLogin ?? null, r.acao, r.entidade, r.entidadeId ?? null, r.descricao ?? null, r.antes ?? null, r.depois ?? null, r.estacao ?? null])
  )
}

/** Deve ser chamado dentro da mesma transação da operação auditada. */
export function auditar(infra: Infra, ator: Autor, ev: EventoAuditoria): void {
  const ultimo = infra.db.select({ hash: auditoria.hash }).from(auditoria).orderBy(desc(auditoria.id)).limit(1).get()
  const registro = {
    ts: agoraIso(infra),
    usuarioId: ator.id,
    usuarioLogin: ator.login,
    acao: ev.acao,
    entidade: ev.entidade,
    entidadeId: ev.entidadeId == null ? null : String(ev.entidadeId),
    descricao: ev.descricao ?? null,
    antes: ev.antes === undefined ? null : JSON.stringify(sanitizarAuditoria(ev.antes)),
    depois: ev.depois === undefined ? null : JSON.stringify(sanitizarAuditoria(ev.depois)),
    estacao: infra.estacao,
    hashAnterior: ultimo?.hash ?? GENESIS
  }
  infra.db.insert(auditoria).values({ ...registro, hash: calcularHash(registro) }).run()
}

export function verificarIntegridadeAuditoria(infra: Infra): { integra: boolean; total: number; primeiroInvalido: number | null } {
  let anterior = GENESIS
  let total = 0
  const linhas = infra.bruto.prepare('SELECT * FROM auditoria ORDER BY id').iterate() as IterableIterator<Record<string, unknown>>
  for (const l of linhas) {
    total++
    const r = {
      ts: l.ts as string,
      usuarioId: l.usuario_id as number | null,
      usuarioLogin: l.usuario_login as string | null,
      acao: l.acao as string,
      entidade: l.entidade as string,
      entidadeId: l.entidade_id as string | null,
      descricao: l.descricao as string | null,
      antes: l.antes as string | null,
      depois: l.depois as string | null,
      estacao: l.estacao as string | null,
      hashAnterior: l.hash_anterior as string
    }
    if (r.hashAnterior !== anterior || calcularHash(r) !== l.hash) return { integra: false, total, primeiroInvalido: l.id as number }
    anterior = l.hash as string
  }
  return { integra: true, total, primeiroInvalido: null }
}

export interface FiltroAuditoria {
  entidade?: string
  entidadeId?: string
  usuario?: string
  de?: string
  ate?: string
  busca?: string
  pagina: number
  porPagina: number
}

export function listarAuditoria(infra: Infra, f: FiltroAuditoria): PaginaResultado<RegistroAuditoria> {
  const cond: SQL[] = []
  if (f.entidade) cond.push(eq(auditoria.entidade, f.entidade))
  if (f.entidadeId) cond.push(eq(auditoria.entidadeId, f.entidadeId))
  if (f.usuario) cond.push(eq(auditoria.usuarioLogin, f.usuario))
  if (f.de) cond.push(gte(auditoria.ts, f.de))
  if (f.ate) cond.push(lte(auditoria.ts, `${f.ate}T23:59:59.999Z`))
  if (f.busca) cond.push(or(like(auditoria.acao, `%${f.busca}%`), like(auditoria.descricao, `%${f.busca}%`))!)
  const where = cond.length ? and(...cond) : undefined
  const total = infra.db.select({ n: sql<number>`count(*)` }).from(auditoria).where(where).get()!.n
  const itens = infra.db
    .select()
    .from(auditoria)
    .where(where)
    .orderBy(desc(auditoria.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina)
    .all()
  return { itens, total, pagina: f.pagina, porPagina: f.porPagina }
}

export function historicoEntidade(infra: Infra, entidade: string, entidadeId: string | number): RegistroAuditoria[] {
  return infra.db
    .select()
    .from(auditoria)
    .where(and(eq(auditoria.entidade, entidade), eq(auditoria.entidadeId, String(entidadeId))))
    .orderBy(asc(auditoria.id))
    .all()
}
