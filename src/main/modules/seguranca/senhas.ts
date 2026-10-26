import { hash, verify } from '@node-rs/argon2'

// Argon2id com parâmetros acima do mínimo OWASP (m=19 MiB, t=2).
const OPCOES = { algorithm: 2, memoryCost: 47104, timeCost: 2, parallelism: 1 } as const

export function gerarHashSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES)
}

export async function conferirSenha(hashArmazenado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha)
  } catch {
    return false
  }
}

// Hash fixo usado quando o login não existe, para igualar o tempo de resposta.
let hashFicticio: Promise<string> | null = null
export function hashParaComparacaoCega(): Promise<string> {
  hashFicticio ??= gerarHashSenha('comparacao-cega-sem-usuario-0')
  return hashFicticio
}
