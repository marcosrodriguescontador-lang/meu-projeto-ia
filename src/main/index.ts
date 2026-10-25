// Processo principal do Electron: ciclo de vida, janela, segurança e ponte RPC.
import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } from 'electron'
import { join } from 'node:path'
import { configurarLog, log } from './infra/logger'
import type { ProtetorSO } from './infra/keystore'
import { Cofre, protetorInseguroParaTestes } from './infra/keystore'
import { criarDespachante } from './ipc/roteador'
import { criarMetodos } from './ipc/metodos'
import type { Infra } from './nucleo/contexto'
import { definirCaminhos, encerrar, inicializar } from './nucleo/inicializacao'
import { backupDevido, criarBackup } from './modules/backup/backup'
import { lerConfig } from './modules/configuracoes/configuracoes'
import { Autenticacao } from './modules/seguranca/autenticacao'
import { GerenciadorSessao } from './modules/seguranca/sessao'

const DEV = !app.isPackaged
const DIR_DADOS = process.env.STATUS_ERP_DADOS || join(app.getPath('userData'), 'dados')

if (!app.requestSingleInstanceLock()) app.quit()
app.commandLine.appendSwitch('lang', 'pt-BR')

const protetorSO: ProtetorSO = {
  proteger: (d) => safeStorage.encryptString(d.toString('base64')),
  desproteger: (d) => Buffer.from(safeStorage.decryptString(d), 'base64')
}

let base: { infra: Infra; auth: Autenticacao } | null = null
let erroInicializacao: string | undefined
let janela: BrowserWindow | null = null
const caminhos = definirCaminhos(DIR_DADOS)

function escolherProtetor(): ProtetorSO {
  if (safeStorage.isEncryptionAvailable() && (process.platform === 'win32' || process.platform === 'darwin' || safeStorage.getSelectedStorageBackend?.() !== 'basic_text')) return protetorSO
  // Plataforma-alvo é Windows (DPAPI). Em Linux de desenvolvimento/testes sem chaveiro, o protetor
  // inseguro só é aceito em modo DEV ou com variável explícita — nunca no Windows.
  if (DEV || (process.platform !== 'win32' && process.env.STATUS_ERP_PROTETOR_TESTE === '1')) {
    log.aviso('Cofre do sistema operacional indisponível; usando protetor de desenvolvimento.')
    return protetorInseguroParaTestes
  }
  throw new Error('A proteção de chaves do sistema operacional não está disponível neste computador.')
}

async function iniciarInfra(): Promise<void> {
  configurarLog(caminhos.logs)
  try {
    const infra = await inicializar({ caminhos, protetor: escolherProtetor(), versaoApp: app.getVersion() })
    const sessao = new GerenciadorSessao(() => lerConfig(infra, 'seguranca')!.inatividadeMinutos * 60_000)
    base = { infra, auth: new Autenticacao(infra, sessao) }
    log.info('Sistema iniciado', { versao: app.getVersion() })
  } catch (e) {
    log.erro('Falha na inicialização', e)
    erroInicializacao =
      e instanceof Error && /file is not a database/i.test(e.message)
        ? 'Não foi possível abrir o banco de dados com a chave deste computador. Se o Windows foi reinstalado ou o usuário mudou, restaure a partir de um backup.'
        : `Falha ao iniciar: ${e instanceof Error ? e.message : String(e)}`
  }
}

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'STATUS ERP IMOBILIÁRIO',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true
    }
  })
  janela.once('ready-to-show', () => janela?.show())
  if (DEV && process.env.ELECTRON_RENDERER_URL) janela.loadURL(process.env.ELECTRON_RENDERER_URL)
  else janela.loadFile(join(__dirname, '../renderer/index.html'))
}

function endurecer(): void {
  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    wc.on('will-navigate', (ev, url) => {
      const permitido = (process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)) || url.startsWith('file://')
      if (!permitido) ev.preventDefault()
    })
  })
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  if (!DEV) {
    session.defaultSession.webRequest.onHeadersReceived((d, cb) =>
      cb({ responseHeaders: { ...d.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:"] } })
    )
  }
}

function agendarBackupAutomatico(): void {
  const verificar = async () => {
    if (!base) return
    try {
      if (backupDevido(base.infra)) await criarBackup(base.infra, { id: null, login: 'sistema' }, { tipo: 'AUTOMATICO' })
    } catch (e) {
      log.erro('Backup automático falhou', e)
    }
  }
  setTimeout(verificar, 60_000)
  setInterval(verificar, 15 * 60_000)
}

app.whenReady().then(async () => {
  endurecer()
  await iniciarInfra()
  const despachar = criarDespachante(
    () => base,
    criarMetodos({
      versaoApp: app.getVersion(),
      caminhos,
      cofre: () => base?.infra.cofre ?? new Cofre(caminhos.cofre, escolherProtetor()),
      erroInicializacao: () => erroInicializacao,
      reiniciar: () => {
        app.relaunch()
        app.exit(0)
      }
    })
  )
  ipcMain.handle('rpc', (ev, metodo: string, entrada: unknown) => {
    const origem = ev.senderFrame?.url ?? ''
    const confiavel = origem.startsWith('file://') || (DEV && !!process.env.ELECTRON_RENDERER_URL && origem.startsWith(process.env.ELECTRON_RENDERER_URL))
    if (!confiavel) return { ok: false, erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Origem não autorizada.' } }
    return despachar(metodo, entrada)
  })
  criarJanela()
  agendarBackupAutomatico()
})

app.on('second-instance', () => {
  if (janela) {
    if (janela.isMinimized()) janela.restore()
    janela.focus()
  }
})

app.on('window-all-closed', () => app.quit())

app.on('will-quit', () => {
  if (base) encerrar(base.infra)
})

process.on('uncaughtException', (e) => {
  log.erro('Exceção não tratada', e)
  if (!DEV) dialog.showErrorBox('STATUS ERP', 'Ocorreu um erro inesperado. Detalhes foram registrados no log.')
})
