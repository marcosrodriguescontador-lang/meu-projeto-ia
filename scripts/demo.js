// Popula o banco com dados fictícios para testar o sistema (npm run demo).
// Uso: npm run demo            → só funciona com o banco vazio
//      npm run demo -- --limpar → apaga o banco atual (faz uma cópia antes) e cria os dados de demonstração
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.join(import.meta.dirname, '..');
const arquivoEnv = path.join(raiz, '.env');
if (fs.existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);
const caminhoDb = process.env.DB_PATH || path.join(raiz, 'data', 'agrocontrol.db');

if (process.argv.includes('--limpar') && fs.existsSync(caminhoDb)) {
  const copia = `${caminhoDb}.antes-da-demo-${Date.now()}`;
  fs.copyFileSync(caminhoDb, copia);
  for (const ext of ['', '-wal', '-shm']) fs.rmSync(caminhoDb + ext, { force: true });
  console.log(`Banco anterior copiado para ${copia}`);
}

const { db, get, run, tx, salvarConfig } = await import('../db.js');
const { gerarHash } = await import('../lib/senha.js');
const { calcularTotais } = await import('../lib/pedidos.js');
const { gerarParcelas } = await import('../lib/parcelas.js');
const { dvChave } = await import('../lib/chave-nfe.js');

if (get('SELECT COUNT(*) AS n FROM users').n > 0) {
  console.error('O banco já tem dados. Para substituir pelos dados de demonstração, use: npm run demo -- --limpar');
  process.exit(1);
}

// Gerador pseudoaleatório fixo, para a demo sair sempre igual.
let semente = 20261020;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];
const entre = (a, b) => a + Math.floor(aleatorio() * (b - a + 1));

function cpfValido(base9) {
  const d = String(base9).padStart(9, '0').split('').map(Number);
  for (let t = 9; t < 11; t++) {
    const s = d.reduce((acc, n, i) => acc + n * (t + 1 - i), 0);
    d.push(((s * 10) % 11) % 10);
  }
  return d.join('');
}
function cnpjValido(base12) {
  const d = String(base12).padStart(12, '0').split('').map(Number);
  for (const pesos of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const r = d.reduce((acc, n, i) => acc + n * pesos[i], 0) % 11;
    d.push(r < 2 ? 0 : 11 - r);
  }
  return d.join('');
}
const iso = (dt) => dt.toISOString().slice(0, 10);
const hoje = new Date();

const CNPJ_EMPRESA = cnpjValido('112223330001');
salvarConfig({
  razao_social: 'AGRO S COMERCIO DE INSUMOS AGRICOLAS LTDA (DEMONSTRAÇÃO)', nome_fantasia: 'AGRO S', cnpj: CNPJ_EMPRESA,
  ie: '520123456110', logradouro: 'Avenida Siqueira Campos', numero: '1000', bairro: 'Centro', municipio: 'Paraguaçu Paulista',
  uf: 'SP', cep: '19700000', telefone: '(18) 3361-0000', email: 'contato@agros.exemplo', regime_tributario: 'Simples Nacional',
  banco_padrao: 'Bradesco', praca_pagamento: 'Paraguaçu Paulista/SP', foro: 'Comarca de Paraguaçu Paulista/SP',
  multa_padrao: '2', juros_padrao: '1', exigir_troca_senha: '1',
});

const pessoas = [
  ['Administrador Demo', 'admin@agros.exemplo', 'admin'],
  ['Fernanda Financeiro', 'financeiro@agros.exemplo', 'financeiro'],
  ['Carlos Vendedor', 'carlos@agros.exemplo', 'vendedor'],
  ['Juliana Vendedora', 'juliana@agros.exemplo', 'vendedor'],
  ['Rafael Vendedor', 'rafael@agros.exemplo', 'vendedor'],
];
const usuarios = [];
for (const [i, [nome, email, perfil]] of pessoas.entries()) {
  const cpf = cpfValido(123456780 + i * 1111);
  // Na demonstração a senha inicial (CPF) não precisa ser trocada.
  const id = Number(run('INSERT INTO users (nome, email, cpf, telefone, perfil, senha_hash, trocar_senha) VALUES (?, ?, ?, ?, ?, ?, 0)',
    nome, email, cpf, `(18) 9${entre(8000, 9999)}-${entre(1000, 9999)}`, perfil, await gerarHash(cpf)).lastInsertRowid);
  usuarios.push({ id, nome, email, perfil, cpf });
}
const vendedores = usuarios.filter((u) => u.perfil === 'vendedor');

