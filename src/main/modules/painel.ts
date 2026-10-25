import { eq, isNull, sql } from 'drizzle-orm'
import type { IndicadoresPainel } from '@shared/dto'
import { pessoa, pessoaPapel, usuario } from '../infra/db/schema'
import type { Infra } from '../nucleo/contexto'
import { backupDevido, ultimoBackupComSucesso } from './backup/backup'

export function indicadoresPainel(infra: Infra): IndicadoresPainel {
  const porPapel = infra.db
    .select({ papel: pessoaPapel.papel, n: sql<number>`count(*)` })
    .from(pessoaPapel)
    .innerJoin(pessoa, eq(pessoa.id, pessoaPapel.pessoaId))
    .where(isNull(pessoa.excluidoEm))
    .groupBy(pessoaPapel.papel)
    .all()
  const ultimo = ultimoBackupComSucesso(infra)
  return {
    pessoasPorPapel: Object.fromEntries(porPapel.map((r) => [r.papel, r.n])),
    totalPessoas: infra.db.select({ n: sql<number>`count(*)` }).from(pessoa).where(isNull(pessoa.excluidoEm)).get()!.n,
    usuariosAtivos: infra.db.select({ n: sql<number>`count(*)` }).from(usuario).where(eq(usuario.ativo, true)).get()!.n,
    ultimoBackup: ultimo ? { ts: ultimo.ts, resultado: ultimo.resultado } : null,
    backupAtrasado: backupDevido(infra)
  }
}
