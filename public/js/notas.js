// Notas fiscais: a emissão oficial é feita na Conta Azul Pro. Aqui ficam a ficha de emissão
// (dados prontos para digitar), o registro da NF emitida e o controle das notas.
import { api } from './api.js';
import { h, anexar, limpar, icone, tabela, paginacao, abrirJanela, aviso, confirmar, debounce, selecao, entrada, campo,
  moeda, decimal, quantidade, data, hoje, etiqueta, imprimirJanela, copiarTexto, mensagem } from './util.js';
import { obterEmpresa, cabecalhoDocumento, enderecoTexto, info } from './documentos.js';
import { formatarCpfCnpj } from '/lib/validacao.js';
import { validarChaveNFe, conferirChave, formatarChave } from '/lib/chave-nfe.js';

let modalidades = {};
const pct = (v) => `${String(v ?? 0).replace('.', ',')}%`;

export async function render(main, { params }) {
  modalidades = (await api.get('/api/pedidos/opcoes')).modalidades;
  const abas = [['emitir', 'A emitir'], ['emitidas', 'Emitidas']];
  let atual = params[0] === 'emitidas' ? 'emitidas' : 'emitir';
  const conteudo = h('div');
  const botoesAba = abas.map(([id, t]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === atual),
    onClick: () => { atual = id; botoesAba.forEach((b, i) => b.setAttribute('aria-selected', String(abas[i][0] === id))); mostrar(); } }, t));
  anexar(main, [
    h('div', { class: 'cabecalho-pagina' }, h('h1', 'Notas fiscais')),
    mensagem('info', 'A NF-e continua sendo emitida na Conta Azul Pro. Este módulo prepara os dados (ficha de emissão) e controla as notas emitidas.'),
    h('div', { class: 'abas', role: 'tablist' }, botoesAba),
    conteudo,
  ]);
  const mostrar = () => (atual === 'emitir' ? abaEmitir(conteudo) : abaEmitidas(conteudo));
  mostrar();
}

async function abaEmitir(el) {
  limpar(el, h('p', { class: 'carregando' }, 'Carregando…'));
  const linhas = await api.get('/api/notas/a-emitir');
  const recarregar = () => abaEmitir(el);
  limpar(el, h('div', { class: 'painel' },
    h('p', { class: 'suave' }, 'Pedidos aprovados que ainda não têm nota fiscal registrada.'),
    tabela([
      { titulo: 'Pedido', valor: (l) => `#${l.id}`, classe: 'nowrap' },
      { titulo: 'Cliente', valor: (l) => l.cliente_nome, principal: true },
      { titulo: 'Município', valor: (l) => (l.municipio ? `${l.municipio}/${l.uf}` : '') },
      { titulo: 'Data', valor: (l) => data(l.data) },
      { titulo: 'Vendedor', valor: (l) => l.vendedor_nome },
      { titulo: 'Total', valor: (l) => moeda(l.total), classe: 'num' },
      { titulo: 'Ações', valor: (l) => h('div', { class: 'botoes' },
        h('button', { type: 'button', class: 'btn pequeno', onClick: () => abrirFicha(l.id, recarregar) }, 'Ficha de emissão'),
        h('button', { type: 'button', class: 'btn pequeno primario', onClick: () => registrarNota(l, recarregar) }, 'Registrar NF emitida')) },
    ], linhas, { aoClicar: (l) => abrirFicha(l.id, recarregar), vazio: 'Nenhum pedido aprovado aguardando nota fiscal.' })));
}

