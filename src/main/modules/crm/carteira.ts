// Carteira: usuário sem "crm.carteira_toda" vê e atua apenas nos leads e negócios em que é o corretor
// (pessoa vinculada ao usuário) ou que ele mesmo cadastrou.
import { erro } from '@shared/erros'
import { pode, type Ator, type Infra } from '../../nucleo/contexto'
import { pessoaDoUsuario } from '../financeiro/comissoes'

export interface Carteira {
  todos: boolean
  pessoaId: number | null
  usuarioId: number | null
}

export function carteira(infra: Infra, ator: Ator): Carteira {
  return { todos: pode(ator, 'crm.carteira_toda'), pessoaId: pessoaDoUsuario(infra, ator), usuarioId: ator.id }
}

/** Condição SQL da carteira para uma tabela com colunas corretor_id e criado_por. */
export function filtroCarteira(c: Carteira, alias: string): { sql: string; params: unknown[] } {
  if (c.todos) return { sql: '1 = 1', params: [] }
  return { sql: `(${alias}.corretor_id = ? OR ${alias}.criado_por = ?)`, params: [c.pessoaId ?? -1, c.usuarioId ?? -1] }
}

export function exigirCarteira(c: Carteira, registro: { corretorId: number | null; criadoPor: number | null }): void {
  if (c.todos) return
  if ((registro.corretorId != null && registro.corretorId === c.pessoaId) || (registro.criadoPor != null && registro.criadoPor === c.usuarioId)) return
  throw erro.semPermissao()
}
