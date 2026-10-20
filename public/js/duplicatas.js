// Duplicatas: geração a partir da NF, controle de cobrança e impressão (A4, duas por página).
import { api } from './api.js';
import { h, anexar, limpar, icone, tabela, paginacao, abrirJanela, aviso, confirmar, debounce, selecao, entrada, campo,
  moeda, data, hoje, etiqueta, imprimirJanela, mensagem, copiarTexto } from './util.js';
import { enderecoTexto } from './documentos.js';
import { formatarCpfCnpj } from '/lib/validacao.js';
import { formatarChave } from '/lib/chave-nfe.js';
import { valorPorExtenso } from '/lib/extenso.js';

const COR = { aberta: 'amarela', paga: 'verde', protestada: 'vermelha', cancelada: '' };
const NOME = { aberta: 'Aberta', paga: 'Paga', protestada: 'Protestada', cancelada: 'Cancelada' };
const BANCOS = ['', 'Bradesco', 'Banco do Brasil'];
const pad = (n) => String(n).padStart(6, '0');
const vencida = (d, hojeIso) => d.status === 'aberta' && d.vencimento && d.vencimento < hojeIso;
const formatarLinha = (l) => String(l || '').replace(/^(\d{5})(\d{5})(\d{5})(\d{6})(\d{5})(\d{6})(\d)(\d{14})$/, '$1.$2 $3.$4 $5.$6 $7 $8');

export async function render(main, { params }) {
  const st = { status: 'aberta', situacao: params[0] === 'vencidas' || params[0] === 'avencer' ? params[0] : '', busca: '',
    venc_de: '', venc_ate: '', pagina: 1 };
  if (st.situacao) st.status = '';
  const selecionadas = new Set();
  const lista = h('div');
  const alerta = h('div');
  const fStatus = selecao('status', [['', 'Todas'], ['aberta', 'Abertas'], ['paga', 'Pagas'], ['protestada', 'Protestadas'], ['cancelada', 'Canceladas']], st.status);
  const fSituacao = selecao('situacao', [['', 'Qualquer vencimento'], ['vencidas', 'Vencidas'], ['avencer', 'A vencer em 7 dias']], st.situacao);
  const fDe = entrada('venc_de', '', { type: 'date' });
  const fAte = entrada('venc_ate', '', { type: 'date' });
  const fBusca = entrada('busca', '', { type: 'search', placeholder: 'Cliente, nº de ordem ou nº da NF' });
  const atualizar = () => {
    Object.assign(st, { status: fStatus.value, situacao: fSituacao.value, venc_de: fDe.value, venc_ate: fAte.value, busca: fBusca.value, pagina: 1 });
    carregar();
  };
  [fStatus, fSituacao, fDe, fAte].forEach((f) => f.addEventListener('change', atualizar));
  fBusca.addEventListener('input', debounce(atualizar));
  const btnImprimir = h('button', { type: 'button', class: 'btn', disabled: true, onClick: () => imprimir([...selecionadas]) },
    icone('imprimir'), 'Imprimir selecionadas');

  anexar(main, [
    h('div', { class: 'cabecalho-pagina' }, h('h1', 'Duplicatas'), btnImprimir),
    alerta,
    h('div', { class: 'painel' },
      h('div', { class: 'filtros' }, h('label', { class: 'campo busca' }, h('span', 'Buscar'), fBusca),
        campo('Situação', fStatus), campo('Vencimento', fSituacao), campo('Vencimento de', fDe), campo('até', fAte)),
      lista),
    ajudaCobranca(),
  ]);

  async function carregar() {
    const r = await api.get('/api/duplicatas', st);
    limpar(alerta, r.vencidas.n ? mensagem('erro', h('strong', `${r.vencidas.n} duplicata(s) vencida(s)`), ` somando ${moeda(r.vencidas.valor)}. `,
      h('button', { type: 'button', class: 'btn link', onClick: () => { fStatus.value = ''; fSituacao.value = 'vencidas'; atualizar(); } }, 'Ver vencidas')) : null);
    const atualizarBotao = () => { btnImprimir.disabled = !selecionadas.size; btnImprimir.lastChild.textContent = selecionadas.size ? `Imprimir selecionadas (${selecionadas.size})` : 'Imprimir selecionadas'; };
    limpar(lista, tabela([
      { titulo: 'Sel.', valor: (l) => h('input', { type: 'checkbox', 'aria-label': `Selecionar duplicata ${l.numero_ordem}`, checked: selecionadas.has(l.id),
        onChange: (ev) => { if (ev.target.checked) selecionadas.add(l.id); else selecionadas.delete(l.id); atualizarBotao(); } }) },
      { titulo: 'Nº de ordem', valor: (l) => pad(l.numero_ordem), classe: 'nowrap' },
      { titulo: 'Cliente', valor: (l) => l.cliente_nome, principal: true },
      { titulo: 'Fatura / parcela', valor: (l) => `NF ${l.numero_fatura} – ${l.parcela}/${l.parcelas}` },
      { titulo: 'Emissão', valor: (l) => data(l.data_emissao) },
      { titulo: 'Vencimento', valor: (l) => (l.vencimento ? data(l.vencimento) : 'À vista') },
      { titulo: 'Valor', valor: (l) => moeda(l.valor), classe: 'num' },
      { titulo: 'Banco', valor: (l) => l.banco },
      { titulo: 'Situação', valor: (l) => [etiqueta(NOME[l.status], COR[l.status]), vencida(l, r.hoje) ? [' ', etiqueta('Vencida', 'vermelha')] : null] },
    ], r.linhas, { aoClicar: (l) => abrirDuplicata(l.id, carregar), vazio: 'Nenhuma duplicata encontrada.' }),
    paginacao({ ...r, aoMudar: (p) => { st.pagina = p; carregar(); } }));
    atualizarBotao();
  }
  carregar();
}

