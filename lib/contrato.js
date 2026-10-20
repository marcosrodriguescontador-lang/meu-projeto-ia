// Gera o texto do contrato de compra e venda (módulo ES puro, também usado no navegador).
// MODELO: o texto deve ser revisado por advogado antes do uso.
import { valorPorExtenso } from './extenso.js';
import { formatarCpfCnpj } from './validacao.js';
import { interpretarCondicao, dividirValor, descreverCondicao } from './parcelas.js';

const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const pct = (v) => `${String(Number(v) || 0).replace('.', ',')}%`;
const qtd = (q) => Number(q).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function qualificacao(p, papel) {
  const doc = String(p.documento || '').replace(/\D/g, '');
  const tipoDoc = doc.length === 14 ? 'inscrita no CNPJ sob o nº' : 'inscrito(a) no CPF sob o nº';
  return `${p.nome.toUpperCase()}, ${tipoDoc} ${formatarCpfCnpj(doc)}` +
    `${p.ie ? `, inscrição estadual nº ${p.ie}` : ''}${p.endereco ? `, com endereço em ${p.endereco}` : ''}, doravante denominado(a) ${papel}`;
}

// c: contrato; empresa: dados da empresa (Configurações).
export function gerarContrato(c, empresa) {
  const venda = c.tipo === 'venda';
  const end = [[empresa.logradouro, empresa.numero].filter(Boolean).join(', '), empresa.bairro,
    [empresa.municipio, empresa.uf].filter(Boolean).join('/'), empresa.cep && `CEP ${String(empresa.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2')}`]
    .filter(Boolean).join(', ');
  const emp = { nome: empresa.razao_social || 'AGRO S', documento: empresa.cnpj, ie: empresa.ie, endereco: end };
  const outra = { nome: c.parte_nome, documento: c.parte_documento, ie: c.parte_ie, endereco: c.parte_endereco };
  const vendedor = venda ? emp : outra;
  const comprador = venda ? outra : emp;
  const papelV = 'VENDEDOR(A)';
  const papelC = 'COMPRADOR(A)';
  const cond = interpretarCondicao(c.condicao_tipo, c.condicao_valor, c.vigencia_inicio || c.data);
  const vals = cond.vencimentos ? dividirValor(c.valor, cond.vencimentos.length) : [];
  const parcelasTxt = c.condicao_tipo === 'dias'
    ? `em ${cond.vencimentos?.length || ''} parcela(s), com vencimento em ${descreverCondicao(c.condicao_tipo, c.condicao_valor)} contados da data de emissão da nota fiscal`
    : c.condicao_tipo === 'datas'
      ? `em ${cond.vencimentos.length} parcela(s), com os seguintes vencimentos: ${cond.vencimentos.map((v, i) => `${br(v)} (${brl(vals[i])})`).join('; ')}`
      : 'à vista, no ato da entrega';
  const defensivos = c.defensivos !== false;

  const clausulas = [];
  const add = (titulo, ...paragrafos) => clausulas.push({ titulo, paragrafos: paragrafos.filter(Boolean) });

  add('DO OBJETO',
    `O presente contrato tem por objeto a compra e venda ${c.objeto ? `de ${c.objeto}` : 'dos produtos'}, conforme especificação, quantidades e preços ` +
    'relacionados no quadro de itens deste instrumento, que dele faz parte integrante.',
    'Os produtos serão acompanhados da respectiva nota fiscal eletrônica, emitida pelo(a) VENDEDOR(A) em nome do(a) COMPRADOR(A).');
  add('DO PREÇO E DA FORMA DE PAGAMENTO',
    `Pelo objeto deste contrato, o(a) COMPRADOR(A) pagará ao(à) VENDEDOR(A) o valor total de ${brl(c.valor)} (${valorPorExtenso(c.valor)}), ` +
    `por meio de ${String(c.forma_pagamento || 'boleto bancário').toLowerCase()}, ${parcelasTxt}.`,
    'O pagamento poderá ser representado por duplicata(s) de venda mercantil e/ou boleto(s) bancário(s), que o(a) COMPRADOR(A) se obriga a aceitar e pagar nos vencimentos.',
    'Os preços são fixos e irreajustáveis para as quantidades aqui contratadas, salvo acordo escrito entre as partes.');
  add('DA ENTREGA E DA TRANSFERÊNCIA DE RISCO',
    `Os produtos serão entregues em ${c.local_entrega || 'local a ser indicado pelo(a) COMPRADOR(A)'}${c.prazo_entrega ? `, no prazo de ${c.prazo_entrega}` : ''}.`,
    'No ato do recebimento, o(a) COMPRADOR(A) ou seu preposto conferirá os produtos e assinará o comprovante de entrega (canhoto da nota fiscal), ' +
    'que servirá como prova do recebimento.',
    'Os riscos sobre os produtos transferem-se ao(à) COMPRADOR(A) no momento da entrega (tradição), nos termos do art. 492 do Código Civil.');
  if (defensivos) {
    add('DAS OBRIGAÇÕES LEGAIS E DO RECEITUÁRIO AGRONÔMICO',
      'Tratando-se de agrotóxicos e afins, a venda somente se realiza mediante apresentação de receituário agronômico emitido por profissional ' +
      `legalmente habilitado${c.receituario ? ` (receituário nº ${c.receituario})` : ''}, nos termos da Lei nº 14.785/2023 e de sua regulamentação.`,
      `O(A) ${venda ? 'COMPRADOR(A)' : 'VENDEDOR(A)'} declara conhecer as instruções do rótulo, da bula e do receituário, ` +
      (venda
        ? 'obrigando-se a utilizar os produtos exclusivamente nas culturas e doses recomendadas, a fornecer e exigir o uso de equipamentos de proteção individual, ' +
          'a armazená-los adequadamente e a efetuar a tríplice lavagem (ou lavagem sob pressão) e a devolução das embalagens vazias no local indicado na nota fiscal, ' +
          'no prazo legal.'
        : 'garantindo que os produtos possuem registro válido no Ministério da Agricultura e Pecuária (MAPA), estão dentro do prazo de validade e ' +
          'acompanhados de rótulo, bula e ficha de segurança, e indicando o local de recebimento das embalagens vazias.'),
      'Cada parte responde pelas obrigações que a legislação ambiental, sanitária e de agrotóxicos lhe atribui.');
  }
  add('DA INADIMPLÊNCIA',
    `O atraso no pagamento de qualquer parcela sujeitará o(a) devedor(a) a multa de ${pct(c.multa)} sobre o valor em atraso, juros de mora de ` +
    `${pct(c.juros)} ao mês, calculados dia a dia, e atualização monetária pelo IPCA/IBGE, desde o vencimento até o efetivo pagamento.`,
    'O não pagamento de qualquer parcela autoriza o(a) credor(a) a considerar antecipadamente vencidas as demais, a levar os títulos a protesto, ' +
    'a incluir o nome do(a) devedor(a) nos cadastros de proteção ao crédito e a promover a cobrança extrajudicial ou judicial do débito, ' +
    'acrescido das despesas de cobrança e dos honorários advocatícios, na forma da lei.');
  add('DA RESCISÃO',
    'Este contrato poderá ser rescindido por qualquer das partes em caso de descumprimento de suas cláusulas pela outra parte, mediante ' +
    'notificação por escrito, sem prejuízo da cobrança dos valores devidos pelos produtos já entregues e das perdas e danos comprovados.',
    'Poderá ainda ser rescindido de comum acordo, por escrito, ajustando-se as partes quanto aos produtos já entregues e aos valores pagos.');
  add('DAS DISPOSIÇÕES GERAIS',
    `Este contrato vigora de ${br(c.vigencia_inicio) || 'a data de sua assinatura'}${c.vigencia_fim ? ` até ${br(c.vigencia_fim)}` : ' até o cumprimento integral das obrigações'}.`,
    'A tolerância de uma parte quanto ao descumprimento de qualquer obrigação pela outra não importará novação nem renúncia de direitos.',
    'Qualquer alteração deste contrato somente terá validade se feita por escrito e assinada pelas partes.',
    'As partes autorizam o tratamento de seus dados pessoais estritamente para a execução deste contrato e o cumprimento de obrigações legais, nos termos da Lei nº 13.709/2018 (LGPD).',
    'Este contrato, assinado pelas partes e por duas testemunhas, constitui título executivo extrajudicial, nos termos do art. 784, III, do Código de Processo Civil, ' +
    'e obriga as partes e seus sucessores.',
    c.observacoes ? `Observações: ${c.observacoes}` : null);
  add('DO FORO',
    `Fica eleito o foro da ${c.foro || empresa.foro || `comarca de ${empresa.municipio || '___'}`}, com renúncia a qualquer outro, por mais privilegiado que seja, ` +
    'para dirimir as dúvidas oriundas deste contrato.');

  return {
    titulo: `CONTRATO DE COMPRA E VENDA${defensivos ? ' DE INSUMOS AGRÍCOLAS' : ''} Nº ${c.id || '___'}`,
    preambulo: `Pelo presente instrumento particular, de um lado ${qualificacao(vendedor, papelV)}; e, de outro lado, ` +
      `${qualificacao(comprador, papelC)}; têm entre si justo e contratado o presente Contrato de Compra e Venda, que se regerá pelas cláusulas seguintes.`,
    itens: (c.itens || []).map((i) => ({ ...i, quantidadeTxt: qtd(i.quantidade), precoTxt: brl(i.preco_unit), totalTxt: brl(i.total) })),
    valorTxt: brl(c.valor),
    clausulas,
    fecho: 'E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, ' +
      'na presença das testemunhas abaixo.',
    localData: `${empresa.municipio || '________________'}/${empresa.uf || '__'}, ${c.data ? dataExtenso(c.data) : '____ de ______________ de ______'}.`,
    assinaturas: [
      { papel: 'VENDEDOR(A)', nome: vendedor.nome, documento: formatarCpfCnpj(vendedor.documento) },
      { papel: 'COMPRADOR(A)', nome: comprador.nome, documento: formatarCpfCnpj(comprador.documento) },
    ],
    testemunhas: [
      { nome: c.testemunha1_nome || '', cpf: c.testemunha1_cpf ? formatarCpfCnpj(c.testemunha1_cpf) : '' },
      { nome: c.testemunha2_nome || '', cpf: c.testemunha2_cpf ? formatarCpfCnpj(c.testemunha2_cpf) : '' },
    ],
  };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function dataExtenso(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
