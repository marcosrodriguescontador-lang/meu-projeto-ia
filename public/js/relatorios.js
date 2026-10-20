// Relatórios de vendas: filtros, tabela por período, gráfico de barras, rankings, CSV e impressão.
import { api } from './api.js';
import { podeUsuario } from './estado.js';
import { h, anexar, limpar, icone, selecao, entrada, campo, buscador, moeda, quantidade, hoje, data, mensagem, processando } from './util.js';

const AGRUPAMENTOS = [['dia', 'Dia'], ['semana', 'Semana'], ['quinzena', 'Quinzena'], ['mes', 'Mês'], ['trimestre', 'Trimestre'],
  ['semestre', 'Semestre'], ['ano', 'Ano']];
const STATUS = [['', 'Todos, exceto cancelados'], ['todos', 'Todos, inclusive cancelados'], ['Recebido', 'Recebido'],
  ['Aprovado', 'Aprovado'], ['Faturado', 'Faturado'], ['Cancelado', 'Cancelado']];

export async function render(main) {
  const gestao = podeUsuario('relatorios_todos');
  const vendedores = gestao ? await api.get('/api/vendedores') : [];
  const fDe = entrada('de', `${hoje().slice(0, 4)}-01-01`, { type: 'date' });
  const fAte = entrada('ate', hoje(), { type: 'date' });
  const fVend = gestao ? selecao('vendedor', [['', 'Todos'], ...vendedores.map((v) => [v.id, v.nome])], '') : null;
  const fProduto = buscador({ nome: 'produto', endpoint: '/api/produtos', rotulo: 'Produto (opcional)',
    formatar: (p) => `${p.codigo} – ${p.descricao}`, extra: { ativo: '' } });
  fProduto.texto.placeholder = 'Todos os produtos';
  const fStatus = selecao('status', STATUS, '');
  const fAgrupar = selecao('agrupar', AGRUPAMENTOS, 'mes');
  const resultado = h('div');
  const btnGerar = h('button', { type: 'submit', class: 'btn primario' }, 'Gerar relatório');
  const form = h('form', { class: 'painel nao-imprimir', novalidate: true },
    h('div', { class: 'filtros' },
      campo('De', fDe), campo('Até', fAte), fVend ? campo('Vendedor', fVend) : null, fProduto,
      campo('Situação', fStatus), campo('Agrupar por', fAgrupar),
      h('div', { class: 'botoes' }, btnGerar)));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); gerar(); });
  [fAgrupar, fStatus, fVend].forEach((f) => f?.addEventListener('change', gerar));

  anexar(main, [h('div', { class: 'cabecalho-pagina' }, h('h1', 'Relatórios de vendas')), form, resultado]);

  async function gerar() {
    const filtros = { de: fDe.value, ate: fAte.value, vendedor: fVend?.value || '', produto: fProduto.oculto.value,
      status: fStatus.value, agrupar: fAgrupar.value };
    try {
      const r = await processando(btnGerar, () => api.get('/api/relatorios/vendas', filtros));
      const nomes = {
        vendedor: fVend && filtros.vendedor ? fVend.selectedOptions[0].textContent : 'Todos',
        status: fStatus.selectedOptions[0].textContent,
        agrupar: fAgrupar.selectedOptions[0].textContent,
      };
      mostrar(resultado, r, nomes, gestao);
    } catch (e) {
      limpar(resultado, mensagem('erro', e.message));
    }
  }
  gerar();
}

