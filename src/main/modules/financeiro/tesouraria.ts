// Tesouraria: categorias, contas a pagar/receber gerais, transferências, movimentos e posição de terceiros.
import { asc, desc, eq, like } from 'drizzle-orm'
import { erro } from '@shared/erros'
import { proximoDiaUtil } from '@shared/financeiro/calendario'
import { ratear } from '@shared/financeiro/calculos'
import { adicionarMesesData, hojeIso } from '@shared/financeiro/datas'
import { categoriaSchema, tituloManualSchema, transferenciaSchema, type CategoriaInput, type TituloManualInput, type TransferenciaInput } from '@shared/schemas-locacao'
import { contaFinanceira, contaGerencial, pessoa, transferencia } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'
import { pagar, receber } from './baixas'
import { exigirContaAtiva, feriadosLocais, saldoContaFinanceira } from './cadastros'
import { CONTAS, estornarLancamento, idConta, registrarLancamento, saldoConta } from './razao'
import { criarTitulo } from './titulos'
import type { CategoriaDto, TransferenciaDto, MovimentoDto, PosicaoTerceiros } from '@shared/dto-financeiro'
export type { CategoriaDto, TransferenciaDto, MovimentoDto, PosicaoTerceiros }

// ───── Categorias (plano de contas gerencial) ─────

export function listarCategorias(infra: Infra): CategoriaDto[] {
  return infra.db
    .select({ id: contaGerencial.id, codigo: contaGerencial.codigo, nome: contaGerencial.nome, natureza: contaGerencial.natureza, sistema: contaGerencial.sistema })
    .from(contaGerencial)
    .orderBy(asc(contaGerencial.codigo))
    .all()
    .filter((c): c is CategoriaDto => c.natureza === 'RECEITA' || c.natureza === 'DESPESA')
}

/** Categorias disponíveis para lançamentos manuais (exclui receitas automáticas de locação). */
export function categoriasManuais(infra: Infra, natureza: 'RECEITA' | 'DESPESA'): CategoriaDto[] {
  const automaticas = new Set<string>([CONTAS.RECEITA_ADMINISTRACAO, CONTAS.RECEITA_INTERMEDIACAO, CONTAS.RECEITA_ENCARGOS])
  return listarCategorias(infra).filter((c) => c.natureza === natureza && !automaticas.has(c.codigo))
}

export function criarCategoria(infra: Infra, ator: Ator, entrada: CategoriaInput): CategoriaDto {
  exigir(ator, 'financeiro.contas')
  const d = categoriaSchema.parse(entrada)
  return infra.bruto.transaction(() => {
    const prefixo = d.natureza === 'RECEITA' ? '3.9.' : '4.8.'
    const ultimos = infra.db.select({ c: contaGerencial.codigo }).from(contaGerencial).where(like(contaGerencial.codigo, `${prefixo}%`)).orderBy(desc(contaGerencial.codigo)).limit(1).get()
    const n = ultimos ? Number(ultimos.c.slice(4)) + 1 : 1
    const codigo = `${prefixo}${String(n).padStart(2, '0')}`
    const nome = `${d.natureza === 'RECEITA' ? 'Receita' : 'Despesa'} — ${d.nome}`
    if (infra.db.select({ id: contaGerencial.id }).from(contaGerencial).where(eq(contaGerencial.nome, nome)).get()) throw erro.conflito('Categoria já existe.')
    const { id } = infra.db.insert(contaGerencial).values({ codigo, nome, natureza: d.natureza, recurso: 'PROPRIO', sistema: false }).returning({ id: contaGerencial.id }).get()
    auditar(infra, ator, { acao: 'CATEGORIA_CRIADA', entidade: 'conta_gerencial', entidadeId: id, descricao: `${codigo} ${nome}` })
    return { id, codigo, nome, natureza: d.natureza, sistema: false }
  })()
}

// ───── Contas a pagar e a receber gerais ─────

/**
 * Título manual da imobiliária (despesa a pagar ou receita própria a receber), com parcelamento.
 * Opcionalmente já quitado (ex.: tarifa debitada, receita recebida no ato).
 */
