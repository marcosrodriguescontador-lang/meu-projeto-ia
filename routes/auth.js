import crypto from 'node:crypto';
import { Router } from 'express';
import { get, run, tx, lerConfig } from '../db.js';
import { erro, texto } from '../lib/http.js';
import { gerarHash, conferirSenha, problemaSenhaNova } from '../lib/senha.js';
import { validarCPF, validarEmail, somenteDigitos } from '../lib/validacao.js';
import { criarSessao, encerrarSessao, encerrarSessoesDoUsuario, hmac } from '../lib/sessao.js';
import { permissoesDoPerfil } from '../lib/permissoes.js';
import { enviarCodigoRedefinicao } from '../lib/email.js';

export const router = Router();

const MAX_FALHAS = 8;
const MAX_FALHAS_IP = 30;
const BLOQUEIO_MS = 10 * 60 * 1000;
const CODIGO_VALIDADE_MS = 15 * 60 * 1000;
const CODIGO_MAX_TENTATIVAS = 5;

// Controle de tentativas de login ---------------------------------------
function bloqueadoAte(chave) {
  const r = get('SELECT bloqueado_ate FROM login_falhas WHERE chave = ?', chave);
  return r && r.bloqueado_ate > Date.now() ? r.bloqueado_ate : 0;
}

function registrarFalha(chave, limite) {
  const agora = Date.now();
  const r = get('SELECT falhas, atualizado FROM login_falhas WHERE chave = ?', chave);
  // Falhas antigas (mais de 10 minutos sem novas tentativas) são esquecidas.
  const falhas = (r && agora - r.atualizado < BLOQUEIO_MS ? r.falhas : 0) + 1;
  const bloqueio = falhas >= limite ? agora + BLOQUEIO_MS : 0;
  run(`INSERT INTO login_falhas (chave, falhas, bloqueado_ate, atualizado) VALUES (?, ?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET falhas = excluded.falhas, bloqueado_ate = excluded.bloqueado_ate,
       atualizado = excluded.atualizado`, chave, bloqueio ? 0 : falhas, bloqueio, agora);
}

const limparFalhas = (chave) => run('DELETE FROM login_falhas WHERE chave = ?', chave);

export function exigeTrocaSenha() {
  return lerConfig().exigir_troca_senha !== '0' ? 1 : 0;
}

export function dadosSessao(user) {
  if (!user) return null;
  const { id, nome, email, perfil, trocar_senha } = user;
  return { id, nome, email, perfil, trocarSenha: Boolean(trocar_senha), permissoes: permissoesDoPerfil(perfil) };
}

// Rotas -------------------------------------------------------------------
router.get('/sessao', (req, res) => {
  const total = get('SELECT COUNT(*) AS n FROM users').n;
  const cfg = lerConfig();
  res.json({
    primeiroAcesso: total === 0,
    usuario: dadosSessao(req.user),
    empresa: { nome: cfg.nome_fantasia || 'AGRO S', logo: cfg.logo ? '/api/logo' : '/img/logo.png' },
  });
});

router.post('/primeiro-acesso', async (req, res) => {
  const nome = texto(req.body.nome, 120);
  const email = texto(req.body.email, 254).toLowerCase();
  const cpf = somenteDigitos(req.body.cpf);
  if (nome.length < 3) throw erro(400, 'Informe o nome completo.');
  if (!validarEmail(email)) throw erro(400, 'E-mail inválido.');
  if (!validarCPF(cpf)) throw erro(400, 'CPF inválido.');
  const hash = await gerarHash(cpf);
  const id = tx(() => {
    if (get('SELECT COUNT(*) AS n FROM users').n > 0) throw erro(409, 'O administrador já foi criado. Faça login.');
    return run(`INSERT INTO users (nome, email, cpf, perfil, senha_hash, trocar_senha) VALUES (?, ?, ?, 'admin', ?, ?)`,
      nome, email, cpf, hash, exigeTrocaSenha()).lastInsertRowid;
  });
  res.status(201).json({ ok: true, id: Number(id) });
});

