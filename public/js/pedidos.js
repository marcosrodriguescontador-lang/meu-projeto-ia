// Pedidos de venda: lista, cadastro (pensado para o vendedor em campo), visualização,
// aprovação/cancelamento, impressão e resumo por WhatsApp.
import { api } from './api.js';
import { estado, podeUsuario } from './estado.js';
import { h, anexar, limpar, icone, tabela, paginacao, abrirJanela, aviso, confirmar, debounce, selecao, entrada, campo,
  moeda, decimal, quantidade, data, hoje, paraCentavos, paraNumero, etiqueta, buscador, marcarErro, imprimirJanela,
  mensagem } from './util.js';
import { obterEmpresa, cabecalhoDocumento, enderecoTexto, info } from './documentos.js';
import { interpretarCondicao, dividirValor, descreverCondicao, TIPOS_CONDICAO } from '/lib/parcelas.js';
import { formatarCpfCnpj } from '/lib/validacao.js';

const COR_STATUS = { Recebido: 'amarela', Aprovado: 'azul', Faturado: 'verde', Cancelado: 'vermelha' };
export const etiquetaStatus = (s) => etiqueta(s, COR_STATUS[s]);

let opcoes = null;
async function obterOpcoes() {
  if (!opcoes) {
    opcoes = await api.get('/api/pedidos/opcoes');
    opcoes.vendedores = await api.get('/api/vendedores');
  }
  return opcoes;
}

export async function render(main, { params }) {
  const op = await obterOpcoes();
  const gestao = podeUsuario('pedidos_todos');
  const st = { pagina: 1, status: '', vendedor: '', de: '', ate: '', busca: '' };
  const lista = h('div');

  const fStatus = selecao('status', [['', 'Todas'], ...op.status], '', { 'aria-label': 'Situação' });
  const fVend = gestao ? selecao('vendedor', [['', 'Todos'], ...op.vendedores.map((v) => [v.id, v.nome])], '') : null;
  const fDe = entrada('de', '', { type: 'date' });
  const fAte = entrada('ate', '', { type: 'date' });
  const fBusca = entrada('busca', '', { type: 'search', placeholder: 'Cliente ou nº do pedido' });
  const atualizar = () => {
    Object.assign(st, { pagina: 1, status: fStatus.value, vendedor: fVend?.value || '', de: fDe.value, ate: fAte.value, busca: fBusca.value });
    carregar();
  };
  [fStatus, fVend, fDe, fAte].forEach((f) => f?.addEventListener('change', atualizar));
  fBusca.addEventListener('input', debounce(atualizar));

  anexar(main, [
    h('div', { class: 'cabecalho-pagina' }, h('h1', 'Pedidos de venda'),
      h('button', { class: 'btn primario', onClick: () => abrirFormulario(null, carregar) }, icone('mais'), 'Novo pedido')),
    h('div', { class: 'painel' },
      h('div', { class: 'filtros' },
        h('label', { class: 'campo busca' }, h('span', 'Buscar'), fBusca),
        h('label', { class: 'campo' }, h('span', 'Situação'), fStatus),
        fVend ? h('label', { class: 'campo' }, h('span', 'Vendedor'), fVend) : null,
        h('label', { class: 'campo' }, h('span', 'De'), fDe),
        h('label', { class: 'campo' }, h('span', 'Até'), fAte)),
      lista),
    h('button', { class: 'btn vivo fab', onClick: () => abrirFormulario(null, carregar) }, icone('mais'), 'Novo pedido'),
  ]);

  async function carregar() {
    try {
      const r = await api.get('/api/pedidos', st);
      limpar(lista,
        tabela([
          { titulo: 'Nº', valor: (l) => `#${l.id}`, classe: 'nowrap' },
          { titulo: 'Cliente', valor: (l) => l.cliente_nome, principal: true },
          { titulo: 'Data', valor: (l) => data(l.data), classe: 'nowrap' },
          gestao ? { titulo: 'Vendedor', valor: (l) => l.vendedor_nome } : null,
          { titulo: 'Origem', valor: (l) => l.origem },
          { titulo: 'Total', valor: (l) => moeda(l.total), classe: 'num' },
          { titulo: 'Situação', valor: (l) => etiquetaStatus(l.status) },
        ].filter(Boolean), r.linhas, { aoClicar: (l) => abrirPedido(l.id, carregar), vazio: 'Nenhum pedido encontrado.' }),
        paginacao({ ...r, aoMudar: (p) => { st.pagina = p; carregar(); } }));
    } catch (e) {
      limpar(lista, mensagem('erro', e.message));
    }
  }
  await carregar();
  if (params[0] === 'novo') abrirFormulario(null, carregar);
  else if (Number(params[0])) abrirPedido(Number(params[0]), carregar);
}

