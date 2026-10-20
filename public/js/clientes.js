import { etiqueta, moeda } from './util.js';
import { paginaCadastro } from './cadastro.js';
import { podeUsuario } from './estado.js';
import { formatarCpfCnpj } from '/lib/validacao.js';

export const camposCliente = () => [
  { secao: 'Identificação' },
  { nome: 'nome', rotulo: 'Nome / Razão social', obrig: true, max: 150, classe: 'duplo' },
  { nome: 'documento', rotulo: 'CPF ou CNPJ', tipo: 'doc', obrig: true },
  { nome: 'ie', rotulo: 'Inscrição estadual', max: 20, dica: 'Produtor rural: IE de produtor. Sem IE: deixe vazio ou ISENTO.' },
  { secao: 'Endereço' },
  { nome: 'logradouro', rotulo: 'Endereço (rua, estrada, sítio/fazenda)', max: 150, classe: 'duplo' },
  { nome: 'numero', rotulo: 'Número', max: 20 },
  { nome: 'complemento', rotulo: 'Complemento', max: 80 },
  { nome: 'bairro', rotulo: 'Bairro / Distrito', max: 80 },
  { nome: 'municipio', rotulo: 'Município', max: 80 },
  { nome: 'uf', rotulo: 'UF', tipo: 'uf', padrao: 'SP' },
  { nome: 'cep', rotulo: 'CEP', tipo: 'cep' },
  { secao: 'Contato e crédito' },
  { nome: 'telefone', rotulo: 'Telefone / WhatsApp', tipo: 'telefone' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 254 },
  { nome: 'limite_credito', rotulo: 'Limite de crédito (R$)', tipo: 'moeda' },
  { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', max: 1000, classe: 'largo' },
  { nome: 'ativo', rotulo: 'Cliente ativo', tipo: 'check', classe: 'largo' },
];

export function render(main) {
  paginaCadastro(main, {
    titulo: 'Clientes',
    nomeItem: 'cliente',
    novoTexto: 'Novo cliente',
    endpoint: '/api/clientes',
    buscaDica: 'Nome, CPF/CNPJ ou município',
    podeEditar: podeUsuario('clientes_editar'),
    colunas: [
      { titulo: 'Nome', valor: (l) => l.nome, principal: true },
      { titulo: 'CPF/CNPJ', valor: (l) => formatarCpfCnpj(l.documento), classe: 'nowrap' },
      { titulo: 'Município', valor: (l) => (l.municipio ? `${l.municipio}/${l.uf}` : '') },
      { titulo: 'Telefone', valor: (l) => l.telefone },
      { titulo: 'Limite', valor: (l) => moeda(l.limite_credito), classe: 'num' },
      { titulo: 'Situação', valor: (l) => (l.ativo ? etiqueta('Ativo', 'verde') : etiqueta('Inativo', 'vermelha')) },
    ],
    campos: camposCliente,
  });
}
