// Galeria de fotos do imóvel: original e miniatura cifradas em disco, ordem, capa e legenda.
import { and, asc, eq, sql } from 'drizzle-orm'
import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import type { FotoDto } from '@shared/dto'
import { erro } from '@shared/erros'
import { sha256 } from '../../infra/crypto'
import { anexo, imovelFoto } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { adicionarAnexo, armazenarConteudo, lerConteudo, uuidAnexo } from '../anexos/anexos'
import { auditar } from '../seguranca/auditoria'

export const TIPOS_FOTO: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
export const TAMANHO_MAXIMO_FOTO = 20 * 1024 * 1024
export const LARGURA_MINIATURA = 480
export const MAXIMO_FOTOS = 60

const dataUrl = (mime: string, dados: Buffer) => `data:${mime};base64,${dados.toString('base64')}`

function fotosDoImovel(infra: Infra, imovelId: number) {
  return infra.db
    .select({ id: imovelFoto.id, anexoId: imovelFoto.anexoId, miniaturaUuid: imovelFoto.miniaturaUuid, ordem: imovelFoto.ordem, capa: imovelFoto.capa, legenda: imovelFoto.legenda, nome: anexo.nomeOriginal, mime: anexo.mime })
    .from(imovelFoto)
    .innerJoin(anexo, eq(anexo.id, imovelFoto.anexoId))
    .where(eq(imovelFoto.imovelId, imovelId))
    .orderBy(asc(imovelFoto.ordem))
    .all()
}

async function miniaturaUrl(infra: Infra, uuid: string, mime: string): Promise<string> {
  const dados = await lerConteudo(infra, uuid)
  // Miniaturas geradas pelo Electron são JPEG; sem redimensionamento mantêm o formato original.
  const tipo = dados[0] === 0xff && dados[1] === 0xd8 ? 'image/jpeg' : mime
  return dataUrl(tipo, dados)
}

export async function listarFotos(infra: Infra, ator: Ator, imovelId: number): Promise<FotoDto[]> {
  exigir(ator, 'imoveis.ver')
  const saida: FotoDto[] = []
  for (const f of fotosDoImovel(infra, imovelId)) saida.push({ id: f.id, ordem: f.ordem, capa: f.capa, legenda: f.legenda, nome: f.nome, miniatura: await miniaturaUrl(infra, f.miniaturaUuid, f.mime) })
  return saida
}

export async function miniaturaCapa(infra: Infra, imovelId: number): Promise<string | null> {
  const f = infra.db
    .select({ uuid: imovelFoto.miniaturaUuid, mime: anexo.mime })
    .from(imovelFoto)
    .innerJoin(anexo, eq(anexo.id, imovelFoto.anexoId))
    .where(and(eq(imovelFoto.imovelId, imovelId), eq(imovelFoto.capa, true)))
    .get()
  if (!f) return null
  try {
    return await miniaturaUrl(infra, f.uuid, f.mime)
  } catch {
    return null
  }
}

export async function adicionarFotos(infra: Infra, ator: Ator, imovelId: number, arquivos: string[]): Promise<FotoDto[]> {
  exigir(ator, 'imoveis.editar')
  const existentes = fotosDoImovel(infra, imovelId).length
  if (existentes + arquivos.length > MAXIMO_FOTOS) throw erro.validacao(`Limite de ${MAXIMO_FOTOS} fotos por imóvel.`)
  for (const arquivo of arquivos) {
    const mime = TIPOS_FOTO[extname(arquivo).toLowerCase()]
    if (!mime) throw erro.validacao(`Formato de foto não permitido: ${extname(arquivo) || 'sem extensão'}. Use JPG, PNG ou WEBP.`)
    const { size } = await fs.stat(arquivo)
    if (size > TAMANHO_MAXIMO_FOTO) throw erro.validacao('Foto maior que 20 MB.')
    const original = await fs.readFile(arquivo)
    const mini = await infra.imagens.miniatura(original, mime, LARGURA_MINIATURA)
    const miniaturaUuid = await armazenarConteudo(infra, mini.dados)
    await adicionarAnexo(infra, ator, 'imovel', imovelId, 'Foto', arquivo, {
      permissao: 'imoveis.editar',
      tipos: TIPOS_FOTO,
      tamanhoMaximo: TAMANHO_MAXIMO_FOTO,
      aoRegistrar: (anexoId) => {
        const prox = infra.db.select({ m: sql<number>`coalesce(max(${imovelFoto.ordem}), 0)`, n: sql<number>`count(*)` }).from(imovelFoto).where(eq(imovelFoto.imovelId, imovelId)).get()!
        infra.db.insert(imovelFoto).values({ imovelId, anexoId, miniaturaUuid, ordem: prox.m + 1, capa: prox.n === 0 }).run()
      }
    })
  }
  return listarFotos(infra, ator, imovelId)
}

