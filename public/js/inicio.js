import { h } from './util.js';
import { estado } from './estado.js';

export async function render(main) {
  main.append(h('div', { class: 'cabecalho-pagina' }, h('h1', `Olá, ${estado.sessao.nome.split(' ')[0]}!`)),
    h('div', { class: 'painel' }, h('p', 'Bem-vindo ao AGRO S – Controle Interno.')));
}