// Formulário -------------------------------------------------------------
export async function abrirFormulario(pedido, depois) {
  const op = await obterOpcoes();
  const gestao = podeUsuario('pedidos_todos');
  const p = pedido || { data: hoje(), vendedor_id: estado.sessao.id, origem: 'Aplicativo', forma_pagamento: 'Boleto',
    condicao_tipo: 'dias', condicao_valor: '30', modalidade_frete: '9', itens: [] };

  const fData = entrada('data', p.data, { type: 'date', required: true });
  const fVendedor = gestao
    ? selecao('vendedor_id', op.vendedores.filter((v) => v.ativo || v.id === p.vendedor_id).map((v) => [v.id, v.nome]), p.vendedor_id)
    : entrada('vendedor_nome', estado.sessao.nome, { readOnly: true, disabled: true });
  const cliente = buscador({ nome: 'cliente_id', endpoint: '/api/clientes', rotulo: 'Cliente', obrigatorio: true, classe: 'duplo',
    inicial: p.cliente ? { id: p.cliente.id, texto: p.cliente.nome } : null,
    formatar: (c) => c.nome, detalhe: (c) => [formatarCpfCnpj(c.documento), c.municipio && `${c.municipio}/${c.uf}`].filter(Boolean).join(' · ') });

  // Itens
  const listaItens = h('div', { class: 'itens' });
  const linhas = [];
  const totais = h('div', { class: 'totais' });
  const previa = h('div', { class: 'parcelas-previa', 'aria-live': 'polite' });

  function novaLinha(it = {}) {
    const linha = { el: null };
    const unid = entrada('unidade', it.unidade || '', { maxlength: 6, 'aria-label': 'Unidade' });
    const qtd = entrada('quantidade', it.quantidade != null ? String(it.quantidade).replace('.', ',') : '1', { inputmode: 'decimal' });
    const preco = entrada('preco_unit', it.preco_unit != null ? decimal(it.preco_unit) : '', { inputmode: 'decimal', placeholder: '0,00' });
    const totalItem = h('div', { class: 'total-item', 'aria-live': 'polite' });
    const prod = buscador({ nome: 'produto_id', endpoint: '/api/produtos', rotulo: 'Produto', obrigatorio: true, classe: 'produto',
      inicial: it.produto_id ? { id: it.produto_id, texto: `${it.codigo ? `${it.codigo} – ` : ''}${it.descricao}` } : null,
      formatar: (x) => `${x.codigo} – ${x.descricao}`, detalhe: (x) => `${x.unidade} · ${moeda(x.preco)}`,
      aoEscolher: (x) => { unid.value = x.unidade; preco.value = decimal(x.preco); recalcular(); qtd.focus(); qtd.select(); } });
    const remover = h('button', { type: 'button', class: 'btn perigo pequeno', 'aria-label': 'Remover item', onClick: () => {
      linhas.splice(linhas.indexOf(linha), 1);
      linha.el.remove();
      recalcular();
    } }, icone('fechar'));
    [qtd, preco].forEach((i) => i.addEventListener('input', recalcular));
    Object.assign(linha, { prod, unid, qtd, preco, totalItem,
      el: h('div', { class: 'item-linha' }, prod, campo('Unid.', unid), campo('Quantidade', qtd), campo('Preço unit. (R$)', preco),
        h('div', h('span', { class: 'sr' }, 'Total do item'), totalItem), remover) });
    // Os campos de item não devem ser lidos como campos do formulário principal.
    linha.el.querySelectorAll('[name]').forEach((e) => { e.dataset.nome = e.name; e.removeAttribute('name'); });
    linhas.push(linha);
    listaItens.append(linha.el);
    return linha;
  }

  const fDesconto = entrada('desconto', p.desconto ? decimal(p.desconto) : '', { inputmode: 'decimal', placeholder: '0,00' });
  const fFrete = entrada('frete', p.frete ? decimal(p.frete) : '', { inputmode: 'decimal', placeholder: '0,00' });
  const fModal = selecao('modalidade_frete', Object.entries(op.modalidades), p.modalidade_frete);
  const fForma = selecao('forma_pagamento', op.formas, p.forma_pagamento);
  const fCondTipo = selecao('condicao_tipo', Object.entries(TIPOS_CONDICAO), p.condicao_tipo);
  const fCondValor = entrada('condicao_valor', p.condicao_valor, { maxlength: 500 });
  const campoCond = campo('Prazos / datas', fCondValor);
  const ajustarCond = () => {
    const t = fCondTipo.value;
    campoCond.classList.toggle('oculto', t === 'avista');
    fCondValor.placeholder = t === 'dias' ? 'Ex.: 30/60/90' : 'Ex.: 30/04/2027';
    campoCond.querySelector('span').textContent = t === 'dias' ? 'Prazos em dias' : 'Datas de vencimento (dd/mm/aaaa)';
    recalcular();
  };
  fCondTipo.addEventListener('change', () => { if (fCondTipo.value !== p.condicao_tipo) fCondValor.value = ''; ajustarCond(); });
  [fDesconto, fFrete, fCondValor, fData].forEach((i) => i.addEventListener('input', recalcular));

  function recalcular() {
    let subtotal = 0;
    for (const l of linhas) {
      const t = Math.round(paraNumero(l.qtd.value || 0) * paraCentavos(l.preco.value || 0));
      l.totalItem.textContent = Number.isFinite(t) ? moeda(t) : '—';
      if (Number.isFinite(t)) subtotal += t;
    }
    const desc = paraCentavos(fDesconto.value) || 0;
    const fr = paraCentavos(fFrete.value) || 0;
    const total = subtotal - desc + fr;
    limpar(totais,
      h('div', `Soma dos itens: ${moeda(subtotal)}`),
      desc ? h('div', `Desconto: − ${moeda(desc)}`) : null,
      fr ? h('div', `Frete: + ${moeda(fr)}`) : null,
      h('div', { class: 'grande' }, `Total: ${moeda(total)}`));
    const c = interpretarCondicao(fCondTipo.value, fCondValor.value, fData.value || hoje());
    if (c.erro) { limpar(previa, fCondValor.value ? c.erro : ''); return; }
    const vals = dividirValor(Math.max(total, 0), c.vencimentos.length);
    limpar(previa, 'Parcelas: ', c.vencimentos.map((v, i) => `${i + 1}/${c.vencimentos.length} ${v ? data(v) : 'à vista'} ${moeda(vals[i])}`).join(' · '));
  }

  const conteudo = h('div', {},
    h('fieldset', {}, h('legend', 'Dados do pedido'),
      h('div', { class: 'grade' },
        campo('Data', fData, { obrigatorio: true }),
        campo('Vendedor', fVendedor),
        cliente,
        campo('Origem', selecao('origem', op.origens, p.origem), { obrigatorio: true }))),
    h('fieldset', {}, h('legend', 'Itens'), listaItens,
      h('div', { class: 'botoes' }, h('button', { type: 'button', class: 'btn', onClick: () => { const l = novaLinha(); l.prod.texto.focus(); } }, icone('mais'), 'Adicionar item')),
      totais),
    h('fieldset', {}, h('legend', 'Pagamento e entrega'),
      h('div', { class: 'grade' },
        campo('Desconto (R$)', fDesconto),
        campo('Frete (R$)', fFrete),
        campo('Modalidade do frete', fModal),
        campo('Forma de pagamento', fForma, { obrigatorio: true }),
        campo('Condição de pagamento', fCondTipo, { obrigatorio: true }),
        campoCond,
        h('div', { class: 'largo' }, previa),
        campo('Data de entrega', entrada('data_entrega', p.data_entrega || '', { type: 'date' })),
        campo('Nº do receituário agronômico', entrada('receituario', p.receituario || '', { maxlength: 60 })),
        campo('Observações', h('textarea', { name: 'observacoes', maxlength: 2000, rows: 3 }, p.observacoes || ''), { classe: 'largo' }))));

  (p.itens.length ? p.itens : [{}]).forEach((it) => novaLinha(it));
  ajustarCond();

  const janela = abrirJanela({
    titulo: pedido ? `Editar pedido #${pedido.id}` : 'Novo pedido',
    tamanho: 'larga',
    conteudo,
    botoes: [h('button', { type: 'submit', class: 'btn primario' }, pedido ? 'Salvar alterações' : 'Registrar pedido')],
    aoEnviar: async (d, { form, fechar }) => {
      if (!d.cliente_id) { marcarErro(form, 'cliente_id', ''); cliente.texto.setAttribute('aria-invalid', 'true'); cliente.texto.focus(); throw new Error('Escolha o cliente na lista.'); }
      const itens = linhas.map((l) => ({ produto_id: l.prod.oculto.value, unidade: l.unid.value, quantidade: l.qtd.value, preco_unit: l.preco.value }));
      if (!itens.length) throw new Error('Inclua pelo menos um item.');
      const semProduto = linhas.find((l) => !l.prod.oculto.value);
      if (semProduto) { semProduto.prod.texto.setAttribute('aria-invalid', 'true'); semProduto.prod.texto.focus(); throw new Error('Escolha o produto de cada item na lista.'); }
      const corpo = { ...d, itens };
      const salvo = pedido ? await api.put(`/api/pedidos/${pedido.id}`, corpo) : await api.post('/api/pedidos', corpo);
      aviso(pedido ? 'Pedido atualizado.' : `Pedido #${salvo.id} registrado.`);
      fechar();
      depois?.();
      if (!pedido) abrirPedido(salvo.id, depois);
    },
  });
  if (!pedido) cliente.texto.focus();
  return janela;
}

