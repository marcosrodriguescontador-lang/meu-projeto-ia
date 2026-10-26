// DTOs do CRM, vendas e comissões.

export interface LeadResumo {
  id: number
  nome: string
  telefone: string | null
  email: string | null
  origemId: number
  origem: string
  corretorId: number | null
  corretor: string | null
  interesse: 'COMPRA' | 'LOCACAO' | 'AMBOS'
  situacao: 'ATIVO' | 'CONVERTIDO' | 'DESCARTADO'
  negocios: number
  proximaAtividade: string | null
  criadoEm: string
}

export interface ImovelInteresse {
  imovelId: number
  codigo: number
  endereco: string
  tipo: string
  valorVendaCentavos: number | null
  valorLocacaoCentavos: number | null
  dormitorios: number | null
}

export interface LeadDetalhe extends LeadResumo {
  pessoaId: number | null
  pessoaNome: string | null
  tipoImovel: string | null
  bairros: string | null
  valorMinCentavos: number | null
  valorMaxCentavos: number | null
  dormitoriosMin: number | null
  observacoes: string | null
  consentimentoContato: boolean
  idExterno: string | null
  motivoDescarte: string | null
  imoveis: ImovelInteresse[]
}

export interface NegocioCartao {
  id: number
  tipo: 'VENDA' | 'LOCACAO'
  titulo: string
  etapa: string
  etapaDesde: string
  diasNaEtapa: number
  cliente: string
  imovel: string | null
  corretor: string | null
  valorEstimadoCentavos: number | null
  proximaAtividade: { titulo: string; agendadaPara: string } | null
  atrasada: boolean
}

export interface EtapaHistDto {
  de: string | null
  para: string
  ts: string
  usuario: string | null
  observacao: string | null
}

export interface AtividadeDto {
  id: number
  tipo: string
  titulo: string
  descricao: string | null
  agendadaPara: string
  concluidaEm: string | null
  resultado: string | null
  canceladaEm: string | null
  responsavelId: number
  responsavel: string
  negocioId: number | null
  negocioTitulo: string | null
  leadId: number | null
  leadNome: string | null
  atrasada: boolean
}

export interface VisitaDto {
  id: number
  imovelId: number
  imovelCodigo: number
  imovelEndereco: string
  negocioId: number | null
  leadId: number | null
  cliente: string | null
  corretorId: number | null
  corretor: string | null
  dataHora: string
  situacao: 'AGENDADA' | 'REALIZADA' | 'CANCELADA' | 'NAO_COMPARECEU'
  feedback: string | null
  avaliacao: number | null
}

export interface PropostaDto {
  id: number
  versao: number
  anteriorId: number | null
  autor: 'CLIENTE' | 'PROPRIETARIO'
  valorCentavos: number
  sinalCentavos: number
  parcelas: { descricao: string; valorCentavos: number; vencimento: string }[]
  financiamentoBanco: string | null
  financiamentoCentavos: number
  /** Saldo a pagar na escritura/assinatura (valor − sinal − parcelas − financiamento). */
  saldoCentavos: number
  condicoes: string | null
  validade: string | null
  situacao: string
  respostaEm: string | null
  motivo: string | null
  criadoEm: string
  criadoPor: string | null
}

export interface ParcelaVendaDto {
  id: number
  tipo: string
  descricao: string
  valorCentavos: number
  vencimento: string
  viaImobiliaria: boolean
  tituloId: number | null
  situacao: string
  pagaEm: string | null
}

export interface VendaDto {
  id: number
  negocioId: number
  imovelId: number
  imovelCodigo: number
  propostaId: number | null
  dataContrato: string
  valorCentavos: number
  financiamentoBanco: string | null
  financiamentoCentavos: number
  situacao: string
  dataEscritura: string | null
  distratoMotivo: string | null
  observacoes: string | null
  partes: { pessoaId: number; nome: string; papel: 'COMPRADOR' | 'VENDEDOR'; percentualBp: number }[]
  parcelas: ParcelaVendaDto[]
  comissaoId: number | null
}

export interface RateioDto {
  id: number
  papel: string
  beneficiarioId: number | null
  beneficiario: string | null
  percentualBp: number
  valorCentavos: number
  liberadoCentavos: number
  pagoCentavos: number
}

export interface ComissaoDto {
  id: number
  origem: 'VENDA' | 'LOCACAO'
  descricao: string
  vendaId: number | null
  contratoId: number | null
  negocioId: number | null
  baseCentavos: number
  percentualBp: number
  valorCentavos: number
  pagador: string | null
  tituloId: number | null
  recebidoCentavos: number
  situacao: 'ATIVA' | 'CANCELADA'
  motivoCancelamento: string | null
  criadoEm: string
  rateio: RateioDto[]
  rateioEditavel: boolean
}

export interface LinhaComissaoBeneficiario {
  pessoaId: number
  nome: string
  comissoes: number
  previstoCentavos: number
  liberadoCentavos: number
  pagoCentavos: number
}

export interface NegocioDetalhe extends NegocioCartao {
  leadId: number | null
  leadNome: string | null
  clienteId: number | null
  clienteNome: string | null
  imovelId: number | null
  imovelCodigo: number | null
  corretorId: number | null
  /** Corretor responsável pelo imóvel (captador). */
  captadorId: number | null
  ofertaValorCentavos: number | null
  ofertaComissaoBp: number | null
  motivoPerda: string | null
  contratoId: number | null
  contratoNumero: number | null
  encerradoEm: string | null
  criadoEm: string
  historico: EtapaHistDto[]
  propostas: PropostaDto[]
  visitas: VisitaDto[]
  atividades: AtividadeDto[]
  venda: VendaDto | null
  comissao: ComissaoDto | null
}

export interface IndicadoresFunil {
  total: number
  emAndamento: number
  ganhos: number
  perdidos: number
  /** Ganhos ÷ (ganhos + perdidos), em pontos-base. */
  taxaGanhoBp: number | null
  cicloMedioDias: number | null
  valorGanhoCentavos: number
  etapas: { etapa: string; alcancaram: number; conversaoProximaBp: number | null; tempoMedioDias: number | null }[]
  motivosPerda: { motivo: string; quantidade: number }[]
  porOrigem: { origem: string; leads: number; negocios: number; ganhos: number }[]
  porCorretor: { corretor: string; negocios: number; ganhos: number; valorGanhoCentavos: number }[]
}

export interface AgendaItem {
  tipo: 'ATIVIDADE' | 'VISITA'
  id: number
  quando: string
  titulo: string
  detalhe: string | null
  situacao: string
  atrasada: boolean
  negocioId: number | null
  leadId: number | null
  responsavel: string | null
}
