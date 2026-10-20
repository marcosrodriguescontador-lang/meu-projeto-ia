import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { get, run } from '../db.js';
import { erro } from './http.js';
import { pode } from './permissoes.js';

export const COOKIE = 'agros_sid';
export const DURACAO_MS = 12 * 60 * 60 * 1000;

// SESSION_SECRET: do ambiente ou gerado automaticamente na primeira execução.
function obterSegredo() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const dir = path.dirname(process.env.DB_PATH && process.env.DB_PATH !== ':memory:'
    ? process.env.DB_PATH : path.join(import.meta.dirname, '..', 'data', 'x'));
  const arq = path.join(dir, 'session_secret');
  try {
    return fs.readFileSync(arq, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(arq, s, { mode: 0o600 });
    return s;
  }
}
const SEGREDO = obterSegredo();

export const hmac = (valor) => crypto.createHmac('sha256', SEGREDO).update(String(valor)).digest('hex');

function lerCookies(req) {
  const out = {};
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}

function opcoesCookie(req) {
  return { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' };
}

export function criarSessao(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  run('DELETE FROM sessoes WHERE expira < ?', Date.now());
  run('INSERT INTO sessoes (id, user_id, expira) VALUES (?, ?, ?)', hmac(token), userId, Date.now() + DURACAO_MS);
  res.cookie(COOKIE, token, { ...opcoesCookie(req), maxAge: DURACAO_MS });
}

export function encerrarSessao(req, res) {
  const token = lerCookies(req)[COOKIE];
  if (token) run('DELETE FROM sessoes WHERE id = ?', hmac(token));
  res.clearCookie(COOKIE, opcoesCookie(req));
}

export function encerrarSessoesDoUsuario(userId, excetoReq) {
  const token = excetoReq ? lerCookies(excetoReq)[COOKIE] : null;
  run('DELETE FROM sessoes WHERE user_id = ? AND id <> ?', userId, token ? hmac(token) : '');
}

// Middleware: carrega req.user a partir do cookie.
export function carregarUsuario(req, res, next) {
  const token = lerCookies(req)[COOKIE];
  if (token) {
    const u = get(`SELECT u.id, u.nome, u.email, u.cpf, u.telefone, u.perfil, u.trocar_senha
      FROM sessoes s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expira > ? AND u.ativo = 1`, hmac(token), Date.now());
    if (u) req.user = u;
  }
  next();
}

export function exigirLogin(req, res, next) {
  if (!req.user) return next(erro(401, 'Sua sessão expirou. Entre novamente.'));
  if (req.user.trocar_senha && !req.permiteTrocaPendente) return next(erro(403, 'Defina uma nova senha para continuar.'));
  next();
}

export const exigir = (acao) => (req, res, next) => {
  if (!pode(req.user?.perfil, acao)) return next(erro(403, 'Você não tem permissão para esta ação.'));
  next();
};
