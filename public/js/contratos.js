// Contratos de compra e venda: cadastro, importação de pedido, texto gerado e impressão.
import { api } from './api.js';
import { h, anexar, limpar, icone, tabela, paginacao, abrirJanela, aviso, confirmar, debounce, selecao, entrada, campo,
  moeda, decimal, data, hoje, etiqueta, buscador, imprimirJanela, mensagem, paraCentavos, paraNumero } from './util.js';
import { obterEmpresa, enderecoTexto } from './documentos.js';
import { formatarCpfCnpj } from '/lib/validacao.js';
import { TIPOS_CONDICAO } from '/lib/parcelas.js';
import { gerarContrato } from '/lib/contrato.js';

const STATUS = { rascunho: ['Rascunho', ''], vigente: ['Vigente', 'verde'], encerrado: ['Encerrado', 'azul'], cancelado: ['Cancelado', 'vermelha'] };
const FORMAS = ['Boleto', 'PIX', 'Dinheiro', 'Cartão', 'Cheque', 'Outros'];

export async function render(main) {
  const st = { tipo: '', status: '', busca: '', pagina: 1 };
  const lista = h('div');
  const fTipo = selecao('tipo', [['', 'Todos'], ['venda', 'Venda'], ['compra', 'Compra']], '');
  const fStatus = selecao('status', [['', 'Todas'], ...Object.entries(STATUS).map(([k, [t]]) => [k, t])], '');
  const fBusca = entrada('busca', '', { type: 'search', placeholder: 'Parte, objeto ou nº' });
  const atualizar = () => { Object.assign(st, { tipo: fTipo.value, status: fStatus.value, busca: fBusca.value, pagina: 1 }); carregar(); };
  [fTipo, fStatus].forEach((f) => f.addEventListener('change', atualizar));
  fBusca.addEventListener('input', debounce(atualizar));
  anexar(main, [
    h('div', { class: 'cabecalho-pagina' }, h('h1', 'Contratos'),
      h('button', { class: 'btn primario', onClick: () => abrirFormulario(null, carregar) }, icone('mais'), 'Novo contrato')),
    mensagem('alerta', 'Os contratos são gerados a partir de um MODELO. Revise o texto com o advogado da empresa antes de usar.'),
    h('div', { class: 'painel' },
      h('div', { class: 'filtros' }, h('label', { class: 'campo busca' }, h('span', 'Buscar'), fBusca), campo('Tipo', fTipo), campo('Situação', fStatus)),
      lista),
  ]);
  async function carregar() {
    const r = await api.get('/api/contratos', st);
    limpar(lista, tabela([
      { titulo: 'Nº', valor: (l) => `#${l.id}` },
      { titulo: 'Tipo', valor: (l) => (l.tipo === 'venda' ? 'Venda' : 'Compra') },
      { titulo: 'Outra parte', valor: (l) => l.parte_nome, principal: true },
      { titulo: 'Data', valor: (l) => data(l.data) },
      { titulo: 'Vigência', valor: (l) => [data(l.vigencia_inicio), data(l.vigencia_fim)].filter(Boolean).join(' a ') },
      { titulo: 'Valor', valor: (l) => moeda(l.valor), classe: 'num' },
      { titulo: 'Situação', valor: (l) => etiqueta(...STATUS[l.status]) },
    ], r.linhas, { aoClicar: (l) => abrirContrato(l.id, carregar), vazio: 'Nenhum contrato cadastrado.' }),
    paginacao({ ...r, aoMudar: (p) => { st.pagina = p; carregar(); } }));
  }
  carregar();
}