async function abaEmitidas(el) {
  const st = { status: 'emitida', busca: '', pagina: 1, semCanhoto: '' };
  const lista = h('div');
  const fStatus = selecao('status', [['emitida', 'Emitidas (ativas)'], ['cancelada', 'Canceladas'], ['', 'Todas']], 'emitida');
  const fCanhoto = selecao('semCanhoto', [['', 'Todas'], ['1', 'Sem comprovante de entrega']], '');
  const fBusca = entrada('busca', '', { type: 'search', placeholder: 'Cliente, nº da NF ou do pedido' });
  const atualizar = () => { Object.assign(st, { status: fStatus.value, semCanhoto: fCanhoto.value, busca: fBusca.value, pagina: 1 }); carregar(); };
  fStatus.addEventListener('change', atualizar);
  fCanhoto.addEventListener('change', atualizar);
  fBusca.addEventListener('input', debounce(atualizar));
  limpar(el, h('div', { class: 'painel' },
    h('div', { class: 'filtros' }, h('label', { class: 'campo busca' }, h('span', 'Buscar'), fBusca),
      campo('Situação', fStatus), campo('Canhoto', fCanhoto)),
    lista));
  async function carregar() {
    const r = await api.get('/api/notas', st);
    limpar(lista, tabela([
      { titulo: 'NF-e', valor: (l) => `${l.numero} / série ${l.serie}`, classe: 'nowrap' },
      { titulo: 'Cliente', valor: (l) => l.cliente_nome, principal: true },
      { titulo: 'Emissão', valor: (l) => data(l.data_emissao) },
      { titulo: 'Pedido', valor: (l) => `#${l.pedido_id}` },
      { titulo: 'Valor', valor: (l) => moeda(l.valor), classe: 'num' },
      { titulo: 'Entrega (canhoto)', valor: (l) => (l.data_entrega ? data(l.data_entrega) : etiqueta('Pendente', 'amarela')) },
      { titulo: 'Situação', valor: (l) => (l.status === 'emitida' ? etiqueta('Emitida', 'verde') : etiqueta('Cancelada', 'vermelha')) },
    ], r.linhas, { aoClicar: (l) => abrirNota(l.id, carregar), vazio: 'Nenhuma nota encontrada.' }),
    paginacao({ ...r, aoMudar: (p) => { st.pagina = p; carregar(); } }));
  }
  carregar();
}

