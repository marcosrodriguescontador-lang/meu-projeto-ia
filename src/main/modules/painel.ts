import { eq, isNull, sql } from 'drizzle-orm'
import type { IndicadoresCrm, IndicadoresPainel } from '@shared/dto'
import { adicionarDias, agoraLocal } from '@shared/financeiro/datas'
import { pessoa, pessoaPapel, usuario } from '../infra/db/schema'
import { pode, type Ator, type Infra } from '../nucleo/contexto'
import { indicadoresImoveis } from './imoveis/imoveis'
import { indicadoresFinanceiros } from './financeiro/indicadores'
import { backupDevido, ultimoBackupComSucesso } from './backup/backup'
import { carteira, filtroCarteira } from './crm/carteira'

export function indicadoresPainel(infra: Infra, ator: Ator): IndicadoresPainel {
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
    backupAtrasado: backupDevido(infra),
    imoveis: pode(ator, 'imoveis.ver') ? indicadoresImoveis(infra) : null,
    financeiro: pode(ator, 'financeiro.ver') ? indicadoresFinanceiros(infra) : null,
    crm: pode(ator, 'crm.ver') ? indicadoresCrm(infra, ator) : null
  }
}

function indicadoresCrm(infra: Infra, ator: Ator): IndicadoresCrm {
  const c = filtroCarteira(carteira(infra, ator), 'n')
  const cl = filtroCarteira(carteira(infra, ator), 'l')
  const agora = agoraLocal(infra.agora())
  const hoje = agora.slice(0, 10)
  const abertos = infra.bruto
    .prepare(`SELECT n.tipo, count(*) q FROM negocio n WHERE n.etapa NOT IN ('CONCLUIDO','PERDIDO') AND ${c.sql} GROUP BY n.tipo`)
    .all(...c.params) as { tipo: string; q: number }[]
  const tarefas = infra.bruto
    .prepare(
      `SELECT count(CASE WHEN agendada_para < ? THEN 1 END) atrasadas, count(CASE WHEN substr(agendada_para, 1, 10) = ? AND agendada_para >= ? THEN 1 END) hoje
       FROM atividade WHERE responsavel_id = ? AND concluida_em IS NULL AND cancelada_em IS NULL`
    )
    .get(agora, hoje, agora, ator.id ?? -1) as { atrasadas: number; hoje: number }
  const fimSemana = adicionarDias(hoje, 7)
  return {
    negociosVenda: abertos.find((a) => a.tipo === 'VENDA')?.q ?? 0,
    negociosLocacao: abertos.find((a) => a.tipo === 'LOCACAO')?.q ?? 0,
    leadsNovosMes: (infra.bruto.prepare(`SELECT count(*) q FROM lead l WHERE substr(l.criado_em, 1, 7) = ? AND ${cl.sql}`).get(hoje.slice(0, 7), ...cl.params) as { q: number }).q,
    tarefasHoje: tarefas.hoje,
    tarefasAtrasadas: tarefas.atrasadas,
    visitasProximos7Dias: (
      infra.bruto
        .prepare(`SELECT count(*) q FROM visita v WHERE v.situacao = 'AGENDADA' AND v.data_hora BETWEEN ? AND ? AND ${filtroCarteira(carteira(infra, ator), 'v').sql}`)
        .get(agora, `${fimSemana}T23:59`, ...filtroCarteira(carteira(infra, ator), 'v').params) as { q: number }
    ).q
  }
}
