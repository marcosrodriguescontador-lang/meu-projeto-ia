// Anexos (documentos e imagens) cifrados em disco com AES-256-GCM.
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { AnexoDto } from '@shared/dto'
import { erro } from '@shared/erros'
import type { Permissao } from '@shared/permissoes'
import { cifrarArquivo, decifrarArquivo, sha256Arquivo } from '../../infra/crypto'
import { anexo, contratoLocacao, imovel, imovelFoto, pessoa } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'

export const TAMANHO_MAXIMO = 50 * 1024 * 1024

export const TIPOS_PERMITIDOS: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.txt': 'text/plain'
}

export const CATEGORIAS_ANEXO = ['Documento de identificação', 'Comprovante de endereço', 'Comprovante de renda', 'Contrato social', 'Certidão', 'Procuração', 'Outros'] as const

export type Entidade = 'pessoa' | 'imovel' | 'contrato'

const PERMISSOES: Record<Entidade, { ver: Permissao; gerenciar: Permissao }> = {
  pessoa: { ver: 'pessoas.documentos.ver', gerenciar: 'pessoas.documentos.gerenciar' },
  imovel: { ver: 'imoveis.documentos.ver', gerenciar: 'imoveis.documentos.gerenciar' },
  contrato: { ver: 'locacoes.ver', gerenciar: 'locacoes.gerenciar' }
}

function caminhoArmazenado(infra: Infra, uuid: string): string {
  return join(infra.caminhos.anexos, uuid.slice(0, 2), `${uuid}.bin`)
}

function conferirEntidade(infra: Infra, entidade: Entidade, id: number): void {
  if (entidade === 'pessoa' && !infra.db.select({ id: pessoa.id }).from(pessoa).where(and(eq(pessoa.id, id), isNull(pessoa.excluidoEm))).get())
    throw erro.naoEncontrado('Pessoa')
  if (entidade === 'imovel' && !infra.db.select({ id: imovel.id }).from(imovel).where(and(eq(imovel.id, id), isNull(imovel.excluidoEm))).get())
    throw erro.naoEncontrado('Imóvel')
  if (entidade === 'contrato' && !infra.db.select({ id: contratoLocacao.id }).from(contratoLocacao).where(eq(contratoLocacao.id, id)).get()) throw erro.naoEncontrado('Contrato')
}

/** Lista documentos (fotos de imóveis têm galeria própria e não aparecem aqui). */
export function listarAnexos(infra: Infra, ator: Ator, entidade: Entidade, entidadeId: number): AnexoDto[] {
  exigir(ator, PERMISSOES[entidade].ver)
  return infra.db
    .select({ id: anexo.id, categoria: anexo.categoria, nomeOriginal: anexo.nomeOriginal, mime: anexo.mime, tamanho: anexo.tamanho, criadoEm: anexo.criadoEm, criadoPor: anexo.criadoPor })
    .from(anexo)
    .where(and(eq(anexo.entidade, entidade), eq(anexo.entidadeId, entidadeId), isNull(anexo.excluidoEm), sql`NOT EXISTS (SELECT 1 FROM ${imovelFoto} f WHERE f.anexo_id = ${anexo.id})`))
    .orderBy(asc(anexo.id))
    .all()
}

export interface OpcoesAnexo {
  permissao?: Permissao
  tipos?: Record<string, string>
  tamanhoMaximo?: number
  /** Executado na mesma transação do registro do anexo (ex.: vincular a foto). */
  aoRegistrar?: (anexoId: number) => void
}

