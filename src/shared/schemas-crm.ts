// Validações do CRM, vendas e comissões (interface e backend).
import { z } from 'zod'
import { chaves, dataIso, id, moeda, obrigatorio, opcional, percentual } from './schemas'

export const INTERESSES = { COMPRA: 'Compra', LOCACAO: 'Locação', AMBOS: 'Compra ou locação' } as const
export const SITUACOES_LEAD = { ATIVO: 'Ativo', CONVERTIDO: 'Em negociação', DESCARTADO: 'Descartado' } as const
export const TIPOS_NEGOCIO = { VENDA: 'Venda', LOCACAO: 'Locação' } as const
export const ETAPAS = {
  CAPTACAO: 'Captação',
  ATENDIMENTO: 'Atendimento',
  VISITA: 'Visita',
  PROPOSTA: 'Proposta',
  NEGOCIACAO: 'Negociação',
  CONTRATO: 'Contrato',
  CONCLUIDO: 'Concluído',
  PERDIDO: 'Perdido'
} as const
export type Etapa = keyof typeof ETAPAS
/** Etapas do funil em ordem (Perdido fica fora da sequência). */
export const SEQUENCIA_ETAPAS: Etapa[] = ['CAPTACAO', 'ATENDIMENTO', 'VISITA', 'PROPOSTA', 'NEGOCIACAO', 'CONTRATO', 'CONCLUIDO']
export const TIPOS_ATIVIDADE = { LIGACAO: 'Ligação', WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', REUNIAO: 'Reunião', TAREFA: 'Tarefa', OUTRO: 'Outro' } as const
export const SITUACOES_VISITA = { AGENDADA: 'Agendada', REALIZADA: 'Realizada', CANCELADA: 'Cancelada', NAO_COMPARECEU: 'Não compareceu' } as const
export const SITUACOES_PROPOSTA = { EM_ANALISE: 'Em análise', ACEITA: 'Aceita', RECUSADA: 'Recusada', CONTRAPROPOSTA: 'Contraproposta recebida', EXPIRADA: 'Expirada', CANCELADA: 'Cancelada' } as const
export const SITUACOES_VENDA = { CONTRATADA: 'Contratada', AGUARDANDO_FINANCIAMENTO: 'Aguardando financiamento', ESCRITURADA: 'Escriturada', CONCLUIDA: 'Concluída', DISTRATADA: 'Distratada' } as const
export const PAPEIS_RATEIO = { IMOBILIARIA: 'Imobiliária', CAPTADOR: 'Captador', VENDEDOR: 'Vendedor', GERENTE: 'Gerente', PARCEIRO: 'Parceiro', OUTRO: 'Outro' } as const
export const TIPOS_PARCELA_VENDA = { SINAL: 'Sinal', PARCELA: 'Parcela', FINANCIAMENTO: 'Financiamento', ESCRITURA: 'Pagamento na escritura' } as const
export const MOTIVOS_PERDA = ['Preço', 'Comprou/alugou outro imóvel', 'Crédito/financiamento negado', 'Desistiu', 'Sem retorno', 'Imóvel não atende', 'Outro'] as const

/** Valor monetário opcional (campo pode ser omitido). */
const moedaOpcional = moeda(false).optional().transform((v) => v ?? null)

const dataHora = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Data e hora inválidas')

export const leadSchema = z
  .object({
    nome: obrigatorio(150),
    telefone: opcional(30),
    email: z.union([z.literal(''), z.email('E-mail inválido')]).nullish().transform((v) => v || null),
    pessoaId: id.nullish().transform((v) => v ?? null),
    origemId: id,
    corretorId: id.nullish().transform((v) => v ?? null),
    interesse: z.enum(chaves(INTERESSES)),
    tipoImovel: opcional(30),
    bairros: opcional(300),
    valorMin: moedaOpcional,
    valorMax: moedaOpcional,
    dormitoriosMin: z.union([z.string(), z.number(), z.null(), z.undefined()]).optional().transform((v, ctx) => {
      if (v == null || v === '') return null
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0 || n > 20) ctx.addIssue({ code: 'custom', message: 'Número inválido' })
      return n
    }),
    observacoes: opcional(2000),
    consentimentoContato: z.boolean().default(false),
    idExterno: opcional(100)
  })
  .superRefine((l, ctx) => {
    if (!l.telefone && !l.email && !l.pessoaId) ctx.addIssue({ code: 'custom', path: ['telefone'], message: 'Informe telefone, e-mail ou vincule a uma pessoa' })
    if (l.valorMin != null && l.valorMax != null && l.valorMin > l.valorMax) ctx.addIssue({ code: 'custom', path: ['valorMax'], message: 'Menor que o mínimo' })
  })

