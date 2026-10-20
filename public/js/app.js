import { api } from './api.js';
import { estado, podeUsuario } from './estado.js';
import { h, limpar, icone, aviso } from './util.js';
import { telaLogin, telaPrimeiroAcesso, telaTrocarSenhaObrigatoria, abrirAlterarSenha } from './acesso.js';

// Módulos do menu. "perm" corresponde às permissões do servidor (lib/permissoes.js).
const MODULOS = [
  { id: 'inicio', titulo: 'Início', perm: 'inicio', carregar: () => import('./inicio.js') },
  { id: 'pedidos', titulo: 'Pedidos', perm: 'pedidos', carregar: () => import('./pedidos.js') },
  { id: 'clientes', titulo: 'Clientes', perm: 'clientes_ver', carregar: () => import('./clientes.js') },
  { id: 'produtos', titulo: 'Produtos', perm: 'produtos_ver', carregar: () => import('./produtos.js') },
  { id: 'colaboradores', titulo: 'Colaboradores', perm: 'colaboradores', carregar: () => import('./colaboradores.js') },
  { id: 'configuracoes', titulo: 'Configurações', perm: 'configuracoes', carregar: () => import('./configuracoes.js') },
];

const app = document.getElementById('app');

export async function iniciar() {
  let s;
  try {
    s = await api.get('/api/sessao');
  } catch (e) {
    limpar(app, h('div', { class: 'acesso' }, h('div', { class: 'cartao' }, h('p', e.message),
      h('button', { class: 'btn primario', onClick: iniciar }, 'Tentar novamente'))));
    return;
  }
  estado.sessao = s.usuario;
  estado.empresa = s.empresa;
  if (s.primeiroAcesso) return telaPrimeiroAcesso(app, iniciar);
  if (!s.usuario) return telaLogin(app, iniciar);
  if (s.usuario.trocarSenha) return telaTrocarSenhaObrigatoria(app, iniciar);
  montarShell();
}

let shell = null;

function montarShell() {
  const u = estado.sessao;
  const menu = h('aside', { class: 'menu', id: 'menu-principal', 'aria-label': 'Menu principal' });
  const fundo = h('div', { class: 'fundo-menu' });
  const btnMenu = h('button', { class: 'btn btn-menu pequeno', 'aria-label': 'Abrir menu', 'aria-controls': 'menu-principal', 'aria-expanded': 'false' }, icone('menu'));
  const titulo = h('div', { class: 'titulo' });
  const main = h('main', { id: 'conteudo', tabindex: '-1' });

  const abrirMenu = (abrir) => {
    menu.classList.toggle('aberto', abrir);
    fundo.classList.toggle('aberto', abrir);
    btnMenu.setAttribute('aria-expanded', String(abrir));
    if (abrir) menu.querySelector('a')?.focus();
  };
  btnMenu.addEventListener('click', () => abrirMenu(!menu.classList.contains('aberto')));
  fundo.addEventListener('click', () => abrirMenu(false));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && menu.classList.contains('aberto')) abrirMenu(false); });

  const visiveis = MODULOS.filter((m) => podeUsuario(m.perm));
  const links = visiveis.map((m) => h('a', { href: `#/${m.id}`, dataset: { id: m.id }, onClick: () => abrirMenu(false) }, icone(m.id), m.titulo));
  limpar(menu, h('nav', links));

  // Menu do usuário
  const lista = h('div', { class: 'lista oculto', role: 'menu' },
    h('div', { class: 'quem' }, h('strong', u.nome), h('br'), u.email),
    h('button', { class: 'btn', role: 'menuitem', onClick: () => { fecharUsuario(); abrirAlterarSenha(); } }, icone('chave'), 'Alterar minha senha'),
    h('button', { class: 'btn', role: 'menuitem', onClick: sair }, icone('sair'), 'Sair'));
  const btnUsuario = h('button', { class: 'btn pequeno', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    icone('usuario'), h('span', { class: 'nome-usuario' }, u.nome.split(' ')[0]));
  const fecharUsuario = () => { lista.classList.add('oculto'); btnUsuario.setAttribute('aria-expanded', 'false'); };
  btnUsuario.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const abrir = lista.classList.contains('oculto');
    lista.classList.toggle('oculto', !abrir);
    btnUsuario.setAttribute('aria-expanded', String(abrir));
  });
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.usuario-menu')) fecharUsuario(); });

  const topo = h('header', { class: 'topo' }, btnMenu,
    h('a', { href: '#/inicio', 'aria-label': 'Início' }, h('img', { class: 'logo', src: estado.empresa.logo, alt: 'AGRO S' })),
    titulo, h('div', { class: 'usuario-menu' }, btnUsuario, lista));

  limpar(app, topo, h('div', { class: 'corpo' }, menu, fundo, main));
  shell = { main, titulo, links, visiveis };
  rotear();
}

async function sair() {
  try { await api.post('/api/logout'); } catch { /* ignora */ }
  shell = null;
  location.hash = '';
  iniciar();
}

let rotaAtual = 0;

export async function rotear() {
  if (!shell) return;
  const [id, ...resto] = location.hash.replace(/^#\/?/, '').split('/');
  const mod = shell.visiveis.find((m) => m.id === id) || shell.visiveis[0];
  if (mod.id !== id) { history.replaceState(null, '', `#/${mod.id}`); }
  shell.links.forEach((a) => { if (a.dataset.id === mod.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  shell.titulo.textContent = mod.titulo;
  document.title = `${mod.titulo} – AGRO S`;
  const minha = ++rotaAtual;
  limpar(shell.main, h('p', { class: 'carregando' }, 'Carregando…'));
  try {
    const m = await mod.carregar();
    if (minha !== rotaAtual) return;
    limpar(shell.main);
    await m.render(shell.main, { params: resto.map(decodeURIComponent) });
  } catch (e) {
    if (minha === rotaAtual) limpar(shell.main, h('div', { class: 'msg erro' }, e.message || 'Erro ao carregar a página.'));
  }
}

window.addEventListener('hashchange', rotear);
window.addEventListener('sessao-expirada', () => {
  if (!shell) return;
  shell = null;
  aviso('Sua sessão expirou. Entre novamente.', 'erro');
  iniciar();
});

iniciar();
