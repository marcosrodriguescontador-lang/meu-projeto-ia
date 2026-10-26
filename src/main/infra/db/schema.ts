// Esquema relacional (Drizzle). Fonte das migrações geradas em db/migrations.
// Convenções: datas ISO-8601 em TEXT, valores monetários em centavos (INTEGER),
// exclusão lógica via `excluido_em`, chaves estrangeiras com ON DELETE RESTRICT.
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const agora = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

const carimbos = {
  criadoEm: text('criado_em').notNull().default(agora),
  criadoPor: integer('criado_por'),
  atualizadoEm: text('atualizado_em').notNull().default(agora),
  atualizadoPor: integer('atualizado_por')
}

// ───────────── Segurança ─────────────

export const perfil = sqliteTable('perfil', {
  id: integer('id').primaryKey(),
  nome: text('nome').notNull().unique(),
  descricao: text('descricao'),
  sistema: integer('sistema', { mode: 'boolean' }).notNull().default(false),
  ...carimbos
})

export const perfilPermissao = sqliteTable(
  'perfil_permissao',
  {
    perfilId: integer('perfil_id')
      .notNull()
      .references(() => perfil.id, { onDelete: 'cascade' }),
    permissao: text('permissao').notNull()
  },
  (t) => [primaryKey({ columns: [t.perfilId, t.permissao] })]
)

export const usuario = sqliteTable('usuario', {
  id: integer('id').primaryKey(),
  nome: text('nome').notNull(),
  login: text('login').notNull().unique(),
  email: text('email'),
  senhaHash: text('senha_hash').notNull(),
  perfilId: integer('perfil_id')
    .notNull()
    .references(() => perfil.id, { onDelete: 'restrict' }),
  pessoaId: integer('pessoa_id').references(() => pessoa.id, { onDelete: 'restrict' }),
  ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),
  tentativasFalhas: integer('tentativas_falhas').notNull().default(0),
  bloqueadoAte: text('bloqueado_ate'),
  deveTrocarSenha: integer('deve_trocar_senha', { mode: 'boolean' }).notNull().default(false),
  senhaAlteradaEm: text('senha_alterada_em'),
  ultimoAcessoEm: text('ultimo_acesso_em'),
  ...carimbos
})

/** Registro append-only, encadeado por hash. Triggers impedem UPDATE/DELETE. */
export const auditoria = sqliteTable(
  'auditoria',
  {
    id: integer('id').primaryKey(),
    ts: text('ts').notNull(),
    usuarioId: integer('usuario_id'),
    usuarioLogin: text('usuario_login'),
    acao: text('acao').notNull(),
    entidade: text('entidade').notNull(),
    entidadeId: text('entidade_id'),
    descricao: text('descricao'),
    antes: text('antes'),
    depois: text('depois'),
    estacao: text('estacao'),
    hashAnterior: text('hash_anterior').notNull(),
    hash: text('hash').notNull()
  },
  (t) => [index('ix_auditoria_entidade').on(t.entidade, t.entidadeId), index('ix_auditoria_ts').on(t.ts)]
)

export const configuracao = sqliteTable('configuracao', {
  chave: text('chave').primaryKey(),
  valor: text('valor').notNull(),
  atualizadoEm: text('atualizado_em').notNull().default(agora),
  atualizadoPor: integer('atualizado_por')
})

export const sequencia = sqliteTable('sequencia', {
  nome: text('nome').primaryKey(),
  proximo: integer('proximo').notNull().default(1)
})

// ───────────── Pessoas ─────────────

export const pessoa = sqliteTable(
  'pessoa',
  {
    id: integer('id').primaryKey(),
    codigo: integer('codigo').notNull().unique(),
    tipo: text('tipo', { enum: ['PF', 'PJ'] }).notNull(),
    nome: text('nome').notNull(),
    nomeBusca: text('nome_busca').notNull(),
    nomeFantasia: text('nome_fantasia'),
    documento: text('documento').notNull(),
    rgIe: text('rg_ie'),
    orgaoEmissor: text('orgao_emissor'),
    nascimento: text('nascimento'),
    nacionalidade: text('nacionalidade'),
    estadoCivil: text('estado_civil'),
    regimeBens: text('regime_bens'),
    profissao: text('profissao'),
    situacao: text('situacao').notNull().default('ATIVO'),
    observacoes: text('observacoes'),
    ...carimbos,
    excluidoEm: text('excluido_em'),
    excluidoPor: integer('excluido_por'),
    motivoExclusao: text('motivo_exclusao')
  },
  (t) => [
    uniqueIndex('ux_pessoa_documento_ativo').on(t.documento).where(sql`excluido_em IS NULL`),
    index('ix_pessoa_nome_busca').on(t.nomeBusca)
  ]
)

