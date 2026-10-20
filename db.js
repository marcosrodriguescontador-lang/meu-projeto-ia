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

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  documento TEXT NOT NULL UNIQUE,
  ie TEXT NOT NULL DEFAULT '',
  logradouro TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  complemento TEXT NOT NULL DEFAULT '',
  bairro TEXT NOT NULL DEFAULT '',
  municipio TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  limite_credito INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  ncm TEXT NOT NULL DEFAULT '',
  preco INTEGER NOT NULL DEFAULT 0,
  registro_mapa TEXT NOT NULL DEFAULT '',
  classe_toxicologica TEXT NOT NULL DEFAULT '',
  cfop TEXT NOT NULL DEFAULT '5102',
  cst_icms TEXT NOT NULL DEFAULT '',
  aliquota_icms REAL NOT NULL DEFAULT 0,
  reducao_base REAL NOT NULL DEFAULT 0,
  cst_pis TEXT NOT NULL DEFAULT '',
  cst_cofins TEXT NOT NULL DEFAULT '',
  obs_fiscal TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  vendedor_id INTEGER NOT NULL REFERENCES users(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  origem TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Recebido' CHECK (status IN ('Recebido', 'Aprovado', 'Faturado', 'Cancelado')),
  subtotal INTEGER NOT NULL DEFAULT 0,
  desconto INTEGER NOT NULL DEFAULT 0,
  frete INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  modalidade_frete TEXT NOT NULL DEFAULT '9',
  forma_pagamento TEXT NOT NULL,
  condicao_tipo TEXT NOT NULL CHECK (condicao_tipo IN ('avista', 'dias', 'datas')),
  condicao_valor TEXT NOT NULL DEFAULT '',
  data_entrega TEXT,
  receituario TEXT NOT NULL DEFAULT '',
  observacoes TEXT NOT NULL DEFAULT '',
  motivo_cancelamento TEXT NOT NULL DEFAULT '',
  criado_por INTEGER REFERENCES users(id),
  aprovado_por INTEGER REFERENCES users(id),
  aprovado_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS pedidos_data ON pedidos (data);
CREATE INDEX IF NOT EXISTS pedidos_vendedor ON pedidos (vendedor_id, data);
CREATE INDEX IF NOT EXISTS pedidos_status ON pedidos (status);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL,
  quantidade REAL NOT NULL,
  preco_unit INTEGER NOT NULL,
  total INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS itens_pedido ON pedido_itens (pedido_id);
CREATE INDEX IF NOT EXISTS itens_produto ON pedido_itens (produto_id);

CREATE TABLE IF NOT EXISTS notas (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  chave TEXT NOT NULL UNIQUE,
  numero INTEGER NOT NULL,
  serie INTEGER NOT NULL,
  data_emissao TEXT NOT NULL,
  valor INTEGER NOT NULL,
  data_entrega TEXT,
  status TEXT NOT NULL DEFAULT 'emitida' CHECK (status IN ('emitida', 'cancelada')),
  motivo_cancelamento TEXT NOT NULL DEFAULT '',
  cancelada_em TEXT,
  criado_por INTEGER REFERENCES users(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS notas_pedido_ativa ON notas (pedido_id) WHERE status = 'emitida';
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

// Listagem paginada com busca simples.
export function listar({ select, from, where = [], params = [], ordem, pagina = 1, porPagina = 20 }) {
  const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = get(`SELECT COUNT(*) AS n FROM ${from}${w}`, ...params).n;
  const p = Math.max(1, Number(pagina) || 1);
  const n = Math.min(Math.max(1, Number(porPagina) || 20), 200);
  const linhas = all(`SELECT ${select} FROM ${from}${w} ORDER BY ${ordem} LIMIT ? OFFSET ?`, ...params, n, (p - 1) * n);
  return { linhas, total, pagina: p, porPagina: n };
}

// Termo de busca para LIKE (escapa curingas).
export const termo = (s) => `%${String(s ?? '').trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function lerConfig() {
  const cfg = {};
  for (const { chave, valor } of all('SELECT chave, valor FROM config')) cfg[chave] = valor;
  return cfg;
}

export function salvarConfig(valores) {
  const st = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
  tx(() => { for (const [k, v] of Object.entries(valores)) st.run(k, v == null ? null : String(v)); });
}
