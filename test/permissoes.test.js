import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pode, permissoesDoPerfil } from '../lib/permissoes.js';

test('regras de permissão por perfil', () => {
  assert.ok(pode('admin', 'colaboradores') && pode('admin', 'configuracoes') && pode('admin', 'notas'));
  for (const a of ['pedidos', 'pedidos_todos', 'pedidos_aprovar', 'notas', 'duplicatas', 'contratos', 'relatorios_todos']) {
    assert.ok(pode('financeiro', a), `financeiro: ${a}`);
  }
  assert.ok(!pode('financeiro', 'colaboradores'));
  assert.ok(!pode('financeiro', 'configuracoes'));
  for (const a of ['pedidos', 'clientes_ver', 'clientes_editar', 'produtos_ver', 'relatorios']) assert.ok(pode('vendedor', a), `vendedor: ${a}`);
  for (const a of ['pedidos_todos', 'pedidos_aprovar', 'notas', 'duplicatas', 'contratos', 'colaboradores', 'configuracoes', 'produtos_editar', 'relatorios_todos']) {
    assert.ok(!pode('vendedor', a), `vendedor não pode: ${a}`);
  }
  assert.ok(!pode('desconhecido', 'inicio'));
  assert.deepEqual(permissoesDoPerfil('vendedor').sort(), ['clientes_editar', 'clientes_ver', 'inicio', 'pedidos', 'produtos_ver', 'relatorios'].sort());
});

// Testes pela API, com banco temporário ---------------------------------------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-teste-'));
process.env.DB_PATH = path.join(dir, 'teste.db');
let servidor;
let base;

async function chamar(cookie, metodo, url, corpo) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-AgroS': '1', ...(cookie ? { Cookie: cookie } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, corpo: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}

async function entrar(email, senha) {
  const r = await chamar(null, 'POST', '/api/login', { email, senha });
  assert.equal(r.status, 200, `login ${email}`);
  return r.cookie;
}