export const pessoaPapel = sqliteTable(
  'pessoa_papel',
  {
    pessoaId: integer('pessoa_id')
      .notNull()
      .references(() => pessoa.id, { onDelete: 'restrict' }),
    papel: text('papel').notNull(),
    dados: text('dados'),
    criadoEm: text('criado_em').notNull().default(agora)
  },
  (t) => [primaryKey({ columns: [t.pessoaId, t.papel] }), index('ix_pessoa_papel_papel').on(t.papel)]
)

export const pessoaRelacao = sqliteTable(
  'pessoa_relacao',
  {
    id: integer('id').primaryKey(),
    pessoaId: integer('pessoa_id')
      .notNull()
      .references(() => pessoa.id, { onDelete: 'restrict' }),
    relacionadaId: integer('relacionada_id')
      .notNull()
      .references(() => pessoa.id, { onDelete: 'restrict' }),
    tipo: text('tipo').notNull()
  },
  (t) => [uniqueIndex('ux_pessoa_relacao').on(t.pessoaId, t.relacionadaId, t.tipo)]
)

export const endereco = sqliteTable(
  'endereco',
  {
    id: integer('id').primaryKey(),
    pessoaId: integer('pessoa_id')
      .notNull()
      .references(() => pessoa.id, { onDelete: 'restrict' }),
    tipo: text('tipo').notNull(),
    cep: text('cep').notNull(),
    logradouro: text('logradouro').notNull(),
    numero: text('numero').notNull(),
    complemento: text('complemento'),
    bairro: text('bairro').notNull(),
    cidade: text('cidade').notNull(),
    uf: text('uf').notNull(),
    principal: integer('principal', { mode: 'boolean' }).notNull().default(false)
  },
  (t) => [index('ix_endereco_pessoa').on(t.pessoaId)]
)

export const contato = sqliteTable(
  'contato',
  {
    id: integer('id').primaryKey(),
    pessoaId: integer('pessoa_id')
      .notNull()
      .references(() => pessoa.id, { onDelete: 'restrict' }),
    tipo: text('tipo').notNull(),
    valor: text('valor').notNull(),
    nomeContato: text('nome_contato'),
    principal: integer('principal', { mode: 'boolean' }).notNull().default(false)
  },
  (t) => [index('ix_contato_pessoa').on(t.pessoaId)]
)

/** Agência, conta, dígito e chave PIX ficam cifrados (AES-256-GCM) além da cifragem do banco. */
export const dadoBancario = sqliteTable(
  'dado_bancario',
  {
    id: integer('id').primaryKey(),
    pessoaId: integer('pessoa_id')
      .notNull()
      .references(() => pessoa.id, { onDelete: 'restrict' }),
    bancoCodigo: text('banco_codigo').notNull(),
    bancoNome: text('banco_nome').notNull(),
    tipoConta: text('tipo_conta').notNull(),
    agenciaCifrada: text('agencia_cifrada').notNull(),
    contaCifrada: text('conta_cifrada').notNull(),
    digitoCifrado: text('digito_cifrado').notNull(),
    contaMascara: text('conta_mascara').notNull(),
    pixTipo: text('pix_tipo'),
    pixChaveCifrada: text('pix_chave_cifrada'),
    titularNome: text('titular_nome').notNull(),
    titularDocumento: text('titular_documento').notNull(),
    principal: integer('principal', { mode: 'boolean' }).notNull().default(false),
    ...carimbos,
    excluidoEm: text('excluido_em'),
    excluidoPor: integer('excluido_por')
  },
  (t) => [index('ix_dado_bancario_pessoa').on(t.pessoaId)]
)

// ───────────── Anexos ─────────────

export const anexo = sqliteTable(
  'anexo',
  {
    id: integer('id').primaryKey(),
    uuid: text('uuid').notNull().unique(),
    entidade: text('entidade').notNull(),
    entidadeId: integer('entidade_id').notNull(),
    categoria: text('categoria').notNull(),
    nomeOriginal: text('nome_original').notNull(),
    mime: text('mime').notNull(),
    tamanho: integer('tamanho').notNull(),
    sha256: text('sha256').notNull(),
    criadoEm: text('criado_em').notNull().default(agora),
    criadoPor: integer('criado_por'),
    excluidoEm: text('excluido_em'),
    excluidoPor: integer('excluido_por')
  },
  (t) => [index('ix_anexo_entidade').on(t.entidade, t.entidadeId)]
)

// ───────────── Backup ─────────────

export const backupRegistro = sqliteTable('backup_registro', {
  id: integer('id').primaryKey(),
  ts: text('ts').notNull(),
  tipo: text('tipo', { enum: ['MANUAL', 'AUTOMATICO', 'PRE_RESTAURACAO'] }).notNull(),
  arquivo: text('arquivo').notNull(),
  tamanho: integer('tamanho'),
  sha256: text('sha256'),
  versaoApp: text('versao_app').notNull(),
  versaoSchema: text('versao_schema').notNull(),
  validado: integer('validado', { mode: 'boolean' }).notNull().default(false),
  resultado: text('resultado').notNull(),
  mensagem: text('mensagem'),
  usuarioId: integer('usuario_id')
})

