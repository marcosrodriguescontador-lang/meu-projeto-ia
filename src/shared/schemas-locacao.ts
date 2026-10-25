import { z } from 'zod'
import { validarCompetencia } from './financeiro/datas'
import { chaves, dataIso, id, moeda, obrigatorio, opcional, percentual } from './schemas'

export const TIPOS_CONTRATO = { RESIDENCIAL: 'Residencial', COMERCIAL: 'Comercial' } as const
export const SITUACOES_CONTRATO = { RASCUNHO: 'Rascunho', ATIVO: 'Ativo', ENCERRADO: 'Encerrado', RESCINDIDO: 'Rescindido' } as const
export const GARANTIAS = {
  SEM_GARANTIA: 'Sem garantia',
  CAUCAO: 'Caução em dinheiro',
  FIANCA: 'Fiança (fiador)',
  SEGURO_FIANCA: 'Seguro-fiança',
  TITULO_CAPITALIZACAO: 'Título de capitalização'
} as const
export const TIPOS_ENCARGO = { CONDOMINIO: 'Condomínio', IPTU: 'IPTU', SEGURO_INCENDIO: 'Seguro incêndio', TAXA_LIXO: 'Taxa de lixo', OUTRO: 'Outro' } as const
export const DESTINOS_ITEM = { PROPRIETARIO: 'Proprietário (repassado)', TERCEIRO: 'Terceiro (ex.: condomínio, prefeitura)', IMOBILIARIA: 'Imobiliária (receita própria)' } as const
export const DESTINOS_ENCARGOS_ATRASO = { PROPRIETARIO: 'Proprietário', IMOBILIARIA: 'Imobiliária' } as const
export const FORMAS_PAGAMENTO = { PIX: 'PIX', BOLETO: 'Boleto', TRANSFERENCIA: 'TED/transferência', DINHEIRO: 'Dinheiro', CHEQUE: 'Cheque', CARTAO: 'Cartão', DEPOSITO: 'Depósito' } as const
export const TIPOS_CONTA_FINANCEIRA = { CAIXA: 'Caixa', CORRENTE: 'Conta corrente', POUPANCA: 'Poupança', APLICACAO: 'Aplicação', PAGAMENTO: 'Conta de pagamento' } as const
export const SITUACOES_TITULO = { ABERTO: 'Em aberto', PARCIAL: 'Parcial', LIQUIDADO: 'Liquidado', CANCELADO: 'Cancelado', RENEGOCIADO: 'Renegociado' } as const
export const ORIGENS_TITULO = {
  COBRANCA_LOCACAO: 'Aluguel',
  CAUCAO: 'Caução',
  RESCISAO: 'Rescisão',
  RENEGOCIACAO: 'Renegociação',
  REPASSE: 'Repasse ao proprietário',
  PAGAMENTO_TERCEIRO: 'Pagamento a terceiro',
  DEVOLUCAO_CAUCAO: 'Devolução de caução'
} as const

const competencia = z.string().refine(validarCompetencia, 'Competência inválida (AAAA-MM)')

export const encargoSchema = z
  .object({
    tipo: z.enum(chaves(TIPOS_ENCARGO)),
    descricao: obrigatorio(120),
    valor: moeda(true),
    competenciaInicio: competencia,
    competenciaFim: competencia.nullish().or(z.literal('')).transform((v) => v || null),
    proporcional: z.boolean(),
    destino: z.enum(chaves(DESTINOS_ITEM)),
    beneficiarioId: id.nullish().transform((v) => v ?? null)
  })
  .superRefine((e, ctx) => {
    if (e.destino === 'TERCEIRO' && !e.beneficiarioId) ctx.addIssue({ code: 'custom', path: ['beneficiarioId'], message: 'Informe o terceiro beneficiário' })
    if (e.competenciaFim && e.competenciaFim < e.competenciaInicio) ctx.addIssue({ code: 'custom', path: ['competenciaFim'], message: 'Fim anterior ao início' })
  })

