// Montagem da infraestrutura (independente do Electron, para permitir testes).
import { promises as fs, mkdirSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { derivarChave } from '../infra/crypto'
import { abrirBancoBruto, criarBanco, migrar } from '../infra/db/conexao'
import { Cofre, type ProtetorSO } from '../infra/keystore'
import { log } from '../infra/logger'
import { aplicarRestauracaoPendente, registrarRestauracaoConcluida } from '../modules/backup/backup'
import { sincronizarPerfisSistema } from '../modules/seguranca/perfis'
import { estaConfigurado } from '../modules/seguranca/autenticacao'
import type { Caminhos, Infra } from './contexto'

export function definirCaminhos(dados: string): Caminhos {
  return {
    dados,
    banco: join(dados, 'status.db'),
    anexos: join(dados, 'anexos'),
    backups: join(dados, 'backups'),
    logs: join(dados, 'logs'),
    cofre: join(dados, 'chaves.json'),
    temporarios: join(dados, 'tmp'),
    restauracaoPendente: join(dados, 'restauracao-pendente')
  }
}

export interface OpcoesInicializacao {
  caminhos: Caminhos
  protetor: ProtetorSO
  versaoApp: string
  agora?: () => Date
}

export async function inicializar(op: OpcoesInicializacao): Promise<Infra> {
  const { caminhos } = op
  for (const d of [caminhos.dados, caminhos.anexos, caminhos.backups, caminhos.logs]) mkdirSync(d, { recursive: true })
  await fs.rm(caminhos.temporarios, { recursive: true, force: true })
  mkdirSync(caminhos.temporarios, { recursive: true })

  const cofre = new Cofre(caminhos.cofre, op.protetor)
  const restauracao = await aplicarRestauracaoPendente(caminhos, cofre)
  const mestra = cofre.existe() ? cofre.chaveMestra() : cofre.inicializar()
  const chaves = { banco: derivarChave(mestra, 'banco'), campos: derivarChave(mestra, 'campos'), anexos: derivarChave(mestra, 'anexos') }

  const bruto = abrirBancoBruto(caminhos.banco, chaves.banco)
  const novas = migrar(bruto)
  if (novas.length) log.info('Migrações aplicadas', { novas })

  const infra: Infra = { db: criarBanco(bruto), bruto, chaves, cofre, caminhos, versaoApp: op.versaoApp, estacao: hostname(), agora: op.agora ?? (() => new Date()) }
  if (estaConfigurado(infra)) sincronizarPerfisSistema(infra)
  if (restauracao) registrarRestauracaoConcluida(infra, restauracao)
  return infra
}

export function encerrar(infra: Infra): void {
  try {
    infra.bruto.pragma('wal_checkpoint(TRUNCATE)')
    infra.bruto.close()
  } catch (e) {
    log.erro('Falha ao fechar banco', e)
  }
}