// ───────────── Imóveis ─────────────

export const imovel = sqliteTable(
  'imovel',
  {
    id: integer('id').primaryKey(),
    codigo: integer('codigo').notNull().unique(),
    tipo: text('tipo').notNull(),
    finalidade: text('finalidade').notNull(),
    cep: text('cep').notNull(),
    logradouro: text('logradouro').notNull(),
    numero: text('numero').notNull(),
    complemento: text('complemento'),
    bairro: text('bairro').notNull(),
    cidade: text('cidade').notNull(),
    uf: text('uf').notNull(),
    enderecoBusca: text('endereco_busca').notNull(),
    matricula: text('matricula'),
    cartorio: text('cartorio'),
    inscricaoMunicipal: text('inscricao_municipal'),
    /** Áreas em centésimos de m² (ex.: 85,50 m² = 8550). */
    areaConstruida: integer('area_construida'),
    areaTerreno: integer('area_terreno'),
    dormitorios: integer('dormitorios').notNull().default(0),
    suites: integer('suites').notNull().default(0),
    banheiros: integer('banheiros').notNull().default(0),
    vagas: integer('vagas').notNull().default(0),
    descricaoComercial: text('descricao_comercial'),
    observacoesInternas: text('observacoes_internas'),
    condominioCentavos: integer('condominio_centavos'),
    iptuAnualCentavos: integer('iptu_anual_centavos'),
    corretorId: integer('corretor_id').references(() => pessoa.id, { onDelete: 'restrict' }),
    ...carimbos,
    excluidoEm: text('excluido_em'),
    excluidoPor: integer('excluido_por'),
    motivoExclusao: text('motivo_exclusao')
  },
  (t) => [
    index('ix_imovel_cidade_bairro').on(t.cidade, t.bairro),
    index('ix_imovel_tipo').on(t.tipo),
    uniqueIndex('ux_imovel_matricula').on(t.matricula, t.cartorio).where(sql`excluido_em IS NULL AND matricula IS NOT NULL`)
  ]
)

export const imovelProprietario = sqliteTable(
  'imovel_proprietario',
  {
    imovelId: integer('imovel_id')
      .notNull()
      .references(() => imovel.id, { onDelete: 'restrict' }),
    pessoaId: integer('pessoa_id')
      .notNull()
      .references(() => pessoa.id, { onDelete: 'restrict' }),
    /** Participação em pontos-base: 10.000 = 100%. A soma por imóvel deve ser 10.000. */
    percentualBp: integer('percentual_bp').notNull(),
    principal: integer('principal', { mode: 'boolean' }).notNull().default(false)
  },
  (t) => [primaryKey({ columns: [t.imovelId, t.pessoaId] }), index('ix_imovel_proprietario_pessoa').on(t.pessoaId)]
)

/** Oferta do imóvel por modalidade, com disponibilidade independente para venda e locação. */
export const imovelOferta = sqliteTable(
  'imovel_oferta',
  {
    id: integer('id').primaryKey(),
    imovelId: integer('imovel_id')
      .notNull()
      .references(() => imovel.id, { onDelete: 'restrict' }),
    modalidade: text('modalidade', { enum: ['VENDA', 'LOCACAO'] }).notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    comissaoBp: integer('comissao_bp').notNull().default(0),
    situacao: text('situacao').notNull(),
    situacaoDesde: text('situacao_desde').notNull(),
    ...carimbos
  },
  (t) => [uniqueIndex('ux_imovel_oferta_modalidade').on(t.imovelId, t.modalidade), index('ix_imovel_oferta_busca').on(t.modalidade, t.situacao, t.valorCentavos)]
)

export const ofertaSituacaoHist = sqliteTable(
  'oferta_situacao_hist',
  {
    id: integer('id').primaryKey(),
    ofertaId: integer('oferta_id')
      .notNull()
      .references(() => imovelOferta.id, { onDelete: 'restrict' }),
    de: text('de'),
    para: text('para').notNull(),
    motivo: text('motivo'),
    usuarioId: integer('usuario_id'),
    ts: text('ts').notNull()
  },
  (t) => [index('ix_oferta_hist_oferta').on(t.ofertaId)]
)

export const caracteristica = sqliteTable('caracteristica', {
  id: integer('id').primaryKey(),
  nome: text('nome').notNull().unique(),
  grupo: text('grupo').notNull(),
  ativa: integer('ativa', { mode: 'boolean' }).notNull().default(true)
})

export const imovelCaracteristica = sqliteTable(
  'imovel_caracteristica',
  {
    imovelId: integer('imovel_id')
      .notNull()
      .references(() => imovel.id, { onDelete: 'restrict' }),
    caracteristicaId: integer('caracteristica_id')
      .notNull()
      .references(() => caracteristica.id, { onDelete: 'restrict' })
  },
  (t) => [primaryKey({ columns: [t.imovelId, t.caracteristicaId] }), index('ix_imovel_caract_c').on(t.caracteristicaId)]
)