export const contratoSchema = z
  .object({
    imovelId: id,
    tipo: z.enum(chaves(TIPOS_CONTRATO)),
    locatarios: z.array(z.object({ pessoaId: id, principal: z.boolean() })).min(1, 'Informe ao menos um locatário'),
    fiadores: z.array(id),
    dataInicio: dataIso,
    dataFim: dataIso,
    aluguel: moeda(true),
    diaVencimento: z.union([z.string(), z.number()]).transform((v, ctx) => {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 1 || n > 31) ctx.addIssue({ code: 'custom', message: 'Dia entre 1 e 31' })
      return n
    }),
    indiceId: id.nullish().transform((v) => v ?? null),
    periodicidadeReajusteMeses: z.union([z.string(), z.number()]).transform((v) => Number(v) || 12),
    reajusteNegativo: z.boolean(),
    taxaAdministracao: percentual,
    taxaIntermediacao: percentual,
    multaAtraso: percentual,
    jurosMes: percentual,
    destinoEncargos: z.enum(chaves(DESTINOS_ENCARGOS_ATRASO)),
    multaRescisoriaAlugueis: z.union([z.string(), z.number()]).transform((v, ctx) => {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0 || n > 12) ctx.addIssue({ code: 'custom', message: 'Entre 0 e 12 aluguéis' })
      return n
    }),
    garantiaTipo: z.enum(chaves(GARANTIAS)),
    garantiaValor: moeda(false),
    garantiaSeguradora: opcional(120),
    garantiaApolice: opcional(60),
    garantiaVigenciaFim: dataIso.nullish().or(z.literal('')).transform((v) => v || null),
    observacoes: opcional(4000),
    encargos: z.array(encargoSchema)
  })
  .superRefine((c, ctx) => {
    if (c.dataFim <= c.dataInicio) ctx.addIssue({ code: 'custom', path: ['dataFim'], message: 'Término deve ser posterior ao início' })
    if (c.multaAtraso > 2000) ctx.addIssue({ code: 'custom', path: ['multaAtraso'], message: 'Multa acima de 20% (verifique o contrato)' })
    if (c.jurosMes > 1000) ctx.addIssue({ code: 'custom', path: ['jurosMes'], message: 'Juros acima de 10% a.m.' })
    if (c.taxaAdministracao > 3000) ctx.addIssue({ code: 'custom', path: ['taxaAdministracao'], message: 'Taxa acima de 30%' })
    if (c.garantiaTipo === 'CAUCAO' && !c.garantiaValor) ctx.addIssue({ code: 'custom', path: ['garantiaValor'], message: 'Informe o valor da caução' })
    if (c.garantiaTipo === 'CAUCAO' && c.garantiaValor && c.aluguel && c.garantiaValor > c.aluguel * 3)
      ctx.addIssue({ code: 'custom', path: ['garantiaValor'], message: 'Caução limitada a 3 aluguéis (art. 38, § 2º, Lei 8.245/91)' })
    if (c.garantiaTipo === 'FIANCA' && !c.fiadores.length) ctx.addIssue({ code: 'custom', path: ['fiadores'], message: 'Informe ao menos um fiador' })
    if (new Set(c.locatarios.map((l) => l.pessoaId)).size !== c.locatarios.length) ctx.addIssue({ code: 'custom', path: ['locatarios'], message: 'Locatário repetido' })
    if (c.fiadores.some((f) => c.locatarios.some((l) => l.pessoaId === f))) ctx.addIssue({ code: 'custom', path: ['fiadores'], message: 'O locatário não pode ser fiador de si mesmo' })
  })

export const lancamentoAvulsoSchema = z
  .object({
    contratoId: id,
    competencia,
    descricao: obrigatorio(200),
    valor: z.union([z.string(), z.number()]).transform((v, ctx) => {
      const t = typeof v === 'number' ? String(v) : v
      const neg = t.trim().startsWith('-')
      const c = moeda(true).safeParse(neg ? t.trim().slice(1) : t)
      if (!c.success || !c.data) {
        ctx.addIssue({ code: 'custom', message: 'Valor inválido' })
        return 0
      }
      return neg ? -c.data : c.data
    }),
    pagador: z.enum(['LOCATARIO', 'PROPRIETARIO']),
    destino: z.enum(chaves(DESTINOS_ITEM)),
    beneficiarioId: id.nullish().transform((v) => v ?? null)
  })
  .superRefine((l, ctx) => {
    if (l.destino === 'TERCEIRO' && !l.beneficiarioId) ctx.addIssue({ code: 'custom', path: ['beneficiarioId'], message: 'Informe o beneficiário' })
    if (l.valor === 0) ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Valor não pode ser zero' })
    if (l.valor < 0 && !(l.pagador === 'LOCATARIO' && l.destino === 'PROPRIETARIO'))
      ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Valor negativo só é permitido como crédito ao locatário por conta do proprietário' })
    if (l.pagador === 'PROPRIETARIO' && l.destino === 'PROPRIETARIO') ctx.addIssue({ code: 'custom', path: ['destino'], message: 'Destino inválido para débito ao proprietário' })
  })

