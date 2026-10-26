// DTOs de locação e financeiro.

export interface ContaFinanceiraDto {
  id: number
  nome: string
  tipo: string
  bancoCodigo: string | null
  agencia: string | null
  conta: string | null
  titularidade: 'PROPRIO' | 'TERCEIROS'
  saldoInicialCentavos: number
  dataSaldoInicial: string
  ativa: boolean
  saldoAtualCentavos: number
}

export interface IndiceDto {
  id: number
  sigla: string
  nome: string
  valores: { competencia: string; variacaoPpm: number }[]
}

export interface FeriadoDto {
  id: number
  data: string
  descricao: string
  abrangencia: string
}

export interface ParteContratoDto {
  pessoaId: number
  nome: string
  documento: string
  papel: 'LOCADOR' | 'LOCATARIO' | 'FIADOR'
  percentualBp: number
  principal: boolean
}

export interface EncargoDto {
  id: number
  tipo: string
  descricao: string
  valorCentavos: number
  competenciaInicio: string
  competenciaFim: string | null
  proporcional: boolean
  destino: 'PROPRIETARIO' | 'TERCEIRO' | 'IMOBILIARIA'
  beneficiarioId: number | null
  beneficiarioNome: string | null
}

export interface ContratoResumo {
  id: number
  numero: number
  situacao: string
  tipo: string
  imovelId: number
  imovelCodigo: number
  imovelEndereco: string
  locatario: string
  locadores: string
  dataInicio: string
  dataFim: string
  aluguelCentavos: number
  diaVencimento: number
  proximoReajuste: string | null
  emAtraso: number
}

export interface ContratoDetalhe {
  id: number
  numero: number
  situacao: string
  tipo: string
  imovel: { id: number; codigo: number; endereco: string }
  partes: ParteContratoDto[]
  dataInicio: string
  dataFim: string
  aluguelCentavos: number
  diaVencimento: number
  indiceId: number | null
  indiceSigla: string | null
  periodicidadeReajusteMeses: number
  proximoReajuste: string | null
  reajusteNegativo: boolean
  taxaAdministracaoBp: number
  taxaIntermediacaoBp: number
  multaAtrasoBp: number
  jurosMesBp: number
  destinoEncargos: 'PROPRIETARIO' | 'IMOBILIARIA'
  multaRescisoriaAlugueis: number
  garantiaTipo: string
  garantiaValorCentavos: number | null
  garantiaSeguradora: string | null
  garantiaApolice: string | null
  garantiaVigenciaFim: string | null
  observacoes: string | null
  encargos: EncargoDto[]
  vigencias: { competencia: string; valorCentavos: number; origem: string }[]
  ultimaCompetenciaGerada: string | null
  ativadoEm: string | null
  encerradoEm: string | null
  criadoEm: string
  atualizadoEm: string
}

export interface LancamentoAvulsoDto {
  id: number
  contratoId: number
  competencia: string
  descricao: string
  valorCentavos: number
  pagador: 'LOCATARIO' | 'PROPRIETARIO'
  destino: string
  natureza: 'OUTRO' | 'IRRF'
  beneficiarioNome: string | null
  situacao: string
  tituloId: number | null
  criadoEm: string
}

export interface TituloResumo {
  id: number
  sentido: 'RECEBER' | 'PAGAR'
  origem: string
  descricao: string
  competencia: string | null
  pessoaId: number
  pessoa: string
  contratoId: number | null
  contratoNumero: number | null
  vencimento: string
  valorCentavos: number
  saldoCentavos: number
  situacao: string
  diasAtraso: number
}

export interface TituloItemDto {
  id: number
  tipo: string
  descricao: string
  valorCentavos: number
  saldoCentavos: number
  destino: string
  beneficiario: string | null
  taxaBp: number
  taxaTipo: string | null
}

export interface BaixaDto {
  id: number
  data: string
  principalCentavos: number
  multaCentavos: number
  jurosCentavos: number
  descontoCentavos: number
  totalCentavos: number
  conta: string | null
  forma: string
  observacao: string | null
  estornada: boolean
  estornoMotivo: string | null
  usuario: string | null
}

export interface TituloDetalhe extends TituloResumo {
  vencimentoOriginal: string
  emissao: string
  recurso: string
  multaBp: number
  jurosMesBp: number
  destinoEncargos: string
  itens: TituloItemDto[]
  baixas: BaixaDto[]
  motivoCancelamento: string | null
  renegociacaoId: number | null
  repasseId: number | null
}

export interface PreviaRecebimento {
  saldoCentavos: number
  diasAtraso: number
  multaCentavos: number
  jurosCentavos: number
  totalDevidoCentavos: number
}