const MUNICIPIOS = [['Paraguaçu Paulista', 'SP', '19700000'], ['Assis', 'SP', '19800000'], ['Quatá', 'SP', '19780000'],
  ['Maracaí', 'SP', '19840000'], ['Tarumã', 'SP', '19820000'], ['Rancharia', 'SP', '19600000'], ['Florínea', 'SP', '19870000'],
  ['Cambará', 'PR', '86390000']];
const NOMES = ['Fazenda Santa Maria', 'Sítio Boa Vista', 'Agropecuária Rio Novo Ltda', 'Fazenda Três Irmãos', 'Sítio São José',
  'Cooperativa Agrícola Vale Verde', 'Fazenda Esperança', 'Agrícola Primavera Ltda', 'Sítio Recanto Feliz', 'Fazenda Água Limpa'];
const clientes = NOMES.map((nome, i) => {
  const pj = /Ltda|Cooperativa/.test(nome);
  const [municipio, uf, cep] = MUNICIPIOS[i % MUNICIPIOS.length];
  const doc = pj ? cnpjValido(String(445566770001 + i * 7)) : cpfValido(300100200 + i * 3571);
  const id = Number(run(`INSERT INTO clientes (nome, documento, ie, logradouro, numero, bairro, municipio, uf, cep, telefone, email, limite_credito)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, nome, doc, pj || i % 3 === 0 ? `${entre(100000000, 999999999)}110` : '',
  `Estrada Municipal ${escolher(['PGP', 'ASS', 'QTA'])}-${entre(10, 90)}, km ${entre(1, 30)}`, 's/n', 'Zona Rural', municipio, uf, cep,
  `(18) 99${entre(100, 999)}-${entre(1000, 9999)}`, '', entre(20, 200) * 100000).lastInsertRowid);
  return { id, uf };
});

const PRODUTOS = [
  ['GLI-20', 'Glifosato 480 g/L SL – galão 20 L', 'GL', 38990, '38089329'], ['GLI-05', 'Glifosato 480 g/L SL – galão 5 L', 'GL', 10490, '38089329'],
  ['ATZ-20', 'Atrazina 500 SC – galão 20 L', 'GL', 45900, '38089329'], ['2,4D-20', '2,4-D Amina 806 SL – galão 20 L', 'GL', 52500, '38089329'],
  ['AZX-05', 'Azoxistrobina + Ciproconazol SC – 5 L', 'GL', 61250, '38089299'], ['TEB-05', 'Tebuconazol 200 EC – 5 L', 'GL', 23800, '38089299'],
  ['MAN-25', 'Mancozebe 800 WP – saco 25 kg', 'SC', 54900, '38089299'], ['IMI-01', 'Imidacloprido 700 WG – 1 kg', 'KG', 31200, '38089199'],
  ['CLO-05', 'Clorantraniliprole 200 SC – 1 L', 'L', 89900, '38089199'], ['ACE-01', 'Acefato 750 SP – 1 kg', 'KG', 7890, '38089199'],
  ['LAM-05', 'Lambda-cialotrina 50 EC – 5 L', 'GL', 19900, '38089199'], ['OLE-20', 'Óleo mineral adjuvante – 20 L', 'GL', 21000, '34031900'],
  ['ADJ-05', 'Adjuvante espalhante – 5 L', 'GL', 8990, '34029090'], ['FIP-01', 'Fipronil 800 WG – 1 kg', 'KG', 44500, '38089199'],
  ['TRA-01', 'Tratamento de sementes (Fipronil + Piraclostrobina) – 1 L', 'L', 67800, '38089199'],
];
const produtos = PRODUTOS.map(([codigo, descricao, unidade, preco, ncm], i) => {
  const id = Number(run(`INSERT INTO produtos (codigo, descricao, unidade, ncm, preco, registro_mapa, classe_toxicologica, cfop, cst_icms,
    aliquota_icms, reducao_base, cst_pis, cst_cofins, obs_fiscal) VALUES (?, ?, ?, ?, ?, ?, ?, '5102', '102', 0, 60, '49', '49', ?)`,
  codigo, descricao, unidade, ncm, preco, `${entre(1000, 39999)}${String(entre(1, 99)).padStart(2, '0')}`,
  escolher(['Categoria 3 – Moderadamente tóxico', 'Categoria 4 – Pouco tóxico', 'Categoria 5 – Improvável de causar dano agudo']),
  i < 11 ? 'Base de cálculo do ICMS reduzida conforme Convênio ICMS 100/97 (redação vigente).' : '').lastInsertRowid);
  return { id, descricao, unidade, preco };
});

// 60 pedidos distribuídos nos últimos 12 meses.
const ORIGENS = ['Aplicativo', 'WhatsApp', 'Telefone', 'Balcão'];
const CONDICOES = [['avista', ''], ['dias', '30'], ['dias', '30/60'], ['dias', '30/60/90'], ['datas', '']];
let nNota = 1000;
let ordem = 0;
const stItem = db.prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, descricao, unidade, quantidade, preco_unit, total)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);
tx(() => {
  for (let k = 0; k < 60; k++) {
    const dt = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - Math.floor((k / 60) * 365) - entre(0, 5)));
    const data = iso(dt);
    const vend = escolher(vendedores);
    const cli = escolher(clientes);
    const itens = Array.from({ length: entre(1, 4) }, () => {
      const p = escolher(produtos);
      const preco = Math.round(p.preco * (1 - entre(0, 8) / 100));
      return { produto_id: p.id, descricao: p.descricao, unidade: p.unidade, quantidade: entre(1, 40), preco_unit: preco };
    });
    const desconto = aleatorio() < 0.3 ? entre(50, 500) * 100 : 0;
    const frete = aleatorio() < 0.2 ? entre(80, 400) * 100 : 0;
    const t = calcularTotais(itens, desconto, frete);
    let [ct, cv] = escolher(CONDICOES);
    if (ct === 'datas') cv = `30/04/${dt.getUTCFullYear() + 1}`;
    // Pedidos antigos estão faturados; os recentes ficam recebidos/aprovados; alguns cancelados.
    const idade = (hoje - dt) / 86400000;
    const status = aleatorio() < 0.07 ? 'Cancelado' : idade > 20 ? 'Faturado' : idade > 7 ? 'Aprovado' : 'Recebido';
    const forma = ct === 'avista' ? escolher(['PIX', 'Dinheiro', 'Cartão']) : 'Boleto';
    const pedidoId = Number(run(`INSERT INTO pedidos (data, vendedor_id, cliente_id, origem, status, subtotal, desconto, frete, total,
      modalidade_frete, forma_pagamento, condicao_tipo, condicao_valor, data_entrega, receituario, criado_por, aprovado_por, aprovado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, data, vend.id, cli.id, escolher(ORIGENS), status, t.subtotal, desconto, frete,
    t.total, frete ? '0' : '9', forma, ct, cv, iso(new Date(dt.getTime() + 5 * 86400000)), `RA-${dt.getUTCFullYear()}-${String(entre(1, 9999)).padStart(5, '0')}`,
    vend.id, ['Aprovado', 'Faturado'].includes(status) ? usuarios[0].id : null, ['Aprovado', 'Faturado'].includes(status) ? `${data} 12:00:00` : null).lastInsertRowid);
    for (const i of t.itens) stItem.run(pedidoId, i.produto_id, i.descricao, i.unidade, i.quantidade, i.preco_unit, i.total);

    if (status === 'Faturado') {
      const emissao = iso(new Date(dt.getTime() + 2 * 86400000));
      const [a, m] = emissao.split('-');
      const base = `35${a.slice(2)}${m}${CNPJ_EMPRESA}55001${String(++nNota).padStart(9, '0')}1${String(entre(10000000, 99999999))}`;
      const notaId = Number(run(`INSERT INTO notas (pedido_id, chave, numero, serie, data_emissao, valor, data_entrega, criado_por)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?)`, pedidoId, base + dvChave(base), nNota, emissao, t.total,
      aleatorio() < 0.85 ? iso(new Date(dt.getTime() + 5 * 86400000)) : null, usuarios[1].id).lastInsertRowid);
      for (const p of gerarParcelas({ total: t.total, tipo: ct, valor: cv, dataBase: emissao })) {
        const venc = p.vencimento;
        const vencida = venc && venc < iso(hoje);
        const paga = !venc || (vencida && aleatorio() < 0.8);
        run(`INSERT INTO duplicatas (numero_ordem, nota_id, pedido_id, cliente_id, numero_fatura, parcela, parcelas, data_emissao,
          vencimento, valor, banco, praca_pagamento, status, data_pagamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Bradesco', ?, ?, ?)`,
        ++ordem, notaId, pedidoId, cli.id, String(nNota), p.numero, p.de, emissao, venc, p.valor, 'Paraguaçu Paulista/SP',
        paga ? 'paga' : 'aberta', paga ? (venc || emissao) : null);
      }
    }
  }
});

console.log('\nDados de demonstração criados:');
console.log(`  ${usuarios.length} usuários, ${clientes.length} clientes, ${produtos.length} produtos, 60 pedidos, ` +
  `${get('SELECT COUNT(*) AS n FROM notas').n} notas e ${get('SELECT COUNT(*) AS n FROM duplicatas').n} duplicatas.\n`);
console.log('Acessos (senha = CPF, somente números):');
for (const u of usuarios) console.log(`  ${u.perfil.padEnd(10)} ${u.email.padEnd(28)} senha ${u.cpf}`);
console.log('');