// Visualização ------------------------------------------------------------
export function documentoPedido(p, empresa) {
  const c = p.cliente;
  const vencs = interpretarCondicao(p.condicao_tipo, p.condicao_valor, p.data).vencimentos || [];
  const vals = dividirValor(p.total, vencs.length || 1);
  return h('div', { class: 'documento' },
    cabecalhoDocumento(empresa, `Pedido de venda #${p.id}`, [`Data: ${data(p.data)} · `, etiquetaStatus(p.status)]),
    h('div', { class: 'doc-grade' },
      info('Cliente', c.nome), info('CPF/CNPJ', formatarCpfCnpj(c.documento)), info('Inscrição estadual', c.ie),
      info('Endereço', enderecoTexto(c)), info('Telefone', c.telefone),
      info('Vendedor', p.vendedor_nome), info('Origem', p.origem)),
    h('div', { class: 'doc-tabela-wrap' }, h('table', {},
      h('thead', h('tr', h('th', 'Código'), h('th', 'Produto'), h('th', 'Unid.'), h('th', { class: 'num' }, 'Qtd.'),
        h('th', { class: 'num' }, 'Preço unit.'), h('th', { class: 'num' }, 'Total'))),
      h('tbody', p.itens.map((i) => h('tr', h('td', i.codigo), h('td', i.descricao), h('td', i.unidade),
        h('td', { class: 'num' }, quantidade(i.quantidade)), h('td', { class: 'num' }, moeda(i.preco_unit)), h('td', { class: 'num' }, moeda(i.total))))),
      h('tfoot',
        h('tr', h('td', { colspan: 5, class: 'num' }, 'Soma dos itens'), h('td', { class: 'num' }, moeda(p.subtotal))),
        p.desconto ? h('tr', h('td', { colspan: 5, class: 'num' }, 'Desconto'), h('td', { class: 'num' }, `− ${moeda(p.desconto)}`)) : null,
        p.frete ? h('tr', h('td', { colspan: 5, class: 'num' }, 'Frete'), h('td', { class: 'num' }, moeda(p.frete))) : null,
        h('tr', h('th', { colspan: 5, class: 'num' }, 'TOTAL'), h('th', { class: 'num' }, moeda(p.total)))))),
    h('div', { class: 'doc-grade' },
      info('Forma de pagamento', p.forma_pagamento),
      info('Condição', descreverCondicao(p.condicao_tipo, p.condicao_valor)),
      info('Parcelas', vencs.map((v, i) => `${i + 1}/${vencs.length}: ${v ? data(v) : 'à vista'} – ${moeda(vals[i])}`).join('; ')),
      info('Frete', estadoModalidade(p.modalidade_frete)),
      info('Entrega prevista', data(p.data_entrega)),
      info('Receituário agronômico', p.receituario)),
    p.observacoes ? info('Observações', p.observacoes) : null,
    p.status === 'Cancelado' ? info('Motivo do cancelamento', p.motivo_cancelamento) : null,
    p.aprovado_por_nome ? h('p', { class: 'suave' }, `Aprovado por ${p.aprovado_por_nome}.`) : null,
    h('div', { class: 'assinaturas' }, h('div', 'Vendedor'), h('div', 'Cliente')));
}

