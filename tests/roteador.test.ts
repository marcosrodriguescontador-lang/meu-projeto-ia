import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { criarDespachante, type Metodos } from '../src/main/ipc/roteador'
import { listarPessoas } from '../src/main/modules/pessoas/pessoas'
import { Autenticacao } from '../src/main/modules/seguranca/autenticacao'
import { GerenciadorSessao } from '../src/main/modules/seguranca/sessao'
import { ambienteConfigurado, SENHA_ADMIN } from './apoio'

let limpar: (() => void)[] = []
afterEach(() => {
  limpar.forEach((f) => f())
  limpar = []
})

describe('roteador RPC', () => {
  it('exige sessão, traduz erros e não vaza detalhes internos', async () => {
    const a = await ambienteConfigurado()
    limpar.push(() => (a.fechar(), a.apagar()))
    const auth = new Autenticacao(a.infra, new GerenciadorSessao(() => 600_000))
    const metodos = {
      'pessoas.listar': { executar: ({ infra, ator }, e) => listarPessoas(infra, ator, e) },
      'auth.entrar': { publico: true, executar: ({ auth }, e) => auth.entrar(e) },
      'painel.indicadores': {
        executar: () => {
          throw new Error('SQLITE detalhe interno /caminho/secreto')
        }
      },
      'config.salvarSeguranca': { executar: () => z.object({ x: z.number() }).parse({ x: 'a' }) as never }
    } as Partial<Metodos> as Metodos
    const despachar = criarDespachante(() => ({ infra: a.infra, auth }), metodos)

    expect(await despachar('pessoas.listar', {})).toMatchObject({ ok: false, erro: { codigo: 'NAO_AUTENTICADO' } })
    expect(await despachar('metodo.inexistente', {})).toMatchObject({ ok: false, erro: { codigo: 'NAO_ENCONTRADO' } })
    expect(await despachar('auth.entrar', { login: 'admin', senha: SENHA_ADMIN })).toMatchObject({ ok: true })
    expect(await despachar('pessoas.listar', {})).toMatchObject({ ok: true, dados: { total: 0 } })

    const interno = await despachar('painel.indicadores', undefined)
    expect(interno).toMatchObject({ ok: false, erro: { codigo: 'INTERNO' } })
    expect(JSON.stringify(interno)).not.toContain('secreto')

    expect(await despachar('config.salvarSeguranca', {})).toMatchObject({ ok: false, erro: { codigo: 'VALIDACAO', campos: { x: expect.any(String) } } })

    auth.sessao.bloquear()
    expect(await despachar('pessoas.listar', {})).toMatchObject({ ok: false, erro: { codigo: 'SESSAO_BLOQUEADA' } })
  })
})
