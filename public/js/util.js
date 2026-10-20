// Utilidades de interface: criação de elementos, formatação, diálogos e avisos.
import { api } from './api.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'rect', 'line', 'text', 'g', 'circle', 'polyline', 'title']);
const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'required', 'readOnly', 'multiple', 'hidden', 'indeterminate']);

function ehAtributos(a) {
  return a && typeof a === 'object' && !Array.isArray(a) && !(a instanceof Node);
}

// h('div', { class: 'x', onClick: fn }, 'texto', filho, [lista])
export function h(tag, attrs, ...filhos) {
  if (!ehAtributos(attrs)) { filhos.unshift(attrs); attrs = {}; }
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  anexar(el, filhos);
  return el;
}

export function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

export function limpar(el, ...filhos) {
  el.replaceChildren();
  return anexar(el, filhos);
}

// Ícones simples (traços SVG).
const ICONES = {
  inicio: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  pedidos: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4',
  clientes: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M17 11a3 3 0 100-6M22 21v-1a5 5 0 00-4-4.9',
  produtos: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  relatorios: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  notas: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  duplicatas: 'M3 6h18v12H3zM3 10h18M7 15h4',
  contratos: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17l2-1 2 1 2-1',
  colaboradores: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a8 8 0 0116 0v1',
  configuracoes: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12a7 7 0 00.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0019 12z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  usuario: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a8 8 0 0116 0v1',
  sair: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  chave: 'M15 7a4 4 0 11-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0115 7z',
  mais: 'M12 5v14M5 12h14',
  imprimir: 'M6 9V3h12v6M6 18H3v-7h18v7h-3M6 14h12v7H6z',
  whatsapp: 'M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1.1zM9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z',
  copiar: 'M9 9h11v11H9zM5 15H4V4h11v1',
  baixar: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  fechar: 'M6 6l12 12M18 6L6 18',
};

export function icone(nome) {
  return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, h('path', { d: ICONES[nome] || '' }));
}

// Formatação ---------------------------------------------------------------
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export const moeda = (centavos) => fmtBRL.format((Number(centavos) || 0) / 100);
export const decimal = (centavos) => fmtNum.format((Number(centavos) || 0) / 100);
export const quantidade = (q) => fmtQtd.format(Number(q) || 0);

export function data(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

export function dataHora(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z'));
  return isNaN(d) ? String(iso) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function hoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function somarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

// "1.234,56" -> 123456 (centavos); aceita também "1234.56".
export function paraCentavos(texto) {
  let s = String(texto ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function paraNumero(texto) {
  let s = String(texto ?? '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Avisos rápidos ------------------------------------------------------------
export function aviso(texto, tipo = 'ok') {
  // Com uma janela aberta, o aviso vai dentro dela (senão ficaria atrás do fundo escuro).
  const janela = [...document.querySelectorAll('dialog[open]')].pop();
  let caixa = document.getElementById('avisos');
  if (janela) {
    caixa = janela.querySelector(':scope > .avisos') || h('div', { class: 'avisos', role: 'status', 'aria-live': 'polite' });
    janela.append(caixa);
  }
  const el = h('div', { class: ['aviso', tipo === 'erro' && 'erro'] }, texto);
  caixa.append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 6000 : 3500);
}

export function mensagem(tipo, ...conteudo) {
  return h('div', { class: ['msg', tipo], role: tipo === 'erro' ? 'alert' : 'status' }, ...conteudo);
}

// Formulários --------------------------------------------------------------
let contadorId = 0;

// campo('Nome', h('input', {name: 'nome'}), { obrigatorio: true, dica: '...' , classe: 'largo' })
export function campo(rotulo, controle, opcoes = {}) {
  const id = controle.id || `c${++contadorId}`;
  controle.id = id;
  if (opcoes.obrigatorio) controle.required = true;
  const erro = h('small', { class: 'erro', id: `${id}-erro`, 'aria-live': 'polite' });
  controle.setAttribute('aria-describedby', erro.id);
  return h('label', { class: ['campo', opcoes.classe], for: id },
    h('span', { class: opcoes.obrigatorio ? 'obrig' : null }, rotulo),
    controle,
    opcoes.dica ? h('small', { class: 'dica' }, opcoes.dica) : null,
    erro);
}

export function entrada(nome, valor = '', attrs = {}) {
  return h('input', { name: nome, value: valor ?? '', autocomplete: 'off', ...attrs });
}

export function selecao(nome, opcoes, valor = '', attrs = {}) {
  return h('select', { name: nome, ...attrs },
    opcoes.map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: String(v) === String(valor ?? '') }, t);
    }));
}

export function lerFormulario(form) {
  const dados = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') dados[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) dados[el.name] = el.value; }
    else dados[el.name] = el.value;
  }
  return dados;
}