function estadoModalidade(cod) {
  return opcoes?.modalidades?.[cod] || cod;
}

export function textoWhatsApp(p, empresa) {
  const linhas = [
    `*Pedido #${p.id} – ${empresa.nome_fantasia || 'AGRO S'}*`,
    `Data: ${data(p.data)}`,
    `Cliente: ${p.cliente.nome}`,
    '',
    '*Itens:*',
    ...p.itens.map((i) => `• ${quantidade(i.quantidade)} ${i.unidade} ${i.descricao} x ${moeda(i.preco_unit)} = ${moeda(i.total)}`),
    '',
  ];
  if (p.desconto) linhas.push(`Desconto: − ${moeda(p.desconto)}`);
  if (p.frete) linhas.push(`Frete: ${moeda(p.frete)}`);
  linhas.push(`*Total: ${moeda(p.total)}*`);
  linhas.push(`Pagamento: ${p.forma_pagamento} – ${descreverCondicao(p.condicao_tipo, p.condicao_valor)}`);
  if (p.data_entrega) linhas.push(`Entrega prevista: ${data(p.data_entrega)}`);
  if (p.receituario) linhas.push(`Receituário agronômico: ${p.receituario}`);
  if (p.observacoes) linhas.push(`Obs.: ${p.observacoes}`);
  linhas.push(`Situação: ${p.status}`, `Vendedor: ${p.vendedor_nome}`);
  return linhas.join('\n');
}

