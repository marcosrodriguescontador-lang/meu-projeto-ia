import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export async function gerarHash(senha) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(senha), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function conferirSenha(senha, armazenado) {
  const partes = String(armazenado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') {
    // Executa um hash mesmo assim, para não revelar pelo tempo se o usuário existe.
    await scrypt(String(senha), 'x', KEYLEN, { N, r: R, p: P });
    return false;
  }
  const [, n, r, p, salt, hash] = partes;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scrypt(String(senha), Buffer.from(salt, 'base64'), esperado.length,
    { N: Number(n), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(esperado, calculado);
}

// Regras para senha nova definida pelo usuário.
export function problemaSenhaNova(senha, cpf) {
  const s = String(senha ?? '');
  if (s.length < 8) return 'A nova senha deve ter pelo menos 8 caracteres.';
  if (s.length > 128) return 'A nova senha deve ter no máximo 128 caracteres.';
  if (cpf && s.replace(/\D/g, '') === cpf && /^[\d.\-\s]+$/.test(s)) return 'A nova senha não pode ser o CPF.';
  return null;
}
