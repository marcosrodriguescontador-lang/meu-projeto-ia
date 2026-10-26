// Primitivas criptográficas: AES-256-GCM para campos e arquivos, HKDF para derivação de subchaves.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import { pipeline } from 'node:stream/promises'

const IV = 12
const TAG = 16
const PREFIXO = 'v1:'

export type Proposito = 'banco' | 'campos' | 'anexos'

export function gerarChave(): Buffer {
  return randomBytes(32)
}

export function derivarChave(mestra: Buffer, proposito: Proposito): Buffer {
  return Buffer.from(hkdfSync('sha256', mestra, Buffer.alloc(0), `status-erp:${proposito}`, 32))
}

export function cifrarTexto(chave: Buffer, texto: string): string {
  const iv = randomBytes(IV)
  const c = createCipheriv('aes-256-gcm', chave, iv)
  const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return PREFIXO + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
}

export function decifrarTexto(chave: Buffer, cifrado: string): string {
  if (!cifrado.startsWith(PREFIXO)) throw new Error('Formato de dado cifrado desconhecido')
  const b = Buffer.from(cifrado.slice(PREFIXO.length), 'base64')
  const d = createDecipheriv('aes-256-gcm', chave, b.subarray(0, IV))
  d.setAuthTag(b.subarray(IV, IV + TAG))
  return Buffer.concat([d.update(b.subarray(IV + TAG)), d.final()]).toString('utf8')
}

/** Formato do arquivo: [cabeçalho opcional][IV 12][conteúdo cifrado][TAG 16]. */
export async function cifrarArquivo(chave: Buffer, origem: string, destino: string, cabecalho?: Buffer): Promise<void> {
  const iv = randomBytes(IV)
  const c = createCipheriv('aes-256-gcm', chave, iv)
  const saida = createWriteStream(destino)
  if (cabecalho) saida.write(cabecalho)
  saida.write(iv)
  await pipeline(createReadStream(origem), c, saida, { end: false })
  await new Promise<void>((ok, falha) => saida.end(c.getAuthTag(), () => ok()).on('error', falha))
}

export async function decifrarArquivo(chave: Buffer, origem: string, destino: string, inicio = 0): Promise<void> {
  const { size } = await fs.stat(origem)
  if (size < inicio + IV + TAG) throw new Error('Arquivo cifrado truncado')
  const fh = await fs.open(origem, 'r')
  const iv = Buffer.alloc(IV)
  const tag = Buffer.alloc(TAG)
  try {
    await fh.read(iv, 0, IV, inicio)
    await fh.read(tag, 0, TAG, size - TAG)
  } finally {
    await fh.close()
  }
  const d = createDecipheriv('aes-256-gcm', chave, iv)
  d.setAuthTag(tag)
  try {
    await pipeline(createReadStream(origem, { start: inicio + IV, end: size - TAG - 1 }), d, createWriteStream(destino))
  } catch (e) {
    await fs.rm(destino, { force: true })
    throw new Error('Falha de integridade ao decifrar arquivo (senha incorreta ou arquivo corrompido)', { cause: e })
  }
}

export function sha256(dados: Buffer | string): string {
  return createHash('sha256').update(dados).digest('hex')
}

export async function sha256Arquivo(caminho: string): Promise<string> {
  const h = createHash('sha256')
  await pipeline(createReadStream(caminho), h)
  return h.digest('hex')
}