function mostrar(el, r, nomes, gestao) {
  const comProduto = Boolean(r.filtros.produto);
  const un = r.filtros.produtoNome?.unidade || '';
  const t = r.totais;
  const descricaoFiltros = `Período: ${data(r.filtros.de)} a ${data(r.filtros.ate)} · Vendedor: ${nomes.vendedor} · ` +
    `Produto: ${r.filtros.produtoNome?.n || 'Todos'} · Situação: ${nomes.status} · Agrupado por: ${nomes.agrupar}`;

  const colunasPeriodo = [
    ['Período', (p) => p.rotulo],
    ['Nº de vendas', (p) => p.vendas, 'num'],
    ['Valor total', (p) => moeda(p.valor), 'num'],
    ['Ticket médio', (p) => moeda(p.ticket), 'num'],
    comProduto ? [`Quantidade (${un})`, (p) => quantidade(p.quantidade), 'num'] : null,
  ].filter(Boolean);

  const tabelaSimples = (cols, linhas, rodape) => h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela cartoes' },
    h('thead', h('tr', cols.map(([tt, , c]) => h('th', { class: c, scope: 'col' }, tt)))),
    h('tbody', linhas.map((l) => h('tr', cols.map(([tt, f, c], i) => h('td', { class: [c, i === 0 && 'principal'], 'data-label': tt }, f(l)))))),
    rodape ? h('tfoot', h('tr', cols.map(([tt, , c], i) => h('td', { class: c, 'data-label': tt }, rodape[i])))) : null));

  const rodapePeriodo = ['Total', t.vendas, moeda(t.valor), moeda(t.ticket), comProduto ? quantidade(t.quantidade) : null].filter((x) => x !== null);

  limpar(el,
    h('div', { class: 'so-impressao' }, h('h2', 'Relatório de vendas – AGRO S')),
    h('p', { class: 'suave' }, descricaoFiltros),
    h('div', { class: 'cartoes-resumo' },
      cartao('Nº de vendas', String(t.vendas)),
      cartao('Valor total', moeda(t.valor)),
      cartao('Ticket médio', moeda(t.ticket)),
      comProduto ? cartao('Quantidade vendida', `${quantidade(t.quantidade)} ${un}`) : null),
    h('div', { class: 'botoes nao-imprimir' },
      h('button', { type: 'button', class: 'btn', onClick: () => exportarCsv(r, nomes, descricaoFiltros, colunasPeriodo, gestao) }, icone('baixar'), 'Exportar CSV'),
      h('button', { type: 'button', class: 'btn', onClick: () => window.print() }, icone('imprimir'), 'Imprimir')),
    h('section', { class: 'painel' }, h('h2', 'Vendas por período'),
      r.periodos.length ? [grafico(r.periodos), tabelaSimples(colunasPeriodo, r.periodos, rodapePeriodo)]
        : h('div', { class: 'vazio' }, 'Nenhuma venda no período.')),
    gestao ? h('section', { class: 'painel' }, h('h2', 'Ranking por vendedor'),
      r.porVendedor.length ? tabelaSimples([
        ['Vendedor', (v) => v.nome], ['Nº de vendas', (v) => v.vendas, 'num'], ['Valor total', (v) => moeda(v.valor), 'num'],
        ['Ticket médio', (v) => moeda(v.ticket), 'num']], r.porVendedor) : h('div', { class: 'vazio' }, 'Sem dados.')) : null,
    h('section', { class: 'painel' }, h('h2', 'Ranking por produto'),
      h('p', { class: 'suave' }, 'Valores dos itens, antes de descontos e frete do pedido.'),
      r.porProduto.length ? tabelaSimples([
        ['Produto', (p) => p.nome], ['Quantidade', (p) => `${quantidade(p.quantidade)} ${p.unidade}`, 'num'],
        ['Nº de pedidos', (p) => p.vendas, 'num'], ['Valor', (p) => moeda(p.valor), 'num']], r.porProduto) : h('div', { class: 'vazio' }, 'Sem dados.')));
}

function cartao(rotulo, valor) {
  return h('div', { class: 'cartao-resumo' }, h('div', { class: 'rotulo' }, rotulo), h('div', { class: 'valor' }, valor));
}

// Rótulo curto para o eixo do gráfico (ex.: "jan/26", "1ª jan/26", "2º tri/26").
function rotuloCurto(r) {
  const curto = (t) => t.replace(/([a-zç]{3})[a-zç]*\/\d{2}(\d{2})/, '$1/$2');
  if (/^\d{2}\/\d{2}\/\d{4}/.test(r)) return r.slice(0, 5);
  if (r.includes('quinzena')) return curto(r.replace(' quinzena de ', ' '));
  if (r.includes('trimestre')) return r.replace(/ trimestre de \d{2}(\d{2})/, ' tri/$1');
  if (r.includes('semestre')) return r.replace(/ semestre de \d{2}(\d{2})/, ' sem/$1');
  return curto(r);
}

