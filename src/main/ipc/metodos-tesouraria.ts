// Métodos RPC de tesouraria: contas a pagar/receber gerais, transferências, extratos, conciliação e relatórios.
import { dialog, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { RELATORIOS } from '@shared/relatorios'
import { erro } from '@shared/erros'
import { exigir } from '../nucleo/contexto'
import { conciliar, conciliarAutomaticamente, desfazerConciliacao, ignorarLinha, importarExtrato, lancarDaLinha, listarLinhas, movimentosPendentes, previaCsv, resumoConciliacao, sugestoes } from '../modules/financeiro/conciliacao'
import { relatorioHtml, relatorioXlsx } from '../modules/financeiro/exportacao'
import { fluxoCaixa, gerarRelatorio } from '../modules/financeiro/relatorios'
import { categoriasManuais, criarCategoria, criarTituloManual, estornarTransferencia, listarCategorias, listarTransferencias, movimentosConta, posicaoTerceiros, transferir } from '../modules/financeiro/tesouraria'
import { lerConfig } from '../modules/configuracoes/configuracoes'
import { auditar } from '../modules/seguranca/auditoria'
import { lerLogoDataUrl } from './electron-util'
import { janela, salvarPdf } from './metodos-financeiro'
import type { Metodos } from './roteador'

type MetodosTesouraria = Pick<Metodos, Extract<keyof Metodos, `categorias.${string}` | 'titulos.criarManual' | `tesouraria.${string}` | `extratos.${string}` | `conciliacao.${string}` | `relatorios.${string}`>>

const LIMITE_EXTRATO = 20 * 1024 * 1024

/** Arquivos escolhidos pelo usuário no diálogo; a interface só conhece o token, nunca o caminho. */
const escolhidos = new Map<string, { caminho: string; bytes: Buffer }>()

export function criarMetodosTesouraria(dirMarca: string): MetodosTesouraria {
  return {
    'categorias.listar': {
      executar: ({ infra, ator }, e) => {
        exigir(ator, 'financeiro.ver')
        if (e?.manuais && e.natureza) return categoriasManuais(infra, e.natureza)
        return listarCategorias(infra).filter((c) => !e?.natureza || c.natureza === e.natureza)
      }
    },
    'categorias.criar': { executar: ({ infra, ator }, e) => criarCategoria(infra, ator, e) },
    'titulos.criarManual': { executar: ({ infra, ator }, e) => criarTituloManual(infra, ator, e) },

    'tesouraria.transferir': { executar: ({ infra, ator }, e) => transferir(infra, ator, e) },
    'tesouraria.estornarTransferencia': { executar: ({ infra, ator }, e) => estornarTransferencia(infra, ator, e.id, e.motivo) },
    'tesouraria.transferencias': { executar: ({ infra, ator }) => listarTransferencias(infra, ator) },
    'tesouraria.movimentos': { executar: ({ infra, ator }, e) => movimentosConta(infra, ator, e.contaId, e.de, e.ate) },
    'tesouraria.posicaoTerceiros': {
      executar: ({ infra, ator }) => {
        exigir(ator, 'financeiro.ver')
        return posicaoTerceiros(infra)
      }
    },

    'extratos.escolherArquivo': {
      executar: async ({ ator }) => {
        exigir(ator, 'financeiro.receber')
        const r = await dialog.showOpenDialog(janela(), { title: 'Importar extrato bancário', properties: ['openFile'], filters: [{ name: 'Extratos (OFX, CSV)', extensions: ['ofx', 'csv', 'txt'] }] })
        if (r.canceled || !r.filePaths[0]) return null
        const caminho = r.filePaths[0]
        const st = await fs.stat(caminho)
        if (st.size > LIMITE_EXTRATO) throw erro.validacao('Arquivo muito grande para um extrato (limite de 20 MB).')
        const bytes = await fs.readFile(caminho)
        const ofx = /<OFX>/i.test(bytes.subarray(0, 4096).toString('latin1')) || /\.ofx$/i.test(caminho)
        const token = randomUUID()
        escolhidos.clear()
        escolhidos.set(token, { caminho, bytes })
        return { token, nome: basename(caminho), formato: ofx ? 'OFX' : 'CSV', previa: ofx ? null : previaCsv(bytes) }
      }
    },
    'extratos.importar': {
      executar: ({ infra, ator }, e) => {
        const arq = escolhidos.get(e.token)
        if (!arq) throw erro.validacao('Selecione o arquivo novamente.')
        const r = importarExtrato(infra, ator, { contaId: e.contaId, arquivo: basename(arq.caminho), bytes: arq.bytes, mapaCsv: e.mapaCsv ?? null })
        escolhidos.delete(e.token)
        return r
      }
    },
    'extratos.linhas': { executar: ({ infra, ator }, e) => listarLinhas(infra, ator, e.contaId, e.situacao) },
    'extratos.resumo': { executar: ({ infra, ator }, e) => resumoConciliacao(infra, ator, e.contaId) },
    'conciliacao.pendentes': {
      executar: ({ infra, ator }, e) => {
        exigir(ator, 'financeiro.ver')
        return movimentosPendentes(infra, e.contaId)
      }
    },
    'conciliacao.sugestoes': {
      executar: ({ infra, ator }, e) => {
        exigir(ator, 'financeiro.ver')
        return sugestoes(infra, e.contaId)
      }
    },
    'conciliacao.conciliar': { executar: ({ infra, ator }, e) => conciliar(infra, ator, e.contaId, e.linhaId, e.partidaId) },
    'conciliacao.automatica': {
      executar: ({ infra, ator }, e) => {
        exigir(ator, 'financeiro.receber')
        return conciliarAutomaticamente(infra, ator, e.contaId)
      }
    },
    'conciliacao.desfazer': { executar: ({ infra, ator }, e) => desfazerConciliacao(infra, ator, e.linhaId) },
    'conciliacao.ignorar': { executar: ({ infra, ator }, e) => ignorarLinha(infra, ator, e.linhaId, e.motivo) },
    'conciliacao.lancar': { executar: ({ infra, ator }, e) => lancarDaLinha(infra, ator, e.linhaId, e) },

    'relatorios.gerar': { executar: ({ infra, ator }, e) => gerarRelatorio(infra, ator, e.codigo, e.parametros) },
    'relatorios.fluxoCaixa': { executar: ({ infra, ator }, e) => fluxoCaixa(infra, ator, e ?? {}) },
    'relatorios.exportar': {
      executar: async ({ infra, ator }, e) => {
        const r = gerarRelatorio(infra, ator, e.codigo, e.parametros)
        const nome = `${e.codigo}-${infra.agora().toISOString().slice(0, 10)}`
        let ok: boolean
        if (e.formato === 'PDF') {
          ok = await salvarPdf(infra, relatorioHtml(r, { empresa: lerConfig(infra, 'empresa'), logo: lerLogoDataUrl(dirMarca), emitidoEm: infra.agora(), emitidoPor: ator.nome }), `${nome}.pdf`)
        } else {
          const d = await dialog.showSaveDialog(janela(), { title: 'Salvar planilha', defaultPath: `${nome}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
          ok = !d.canceled && !!d.filePath
          if (ok) {
            await fs.writeFile(d.filePath!, await relatorioXlsx(r, lerConfig(infra, 'empresa')?.razaoSocial ?? 'Status Negócios Imobiliários'))
            void shell.openPath(d.filePath!)
          }
        }
        if (ok) infra.bruto.transaction(() => auditar(infra, ator, { acao: 'RELATORIO_EXPORTADO', entidade: 'relatorio', entidadeId: null, descricao: `${RELATORIOS[e.codigo]} (${e.formato})` }))()
        return ok
      }
    }
  }
}
