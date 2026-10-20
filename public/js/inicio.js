import { api } from './api.js';
import { estado, podeUsuario } from './estado.js';
import { h, anexar, moeda, icone } from './util.js';

function cartao(rotulo, n, valor, href, tipo) {
  return h('a', { class: ['cartao-resumo', n > 0 && tipo], href },
    h('div', { class: 'rotulo' }, rotulo),
    h('div', { class: 'valor' }, String(n)),
    h('div', { class: 'detalhe' }, moeda(valor)));
}

export async function render(main) {
  const r = await api.get('/api/inicio');
  const vendedor = !podeUsuario('pedidos_todos');
  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  anexar(main, [
    h('div', { class: 'cabecalho-pagina' }, h('h1', `Olá, ${estado.sessao.nome.split(' ')[0]}!`),
      h('a', { class: 'btn primario', href: '#/pedidos/novo' }, icone('mais'), 'Novo pedido')),
    h('div', { class: 'cartoes-resumo' },
      h('a', { class: 'cartao-resumo', href: '#/relatorios' },
        h('div', { class: 'rotulo' }, `${vendedor ? 'Minhas vendas' : 'Vendas'} de ${mes}`),
        h('div', { class: 'valor' }, moeda(r.vendasMes.valor)),
        h('div', { class: 'detalhe' }, `${r.vendasMes.n} pedido(s), sem cancelados`)),
      cartao('Pedidos aguardando aprovação', r.aguardandoAprovacao.n, r.aguardandoAprovacao.valor, '#/pedidos', 'alerta'),
      cartao('Pedidos aprovados sem nota fiscal', r.aprovadosSemNota.n, r.aprovadosSemNota.valor,
        podeUsuario('notas') ? '#/notas' : '#/pedidos', 'alerta'),
      r.duplicatas ? cartao('Duplicatas vencidas', r.duplicatas.vencidas.n, r.duplicatas.vencidas.valor, '#/duplicatas/vencidas', 'perigo') : null,
      r.duplicatas ? cartao('Duplicatas a vencer em 7 dias', r.duplicatas.aVencer.n, r.duplicatas.aVencer.valor, '#/duplicatas/avencer', 'alerta') : null),
  ]);
}
