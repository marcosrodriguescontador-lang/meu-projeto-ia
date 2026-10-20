import { Router } from 'express';
import { lerConfig, salvarConfig } from '../db.js';
import { erro, texto } from '../lib/http.js';
import { exigir } from '../lib/sessao.js';
import { validarCNPJ, validarEmail, somenteDigitos, UFS } from '../lib/validacao.js';

export const REGIMES = ['Simples Nacional', 'Simples Nacional – excesso de sublimite', 'Lucro Presumido', 'Lucro Real'];
export const BANCOS = ['Bradesco', 'Banco do Brasil'];

const TEXTOS = { razao_social: 150, nome_fantasia: 100, ie: 20, logradouro: 150, numero: 20, complemento: 80, bairro: 80,
  municipio: 80, telefone: 30, email: 254, praca_pagamento: 120, foro: 120 };

// Dados da empresa usados em documentos (sem a logo, que vai por /api/logo).
export function dadosEmpresa() {
  const c = lerConfig();
  const out = {};
  for (const k of [...Object.keys(TEXTOS), 'cnpj', 'uf', 'cep', 'regime_tributario', 'banco_padrao', 'multa_padrao', 'juros_padrao']) {
    out[k] = c[k] ?? '';
  }
  out.exigir_troca_senha = c.exigir_troca_senha !== '0';
  out.logo = c.logo ? '/api/logo' : '/img/logo.png';
  return out;
}

function percentual(v, nome, max) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > max) throw erro(400, `${nome} deve estar entre 0 e ${max}.`);
  return String(Math.round(n * 100) / 100);
}

// Rota pública: logo da empresa (usada também na tela de login).
export const routerPublico = Router();
routerPublico.get('/logo', (req, res) => {
  const logo = lerConfig().logo;
  const m = logo?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!m) return res.redirect('/img/logo.png');
  res.set('Cache-Control', 'no-cache').type(m[1]).send(Buffer.from(m[2], 'base64'));
});

export const router = Router();

router.get('/empresa', (req, res) => res.json(dadosEmpresa()));

router.put('/config', exigir('configuracoes'), (req, res) => {
  const b = req.body;
  const d = {};
  for (const [c, max] of Object.entries(TEXTOS)) d[c] = texto(b[c], max);
  d.ie = d.ie.toUpperCase();
  d.cnpj = somenteDigitos(b.cnpj);
  d.uf = texto(b.uf, 2).toUpperCase();
  d.cep = somenteDigitos(b.cep);
  d.regime_tributario = texto(b.regime_tributario, 60);
  d.banco_padrao = texto(b.banco_padrao, 40);
  d.multa_padrao = percentual(b.multa_padrao, 'A multa', 100);
  d.juros_padrao = percentual(b.juros_padrao, 'Os juros ao mês', 100);
  d.exigir_troca_senha = b.exigir_troca_senha === false ? '0' : '1';
  if (d.cnpj && !validarCNPJ(d.cnpj)) throw erro(400, 'CNPJ inválido.');
  if (d.uf && !UFS.includes(d.uf)) throw erro(400, 'UF inválida.');
  if (d.cep && d.cep.length !== 8) throw erro(400, 'CEP deve ter 8 números.');
  if (d.email && !validarEmail(d.email)) throw erro(400, 'E-mail inválido.');
  if (d.regime_tributario && !REGIMES.includes(d.regime_tributario)) throw erro(400, 'Regime tributário inválido.');
  if (d.banco_padrao && !BANCOS.includes(d.banco_padrao)) throw erro(400, 'Banco inválido.');
  if (b.logo === null) d.logo = null;
  else if (typeof b.logo === 'string' && b.logo.startsWith('data:')) {
    const m = b.logo.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw erro(400, 'A logo deve ser uma imagem PNG, JPEG ou WEBP.');
    if (Buffer.from(m[1], 'base64').length > 600 * 1024) throw erro(400, 'A logo ficou grande demais (máximo 600 KB).');
    d.logo = b.logo;
  }
  salvarConfig(d);
  res.json(dadosEmpresa());
});
