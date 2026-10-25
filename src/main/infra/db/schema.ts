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