export const imovelFoto = sqliteTable(
  'imovel_foto',
  {
    id: integer('id').primaryKey(),
    imovelId: integer('imovel_id')
      .notNull()
      .references(() => imovel.id, { onDelete: 'restrict' }),
    anexoId: integer('anexo_id')
      .notNull()
      .unique()
      .references(() => anexo.id, { onDelete: 'restrict' }),
    miniaturaUuid: text('miniatura_uuid').notNull(),
    ordem: integer('ordem').notNull(),
    capa: integer('capa', { mode: 'boolean' }).notNull().default(false),
    legenda: text('legenda')
  },
  (t) => [index('ix_imovel_foto_imovel').on(t.imovelId, t.ordem)]
)

// ───────────── Cadastros auxiliares financeiros ─────────────

export const feriado = sqliteTable('feriado', {
  id: integer('id').primaryKey(),
  data: text('data').notNull().unique(),
  descricao: text('descricao').notNull(),
  abrangencia: text('abrangencia').notNull().default('MUNICIPAL')
})

export const indiceEconomico = sqliteTable('indice_economico', {
  id: integer('id').primaryKey(),
  sigla: text('sigla').notNull().unique(),
  nome: text('nome').notNull()
})

/** Variação mensal em partes por milhão (0,45% = 4.500 ppm). */
export const indiceValor = sqliteTable(
  'indice_valor',
  {
    indiceId: integer('indice_id')
      .notNull()
      .references(() => indiceEconomico.id, { onDelete: 'restrict' }),
    competencia: text('competencia').notNull(),
    variacaoPpm: integer('variacao_ppm').notNull(),
    informadoPor: integer('informado_por'),
    informadoEm: text('informado_em').notNull()
  },
  (t) => [primaryKey({ columns: [t.indiceId, t.competencia] })]
)

export const contaGerencial = sqliteTable('conta_gerencial', {
  id: integer('id').primaryKey(),
  codigo: text('codigo').notNull().unique(),
  nome: text('nome').notNull(),
  natureza: text('natureza', { enum: ['ATIVO', 'PASSIVO', 'RECEITA', 'DESPESA'] }).notNull(),
  recurso: text('recurso', { enum: ['PROPRIO', 'TERCEIROS'] }).notNull(),
  sistema: integer('sistema', { mode: 'boolean' }).notNull().default(false)
})

export const contaFinanceira = sqliteTable('conta_financeira', {
  id: integer('id').primaryKey(),
  nome: text('nome').notNull().unique(),
  tipo: text('tipo').notNull(),
  bancoCodigo: text('banco_codigo'),
  agencia: text('agencia'),
  conta: text('conta'),
  titularidade: text('titularidade', { enum: ['PROPRIO', 'TERCEIROS'] }).notNull(),
  saldoInicialCentavos: integer('saldo_inicial_centavos').notNull().default(0),
  dataSaldoInicial: text('data_saldo_inicial').notNull(),
  ativa: integer('ativa', { mode: 'boolean' }).notNull().default(true),
  ...carimbos
})

// ───────────── Locações ─────────────

export const contratoLocacao = sqliteTable(
  'contrato_locacao',
  {
    id: integer('id').primaryKey(),
    numero: integer('numero').notNull().unique(),
    imovelId: integer('imovel_id')
      .notNull()
      .references(() => imovel.id, { onDelete: 'restrict' }),
    tipo: text('tipo').notNull(),
    situacao: text('situacao', { enum: ['RASCUNHO', 'ATIVO', 'ENCERRADO', 'RESCINDIDO'] }).notNull(),
    dataInicio: text('data_inicio').notNull(),
    dataFim: text('data_fim').notNull(),
    aluguelCentavos: integer('aluguel_centavos').notNull(),
    diaVencimento: integer('dia_vencimento').notNull(),
    indiceId: integer('indice_id').references(() => indiceEconomico.id, { onDelete: 'restrict' }),
    periodicidadeReajusteMeses: integer('periodicidade_reajuste_meses').notNull().default(12),
    proximoReajuste: text('proximo_reajuste'),
    reajusteNegativo: integer('reajuste_negativo', { mode: 'boolean' }).notNull().default(false),
    taxaAdministracaoBp: integer('taxa_administracao_bp').notNull(),
    taxaIntermediacaoBp: integer('taxa_intermediacao_bp').notNull().default(0),
    multaAtrasoBp: integer('multa_atraso_bp').notNull(),
    jurosMesBp: integer('juros_mes_bp').notNull(),
    destinoEncargos: text('destino_encargos', { enum: ['PROPRIETARIO', 'IMOBILIARIA'] }).notNull(),
    multaRescisoriaAlugueis: integer('multa_rescisoria_alugueis').notNull().default(3),
    garantiaTipo: text('garantia_tipo').notNull(),
    garantiaValorCentavos: integer('garantia_valor_centavos'),
    garantiaSeguradora: text('garantia_seguradora'),
    garantiaApolice: text('garantia_apolice'),
    garantiaVigenciaFim: text('garantia_vigencia_fim'),
    observacoes: text('observacoes'),
    ativadoEm: text('ativado_em'),
    encerradoEm: text('encerrado_em'),
    ...carimbos
  },
  (t) => [index('ix_contrato_imovel').on(t.imovelId), index('ix_contrato_situacao').on(t.situacao)]
)

