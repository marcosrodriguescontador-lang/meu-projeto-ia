import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const caminho = process.env.DB_PATH || path.join(import.meta.dirname, 'data', 'agrocontrol.db');
if (caminho !== ':memory:') fs.mkdirSync(path.dirname(caminho), { recursive: true });

export const db = new DatabaseSync(caminho);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  cpf TEXT NOT NULL UNIQUE,
  telefone TEXT NOT NULL DEFAULT '',
  perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'financeiro', 'vendedor')),
  ativo INTEGER NOT NULL DEFAULT 1,
  senha_hash TEXT NOT NULL,
  trocar_senha INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reset_codes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  codigo_hash TEXT NOT NULL,
  expira INTEGER NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  usado INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expira INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_falhas (
  chave TEXT PRIMARY KEY,
  falhas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate INTEGER NOT NULL DEFAULT 0,
  atualizado INTEGER NOT NULL
);
`);

export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

// Executa fn dentro de uma transação (síncrona).
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function lerConfig() {
  const cfg = {};
  for (const { chave, valor } of all('SELECT chave, valor FROM config')) cfg[chave] = valor;
  return cfg;
}

export function salvarConfig(valores) {
  const st = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
  tx(() => { for (const [k, v] of Object.entries(valores)) st.run(k, v == null ? null : String(v)); });
}
