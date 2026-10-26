// Contexto de execução compartilhado pelos casos de uso.
import { erro } from '@shared/erros'
import type { Permissao } from '@shared/permissoes'
import type { Banco, BancoBruto } from '../infra/db/conexao'
import type { Cofre } from '../infra/keystore'
import type { ProcessadorImagem } from '../infra/imagens'

export interface Caminhos {
  dados: string
  banco: string
  anexos: string
  backups: string
  logs: string
  cofre: string
  temporarios: string
  restauracaoPendente: string
}

export interface Chaves {
  banco: Buffer
  campos: Buffer
  anexos: Buffer
}

export interface Infra {
  db: Banco
  bruto: BancoBruto
  chaves: Chaves
  cofre: Cofre
  caminhos: Caminhos
  versaoApp: string
  estacao: string
  agora: () => Date
  imagens: ProcessadorImagem
}

export interface UsuarioSessao {
  id: number
  login: string
  nome: string
  perfilId: number
  perfilNome: string
  permissoes: ReadonlySet<Permissao>
}

/** Ator de uma operação: usuário autenticado ou o próprio sistema (rotinas automáticas). */
export type Ator = UsuarioSessao | { id: null; login: 'sistema' }

export const SISTEMA: Ator = { id: null, login: 'sistema' }

export function exigir(ator: Ator, permissao: Permissao): void {
  if (ator.id === null) return
  if (!(ator as UsuarioSessao).permissoes.has(permissao)) {
    throw erro.semPermissao()
  }
}

export function pode(ator: Ator, permissao: Permissao): boolean {
  return ator.id === null || (ator as UsuarioSessao).permissoes.has(permissao)
}

export function agoraIso(infra: Infra): string {
  return infra.agora().toISOString()
}