export const contratoParte = sqliteTable(
  'contrato_parte',
  {
    contratoId: integer('contrato_id')
      .notNull()
      .references(() => contratoLocacao.id, { onDelete: 'restrict' }),
    pessoaId: integer('pessoa_id')
      .notNull()
      .references(() => pessoa.id, { onDelete: 'restrict' }),
    papel: text('papel', { enum: ['LOCADOR', 'LOCATARIO', 'FIADOR'] }).notNull(),
    percentualBp: integer('percentual_bp').notNull().default(0),
    principal: integer('principal', { mode: 'boolean' }).notNull().default(false)
  },
  (t) => [primaryKey({ columns: [t.contratoId, t.pessoaId, t.papel] }), index('ix_contrato_parte_pessoa').on(t.pessoaId)]
)

/** Encargos recorrentes cobrados com o aluguel (condomínio, IPTU, seguro etc.). */
export const contratoEncargo = sqliteTable('contrato_encargo', {
  id: integer('id').primaryKey(),
  contratoId: integer('contrato_id')
    .notNull()
    .references(() => contratoLocacao.id, { onDelete: 'restrict' }),
  tipo: text('tipo').notNull(),
  descricao: text('descricao').notNull(),
  valorCentavos: integer('valor_centavos').notNull(),
  competenciaInicio: text('competencia_inicio').notNull(),
  competenciaFim: text('competencia_fim'),
  proporcional: integer('proporcional', { mode: 'boolean' }).notNull().default(false),
  destino: text('destino', { enum: ['PROPRIETARIO', 'TERCEIRO', 'IMOBILIARIA'] }).notNull(),
  beneficiarioId: integer('beneficiario_id').references(() => pessoa.id, { onDelete: 'restrict' }),
  ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),
  ...carimbos
})

/** Lançamentos avulsos: cobrança extra ao locatário ou débito ao proprietário. */
export const contratoLancamento = sqliteTable('contrato_lancamento', {
  id: integer('id').primaryKey(),
  contratoId: integer('contrato_id')
    .notNull()
    .references(() => contratoLocacao.id, { onDelete: 'restrict' }),
  competencia: text('competencia').notNull(),
  descricao: text('descricao').notNull(),
  valorCentavos: integer('valor_centavos').notNull(),
  pagador: text('pagador', { enum: ['LOCATARIO', 'PROPRIETARIO'] }).notNull(),
  destino: text('destino', { enum: ['PROPRIETARIO', 'TERCEIRO', 'IMOBILIARIA'] }).notNull(),
  /** IRRF: retenção informada pelo locatário pessoa jurídica (Q18), usada na base da DIMOB. */
  natureza: text('natureza', { enum: ['OUTRO', 'IRRF'] }).notNull().default('OUTRO'),
  beneficiarioId: integer('beneficiario_id').references(() => pessoa.id, { onDelete: 'restrict' }),
  situacao: text('situacao', { enum: ['PENDENTE', 'INCLUIDO', 'LANCADO', 'CANCELADO'] }).notNull(),
  tituloId: integer('titulo_id'),
  lancamentoId: integer('lancamento_id'),
  motivoCancelamento: text('motivo_cancelamento'),
  ...carimbos
})

export const reajuste = sqliteTable('reajuste', {
  id: integer('id').primaryKey(),
  contratoId: integer('contrato_id')
    .notNull()
    .references(() => contratoLocacao.id, { onDelete: 'restrict' }),
  dataBase: text('data_base').notNull(),
  indiceId: integer('indice_id').references(() => indiceEconomico.id, { onDelete: 'restrict' }),
  competenciaInicial: text('competencia_inicial'),
  competenciaFinal: text('competencia_final'),
  acumuladoPpm: integer('acumulado_ppm'),
  aplicadoPpm: integer('aplicado_ppm').notNull(),
  valorAnteriorCentavos: integer('valor_anterior_centavos').notNull(),
  valorNovoCentavos: integer('valor_novo_centavos').notNull(),
  situacao: text('situacao', { enum: ['APLICADO', 'DISPENSADO'] }).notNull(),
  motivo: text('motivo'),
  criadoEm: text('criado_em').notNull(),
  criadoPor: integer('criado_por')
})