export function criarTituloManual(infra: Infra, ator: Ator, entrada: TituloManualInput): { titulos: number[] } {
  exigir(ator, entrada.sentido === 'PAGAR' ? 'financeiro.pagar' : 'financeiro.receber')
  const d = tituloManualSchema.parse(entrada)
  const cat = infra.db.select().from(contaGerencial).where(eq(contaGerencial.id, d.categoriaId)).get()
  const natureza = d.sentido === 'PAGAR' ? 'DESPESA' : 'RECEITA'
  if (!cat || cat.natureza !== natureza) throw erro.validacao(`Categoria de ${natureza.toLowerCase()} inválida.`, { categoriaId: 'Categoria inválida' })
  if (!categoriasManuais(infra, natureza).some((c) => c.id === cat.id)) throw erro.validacao('Esta receita é gerada automaticamente pelas locações.', { categoriaId: 'Categoria automática' })
  if (!infra.db.select({ id: pessoa.id }).from(pessoa).where(eq(pessoa.id, d.pessoaId)).get()) throw erro.validacao('Pessoa não encontrada.')
  const titulos = infra.bruto.transaction(() => {
    const partes = ratear(d.valor!, Array(d.parcelas).fill(1))
    const feriados = feriadosLocais(infra)
    const ids = partes.map((v, k) => {
      const venc = adicionarMesesData(d.primeiroVencimento, k)
      return criarTitulo(infra, ator, {
        sentido: d.sentido,
        origem: d.sentido === 'PAGAR' ? 'DESPESA' : 'RECEITA_PROPRIA',
        pessoaId: d.pessoaId,
        descricao: d.parcelas > 1 ? `${d.descricao} (${k + 1}/${d.parcelas})` : d.descricao,
        competencia: d.competencia,
        emissao: hojeIso(infra.agora()),
        vencimentoOriginal: venc,
        vencimento: proximoDiaUtil(venc, feriados),
        recurso: 'PROPRIO',
        itens: [{ tipo: natureza, descricao: cat.nome.replace(/^(Receita|Despesa) — /, ''), valor: v, destino: d.sentido === 'PAGAR' ? 'DESPESA' : 'IMOBILIARIA', contaGerencialId: cat.id }]
      })
    })
    auditar(infra, ator, { acao: d.sentido === 'PAGAR' ? 'DESPESA_LANCADA' : 'RECEITA_LANCADA', entidade: 'titulo', entidadeId: ids[0], descricao: `${d.descricao}: ${(d.valor! / 100).toFixed(2)} em ${d.parcelas}x (${cat.nome})` })
    return ids
  })()
  if (d.quitado) {
    const dados = { tituloId: titulos[0]!, data: d.dataQuitacao!, contaFinanceiraId: d.contaFinanceiraId!, forma: d.forma!, observacao: d.documento ?? '' }
    if (d.sentido === 'PAGAR') pagar(infra, ator, { ...dados, valor: d.valor! / 100 })
    else receber(infra, ator, { ...dados, valorRecebido: d.valor! / 100, desconto: '', dispensarEncargos: false })
  }
  return { titulos }
}

// ───── Transferências ─────

export function transferir(infra: Infra, ator: Ator, entrada: TransferenciaInput): { id: number } {
  exigir(ator, 'financeiro.pagar')
  const d = transferenciaSchema.parse(entrada)
  if (d.data > hojeIso(infra.agora())) throw erro.validacao('Data futura não permitida.')
  return infra.bruto.transaction(() => {
    const o = exigirContaAtiva(infra, d.origemId)
    const de = exigirContaAtiva(infra, d.destinoId)
    const disponivel = saldoContaFinanceira(infra, o.id)
    if (disponivel < d.valor!) throw erro.regra(`Saldo insuficiente em "${o.nome}" (disponível: ${(disponivel / 100).toFixed(2)}).`)
    if (o.titularidade === 'TERCEIROS' && de.titularidade === 'PROPRIO') {
      const livre = posicaoTerceiros(infra).recursosPropriosEmContasDeTerceiros
      if (d.valor! > livre) throw erro.regra(`Transferência retiraria recursos de terceiros: só ${(Math.max(0, livre) / 100).toFixed(2)} pertencem à imobiliária nas contas de terceiros.`)
    }
    const hist = `Transferência ${o.nome} → ${de.nome}: ${d.descricao}`
    const lancamentoId = registrarLancamento(infra, ator, {
      data: d.data,
      historico: hist,
      origem: 'TRANSFERENCIA',
      partidas: [
        { conta: CONTAS.DISPONIBILIDADES, valor: d.valor!, historico: hist, contaFinanceiraId: de.id },
        { conta: CONTAS.DISPONIBILIDADES, valor: -d.valor!, historico: hist, contaFinanceiraId: o.id }
      ]
    })
    const { id } = infra.db
      .insert(transferencia)
      .values({ data: d.data, origemId: o.id, destinoId: de.id, valorCentavos: d.valor!, descricao: d.descricao, lancamentoId, criadoEm: agoraIso(infra), criadoPor: ator.id })
      .returning({ id: transferencia.id })
      .get()
    auditar(infra, ator, { acao: 'TRANSFERENCIA_REGISTRADA', entidade: 'conta_financeira', entidadeId: o.id, descricao: `${hist} — ${(d.valor! / 100).toFixed(2)}` })
    return { id }
  })()
}