function ajudaCobranca() {
  return h('details', { class: 'painel ajuda' },
    h('summary', h('strong', 'Para cobrança judicial: documentos necessários')),
    h('ol',
      h('li', 'NF-e (DANFE e XML) autorizada pela SEFAZ.'),
      h('li', 'Duplicata (assinada/aceita pelo comprador) ou boleto correspondente.'),
      h('li', 'Comprovante de entrega da mercadoria assinado (canhoto da NF-e ou recibo de entrega).'),
      h('li', 'Instrumento de protesto da duplicata (ou do boleto/indicação), quando não houver aceite.'),
      h('li', 'Contrato de compra e venda, quando houver.')),
    h('p', { class: 'suave' }, 'Duplicata sem aceite vale como título executivo quando protestada e acompanhada do comprovante de entrega ',
      '(Lei 5.474/1968, art. 15, II). Revise os modelos e cada caso com o advogado da empresa.'));
}

// Oferece gerar as duplicatas logo após registrar a nota fiscal.
export async function oferecerGeracao(nota) {
  const ok = await confirmar(`Gerar agora as duplicatas da NF ${nota.numero} (uma por parcela da condição de pagamento do pedido)?`,
    { titulo: 'Gerar duplicatas', sim: 'Gerar duplicatas' });
  if (!ok) return;
  try {
    const r = await api.post('/api/duplicatas/gerar', { nota_id: nota.id });
    aviso(`${r.quantidade} duplicata(s) gerada(s).`);
    if (await confirmar('Deseja imprimir as duplicatas agora?', { titulo: 'Imprimir duplicatas', sim: 'Imprimir' })) imprimir(r.ids);
  } catch (e) { aviso(e.message, 'erro'); }
}

