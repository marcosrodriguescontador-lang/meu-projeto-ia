// Backup e restauração.
//
// Pacote .sbak = cabeçalho em claro (formato + parâmetros Argon2id) + ZIP cifrado com AES-256-GCM
// usando chave derivada da senha de backup. O ZIP contém:
//   manifest.json  — versões, contagens, SHA-256 de cada arquivo e a chave mestra do banco
//   status.db      — snapshot consistente obtido com VACUUM INTO (seguro durante gravações)
//   anexos/**      — arquivos anexados (já cifrados com a chave de anexos)
// O banco inclui configurações, modelos e cadastros; portanto o pacote basta para recuperação total.
import { desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type { BackupRegistroDto, ResumoBackup } from '@shared/dto'
import { erro } from '@shared/erros'
import { senhaSchema } from '@shared/schemas'
import { cifrarArquivo, decifrarArquivo, derivarChave, sha256Arquivo } from '../../infra/crypto'
import { abrirBancoBruto, MIGRACOES, VERSAO_SCHEMA } from '../../infra/db/conexao'
import { backupRegistro } from '../../infra/db/schema'
import { derivarChaveDeSenha, type Cofre, type ParametrosKdf } from '../../infra/keystore'
import { log } from '../../infra/logger'
import { compactar, extrair, listarArquivosRecursivo } from '../../infra/zip'
import { agoraIso, exigir, SISTEMA, type Ator, type Caminhos, type Infra } from '../../nucleo/contexto'
import { lerConfig } from '../configuracoes/configuracoes'
import { auditar } from '../seguranca/auditoria'

const MAGICO = Buffer.from('SBAK')
const VERSAO_FORMATO = 1
export const EXTENSAO = '.sbak'

interface Manifesto {
  formato: number
  criadoEm: string
  versaoApp: string
  versaoSchema: string
  empresa: string | null
  chaveMestra: string
  contagens: Record<string, number>
  arquivos: { nome: string; sha256: string; tamanho: number }[]
}

interface CabecalhoPacote {
  kdf: ParametrosKdf
  criadoEm: string
  versaoApp: string
  versaoSchema: string
}

let emExecucao = false

function cabecalho(c: CabecalhoPacote): Buffer {
  const json = Buffer.from(JSON.stringify(c), 'utf8')
  const tam = Buffer.alloc(4)
  tam.writeUInt32BE(json.length)
  return Buffer.concat([MAGICO, Buffer.from([VERSAO_FORMATO]), tam, json])
}

async function lerCabecalho(arquivo: string): Promise<{ cab: CabecalhoPacote; inicio: number }> {
  const fh = await fs.open(arquivo, 'r')
  try {
    const pre = Buffer.alloc(9)
    await fh.read(pre, 0, 9, 0)
    if (!pre.subarray(0, 4).equals(MAGICO)) throw erro.validacao('O arquivo selecionado não é um backup do STATUS ERP.')
    if (pre[4] !== VERSAO_FORMATO) throw erro.validacao('Formato de backup não suportado por esta versão.')
    const tam = pre.readUInt32BE(5)
    if (tam > 64 * 1024) throw erro.validacao('Cabeçalho de backup inválido.')
    const json = Buffer.alloc(tam)
    await fh.read(json, 0, tam, 9)
    return { cab: JSON.parse(json.toString('utf8')) as CabecalhoPacote, inicio: 9 + tam }
  } finally {
    await fh.close()
  }
}

function carimbo(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
}

async function tempDir(caminhos: Caminhos, prefixo: string): Promise<string> {
  const dir = join(caminhos.temporarios, `${prefixo}-${randomUUID()}`)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

/** Decifra, extrai e confere hashes e integridade do banco. Retorna o diretório extraído e o manifesto. */
async function abrirPacote(arquivo: string, chave: Buffer, inicio: number, destino: string): Promise<Manifesto> {
  const zip = join(destino, '..', `${basename(destino)}.zip`)
  try {
    await decifrarArquivo(chave, arquivo, zip, inicio)
  } catch {
    throw erro.validacao('Senha de backup incorreta ou arquivo corrompido.')
  }
  try {
    await extrair(zip, destino)
  } finally {
    await fs.rm(zip, { force: true })
  }
  const manifesto = JSON.parse(await fs.readFile(join(destino, 'manifest.json'), 'utf8')) as Manifesto
  for (const a of manifesto.arquivos) {
    const caminho = join(destino, a.nome)
    if (!existsSync(caminho) || (await sha256Arquivo(caminho)) !== a.sha256) throw erro.regra(`Backup corrompido: arquivo "${a.nome}" não confere.`)
  }
  const chaveBanco = derivarChave(Buffer.from(manifesto.chaveMestra, 'base64'), 'banco')
  const db = abrirBancoBruto(join(destino, 'status.db'), chaveBanco, true)
  try {
    const r = db.pragma('integrity_check', { simple: true })
    if (r !== 'ok') throw erro.regra(`Banco do backup falhou na verificação de integridade: ${String(r)}`)
    if ((db.pragma('foreign_key_check') as unknown[]).length) throw erro.regra('Banco do backup possui violações de integridade referencial.')
  } finally {
    db.close()
  }
  return manifesto
}

/** Contagens lidas do próprio snapshot (e não do banco em uso, que pode ter mudado depois). */
function contagensDoSnapshot(arquivo: string, chaveBanco: Buffer): Record<string, number> {
  const db = abrirBancoBruto(arquivo, chaveBanco, true)
  try {
    const n = (t: string) => (db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n
    return { pessoas: n('pessoa WHERE excluido_em IS NULL'), usuarios: n('usuario'), anexos: n('anexo WHERE excluido_em IS NULL'), auditoria: n('auditoria') }
  } finally {
    db.close()
  }
}

export async function criarBackup(infra: Infra, ator: Ator, opcoes: { tipo: 'MANUAL' | 'AUTOMATICO' | 'PRE_RESTAURACAO'; destino?: string | null }): Promise<BackupRegistroDto> {
  if (ator.id !== null) exigir(ator, 'backup.executar')
  if (emExecucao) throw erro.regra('Já existe um backup em andamento.')
  emExecucao = true
  const inicio = infra.agora()
  const destinoDir = opcoes.destino || lerConfig(infra, 'backup')!.destino || infra.caminhos.backups
  const prefixo = opcoes.tipo === 'AUTOMATICO' ? 'auto' : opcoes.tipo === 'PRE_RESTAURACAO' ? 'pre-restauracao' : 'manual'
  const arquivo = join(destinoDir, `status-erp-${prefixo}-${carimbo(inicio)}${EXTENSAO}`)
  const trabalho = await tempDir(infra.caminhos, 'backup')
  try {
    await fs.mkdir(destinoDir, { recursive: true })
    const { chave, kdf } = infra.cofre.chaveBackup()

    // 1. Snapshot transacional do banco (consistente mesmo com gravações em andamento).
    const dbSnap = join(trabalho, 'status.db')
    infra.bruto.prepare('VACUUM INTO ?').run(dbSnap)

    // 2. Anexos + manifesto.
    const anexos = await listarArquivosRecursivo(infra.caminhos.anexos)
    const itens = [{ origem: dbSnap, nome: 'status.db' }, ...anexos.map((a) => ({ origem: a.caminho, nome: `anexos/${a.relativo}` }))]
    const arquivos: Manifesto['arquivos'] = []
    for (const i of itens) arquivos.push({ nome: i.nome, sha256: await sha256Arquivo(i.origem), tamanho: (await fs.stat(i.origem)).size })
    const manifesto: Manifesto = {
      formato: VERSAO_FORMATO,
      criadoEm: inicio.toISOString(),
      versaoApp: infra.versaoApp,
      versaoSchema: VERSAO_SCHEMA,
      empresa: lerConfig(infra, 'empresa')?.nomeFantasia ?? null,
      chaveMestra: infra.cofre.chaveMestra().toString('base64'),
      contagens: contagensDoSnapshot(dbSnap, infra.chaves.banco),
      arquivos
    }
    const caminhoManifesto = join(trabalho, 'manifest.json')
    await fs.writeFile(caminhoManifesto, JSON.stringify(manifesto, null, 2))

    // 3. Compacta e cifra (grava em .parcial e renomeia ao final).
    const zip = join(trabalho, 'pacote.zip')
    await compactar(zip, [{ origem: caminhoManifesto, nome: 'manifest.json' }, ...itens])
    const parcial = `${arquivo}.parcial`
    await cifrarArquivo(chave, zip, parcial, cabecalho({ kdf, criadoEm: manifesto.criadoEm, versaoApp: infra.versaoApp, versaoSchema: VERSAO_SCHEMA }))
    await fs.rename(parcial, arquivo)

    // 4. Validação: reabre o pacote gerado e confere tudo.
    const { inicio: ini } = await lerCabecalho(arquivo)
    await abrirPacote(arquivo, chave, ini, join(trabalho, 'validacao'))

    const tamanho = (await fs.stat(arquivo)).size
    const hash = await sha256Arquivo(arquivo)
    const registro = infra.bruto.transaction(() => {
      const r = infra.db
        .insert(backupRegistro)
        .values({ ts: inicio.toISOString(), tipo: opcoes.tipo, arquivo, tamanho, sha256: hash, versaoApp: infra.versaoApp, versaoSchema: VERSAO_SCHEMA, validado: true, resultado: 'SUCESSO', usuarioId: ator.id })
        .returning()
        .get()
      auditar(infra, ator, { acao: 'BACKUP_CRIADO', entidade: 'backup', entidadeId: r.id, descricao: `${opcoes.tipo} — ${arquivo}` })
      return r
    })()
    if (opcoes.tipo === 'AUTOMATICO') await aplicarRetencao(infra, destinoDir)
    return registro
  } catch (e) {
    await fs.rm(`${arquivo}.parcial`, { force: true })
    const mensagem = e instanceof Error ? e.message : String(e)
    log.erro('Falha no backup', e)
    infra.bruto.transaction(() => {
      infra.db
        .insert(backupRegistro)
        .values({ ts: inicio.toISOString(), tipo: opcoes.tipo, arquivo, versaoApp: infra.versaoApp, versaoSchema: VERSAO_SCHEMA, validado: false, resultado: 'FALHA', mensagem, usuarioId: ator.id })
        .run()
      auditar(infra, ator, { acao: 'BACKUP_FALHOU', entidade: 'backup', descricao: mensagem })
    })()
    throw e
  } finally {
    emExecucao = false
    await fs.rm(trabalho, { recursive: true, force: true })
  }
}

/** Mantém apenas os N backups automáticos mais recentes no destino. Manuais nunca são apagados. */
async function aplicarRetencao(infra: Infra, dir: string): Promise<void> {
  const reter = lerConfig(infra, 'backup')!.reterQuantidade
  const autos = (await fs.readdir(dir)).filter((n) => n.startsWith('status-erp-auto-') && n.endsWith(EXTENSAO)).sort().reverse()
  for (const antigo of autos.slice(reter)) {
    await fs.rm(join(dir, antigo), { force: true })
    log.info('Backup automático removido pela política de retenção', { arquivo: antigo })
  }
}

export function listarBackups(infra: Infra, ator: Ator): BackupRegistroDto[] {
  exigir(ator, 'backup.executar')
  return infra.db.select().from(backupRegistro).orderBy(desc(backupRegistro.id)).limit(200).all()
}

export function ultimoBackupComSucesso(infra: Infra) {
  return infra.db.select().from(backupRegistro).where(eq(backupRegistro.resultado, 'SUCESSO')).orderBy(desc(backupRegistro.id)).limit(1).get() ?? null
}

export function backupDevido(infra: Infra): boolean {
  const cfg = lerConfig(infra, 'backup')!
  if (!cfg.automatico || !infra.cofre.possuiSenhaBackup()) return false
  const ultimo = ultimoBackupComSucesso(infra)
  return !ultimo || infra.agora().getTime() - new Date(ultimo.ts).getTime() >= cfg.intervaloHoras * 3_600_000
}

function resumir(m: Manifesto): ResumoBackup {
  return {
    criadoEm: m.criadoEm,
    versaoApp: m.versaoApp,
    versaoSchema: m.versaoSchema,
    empresa: m.empresa,
    contagens: m.contagens,
    arquivos: m.arquivos.length,
    tamanhoTotal: m.arquivos.reduce((s, a) => s + a.tamanho, 0)
  }
}

/** Abre e valida um backup com a senha informada (não altera nada). */
export async function inspecionarBackup(caminhos: Caminhos, arquivo: string, senha: string): Promise<{ resumo: ResumoBackup; chave: Buffer; kdf: ParametrosKdf }> {
  const { cab, inicio } = await lerCabecalho(arquivo)
  if (!MIGRACOES.some((m) => m.tag === cab.versaoSchema))
    throw erro.regra(`Este backup foi gerado por uma versão mais nova do sistema (${cab.versaoApp}). Atualize o STATUS ERP antes de restaurar.`)
  const chave = await derivarChaveDeSenha(senha, cab.kdf)
  const dir = await tempDir(caminhos, 'inspecao')
  try {
    const m = await abrirPacote(arquivo, chave, inicio, dir)
    return { resumo: resumir(m), chave, kdf: cab.kdf }
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

interface MarcadorRestauracao {
  arquivo: string
  resumo: ResumoBackup
  chaveMestraProtegida: string
  backupKdf: ParametrosKdf
  backupChaveProtegida: string
  solicitadoPor: string
  solicitadoEm: string
}

/**
 * Prepara a restauração: valida o pacote, gera um backup de segurança do estado atual e deixa
 * os arquivos prontos em `restauracaoPendente`. A troca efetiva ocorre na próxima inicialização,
 * antes de abrir o banco (sem arquivos em uso).
 */
export async function prepararRestauracao(
  ctx: { caminhos: Caminhos; cofre: Cofre; infra: Infra | null },
  ator: Ator,
  arquivo: string,
  senha: string
): Promise<ResumoBackup> {
  if (ctx.infra && ator.id !== null) exigir(ator, 'backup.restaurar')
  const { resumo, chave, kdf } = await inspecionarBackup(ctx.caminhos, arquivo, senha)

  if (ctx.infra && ctx.infra.cofre.possuiSenhaBackup()) await criarBackup(ctx.infra, ator.id === null ? SISTEMA : ator, { tipo: 'PRE_RESTAURACAO' })

  const pendente = ctx.caminhos.restauracaoPendente
  await fs.rm(pendente, { recursive: true, force: true })
  await fs.mkdir(pendente, { recursive: true })
  const { inicio } = await lerCabecalho(arquivo)
  const manifesto = await abrirPacote(arquivo, chave, inicio, join(pendente, 'conteudo'))
  const marcador: MarcadorRestauracao = {
    arquivo,
    resumo,
    chaveMestraProtegida: ctx.cofre.proteger(Buffer.from(manifesto.chaveMestra, 'base64')),
    backupKdf: kdf,
    backupChaveProtegida: ctx.cofre.proteger(chave),
    solicitadoPor: ator.login,
    solicitadoEm: new Date().toISOString()
  }
  await fs.writeFile(join(pendente, 'conteudo', 'manifest.json'), '{}')
  await fs.writeFile(join(pendente, 'pronto.json'), JSON.stringify(marcador))
  if (ctx.infra) ctx.infra.bruto.transaction(() => auditar(ctx.infra!, ator, { acao: 'RESTAURACAO_AGENDADA', entidade: 'backup', descricao: `${arquivo} (backup de ${resumo.criadoEm})` }))()
  return resumo
}

/** Executado na inicialização, antes de abrir o banco. Retorna o marcador aplicado, se houver. */
export async function aplicarRestauracaoPendente(caminhos: Caminhos, cofre: Cofre): Promise<MarcadorRestauracao | null> {
  const marcadorPath = join(caminhos.restauracaoPendente, 'pronto.json')
  if (!existsSync(marcadorPath)) return null
  const marcador = JSON.parse(await fs.readFile(marcadorPath, 'utf8')) as MarcadorRestauracao
  const conteudo = join(caminhos.restauracaoPendente, 'conteudo')
  const substituido = join(caminhos.dados, `substituido-${carimbo(new Date())}`)
  await fs.mkdir(substituido, { recursive: true })
  for (const sufixo of ['', '-wal', '-shm']) {
    if (existsSync(caminhos.banco + sufixo)) await fs.rename(caminhos.banco + sufixo, join(substituido, basename(caminhos.banco) + sufixo))
  }
  if (existsSync(caminhos.anexos)) await fs.rename(caminhos.anexos, join(substituido, 'anexos'))
  if (existsSync(caminhos.cofre)) await fs.copyFile(caminhos.cofre, join(substituido, basename(caminhos.cofre)))

  await fs.rename(join(conteudo, 'status.db'), caminhos.banco)
  if (existsSync(join(conteudo, 'anexos'))) await fs.rename(join(conteudo, 'anexos'), caminhos.anexos)
  else await fs.mkdir(caminhos.anexos, { recursive: true })

  cofre.inicializar(cofre.desproteger(marcador.chaveMestraProtegida))
  cofre.definirChaveBackupDerivada(marcador.backupKdf, cofre.desproteger(marcador.backupChaveProtegida))
  await fs.rm(caminhos.restauracaoPendente, { recursive: true, force: true })
  await limparSubstituidos(caminhos)
  log.info('Restauração aplicada', { backup: marcador.resumo.criadoEm, copiaAnterior: substituido })
  return marcador
}

/** Mantém as 3 cópias mais recentes do estado substituído por restaurações. */
async function limparSubstituidos(caminhos: Caminhos): Promise<void> {
  const dirs = (await fs.readdir(caminhos.dados)).filter((n) => n.startsWith('substituido-')).sort().reverse()
  for (const d of dirs.slice(3)) await fs.rm(join(caminhos.dados, d), { recursive: true, force: true })
}

export function registrarRestauracaoConcluida(infra: Infra, m: MarcadorRestauracao): void {
  infra.bruto.transaction(() => {
    infra.db
      .insert(backupRegistro)
      .values({ ts: agoraIso(infra), tipo: 'MANUAL', arquivo: m.arquivo, versaoApp: infra.versaoApp, versaoSchema: VERSAO_SCHEMA, validado: true, resultado: 'RESTAURADO', mensagem: `Backup de ${m.resumo.criadoEm} restaurado por ${m.solicitadoPor}` })
      .run()
    auditar(infra, SISTEMA, { acao: 'BACKUP_RESTAURADO', entidade: 'backup', descricao: `Backup de ${m.resumo.criadoEm} (${m.arquivo}) restaurado; solicitado por ${m.solicitadoPor}` })
  })()
}

export async function alterarSenhaBackup(infra: Infra, ator: Ator, senhaAtual: string, novaSenha: string): Promise<void> {
  exigir(ator, 'configuracoes.gerenciar')
  if (!(await infra.cofre.conferirSenhaBackup(senhaAtual))) throw erro.validacao('Senha de backup atual incorreta.', { senhaAtual: 'Senha incorreta' })
  await infra.cofre.definirSenhaBackup(senhaSchema.parse(novaSenha))
  infra.bruto.transaction(() => auditar(infra, ator, { acao: 'SENHA_BACKUP_ALTERADA', entidade: 'backup', descricao: 'Backups anteriores continuam usando a senha antiga' }))()
}
