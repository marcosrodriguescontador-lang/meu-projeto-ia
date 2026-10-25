import type { EntradaApi, MetodoApi, SaidaApi } from '@shared/api'
import type { CodigoErro, ErroSerializado } from '@shared/erros'

export class ErroRpc extends Error {
  readonly codigo: CodigoErro
  readonly campos?: Record<string, string>
  constructor(e: ErroSerializado) {
    super(e.mensagem)
    this.codigo = e.codigo
    this.campos = e.campos
  }
}

type Ouvinte = (codigo: CodigoErro) => void
const ouvintes = new Set<Ouvinte>()
export function aoErroSessao(f: Ouvinte): () => void {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}

export async function rpc<M extends MetodoApi>(metodo: M, ...entrada: EntradaApi<M> extends void ? [] : [EntradaApi<M>]): Promise<SaidaApi<M>> {
  const r = await window.statusErp.rpc(metodo, entrada[0])
  if (!r.ok) {
    if (r.erro.codigo === 'SESSAO_BLOQUEADA' || r.erro.codigo === 'NAO_AUTENTICADO') ouvintes.forEach((f) => f(r.erro.codigo))
    throw new ErroRpc(r.erro)
  }
  return r.dados as SaidaApi<M>
}