// Ficha de emissão ---------------------------------------------------------
async function abrirFicha(pedidoId, depois) {
  const f = await api.get(`/api/notas/ficha/${pedidoId}`);
  const e = f.emitente;
  const d = f.destinatario;
  const doc = h('div', { class: 'documento' },
    cabecalhoDocumento(e, 'Ficha de emissão de NF-e', `Pedido #${f.pedidoId} · gerada em ${data(hoje())}`),
    f.alertas.length ? mensagem('alerta', h('strong', 'Confira antes de emitir:'), h('ul', f.alertas.map((a) => h('li', a)))) : null,
    h('h3', 'Operação'),
    h('div', { class: 'doc-grade' },
      info('Natureza da operação', f.naturezaOperacao), info('Tipo', `Saída · ${f.operacao}`), info('Finalidade', '1 – NF-e normal'),
      info('Consumidor final', d.indicadorIE.codigo === '9' ? 'Sim' : 'Não')),
    h('h3', 'Emitente'),
    h('div', { class: 'doc-grade' },
      info('Razão social', e.razao_social), info('CNPJ', formatarCpfCnpj(e.cnpj)), info('Inscrição estadual', e.ie),
      info('Endereço', enderecoTexto(e)), info('Regime tributário', e.regime_tributario)),
    h('h3', 'Destinatário'),
    h('div', { class: 'doc-grade' },
      info('Nome / razão social', d.nome), info(d.documento.length === 14 ? 'CNPJ' : 'CPF', formatarCpfCnpj(d.documento)),
      info('Indicador da IE', d.indicadorIE.texto), info('Inscrição estadual', d.ie),
      info('Endereço', [d.logradouro, d.numero].filter(Boolean).join(', ')), info('Complemento', d.complemento),
      info('Bairro', d.bairro), info('Município/UF', [d.municipio, d.uf].filter(Boolean).join('/')),
      info('CEP', String(d.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2')), info('Telefone', d.telefone), info('E-mail', d.email)),
    h('h3', 'Produtos'),
    h('div', { class: 'doc-tabela-wrap' }, h('table', {},
      h('thead', h('tr', ['#', 'Código', 'Descrição', 'NCM', 'CFOP', 'Un.', 'Qtd.', 'V. unit.', 'V. total', 'Desc.', 'Frete',
        'CST/ CSOSN', 'BC ICMS', 'Alíq.', 'V. ICMS', 'CST PIS', 'CST COFINS'].map((t) => h('th', t)))),
      h('tbody', f.itens.map((i) => [
        h('tr', h('td', i.item), h('td', i.codigo), h('td', i.descricao), h('td', i.ncm), h('td', i.cfop), h('td', i.unidade),
          h('td', { class: 'num' }, quantidade(i.quantidade)), h('td', { class: 'num' }, decimal(i.valorUnit)),
          h('td', { class: 'num' }, decimal(i.valorTotal)), h('td', { class: 'num' }, decimal(i.desconto)), h('td', { class: 'num' }, decimal(i.frete)),
          h('td', i.cstIcms), h('td', { class: 'num' }, decimal(i.baseIcms)),
          h('td', { class: 'num' }, `${pct(i.aliquotaIcms)}${i.reducaoBase ? ` (red. ${pct(i.reducaoBase)})` : ''}`),
          h('td', { class: 'num' }, decimal(i.valorIcms)), h('td', i.cstPis), h('td', i.cstCofins)),
        i.infAdicional ? h('tr', h('td', { colspan: 17 }, h('small', `Inf. adicional do item ${i.item}: ${i.infAdicional}`))) : null,
      ])))),
    h('h3', 'Totais'),
    h('div', { class: 'doc-grade' },
      info('Valor dos produtos', moeda(f.totais.produtos)), info('Desconto', moeda(f.totais.desconto)), info('Frete', moeda(f.totais.frete)),
      info('Base de cálculo ICMS', moeda(f.totais.baseIcms)), info('Valor do ICMS', moeda(f.totais.icms)),
      info('VALOR TOTAL DA NOTA', h('strong', moeda(f.totais.nota)))),
    h('h3', 'Transporte e pagamento'),
    h('div', { class: 'doc-grade' },
      info('Modalidade do frete', `${f.frete.modalidade} – ${modalidades[f.frete.modalidade] || ''}`),
      info('Forma de pagamento', `${f.pagamento.forma} (${f.pagamento.tPag})`), info('Condição', f.pagamento.condicao)),
    f.pagamento.parcelas.length ? h('table', {}, h('thead', h('tr', h('th', 'Parcela'), h('th', 'Vencimento'), h('th', { class: 'num' }, 'Valor'))),
      h('tbody', f.pagamento.parcelas.map((p) => h('tr', h('td', `${p.numero}/${p.de}`), h('td', p.vencimento ? data(p.vencimento) : 'À vista'),
        h('td', { class: 'num' }, moeda(p.valor)))))) : null,
    h('p', { class: 'suave' }, 'Prazos em dias contados a partir de hoje (data provável de emissão). As duplicatas usarão a data de emissão registrada.'),
    h('h3', 'Informações complementares'),
    h('p', f.informacoesComplementares));

  const janela = abrirJanela({
    titulo: `Ficha de emissão – pedido #${f.pedidoId}`,
    tamanho: 'larga',
    conteudo: doc,
    botoes: [
      h('button', { type: 'button', class: 'btn', onClick: () => copiarTexto(textoFicha(f)) }, icone('copiar'), 'Copiar dados em texto'),
      h('button', { type: 'button', class: 'btn', onClick: imprimirJanela }, icone('imprimir'), 'Imprimir'),
      f.pedido.status === 'Aprovado' ? h('button', { type: 'button', class: 'btn primario', onClick: () => {
        janela.fechar();
        registrarNota({ id: f.pedidoId, total: f.pedido.total, cliente_nome: d.nome }, depois);
      } }, 'Registrar NF emitida') : null,
    ].filter(Boolean),
  });
}

export function textoFicha(f) {
  const e = f.emitente;
  const d = f.destinatario;
  const cep = (c) => String(c || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const l = [
    `FICHA DE EMISSÃO DE NF-e – PEDIDO #${f.pedidoId}`,
    '',
    `Natureza da operação: ${f.naturezaOperacao}`,
    `Operação: Saída (${f.operacao})`,
    '',
    'DESTINATÁRIO',
    `Nome: ${d.nome}`,
    `${d.documento.length === 14 ? 'CNPJ' : 'CPF'}: ${formatarCpfCnpj(d.documento)}`,
    `Indicador IE: ${d.indicadorIE.texto}`,
    `IE: ${d.ie || ''}`,
    `Endereço: ${[d.logradouro, d.numero].filter(Boolean).join(', ')}`,
    `Complemento: ${d.complemento || ''}`,
    `Bairro: ${d.bairro || ''}`,
    `Município/UF: ${[d.municipio, d.uf].filter(Boolean).join('/')}`,
    `CEP: ${cep(d.cep)}`,
    `Telefone: ${d.telefone || ''}`,
    `E-mail: ${d.email || ''}`,
    '',
    'PRODUTOS',
  ];
  for (const i of f.itens) {
    l.push(`${i.item}) ${i.codigo} – ${i.descricao}`,
      `   NCM ${i.ncm} | CFOP ${i.cfop} | Unid. ${i.unidade} | Qtd. ${quantidade(i.quantidade)} | V. unit. ${decimal(i.valorUnit)} | V. total ${decimal(i.valorTotal)}`,
      `   Desconto ${decimal(i.desconto)} | Frete ${decimal(i.frete)}`,
      `   ICMS: CST/CSOSN ${i.cstIcms} | BC ${decimal(i.baseIcms)} | Alíq. ${pct(i.aliquotaIcms)}${i.reducaoBase ? ` | Redução BC ${pct(i.reducaoBase)}` : ''} | Valor ${decimal(i.valorIcms)}`,
      `   PIS CST ${i.cstPis} | COFINS CST ${i.cstCofins}`);
    if (i.infAdicional) l.push(`   Inf. adicional: ${i.infAdicional}`);
  }
  l.push('', 'TOTAIS',
    `Produtos: ${decimal(f.totais.produtos)}`, `Desconto: ${decimal(f.totais.desconto)}`, `Frete: ${decimal(f.totais.frete)}`,
    `BC ICMS: ${decimal(f.totais.baseIcms)}`, `ICMS: ${decimal(f.totais.icms)}`, `Total da nota: ${decimal(f.totais.nota)}`,
    '', 'TRANSPORTE', `Modalidade do frete: ${f.frete.modalidade} – ${modalidades[f.frete.modalidade] || ''}`,
    '', 'PAGAMENTO', `Forma: ${f.pagamento.forma} (${f.pagamento.tPag})`, `Condição: ${f.pagamento.condicao}`,
    ...f.pagamento.parcelas.map((p) => `Parcela ${p.numero}/${p.de}: ${p.vencimento ? data(p.vencimento) : 'à vista'} – ${decimal(p.valor)}`),
    '', 'INFORMAÇÕES COMPLEMENTARES', f.informacoesComplementares);
  if (f.alertas.length) l.push('', 'ATENÇÃO', ...f.alertas.map((a) => `- ${a}`));
  return l.join('\n');
}

// Registro da NF emitida ------------------------------------------------------
async function registrarNota(pedido, depois) {
  const empresa = await obterEmpresa(true);
  const fChave = entrada('chave', '', { inputmode: 'numeric', maxlength: 54, placeholder: '0000 0000 0000 …', class: 'mono' });
  const fNumero = entrada('numero', '', { inputmode: 'numeric', maxlength: 9 });
  const fSerie = entrada('serie', '', { inputmode: 'numeric', maxlength: 3 });
  const fData = entrada('data_emissao', hoje(), { type: 'date' });
  const situacao = h('div', { 'aria-live': 'polite' });
  const conferir = () => {
    const v = fChave.value.replace(/\D/g, '');
    if (!v) { limpar(situacao); return []; }
    if (v.length < 44) { limpar(situacao, h('small', { class: 'suave' }, `${v.length} de 44 números`)); return ['A chave deve ter 44 números.']; }
    const erros = conferirChave(v, { cnpjEmpresa: empresa.cnpj, ufEmpresa: empresa.uf, numero: fNumero.value, serie: fSerie.value, dataEmissao: fData.value });
    limpar(situacao, erros.length ? mensagem('erro', h('ul', erros.map((x) => h('li', x)))) : mensagem('ok', 'Chave válida e conferida com a empresa.'));
    return erros;
  };
  fChave.addEventListener('input', () => {
    const pos = fChave.value.replace(/\D/g, '').slice(0, 44);
    fChave.value = formatarChave(pos);
    const { dados } = validarChaveNFe(pos);
    if (pos.length === 44) { fNumero.value = dados.numero; fSerie.value = dados.serie; }
    conferir();
  });
  [fNumero, fSerie, fData].forEach((i) => i.addEventListener('input', conferir));

  abrirJanela({
    titulo: `Registrar NF emitida – pedido #${pedido.id}`,
    conteudo: [
      h('p', `Cliente: ${pedido.cliente_nome} · Total do pedido: ${moeda(pedido.total)}`),
      h('div', { class: 'grade' },
        campo('Chave de acesso (44 números)', fChave, { obrigatorio: true, classe: 'largo', dica: 'Copie da Conta Azul ou do DANFE. Número e série são preenchidos pela chave.' }),
        h('div', { class: 'largo' }, situacao),
        campo('Número da NF', fNumero, { obrigatorio: true }),
        campo('Série', fSerie, { obrigatorio: true }),
        campo('Data de emissão', fData, { obrigatorio: true }),
        campo('Valor da nota (R$)', entrada('valor', decimal(pedido.total), { inputmode: 'decimal' }), { obrigatorio: true }),
        campo('Data do comprovante de entrega (canhoto)', entrada('data_entrega', '', { type: 'date' }), { dica: 'Pode ser informada depois.' })),
    ],
    botoes: [h('button', { type: 'submit', class: 'btn primario' }, 'Registrar nota')],
    aoEnviar: async (dados, { fechar }) => {
      const erros = conferir();
      if (erros.length) throw new Error(erros[0]);
      const nota = await api.post('/api/notas', { ...dados, pedido_id: pedido.id });
      fechar();
      aviso(`NF ${nota.numero} registrada. Pedido #${pedido.id} faturado.`);
      if (nota.aviso) aviso(nota.aviso, 'erro');
      depois?.();
      oferecerDuplicatas(nota);
    },
  });
}

async function oferecerDuplicatas(nota) {
  const m = await import('./duplicatas.js');
  m.oferecerGeracao(nota);
}

// Detalhes da nota ----------------------------------------------------------
async function abrirNota(id, depois) {
  const n = await api.get(`/api/notas/${id}`);
  const ativa = n.status === 'emitida';
  const fEntrega = entrada('data_entrega', n.data_entrega || '', { type: 'date' });
  let janela;
  const recarregar = () => { janela.fechar(); depois?.(); abrirNota(id, depois); };
  janela = abrirJanela({
    titulo: `NF-e ${n.numero} / série ${n.serie}`,
    conteudo: [
      h('div', { class: 'doc-grade' },
        info('Cliente', n.cliente_nome), info('CPF/CNPJ', formatarCpfCnpj(n.cliente_documento)), info('Pedido', `#${n.pedido_id}`),
        info('Emissão', data(n.data_emissao)), info('Valor', moeda(n.valor)),
        info('Situação', ativa ? etiqueta('Emitida', 'verde') : etiqueta('Cancelada', 'vermelha'))),
      info('Chave de acesso', h('span', { class: 'mono' }, formatarChave(n.chave))),
      !ativa ? info('Motivo do cancelamento', n.motivo_cancelamento) : null,
      ativa ? h('div', { class: 'grade' }, campo('Data do comprovante de entrega (canhoto)', fEntrega),
        h('div', { class: 'botoes' }, h('button', { type: 'button', class: 'btn', onClick: async () => {
          try { await api.put(`/api/notas/${id}/canhoto`, { data_entrega: fEntrega.value }); aviso('Comprovante de entrega registrado.'); depois?.(); }
          catch (e) { aviso(e.message, 'erro'); }
        } }, 'Salvar data do canhoto'))) : null,
    ],
    botoes: [
      h('button', { type: 'button', class: 'btn', onClick: () => copiarTexto(n.chave) }, icone('copiar'), 'Copiar chave'),
      h('a', { class: 'btn', href: `#/pedidos/${n.pedido_id}`, onClick: () => janela.fechar() }, 'Ver pedido'),
      ativa && !n.duplicatas ? h('button', { type: 'button', class: 'btn', onClick: () => { janela.fechar(); oferecerDuplicatas(n); } }, 'Gerar duplicatas') : null,
      n.duplicatas ? h('a', { class: 'btn', href: '#/duplicatas', onClick: () => janela.fechar() }, `Duplicatas (${n.duplicatas})`) : null,
      ativa ? h('button', { type: 'button', class: 'btn perigo', onClick: () => cancelarNota(n, recarregar) }, 'Cancelar NF') : null,
    ].filter(Boolean),
  });
}

function cancelarNota(n, depois) {
  abrirJanela({
    titulo: `Cancelar NF ${n.numero}`,
    tamanho: 'estreita',
    conteudo: [
      mensagem('alerta', 'Cancele primeiro a NF-e na Conta Azul/SEFAZ. Aqui o cancelamento apenas atualiza o controle: as duplicatas em aberto serão canceladas e o pedido voltará para "Aprovado".'),
      campo('Motivo do cancelamento', h('textarea', { name: 'motivo', rows: 3, maxlength: 300 }), { obrigatorio: true }),
    ],
    botoes: [h('button', { type: 'submit', class: 'btn perigo' }, 'Cancelar NF')],
    aoEnviar: async (d, { fechar }) => {
      if (d.motivo.trim().length < 3) throw new Error('Informe o motivo.');
      const r = await api.post(`/api/notas/${n.id}/cancelar`, d);
      fechar();
      aviso(`NF cancelada.${r.duplicatasCanceladas ? ` ${r.duplicatasCanceladas} duplicata(s) cancelada(s).` : ''}`);
      depois();
    },
  });
}