export function marcarErro(form, nome, texto) {
  const el = form.elements[nome];
  if (!el) return;
  el.setAttribute('aria-invalid', texto ? 'true' : 'false');
  const s = document.getElementById(`${el.id}-erro`);
  if (s) s.textContent = texto || '';
}

export function limparErros(form) {
  for (const el of form.elements) {
    if (el.getAttribute?.('aria-invalid')) el.setAttribute('aria-invalid', 'false');
  }
  form.querySelectorAll('small.erro').forEach((s) => { s.textContent = ''; });
}

// Executa a ação de um botão de envio mostrando "Aguarde..." e tratando erro.
export async function processando(botao, acao) {
  const original = botao?.textContent;
  if (botao) { botao.disabled = true; botao.textContent = 'Aguarde…'; }
  try {
    return await acao();
  } catch (e) {
    aviso(e.message, 'erro');
    throw e;
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = original; }
  }
}

// Diálogos -----------------------------------------------------------------
// abrirJanela({ titulo, conteudo, botoes, tamanho, aoEnviar }) → { dialog, fechar, corpo, form }
export function abrirJanela({ titulo, conteudo, botoes = [], tamanho = '', aoEnviar, aoFechar }) {
  const btnFechar = h('button', { type: 'button', class: 'btn pequeno', 'aria-label': 'Fechar' }, icone('fechar'));
  const corpo = h('div', { class: 'janela-corpo' }, conteudo);
  const rodape = h('div', { class: 'janela-rodape' }, botoes);
  const interno = aoEnviar
    ? h('form', { method: 'dialog', novalidate: true }, h('div', { class: 'janela-topo' }, h('h2', titulo), btnFechar), corpo, rodape)
    : h('div', { class: 'janela-conteudo' }, h('div', { class: 'janela-topo' }, h('h2', titulo), btnFechar), corpo, rodape);
  const dialog = h('dialog', { class: ['janela', tamanho], 'aria-label': titulo }, interno);
  const fechar = () => { dialog.close(); };
  dialog.addEventListener('close', () => { dialog.remove(); aoFechar?.(); });
  btnFechar.addEventListener('click', fechar);
  if (aoEnviar) {
    interno.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const botao = ev.submitter || interno.querySelector('button[type=submit]');
      limparErros(interno);
      try {
        await processando(botao, () => aoEnviar(lerFormulario(interno), { form: interno, fechar, botao }));
      } catch { /* erro já exibido */ }
    });
  }
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, fechar, corpo, form: aoEnviar ? interno : null, rodape };
}

export function confirmar(texto, { titulo = 'Confirmar', sim = 'Confirmar', perigo = false } = {}) {
  return new Promise((resolve) => {
    let resposta = false;
    const btnSim = h('button', { type: 'button', class: ['btn', perigo ? 'perigo' : 'primario'] }, sim);
    const btnNao = h('button', { type: 'button', class: 'btn' }, 'Voltar');
    const j = abrirJanela({ titulo, conteudo: h('p', texto), botoes: [btnNao, btnSim], tamanho: 'estreita',
      aoFechar: () => resolve(resposta) });
    btnSim.addEventListener('click', () => { resposta = true; j.fechar(); });
    btnNao.addEventListener('click', () => j.fechar());
  });
}

// Imprime apenas o conteúdo de uma janela aberta.
export function imprimirJanela() {
  document.body.classList.add('imprimindo-janela');
  const fim = () => { document.body.classList.remove('imprimindo-janela'); window.removeEventListener('afterprint', fim); };
  window.addEventListener('afterprint', fim);
  window.print();
}

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const ta = h('textarea', { readOnly: true }, texto);
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  aviso('Copiado para a área de transferência.');
}

// Tabela responsiva --------------------------------------------------------
// colunas: [{ titulo, valor: (linha) => conteúdo, classe, principal }]
export function tabela(colunas, linhas, { aoClicar, vazio = 'Nenhum registro encontrado.', rodape } = {}) {
  if (!linhas.length) return h('div', { class: 'vazio' }, vazio);
  const thead = h('thead', h('tr', colunas.map((c) => h('th', { class: c.classe, scope: 'col' }, c.titulo))));
  const tbody = h('tbody', linhas.map((l) => {
    const tr = h('tr', { class: aoClicar ? 'clicavel' : null },
      colunas.map((c) => h('td', { class: [c.classe, c.principal && 'principal'], 'data-label': c.titulo }, c.valor(l))));
    if (aoClicar) {
      tr.tabIndex = 0;
      tr.addEventListener('click', (ev) => { if (!ev.target.closest('button, a, input')) aoClicar(l); });
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target === tr) aoClicar(l); });
    }
    return tr;
  }));
  const tfoot = rodape ? h('tfoot', h('tr', colunas.map((c, i) => h('td', { class: c.classe, 'data-label': c.titulo }, rodape(c, i))))) : null;
  return h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela cartoes' }, thead, tbody, tfoot));
}