export const negocioSchema = z
  .object({
    tipo: z.enum(chaves(TIPOS_NEGOCIO)),
    titulo: obrigatorio(150),
    leadId: id.nullish().transform((v) => v ?? null),
    clienteId: id.nullish().transform((v) => v ?? null),
    imovelId: id.nullish().transform((v) => v ?? null),
    corretorId: id.nullish().transform((v) => v ?? null),
    valorEstimado: moedaOpcional,
    etapa: z.enum(['CAPTACAO', 'ATENDIMENTO']).default('ATENDIMENTO')
  })
  .refine((n) => n.leadId || n.clienteId, { path: ['clienteId'], message: 'Informe o lead ou o cliente' })

export const moverEtapaSchema = z
  .object({ negocioId: id, etapa: z.enum(chaves(ETAPAS)), observacao: opcional(500), motivoPerda: opcional(200) })
  .refine((m) => m.etapa !== 'PERDIDO' || !!m.motivoPerda, { path: ['motivoPerda'], message: 'Informe o motivo da perda' })

export const atividadeSchema = z
  .object({
    negocioId: id.nullish().transform((v) => v ?? null),
    leadId: id.nullish().transform((v) => v ?? null),
    responsavelId: id.nullish().transform((v) => v ?? null),
    tipo: z.enum(chaves(TIPOS_ATIVIDADE)),
    titulo: obrigatorio(150),
    descricao: opcional(2000),
    agendadaPara: dataHora
  })

export const visitaSchema = z
  .object({
    imovelId: id,
    negocioId: id.nullish().transform((v) => v ?? null),
    leadId: id.nullish().transform((v) => v ?? null),
    corretorId: id.nullish().transform((v) => v ?? null),
    dataHora
  })
  .refine((v) => v.negocioId || v.leadId, { path: ['leadId'], message: 'Vincule a visita a um lead ou negócio' })

export const resultadoVisitaSchema = z
  .object({
    visitaId: id,
    situacao: z.enum(['REALIZADA', 'CANCELADA', 'NAO_COMPARECEU']),
    feedback: opcional(2000),
    avaliacao: z.union([z.number().int().min(1).max(5), z.null(), z.undefined()]).transform((v) => v ?? null)
  })

const parcelaProposta = z.object({ descricao: obrigatorio(100), valor: moeda(true), vencimento: dataIso })

export const propostaSchema = z
  .object({
    negocioId: id,
    anteriorId: id.nullish().transform((v) => v ?? null),
    autor: z.enum(['CLIENTE', 'PROPRIETARIO']),
    valor: moeda(true),
    sinal: moedaOpcional,
    parcelas: z.array(parcelaProposta).max(120).default([]),
    financiamentoBanco: opcional(80),
    financiamento: moedaOpcional,
    condicoes: opcional(2000),
    validade: dataIso.nullish().or(z.literal('')).transform((v) => v || null)
  })
  .superRefine((p, ctx) => {
    const comprometido = (p.sinal ?? 0) + (p.financiamento ?? 0) + p.parcelas.reduce((s, x) => s + (x.valor ?? 0), 0)
    if (p.valor != null && comprometido > p.valor) ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Sinal, parcelas e financiamento somam mais que o valor' })
    if ((p.financiamento ?? 0) > 0 && !p.financiamentoBanco) ctx.addIssue({ code: 'custom', path: ['financiamentoBanco'], message: 'Informe o banco' })
  })

export const responderPropostaSchema = z
  .object({ propostaId: id, situacao: z.enum(['ACEITA', 'RECUSADA', 'CANCELADA', 'EXPIRADA']), motivo: opcional(500) })
  .refine((r) => r.situacao === 'ACEITA' || !!r.motivo, { path: ['motivo'], message: 'Informe o motivo' })

const parte = z.object({ pessoaId: id, percentual })
const rateio = z.object({ papel: z.enum(chaves(PAPEIS_RATEIO)), beneficiarioId: id.nullish().transform((v) => v ?? null), percentual })

export const rateioSchema = z
  .array(rateio)
  .min(1)
  .superRefine((r, ctx) => {
    const soma = r.reduce((s, x) => s + x.percentual, 0)
    if (soma !== 10_000) ctx.addIssue({ code: 'custom', message: `O rateio deve somar 100% (soma atual: ${(soma / 100).toLocaleString('pt-BR')}%)` })
    r.forEach((x, i) => {
      if (x.papel !== 'IMOBILIARIA' && !x.beneficiarioId) ctx.addIssue({ code: 'custom', path: [i, 'beneficiarioId'], message: 'Informe o beneficiário' })
      if (x.papel === 'IMOBILIARIA' && x.beneficiarioId) ctx.addIssue({ code: 'custom', path: [i, 'beneficiarioId'], message: 'A parte da imobiliária não tem beneficiário' })
    })
  })

