// Regras de acesso por perfil. Usadas no servidor (middleware) e enviadas ao
// navegador para montar o menu.

export const PERFIS = ['admin', 'financeiro', 'vendedor'];
export const NOMES_PERFIS = { admin: 'Administrador', financeiro: 'Financeiro', vendedor: 'Vendedor' };

const TODOS = PERFIS;
const GESTAO = ['admin', 'financeiro'];

export const PERMISSOES = {
  inicio: TODOS,
  colaboradores: ['admin'],
  configuracoes: ['admin'],
  clientes_ver: TODOS,
  clientes_editar: TODOS,
  produtos_ver: TODOS,
  produtos_editar: GESTAO,
  pedidos: TODOS,
  pedidos_todos: GESTAO,          // ver/editar pedidos de qualquer vendedor
  pedidos_aprovar: GESTAO,        // aprovar e cancelar
  relatorios: TODOS,
  relatorios_todos: GESTAO,       // ver dados de todos os vendedores
  notas: GESTAO,
  duplicatas: GESTAO,
  contratos: GESTAO,
};

export function pode(perfil, acao) {
  return Boolean(PERMISSOES[acao]?.includes(perfil));
}

export function permissoesDoPerfil(perfil) {
  return Object.keys(PERMISSOES).filter((a) => pode(perfil, a));
}