export function paginacao({ pagina, total, porPagina, aoMudar }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return h('p', { class: 'suave centro' }, `${total} registro(s)`);
  return h('nav', { class: 'paginacao', 'aria-label': 'Paginação' },
    h('button', { type: 'button', class: 'btn pequeno', disabled: pagina <= 1, onClick: () => aoMudar(pagina - 1) }, '‹ Anterior'),
    h('span', `Página ${pagina} de ${paginas} (${total} registros)`),
    h('button', { type: 'button', class: 'btn pequeno', disabled: pagina >= paginas, onClick: () => aoMudar(pagina + 1) }, 'Próxima ›'));
}

export function etiqueta(texto, cor) {
  return h('span', { class: ['etiqueta', cor] }, texto);
}

// Aplica máscara de CPF/CNPJ enquanto digita.
export function mascaraCpfCnpj(input, { soCpf = false } = {}) {
  input.inputMode = 'numeric';
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').slice(0, soCpf ? 11 : 14);
    let v = d;
    if (d.length <= 11) {
      v = d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
    } else {
      v = d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
    }
    input.value = v;
  });
  return input;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Campo de busca com lista de sugestões (cliente, produto...).
// buscador({ nome, endpoint, rotulo, inicial: { id, texto }, formatar: (l) => texto, detalhe: (l) => texto, aoEscolher })
export function buscador({ nome, endpoint, rotulo, inicial, formatar, detalhe, aoEscolher, obrigatorio, classe, extra = {} }) {
  const oculto = h('input', { type: 'hidden', name: nome, value: inicial?.id ?? '' });
  const texto = h('input', { type: 'search', value: inicial?.texto ?? '', autocomplete: 'off', placeholder: 'Digite para buscar…',
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false' });
  const lista = h('ul', { class: 'sugestoes oculto', role: 'listbox' });
  texto.setAttribute('aria-controls', lista.id = `l${Math.random().toString(36).slice(2)}`);
  let itens = [];
  let ativo = -1;
  let ultimo = 0;

  const fechar = () => { lista.classList.add('oculto'); texto.setAttribute('aria-expanded', 'false'); ativo = -1; };
  const escolher = (l) => {
    oculto.value = l.id;
    texto.value = formatar(l);
    texto.setAttribute('aria-invalid', 'false');
    fechar();
    aoEscolher?.(l);
  };
  const destacar = (i) => {
    ativo = i;
    [...lista.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    lista.children[i]?.scrollIntoView({ block: 'nearest' });
  };
  const buscar = debounce(async () => {
    const minha = ++ultimo;
    try {
      const r = await api.get(endpoint, { busca: texto.value, ativo: '1', porPagina: 12, ...extra });
      if (minha !== ultimo) return;
      itens = r.linhas;
      limpar(lista, itens.length ? itens.map((l, i) => {
        const li = h('li', { role: 'option', 'aria-selected': 'false' }, h('strong', formatar(l)), detalhe ? h('small', detalhe(l)) : null);
        li.addEventListener('mousedown', (ev) => { ev.preventDefault(); escolher(l); });
        li.addEventListener('mouseenter', () => destacar(i));
        return li;
      }) : h('li', { class: 'nada' }, 'Nada encontrado.'));
      lista.classList.remove('oculto');
      texto.setAttribute('aria-expanded', 'true');
      ativo = -1;
    } catch (e) { aviso(e.message, 'erro'); }
  }, 250);
  texto.addEventListener('input', () => { oculto.value = ''; buscar(); });
  texto.addEventListener('focus', () => { if (!oculto.value) buscar(); });
  texto.addEventListener('blur', () => setTimeout(fechar, 100));
  texto.addEventListener('keydown', (ev) => {
    if (lista.classList.contains('oculto')) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); destacar(Math.min(ativo + 1, itens.length - 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); destacar(Math.max(ativo - 1, 0)); }
    else if (ev.key === 'Enter' && ativo >= 0) { ev.preventDefault(); escolher(itens[ativo]); }
    else if (ev.key === 'Escape') fechar();
  });
  const el = campo(rotulo, texto, { obrigatorio, classe: ['buscador', classe].filter(Boolean).join(' ') });
  el.append(oculto, lista);
  el.oculto = oculto;
  el.texto = texto;
  return el;
}