export async function adicionarAnexo(infra: Infra, ator: Ator, entidade: Entidade, entidadeId: number, categoria: string, origem: string, op: OpcoesAnexo = {}): Promise<number> {
  exigir(ator, op.permissao ?? PERMISSOES[entidade].gerenciar)
  conferirEntidade(infra, entidade, entidadeId)
  const ext = extname(origem).toLowerCase()
  const tipos = op.tipos ?? TIPOS_PERMITIDOS
  const mime = tipos[ext]
  if (!mime) throw erro.validacao(`Tipo de arquivo não permitido (${ext || 'sem extensão'}). Permitidos: ${Object.keys(tipos).join(', ')}`)
  const { size } = await fs.stat(origem)
  const limite = op.tamanhoMaximo ?? TAMANHO_MAXIMO
  if (size > limite) throw erro.validacao(`Arquivo maior que ${Math.round(limite / 1024 / 1024)} MB.`)
  if (size === 0) throw erro.validacao('Arquivo vazio.')
  const uuid = randomUUID()
  const destino = caminhoArmazenado(infra, uuid)
  await fs.mkdir(join(destino, '..'), { recursive: true })
  const hash = await sha256Arquivo(origem)
  await cifrarArquivo(infra.chaves.anexos, origem, destino)
  try {
    return infra.bruto.transaction(() => {
      const { id } = infra.db
        .insert(anexo)
        .values({ uuid, entidade, entidadeId, categoria: categoria.slice(0, 60) || 'Outros', nomeOriginal: basename(origem).slice(0, 255), mime, tamanho: size, sha256: hash, criadoPor: ator.id })
        .returning({ id: anexo.id })
        .get()
      op.aoRegistrar?.(id)
      auditar(infra, ator, { acao: 'ANEXO_ADICIONADO', entidade, entidadeId, descricao: `${categoria}: ${basename(origem)}` })
      return id
    })()
  } catch (e) {
    await fs.rm(destino, { force: true })
    throw e
  }
}

function obterAnexo(infra: Infra, id: number) {
  const a = infra.db.select().from(anexo).where(and(eq(anexo.id, id), isNull(anexo.excluidoEm))).get()
  if (!a) throw erro.naoEncontrado('Anexo')
  return a
}

/** Decifra o anexo para `destino`, conferindo a integridade (SHA-256). */
export async function exportarAnexo(infra: Infra, ator: Ator, id: number, destino: string): Promise<void> {
  const a = obterAnexo(infra, id)
  exigir(ator, PERMISSOES[a.entidade as Entidade].ver)
  await decifrarArquivo(infra.chaves.anexos, caminhoArmazenado(infra, a.uuid), destino)
  if ((await sha256Arquivo(destino)) !== a.sha256) {
    await fs.rm(destino, { force: true })
    throw erro.regra('O arquivo anexado está corrompido. Restaure-o a partir de um backup.')
  }
  infra.bruto.transaction(() => auditar(infra, ator, { acao: 'ANEXO_ACESSADO', entidade: a.entidade, entidadeId: a.entidadeId, descricao: a.nomeOriginal }))()
}

export function nomeAnexo(infra: Infra, id: number): string {
  return obterAnexo(infra, id).nomeOriginal
}

/** Exclusão lógica: o arquivo cifrado é mantido para recuperação e auditoria. */
export function removerAnexo(infra: Infra, ator: Ator, id: number, motivo: string): void {
  const a = obterAnexo(infra, id)
  exigir(ator, PERMISSOES[a.entidade as Entidade].gerenciar)
  if (!motivo || motivo.trim().length < 5) throw erro.validacao('Informe o motivo da remoção.')
  infra.bruto.transaction(() => {
    infra.db.update(anexo).set({ excluidoEm: agoraIso(infra), excluidoPor: ator.id }).where(eq(anexo.id, id)).run()
    auditar(infra, ator, { acao: 'ANEXO_REMOVIDO', entidade: a.entidade, entidadeId: a.entidadeId, descricao: `${a.nomeOriginal} — motivo: ${motivo.trim()}` })
  })()
}

/** Armazena um conteúdo binário cifrado (ex.: miniatura de foto) e devolve o identificador. */
export async function armazenarConteudo(infra: Infra, dados: Buffer): Promise<string> {
  const uuid = randomUUID()
  const destino = caminhoArmazenado(infra, uuid)
  await fs.mkdir(join(destino, '..'), { recursive: true })
  const tmp = join(infra.caminhos.temporarios, `${uuid}.tmp`)
  await fs.writeFile(tmp, dados)
  try {
    await cifrarArquivo(infra.chaves.anexos, tmp, destino)
  } finally {
    await fs.rm(tmp, { force: true })
  }
  return uuid
}

export async function lerConteudo(infra: Infra, uuid: string): Promise<Buffer> {
  const tmp = join(infra.caminhos.temporarios, `${randomUUID()}.tmp`)
  try {
    await decifrarArquivo(infra.chaves.anexos, caminhoArmazenado(infra, uuid), tmp)
    return await fs.readFile(tmp)
  } finally {
    await fs.rm(tmp, { force: true })
  }
}

export function uuidAnexo(infra: Infra, id: number): { uuid: string; mime: string; nome: string; sha256: string } {
  const a = obterAnexo(infra, id)
  return { uuid: a.uuid, mime: a.mime, nome: a.nomeOriginal, sha256: a.sha256 }
}