export const vendaSchema = z
  .object({
    negocioId: id,
    propostaId: id.nullish().transform((v) => v ?? null),
    dataContrato: dataIso,
    valor: moeda(true),
    compradores: z.array(parte).min(1, 'Informe o comprador'),
    vendedores: z.array(parte).min(1, 'Informe o vendedor'),
    parcelas: z
      .array(z.object({ tipo: z.enum(chaves(TIPOS_PARCELA_VENDA)), descricao: obrigatorio(100), valor: moeda(true), vencimento: dataIso, viaImobiliaria: z.boolean() }))
      .max(120)
      .default([]),
    financiamentoBanco: opcional(80),
    comissaoPercentual: percentual,
    comissaoPagadorId: id.nullish().transform((v) => v ?? null),
    comissaoVencimento: dataIso.nullish().or(z.literal('')).transform((v) => v || null),
    /** Comissão retida do sinal que transita pela imobiliária (prática comum). */
    comissaoDescontadaDoSinal: z.boolean().default(false),
    rateio: rateioSchema,
    observacoes: opcional(2000)
  })
  .superRefine((v, ctx) => {
    for (const [lista, nome] of [[v.compradores, 'compradores'], [v.vendedores, 'vendedores']] as const) {
      const soma = lista.reduce((s, p) => s + p.percentual, 0)
      if (soma !== 10_000) ctx.addIssue({ code: 'custom', path: [nome], message: 'Os percentuais devem somar 100%' })
      if (new Set(lista.map((p) => p.pessoaId)).size !== lista.length) ctx.addIssue({ code: 'custom', path: [nome], message: 'Pessoa repetida' })
    }
    const total = v.parcelas.reduce((s, p) => s + (p.valor ?? 0), 0)
    if (v.valor != null && total !== v.valor) ctx.addIssue({ code: 'custom', path: ['parcelas'], message: 'A forma de pagamento deve somar o valor da venda' })
    if (v.comissaoPercentual > 0 && !v.comissaoDescontadaDoSinal && (!v.comissaoPagadorId || !v.comissaoVencimento))
      ctx.addIssue({ code: 'custom', path: ['comissaoPagadorId'], message: 'Informe quem paga a comissão e o vencimento' })
    if (v.comissaoDescontadaDoSinal && !v.parcelas.some((p) => p.tipo === 'SINAL' && p.viaImobiliaria))
      ctx.addIssue({ code: 'custom', path: ['comissaoDescontadaDoSinal'], message: 'Só é possível descontar a comissão de um sinal que transita pela imobiliária' })
  })

export const situacaoVendaSchema = z
  .object({ vendaId: id, situacao: z.enum(['AGUARDANDO_FINANCIAMENTO', 'ESCRITURADA', 'CONCLUIDA', 'DISTRATADA']), data: dataIso, motivo: opcional(500) })
  .refine((s) => s.situacao !== 'DISTRATADA' || !!s.motivo, { path: ['motivo'], message: 'Informe o motivo do distrato' })

export const comissaoLocacaoSchema = z.object({ negocioId: id, rateio: rateioSchema })

export const rateioPadraoSchema = z.object({
  itens: z
    .array(z.object({ papel: z.enum(chaves(PAPEIS_RATEIO)), percentualBp: z.number().int().min(0).max(10_000) }))
    .min(1)
    .refine((i) => i.reduce((s, x) => s + x.percentualBp, 0) === 10_000, 'O modelo deve somar 100%')
})

export type LeadInput = z.input<typeof leadSchema>
export type NegocioInput = z.input<typeof negocioSchema>
export type MoverEtapaInput = z.input<typeof moverEtapaSchema>
export type AtividadeInput = z.input<typeof atividadeSchema>
export type VisitaInput = z.input<typeof visitaSchema>
export type ResultadoVisitaInput = z.input<typeof resultadoVisitaSchema>
export type PropostaInput = z.input<typeof propostaSchema>
export type ResponderPropostaInput = z.input<typeof responderPropostaSchema>
export type VendaInput = z.input<typeof vendaSchema>
export type SituacaoVendaInput = z.input<typeof situacaoVendaSchema>
export type RateioInput = z.input<typeof rateioSchema>
export type RateioValidado = z.output<typeof rateioSchema>
export type ComissaoLocacaoInput = z.input<typeof comissaoLocacaoSchema>
export type RateioPadrao = z.output<typeof rateioPadraoSchema>
