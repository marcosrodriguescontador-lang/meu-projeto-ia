import { etiqueta, moeda } from './util.js';
import { paginaCadastro } from './cadastro.js';
import { podeUsuario } from './estado.js';

const UNIDADES = ['UN', 'L', 'KG', 'G', 'ML', 'CX', 'GL', 'BD', 'SC', 'FR', 'PCT', 'TON'];
const CLASSES = ['', 'Categoria 1 – Extremamente tóxico', 'Categoria 2 – Altamente tóxico', 'Categoria 3 – Moderadamente tóxico',
  'Categoria 4 – Pouco tóxico', 'Categoria 5 – Improvável de causar dano agudo', 'Não classificado'];

export function render(main) {
  paginaCadastro(main, {
    titulo: 'Produtos',
    nomeItem: 'produto',
    novoTexto: 'Novo produto',
    endpoint: '/api/produtos',
    buscaDica: 'Código, descrição ou registro MAPA',
    podeEditar: podeUsuario('produtos_editar'),
    colunas: [
      { titulo: 'Código', valor: (l) => l.codigo, classe: 'nowrap' },
      { titulo: 'Descrição', valor: (l) => l.descricao, principal: true },
      { titulo: 'Unid.', valor: (l) => l.unidade },
      { titulo: 'NCM', valor: (l) => l.ncm },
      { titulo: 'Preço', valor: (l) => moeda(l.preco), classe: 'num' },
      { titulo: 'Situação', valor: (l) => (l.ativo ? etiqueta('Ativo', 'verde') : etiqueta('Inativo', 'vermelha')) },
    ],
    campos: () => [
      { secao: 'Produto' },
      { nome: 'codigo', rotulo: 'Código', obrig: true, max: 30 },
      { nome: 'descricao', rotulo: 'Descrição', obrig: true, max: 200, classe: 'duplo' },
      { nome: 'unidade', rotulo: 'Unidade', tipo: 'select', opcoes: UNIDADES, padrao: 'L' },
      { nome: 'preco', rotulo: 'Preço de venda (R$)', tipo: 'moeda', obrig: true },
      { nome: 'registro_mapa', rotulo: 'Registro no MAPA', max: 30 },
      { nome: 'classe_toxicologica', rotulo: 'Classe toxicológica', tipo: 'select', opcoes: CLASSES, classe: 'duplo' },
      { secao: 'Dados fiscais (definidos pelo contador)' },
      { nome: 'ncm', rotulo: 'NCM', tipo: 'numero', max: 10, dica: '8 números (ex.: 38089199)',
        validar: (v) => (v.replace(/\D/g, '').length !== 8 ? 'O NCM deve ter 8 números.' : '') },
      { nome: 'cfop', rotulo: 'CFOP padrão (dentro do estado)', tipo: 'numero', max: 4, padrao: '5102',
        dica: 'Na ficha da NF, troca para 6.xxx se o cliente for de outra UF.',
        validar: (v) => (!/^[5-7]\d{3}$/.test(v.replace(/\D/g, '')) ? 'CFOP com 4 números (5xxx).' : '') },
      { nome: 'cst_icms', rotulo: 'CST/CSOSN do ICMS', tipo: 'numero', max: 3 },
      { nome: 'aliquota_icms', rotulo: 'Alíquota ICMS (%)', tipo: 'percentual' },
      { nome: 'reducao_base', rotulo: '% de redução da base de cálculo', tipo: 'percentual' },
      { nome: 'cst_pis', rotulo: 'CST PIS', tipo: 'numero', max: 2 },
      { nome: 'cst_cofins', rotulo: 'CST COFINS', tipo: 'numero', max: 2 },
      { nome: 'obs_fiscal', rotulo: 'Observação fiscal (vai para as informações complementares da NF)', tipo: 'textarea', max: 1000, classe: 'largo' },
      { nome: 'ativo', rotulo: 'Produto ativo', tipo: 'check', classe: 'largo' },
    ],
  });
}
