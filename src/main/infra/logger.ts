// Log técnico local com rotação simples e redação automática de dados sensíveis.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CHAVES_SENSIVEIS = /senha|password|hash|token|chave|agencia|conta|digito|pix|documento|cpf|cnpj|rg/i
const LIMITE = 5 * 1024 * 1024

export function redigir(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return '[...]'
  if (Array.isArray(valor)) return valor.map((v) => redigir(v, profundidade + 1))
  if (valor instanceof Error) return { nome: valor.name, mensagem: valor.message, pilha: valor.stack }
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, CHAVES_SENSIVEIS.test(k) ? '[REDIGIDO]' : redigir(v, profundidade + 1)])
    )
  }
  return valor
}

let diretorio: string | null = null

export function configurarLog(dir: string): void {
  mkdirSync(dir, { recursive: true })
  diretorio = dir
}

function escrever(nivel: string, mensagem: string, dados?: unknown): void {
  const linha = JSON.stringify({ ts: new Date().toISOString(), nivel, mensagem, dados: dados === undefined ? undefined : redigir(dados) })
  if (!diretorio) {
    if (nivel === 'ERRO') console.error(linha)
    return
  }
  const arquivo = join(diretorio, 'status-erp.log')
  try {
    if (existsSync(arquivo) && statSync(arquivo).size > LIMITE) renameSync(arquivo, join(diretorio, 'status-erp.1.log'))
    appendFileSync(arquivo, linha + '\n')
  } catch {
    // Falha de log nunca deve interromper a operação.
  }
}

export const log = {
  info: (m: string, d?: unknown) => escrever('INFO', m, d),
  aviso: (m: string, d?: unknown) => escrever('AVISO', m, d),
  erro: (m: string, d?: unknown) => escrever('ERRO', m, d)
}
