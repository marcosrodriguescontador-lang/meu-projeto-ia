// Relatórios gerenciais calculados a partir do razão e dos títulos.
import { formatarDocumento } from '@shared/documentos'
import { erro } from '@shared/erros'
import { percentualDe, ratear } from '@shared/financeiro/calculos'
import { adicionarDias, adicionarMeses, competenciaDe, formatarCompetencia, formatarData, hojeIso, primeiroDia, ultimoDia, validarDataIso } from '@shared/financeiro/datas'
import { ORIGENS_TITULO } from '@shared/schemas-locacao'
import type { CodigoRelatorio, ParametrosRelatorio, PontoFluxo, RelatorioDados } from '@shared/relatorios'
import { RELATORIOS } from '@shared/relatorios'
import { exigir, pode, type Ator, type Infra } from '../../nucleo/contexto'
import { locadoresDoContrato } from './baixas'
import { listarContasFinanceiras, saldoContaFinanceira } from './cadastros'
import { CONTAS, idConta, saldoConta } from './razao'
import { comissoesPorBeneficiario } from './comissoes'
import { posicaoTerceiros } from './tesouraria'
import { inadimplencia } from './titulos'
import { saldosARepassar } from './repasses'

const SALDO = `(t.valor_centavos - coalesce((SELECT sum(bi.pago_centavos + bi.desconto_centavos) FROM baixa_item bi JOIN baixa b ON b.id = bi.baixa_id
  JOIN titulo_item ti ON ti.id = bi.titulo_item_id WHERE ti.titulo_id = t.id AND b.estornada = 0), 0))`

const periodo = (p: ParametrosRelatorio, infra: Infra) => {
  const hoje = hojeIso(infra.agora())
  const de = p.de && validarDataIso(p.de) ? p.de : primeiroDia(competenciaDe(hoje))
  const ate = p.ate && validarDataIso(p.ate) ? p.ate : ultimoDia(competenciaDe(hoje))
  if (de > ate) throw erro.validacao('Período inválido.')
  return { de, ate, texto: `${formatarData(de)} a ${formatarData(ate)}` }
}

