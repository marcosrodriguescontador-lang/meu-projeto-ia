export type CodigoErro =
  | 'VALIDACAO'
  | 'NAO_AUTENTICADO'
  | 'SESSAO_BLOQUEADA'
  | 'SEM_PERMISSAO'
  | 'NAO_ENCONTRADO'
  | 'CONFLITO'
  | 'REGRA_NEGOCIO'
  | 'INTERNO'

export interface ErroSerializado {
  codigo: CodigoErro
  mensagem: string
  campos?: Record<string, string>
}

export class ErroAplicacao extends Error {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
    readonly campos?: Record<string, string>
  ) {
    super(mensagem)
    this.name = 'ErroAplicacao'
  }

  serializar(): ErroSerializado {
    return { codigo: this.codigo, mensagem: this.message, campos: this.campos }
  }
}

export const erro = {
  validacao: (mensagem: string, campos?: Record<string, string>) => new ErroAplicacao('VALIDACAO', mensagem, campos),
  naoEncontrado: (o: string) => new ErroAplicacao('NAO_ENCONTRADO', `${o} não encontrado(a).`),
  conflito: (mensagem: string, campos?: Record<string, string>) => new ErroAplicacao('CONFLITO', mensagem, campos),
  regra: (mensagem: string) => new ErroAplicacao('REGRA_NEGOCIO', mensagem),
  semPermissao: () => new ErroAplicacao('SEM_PERMISSAO', 'Você não tem permissão para esta operação.'),
  naoAutenticado: () => new ErroAplicacao('NAO_AUTENTICADO', 'Sessão encerrada. Entre novamente.'),
  bloqueada: () => new ErroAplicacao('SESSAO_BLOQUEADA', 'Sessão bloqueada por inatividade.')
}