async function abrirFormulario(c, depois) {
  const empresa = await obterEmpresa(true);
  c = c || { tipo: 'venda', data: hoje(), forma_pagamento: 'Boleto', condicao_tipo: 'dias', condicao_valor: '30', multa: empresa.multa_padrao || 2,
    juros: empresa.juros_padrao || 1, foro: empresa.foro, vigencia_inicio: hoje(), defensivos: true, itens: [], status: 'rascunho' };
  const v = (n) => c[n] ?? '';
  const fTipo = selecao('tipo', [['venda', 'Venda (a empresa vende ao cliente)'], ['compra', 'Compra (a empresa compra do fornecedor)']], c.tipo);
  const fNome = entrada('parte_nome', v('parte_nome'), { maxlength: 150 });
  const fDoc = entrada('parte_documento', formatarCpfCnpj(v('parte_documento')), { maxlength: 18 });
  const fIe = entrada('parte_ie', v('parte_ie'), { maxlength: 20 });
  const fEnd = entrada('parte_endereco', v('parte_endereco'), { maxlength: 300 });
  const fClienteId = entrada('cliente_id', v('cliente_id'), { type: 'hidden' });
  const fPedidoId = entrada('pedido_id', v('pedido_id'), { type: 'hidden' });
  const preencherParte = (cl) => {
    fNome.value = cl.nome; fDoc.value = formatarCpfCnpj(cl.documento); fIe.value = cl.ie || ''; fEnd.value = enderecoTexto(cl);
    fClienteId.value = cl.id;
  };
  const cliente = buscador({ nome: '_cliente', endpoint: '/api/clientes', rotulo: 'Puxar dados do cadastro de clientes (opcional)', classe: 'largo',
    formatar: (x) => x.nome, detalhe: (x) => formatarCpfCnpj(x.documento), aoEscolher: preencherParte });

  // Itens
  const listaItens = h('div', { class: 'itens' });
  const linhas = [];
  const totalEl = h('div', { class: 'totais' });
  const recalcular = () => {
    const t = linhas.reduce((s, l) => s + Math.round(paraNumero(l.q.value || 0) * paraCentavos(l.p.value || 0)), 0);
    limpar(totalEl, h('div', { class: 'grande' }, `Valor total: ${Number.isFinite(t) ? moeda(t) : '—'}`));
  };
  const novaLinha = (it = {}) => {
    const l = {
      d: entrada('', it.descricao || '', { maxlength: 200, 'aria-label': 'Descrição' }),
      u: entrada('', it.unidade || '', { maxlength: 6, 'aria-label': 'Unidade' }),
      q: entrada('', it.quantidade != null ? String(it.quantidade).replace('.', ',') : '', { inputmode: 'decimal', 'aria-label': 'Quantidade' }),
      p: entrada('', it.preco_unit != null ? decimal(it.preco_unit) : '', { inputmode: 'decimal', 'aria-label': 'Preço unitário' }),
    };
    [l.q, l.p].forEach((i) => i.addEventListener('input', recalcular));
    l.el = h('div', { class: 'item-linha item-contrato' }, campo('Descrição', l.d, { classe: 'produto' }), campo('Unid.', l.u), campo('Quantidade', l.q),
      campo('Preço unit. (R$)', l.p), h('div'), h('button', { type: 'button', class: 'btn perigo pequeno', 'aria-label': 'Remover item', onClick: () => {
        linhas.splice(linhas.indexOf(l), 1); l.el.remove(); recalcular();
      } }, icone('fechar')));
    l.el.querySelectorAll('[name]').forEach((e) => e.removeAttribute('name'));
    linhas.push(l);
    listaItens.append(l.el);
  };
  const pedido = buscador({ nome: '_pedido', endpoint: '/api/pedidos', rotulo: 'Importar itens de um pedido (opcional)', classe: 'largo',
    extra: { porPagina: 12 }, formatar: (p) => `#${p.id} – ${p.cliente_nome}`, detalhe: (p) => `${data(p.data)} · ${moeda(p.total)} · ${p.status}`,
    aoEscolher: async (p) => {
      const ped = await api.get(`/api/pedidos/${p.id}`);
      fPedidoId.value = ped.id;
      if (fTipo.value === 'venda') preencherParte(ped.cliente);
      linhas.splice(0).forEach((l) => l.el.remove());
      ped.itens.forEach((i) => novaLinha({ ...i, descricao: `${i.codigo} – ${i.descricao}` }));
      form.elements.forma_pagamento.value = ped.forma_pagamento;
      form.elements.condicao_tipo.value = ped.condicao_tipo;
      form.elements.condicao_valor.value = ped.condicao_valor;
      form.elements.receituario.value = ped.receituario || '';
      if (ped.data_entrega) form.elements.prazo_entrega.value = `até ${data(ped.data_entrega)}`;
      form.elements.local_entrega.value = enderecoTexto(ped.cliente);
      if (ped.desconto || ped.frete) aviso('Atenção: desconto e frete do pedido não são importados; ajuste os preços se necessário.', 'erro');
      recalcular();
    } });
  (c.itens.length ? c.itens : [{}]).forEach(novaLinha);
  recalcular();

  const conteudo = h('div', {},
    h('fieldset', {}, h('legend', 'Partes'),
      h('div', { class: 'grade' },
        campo('Tipo de contrato', fTipo, { obrigatorio: true, classe: 'duplo' }),
        campo('Data do contrato', entrada('data', v('data'), { type: 'date' }), { obrigatorio: true }),
        cliente,
        campo('Nome / razão social da outra parte', fNome, { obrigatorio: true, classe: 'duplo' }),
        campo('CPF ou CNPJ', fDoc, { obrigatorio: true }),
        campo('Inscrição estadual', fIe),
        campo('Endereço completo', fEnd, { classe: 'largo' }), fClienteId, fPedidoId)),
    h('fieldset', {}, h('legend', 'Objeto e itens'),
      h('div', { class: 'grade' }, pedido,
        campo('Objeto (resumo)', entrada('objeto', v('objeto'), { maxlength: 500, placeholder: 'Ex.: defensivos agrícolas para a safra 2026/2027' }), { classe: 'largo' }),
        h('label', { class: 'check largo' }, h('input', { type: 'checkbox', name: 'defensivos', checked: c.defensivos !== false }),
          h('span', 'Contrato envolve agrotóxicos (inclui cláusula do receituário agronômico)'))),
      listaItens,
      h('div', { class: 'botoes' }, h('button', { type: 'button', class: 'btn', onClick: () => novaLinha() }, icone('mais'), 'Adicionar item')),
      totalEl),
    h('fieldset', {}, h('legend', 'Pagamento, entrega e vigência'),
      h('div', { class: 'grade' },
        campo('Forma de pagamento', selecao('forma_pagamento', FORMAS, c.forma_pagamento)),
        campo('Condição de pagamento', selecao('condicao_tipo', Object.entries(TIPOS_CONDICAO), c.condicao_tipo)),
        campo('Prazos (dias) ou datas (dd/mm/aaaa)', entrada('condicao_valor', v('condicao_valor'), { maxlength: 500, placeholder: '30/60/90 ou 30/04/2027' })),
        campo('Local de entrega', entrada('local_entrega', v('local_entrega'), { maxlength: 300 }), { classe: 'duplo' }),
        campo('Prazo de entrega', entrada('prazo_entrega', v('prazo_entrega'), { maxlength: 120, placeholder: 'Ex.: 10 dias após a assinatura' })),
        campo('Início da vigência', entrada('vigencia_inicio', v('vigencia_inicio'), { type: 'date' })),
        campo('Fim da vigência', entrada('vigencia_fim', v('vigencia_fim'), { type: 'date' })),
        campo('Multa por atraso (%)', entrada('multa', String(v('multa')).replace('.', ','), { inputmode: 'decimal' })),
        campo('Juros por atraso (% ao mês)', entrada('juros', String(v('juros')).replace('.', ','), { inputmode: 'decimal' })),
        campo('Foro', entrada('foro', v('foro'), { maxlength: 150 }), { classe: 'duplo' }),
        campo('Nº do receituário agronômico', entrada('receituario', v('receituario'), { maxlength: 60 })))),
    h('fieldset', {}, h('legend', 'Testemunhas e observações'),
      h('div', { class: 'grade' },
        campo('Testemunha 1 – nome', entrada('testemunha1_nome', v('testemunha1_nome'), { maxlength: 120 }), { classe: 'duplo' }),
        campo('Testemunha 1 – CPF', entrada('testemunha1_cpf', formatarCpfCnpj(v('testemunha1_cpf')), { inputmode: 'numeric', maxlength: 14 })),
        campo('Testemunha 2 – nome', entrada('testemunha2_nome', v('testemunha2_nome'), { maxlength: 120 }), { classe: 'duplo' }),
        campo('Testemunha 2 – CPF', entrada('testemunha2_cpf', formatarCpfCnpj(v('testemunha2_cpf')), { inputmode: 'numeric', maxlength: 14 })),
        campo('Situação', selecao('status', Object.entries(STATUS).map(([k, [t]]) => [k, t]), c.status)),
        campo('Observações (entram nas disposições gerais)', h('textarea', { name: 'observacoes', rows: 3, maxlength: 2000 }, v('observacoes')), { classe: 'largo' }))));

  const janela = abrirJanela({
    titulo: c.id ? `Editar contrato #${c.id}` : 'Novo contrato',
    tamanho: 'larga',
    conteudo,
    botoes: [h('button', { type: 'submit', class: 'btn primario' }, 'Salvar contrato')],
    aoEnviar: async (d, { fechar }) => {
      const itens = linhas.map((l) => ({ descricao: l.d.value, unidade: l.u.value, quantidade: l.q.value, preco_unit: l.p.value }));
      delete d._cliente; delete d._pedido;
      const salvo = c.id ? await api.put(`/api/contratos/${c.id}`, { ...d, itens }) : await api.post('/api/contratos', { ...d, itens });
      aviso('Contrato salvo.');
      fechar();
      depois?.();
      abrirContrato(salvo.id, depois);
    },
  });
  const form = janela.form;
}