export function linkWhatsApp(telefone, texto) {
  let fone = String(telefone || '').replace(/\D/g, '');
  if (fone.length === 10 || fone.length === 11) fone = `55${fone}`;
  return `https://wa.me/${fone.length >= 12 ? fone : ''}?text=${encodeURIComponent(texto)}`;
}

export async function abrirPedido(id, depois) {
  await obterOpcoes();
  const [p, empresa] = await Promise.all([api.get(`/api/pedidos/${id}`), obterEmpresa()]);
  const botoes = [];
  let janela;
  const recarregar = async () => { janela.fechar(); depois?.(); await abrirPedido(id, depois); };

  botoes.push(h('a', { class: 'btn', href: linkWhatsApp(p.cliente.telefone, textoWhatsApp(p, empresa)), target: '_blank', rel: 'noopener' },
    icone('whatsapp'), 'Enviar resumo por WhatsApp'));
  botoes.push(h('button', { type: 'button', class: 'btn', onClick: imprimirJanela }, icone('imprimir'), 'Imprimir'));
  if (p.podeEditar) {
    botoes.push(h('button', { type: 'button', class: 'btn', onClick: () => { janela.fechar(); abrirFormulario(p, depois); } }, 'Editar'));
  }
  if (podeUsuario('pedidos_aprovar')) {
    if (p.status === 'Aprovado') {
      botoes.push(h('button', { type: 'button', class: 'btn', onClick: async () => {
        if (!(await confirmar('Voltar este pedido para "Recebido"?'))) return;
        try { await api.post(`/api/pedidos/${id}/reabrir`); aviso('Pedido voltou para "Recebido".'); recarregar(); } catch (e) { aviso(e.message, 'erro'); }
      } }, 'Voltar para Recebido'));
    }
    if (['Recebido', 'Aprovado'].includes(p.status)) {
      botoes.push(h('button', { type: 'button', class: 'btn perigo', onClick: () => cancelarPedido(p, recarregar) }, 'Cancelar pedido'));
    }
    if (p.status === 'Recebido') {
      botoes.push(h('button', { type: 'button', class: 'btn primario', onClick: async () => {
        try { await api.post(`/api/pedidos/${id}/aprovar`); aviso('Pedido aprovado.'); recarregar(); } catch (e) { aviso(e.message, 'erro'); }
      } }, 'Aprovar'));
    }
  }
  janela = abrirJanela({ titulo: `Pedido #${p.id}`, tamanho: 'larga', conteudo: documentoPedido(p, empresa), botoes });
}

function cancelarPedido(p, depois) {
  const motivo = h('textarea', { name: 'motivo', maxlength: 300, rows: 3, required: true });
  abrirJanela({
    titulo: `Cancelar pedido #${p.id}`,
    tamanho: 'estreita',
    conteudo: [h('p', 'O pedido ficará com a situação "Cancelado".'), campo('Motivo do cancelamento', motivo, { obrigatorio: true })],
    botoes: [h('button', { type: 'submit', class: 'btn perigo' }, 'Cancelar pedido')],
    aoEnviar: async (d, { fechar }) => {
      if (d.motivo.trim().length < 3) throw new Error('Informe o motivo do cancelamento.');
      await api.post(`/api/pedidos/${p.id}/cancelar`, d);
      aviso('Pedido cancelado.');
      fechar();
      depois();
    },
  });
}
