// Utilitários que dependem do Electron (PDF, imagens, marca). Não usados nos testes de domínio.
import { BrowserWindow, nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { ProcessadorImagem } from '../infra/imagens'

/** Converte HTML em PDF A4 usando uma janela oculta, sem acesso à rede. */
export async function gerarPdf(html: string, dirTemporario: string): Promise<Buffer> {
  const arquivo = join(dirTemporario, `${randomUUID()}.html`)
  await fs.writeFile(arquivo, html, 'utf8')
  const janela = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } })
  try {
    await janela.loadFile(arquivo)
    return await janela.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
  } finally {
    janela.destroy()
    await fs.rm(arquivo, { force: true })
  }
}

const MIMES: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }

/** Logotipo oficial (assets/brand/logo.*) como data URL, se fornecido. */
export function lerLogoDataUrl(dir: string): string | null {
  if (!existsSync(dir)) return null
  const arquivo = readdirSync(dir).find((n) => /^logo\.(svg|png|webp)$/i.test(n))
  if (!arquivo) return null
  return `data:${MIMES[extname(arquivo).toLowerCase()]};base64,${readFileSync(join(dir, arquivo)).toString('base64')}`
}

/** Miniaturas JPEG via nativeImage. Formatos não decodificáveis (ex.: alguns WEBP) mantêm o original. */
export const processadorElectron: ProcessadorImagem = {
  miniatura: async (dados, mime, larguraMaxima) => {
    const img = nativeImage.createFromBuffer(dados)
    if (img.isEmpty()) return { dados, mime }
    const { width } = img.getSize()
    const reduzida = width > larguraMaxima ? img.resize({ width: larguraMaxima, quality: 'good' }) : img
    return { dados: reduzida.toJPEG(82), mime: 'image/jpeg' }
  }
}
