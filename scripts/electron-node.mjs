// Executa um script Node usando o runtime do Electron (ELECTRON_RUN_AS_NODE).
// Assim os módulos nativos (SQLCipher, Argon2) têm um único ABI para testes e aplicação.
import { spawn } from 'node:child_process'
import electron from 'electron'

const child = spawn(electron, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
child.on('exit', (code) => process.exit(code ?? 1))
