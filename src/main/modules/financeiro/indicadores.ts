import type { IndicadoresFinanceiros } from '@shared/dto-financeiro'
import { adicionarDias, adicionarMeses, competenciaDe, hojeIso, primeiroDia, ultimoDia } from '@shared/financeiro/datas'
import type { Infra } from '../../nucleo/contexto'
import { listarContasFinanceiras } from './cadastros'
import { CONTAS, idConta } from './razao'

const SALDO = `(t.valor_centavos - coalesce((SELECT sum(bi.pago_centavos + bi.desconto_centavos) FROM baixa_item bi JOIN baixa b ON b.id = bi.baixa_id
  JOIN titulo_item ti ON ti.id = bi.titulo_item_id WHERE ti.titulo_id = t.id AND b.estornada = 0), 0))`

export function indicadoresFinanceiros(infra: Infra): IndicadoresFinanceiros {
  const hoje = hojeIso(infra.agora())
  const mes = competenciaDe(hoje)
  const q = <T>(s: string, ...p: unknown[]) => infra.bruto.prepare(s).get(...p) as T
  const contratos = q<{ ativos: number; vencendo: number; reajustes: number }>(
    `SELECT count(*) ativos, count(CASE WHEN data_fim BETWEEN ? AND ? THEN 1 END) vencendo,
      count(CASE WHEN proximo_reajuste <= ? THEN 1 END) reajustes FROM contrato_locacao WHERE situacao = 'ATIVO'`,
    hoje,
    adicionarDias(hoje, 60),
    adicionarDias(hoje, 45)
  )
  const receber = q<{ s: number }>(`SELECT coalesce(sum(${SALDO}), 0) s FROM titulo t WHERE t.sentido = 'RECEBER' AND t.situacao IN ('ABERTO','PARCIAL') AND t.vencimento BETWEEN ? AND ?`, hoje, ultimoDia(mes))
  const vencidos = q<{ s: number; n: number }>(`SELECT coalesce(sum(${SALDO}), 0) s, count(*) n FROM titulo t WHERE t.sentido = 'RECEBER' AND t.situacao IN ('ABERTO','PARCIAL') AND t.vencimento < ?`, hoje)
  const pendente = q<{ s: number }>(
    `SELECT coalesce(sum(s), 0) s FROM (SELECT sum(credito_centavos - debito_centavos) s FROM partida WHERE conta_gerencial_id = ? AND repasse_id IS NULL GROUP BY pessoa_id HAVING s > 0)`,
    idConta(infra, CONTAS.PROPRIETARIOS)
  )
  const repassesAbertos = q<{ s: number }>(`SELECT coalesce(sum(${SALDO}), 0) s FROM titulo t WHERE t.origem = 'REPASSE' AND t.situacao IN ('ABERTO','PARCIAL')`)
  const receitas = [CONTAS.RECEITA_ADMINISTRACAO, CONTAS.RECEITA_INTERMEDIACAO, CONTAS.RECEITA_ENCARGOS, CONTAS.RECEITA_OUTRAS].map((c) => idConta(infra, c))
  const receita = q<{ s: number }>(
    `SELECT coalesce(sum(p.credito_centavos - p.debito_centavos), 0) s FROM partida p JOIN lancamento l ON l.id = p.lancamento_id
     WHERE p.conta_gerencial_id IN (${receitas.map(() => '?').join(',')}) AND l.data BETWEEN ? AND ?`,
    ...receitas,
    primeiroDia(mes),
    ultimoDia(mes)
  )
  const inicio = adicionarMeses(mes, -11)
  const porMes = infra.bruto
    .prepare(
      `SELECT substr(l.data, 1, 7) competencia,
         coalesce(sum(CASE WHEN cg.codigo LIKE '3.%' THEN p.credito_centavos - p.debito_centavos END), 0) receitas,
         coalesce(sum(CASE WHEN cg.codigo LIKE '4.%' THEN p.debito_centavos - p.credito_centavos END), 0) despesas
       FROM partida p JOIN lancamento l ON l.id = p.lancamento_id JOIN conta_gerencial cg ON cg.id = p.conta_gerencial_id
       WHERE (cg.codigo LIKE '3.%' OR cg.codigo LIKE '4.%') AND l.data BETWEEN ? AND ? GROUP BY 1`
    )
    .all(primeiroDia(inicio), ultimoDia(mes)) as { competencia: string; receitas: number; despesas: number }[]
  const mensal = Array.from({ length: 12 }, (_, i) => {
    const c = adicionarMeses(inicio, i)
    const r = porMes.find((x) => x.competencia === c)
    return { competencia: c, receitas: r?.receitas ?? 0, despesas: r?.despesas ?? 0 }
  })
  return {
    mensal,
    contratosAtivos: contratos.ativos,
    contratosVencendo60: contratos.vencendo,
    receberMesCentavos: receber.s,
    vencidosCentavos: vencidos.s,
    vencidosQuantidade: vencidos.n,
    repassesPendentesCentavos: pendente.s + repassesAbertos.s,
    receitaPropriaMesCentavos: receita.s,
    saldoContasCentavos: listarContasFinanceiras(infra, { id: null, login: 'sistema' }).reduce((s, c) => s + c.saldoAtualCentavos, 0),
    reajustesPendentes: contratos.reajustes
  }
}
