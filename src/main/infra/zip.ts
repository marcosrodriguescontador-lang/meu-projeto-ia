import { createWriteStream, promises as fs } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import yazl from 'yazl'

export async function compactar(destino: string, arquivos: { origem: string; nome: string }[]): Promise<void> {
  const zip = new yazl.ZipFile()
  for (const a of arquivos) zip.addFile(a.origem, a.nome, { compress: !a.nome.endsWith('.bin') })
  zip.end()
  await pipeline(zip.outputStream, createWriteStream(destino))
}

/** Extrai o ZIP em `destino`, recusando caminhos que escapem do diretório (zip-slip). */
export async function extrair(origem: string, destino: string): Promise<string[]> {
  const raiz = resolve(destino)
  const zip = await new Promise<yauzl.ZipFile>((ok, falha) => yauzl.open(origem, { lazyEntries: true }, (e, z) => (e ? falha(e) : ok(z!))))
  const nomes: string[] = []
  await new Promise<void>((ok, falha) => {
    zip.on('error', falha)
    zip.on('end', () => ok())
    zip.on('entry', (entrada: yauzl.Entry) => {
      const alvo = resolve(raiz, entrada.fileName)
      if (!alvo.startsWith(raiz + sep)) return falha(new Error(`Caminho inválido no pacote: ${entrada.fileName}`))
      if (entrada.fileName.endsWith('/')) return zip.readEntry()
      zip.openReadStream(entrada, async (e, leitura) => {
        if (e) return falha(e)
        try {
          await fs.mkdir(dirname(alvo), { recursive: true })
          await pipeline(leitura!, createWriteStream(alvo))
          nomes.push(entrada.fileName)
          zip.readEntry()
        } catch (err) {
          falha(err as Error)
        }
      })
    })
    zip.readEntry()
  })
  zip.close()
  return nomes
}

export async function listarArquivosRecursivo(dir: string, base = dir): Promise<{ caminho: string; relativo: string }[]> {
  const saida: { caminho: string; relativo: string }[] = []
  let entradas: import('node:fs').Dirent[]
  try {
    entradas = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return saida
  }
  for (const e of entradas) {
    const caminho = join(dir, e.name)
    if (e.isDirectory()) saida.push(...(await listarArquivosRecursivo(caminho, base)))
    else if (e.isFile()) saida.push({ caminho, relativo: caminho.slice(base.length + 1).split(sep).join('/') })
  }
  return saida
}