// Gráfico de barras simples em SVG.
function grafico(periodos) {
  const n = periodos.length;
  const esq = 72;
  const larg = Math.max(640, esq + n * 34 + 20);
  const largBarra = Math.min(90, (larg - esq - 20) / n);
  const girar = n > 12;
  const base = 200;
  const alt = base + (girar ? 50 : 26);
  const max = Math.max(...periodos.map((p) => p.valor), 1);
  const passo = escalaBonita(max);
  const topo = Math.ceil(max / passo) * passo;
  const y = (v) => base - (v / topo) * (base - 16);
  const svg = h('svg', { viewBox: `0 0 ${larg} ${alt}`, width: larg, height: alt, role: 'img', 'aria-label': 'Gráfico de vendas por período' });
  for (let v = 0; v <= topo; v += passo) {
    svg.append(h('line', { x1: esq, x2: larg - 10, y1: y(v), y2: y(v), class: 'eixo' }),
      h('text', { x: esq - 6, y: y(v) + 4, 'text-anchor': 'end' }, abreviar(v)));
  }
  const folga = Math.min(12, largBarra * 0.2);
  periodos.forEach((p, i) => {
    const x = esq + i * largBarra + folga / 2;
    const lb = largBarra - folga;
    svg.append(h('rect', { x, y: y(p.valor), width: lb, height: Math.max(base - y(p.valor), p.valor ? 1 : 0), class: 'barra', rx: 3 },
      h('title', `${p.rotulo}: ${moeda(p.valor)} (${p.vendas} venda(s))`)));
    const cx = x + lb / 2;
    svg.append(h('text', girar
      ? { x: cx, y: base + 12, 'text-anchor': 'end', transform: `rotate(-45 ${cx} ${base + 12})` }
      : { x: cx, y: base + 16, 'text-anchor': 'middle' }, rotuloCurto(p.rotulo)));
  });
  return h('div', { class: 'grafico' }, svg);
}

function escalaBonita(max) {
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= bruto);
}

function abreviar(centavos) {
  const v = centavos / 100;
  if (v >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${v.toLocaleString('pt-BR')}`;
}

// CSV em UTF-8 com BOM e separador ponto e vírgula (abre direto no Excel).
function exportarCsv(r, nomes, descricao, colunasPeriodo, gestao) {
  const num = (c) => (c / 100).toFixed(2).replace('.', ',');
  const qtd = (q) => String(q).replace('.', ',');
  const cel = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const comProduto = Boolean(r.filtros.produto);
  const linhas = [['Relatório de vendas – AGRO S'], [descricao], [],
    ['Período', 'Nº de vendas', 'Valor total (R$)', 'Ticket médio (R$)', ...(comProduto ? ['Quantidade'] : [])],
    ...r.periodos.map((p) => [p.rotulo, p.vendas, num(p.valor), num(p.ticket), ...(comProduto ? [qtd(p.quantidade)] : [])]),
    ['Total', r.totais.vendas, num(r.totais.valor), num(r.totais.ticket), ...(comProduto ? [qtd(r.totais.quantidade)] : [])],
    []];
  if (gestao) {
    linhas.push(['Ranking por vendedor'], ['Vendedor', 'Nº de vendas', 'Valor total (R$)', 'Ticket médio (R$)'],
      ...r.porVendedor.map((v) => [v.nome, v.vendas, num(v.valor), num(v.ticket)]), []);
  }
  linhas.push(['Ranking por produto'], ['Produto', 'Unidade', 'Quantidade', 'Nº de pedidos', 'Valor (R$)'],
    ...r.porProduto.map((p) => [p.nome, p.unidade, qtd(p.quantidade), p.vendas, num(p.valor)]));
  const csv = `﻿${linhas.map((l) => l.map(cel).join(';')).join('\r\n')}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: `relatorio-vendas-${r.filtros.de}-a-${r.filtros.ate}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