export const contaFinanceiraSchema = z.object({
  nome: obrigatorio(80),
  tipo: z.enum(chaves(TIPOS_CONTA_FINANCEIRA)),
  bancoCodigo: opcional(3),
  agencia: opcional(10),
  conta: opcional(20),
  titularidade: z.enum(['PROPRIO', 'TERCEIROS']),
  saldoInicial: z.union([z.string(), z.number(), z.null(), z.undefined()]).transform((v) => (v == null || v === '' ? 0 : (moeda(false).parse(v) ?? 0))),
  dataSaldoInicial: dataIso,
  ativa: z.boolean()
})

export const baixaReceberSchema = z.object({
  tituloId: id,
  data: dataIso,
  valorRecebido: moeda(true),
  desconto: moeda(false).transform((v) => v ?? 0),
  dispensarEncargos: z.boolean(),
  contaFinanceiraId: id,
  forma: z.enum(chaves(FORMAS_PAGAMENTO)),
  observacao: opcional(300)
})

export const baixaPagarSchema = z.object({
  tituloId: id,
  data: dataIso,
  valor: moeda(true),
  contaFinanceiraId: id,
  forma: z.enum(chaves(FORMAS_PAGAMENTO)),
  observacao: opcional(300)
})

export const estornoSchema = z.object({ baixaId: id, motivo: obrigatorio(500).pipe(z.string().min(5, 'Descreva o motivo')) })

export const renegociacaoSchema = z.object({
  titulos: z.array(id).min(1, 'Selecione ao menos um título'),
  data: dataIso,
  incluirEncargos: z.boolean(),
  descontoEncargos: moeda(false).transform((v) => v ?? 0),
  parcelas: z.number().int().min(1).max(60),
  primeiroVencimento: dataIso,
  motivo: obrigatorio(500).pipe(z.string().min(5, 'Descreva o motivo'))
})

export const rescisaoSchema = z.object({
  contratoId: id,
  dataEntregaChaves: dataIso,
  iniciativa: z.enum(['LOCATARIO', 'LOCADOR', 'MUTUO']),
  motivo: obrigatorio(500),
  cobrarMulta: z.boolean(),
  dispensaMotivo: opcional(500)
}).refine((r) => r.cobrarMulta || !!r.dispensaMotivo, { path: ['dispensaMotivo'], message: 'Informe o motivo da dispensa da multa' })

export const aditivoSchema = z
  .object({
    contratoId: id,
    tipo: z.enum(['RENOVACAO', 'ALTERACAO_VALOR', 'OUTRO']),
    data: dataIso,
    descricao: obrigatorio(1000),
    dataFimNova: dataIso.nullish().or(z.literal('')).transform((v) => v || null),
    valorNovo: moeda(false),
    competenciaVigencia: competencia.nullish().or(z.literal('')).transform((v) => v || null)
  })
  .superRefine((a, ctx) => {
    if (a.tipo === 'RENOVACAO' && !a.dataFimNova) ctx.addIssue({ code: 'custom', path: ['dataFimNova'], message: 'Informe o novo término' })
    if ((a.tipo === 'ALTERACAO_VALOR' || a.valorNovo) && (!a.valorNovo || !a.competenciaVigencia)) ctx.addIssue({ code: 'custom', path: ['competenciaVigencia'], message: 'Informe valor e competência de vigência' })
  })

export const indiceValorSchema = z.object({
  indiceId: id,
  competencia,
  variacao: z.union([z.string(), z.number()]).transform((v, ctx) => {
    const t = typeof v === 'number' ? String(v) : v.replace('%', '').trim().replace(',', '.')
    if (!/^-?\d+(\.\d{1,4})?$/.test(t)) {
      ctx.addIssue({ code: 'custom', message: 'Percentual inválido (até 4 casas)' })
      return 0
    }
    return Math.round(Number(t) * 10_000) // % → ppm
  })
})

export type ContratoInput = z.input<typeof contratoSchema>
export type ContratoDados = z.output<typeof contratoSchema>
export type LancamentoAvulsoInput = z.input<typeof lancamentoAvulsoSchema>
export type ContaFinanceiraInput = z.input<typeof contaFinanceiraSchema>
export type BaixaReceberInput = z.input<typeof baixaReceberSchema>
export type BaixaPagarInput = z.input<typeof baixaPagarSchema>
export type RenegociacaoInput = z.input<typeof renegociacaoSchema>
export type RescisaoInput = z.input<typeof rescisaoSchema>
export type AditivoInput = z.input<typeof aditivoSchema>
export type IndiceValorInput = z.input<typeof indiceValorSchema>
