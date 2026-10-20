// Regras dos pedidos de venda (cálculo de totais e opções).

export const ORIGENS = ['Aplicativo', 'WhatsApp', 'Telefone', 'Balcão'];
export const FORMAS_PAGAMENTO = ['Boleto', 'PIX', 'Dinheiro', 'Cartão', 'Cheque', 'Outros'];
export const STATUS = ['Recebido', 'Aprovado', 'Faturado', 'Cancelado'];
// Códigos de modalidade de frete da NF-e.
export const MODALIDADES_FRETE = {
  0: 'Por conta do emitente (CIF)',
  1: 'Por conta do destinatário (FOB)',
  2: 'Por conta de terceiros',
  3: 'Transporte próprio do remetente',
  4: 'Transporte próprio do destinatário',
  9: 'Sem frete',
};

// Calcula totais a partir dos itens [{ quantidade, preco_unit }] (centavos).
export function calcularTotais(itens, desconto = 0, frete = 0) {
  const linhas = itens.map((i) => ({ ...i, total: Math.round(Number(i.quantidade) * Number(i.preco_unit)) }));
  const subtotal = linhas.reduce((s, i) => s + i.total, 0);
  return { itens: linhas, subtotal, desconto, frete, total: subtotal - desconto + frete };
}