before(async () => {
  const { criarApp } = await import('../server.js');
  servidor = criarApp().listen(0);
  await new Promise((ok) => servidor.once('listening', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  const { run } = await import('../db.js');
  run("INSERT INTO config (chave, valor) VALUES ('exigir_troca_senha', '0')");
});

after(() => {
  servidor?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fluxo pela API respeita os perfis', async () => {
  // Primeiro acesso cria o admin; senha = CPF (com ou sem pontuação).
  assert.equal((await chamar(null, 'POST', '/api/primeiro-acesso', { nome: 'Admin Teste', email: 'admin@t.com', cpf: '111.444.777-35' })).status, 201);
  assert.equal((await chamar(null, 'POST', '/api/primeiro-acesso', { nome: 'Outro', email: 'x@t.com', cpf: '52998224725' })).status, 409);
  const admin = await entrar('admin@t.com', '111.444.777-35');

  // Sem o cabeçalho anti-CSRF a requisição é recusada.
  const semCabecalho = await fetch(`${base}/api/clientes`, { method: 'POST', headers: { Cookie: admin, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(semCabecalho.status, 403);

  for (const [nome, email, cpf, perfil] of [['Vendedor Um', 'v1@t.com', '52998224725', 'vendedor'], ['Vendedor Dois', 'v2@t.com', '12345678909', 'vendedor'],
    ['Fin', 'fin@t.com', '04252011000', 'financeiro']]) {
    const r = await chamar(admin, 'POST', '/api/colaboradores', { nome, email, cpf, perfil, ativo: true });
    assert.equal(r.status, perfil === 'financeiro' ? 400 : 201, `${email} ${JSON.stringify(r.corpo)}`);
  }
  assert.equal((await chamar(admin, 'POST', '/api/colaboradores', { nome: 'Fin', email: 'fin@t.com', cpf: '86288366757', perfil: 'financeiro' })).status, 201);
  const cli = await chamar(admin, 'POST', '/api/clientes', { nome: 'Fazenda Teste', documento: '04.252.011/0001-10', uf: 'SP' });
  assert.equal(cli.status, 201);
  assert.equal((await chamar(admin, 'POST', '/api/clientes', { nome: 'Doc ruim', documento: '04.252.011/0001-11' })).status, 400);
  const prod = await chamar(admin, 'POST', '/api/produtos', { codigo: 'P1', descricao: 'Produto 1', preco: '100,00', cfop: '5102' });
  assert.equal(prod.status, 201);

  const v1 = await entrar('v1@t.com', '52998224725');
  const v2 = await entrar('v2@t.com', '123.456.789-09');
  const fin = await entrar('fin@t.com', '86288366757');

  // Vendedor não acessa módulos de gestão.
  for (const url of ['/api/colaboradores', '/api/notas/a-emitir', '/api/duplicatas', '/api/contratos']) {
    assert.equal((await chamar(v1, 'GET', url)).status, 403, url);
  }
  assert.equal((await chamar(v1, 'POST', '/api/produtos', { codigo: 'X', descricao: 'X' })).status, 403);
  assert.equal((await chamar(fin, 'GET', '/api/colaboradores')).status, 403);
  assert.equal((await chamar(fin, 'GET', '/api/notas/a-emitir')).status, 200);

  // Vendedor cria pedido: vendedor e total são definidos pelo servidor.
  const pedido = { cliente_id: cli.corpo.id, vendedor_id: 999, origem: 'WhatsApp', forma_pagamento: 'PIX', condicao_tipo: 'avista',
    total: 1, itens: [{ produto_id: prod.corpo.id, quantidade: '2,5', preco_unit: '100,00' }] };
  const p1 = await chamar(v1, 'POST', '/api/pedidos', pedido);
  assert.equal(p1.status, 201);
  assert.equal(p1.corpo.total, 25000);
  assert.equal(p1.corpo.status, 'Recebido');

  // Outro vendedor não vê nem edita o pedido.
  assert.equal((await chamar(v2, 'GET', `/api/pedidos/${p1.corpo.id}`)).status, 404);
  assert.equal((await chamar(v2, 'GET', '/api/pedidos')).corpo.total, 0);
  assert.equal((await chamar(v1, 'GET', '/api/pedidos')).corpo.total, 1);

  // Vendedor não aprova; financeiro aprova; depois disso o vendedor não edita mais.
  assert.equal((await chamar(v1, 'POST', `/api/pedidos/${p1.corpo.id}/aprovar`)).status, 403);
  assert.equal((await chamar(fin, 'POST', `/api/pedidos/${p1.corpo.id}/aprovar`)).status, 200);
  assert.equal((await chamar(v1, 'PUT', `/api/pedidos/${p1.corpo.id}`, pedido)).status, 403);

  // Relatório do vendedor só traz os próprios dados, mesmo pedindo outro vendedor.
  const rel = await chamar(v2, 'GET', `/api/relatorios/vendas?de=2000-01-01&ate=2100-01-01&vendedor=${p1.corpo.vendedor_id}`);
  assert.equal(rel.corpo.totais.vendas, 0);
  const relAdm = await chamar(admin, 'GET', '/api/relatorios/vendas?de=2000-01-01&ate=2100-01-01');
  assert.equal(relAdm.corpo.totais.valor, 25000);

  // Admin não pode desativar a si mesmo; sessão sem login é recusada.
  const eu = (await chamar(admin, 'GET', '/api/colaboradores?busca=admin')).corpo.linhas[0];
  assert.equal((await chamar(admin, 'PUT', `/api/colaboradores/${eu.id}`, { ...eu, ativo: false })).status, 400);
  assert.equal((await chamar(null, 'GET', '/api/pedidos')).status, 401, 'sem login');

  // Colaborador desativado perde o acesso imediatamente.
  const v2dados = (await chamar(admin, 'GET', '/api/colaboradores?busca=v2@')).corpo.linhas[0];
  assert.equal((await chamar(admin, 'PUT', `/api/colaboradores/${v2dados.id}`, { ...v2dados, ativo: false })).status, 200);
  assert.equal((await chamar(v2, 'GET', '/api/pedidos')).status, 401, 'desativado');
});

test('bloqueio após 8 tentativas de login erradas', async () => {
  for (let i = 0; i < 8; i++) assert.equal((await chamar(null, 'POST', '/api/login', { email: 'fin@t.com', senha: 'errada' })).status, 401);
  assert.equal((await chamar(null, 'POST', '/api/login', { email: 'fin@t.com', senha: '86288366757' })).status, 429);
});
