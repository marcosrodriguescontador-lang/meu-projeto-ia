// Estrutura comum dos relatórios (tela, PDF e Excel).
import { formatarMoeda } from './dinheiro'
import { formatarCompetencia, formatarData } from './financeiro/datas'

export type TipoColuna = 'texto' | 'moeda' | 'data' | 'numero' | 'percentual' | 'competencia'

export interface ColunaRelatorio {
  chave: string
  rotulo: string
  tipo: TipoColuna
  largura?: number
}

export interface RelatorioDados {
  codigo: string
  titulo: string
  subtitulo: string
  colunas: ColunaRelatorio[]
  linhas: Record<string, string | number | null>[]
  totais?: Record<string, number | string | null>
  observacoes?: string[]
}

export const RELATORIOS = {
  receber: 'Contas a receber por vencimento',
  pagar: 'Contas a pagar por vencimento',
  inadimplencia: 'Inadimplência',
  receitas: 'Receitas próprias por tipo',
  despesas: 'Despesas por categoria',
  fluxo: 'Fluxo de caixa (previsto × realizado)',
  resultado: 'Resultado gerencial mensal',
  rentabilidade: 'Rentabilidade da administração de locações',
  repassar: 'Valores a repassar aos proprietários',
  terceiros: 'Posição de recursos de terceiros',
  extratoProprietario: 'Extrato do proprietário',
  dimob: 'Base para a DIMOB (locações)'
} as const

export type CodigoRelatorio = keyof typeof RELATORIOS

export interface ParametrosRelatorio {
  de?: string
  ate?: string
  ano?: number
  regime?: 'CAIXA' | 'COMPETENCIA'
  situacao?: 'EM_ABERTO' | 'TODOS'
  pessoaId?: number
  titularidade?: 'TODAS' | 'PROPRIO' | 'TERCEIROS'
}

export interface PontoFluxo {
  competencia: string
  entradasRealizadas: number
  saidasRealizadas: number
  entradasPrevistas: number
  saidasPrevistas: number
  saldoFinal: number
  projetado: boolean
}

/** Valor de uma célula como texto (tela e PDF). */
export function formatarCelula(c: ColunaRelatorio, v: unknown): string {
  if (v == null || v === '') return ''
  switch (c.tipo) {
    case 'moeda':
      return formatarMoeda(Number(v) || 0)
    case 'data':
      return formatarData(String(v))
    case 'competencia':
      return formatarCompetencia(String(v))
    case 'percentual':
      return `${(Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
    case 'numero':
      return Number(v).toLocaleString('pt-BR')
    default:
      return String(v)
  }
}
