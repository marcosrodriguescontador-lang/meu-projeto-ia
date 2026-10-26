// Roteador RPC: única porta de entrada da interface. Aplica autenticação, sessão e tratamento de erros.
import { ZodError } from 'zod'
import type { EntradaApi, MetodoApi, RespostaRpc, SaidaApi } from '@shared/api'
import { ErroAplicacao, type ErroSerializado } from '@shared/erros'
import { log } from '../infra/logger'
import type { Infra, UsuarioSessao } from '../nucleo/contexto'
import type { Autenticacao } from '../modules/seguranca/autenticacao'

export interface ContextoRpc {
  infra: Infra
  auth: Autenticacao
  /** Usuário autenticado (ausente em métodos públicos). */
  ator: UsuarioSessao
}

export interface DefinicaoMetodo<M extends MetodoApi> {
  /** Não exige sessão (ex.: login, estado do sistema). */
  publico?: boolean
  /** Permite chamar com troca de senha pendente. */
  permitirTrocaPendente?: boolean
  executar: (ctx: ContextoRpc, entrada: EntradaApi<M>) => SaidaApi<M> | Promise<SaidaApi<M>>
}

export type Metodos = { [M in MetodoApi]: DefinicaoMetodo<M> }

export function serializarErro(e: unknown): ErroSerializado {
  if (e instanceof ErroAplicacao) return e.serializar()
  if (e instanceof ZodError) {
    const campos: Record<string, string> = {}
    for (const i of e.issues) campos[i.path.join('.')] ??= i.message
    return { codigo: 'VALIDACAO', mensagem: e.issues[0]?.message ?? 'Dados inválidos.', campos }
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (/UNIQUE constraint failed/i.test(msg)) return { codigo: 'CONFLITO', mensagem: 'Registro duplicado.' }
  if (/FOREIGN KEY constraint failed/i.test(msg)) return { codigo: 'REGRA_NEGOCIO', mensagem: 'Operação bloqueada: existem registros vinculados.' }
  log.erro('Erro interno', e)
  return { codigo: 'INTERNO', mensagem: 'Erro inesperado. A operação não foi concluída e nenhum dado foi alterado. Detalhes no log técnico.' }
}

export function criarDespachante(obterInfra: () => { infra: Infra; auth: Autenticacao } | null, metodos: Metodos) {
  return async function despachar(metodo: string, entrada: unknown): Promise<RespostaRpc<unknown>> {
    try {
      const def = (metodos as Record<string, DefinicaoMetodo<MetodoApi>>)[metodo]
      if (!def) throw new ErroAplicacao('NAO_ENCONTRADO', `Operação desconhecida: ${metodo}`)
      const base = obterInfra()
      if (!base) {
        if (!def.publico) throw new ErroAplicacao('INTERNO', 'Sistema não inicializado.')
        return { ok: true, dados: await def.executar({ infra: null as never, auth: null as never, ator: null as never }, entrada as never) }
      }
      const ator = def.publico ? (base.auth.sessao.atual() as UsuarioSessao) : base.auth.sessao.exigirAtivo(def.permitirTrocaPendente)
      const dados = await def.executar({ ...base, ator }, entrada as never)
      return { ok: true, dados }
    } catch (e) {
      return { ok: false, erro: serializarErro(e) }
    }
  }
}
