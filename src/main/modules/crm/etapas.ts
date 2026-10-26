// Mudança de etapa do negócio com histórico append-only (base dos indicadores de conversão).
import { eq } from 'drizzle-orm'
import { SEQUENCIA_ETAPAS, type Etapa } from '@shared/schemas-crm'
import { negocio, negocioEtapaHist } from '../../infra/db/schema'
import { agoraIso, type Infra } from '../../nucleo/contexto'
import type { Autor } from '../seguranca/auditoria'

export const ordemEtapa = (e: string) => (e === 'PERDIDO' ? -1 : SEQUENCIA_ETAPAS.indexOf(e as Etapa))

export function registrarEtapa(infra: Infra, ator: Autor, negocioId: number, de: string | null, para: Etapa, observacao: string | null, extra: { motivoPerda?: string | null } = {}): void {
  const ts = agoraIso(infra)
  infra.db.insert(negocioEtapaHist).values({ negocioId, de, para, observacao, usuarioId: ator.id, ts }).run()
  if (de === null) return
  const encerra = para === 'CONCLUIDO' || para === 'PERDIDO'
  infra.db
    .update(negocio)
    .set({ etapa: para, etapaDesde: ts, encerradoEm: encerra ? ts : null, motivoPerda: para === 'PERDIDO' ? (extra.motivoPerda ?? null) : null, atualizadoEm: ts, atualizadoPor: ator.id })
    .where(eq(negocio.id, negocioId))
    .run()
}

/** Avança automaticamente (ex.: visita realizada, proposta registrada) sem nunca retroceder. */
export function avancarAte(infra: Infra, ator: Autor, negocioId: number, para: Etapa, observacao: string): void {
  const n = infra.db.select({ etapa: negocio.etapa }).from(negocio).where(eq(negocio.id, negocioId)).get()
  if (!n || n.etapa === 'PERDIDO' || n.etapa === 'CONCLUIDO') return
  if (ordemEtapa(n.etapa) < ordemEtapa(para)) registrarEtapa(infra, ator, negocioId, n.etapa, para, observacao)
}