router.post('/login', async (req, res) => {
  const email = texto(req.body.email, 254).toLowerCase();
  const senha = String(req.body.senha ?? '').slice(0, 200);
  const chaveEmail = `email:${email}`;
  const chaveIp = `ip:${req.ip}`;
  const ate = Math.max(bloqueadoAte(chaveEmail), bloqueadoAte(chaveIp));
  if (ate) {
    const min = Math.ceil((ate - Date.now()) / 60000);
    throw erro(429, `Muitas tentativas sem sucesso. Tente novamente em ${min} minuto(s).`);
  }
  const u = get('SELECT id, senha_hash, ativo FROM users WHERE email = ?', email);
  let ok = await conferirSenha(senha, u?.senha_hash);
  // Aceita o CPF digitado com pontuação (ex.: 123.456.789-09).
  if (!ok && u && /^[\d.\-\s]+$/.test(senha) && somenteDigitos(senha) !== senha) {
    ok = await conferirSenha(somenteDigitos(senha), u.senha_hash);
  }
  if (!ok || !u.ativo) {
    registrarFalha(chaveEmail, MAX_FALHAS);
    registrarFalha(chaveIp, MAX_FALHAS_IP);
    throw erro(401, 'E-mail ou senha incorretos.');
  }
  limparFalhas(chaveEmail);
  criarSessao(req, res, u.id);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  encerrarSessao(req, res);
  res.json({ ok: true });
});

router.post('/senha/esqueci', async (req, res) => {
  const email = texto(req.body.email, 254).toLowerCase();
  const resposta = { ok: true, mensagem: 'Se o e-mail estiver cadastrado, você receberá um código em instantes.' };
  const u = validarEmail(email) && get('SELECT id, nome, email FROM users WHERE email = ? AND ativo = 1', email);
  if (!u) return res.json(resposta);
  const agora = Date.now();
  // No máximo 3 códigos por usuário a cada 15 minutos.
  const recentes = get('SELECT COUNT(*) AS n FROM reset_codes WHERE user_id = ? AND criado > ?', u.id, agora - CODIGO_VALIDADE_MS).n;
  if (recentes >= 3) return res.json(resposta);
  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  tx(() => {
    run('UPDATE reset_codes SET usado = 1 WHERE user_id = ? AND usado = 0', u.id);
    run('INSERT INTO reset_codes (user_id, codigo_hash, expira, criado) VALUES (?, ?, ?, ?)',
      u.id, hmac(`${u.id}:${codigo}`), agora + CODIGO_VALIDADE_MS, agora);
  });
  try {
    await enviarCodigoRedefinicao(u.email, u.nome, codigo);
  } catch (e) {
    console.error('Falha ao enviar e-mail de redefinição:', e.message);
  }
  res.json(resposta);
});

router.post('/senha/redefinir', async (req, res) => {
  const email = texto(req.body.email, 254).toLowerCase();
  const codigo = somenteDigitos(req.body.codigo).slice(0, 6);
  const senha = String(req.body.senha ?? '');
  const invalido = erro(400, 'Código inválido ou expirado. Peça um novo código.');
  const u = get('SELECT id, cpf FROM users WHERE email = ? AND ativo = 1', email);
  if (!u) throw invalido;
  const rc = get(`SELECT id, codigo_hash, tentativas FROM reset_codes
    WHERE user_id = ? AND usado = 0 AND expira > ? ORDER BY id DESC LIMIT 1`, u.id, Date.now());
  if (!rc || rc.tentativas >= CODIGO_MAX_TENTATIVAS) throw invalido;
  const esperado = Buffer.from(rc.codigo_hash);
  const informado = Buffer.from(hmac(`${u.id}:${codigo}`));
  if (codigo.length !== 6 || !crypto.timingSafeEqual(esperado, informado)) {
    run('UPDATE reset_codes SET tentativas = tentativas + 1 WHERE id = ?', rc.id);
    throw invalido;
  }
  const problema = problemaSenhaNova(senha, u.cpf);
  if (problema) throw erro(400, problema);
  const hash = await gerarHash(senha);
  tx(() => {
    run('UPDATE reset_codes SET usado = 1 WHERE user_id = ?', u.id);
    run('UPDATE users SET senha_hash = ?, trocar_senha = 0 WHERE id = ?', hash, u.id);
    run('DELETE FROM sessoes WHERE user_id = ?', u.id);
  });
  limparFalhas(`email:${email}`);
  res.json({ ok: true, mensagem: 'Senha alterada. Entre com a nova senha.' });
});

router.post('/senha/alterar', async (req, res) => {
  if (!req.user) throw erro(401, 'Sua sessão expirou. Entre novamente.');
  const u = get('SELECT id, cpf, senha_hash FROM users WHERE id = ?', req.user.id);
  if (!(await conferirSenha(String(req.body.atual ?? ''), u.senha_hash))) throw erro(400, 'A senha atual não confere.');
  const problema = problemaSenhaNova(req.body.nova, u.cpf);
  if (problema) throw erro(400, problema);
  run('UPDATE users SET senha_hash = ?, trocar_senha = 0 WHERE id = ?', await gerarHash(req.body.nova), u.id);
  encerrarSessoesDoUsuario(u.id, req);
  res.json({ ok: true, mensagem: 'Senha alterada com sucesso.' });
});