export const aditivo = sqliteTable('aditivo', {
  id: integer('id').primaryKey(),
  contratoId: integer('contrato_id')
    .notNull()
    .references(() => contratoLocacao.id, { onDelete: 'restrict' }),
  tipo: text('tipo').notNull(),
  data: text('data').notNull(),
  descricao: text('descricao').notNull(),
  dataFimAnterior: text('data_fim_anterior'),
  dataFimNova: text('data_fim_nova'),
  valorAnteriorCentavos: integer('valor_anterior_centavos'),
  valorNovoCentavos: integer('valor_novo_centavos'),
  criadoEm: text('criado_em').notNull(),
  criadoPor: integer('criado_por')
})

export const rescisao = sqliteTable('rescisao', {
  id: integer('id').primaryKey(),
  contratoId: integer('contrato_id')
    .notNull()
    .unique()
    .references(() => contratoLocacao.id, { onDelete: 'restrict' }),
  dataEntregaChaves: text('data_entrega_chaves').notNull(),
  iniciativa: text('iniciativa').notNull(),
  motivo: text('motivo').notNull(),
  multaCalculadaCentavos: integer('multa_calculada_centavos').notNull(),
  multaCobradaCentavos: integer('multa_cobrada_centavos').notNull(),
  dispensaMotivo: text('dispensa_motivo'),
  memoria: text('memoria').notNull(),
  criadoEm: text('criado_em').notNull(),
  criadoPor: integer('criado_por')
})

// ───────────── Financeiro: títulos, baixas e razão ─────────────

export const titulo = sqliteTable(
  'titulo',
  {
    id: integer('id').primaryKey(),
    sentido: text('sentido', { enum: ['RECEBER', 'PAGAR'] }).notNull(),
    origem: text('origem').notNull(),
    contratoId: integer('contrato_id').references(() => contratoLocacao.id, { onDelete: 'restrict' }),
    pessoaId: integer('pessoa_id')
      .notNull()
      .references(() => pessoa.id, { onDelete: 'restrict' }),
    descricao: text('descricao').notNull(),
    competencia: text('competencia'),
    emissao: text('emissao').notNull(),
    vencimentoOriginal: text('vencimento_original').notNull(),
    vencimento: text('vencimento').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    situacao: text('situacao', { enum: ['ABERTO', 'PARCIAL', 'LIQUIDADO', 'CANCELADO', 'RENEGOCIADO'] }).notNull(),
    recurso: text('recurso', { enum: ['PROPRIO', 'TERCEIROS'] }).notNull(),
    multaBp: integer('multa_bp').notNull().default(0),
    jurosMesBp: integer('juros_mes_bp').notNull().default(0),
    destinoEncargos: text('destino_encargos', { enum: ['PROPRIETARIO', 'IMOBILIARIA'] }).notNull().default('PROPRIETARIO'),
    chaveIdempotencia: text('chave_idempotencia').unique(),
    renegociacaoId: integer('renegociacao_id'),
    repasseId: integer('repasse_id'),
    motivoCancelamento: text('motivo_cancelamento'),
    ...carimbos
  },
  (t) => [index('ix_titulo_situacao_venc').on(t.sentido, t.situacao, t.vencimento), index('ix_titulo_contrato').on(t.contratoId), index('ix_titulo_pessoa').on(t.pessoaId)]
)

export const tituloItem = sqliteTable(
  'titulo_item',
  {
    id: integer('id').primaryKey(),
    tituloId: integer('titulo_id')
      .notNull()
      .references(() => titulo.id, { onDelete: 'restrict' }),
    tipo: text('tipo').notNull(),
    descricao: text('descricao').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    /** Para quem vai o valor recebido: proprietário(s), terceiro, imobiliária (receita) ou caução (passivo). */
    destino: text('destino', { enum: ['PROPRIETARIO', 'TERCEIRO', 'IMOBILIARIA', 'CAUCAO', 'PASSIVO', 'DESPESA'] }).notNull(),
    beneficiarioId: integer('beneficiario_id').references(() => pessoa.id, { onDelete: 'restrict' }),
    contaGerencialId: integer('conta_gerencial_id').references(() => contaGerencial.id, { onDelete: 'restrict' }),
    taxaBp: integer('taxa_bp').notNull().default(0),
    taxaTipo: text('taxa_tipo', { enum: ['ADMINISTRACAO', 'INTERMEDIACAO'] }),
    lancamentoAvulsoId: integer('lancamento_avulso_id')
  },
  (t) => [index('ix_titulo_item_titulo').on(t.tituloId)]
)

