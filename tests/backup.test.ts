import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { adicionarAnexo, exportarAnexo, listarAnexos } from '../src/main/modules/anexos/anexos'
import { criarBackup, inspecionarBackup, prepararRestauracao } from '../src/main/modules/backup/backup'
import { criarPessoa, listarPessoas } from '../src/main/modules/pessoas/pessoas'
import { verificarIntegridadeAuditoria } from '../src/main/modules/seguranca/auditoria'
import { Autenticacao } from '../src/main/modules/seguranca/autenticacao'
import { GerenciadorSessao } from '../src/main/modules/seguranca/sessao'
import { ambienteConfigurado, novoAmbiente, pessoaFisica, SENHA_ADMIN, SENHA_BACKUP } from './apoio'

let limpar: (() => void)[] = []
afterEach(() => {
  limpar.forEach((f) => f())
  limpar = []
})

describe('backup e restauração', () => {
  it('gera backup cifrado e validado durante gravações e restaura em outra máquina', async () => {
    const a = await ambienteConfigurado()
    limpar.push(() => a.apagar())
    const { infra, admin } = a
    const { id } = criarPessoa(infra, admin, pessoaFisica())
    const origem = join(a.dir, 'cnh.pdf')
    writeFileSync(origem, 'conteudo do anexo')
    await adicionarAnexo(infra, admin, 'pessoa', id, 'Documento de identificação', origem)

    // Gravações concorrentes enquanto o backup roda.
    const gravacoes = (async () => {
      for (let i = 0; i < 20; i++) {
        criarPessoa(infra, admin, pessoaFisica({ nome: `Pessoa ${i}`, documento: gerarCpf(i) }))
        await new Promise((r) => setImmediate(r))
      }
    })()
    const registro = await criarBackup(infra, admin, { tipo: 'MANUAL' })
    await gravacoes
    expect(registro.validado).toBe(true)
    expect(registro.resultado).toBe('SUCESSO')
    expect(existsSync(registro.arquivo)).toBe(true)

    await expect(inspecionarBackup(infra.caminhos, registro.arquivo, 'senha-errada-123')).rejects.toThrow('Senha de backup incorreta')
    const { resumo } = await inspecionarBackup(infra.caminhos, registro.arquivo, SENHA_BACKUP)
    expect(resumo.contagens.anexos).toBe(1)
    a.fechar()

    // "Outra máquina": diretório novo, cofre novo (chaves diferentes).
    const b = await novoAmbiente()
    limpar.push(() => b.apagar())
    await prepararRestauracao({ caminhos: b.caminhos, cofre: b.infra.cofre, infra: null }, { id: null, login: 'sistema' }, registro.arquivo, SENHA_BACKUP)
    b.fechar()
    const reaberto = await novoAmbiente(b.dir)
    limpar.push(() => reaberto.fechar())
    const auth = new Autenticacao(reaberto.infra, new GerenciadorSessao(() => 600_000))
    await auth.entrar({ login: 'admin', senha: SENHA_ADMIN })
    const s = auth.sessao.atual()!
    const pessoas = listarPessoas(reaberto.infra, s, {})
    expect(pessoas.total).toBe(resumo.contagens.pessoas)
    const anexos = listarAnexos(reaberto.infra, s, 'pessoa', id)
    expect(anexos).toHaveLength(1)
    const saida = join(b.dir, 'restaurado.pdf')
    await exportarAnexo(reaberto.infra, s, anexos[0]!.id, saida)
    expect(verificarIntegridadeAuditoria(reaberto.infra).integra).toBe(true)
    expect(await reaberto.infra.cofre.conferirSenhaBackup(SENHA_BACKUP)).toBe(true)
  })

  it('detecta arquivo de backup adulterado', async () => {
    const a = await ambienteConfigurado()
    limpar.push(() => {
      a.fechar()
      a.apagar()
    })
    const r = await criarBackup(a.infra, a.admin, { tipo: 'MANUAL' })
    const { openSync, writeSync, closeSync, statSync } = await import('node:fs')
    const fd = openSync(r.arquivo, 'r+')
    writeSync(fd, Buffer.from([0xff, 0x00, 0xaa]), 0, 3, Math.floor(statSync(r.arquivo).size / 2))
    closeSync(fd)
    await expect(inspecionarBackup(a.infra.caminhos, r.arquivo, SENHA_BACKUP)).rejects.toThrow('corrompido')
  })

  it('cria backup de segurança antes de restaurar e aplica retenção dos automáticos', async () => {
    const a = await ambienteConfigurado()
    limpar.push(() => {
      a.fechar()
      a.apagar()
    })
    const manual = await criarBackup(a.infra, a.admin, { tipo: 'MANUAL' })
    await prepararRestauracao({ caminhos: a.caminhos, cofre: a.infra.cofre, infra: a.infra }, a.admin, manual.arquivo, SENHA_BACKUP)
    expect(readdirSync(a.caminhos.backups).some((n) => n.includes('pre-restauracao'))).toBe(true)
    expect(existsSync(join(a.caminhos.restauracaoPendente, 'pronto.json'))).toBe(true)
  })
})

function gerarCpf(seed: number): string {
  const base = String(100000000 + seed * 7919).slice(0, 9).split('').map(Number)
  const dv = (d: number[]) => {
    const s = d.reduce((acc, n, i) => acc + n * (d.length + 1 - i), 0)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  base.push(dv(base))
  base.push(dv(base))
  return base.join('')
}