export interface PreviaCobranca {
  contratoId: number
  contratoNumero: number
  locatario: string
  competencia: string
  vencimento: string
  valorCentavos: number
  itens: { tipo: string; descricao: string; valorCentavos: number }[]
  situacao: 'GERAR' | 'JA_GERADA' | 'BLOQUEADA'
  motivo?: string
}

export interface SaldoRepasse {
  tipo: 'PROPRIETARIO' | 'TERCEIRO' | 'CAUCAO'
  pessoaId: number
  pessoa: string
  saldoCentavos: number
  lancamentos: number
}

export interface ExtratoLinha {
  partidaId: number
  data: string
  historico: string
  contratoNumero: number | null
  imovel: string | null
  creditoCentavos: number
  debitoCentavos: number
}

export interface RepasseDto {
  id: number
  tipo: 'PROPRIETARIO' | 'TERCEIRO' | 'CAUCAO'
  pessoaId: number
  pessoa: string
  data: string
  valorCentavos: number
  situacao: string
  tituloId: number | null
  saldoTituloCentavos: number
  criadoEm: string
}

export interface ReajustePendente {
  contratoId: number
  contratoNumero: number
  locatario: string
  imovel: string
  dataBase: string
  indiceSigla: string | null
  valorAtualCentavos: number
  competencias: string[]
  faltantes: string[]
  acumuladoPpm: number | null
  aplicadoPpm: number | null
  novoValorCentavos: number | null
}

export interface InadimplenciaLinha {
  tituloId: number
  contratoId: number | null
  contratoNumero: number | null
  pessoa: string
  imovel: string | null
  descricao: string
  vencimento: string
  diasAtraso: number
  saldoCentavos: number
  multaCentavos: number
  jurosCentavos: number
  totalCentavos: number
}

export interface IndicadoresFinanceiros {
  contratosAtivos: number
  contratosVencendo60: number
  receberMesCentavos: number
  vencidosCentavos: number
  vencidosQuantidade: number
  repassesPendentesCentavos: number
  receitaPropriaMesCentavos: number
  saldoContasCentavos: number
  reajustesPendentes: number
  comissoesReceberCentavos: number
  despesasMesCentavos: number
  resultadoMesCentavos: number
  /** Últimos 24 meses (regime de caixa): receitas próprias e despesas da imobiliária. */
  mensal: { competencia: string; receitas: number; despesas: number }[]
}

export interface MemoriaRescisao {
  multaCalculadaCentavos: number
  diasTotais: number
  diasRestantes: number
  memoria: string
  aluguelProporcionalCentavos: number
  competenciaFinal: string
  saldoCaucaoCentavos: number
  titulosEmAberto: number
}

// ——— Fase 4: tesouraria e conciliação ———

export interface CategoriaDto {
  id: number
  codigo: string
  nome: string
  natureza: 'RECEITA' | 'DESPESA'
  sistema: boolean
}

export interface TransferenciaDto {
  id: number
  data: string
  origemId: number
  destinoId: number
  origem: string
  destino: string
  valorCentavos: number
  descricao: string
  estornada: boolean
}

export interface MovimentoDto {
  partidaId: number
  lancamentoId: number
  data: string
  historico: string
  valorCentavos: number
  saldoCentavos: number
  conciliado: boolean
  estornado: boolean
}

export interface PosicaoTerceiros {
  saldoContasTerceiros: number
  saldoContasProprias: number
  passivoProprietarios: number
  passivoTerceiros: number
  passivoCaucoes: number
  totalPassivo: number
  /** Positivo: dinheiro da imobiliária ainda em contas de terceiros. Negativo: recursos de terceiros fora das contas de terceiros. */
  recursosPropriosEmContasDeTerceiros: number
}

export interface ResultadoImportacao {
  importacaoId: number
  lidas: number
  novas: number
  duplicadas: number
  conciliadasAutomaticamente: number
}

export interface LinhaExtratoDto {
  id: number
  data: string
  valorCentavos: number
  descricao: string
  documento: string | null
  situacao: 'PENDENTE' | 'CONCILIADA' | 'IGNORADA'
  motivoIgnorar: string | null
  partidaId: number | null
  historicoSistema: string | null
  automatica: boolean
}

export interface MovimentoPendente {
  partidaId: number
  data: string
  historico: string
  valorCentavos: number
}

export interface Sugestao {
  linhaId: number
  partidaId: number
  diasDiferenca: number
  unica: boolean
}

export interface ResumoConciliacao {
  saldoSistemaCentavos: number
  ultimoExtrato: { arquivo: string; data: string | null; saldoCentavos: number | null } | null
  saldoSistemaNaDataCentavos: number | null
  diferencaCentavos: number | null
  linhasPendentes: number
  movimentosPendentes: number
  importacoes: { id: number; arquivo: string; formato: string; periodo: string; lidas: number; novas: number; importadoEm: string }[]
}
