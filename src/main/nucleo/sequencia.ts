import { sql } from 'drizzle-orm'
import type { Banco } from '../infra/db/conexao'

/** Próximo número de uma sequência (deve ser chamado dentro de transação). */
export function proximoNumero(db: Banco, nome: string): number {
  const r = db.get<{ proximo: number }>(sql`
    INSERT INTO sequencia (nome, proximo) VALUES (${nome}, 2)
    ON CONFLICT(nome) DO UPDATE SET proximo = proximo + 1
    RETURNING proximo - 1 AS proximo`)
  return r.proximo
}
