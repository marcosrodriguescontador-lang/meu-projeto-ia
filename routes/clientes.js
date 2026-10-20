import { Router } from 'express';
import { get, run, listar, termo } from '../db.js';
import { erro, texto, inteiro, centavos } from '../lib/http.js';
import { exigir } from '../lib/sessao.js';
import { validarCpfCnpj, validarEmail, somenteDigitos, UFS } from '../lib/validacao.js';

export const router = Router();

const CAMPOS_TEXTO = { nome: 150, ie: 20, logradouro: 150, numero: 20, complemento: 80, bairro: 80, municipio: 80,
  telefone: 30, email: 254, observacoes: 1000 };

function validar(body) {
  const d = {};
  for (const [c, max] of Object.entries(CAMPOS_TEXTO)) d[c] = texto(body[c], max);
  d.documento = somenteDigitos(body.documento);
  d.uf = texto(body.uf, 2).toUpperCase();
  d.cep = somenteDigitos(body.cep);
  d.ie = d.ie.toUpperCase();
  d.limite_credito = centavos(body.limite_credito);
  d.ativo = body.ativo === false || body.ativo === 0 || body.ativo === '0' ? 0 : 1;
  if (d.nome.length < 3) throw erro(400, 'Informe o nome ou razão social.');
  if (!validarCpfCnpj(d.documento)) throw erro(400, 'CPF/CNPJ inválido. Confira os números.');
  if (d.uf && !UFS.includes(d.uf)) throw erro(400, 'UF inválida.');
  if (d.cep && d.cep.length !== 8) throw erro(400, 'CEP deve ter 8 números.');
  if (d.email && !validarEmail(d.email)) throw erro(400, 'E-mail inválido.');
  if (d.ie && d.ie !== 'ISENTO' && !/^[0-9A-Z.\-/]+$/.test(d.ie)) throw erro(400, 'Inscrição estadual inválida (use números ou ISENTO).');
  if (d.limite_credito < 0) throw erro(400, 'O limite de crédito não pode ser negativo.');
  return d;
}

router.get('/clientes', exigir('clientes_ver'), (req, res) => {
  const where = [];
  const params = [];
  if (req.query.busca) {
    const dig = somenteDigitos(req.query.busca);
    where.push(`(nome LIKE ? ESCAPE '\\' OR municipio LIKE ? ESCAPE '\\'${dig ? " OR documento LIKE ? ESCAPE '\\'" : ''})`);
    params.push(termo(req.query.busca), termo(req.query.busca));
    if (dig) params.push(termo(dig));
  }
  if (req.query.ativo === '1' || req.query.ativo === '0') { where.push('ativo = ?'); params.push(Number(req.query.ativo)); }
  res.json(listar({ select: '*', from: 'clientes', where, params, ordem: 'ativo DESC, nome',
    pagina: req.query.pagina, porPagina: req.query.porPagina }));
});

router.get('/clientes/:id', exigir('clientes_ver'), (req, res) => {
  const c = get('SELECT * FROM clientes WHERE id = ?', inteiro(req.params.id));
  if (!c) throw erro(404, 'Cliente não encontrado.');
  res.json(c);
});

router.post('/clientes', exigir('clientes_editar'), (req, res) => {
  const d = validar(req.body);
  if (get('SELECT id FROM clientes WHERE documento = ?', d.documento)) throw erro(409, 'Já existe um cliente com este CPF/CNPJ.');
  const cols = Object.keys(d);
  const r = run(`INSERT INTO clientes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...Object.values(d));
  res.status(201).json(get('SELECT * FROM clientes WHERE id = ?', r.lastInsertRowid));
});

router.put('/clientes/:id', exigir('clientes_editar'), (req, res) => {
  const id = inteiro(req.params.id);
  if (!get('SELECT id FROM clientes WHERE id = ?', id)) throw erro(404, 'Cliente não encontrado.');
  const d = validar(req.body);
  if (get('SELECT id FROM clientes WHERE documento = ? AND id <> ?', d.documento, id)) throw erro(409, 'Já existe um cliente com este CPF/CNPJ.');
  const cols = Object.keys(d);
  run(`UPDATE clientes SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(d), id);
  res.json(get('SELECT * FROM clientes WHERE id = ?', id));
});
