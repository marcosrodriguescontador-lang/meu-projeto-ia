import type { FieldErrors, FieldValues, Resolver, UseFormSetError, Path } from 'react-hook-form'
import type { ZodType } from 'zod'
import { ErroRpc } from './rpc'

/** Resolver Zod para react-hook-form. Valida com o mesmo schema do backend e mantém os valores brutos. */
export function resolverZod<T extends FieldValues>(schema: ZodType): Resolver<T> {
  return async (valores) => {
    const r = schema.safeParse(valores)
    if (r.success) return { values: valores, errors: {} }
    const erros: Record<string, unknown> = {}
    for (const issue of r.error.issues) {
      const caminho = issue.path.map(String)
      let alvo = erros
      caminho.slice(0, -1).forEach((p) => {
        alvo[p] ??= {}
        alvo = alvo[p] as Record<string, unknown>
      })
      const ultimo = caminho.at(-1) ?? 'root'
      alvo[ultimo] ??= { type: 'validacao', message: issue.message }
    }
    return { values: {}, errors: erros as FieldErrors<T> }
  }
}

/** Aplica no formulário os erros de campo devolvidos pelo backend. */
export function aplicarErrosServidor<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>): string {
  if (e instanceof ErroRpc && e.campos) for (const [campo, msg] of Object.entries(e.campos)) setError(campo as Path<T>, { message: msg })
  return e instanceof Error ? e.message : 'Erro inesperado.'
}

export function erroDe(erros: unknown, caminho: string): string | undefined {
  let atual = erros as Record<string, unknown> | undefined
  for (const p of caminho.split('.')) atual = atual?.[p] as Record<string, unknown> | undefined
  return (atual as { message?: string } | undefined)?.message
}