export function documentoContrato(c, empresa) {
  const t = gerarContrato(c, empresa);
  return h('div', { class: 'documento contrato' },
    h('div', { class: 'aviso-modelo' }, 'MODELO – texto a ser revisado por advogado antes do uso.'),
    h('div', { class: 'doc-cabecalho' }, h('img', { src: empresa.logo, alt: 'Logo' }), h('h2', t.titulo)),
    h('p', { class: 'justificado' }, t.preambulo),
    h('h3', 'QUADRO DE ITENS'),
    h('div', { class: 'doc-tabela-wrap' }, h('table', {},
      h('thead', h('tr', h('th', 'Item'), h('th', 'Descrição'), h('th', 'Unid.'), h('th', { class: 'num' }, 'Quantidade'),
        h('th', { class: 'num' }, 'Preço unit.'), h('th', { class: 'num' }, 'Total'))),
      h('tbody', t.itens.map((i, n) => h('tr', h('td', n + 1), h('td', i.descricao), h('td', i.unidade), h('td', { class: 'num' }, i.quantidadeTxt),
        h('td', { class: 'num' }, i.precoTxt), h('td', { class: 'num' }, i.totalTxt)))),
      h('tfoot', h('tr', h('th', { colspan: 5, class: 'num' }, 'VALOR TOTAL'), h('th', { class: 'num' }, t.valorTxt))))),
    t.clausulas.map((cl, i) => h('section', { class: 'clausula' },
      h('h3', `CLÁUSULA ${i + 1}ª – ${cl.titulo}`),
      cl.paragrafos.map((p, j) => h('p', { class: 'justificado' }, cl.paragrafos.length > 1 ? `${i + 1}.${j + 1}. ${p}` : p)))),
    h('p', { class: 'justificado' }, t.fecho),
    h('p', { class: 'direita' }, t.localData),
    h('div', { class: 'assinaturas' },
      t.assinaturas.map((a) => h('div', h('strong', a.papel), h('br'), a.nome, h('br'), a.documento)),
      t.testemunhas.map((w, i) => h('div', h('strong', `Testemunha ${i + 1}`), h('br'), `Nome: ${w.nome || '______________________________'}`,
        h('br'), `CPF: ${w.cpf || '____________________'}`))));
}

