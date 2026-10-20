// Estado global da sessão no navegador.
export const estado = { sessao: null, empresa: null };

export function podeUsuario(acao) {
  return Boolean(estado.sessao?.permissoes.includes(acao));
}

export const ehVendedor = () => estado.sessao?.perfil === 'vendedor';
