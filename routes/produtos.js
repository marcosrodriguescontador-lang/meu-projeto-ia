import { Router } from 'express';
import { get, run, listar, termo } from '../db.js';
import { erro, texto, inteiro, centavos } from '../lib/http.js';
import { exigir } from '../lib/sessao.js';
import { somenteDigitos } from '../lib/validacao.js';

export const router = Router();

function percentual(v, nome) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw erro(400, `${nome} deve estar entre 0 e 100.`);
  return Math.round(n * 100) / 100;
}

function validar(body) {
  const d = {
    codigo: texto(body.codigo, 30),
    descricao: texto(body.descricao, 200),
    unidade: texto(body.unidade, 6).toUpperCase() || 'UN',
    ncm: somenteDigitos(body.ncm),
    preco: centavos(body.preco),
    registro_mapa: texto(body.registro_mapa, 30),
    classe_toxicologica: texto(body.classe_toxicologica, 60),
    cfop: somenteDigitos(body.cfop),
    cst_icms: somenteDigitos(body.cst_icms),
    aliquota_icms: percentual(body.aliquota_icms, 'A alíquota de ICMS'),
    reducao_base: percentual(body.reducao_base, 'O % de redução da base'),
    cst_pis: somenteDigitos(body.cst_pis),
    cst_cofins: somenteDigitos(body.cst_cofins),
    obs_fiscal: texto(body.obs_fiscal, 1000),
    ativo: body.ativo === false || body.ativo === 0 || body.ativo === '0' ? 0 : 1,
  };
  if (!d.codigo) throw erro(400, 'Informe o código do produto.');
  if (d.descricao.length < 2) throw erro(400, 'Informe a descrição do produto.');
  if (d.ncm && d.ncm.length !== 8) throw erro(400, 'O NCM deve ter 8 números.');
  if (d.cfop && !/^[5-7]\d{3}$/.test(d.cfop)) throw erro(400, 'CFOP inválido (4 números, começando com 5, 6 ou 7).');
  if (d.cst_icms && !/^\d{2,3}$/.test(d.cst_icms)) throw erro(400, 'CST/CSOSN do ICMS deve ter 2 ou 3 números.');
  if (d.cst_pis && !/^\d{2}$/.test(d.cst_pis)) throw erro(400, 'CST de PIS deve ter 2 números.');
  if (d.cst_cofins && !/^\d{2}$/.test(d.cst_cofins)) throw erro(400, 'CST de COFINS deve ter 2 números.');
  if (d.preco < 0) throw erro(400, 'O preço não pode ser negativo.');
  return d;
}

router.get('/produtos', exigir('produtos_ver'), (req, res) => {
  const where = [];
  const params = [];
  if (req.query.busca) {
    where.push("(descricao LIKE ? ESCAPE '\\' OR codigo LIKE ? ESCAPE '\\' OR registro_mapa LIKE ? ESCAPE '\\')");
    params.push(termo(req.query.busca), termo(req.query.busca), termo(req.query.busca));
  }
  if (req.query.ativo === '1' || req.query.ativo === '0') { where.push('ativo = ?'); params.push(Number(req.query.ativo)); }
  res.json(listar({ select: '*', from: 'produtos', where, params, ordem: 'ativo DESC, descricao',
    pagina: req.query.pagina, porPagina: req.query.porPagina }));
});

router.get('/produtos/:id', exigir('produtos_ver'), (req, res) => {
  const p = get('SELECT * FROM produtos WHERE id = ?', inteiro(req.params.id));
  if (!p) throw erro(404, 'Produto não encontrado.');
  res.json(p);
});

router.post('/produtos', exigir('produtos_editar'), (req, res) => {
  const d = validar(req.body);
  if (get('SELECT id FROM produtos WHERE codigo = ?', d.codigo)) throw erro(409, 'Já existe um produto com este código.');
  const cols = Object.keys(d);
  const r = run(`INSERT INTO produtos (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...Object.values(d));
  res.status(201).json(get('SELECT * FROM produtos WHERE id = ?', r.lastInsertRowid));
});

router.put('/produtos/:id', exigir('produtos_editar'), (req, res) => {
  const id = inteiro(req.params.id);
  if (!get('SELECT id FROM produtos WHERE id = ?', id)) throw erro(404, 'Produto não encontrado.');
  const d = validar(req.body);
  if (get('SELECT id FROM produtos WHERE codigo = ? AND id <> ?', d.codigo, id)) throw erro(409, 'Já existe um produto com este código.');
  const cols = Object.keys(d);
  run(`UPDATE produtos SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(d), id);
  res.json(get('SELECT * FROM produtos WHERE id = ?', id));
});