function obterFoto(infra: Infra, id: number) {
  const f = infra.db.select().from(imovelFoto).where(eq(imovelFoto.id, id)).get()
  if (!f) throw erro.naoEncontrado('Foto')
  return f
}

/** Imagem em resolução original (conferida pelo SHA-256 registrado). */
export async function verFoto(infra: Infra, ator: Ator, id: number): Promise<string> {
  exigir(ator, 'imoveis.ver')
  const f = obterFoto(infra, id)
  const a = uuidAnexo(infra, f.anexoId)
  const dados = await lerConteudo(infra, a.uuid)
  if (sha256(dados) !== a.sha256) throw erro.regra('A foto está corrompida. Restaure-a a partir de um backup.')
  return dataUrl(a.mime, dados)
}

export function definirLegenda(infra: Infra, ator: Ator, id: number, legenda: string): void {
  exigir(ator, 'imoveis.editar')
  const f = obterFoto(infra, id)
  const texto = legenda.trim().slice(0, 200) || null
  infra.bruto.transaction(() => {
    infra.db.update(imovelFoto).set({ legenda: texto }).where(eq(imovelFoto.id, id)).run()
    auditar(infra, ator, { acao: 'FOTO_ALTERADA', entidade: 'imovel', entidadeId: f.imovelId, descricao: `Legenda da foto #${id}: ${texto ?? '(vazia)'}` })
  })()
}

export function definirCapa(infra: Infra, ator: Ator, id: number): void {
  exigir(ator, 'imoveis.editar')
  const f = obterFoto(infra, id)
  infra.bruto.transaction(() => {
    infra.db.update(imovelFoto).set({ capa: false }).where(eq(imovelFoto.imovelId, f.imovelId)).run()
    infra.db.update(imovelFoto).set({ capa: true }).where(eq(imovelFoto.id, id)).run()
    auditar(infra, ator, { acao: 'FOTO_CAPA', entidade: 'imovel', entidadeId: f.imovelId, descricao: `Foto #${id} definida como capa` })
  })()
}

export function reordenarFotos(infra: Infra, ator: Ator, imovelId: number, ids: number[]): void {
  exigir(ator, 'imoveis.editar')
  const atuais = fotosDoImovel(infra, imovelId).map((f) => f.id)
  if (ids.length !== atuais.length || new Set(ids).size !== ids.length || ids.some((i) => !atuais.includes(i))) throw erro.validacao('Lista de fotos inválida para reordenação.')
  infra.bruto.transaction(() => {
    ids.forEach((id, i) => infra.db.update(imovelFoto).set({ ordem: i + 1 }).where(eq(imovelFoto.id, id)).run())
    auditar(infra, ator, { acao: 'FOTOS_REORDENADAS', entidade: 'imovel', entidadeId: imovelId })
  })()
}

/** Remove a foto da galeria. O arquivo é preservado (anexo com exclusão lógica). */
export function removerFoto(infra: Infra, ator: Ator, id: number, motivo: string): void {
  exigir(ator, 'imoveis.editar')
  if (!motivo || motivo.trim().length < 3) throw erro.validacao('Informe o motivo da remoção.')
  const f = obterFoto(infra, id)
  infra.bruto.transaction(() => {
    infra.db.delete(imovelFoto).where(eq(imovelFoto.id, id)).run()
    infra.db.update(anexo).set({ excluidoEm: agoraIso(infra), excluidoPor: ator.id }).where(eq(anexo.id, f.anexoId)).run()
    const restantes = fotosDoImovel(infra, f.imovelId)
    restantes.forEach((r, i) => infra.db.update(imovelFoto).set({ ordem: i + 1, capa: f.capa ? i === 0 : r.capa }).where(eq(imovelFoto.id, r.id)).run())
    auditar(infra, ator, { acao: 'FOTO_REMOVIDA', entidade: 'imovel', entidadeId: f.imovelId, descricao: `Foto #${id} — motivo: ${motivo.trim()}` })
  })()
}

/** Fotos para a ficha em PDF: capa em resolução original e demais em miniatura. */
export async function fotosParaFicha(infra: Infra, imovelId: number, limite = 6): Promise<{ capa: string | null; demais: string[] }> {
  const fotos = fotosDoImovel(infra, imovelId)
  const capa = fotos.find((f) => f.capa)
  let capaUrl: string | null = null
  if (capa) {
    const a = uuidAnexo(infra, capa.anexoId)
    capaUrl = dataUrl(a.mime, await lerConteudo(infra, a.uuid))
  }
  const demais: string[] = []
  for (const f of fotos.filter((x) => !x.capa).slice(0, limite)) demais.push(await miniaturaUrl(infra, f.miniaturaUuid, f.mime))
  return { capa: capaUrl, demais }
}
