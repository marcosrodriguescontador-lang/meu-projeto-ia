// Monta a "ficha de emissão" da NF-e a partir do pedido. O sistema NÃO emite a NF-e:
// apenas organiza os dados para digitação no emissor (Conta Azul Pro).
import { gerarParcelas, descreverCondicao } from './parcelas.js';

export const NATUREZA_PADRAO = 'Venda de mercadoria adquirida ou recebida de terceiros';
// Meio de pagamento (tPag) da NF-e.
export const TPAG = { Boleto: '15 – Boleto bancário', PIX: '17 – Pagamento instantâneo (PIX)', Dinheiro: '01 – Dinheiro',
  'Cartão': '03 – Cartão de crédito / 04 – Cartão de débito', Cheque: '02 – Cheque', Outros: '99 – Outros' };
// CSTs de ICMS em que há destaque de imposto (regime normal) e CSOSN 900 (Simples Nacional).
const CST_TRIBUTADO = new Set(['00', '10', '20', '51', '70', '90', '900']);

export function indicadorIE(ie) {
  const v = String(ie ?? '').trim().toUpperCase();
  if (!v) return { codigo: '9', texto: '9 – Não contribuinte' };
  if (v === 'ISENTO') return { codigo: '2', texto: '2 – Contribuinte isento de inscrição' };
  return { codigo: '1', texto: '1 – Contribuinte ICMS' };
}

export function cfopPara(cfopProduto, ufEmpresa, ufCliente) {
  const c = String(cfopProduto || '5102').replace(/\D/g, '');
  const ajustado = ufEmpresa && ufCliente && ufEmpresa !== ufCliente ? `6${c.slice(1)}` : `5${c.slice(1)}`;
  return `${ajustado[0]}.${ajustado.slice(1)}`;
}

// Rateia um valor (centavos) proporcionalmente aos pesos; a sobra vai no último item.
export function ratear(valor, pesos) {
  const soma = pesos.reduce((s, p) => s + p, 0);
  if (!valor || !soma) return pesos.map(() => 0);
  const partes = pesos.map((p) => Math.floor((valor * p) / soma));
  partes[partes.length - 1] += valor - partes.reduce((s, p) => s + p, 0);
  return partes;
}

export function montarFicha(pedido, empresa, produtos, dataBase) {
  const cli = pedido.cliente;
  const alertas = [];
  const faltaEmp = [['razao_social', 'razão social'], ['cnpj', 'CNPJ'], ['ie', 'inscrição estadual'], ['logradouro', 'endereço'],
    ['municipio', 'município'], ['uf', 'UF'], ['cep', 'CEP']].filter(([k]) => !empresa[k]).map(([, n]) => n);
  if (faltaEmp.length) alertas.push(`Dados da empresa incompletos (Configurações): ${faltaEmp.join(', ')}.`);
  const faltaCli = [['logradouro', 'endereço'], ['municipio', 'município'], ['uf', 'UF'], ['cep', 'CEP']]
    .filter(([k]) => !cli[k]).map(([, n]) => n);
  if (faltaCli.length) alertas.push(`Cadastro do cliente incompleto: ${faltaCli.join(', ')}.`);
  if (cli.documento.length === 14 && !cli.ie) alertas.push('Cliente com CNPJ sem inscrição estadual: confirme se é contribuinte ou ISENTO.');
  if (!pedido.receituario) alertas.push('Pedido sem número do receituário agronômico (exigido na venda de agrotóxicos).');

  const descontos = ratear(pedido.desconto, pedido.itens.map((i) => i.total));
  const fretes = ratear(pedido.frete, pedido.itens.map((i) => i.total));
  const simples = /simples/i.test(empresa.regime_tributario || '');
  const totais = { produtos: 0, desconto: 0, frete: 0, baseIcms: 0, icms: 0, nota: 0 };
  const obsFiscais = new Set();

  const itens = pedido.itens.map((it, n) => {
    const pr = produtos[it.produto_id] || {};
    const faltam = [!pr.ncm && 'NCM', !pr.cst_icms && 'CST/CSOSN', !pr.cfop && 'CFOP'].filter(Boolean);
    if (faltam.length) alertas.push(`Produto ${pr.codigo || it.descricao}: falta ${faltam.join(', ')} no cadastro.`);
    const cst = pr.cst_icms || '';
    const tributado = CST_TRIBUTADO.has(cst) && !(simples && cst.length === 3 && cst !== '900');
    const bruto = it.total - descontos[n] + fretes[n];
    const base = tributado ? Math.round(bruto * (1 - (pr.reducao_base || 0) / 100)) : 0;
    const icms = tributado ? Math.round(base * (pr.aliquota_icms || 0) / 100) : 0;
    if (pr.obs_fiscal) obsFiscais.add(pr.obs_fiscal);
    totais.produtos += it.total;
    totais.desconto += descontos[n];
    totais.frete += fretes[n];
    totais.baseIcms += base;
    totais.icms += icms;
    return {
      item: n + 1, codigo: pr.codigo || it.codigo, descricao: it.descricao, ncm: pr.ncm || '', unidade: it.unidade,
      quantidade: it.quantidade, valorUnit: it.preco_unit, valorTotal: it.total, desconto: descontos[n], frete: fretes[n],
      cfop: cfopPara(pr.cfop, empresa.uf, cli.uf), cstIcms: cst, aliquotaIcms: pr.aliquota_icms || 0, reducaoBase: pr.reducao_base || 0,
      baseIcms: base, valorIcms: icms, cstPis: pr.cst_pis || '', cstCofins: pr.cst_cofins || '',
      infAdicional: [pr.registro_mapa && `Reg. MAPA nº ${pr.registro_mapa}`, pr.classe_toxicologica].filter(Boolean).join('; '),
    };
  });
  totais.nota = totais.produtos - totais.desconto + totais.frete;

  let parcelas = [];
  try {
    parcelas = gerarParcelas({ total: totais.nota, tipo: pedido.condicao_tipo, valor: pedido.condicao_valor, dataBase });
  } catch (e) {
    alertas.push(`Condição de pagamento: ${e.message}`);
  }

  const complementares = [
    `Pedido de venda nº ${pedido.id}.`,
    pedido.receituario && `Receituário agronômico nº ${pedido.receituario}.`,
    ...obsFiscais,
  ].filter(Boolean).join(' ');

  return {
    pedidoId: pedido.id,
    alertas: [...new Set(alertas)],
    emitente: empresa,
    destinatario: { ...cli, indicadorIE: indicadorIE(cli.ie) },
    naturezaOperacao: NATUREZA_PADRAO,
    operacao: empresa.uf && cli.uf && empresa.uf !== cli.uf ? 'Interestadual' : 'Interna',
    itens,
    totais,
    frete: { modalidade: pedido.modalidade_frete, valor: pedido.frete },
    pagamento: { forma: pedido.forma_pagamento, tPag: TPAG[pedido.forma_pagamento] || '', condicao: descreverCondicao(pedido.condicao_tipo, pedido.condicao_valor),
      parcelas, dataBase },
    informacoesComplementares: complementares,
  };
}