async function abrirContrato(id, depois) {
  const [c, empresa] = await Promise.all([api.get(`/api/contratos/${id}`), obterEmpresa(true)]);
  let janela;
  const mudar = (status, texto) => async () => {
    if (!(await confirmar(texto))) return;
    try { await api.post(`/api/contratos/${id}/status`, { status }); aviso('Situação atualizada.'); janela.fechar(); depois?.(); abrirContrato(id, depois); }
    catch (e) { aviso(e.message, 'erro'); }
  };
  const editavel = ['rascunho', 'vigente'].includes(c.status);
  janela = abrirJanela({
    titulo: `Contrato #${c.id} – ${STATUS[c.status][0]}`,
    tamanho: 'larga',
    conteudo: documentoContrato(c, empresa),
    botoes: [
      h('button', { type: 'button', class: 'btn', onClick: imprimirJanela }, icone('imprimir'), 'Imprimir'),
      editavel ? h('button', { type: 'button', class: 'btn', onClick: () => { janela.fechar(); abrirFormulario(c, depois); } }, 'Editar') : null,
      c.status === 'rascunho' ? h('button', { type: 'button', class: 'btn primario', onClick: mudar('vigente', 'Marcar o contrato como vigente (assinado)?') }, 'Marcar como vigente') : null,
      c.status === 'vigente' ? h('button', { type: 'button', class: 'btn', onClick: mudar('encerrado', 'Encerrar este contrato?') }, 'Encerrar') : null,
      editavel ? h('button', { type: 'button', class: 'btn perigo', onClick: mudar('cancelado', 'Cancelar este contrato?') }, 'Cancelar contrato') : null,
    ].filter(Boolean),
  });
}