async function abrirDuplicata(id, depois) {
  const d = await api.get(`/api/duplicatas/${id}`);
  const editavel = d.status !== 'cancelada';
  let janela;
  const recarregar = () => { janela.fechar(); depois?.(); abrirDuplicata(id, depois); };
  const acao = (url, corpo, msg) => async () => {
    try { await api.post(url, corpo()); aviso(msg); recarregar(); } catch (e) { aviso(e.message, 'erro'); }
  };
  const fPagamento = entrada('data_pagamento', hoje(), { type: 'date' });
  const fProtesto = entrada('data_protesto', hoje(), { type: 'date' });
  janela = abrirJanela({
    titulo: `Duplicata ${pad(d.numero_ordem)} – ${d.parcela}/${d.parcelas}`,
    conteudo: [
      h('div', { class: 'doc-grade' },
        h('div', { class: 'bloco' }, h('span', { class: 'rotulo' }, 'Cliente'), d.cliente_nome),
        h('div', { class: 'bloco' }, h('span', { class: 'rotulo' }, 'Fatura (NF-e)'), `${d.nf_numero} / série ${d.nf_serie}`),
        h('div', { class: 'bloco' }, h('span', { class: 'rotulo' }, 'Emissão'), data(d.data_emissao)),
        h('div', { class: 'bloco' }, h('span', { class: 'rotulo' }, 'Vencimento'), d.vencimento ? data(d.vencimento) : 'À vista'),
        h('div', { class: 'bloco' }, h('span', { class: 'rotulo' }, 'Valor'), moeda(d.valor)),
        h('div', { class: 'bloco' }, h('span', { class: 'rotulo' }, 'Situação'), etiqueta(NOME[d.status], COR[d.status]),
          d.data_pagamento ? ` em ${data(d.data_pagamento)}` : '', d.data_protesto ? ` em ${data(d.data_protesto)}` : '')),
      h('p', { class: 'suave' }, `Por extenso: ${valorPorExtenso(d.valor)}`),
      h('fieldset', {}, h('legend', 'Boleto e aceite'),
        h('div', { class: 'grade' },
          campo('Banco', selecao('banco', BANCOS, d.banco, { disabled: !editavel })),
          campo('Nosso número', entrada('nosso_numero', d.nosso_numero, { maxlength: 30, disabled: !editavel })),
          campo('Linha digitável do boleto', entrada('linha_digitavel', formatarLinha(d.linha_digitavel), { inputmode: 'numeric', maxlength: 60, class: 'mono', disabled: !editavel }),
            { classe: 'largo', dica: 'O sistema confere os dígitos, o banco, o valor e o vencimento.' }),
          campo('Praça de pagamento', entrada('praca_pagamento', d.praca_pagamento, { maxlength: 120, disabled: !editavel }), { classe: 'duplo' }),
          campo('Data do aceite', entrada('data_aceite', d.data_aceite || '', { type: 'date', disabled: !editavel })),
          campo('Observações', h('textarea', { name: 'observacoes', rows: 2, maxlength: 500, disabled: !editavel }, d.observacoes), { classe: 'largo' }))),
      d.status === 'aberta' || d.status === 'protestada' ? h('fieldset', {}, h('legend', 'Baixa'),
        h('div', { class: 'grade' }, campo('Data do pagamento', fPagamento),
          h('div', { class: 'botoes' }, h('button', { type: 'button', class: 'btn primario', onClick: acao(`/api/duplicatas/${id}/pagar`, () => ({ data_pagamento: fPagamento.value }), 'Duplicata marcada como paga.') }, 'Marcar como paga')),
          d.status === 'aberta' ? campo('Data do protesto', fProtesto) : null,
          d.status === 'aberta' ? h('div', { class: 'botoes' }, h('button', { type: 'button', class: 'btn perigo', onClick: acao(`/api/duplicatas/${id}/protestar`, () => ({ data_protesto: fProtesto.value }), 'Duplicata marcada como protestada.') }, 'Marcar como protestada')) : null)) : null,
    ],
    botoes: [
      h('button', { type: 'button', class: 'btn', onClick: () => { janela.fechar(); imprimir([id]); } }, icone('imprimir'), 'Imprimir'),
      d.linha_digitavel ? h('button', { type: 'button', class: 'btn', onClick: () => copiarTexto(d.linha_digitavel) }, icone('copiar'), 'Copiar linha digitável') : null,
      ['paga', 'protestada'].includes(d.status) ? h('button', { type: 'button', class: 'btn', onClick: async () => {
        if (await confirmar('Voltar esta duplicata para "aberta"?')) acao(`/api/duplicatas/${id}/reabrir`, () => ({}), 'Duplicata reaberta.')();
      } }, 'Reabrir') : null,
      editavel ? h('button', { type: 'submit', class: 'btn primario' }, 'Salvar dados do boleto') : null,
    ].filter(Boolean),
    aoEnviar: editavel ? async (dados) => {
      await api.put(`/api/duplicatas/${id}`, dados);
      aviso('Dados salvos.');
      recarregar();
    } : null,
  });
}