export const baixa = sqliteTable(
  'baixa',
  {
    id: integer('id').primaryKey(),
    tituloId: integer('titulo_id')
      .notNull()
      .references(() => titulo.id, { onDelete: 'restrict' }),
    data: text('data').notNull(),
    principalCentavos: integer('principal_centavos').notNull(),
    multaCentavos: integer('multa_centavos').notNull().default(0),
    jurosCentavos: integer('juros_centavos').notNull().default(0),
    descontoCentavos: integer('desconto_centavos').notNull().default(0),
    totalCentavos: integer('total_centavos').notNull(),
    contaFinanceiraId: integer('conta_financeira_id').references(() => contaFinanceira.id, { onDelete: 'restrict' }),
    forma: text('forma').notNull(),
    observacao: text('observacao'),
    lancamentoId: integer('lancamento_id'),
    estornada: integer('estornada', { mode: 'boolean' }).notNull().default(false),
    estornoLancamentoId: integer('estorno_lancamento_id'),
    estornoMotivo: text('estorno_motivo'),
    estornadaEm: text('estornada_em'),
    estornadaPor: integer('estornada_por'),
    criadoEm: text('criado_em').notNull(),
    criadoPor: integer('criado_por')
  },
  (t) => [index('ix_baixa_titulo').on(t.tituloId)]
)

/** Quanto de cada item do título foi quitado por uma baixa (pago em dinheiro e/ou desconto). */
export const baixaItem = sqliteTable(
  'baixa_item',
  {
    baixaId: integer('baixa_id')
      .notNull()
      .references(() => baixa.id, { onDelete: 'restrict' }),
    tituloItemId: integer('titulo_item_id')
      .notNull()
      .references(() => tituloItem.id, { onDelete: 'restrict' }),
    pagoCentavos: integer('pago_centavos').notNull(),
    descontoCentavos: integer('desconto_centavos').notNull().default(0)
  },
  (t) => [primaryKey({ columns: [t.baixaId, t.tituloItemId] }), index('ix_baixa_item_item').on(t.tituloItemId)]
)

export const lancamento = sqliteTable(
  'lancamento',
  {
    id: integer('id').primaryKey(),
    data: text('data').notNull(),
    historico: text('historico').notNull(),
    origem: text('origem').notNull(),
    origemId: integer('origem_id'),
    estornoDeId: integer('estorno_de_id'),
    criadoEm: text('criado_em').notNull(),
    criadoPor: integer('criado_por')
  },
  (t) => [index('ix_lancamento_origem').on(t.origem, t.origemId), index('ix_lancamento_data').on(t.data)]
)

/** Partidas dobradas. Imutáveis, exceto a marcação de repasse (repasse_id). */
export const partida = sqliteTable(
  'partida',
  {
    id: integer('id').primaryKey(),
    lancamentoId: integer('lancamento_id')
      .notNull()
      .references(() => lancamento.id, { onDelete: 'restrict' }),
    contaGerencialId: integer('conta_gerencial_id')
      .notNull()
      .references(() => contaGerencial.id, { onDelete: 'restrict' }),
    pessoaId: integer('pessoa_id').references(() => pessoa.id, { onDelete: 'restrict' }),
    contaFinanceiraId: integer('conta_financeira_id').references(() => contaFinanceira.id, { onDelete: 'restrict' }),
    contratoId: integer('contrato_id').references(() => contratoLocacao.id, { onDelete: 'restrict' }),
    tituloId: integer('titulo_id'),
    debitoCentavos: integer('debito_centavos').notNull().default(0),
    creditoCentavos: integer('credito_centavos').notNull().default(0),
    historico: text('historico').notNull(),
    repasseId: integer('repasse_id')
  },
  (t) => [
    index('ix_partida_conta_pessoa').on(t.contaGerencialId, t.pessoaId, t.repasseId),
    index('ix_partida_conta_financeira').on(t.contaFinanceiraId),
    index('ix_partida_lancamento').on(t.lancamentoId)
  ]
)

export const repasse = sqliteTable('repasse', {
  id: integer('id').primaryKey(),
  tipo: text('tipo', { enum: ['PROPRIETARIO', 'TERCEIRO', 'CAUCAO'] }).notNull(),
  pessoaId: integer('pessoa_id')
    .notNull()
    .references(() => pessoa.id, { onDelete: 'restrict' }),
  contaGerencialId: integer('conta_gerencial_id')
    .notNull()
    .references(() => contaGerencial.id, { onDelete: 'restrict' }),
  data: text('data').notNull(),
  valorCentavos: integer('valor_centavos').notNull(),
  tituloId: integer('titulo_id'),
  situacao: text('situacao', { enum: ['ABERTO', 'PAGO', 'CANCELADO'] }).notNull(),
  motivoCancelamento: text('motivo_cancelamento'),
  criadoEm: text('criado_em').notNull(),
  criadoPor: integer('criado_por')
})

