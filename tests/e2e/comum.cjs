// Utilitários compartilhados pelos testes E2E (Playwright + Electron).
const { _electron: electron } = require('playwright')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const zlib = require('node:zlib')

const RAIZ = join(__dirname, '..', '..')
const SAIDA = process.env.E2E_CAPTURAS || join(RAIZ, 'docs', 'capturas')
mkdirSync(SAIDA, { recursive: true })

const SENHA_ADMIN = 'Administrador2026'

async function abrir(dados) {
  const app = await electron.launch({
    // E2E_EXECUTAVEL permite testar o aplicativo já empacotado.
    executablePath: process.env.E2E_EXECUTAVEL || require('electron'),
    args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), ...(process.env.E2E_EXECUTAVEL ? [] : [RAIZ])],
    env: { ...process.env, STATUS_ERP_DADOS: dados, ELECTRON_RENDERER_URL: '', STATUS_ERP_PROTETOR_TESTE: '1' }
  })
  const janela = await app.firstWindow()
  janela.on('pageerror', (e) => {
    console.error('Erro na interface:', e.message)
    process.exitCode = 1
  })
  await janela.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
  return { app, janela }
}

const foto = (j, nome) => j.screenshot({ path: join(SAIDA, `${nome}.png`) })

async function configurar(j) {
  await j.getByText('Bem-vindo ao STATUS ERP').waitFor()
  await j.getByLabel('Razão social').fill('Status Negócios Imobiliários Ltda')
  await j.getByRole('textbox', { name: 'Nome', exact: true }).fill('Marcos Rodrigues')
  await j.getByLabel('Usuário (login)').fill('marcos')
  const senhas = j.locator('input[type=password]')
  await senhas.nth(0).fill(SENHA_ADMIN)
  await senhas.nth(1).fill(SENHA_ADMIN)
  await senhas.nth(2).fill('CofreBackup2026')
  await senhas.nth(3).fill('CofreBackup2026')
  await j.getByRole('button', { name: 'Concluir configuração' }).click()
  await j.getByRole('heading', { name: 'Entrar' }).waitFor()
}

async function entrar(j) {
  await j.getByLabel('Usuário').fill('marcos')
  await j.getByLabel('Senha').fill(SENHA_ADMIN)
  await j.getByRole('button', { name: 'Entrar' }).click()
  await j.getByText('Olá, Marcos').waitFor()
}

/** Simula diálogos nativos do Electron (abrir/salvar arquivo) e a abertura de arquivos externos. */
async function simularDialogos(app, { abrir: arquivos = [], salvar = null } = {}) {
  await app.evaluate(
    ({ dialog, shell }, { arquivos, salvar }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: arquivos })
      dialog.showSaveDialog = async () => ({ canceled: !salvar, filePath: salvar ?? undefined })
      shell.openPath = async () => ''
    },
    { arquivos, salvar }
  )
}

/** Gera um PNG em degradê (imagem real, para testar fotos e miniaturas). */
function gerarPng(caminho, largura, altura, [r1, g1, b1], [r2, g2, b2]) {
  const linhas = []
  for (let y = 0; y < altura; y++) {
    const linha = Buffer.alloc(1 + largura * 3)
    for (let x = 0; x < largura; x++) {
      const t = (x / largura + y / altura) / 2
      linha[1 + x * 3] = Math.round(r1 + (r2 - r1) * t)
      linha[2 + x * 3] = Math.round(g1 + (g2 - g1) * t)
      linha[3 + x * 3] = Math.round(b1 + (b2 - b1) * t)
    }
    linhas.push(linha)
  }
  const crcTabela = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTabela[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(dados.length)
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(Buffer.concat([t, dados])))
    return Buffer.concat([len, t, dados, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  writeFileSync(caminho, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(Buffer.concat(linhas))), bloco('IEND', Buffer.alloc(0))]))
  return caminho
}

module.exports = { RAIZ, SAIDA, SENHA_ADMIN, abrir, foto, configurar, entrar, simularDialogos, gerarPng }