export function estornarTransferencia(infra: Infra, ator: Ator, id: number, motivo: string): void {
  exigir(ator, 'financeiro.estornar')
  if (!motivo || motivo.trim().length < 5) throw erro.validacao('Informe o motivo.')
  infra.bruto.transaction(() => {
    const t = infra.db.select().from(transferencia).where(eq(transferencia.id, id)).get()
    if (!t) throw erro.naoEncontrado('Transferência')
    if (t.estornada) throw erro.regra('Transferência já estornada.')
    if (saldoContaFinanceira(infra, t.destinoId) < t.valorCentavos) throw erro.regra('A conta de destino não tem saldo para o estorno.')
    estornarLancamento(infra, ator, t.lancamentoId, hojeIso(infra.agora()), `Estorno da transferência #${id}: ${motivo}`, false)
    infra.db.update(transferencia).set({ estornada: true, estornoMotivo: motivo.trim() }).where(eq(transferencia.id, id)).run()
    auditar(infra, ator, { acao: 'TRANSFERENCIA_ESTORNADA', entidade: 'conta_financeira', entidadeId: t.origemId, descricao: `Transferência #${id} — ${motivo.trim()}` })
  })()
}

export function listarTransferencias(infra: Infra, ator: Ator): TransferenciaDto[] {
  exigir(ator, 'financeiro.ver')
  return infra.bruto
    .prepare(
      `SELECT t.id, t.data, t.origem_id origemId, t.destino_id destinoId, o.nome origem, d.nome destino, t.valor_centavos valorCentavos, t.descricao, t.estornada
       FROM transferencia t JOIN conta_financeira o ON o.id = t.origem_id JOIN conta_financeira d ON d.id = t.destino_id ORDER BY t.data DESC, t.id DESC LIMIT 300`
    )
    .all()
    .map((r) => ({ ...(r as TransferenciaDto), estornada: !!(r as { estornada: number }).estornada }))
}

// ───── Movimentos e posição de terceiros ─────

/** Movimentos de uma conta financeira (extrato do sistema) com saldo acumulado. */
export function movimentosConta(infra: Infra, ator: Ator, contaId: number, de?: string, ate?: string): { saldoAnterior: number; movimentos: MovimentoDto[] } {
  exigir(ator, 'financeiro.ver')
  const conta = infra.db.select().from(contaFinanceira).where(eq(contaFinanceira.id, contaId)).get()
  if (!conta) throw erro.naoEncontrado('Conta financeira')
  const inicio = de ?? '0000-01-01'
  const fim = ate ?? '9999-12-31'
  const saldoAnterior = de ? saldoContaFinanceira(infra, contaId, adicionarDia(de, -1)) : conta.saldoInicialCentavos
  const linhas = infra.bruto
    .prepare(
      `SELECT p.id partidaId, l.id lancamentoId, l.data, p.historico, p.debito_centavos - p.credito_centavos valor,
        EXISTS (SELECT 1 FROM conciliacao c WHERE c.partida_id = p.id) conciliado,
        (l.estorno_de_id IS NOT NULL OR EXISTS (SELECT 1 FROM lancamento e WHERE e.estorno_de_id = l.id)) estornado
       FROM partida p JOIN lancamento l ON l.id = p.lancamento_id
       WHERE p.conta_financeira_id = ? AND p.conta_gerencial_id = ? AND l.data BETWEEN ? AND ? ORDER BY l.data, p.id`
    )
    .all(contaId, idConta(infra, CONTAS.DISPONIBILIDADES), inicio, fim) as { partidaId: number; lancamentoId: number; data: string; historico: string; valor: number; conciliado: number; estornado: number }[]
  let saldo = saldoAnterior
  return {
    saldoAnterior,
    movimentos: linhas.map((l) => {
      saldo += l.valor
      return { partidaId: l.partidaId, lancamentoId: l.lancamentoId, data: l.data, historico: l.historico, valorCentavos: l.valor, saldoCentavos: saldo, conciliado: !!l.conciliado, estornado: !!l.estornado }
    })
  }
}

function adicionarDia(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Confronta o saldo das contas de terceiros com as obrigações com terceiros (separação patrimonial). */
export function posicaoTerceiros(infra: Infra): PosicaoTerceiros {
  const contas = infra.db.select().from(contaFinanceira).all()
  const soma = (t: 'PROPRIO' | 'TERCEIROS') => contas.filter((c) => c.titularidade === t).reduce((s, c) => s + saldoContaFinanceira(infra, c.id), 0)
  const p1 = saldoConta(infra, CONTAS.PROPRIETARIOS)
  const p2 = saldoConta(infra, CONTAS.TERCEIROS)
  const p3 = saldoConta(infra, CONTAS.CAUCOES)
  const terceiros = soma('TERCEIROS')
  return {
    saldoContasTerceiros: terceiros,
    saldoContasProprias: soma('PROPRIO'),
    passivoProprietarios: p1,
    passivoTerceiros: p2,
    passivoCaucoes: p3,
    totalPassivo: p1 + p2 + p3,
    recursosPropriosEmContasDeTerceiros: terceiros - (p1 + p2 + p3)
  }
}

