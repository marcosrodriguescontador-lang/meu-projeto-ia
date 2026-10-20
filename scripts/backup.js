// Backup do banco: cópia datada de data/agrocontrol.db para a pasta de backup,
// mantendo os últimos 30. Uso: npm run backup   (ou backup.bat / backup.sh)
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const raiz = path.join(import.meta.dirname, '..');
if (fs.existsSync(path.join(raiz, '.env'))) process.loadEnvFile(path.join(raiz, '.env'));
const origem = process.env.DB_PATH || path.join(raiz, 'data', 'agrocontrol.db');
const pasta = process.env.BACKUP_DIR || path.join(raiz, 'backup');
const manter = Number(process.env.BACKUP_MANTER || 30);

if (!fs.existsSync(origem)) {
  console.error(`Banco não encontrado: ${origem}`);
  process.exit(1);
}
fs.mkdirSync(pasta, { recursive: true });
const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const nome = `agrocontrol-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db`;
const destino = path.join(pasta, nome);

// VACUUM INTO gera uma cópia consistente mesmo com o sistema em uso.
const db = new DatabaseSync(origem);
db.exec('PRAGMA busy_timeout = 10000');
db.prepare('VACUUM INTO ?').run(destino);
db.close();

// Confere a cópia.
const copia = new DatabaseSync(destino, { readOnly: true });
const ok = copia.prepare('PRAGMA integrity_check').get();
copia.close();
if (Object.values(ok)[0] !== 'ok') {
  console.error('A cópia não passou na verificação de integridade!');
  process.exit(1);
}

const antigos = fs.readdirSync(pasta).filter((f) => /^agrocontrol-.*\.db$/.test(f)).sort();
for (const f of antigos.slice(0, Math.max(0, antigos.length - manter))) fs.rmSync(path.join(pasta, f));
console.log(`Backup criado: ${destino} (${(fs.statSync(destino).size / 1024).toFixed(0)} KB). Mantidos os últimos ${manter}.`);
