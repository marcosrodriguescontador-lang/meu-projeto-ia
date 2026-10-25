import { z } from 'zod'
import { normalizarDocumento, UFS, validarCep, validarCnpj, validarCpf } from './documentos'

const texto = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres`)
const obrigatorio = (max: number) => texto(max).min(1, 'Campo obrigatório')
/** Campo opcional vindo de formulário: string vazia vira null. */
const opcional = (max: number) =>
  texto(max)
    .nullish()
    .transform((v) => (v ? v : null))
const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida')
const id = z.number().int().positive()

// ───────────── Segurança ─────────────

export const POLITICA_SENHA = 'Mínimo de 10 caracteres, com letras e números.'
export const senhaSchema = z
  .string()
  .min(10, POLITICA_SENHA)
  .max(128, 'Senha muito longa')
  .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), POLITICA_SENHA)

export const loginSchema = z.object({
  login: obrigatorio(60).transform((v) => v.toLowerCase()),
  senha: z.string().min(1, 'Informe a senha')
})

export const configuracaoInicialSchema = z
  .object({
    empresa: z.object({
      razaoSocial: obrigatorio(200),
      nomeFantasia: obrigatorio(200),
      cnpj: z.string().refine((v) => !v || validarCnpj(v), 'CNPJ inválido').transform((v) => (v ? normalizarDocumento(v) : null)),
      creci: obrigatorio(20)
    }),
    admin: z.object({
      nome: obrigatorio(120),
      login: obrigatorio(60)
        .regex(/^[a-zA-Z0-9._-]+$/, 'Use letras, números, ponto, hífen ou sublinhado')
        .transform((v) => v.toLowerCase()),
      senha: senhaSchema,
      confirmacao: z.string()
    }),
    backup: z.object({ senha: senhaSchema, confirmacao: z.string() })
  })
  .superRefine((v, ctx) => {
    if (v.admin.senha !== v.admin.confirmacao)
      ctx.addIssue({ code: 'custom', path: ['admin', 'confirmacao'], message: 'As senhas não conferem' })
    if (v.backup.senha !== v.backup.confirmacao)
      ctx.addIssue({ code: 'custom', path: ['backup', 'confirmacao'], message: 'As senhas não conferem' })
    if (v.backup.senha === v.admin.senha)
      ctx.addIssue({ code: 'custom', path: ['backup', 'senha'], message: 'Use uma senha de backup diferente da senha do administrador' })
  })

export const trocarSenhaSchema = z
  .object({ senhaAtual: z.string().min(1, 'Informe a senha atual'), novaSenha: senhaSchema, confirmacao: z.string() })
  .refine((v) => v.novaSenha === v.confirmacao, { path: ['confirmacao'], message: 'As senhas não conferem' })
  .refine((v) => v.novaSenha !== v.senhaAtual, { path: ['novaSenha'], message: 'A nova senha deve ser diferente da atual' })

export const usuarioSchema = z.object({
  nome: obrigatorio(120),
  login: obrigatorio(60)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use letras, números, ponto, hífen ou sublinhado')
    .transform((v) => v.toLowerCase()),
  email: z.union([z.literal(''), z.email('E-mail inválido')]).nullish().transform((v) => v || null),
  perfilId: id,
  pessoaId: id.nullish().transform((v) => v ?? null),
  ativo: z.boolean()
})

export const criarUsuarioSchema = usuarioSchema.extend({ senhaInicial: senhaSchema })

export const perfilSchema = z.object({
  nome: obrigatorio(60),
  descricao: opcional(200),
  permissoes: z.array(z.string())
})

// ───────────── Pessoas ─────────────

export const PAPEIS = {
  PROPRIETARIO: 'Proprietário',
  LOCATARIO: 'Locatário',
  FIADOR: 'Fiador',
  COMPRADOR: 'Comprador',
  VENDEDOR: 'Vendedor',
  CORRETOR: 'Corretor',
  PRESTADOR: 'Prestador de serviços',
  FORNECEDOR: 'Fornecedor',
  COLABORADOR: 'Colaborador'
} as const
export type Papel = keyof typeof PAPEIS
const papelEnum = z.enum(Object.keys(PAPEIS) as [Papel, ...Papel[]])

export const ESTADOS_CIVIS = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  UNIAO_ESTAVEL: 'União estável',
  SEPARADO: 'Separado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)'
} as const
export const REGIMES_BENS = {
  COMUNHAO_PARCIAL: 'Comunhão parcial',
  COMUNHAO_UNIVERSAL: 'Comunhão universal',
  SEPARACAO_TOTAL: 'Separação total',
  SEPARACAO_OBRIGATORIA: 'Separação obrigatória',
  PARTICIPACAO_AQUESTOS: 'Participação final nos aquestos'
} as const
export const SITUACOES_PESSOA = { ATIVO: 'Ativo', INATIVO: 'Inativo', BLOQUEADO: 'Bloqueado' } as const
export const TIPOS_CONTATO = { CELULAR: 'Celular', TELEFONE: 'Telefone', WHATSAPP: 'WhatsApp', EMAIL: 'E-mail' } as const
export const TIPOS_ENDERECO = { RESIDENCIAL: 'Residencial', COMERCIAL: 'Comercial', CORRESPONDENCIA: 'Correspondência' } as const
export const TIPOS_CONTA = { CORRENTE: 'Conta corrente', POUPANCA: 'Poupança', PAGAMENTO: 'Conta de pagamento' } as const
export const TIPOS_PIX = { CPF_CNPJ: 'CPF/CNPJ', EMAIL: 'E-mail', TELEFONE: 'Telefone', ALEATORIA: 'Chave aleatória' } as const
export const RELACOES = { CONJUGE: 'Cônjuge/companheiro(a)', REPRESENTANTE: 'Representante legal', SOCIO: 'Sócio', PROCURADOR: 'Procurador' } as const

const chaves = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

export const enderecoSchema = z.object({
  tipo: z.enum(chaves(TIPOS_ENDERECO)),
  cep: z.string().refine(validarCep, 'CEP inválido').transform((v) => v.replace(/\D/g, '')),
  logradouro: obrigatorio(200),
  numero: obrigatorio(20),
  complemento: opcional(100),
  bairro: obrigatorio(100),
  cidade: obrigatorio(100),
  uf: z.enum(UFS, 'UF inválida'),
  principal: z.boolean()
})

export const contatoSchema = z
  .object({
    tipo: z.enum(chaves(TIPOS_CONTATO)),
    valor: obrigatorio(150),
    nomeContato: opcional(100),
    principal: z.boolean()
  })
  .superRefine((c, ctx) => {
    if (c.tipo === 'EMAIL' && !z.email().safeParse(c.valor).success)
      ctx.addIssue({ code: 'custom', path: ['valor'], message: 'E-mail inválido' })
    if (c.tipo !== 'EMAIL' && !/^\d{10,13}$/.test(c.valor.replace(/\D/g, '')))
      ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Telefone inválido (informe DDD)' })
  })

export const relacaoSchema = z.object({ pessoaId: id, tipo: z.enum(chaves(RELACOES)) })

export const pessoaSchema = z
  .object({
    tipo: z.enum(['PF', 'PJ']),
    nome: obrigatorio(200).pipe(z.string().min(2, 'Nome muito curto')),
    nomeFantasia: opcional(200),
    documento: z.string().transform(normalizarDocumento),
    rgIe: opcional(30),
    orgaoEmissor: opcional(20),
    nascimento: dataIso.nullish().or(z.literal('')).transform((v) => v || null),
    nacionalidade: opcional(60),
    estadoCivil: z.enum(chaves(ESTADOS_CIVIS)).nullish().or(z.literal('')).transform((v) => v || null),
    regimeBens: z.enum(chaves(REGIMES_BENS)).nullish().or(z.literal('')).transform((v) => v || null),
    profissao: opcional(100),
    creci: opcional(20),
    situacao: z.enum(chaves(SITUACOES_PESSOA)),
    observacoes: opcional(4000),
    papeis: z.array(papelEnum).min(1, 'Selecione ao menos um papel'),
    enderecos: z.array(enderecoSchema),
    contatos: z.array(contatoSchema),
    relacoes: z.array(relacaoSchema)
  })
  .superRefine((p, ctx) => {
    const valido = p.tipo === 'PF' ? validarCpf(p.documento) : validarCnpj(p.documento)
    if (!valido) ctx.addIssue({ code: 'custom', path: ['documento'], message: p.tipo === 'PF' ? 'CPF inválido' : 'CNPJ inválido' })
    if (p.tipo === 'PJ' && (p.estadoCivil || p.regimeBens || p.nascimento))
      ctx.addIssue({ code: 'custom', path: ['tipo'], message: 'Pessoa jurídica não possui estado civil, regime de bens ou nascimento' })
    if (p.regimeBens && !['CASADO', 'UNIAO_ESTAVEL'].includes(p.estadoCivil ?? ''))
      ctx.addIssue({ code: 'custom', path: ['regimeBens'], message: 'Regime de bens apenas para casado(a) ou união estável' })
    if (p.enderecos.filter((e) => e.principal).length > 1)
      ctx.addIssue({ code: 'custom', path: ['enderecos'], message: 'Apenas um endereço pode ser o principal' })
    if (p.papeis.includes('CORRETOR') && !p.creci)
      ctx.addIssue({ code: 'custom', path: ['creci'], message: 'Informe o CRECI do corretor' })
    if (new Set(p.papeis).size !== p.papeis.length)
      ctx.addIssue({ code: 'custom', path: ['papeis'], message: 'Papel repetido' })
  })

export const listarPessoasSchema = z.object({
  busca: z.string().trim().max(100).optional(),
  papel: papelEnum.optional(),
  situacao: z.enum(chaves(SITUACOES_PESSOA)).optional(),
  pagina: z.number().int().min(1).default(1),
  porPagina: z.number().int().min(10).max(200).default(50)
})

export const dadoBancarioSchema = z
  .object({
    bancoCodigo: z.string().regex(/^\d{3}$/, 'Código do banco com 3 dígitos'),
    bancoNome: obrigatorio(80),
    agencia: z.string().trim().regex(/^\d{1,5}(-?[\dXx])?$/, 'Agência inválida'),
    conta: z.string().trim().regex(/^\d{1,13}$/, 'Somente números'),
    digito: z.string().trim().regex(/^[\dXx]{0,2}$/, 'Dígito inválido'),
    tipoConta: z.enum(chaves(TIPOS_CONTA)),
    pixTipo: z.enum(chaves(TIPOS_PIX)).nullish().or(z.literal('')).transform((v) => v || null),
    pixChave: opcional(140),
    titularNome: obrigatorio(200),
    titularDocumento: z.string().transform(normalizarDocumento).refine((d) => validarCpf(d) || validarCnpj(d), 'CPF/CNPJ do titular inválido'),
    principal: z.boolean()
  })
  .refine((d) => !d.pixTipo === !d.pixChave, { path: ['pixChave'], message: 'Informe tipo e chave PIX juntos' })

export const exclusaoSchema = z.object({ id, motivo: obrigatorio(500).pipe(z.string().min(5, 'Descreva o motivo')) })

// ───────────── Configurações ─────────────

export const empresaSchema = z.object({
  razaoSocial: obrigatorio(200),
  nomeFantasia: obrigatorio(200),
  cnpj: z.string().refine((v) => !v || validarCnpj(v), 'CNPJ inválido').transform((v) => (v ? normalizarDocumento(v) : null)),
  creci: obrigatorio(20),
  endereco: opcional(300),
  telefone: opcional(30),
  email: z.union([z.literal(''), z.email('E-mail inválido')]).nullish().transform((v) => v || null)
})

export const segurancaConfigSchema = z.object({
  inatividadeMinutos: z.number().int().min(1).max(120),
  tentativasBloqueio: z.number().int().min(3).max(10),
  minutosBloqueio: z.number().int().min(1).max(1440)
})

export const backupConfigSchema = z.object({
  automatico: z.boolean(),
  intervaloHoras: z.number().int().min(1).max(168),
  destino: z.string().nullable(),
  reterQuantidade: z.number().int().min(1).max(365)
})

export type LoginInput = z.input<typeof loginSchema>
export type ConfiguracaoInicialInput = z.input<typeof configuracaoInicialSchema>
export type TrocarSenhaInput = z.input<typeof trocarSenhaSchema>
export type UsuarioInput = z.input<typeof usuarioSchema>
export type CriarUsuarioInput = z.input<typeof criarUsuarioSchema>
export type PerfilInput = z.input<typeof perfilSchema>
export type PessoaInput = z.input<typeof pessoaSchema>
export type PessoaDados = z.output<typeof pessoaSchema>
export type ListarPessoasInput = z.input<typeof listarPessoasSchema>
export type DadoBancarioInput = z.input<typeof dadoBancarioSchema>
export type EmpresaInput = z.input<typeof empresaSchema>
export type SegurancaConfig = z.output<typeof segurancaConfigSchema>
export type BackupConfig = z.output<typeof backupConfigSchema>