export const renegociacao = sqliteTable('renegociacao', {
  id: integer('id').primaryKey(),
  pessoaId: integer('pessoa_id')
    .notNull()
    .references(() => pessoa.id, { onDelete: 'restrict' }),
  contratoId: integer('contrato_id').references(() => contratoLocacao.id, { onDelete: 'restrict' }),
  data: text('data').notNull(),
  motivo: text('motivo').notNull(),
  saldoOriginalCentavos: integer('saldo_original_centavos').notNull(),
  encargosCentavos: integer('encargos_centavos').notNull(),
  descontoCentavos: integer('desconto_centavos').notNull(),
  totalCentavos: integer('total_centavos').notNull(),
  parcelas: integer('parcelas').notNull(),
  titulosOrigem: text('titulos_origem').notNull(),
  criadoEm: text('criado_em').notNull(),
  criadoPor: integer('criado_por')
})

/** Valor do aluguel vigente a partir de cada competência (contrato, reajustes e aditivos). */
export const aluguelVigencia = sqliteTable(
  'aluguel_vigencia',
  {
    contratoId: integer('contrato_id')
      .notNull()
      .references(() => contratoLocacao.id, { onDelete: 'restrict' }),
    competencia: text('competencia').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    origem: text('origem', { enum: ['CONTRATO', 'REAJUSTE', 'ADITIVO'] }).notNull(),
    origemId: integer('origem_id'),
    criadoEm: text('criado_em').notNull(),
    criadoPor: integer('criado_por')
  },
  (t) => [primaryKey({ columns: [t.contratoId, t.competencia] })]
)

// ───────────── Tesouraria: transferências, extratos e conciliação ─────────────

export const transferencia = sqliteTable('transferencia', {
  id: integer('id').primaryKey(),
  data: text('data').notNull(),
  origemId: integer('origem_id')
    .notNull()
    .references(() => contaFinanceira.id, { onDelete: 'restrict' }),
  destinoId: integer('destino_id')
    .notNull()
    .references(() => contaFinanceira.id, { onDelete: 'restrict' }),
  valorCentavos: integer('valor_centavos').notNull(),
  descricao: text('descricao').notNull(),
  lancamentoId: integer('lancamento_id').notNull(),
  estornada: integer('estornada', { mode: 'boolean' }).notNull().default(false),
  estornoMotivo: text('estorno_motivo'),
  criadoEm: text('criado_em').notNull(),
  criadoPor: integer('criado_por')
})

export const extratoImportacao = sqliteTable(
  'extrato_importacao',
  {
    id: integer('id').primaryKey(),
    contaFinanceiraId: integer('conta_financeira_id')
      .notNull()
      .references(() => contaFinanceira.id, { onDelete: 'restrict' }),
    arquivo: text('arquivo').notNull(),
    formato: text('formato', { enum: ['OFX', 'CSV'] }).notNull(),
    sha256: text('sha256').notNull(),
    periodoInicio: text('periodo_inicio'),
    periodoFim: text('periodo_fim'),
    saldoFinalCentavos: integer('saldo_final_centavos'),
    dataSaldoFinal: text('data_saldo_final'),
    linhasLidas: integer('linhas_lidas').notNull(),
    linhasNovas: integer('linhas_novas').notNull(),
    importadoEm: text('importado_em').notNull(),
    importadoPor: integer('importado_por')
  },
  (t) => [uniqueIndex('ux_extrato_arquivo').on(t.contaFinanceiraId, t.sha256)]
)

export const extratoLinha = sqliteTable(
  'extrato_linha',
  {
    id: integer('id').primaryKey(),
    importacaoId: integer('importacao_id')
      .notNull()
      .references(() => extratoImportacao.id, { onDelete: 'restrict' }),
    contaFinanceiraId: integer('conta_financeira_id')
      .notNull()
      .references(() => contaFinanceira.id, { onDelete: 'restrict' }),
    data: text('data').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    descricao: text('descricao').notNull(),
    documento: text('documento'),
    /** Identificador estável da transação (FITID do OFX ou hash de data/valor/descrição/ocorrência). */
    chave: text('chave').notNull(),
    situacao: text('situacao', { enum: ['PENDENTE', 'CONCILIADA', 'IGNORADA'] }).notNull().default('PENDENTE'),
    motivoIgnorar: text('motivo_ignorar')
  },
  (t) => [uniqueIndex('ux_extrato_linha_chave').on(t.contaFinanceiraId, t.chave), index('ix_extrato_linha_conta').on(t.contaFinanceiraId, t.situacao, t.data)]
)

/** Vínculo 1:1 entre uma linha do extrato e a partida de disponibilidades correspondente. */
export const conciliacao = sqliteTable('conciliacao', {
  extratoLinhaId: integer('extrato_linha_id')
    .primaryKey()
    .references(() => extratoLinha.id, { onDelete: 'restrict' }),
  partidaId: integer('partida_id')
    .notNull()
    .unique()
    .references(() => partida.id, { onDelete: 'restrict' }),
  automatica: integer('automatica', { mode: 'boolean' }).notNull().default(false),
  conciliadoEm: text('conciliado_em').notNull(),
  conciliadoPor: integer('conciliado_por')
})
