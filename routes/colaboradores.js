import { Router } from 'express';
import { get, all, run, listar, termo, buscaNumerica } from '../db.js';
import { erro, texto, inteiro } from '../lib/http.js';
import { exigir, encerrarSessoesDoUsuario } from '../lib/sessao.js';
import { gerarHash } from '../lib/senha.js';
import { validarCPF, validarEmail, somenteDigitos } from '../lib/validacao.js';
import { PERFIS } from '../lib/permissoes.js';
import { exigeTrocaSenha } from './auth.js';

export const router = Router();
const admin = exigir('colaboradores');

const CAMPOS = 'id, nome, email, cpf, telefone, perfil, ativo, criado_em';

function validar(body) {
  const d = {
    nome: texto(body.nome, 120),
    email: texto(body.email, 254).toLowerCase(),
    cpf: somenteDigitos(body.cpf),
    telefone: texto(body.telefone, 30),
    perfil: texto(body.perfil, 20),
    ativo: body.ativo === false || body.ativo === 0 || body.ativo === '0' ? 0 : 1,
  };
  if (d.nome.length < 3) throw erro(400, 'Informe o nome completo.');
  if (!validarEmail(d.email)) throw erro(400, 'E-mail inválido.');
  if (!validarCPF(d.cpf)) throw erro(400, 'CPF inválido.');
  if (!PERFIS.includes(d.perfil)) throw erro(400, 'Perfil inválido.');
  return d;
}

const adminsAtivos = (excetoId) => get("SELECT COUNT(*) AS n FROM users WHERE perfil = 'admin' AND ativo = 1 AND id <> ?", excetoId).n;

router.get('/colaboradores', admin, (req, res) => {
  const where = [];
  const params = [];
  if (req.query.busca) {
    const dig = buscaNumerica(req.query.busca);
    where.push(`(nome LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'${dig ? " OR cpf LIKE ? ESCAPE '\\'" : ''})`);
    params.push(termo(req.query.busca), termo(req.query.busca));
    if (dig) params.push(termo(dig));
  }
  if (req.query.perfil) { where.push('perfil = ?'); params.push(req.query.perfil); }
  if (req.query.ativo === '1' || req.query.ativo === '0') { where.push('ativo = ?'); params.push(Number(req.query.ativo)); }
  res.json(listar({ select: CAMPOS, from: 'users', where, params, ordem: 'ativo DESC, nome', pagina: req.query.pagina }));
});

router.post('/colaboradores', admin, async (req, res) => {
  const d = validar(req.body);
  const hash = await gerarHash(d.cpf);
  const r = run(`INSERT INTO users (nome, email, cpf, telefone, perfil, ativo, senha_hash, trocar_senha)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, d.nome, d.email, d.cpf, d.telefone, d.perfil, d.ativo, hash, exigeTrocaSenha());
  res.status(201).json(get(`SELECT ${CAMPOS} FROM users WHERE id = ?`, r.lastInsertRowid));
});

router.put('/colaboradores/:id', admin, (req, res) => {
  const id = inteiro(req.params.id);
  const atual = get('SELECT id, perfil, ativo FROM users WHERE id = ?', id);
  if (!atual) throw erro(404, 'Colaborador não encontrado.');
  const d = validar(req.body);
  if (id === req.user.id && (!d.ativo || d.perfil !== 'admin')) {
    throw erro(400, 'Você não pode desativar nem tirar o perfil de administrador do seu próprio usuário.');
  }
  if (atual.perfil === 'admin' && (d.perfil !== 'admin' || !d.ativo) && adminsAtivos(id) === 0) {
    throw erro(400, 'É preciso manter pelo menos um administrador ativo.');
  }
  run('UPDATE users SET nome = ?, email = ?, cpf = ?, telefone = ?, perfil = ?, ativo = ? WHERE id = ?',
    d.nome, d.email, d.cpf, d.telefone, d.perfil, d.ativo, id);
  if (!d.ativo) encerrarSessoesDoUsuario(id);
  res.json(get(`SELECT ${CAMPOS} FROM users WHERE id = ?`, id));
});

router.post('/colaboradores/:id/redefinir-senha', admin, async (req, res) => {
  const u = get('SELECT id, cpf FROM users WHERE id = ?', inteiro(req.params.id));
  if (!u) throw erro(404, 'Colaborador não encontrado.');
  run('UPDATE users SET senha_hash = ?, trocar_senha = ? WHERE id = ?', await gerarHash(u.cpf), exigeTrocaSenha(), u.id);
  if (u.id !== req.user.id) encerrarSessoesDoUsuario(u.id);
  res.json({ ok: true, mensagem: 'Senha redefinida para o CPF (somente números).' });
});

// Lista simples de vendedores ativos (para filtros e pedidos). O vendedor vê só a si mesmo.
export const routerVendedores = Router();
routerVendedores.get('/vendedores', (req, res) => {
  if (req.user.perfil === 'vendedor') return res.json([{ id: req.user.id, nome: req.user.nome }]);
  res.json(all("SELECT id, nome, perfil, ativo FROM users ORDER BY ativo DESC, perfil = 'vendedor' DESC, nome"));
});
