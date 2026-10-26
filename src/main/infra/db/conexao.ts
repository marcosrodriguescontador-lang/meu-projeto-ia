// Abertura do banco SQLite cifrado (SQLCipher v4) e execução das migrações versionadas.
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { sha256 } from '../crypto'
import * as schema from './schema'

export type BancoBruto = Database.Database
export type Banco = BetterSQLite3Database<typeof schema>

export interface Migracao {
  tag: string
  sql: string
}

const arquivos = import.meta.glob('../../../../db/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const MIGRACOES: Migracao[] = Object.entries(arquivos)
  .map(([caminho, sql]) => ({ tag: caminho.split('/').pop()!.replace(/\.sql$/, ''), sql }))
  .sort((a, b) => a.tag.localeCompare(b.tag))

export const VERSAO_SCHEMA = MIGRACOES.at(-1)?.tag ?? '0000'

export function abrirBancoBruto(caminho: string, chave: Buffer, somenteLeitura = false): BancoBruto {
  const db = new Database(caminho, { readonly: somenteLeitura, fileMustExist: somenteLeitura })
  db.pragma(`cipher='sqlcipher'`)
  db.pragma('legacy=4')
  db.pragma(`key="x'${chave.toString('hex')}'"`)
  // Força leitura: falha aqui se a chave estiver errada.
  db.prepare('SELECT count(*) FROM sqlite_master').get()
  if (somenteLeitura) return db
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = FULL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

export function migrar(db: BancoBruto, migracoes: Migracao[] = MIGRACOES): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migracao (
    tag TEXT PRIMARY KEY, sha256 TEXT NOT NULL,
    aplicada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`)
  const aplicadas = new Map(
    (db.prepare('SELECT tag, sha256 FROM _migracao').all() as { tag: string; sha256: string }[]).map((r) => [r.tag, r.sha256])
  )
  const novas: string[] = []
  for (const m of migracoes) {
    const hash = sha256(m.sql)
    const registrada = aplicadas.get(m.tag)
    if (registrada) {
      if (registrada !== hash) throw new Error(`Migração ${m.tag} foi alterada após aplicada`)
      continue
    }
    db.transaction(() => {
      for (const instrucao of m.sql.split('--> statement-breakpoint')) {
        if (instrucao.trim()) db.exec(instrucao)
      }
      db.prepare('INSERT INTO _migracao (tag, sha256) VALUES (?, ?)').run(m.tag, hash)
    })()
    novas.push(m.tag)
  }
  const fk = db.pragma('foreign_key_check') as unknown[]
  if (fk.length) throw new Error('Violação de integridade referencial após migração')
  return novas
}

export function criarBanco(bruto: BancoBruto): Banco {
  return drizzle(bruto, { schema })
}

export function versaoSchemaAplicada(db: BancoBruto): string {
  const r = db.prepare('SELECT tag FROM _migracao ORDER BY tag DESC LIMIT 1').get() as { tag: string } | undefined
  return r?.tag ?? 'nenhuma'
}
