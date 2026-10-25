// Configurações do sistema persistidas no banco (tabela `configuracao`, valores JSON).
import { eq } from 'drizzle-orm'
import type { EmpresaConfig } from '@shared/dto'
import type { BackupConfig, SegurancaConfig } from '@shared/schemas'
import { configuracao } from '../../infra/db/schema'
import { agoraIso, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'

export const PADROES = {
  seguranca: { inatividadeMinutos: 10, tentativasBloqueio: 5, minutosBloqueio: 15 } satisfies SegurancaConfig,
  backup: { automatico: true, intervaloHoras: 24, destino: null, reterQuantidade: 30 } satisfies BackupConfig
}

interface Mapa {
  empresa: EmpresaConfig
  seguranca: SegurancaConfig
  backup: BackupConfig
}

export function lerConfig<K extends keyof Mapa>(infra: Infra, chave: K): Mapa[K] | null {
  const r = infra.db.select().from(configuracao).where(eq(configuracao.chave, chave)).get()
  if (!r) return (PADROES as Partial<Mapa>)[chave] ?? null
  return { ...((PADROES as Partial<Mapa>)[chave] ?? {}), ...JSON.parse(r.valor) } as Mapa[K]
}

export function gravarConfig<K extends keyof Mapa>(infra: Infra, ator: Ator, chave: K, valor: Mapa[K]): void {
  infra.bruto.transaction(() => {
    const existente = infra.db.select().from(configuracao).where(eq(configuracao.chave, chave)).get()
    const antes = existente ? lerConfig(infra, chave) : undefined
    const json = JSON.stringify(valor)
    infra.db
      .insert(configuracao)
      .values({ chave, valor: json, atualizadoPor: ator.id })
      .onConflictDoUpdate({ target: configuracao.chave, set: { valor: json, atualizadoEm: agoraIso(infra), atualizadoPor: ator.id } })
      .run()
    auditar(infra, ator, { acao: existente ? 'CONFIG_ALTERADA' : 'CONFIG_DEFINIDA', entidade: 'configuracao', entidadeId: chave, antes, depois: valor })
  })()
}