function contasPorVencimento(infra: Infra, sentido: 'RECEBER' | 'PAGAR', p: ParametrosRelatorio): RelatorioDados {
  const { de, ate, texto } = periodo(p, infra)
  const hoje = hojeIso(infra.agora())
  const situacao = p.situacao === 'TODOS' ? '' : `AND t.situacao IN ('ABERTO','PARCIAL')`
  const linhas = infra.bruto
    .prepare(
      `SELECT t.vencimento, pe.nome pessoa, t.descricao, t.origem, t.valor_centavos valor, ${SALDO} saldo, t.situacao, t.recurso
       FROM titulo t JOIN pessoa pe ON pe.id = t.pessoa_id
       WHERE t.sentido = ? AND t.vencimento BETWEEN ? AND ? AND t.situacao NOT IN ('CANCELADO','RENEGOCIADO') ${situacao} ORDER BY t.vencimento, pe.nome`
    )
    .all(sentido, de, ate) as { vencimento: string; pessoa: string; descricao: string; origem: string; valor: number; saldo: number; situacao: string; recurso: string }[]
  return {
    codigo: sentido === 'RECEBER' ? 'receber' : 'pagar',
    titulo: RELATORIOS[sentido === 'RECEBER' ? 'receber' : 'pagar'],
    subtitulo: `Vencimentos de ${texto} · ${p.situacao === 'TODOS' ? 'todas as situações' : 'em aberto'}`,
    colunas: [
      { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data' },
      { chave: 'pessoa', rotulo: sentido === 'RECEBER' ? 'Devedor' : 'Favorecido', tipo: 'texto', largura: 30 },
      { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', largura: 40 },
      { chave: 'origem', rotulo: 'Origem', tipo: 'texto' },
      { chave: 'recurso', rotulo: 'Recurso', tipo: 'texto' },
      { chave: 'situacao', rotulo: 'Situação', tipo: 'texto' },
      { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
      { chave: 'saldo', rotulo: 'Saldo', tipo: 'moeda' }
    ],
    linhas: linhas.map((l) => ({
      ...l,
      origem: ORIGENS_TITULO[l.origem as keyof typeof ORIGENS_TITULO] ?? l.origem,
      recurso: l.recurso === 'TERCEIROS' ? 'Terceiros' : 'Próprio',
      situacao: ['ABERTO', 'PARCIAL'].includes(l.situacao) && l.vencimento < hoje ? 'Vencido' : { ABERTO: 'Em aberto', PARCIAL: 'Parcial', LIQUIDADO: 'Liquidado' }[l.situacao] ?? l.situacao
    })),
    totais: { pessoa: `${linhas.length} título(s)`, valor: linhas.reduce((s, l) => s + l.valor, 0), saldo: linhas.reduce((s, l) => s + l.saldo, 0) }
  }
}

function porConta(infra: Infra, natureza: 'RECEITA' | 'DESPESA', p: ParametrosRelatorio): RelatorioDados {
  const { de, ate, texto } = periodo(p, infra)
  const linhas = infra.bruto
    .prepare(
      `SELECT g.codigo, g.nome, coalesce(sum(CASE WHEN ? = 'RECEITA' THEN pa.credito_centavos - pa.debito_centavos ELSE pa.debito_centavos - pa.credito_centavos END), 0) valor, count(pa.id) n
       FROM conta_gerencial g LEFT JOIN partida pa ON pa.conta_gerencial_id = g.id AND EXISTS (SELECT 1 FROM lancamento l WHERE l.id = pa.lancamento_id AND l.data BETWEEN ? AND ?)
       WHERE g.natureza = ? GROUP BY g.id HAVING valor <> 0 ORDER BY g.codigo`
    )
    .all(natureza, de, ate, natureza) as { codigo: string; nome: string; valor: number; n: number }[]
  const total = linhas.reduce((s, l) => s + l.valor, 0)
  return {
    codigo: natureza === 'RECEITA' ? 'receitas' : 'despesas',
    titulo: RELATORIOS[natureza === 'RECEITA' ? 'receitas' : 'despesas'],
    subtitulo: `Regime de caixa · ${texto}`,
    colunas: [
      { chave: 'codigo', rotulo: 'Conta', tipo: 'texto' },
      { chave: 'nome', rotulo: natureza === 'RECEITA' ? 'Receita' : 'Categoria', tipo: 'texto', largura: 50 },
      { chave: 'n', rotulo: 'Lançamentos', tipo: 'numero' },
      { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
      { chave: 'participacao', rotulo: '% do total', tipo: 'percentual' }
    ],
    linhas: linhas.map((l) => ({ ...l, participacao: total ? (l.valor * 10_000) / total : 0 })),
    totais: { nome: 'Total', valor: total, participacao: 10_000 },
    observacoes:
      natureza === 'RECEITA'
        ? ['Somente receitas da imobiliária. Aluguéis, condomínios e cauções recebidos são recursos de terceiros e não compõem este relatório.']
        : undefined
  }
}

/** Fluxo de caixa mensal: realizado (razão) até o mês corrente e previsto (títulos em aberto) a partir dele. */
export function fluxoCaixa(infra: Infra, ator: Ator, p: { mesesAnteriores?: number; mesesFuturos?: number; titularidade?: 'TODAS' | 'PROPRIO' | 'TERCEIROS' } = {}): PontoFluxo[] {
  exigir(ator, 'financeiro.ver')
  const hoje = hojeIso(infra.agora())
  const atual = competenciaDe(hoje)
  const tit = p.titularidade ?? 'TODAS'
  const contas = listarContasFinanceiras(infra, ator, true).filter((c) => tit === 'TODAS' || c.titularidade === tit)
  const ids = contas.map((c) => c.id)
  const inicio = adicionarMeses(atual, -(p.mesesAnteriores ?? 5))
  const fim = adicionarMeses(atual, p.mesesFuturos ?? 6)
  // Saldo de abertura: contas existentes antes do primeiro mês; contas abertas depois entram pelo saldo inicial no mês de abertura.
  const saldoInicial = contas.reduce((s, c) => s + (c.dataSaldoInicial < primeiroDia(inicio) ? saldoContaFinanceira(infra, c.id, adicionarDias(primeiroDia(inicio), -1)) : 0), 0)
  let saldo = saldoInicial
  const realizados = new Map<string, { e: number; s: number }>()
  if (ids.length) {
    const linhas = infra.bruto
      .prepare(
        `SELECT substr(l.data, 1, 7) c, sum(CASE WHEN p.debito_centavos > 0 THEN p.debito_centavos ELSE 0 END) e, sum(p.credito_centavos) s
         FROM partida p JOIN lancamento l ON l.id = p.lancamento_id
         WHERE p.conta_gerencial_id = ? AND p.conta_financeira_id IN (${ids.map(() => '?').join(',')}) AND l.origem NOT LIKE '%TRANSFERENCIA%' AND l.data >= ?
         GROUP BY c`
      )
      .all(idConta(infra, CONTAS.DISPONIBILIDADES), ...ids, primeiroDia(inicio)) as { c: string; e: number; s: number }[]
    for (const l of linhas) realizados.set(l.c, { e: l.e, s: l.s })
    // Transferências entre contas do mesmo grupo não são entradas/saídas; entre grupos distintos, são.
    if (tit !== 'TODAS') {
      const transf = infra.bruto
        .prepare(
          `SELECT substr(l.data, 1, 7) c, sum(p.debito_centavos) e, sum(p.credito_centavos) s FROM partida p JOIN lancamento l ON l.id = p.lancamento_id
           WHERE p.conta_gerencial_id = ? AND p.conta_financeira_id IN (${ids.map(() => '?').join(',')}) AND l.origem LIKE '%TRANSFERENCIA%' AND l.data >= ?
             AND NOT EXISTS (SELECT 1 FROM partida o WHERE o.lancamento_id = p.lancamento_id AND o.id <> p.id AND o.conta_financeira_id IN (${ids.map(() => '?').join(',')}))
           GROUP BY c`
        )
        .all(idConta(infra, CONTAS.DISPONIBILIDADES), ...ids, primeiroDia(inicio), ...ids) as { c: string; e: number; s: number }[]
      for (const t of transf) {
        const r = realizados.get(t.c) ?? { e: 0, s: 0 }
        realizados.set(t.c, { e: r.e + t.e, s: r.s + t.s })
      }
    }
  }
  const aberturas = new Map<string, number>()
  for (const c of contas) if (c.dataSaldoInicial >= primeiroDia(inicio)) aberturas.set(competenciaDe(c.dataSaldoInicial), (aberturas.get(competenciaDe(c.dataSaldoInicial)) ?? 0) + c.saldoInicialCentavos)
  const recursoFiltro = tit === 'TODAS' ? '' : `AND t.recurso = '${tit === 'PROPRIO' ? 'PROPRIO' : 'TERCEIROS'}'`
  const previstos = infra.bruto
    .prepare(
      `SELECT CASE WHEN t.vencimento < ? THEN ? ELSE substr(t.vencimento, 1, 7) END c, t.sentido, sum(${SALDO}) v
       FROM titulo t WHERE t.situacao IN ('ABERTO','PARCIAL') ${recursoFiltro} GROUP BY c, t.sentido`
    )
    .all(primeiroDia(atual), atual) as { c: string; sentido: string; v: number }[]
  const saida: PontoFluxo[] = []
  for (let c = inicio; c <= fim; c = adicionarMeses(c, 1)) {
    const r = realizados.get(c) ?? { e: 0, s: 0 }
    const ep = c >= atual ? previstos.filter((x) => x.c === c && x.sentido === 'RECEBER').reduce((s, x) => s + x.v, 0) : 0
    const sp = c >= atual ? previstos.filter((x) => x.c === c && x.sentido === 'PAGAR').reduce((s, x) => s + x.v, 0) : 0
    saldo += (aberturas.get(c) ?? 0) + r.e - r.s + ep - sp
    saida.push({ competencia: c, entradasRealizadas: r.e, saidasRealizadas: r.s, entradasPrevistas: ep, saidasPrevistas: sp, saldoFinal: saldo, projetado: c >= atual })
  }
  return saida
}

function relFluxo(infra: Infra, ator: Ator, p: ParametrosRelatorio): RelatorioDados {
  const pontos = fluxoCaixa(infra, ator, { mesesAnteriores: 6, mesesFuturos: 6, titularidade: p.titularidade })
  return {
    codigo: 'fluxo',
    titulo: RELATORIOS.fluxo,
    subtitulo: `Contas: ${p.titularidade === 'PROPRIO' ? 'próprias' : p.titularidade === 'TERCEIROS' ? 'de terceiros' : 'todas'} · realizado até hoje e previsto pelos títulos em aberto`,
    colunas: [
      { chave: 'competencia', rotulo: 'Mês', tipo: 'competencia' },
      { chave: 'entradasRealizadas', rotulo: 'Entradas realizadas', tipo: 'moeda' },
      { chave: 'saidasRealizadas', rotulo: 'Saídas realizadas', tipo: 'moeda' },
      { chave: 'entradasPrevistas', rotulo: 'Entradas previstas', tipo: 'moeda' },
      { chave: 'saidasPrevistas', rotulo: 'Saídas previstas', tipo: 'moeda' },
      { chave: 'saldoFinal', rotulo: 'Saldo final', tipo: 'moeda' }
    ],
    linhas: pontos.map((x) => ({ ...x, projetado: x.projetado ? 1 : 0 })),
    observacoes: ['Títulos vencidos e não pagos aparecem como previstos no mês corrente.', 'Transferências entre contas do mesmo grupo não são consideradas entradas ou saídas.']
  }
}

function relResultado(infra: Infra, p: ParametrosRelatorio): RelatorioDados {
  const ano = p.ano ?? Number(hojeIso(infra.agora()).slice(0, 4))
  const regime = p.regime ?? 'CAIXA'
  const mesExpr = regime === 'CAIXA' ? 'substr(l.data, 6, 2)' : `substr(coalesce((SELECT t.competencia FROM titulo t WHERE t.id = pa.titulo_id), l.data), 6, 2)`
  const anoExpr = regime === 'CAIXA' ? 'substr(l.data, 1, 4)' : `substr(coalesce((SELECT t.competencia FROM titulo t WHERE t.id = pa.titulo_id), l.data), 1, 4)`
  const linhas = infra.bruto
    .prepare(
      `SELECT g.codigo, g.nome, g.natureza, ${mesExpr} mes,
        sum(CASE WHEN g.natureza = 'RECEITA' THEN pa.credito_centavos - pa.debito_centavos ELSE pa.debito_centavos - pa.credito_centavos END) v
       FROM partida pa JOIN lancamento l ON l.id = pa.lancamento_id JOIN conta_gerencial g ON g.id = pa.conta_gerencial_id
       WHERE g.natureza IN ('RECEITA','DESPESA') AND ${anoExpr} = ? GROUP BY g.id, mes`
    )
    .all(String(ano)) as { codigo: string; nome: string; natureza: string; mes: string; v: number }[]
  const meses = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
  const contas = [...new Map(linhas.map((l) => [l.codigo, l])).values()].sort((a, b) => a.codigo.localeCompare(b.codigo))
  const valor = (codigo: string, mes: string) => linhas.find((l) => l.codigo === codigo && l.mes === mes)?.v ?? 0
  const soma = (nat: string, mes: string) => linhas.filter((l) => l.natureza === nat && l.mes === mes).reduce((s, l) => s + l.v, 0)
  const linha = (rotulo: string, f: (m: string) => number, destaque = '') => {
    const r: Record<string, string | number> = { conta: rotulo, destaque }
    let total = 0
    for (const m of meses) {
      const v = f(m) || 0 // evita -0 nas despesas sem movimento
      r[`m${m}`] = v
      total += v
    }
    r.total = total
    return r
  }
  const rows = [
    ...contas.filter((c) => c.natureza === 'RECEITA').map((c) => linha(c.nome, (m) => valor(c.codigo, m))),
    linha('(=) Total de receitas próprias', (m) => soma('RECEITA', m), 'subtotal'),
    ...contas.filter((c) => c.natureza === 'DESPESA').map((c) => linha(c.nome, (m) => -valor(c.codigo, m))),
    linha('(=) Total de despesas', (m) => -soma('DESPESA', m), 'subtotal'),
    linha('(=) Resultado gerencial', (m) => soma('RECEITA', m) - soma('DESPESA', m), 'total')
  ]
  return {
    codigo: 'resultado',
    titulo: RELATORIOS.resultado,
    subtitulo: `${ano} · regime de ${regime === 'CAIXA' ? 'caixa' : 'competência'}`,
    colunas: [
      { chave: 'conta', rotulo: 'Conta', tipo: 'texto', largura: 42 },
      ...meses.map((m) => ({ chave: `m${m}`, rotulo: formatarCompetencia(`${ano}-${m}`).slice(0, 3), tipo: 'moeda' as const })),
      { chave: 'total', rotulo: 'Total', tipo: 'moeda' }
    ],
    linhas: rows,
    observacoes: ['Resultado da imobiliária: receitas próprias menos despesas. Valores de proprietários e terceiros não compõem o resultado.', regime === 'COMPETENCIA' ? 'Competência pelo mês de referência do título; lançamentos sem título usam a data do lançamento.' : 'Caixa: pela data do recebimento/pagamento.']
  }
}

function relRentabilidade(infra: Infra, p: ParametrosRelatorio): RelatorioDados {
  const { de, ate, texto } = periodo(p, infra)
  const linhas = infra.bruto
    .prepare(
      `SELECT c.id, c.numero, i.codigo, i.logradouro || ', ' || i.numero || ' — ' || i.bairro imovel,
        coalesce((SELECT sum(bi.pago_centavos) FROM baixa_item bi JOIN baixa b ON b.id = bi.baixa_id JOIN titulo_item ti ON ti.id = bi.titulo_item_id JOIN titulo t ON t.id = ti.titulo_id
          WHERE t.contrato_id = c.id AND ti.tipo = 'ALUGUEL' AND b.estornada = 0 AND b.data BETWEEN ? AND ?), 0) alugueis,
        coalesce((SELECT sum(pa.credito_centavos - pa.debito_centavos) FROM partida pa JOIN lancamento l ON l.id = pa.lancamento_id WHERE pa.contrato_id = c.id AND pa.conta_gerencial_id = ? AND l.data BETWEEN ? AND ?), 0) administracao,
        coalesce((SELECT sum(pa.credito_centavos - pa.debito_centavos) FROM partida pa JOIN lancamento l ON l.id = pa.lancamento_id WHERE pa.contrato_id = c.id AND pa.conta_gerencial_id = ? AND l.data BETWEEN ? AND ?), 0) intermediacao,
        coalesce((SELECT sum(pa.credito_centavos - pa.debito_centavos) FROM partida pa JOIN lancamento l ON l.id = pa.lancamento_id WHERE pa.contrato_id = c.id AND pa.conta_gerencial_id IN (?, ?) AND l.data BETWEEN ? AND ?), 0) outras,
        coalesce((SELECT sum(${SALDO}) FROM titulo t WHERE t.contrato_id = c.id AND t.sentido = 'RECEBER' AND t.situacao IN ('ABERTO','PARCIAL') AND t.vencimento < ?), 0) vencido
       FROM contrato_locacao c JOIN imovel i ON i.id = c.imovel_id WHERE c.situacao <> 'RASCUNHO' ORDER BY c.numero`
    )
    .all(
      de,
      ate,
      idConta(infra, CONTAS.RECEITA_ADMINISTRACAO),
      de,
      ate,
      idConta(infra, CONTAS.RECEITA_INTERMEDIACAO),
      de,
      ate,
      idConta(infra, CONTAS.RECEITA_ENCARGOS),
      idConta(infra, CONTAS.RECEITA_OUTRAS),
      de,
      ate,
      hojeIso(infra.agora())
    ) as { numero: number; codigo: number; imovel: string; alugueis: number; administracao: number; intermediacao: number; outras: number; vencido: number }[]
  const rows = linhas
    .filter((l) => l.alugueis || l.administracao || l.intermediacao || l.outras || l.vencido)
    .map((l) => {
      const receita = l.administracao + l.intermediacao + l.outras
      return { contrato: l.numero, imovel: `#${l.codigo} ${l.imovel}`, alugueis: l.alugueis, administracao: l.administracao, intermediacao: l.intermediacao, outras: l.outras, receita, margem: l.alugueis ? (receita * 10_000) / l.alugueis : 0, vencido: l.vencido }
    })
  const t = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0)
  const alug = t('alugueis')
  return {
    codigo: 'rentabilidade',
    titulo: RELATORIOS.rentabilidade,
    subtitulo: `Recebimentos de ${texto}`,
    colunas: [
      { chave: 'contrato', rotulo: 'Contrato', tipo: 'numero' },
      { chave: 'imovel', rotulo: 'Imóvel', tipo: 'texto', largura: 40 },
      { chave: 'alugueis', rotulo: 'Aluguéis recebidos', tipo: 'moeda' },
      { chave: 'administracao', rotulo: 'Taxa de administração', tipo: 'moeda' },
      { chave: 'intermediacao', rotulo: 'Intermediação', tipo: 'moeda' },
      { chave: 'outras', rotulo: 'Outras receitas', tipo: 'moeda' },
      { chave: 'receita', rotulo: 'Receita da imobiliária', tipo: 'moeda' },
      { chave: 'margem', rotulo: '% sobre aluguéis', tipo: 'percentual' },
      { chave: 'vencido', rotulo: 'Vencido hoje', tipo: 'moeda' }
    ],
    linhas: rows,
    totais: { imovel: `${rows.length} contrato(s)`, alugueis: alug, administracao: t('administracao'), intermediacao: t('intermediacao'), outras: t('outras'), receita: t('receita'), margem: alug ? (t('receita') * 10_000) / alug : 0, vencido: t('vencido') }
  }
}

function relRepassar(infra: Infra, ator: Ator): RelatorioDados {
  const pendentes = saldosARepassar(infra, ator, 'PROPRIETARIO')
  const abertos = infra.bruto
    .prepare(`SELECT t.pessoa_id pessoaId, sum(${SALDO}) v FROM titulo t WHERE t.origem = 'REPASSE' AND t.situacao IN ('ABERTO','PARCIAL') GROUP BY t.pessoa_id`)
    .all() as { pessoaId: number; v: number }[]
  const pessoas = new Map<number, { pessoa: string; documento: string }>()
  for (const id of new Set([...pendentes.map((x) => x.pessoaId), ...abertos.map((x) => x.pessoaId)])) {
    const r = infra.bruto.prepare('SELECT nome, documento FROM pessoa WHERE id = ?').get(id) as { nome: string; documento: string }
    pessoas.set(id, { pessoa: r.nome, documento: formatarDocumento(r.documento) })
  }
  const rows = [...pessoas.entries()]
    .map(([id, p]) => {
      const pend = pendentes.find((x) => x.pessoaId === id)?.saldoCentavos ?? 0
      const ab = abertos.find((x) => x.pessoaId === id)?.v ?? 0
      return { ...p, aRepassar: pend, repassesAPagar: ab, total: pend + ab }
    })
    .sort((a, b) => a.pessoa.localeCompare(b.pessoa))
  const total = rows.reduce((s, r) => s + r.total, 0)
  const passivo = saldoConta(infra, CONTAS.PROPRIETARIOS)
  return {
    codigo: 'repassar',
    titulo: RELATORIOS.repassar,
    subtitulo: `Posição em ${formatarData(hojeIso(infra.agora()))}`,
    colunas: [
      { chave: 'pessoa', rotulo: 'Proprietário', tipo: 'texto', largura: 36 },
      { chave: 'documento', rotulo: 'CPF/CNPJ', tipo: 'texto' },
      { chave: 'aRepassar', rotulo: 'Saldo ainda não repassado', tipo: 'moeda' },
      { chave: 'repassesAPagar', rotulo: 'Repasses gerados a pagar', tipo: 'moeda' },
      { chave: 'total', rotulo: 'Total devido', tipo: 'moeda' }
    ],
    linhas: rows,
    totais: { pessoa: 'Total', aRepassar: rows.reduce((s, r) => s + r.aRepassar, 0), repassesAPagar: rows.reduce((s, r) => s + r.repassesAPagar, 0), total },
    observacoes: [
      total === passivo
        ? `Conferência: o total confere com o saldo da conta 2.1.01 (Proprietários — valores a repassar) no razão.`
        : `ATENÇÃO: total (${(total / 100).toFixed(2)}) difere do saldo da conta 2.1.01 (${(passivo / 100).toFixed(2)}). Acione o suporte.`
    ]
  }
}

function relTerceiros(infra: Infra): RelatorioDados {
  const p = posicaoTerceiros(infra)
  const linhas = [
    { item: 'Saldo das contas de recursos de terceiros', valor: p.saldoContasTerceiros },
    { item: '(−) Proprietários — valores a repassar', valor: -p.passivoProprietarios },
    { item: '(−) Terceiros — valores a pagar (condomínios, IPTU, prestadores)', valor: -p.passivoTerceiros },
    { item: '(−) Cauções de locatários', valor: -p.passivoCaucoes },
    { item: '(=) Recursos da imobiliária nas contas de terceiros', valor: p.recursosPropriosEmContasDeTerceiros },
    { item: 'Saldo das contas próprias', valor: p.saldoContasProprias }
  ]
  return {
    codigo: 'terceiros',
    titulo: RELATORIOS.terceiros,
    subtitulo: `Posição em ${formatarData(hojeIso(infra.agora()))}`,
    colunas: [
      { chave: 'item', rotulo: 'Item', tipo: 'texto', largura: 60 },
      { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' }
    ],
    linhas,
    observacoes: [
      p.recursosPropriosEmContasDeTerceiros < 0
        ? 'ALERTA: as contas de terceiros têm menos dinheiro do que o devido a terceiros. Recursos de terceiros podem ter sido usados ou recebidos em conta própria.'
        : 'As contas de terceiros cobrem integralmente as obrigações com terceiros. O excedente (taxas e receitas) pode ser transferido para a conta própria.'
    ]
  }
}

function relExtratoProprietario(infra: Infra, p: ParametrosRelatorio): RelatorioDados {
  if (!p.pessoaId) throw erro.validacao('Selecione o proprietário.')
  const { de, ate, texto } = periodo(p, infra)
  const conta = idConta(infra, CONTAS.PROPRIETARIOS)
  const anterior = (infra.bruto
    .prepare('SELECT coalesce(sum(pa.credito_centavos - pa.debito_centavos), 0) s FROM partida pa JOIN lancamento l ON l.id = pa.lancamento_id WHERE pa.conta_gerencial_id = ? AND pa.pessoa_id = ? AND l.data < ?')
    .get(conta, p.pessoaId, de) as { s: number }).s
  const linhas = infra.bruto
    .prepare(
      `SELECT l.data, pa.historico, pa.credito_centavos credito, pa.debito_centavos debito, pa.repasse_id repasse FROM partida pa JOIN lancamento l ON l.id = pa.lancamento_id
       WHERE pa.conta_gerencial_id = ? AND pa.pessoa_id = ? AND l.data BETWEEN ? AND ? ORDER BY l.data, pa.id`
    )
    .all(conta, p.pessoaId, de, ate) as { data: string; historico: string; credito: number; debito: number; repasse: number | null }[]
  const nome = (infra.bruto.prepare('SELECT nome FROM pessoa WHERE id = ?').get(p.pessoaId) as { nome: string } | undefined)?.nome ?? '—'
  let saldo = anterior
  return {
    codigo: 'extratoProprietario',
    titulo: `${RELATORIOS.extratoProprietario} — ${nome}`,
    subtitulo: texto,
    colunas: [
      { chave: 'data', rotulo: 'Data', tipo: 'data' },
      { chave: 'historico', rotulo: 'Histórico', tipo: 'texto', largura: 60 },
      { chave: 'credito', rotulo: 'Créditos', tipo: 'moeda' },
      { chave: 'debito', rotulo: 'Débitos', tipo: 'moeda' },
      { chave: 'saldo', rotulo: 'Saldo', tipo: 'moeda' }
    ],
    linhas: [
      { data: de, historico: 'Saldo anterior', credito: null, debito: null, saldo: anterior },
      ...linhas.map((l) => {
        saldo += l.credito - l.debito
        return { data: l.data, historico: l.historico + (l.repasse ? ` (repasse nº ${l.repasse})` : ''), credito: l.credito || null, debito: l.debito || null, saldo }
      })
    ],
    totais: { historico: 'Totais do período', credito: linhas.reduce((s, l) => s + l.credito, 0), debito: linhas.reduce((s, l) => s + l.debito, 0), saldo }
  }
}

/**
 * Base para a DIMOB: por contrato, locador e mês do pagamento — aluguel recebido (rendimento),
 * comissão (taxa) e IRRF informado, rateados pela participação exatamente como na contabilização.
 */
export function dadosDimob(infra: Infra, ano: number) {
  const baixas = infra.bruto
    .prepare(
      `SELECT t.contrato_id contratoId, substr(b.data, 6, 2) mes, ti.tipo, ti.taxa_bp taxaBp, ti.taxa_tipo taxaTipo, bi.pago_centavos pago
       FROM baixa_item bi JOIN baixa b ON b.id = bi.baixa_id JOIN titulo_item ti ON ti.id = bi.titulo_item_id JOIN titulo t ON t.id = ti.titulo_id
       WHERE b.estornada = 0 AND substr(b.data, 1, 4) = ? AND t.contrato_id IS NOT NULL AND ti.destino = 'PROPRIETARIO' AND ti.tipo IN ('ALUGUEL', 'IRRF')`
    )
    .all(String(ano)) as { contratoId: number; mes: string; tipo: string; taxaBp: number; taxaTipo: string | null; pago: number }[]
  const acc = new Map<string, { contratoId: number; locadorId: number; mes: string; aluguel: number; comissao: number; irrf: number }>()
  const locadores = new Map<number, { pessoaId: number; percentualBp: number }[]>()
  for (const b of baixas) {
    if (!locadores.has(b.contratoId)) locadores.set(b.contratoId, locadoresDoContrato(infra, b.contratoId))
    const ls = locadores.get(b.contratoId)!
    const partes = ratear(b.pago, ls.map((l) => l.percentualBp))
    partes.forEach((v, i) => {
      const k = `${b.contratoId}|${ls[i]!.pessoaId}|${b.mes}`
      const a = acc.get(k) ?? { contratoId: b.contratoId, locadorId: ls[i]!.pessoaId, mes: b.mes, aluguel: 0, comissao: 0, irrf: 0 }
      if (b.tipo === 'ALUGUEL') {
        a.aluguel += v
        if (b.taxaBp > 0 && v > 0) a.comissao += percentualDe(v, b.taxaBp)
      } else a.irrf += -v
      acc.set(k, a)
    })
  }
  return [...acc.values()].sort((a, b) => a.contratoId - b.contratoId || a.locadorId - b.locadorId || a.mes.localeCompare(b.mes))
}

function relDimob(infra: Infra, p: ParametrosRelatorio): RelatorioDados {
  const ano = p.ano ?? Number(hojeIso(infra.agora()).slice(0, 4)) - 1
  const dados = dadosDimob(infra, ano)
  const info = new Map<number, { numero: number; dataInicio: string; imovel: string; cep: string; uf: string; tipoImovel: string; locatario: string; docLocatario: string }>()
  const pessoaInfo = (id: number) => infra.bruto.prepare('SELECT nome, documento FROM pessoa WHERE id = ?').get(id) as { nome: string; documento: string }
  for (const d of dados)
    if (!info.has(d.contratoId)) {
      const c = infra.bruto
        .prepare(
          `SELECT c.numero, c.data_inicio dataInicio, i.logradouro || ', ' || i.numero || coalesce(' ' || i.complemento, '') || ' — ' || i.bairro || ', ' || i.cidade imovel, i.cep, i.uf, i.finalidade,
            (SELECT cp.pessoa_id FROM contrato_parte cp WHERE cp.contrato_id = c.id AND cp.papel = 'LOCATARIO' ORDER BY cp.principal DESC LIMIT 1) loc
           FROM contrato_locacao c JOIN imovel i ON i.id = c.imovel_id WHERE c.id = ?`
        )
        .get(d.contratoId) as { numero: number; dataInicio: string; imovel: string; cep: string; uf: string; finalidade: string; loc: number }
      const l = pessoaInfo(c.loc)
      info.set(d.contratoId, { ...c, tipoImovel: c.finalidade === 'RURAL' ? 'Rural' : 'Urbano', locatario: l.nome, docLocatario: formatarDocumento(l.documento) })
    }
  const linhas = dados.map((d) => {
    const c = info.get(d.contratoId)!
    const loc = pessoaInfo(d.locadorId)
    return {
      contrato: c.numero,
      dataContrato: c.dataInicio,
      locador: loc.nome,
      docLocador: formatarDocumento(loc.documento),
      locatario: c.locatario,
      docLocatario: c.docLocatario,
      imovel: c.imovel,
      cep: c.cep,
      uf: c.uf,
      tipoImovel: c.tipoImovel,
      mes: `${ano}-${d.mes}`,
      aluguel: d.aluguel,
      comissao: d.comissao,
      irrf: d.irrf
    }
  })
  return {
    codigo: 'dimob',
    titulo: `${RELATORIOS.dimob} — ano-calendário ${ano}`,
    subtitulo: 'Valores por locação, locador e mês do pagamento',
    colunas: [
      { chave: 'contrato', rotulo: 'Contrato', tipo: 'numero' },
      { chave: 'dataContrato', rotulo: 'Data do contrato', tipo: 'data' },
      { chave: 'locador', rotulo: 'Locador', tipo: 'texto', largura: 28 },
      { chave: 'docLocador', rotulo: 'CPF/CNPJ locador', tipo: 'texto' },
      { chave: 'locatario', rotulo: 'Locatário', tipo: 'texto', largura: 28 },
      { chave: 'docLocatario', rotulo: 'CPF/CNPJ locatário', tipo: 'texto' },
      { chave: 'imovel', rotulo: 'Imóvel', tipo: 'texto', largura: 40 },
      { chave: 'cep', rotulo: 'CEP', tipo: 'texto' },
      { chave: 'uf', rotulo: 'UF', tipo: 'texto' },
      { chave: 'tipoImovel', rotulo: 'Tipo', tipo: 'texto' },
      { chave: 'mes', rotulo: 'Mês', tipo: 'competencia' },
      { chave: 'aluguel', rotulo: 'Aluguel', tipo: 'moeda' },
      { chave: 'comissao', rotulo: 'Comissão', tipo: 'moeda' },
      { chave: 'irrf', rotulo: 'IRRF', tipo: 'moeda' }
    ],
    linhas,
    totais: { locador: `${new Set(linhas.map((l) => l.docLocador)).size} locador(es)`, aluguel: linhas.reduce((s, l) => s + l.aluguel, 0), comissao: linhas.reduce((s, l) => s + l.comissao, 0), irrf: linhas.reduce((s, l) => s + l.irrf, 0) },
    observacoes: ['Base de conferência para a DIMOB. O arquivo oficial deve ser gerado no programa da Receita Federal (ou em versão futura deste sistema).', 'Aluguel e comissão pelo mês do efetivo pagamento; IRRF conforme retenções informadas nos contratos.']
  }
}

/** Comissões por beneficiário: previsto (rateio), liberado após recebimento, pago e saldo. */
function relComissoes(infra: Infra, ator: Ator): RelatorioDados {
  const l = comissoesPorBeneficiario(infra, ator)
  const soma = (k: 'previstoCentavos' | 'liberadoCentavos' | 'pagoCentavos') => l.reduce((s, x) => s + x[k], 0)
  return {
    codigo: 'comissoes',
    titulo: RELATORIOS.comissoes,
    subtitulo: `Posição em ${formatarData(hojeIso(infra.agora()))} · comissões ativas`,
    colunas: [
      { chave: 'beneficiario', rotulo: 'Corretor / parceiro', tipo: 'texto', largura: 32 },
      { chave: 'comissoes', rotulo: 'Comissões', tipo: 'numero' },
      { chave: 'previsto', rotulo: 'Previsto (rateio)', tipo: 'moeda' },
      { chave: 'liberado', rotulo: 'Liberado', tipo: 'moeda' },
      { chave: 'pago', rotulo: 'Pago', tipo: 'moeda' },
      { chave: 'aPagar', rotulo: 'A pagar', tipo: 'moeda' },
      { chave: 'aLiberar', rotulo: 'Aguardando recebimento', tipo: 'moeda' }
    ],
    linhas: l.map((x) => ({ beneficiario: x.nome, comissoes: x.comissoes, previsto: x.previstoCentavos, liberado: x.liberadoCentavos, pago: x.pagoCentavos, aPagar: x.liberadoCentavos - x.pagoCentavos, aLiberar: x.previstoCentavos - x.liberadoCentavos })),
    totais: { beneficiario: `${l.length} beneficiário(s)`, previsto: soma('previstoCentavos'), liberado: soma('liberadoCentavos'), pago: soma('pagoCentavos'), aPagar: soma('liberadoCentavos') - soma('pagoCentavos'), aLiberar: soma('previstoCentavos') - soma('liberadoCentavos') },
    observacoes: ['A parte de cada corretor é liberada (vira conta a pagar) somente na proporção do que a imobiliária já recebeu da comissão.']
  }
}

export function gerarRelatorio(infra: Infra, ator: Ator, codigo: CodigoRelatorio, p: ParametrosRelatorio = {}): RelatorioDados {
  if (codigo === 'comissoes') return relComissoes(infra, ator)
  exigir(ator, 'financeiro.ver')
  if (codigo === 'dimob' && !pode(ator, 'pessoas.ver')) throw erro.semPermissao()
  switch (codigo) {
    case 'receber':
      return contasPorVencimento(infra, 'RECEBER', p)
    case 'pagar':
      return contasPorVencimento(infra, 'PAGAR', p)
    case 'inadimplencia': {
      const l = inadimplencia(infra, ator)
      return {
        codigo,
        titulo: RELATORIOS.inadimplencia,
        subtitulo: `Posição em ${formatarData(hojeIso(infra.agora()))} com multa e juros até a data`,
        colunas: [
          { chave: 'pessoa', rotulo: 'Devedor', tipo: 'texto', largura: 28 },
          { chave: 'descricao', rotulo: 'Título', tipo: 'texto', largura: 36 },
          { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data' },
          { chave: 'diasAtraso', rotulo: 'Dias', tipo: 'numero' },
          { chave: 'saldoCentavos', rotulo: 'Saldo', tipo: 'moeda' },
          { chave: 'encargos', rotulo: 'Multa + juros', tipo: 'moeda' },
          { chave: 'totalCentavos', rotulo: 'Total', tipo: 'moeda' }
        ],
        linhas: l.map((x) => ({ pessoa: x.pessoa, descricao: x.descricao, vencimento: x.vencimento, diasAtraso: x.diasAtraso, saldoCentavos: x.saldoCentavos, encargos: x.multaCentavos + x.jurosCentavos, totalCentavos: x.totalCentavos })),
        totais: { pessoa: `${l.length} título(s)`, saldoCentavos: l.reduce((s, x) => s + x.saldoCentavos, 0), encargos: l.reduce((s, x) => s + x.multaCentavos + x.jurosCentavos, 0), totalCentavos: l.reduce((s, x) => s + x.totalCentavos, 0) }
      }
    }
    case 'receitas':
      return porConta(infra, 'RECEITA', p)
    case 'despesas':
      return porConta(infra, 'DESPESA', p)
    case 'fluxo':
      return relFluxo(infra, ator, p)
    case 'resultado':
      return relResultado(infra, p)
    case 'rentabilidade':
      return relRentabilidade(infra, p)
    case 'repassar':
      return relRepassar(infra, ator)
    case 'terceiros':
      return relTerceiros(infra)
    case 'extratoProprietario':
      return relExtratoProprietario(infra, p)
    case 'dimob':
      return relDimob(infra, p)
    default:
      throw erro.validacao('Relatório desconhecido.')
  }
}

