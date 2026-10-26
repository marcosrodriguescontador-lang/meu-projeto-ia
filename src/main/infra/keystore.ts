// Cofre de chaves local. A chave mestra é protegida pelo sistema operacional
// (DPAPI no Windows via Electron safeStorage). A chave de backup é derivada da
// senha de backup (Argon2id) e também fica protegida, para permitir backups automáticos.
import { hashRaw } from '@node-rs/argon2'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { gerarChave, sha256 } from './crypto'

export interface ProtetorSO {
  proteger(dados: Buffer): Buffer
  desproteger(dados: Buffer): Buffer
}

export interface ParametrosKdf {
  algoritmo: 'argon2id'
  salt: string
  memoryCost: number
  timeCost: number
  parallelism: number
}

interface ArquivoCofre {
  versao: 1
  chaveMestra: string
  backup?: { kdf: ParametrosKdf; chaveProtegida: string; verificador: string }
}

export const KDF_PADRAO = { memoryCost: 65536, timeCost: 3, parallelism: 1 }

export async function derivarChaveDeSenha(senha: string, kdf: ParametrosKdf): Promise<Buffer> {
  return hashRaw(senha, {
    algorithm: 2, // Argon2id
    salt: Buffer.from(kdf.salt, 'base64'),
    memoryCost: kdf.memoryCost,
    timeCost: kdf.timeCost,
    parallelism: kdf.parallelism,
    outputLen: 32
  })
}

export function novoKdf(): ParametrosKdf {
  return { algoritmo: 'argon2id', salt: randomBytes(16).toString('base64'), ...KDF_PADRAO }
}

export class Cofre {
  private dados: ArquivoCofre | null = null

  constructor(
    private readonly caminho: string,
    private readonly protetor: ProtetorSO
  ) {}

  existe(): boolean {
    return existsSync(this.caminho)
  }

  private carregar(): ArquivoCofre {
    if (!this.dados) {
      if (!this.existe()) throw new Error('Cofre de chaves não encontrado')
      this.dados = JSON.parse(readFileSync(this.caminho, 'utf8')) as ArquivoCofre
    }
    return this.dados
  }

  private salvar(d: ArquivoCofre): void {
    const tmp = `${this.caminho}.tmp`
    writeFileSync(tmp, JSON.stringify(d, null, 2), { mode: 0o600 })
    renameSync(tmp, this.caminho)
    this.dados = d
  }

  /** Cria o cofre com uma nova chave mestra (primeira execução) ou com uma chave restaurada de backup. */
  inicializar(chaveMestra: Buffer = gerarChave()): Buffer {
    const atual = this.existe() ? this.carregar() : null
    this.salvar({
      versao: 1,
      chaveMestra: this.protetor.proteger(chaveMestra).toString('base64'),
      backup: atual?.backup
    })
    return chaveMestra
  }

  chaveMestra(): Buffer {
    return this.protetor.desproteger(Buffer.from(this.carregar().chaveMestra, 'base64'))
  }

  possuiSenhaBackup(): boolean {
    return this.existe() && !!this.carregar().backup
  }

  async definirSenhaBackup(senha: string): Promise<void> {
    const kdf = novoKdf()
    const chave = await derivarChaveDeSenha(senha, kdf)
    const d = this.carregar()
    this.salvar({
      ...d,
      backup: { kdf, chaveProtegida: this.protetor.proteger(chave).toString('base64'), verificador: sha256(chave) }
    })
  }

  async conferirSenhaBackup(senha: string): Promise<boolean> {
    const b = this.carregar().backup
    if (!b) return false
    const chave = await derivarChaveDeSenha(senha, b.kdf)
    return timingSafeEqual(Buffer.from(sha256(chave)), Buffer.from(b.verificador))
  }

  /** Grava a chave de backup já derivada (usada após restauração, para manter a senha do backup restaurado). */
  definirChaveBackupDerivada(kdf: ParametrosKdf, chave: Buffer): void {
    const d = this.carregar()
    this.salvar({ ...d, backup: { kdf, chaveProtegida: this.protetor.proteger(chave).toString('base64'), verificador: sha256(chave) } })
  }

  proteger(dados: Buffer): string {
    return this.protetor.proteger(dados).toString('base64')
  }

  desproteger(dados: string): Buffer {
    return this.protetor.desproteger(Buffer.from(dados, 'base64'))
  }

  chaveBackup(): { chave: Buffer; kdf: ParametrosKdf } {
    const b = this.carregar().backup
    if (!b) throw new Error('Senha de backup não definida')
    return { chave: this.protetor.desproteger(Buffer.from(b.chaveProtegida, 'base64')), kdf: b.kdf }
  }
}

/** Protetor para testes e desenvolvimento sem cofre do SO. NÃO usar em produção. */
export const protetorInseguroParaTestes: ProtetorSO = {
  proteger: (d) => Buffer.concat([Buffer.from('TESTE:'), d]),
  desproteger: (d) => d.subarray(6)
}