// Impressão ------------------------------------------------------------------
export async function imprimir(ids) {
  const r = await api.get('/api/duplicatas/imprimir', { ids: ids.join(',') });
  const folhas = [];
  for (let i = 0; i < r.duplicatas.length; i += 2) {
    folhas.push(h('div', { class: 'folha-duplicatas' }, r.duplicatas.slice(i, i + 2).map((d) => documentoDuplicata(d, r.empresa))));
  }
  abrirJanela({
    titulo: `Imprimir duplicatas (${r.duplicatas.length})`,
    tamanho: 'larga',
    conteudo: folhas,
    botoes: [h('button', { type: 'button', class: 'btn primario', onClick: imprimirJanela }, icone('imprimir'), 'Imprimir')],
  });
}

export function documentoDuplicata(d, e) {
  const c = d.cliente;
  const cel = (rotulo, valor, classe) => h('div', { class: ['celula', classe] }, h('span', { class: 'rotulo' }, rotulo), h('strong', valor || '—'));
  const doc = (x) => `${x.length === 14 ? 'CNPJ' : 'CPF'} ${formatarCpfCnpj(x)}`;
  return h('div', { class: 'documento duplicata' },
    h('div', { class: 'dup-topo' },
      h('img', { src: e.logo, alt: 'Logo' }),
      h('h2', 'DUPLICATA'),
      h('div', { class: 'data' }, h('span', { class: 'rotulo' }, 'Data de emissão'), h('strong', data(d.data_emissao)))),
    h('div', { class: 'dup-grade' },
      cel('Fatura nº', d.numero_fatura),
      cel('Duplicata nº de ordem', `${pad(d.numero_ordem)} – ${d.parcela}/${d.parcelas}`),
      cel('Valor R$', moeda(d.valor)),
      cel('Vencimento', d.vencimento ? data(d.vencimento) : 'À VISTA'),
      cel('NF-e nº / série', `${d.nf_numero} / ${d.nf_serie}`, 'c2'),
      cel('Chave de acesso da NF-e', formatarChave(d.nf_chave), 'c6 mono'),
      h('div', { class: 'celula c3' }, h('span', { class: 'rotulo' }, 'Vendedor (emitente)'),
        h('strong', e.razao_social || '—'), h('br'), `CNPJ ${formatarCpfCnpj(e.cnpj)} · IE ${e.ie || '—'}`, h('br'), enderecoTexto(e)),
      h('div', { class: 'celula c3' }, h('span', { class: 'rotulo' }, 'Comprador (sacado)'),
        h('strong', c.nome), h('br'), `${doc(c.documento)} · IE ${c.ie || '—'}`, h('br'), enderecoTexto(c)),
      cel('Valor por extenso', valorPorExtenso(d.valor).toUpperCase(), 'c4'),
      cel('Praça de pagamento', d.praca_pagamento, 'c2')),
    h('p', { class: 'dup-clausula' },
      'Reconheço(emos) a exatidão desta DUPLICATA DE VENDA MERCANTIL, extraída da nota fiscal acima, na importância indicada, ',
      `relativa às mercadorias recebidas, e obrigo-me(nos) a pagá-la a ${e.razao_social || 'emitente'}, ou à sua ordem, `,
      'na praça e no vencimento indicados.'),
    h('div', { class: 'dup-assinaturas' },
      h('div', h('div', { class: 'linha' }), `Aceite em ${d.data_aceite ? data(d.data_aceite) : '____/____/______'} – assinatura do comprador`),
      h('div', h('div', { class: 'linha' }), `Assinatura do emitente – ${e.razao_social || ''}`)),
    h('div', { class: 'dup-boleto' },
      h('strong', 'Boleto: '), `${d.banco || '—'} · Nosso número: ${d.nosso_numero || '—'} · `,
      h('span', { class: 'mono' }, `Linha digitável: ${d.linha_digitavel ? formatarLinha(d.linha_digitavel) : '—'}`)));
}
