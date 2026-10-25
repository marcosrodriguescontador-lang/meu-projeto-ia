// Métodos RPC de locações e financeiro.
import { BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { exigir } from '../nucleo/contexto'
import { estornarBaixa, pagar, receber } from '../modules/financeiro/baixas'
import { listarContasFinanceiras, listarFeriados, listarIndices, removerFeriado, salvarContaFinanceira, salvarFeriado, salvarValorIndice } from '../modules/financeiro/cadastros'
import { gerarDemonstrativoHtml, gerarReciboHtml } from '../modules/financeiro/documentos'
import { verificarRazao } from '../modules/financeiro/razao'
import { renegociar } from '../modules/financeiro/renegociacao'
import { cancelarRepasse, demonstrativoRepasse, extratoPendente, gerarRepasse, gerarRepassesEmLote, listarRepasses, saldosARepassar } from '../modules/financeiro/repasses'
import { cancelarTitulo, inadimplencia, listarTitulos, obterTitulo, previaRecebimento } from '../modules/financeiro/titulos'
import { gerarCobrancas, previaCobrancas } from '../modules/locacoes/cobrancas'
import {
  ativarContrato,
  cancelarLancamento,
  criarLancamento,
  excluirRascunho,
  historicoContrato,
  listarAditivos,
  listarContratos,
  listarLancamentos,
  obterContrato,
  registrarAditivo,
  salvarContrato
} from '../modules/locacoes/contratos'
import { aplicarReajusteContrato, dispensarReajuste, historicoReajustes, reajustesPendentes } from '../modules/locacoes/reajustes'
import { rescindir, simularRescisao } from '../modules/locacoes/rescisao'
import { lerConfig } from '../modules/configuracoes/configuracoes'
import { auditar } from '../modules/seguranca/auditoria'
import type { Infra } from '../nucleo/contexto'
import { gerarPdf, lerLogoDataUrl } from './electron-util'
import type { Metodos } from './roteador'

type MetodosFinanceiros = Pick<Metodos, Extract<keyof Metodos, `financeiro.${string}` | `indices.${string}` | `feriados.${string}` | `contratos.${string}` | `reajustes.${string}` | `cobrancas.${string}` | `titulos.${string}` | `repasses.${string}`>>

const janela = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]!

async function salvarPdf(infra: Infra, html: string, nome: string): Promise<boolean> {
  const r = await dialog.showSaveDialog(janela(), { title: 'Salvar PDF', defaultPath: nome, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (r.canceled || !r.filePath) return false
  await fs.writeFile(r.filePath, await gerarPdf(html, infra.caminhos.temporarios))
  void shell.openPath(r.filePath)
  return true
}

export function criarMetodosFinanceiros(dirMarca: string): MetodosFinanceiros {
  return {
    'financeiro.contas.listar': { executar: ({ infra, ator }, e) => listarContasFinanceiras(infra, ator, e?.incluirInativas) },
    'financeiro.contas.salvar': { executar: ({ infra, ator }, e) => salvarContaFinanceira(infra, ator, e.id, e.dados) },
    'financeiro.verificarRazao': {
      executar: ({ infra, ator }) => {
        exigir(ator, 'financeiro.ver')
        return verificarRazao(infra)
      }
    },
    'indices.listar': { executar: ({ infra }) => listarIndices(infra) },
    'indices.salvarValor': { executar: ({ infra, ator }, e) => salvarValorIndice(infra, ator, e) },
    'feriados.listar': { executar: ({ infra }) => listarFeriados(infra) },
    'feriados.salvar': { executar: ({ infra, ator }, e) => salvarFeriado(infra, ator, e) },
    'feriados.remover': { executar: ({ infra, ator }, e) => removerFeriado(infra, ator, e.id) },

    'contratos.listar': { executar: ({ infra, ator }, e) => listarContratos(infra, ator, e ?? {}) },
    'contratos.obter': { executar: ({ infra, ator }, e) => obterContrato(infra, ator, e.id) },
    'contratos.salvar': { executar: ({ infra, ator }, e) => salvarContrato(infra, ator, e.id, e.dados) },
    'contratos.ativar': { executar: ({ infra, ator }, e) => ativarContrato(infra, ator, e.id) },
    'contratos.excluirRascunho': { executar: ({ infra, ator }, e) => excluirRascunho(infra, ator, e.id) },
    'contratos.historico': { executar: ({ infra, ator }, e) => historicoContrato(infra, ator, e.id) },
    'contratos.lancamentos': { executar: ({ infra, ator }, e) => listarLancamentos(infra, ator, e.id) },
    'contratos.criarLancamento': { executar: ({ infra, ator }, e) => criarLancamento(infra, ator, e) },
    'contratos.cancelarLancamento': { executar: ({ infra, ator }, e) => cancelarLancamento(infra, ator, e.id, e.motivo) },
    'contratos.aditivos': { executar: ({ infra, ator }, e) => listarAditivos(infra, ator, e.id) },
    'contratos.registrarAditivo': { executar: ({ infra, ator }, e) => registrarAditivo(infra, ator, e) },
    'contratos.reajustes': { executar: ({ infra, ator }, e) => historicoReajustes(infra, ator, e.id) },
    'contratos.simularRescisao': { executar: ({ infra, ator }, e) => simularRescisao(infra, ator, e.id, e.data) },
    'contratos.rescindir': { executar: ({ infra, ator }, e) => rescindir(infra, ator, e) },
    'reajustes.pendentes': { executar: ({ infra, ator }, e) => reajustesPendentes(infra, ator, e?.ate) },
    'reajustes.aplicar': { executar: ({ infra, ator }, e) => aplicarReajusteContrato(infra, ator, e.contratoId) },
    'reajustes.dispensar': { executar: ({ infra, ator }, e) => dispensarReajuste(infra, ator, e.contratoId, e.motivo) },
    'cobrancas.previa': { executar: ({ infra, ator }, e) => previaCobrancas(infra, ator, e.competencia) },
    'cobrancas.gerar': { executar: ({ infra, ator }, e) => gerarCobrancas(infra, ator, e.competencia, e.contratoIds) },

    'titulos.listar': { executar: ({ infra, ator }, e) => listarTitulos(infra, ator, e ?? {}) },
    'titulos.obter': { executar: ({ infra, ator }, e) => obterTitulo(infra, ator, e.id) },
    'titulos.previaRecebimento': { executar: ({ infra, ator }, e) => previaRecebimento(infra, ator, e.id, e.data) },
    'titulos.receber': { executar: ({ infra, ator }, e) => receber(infra, ator, e) },
    'titulos.pagar': { executar: ({ infra, ator }, e) => pagar(infra, ator, e) },
    'titulos.estornar': { executar: ({ infra, ator }, e) => estornarBaixa(infra, ator, e) },
    'titulos.cancelar': { executar: ({ infra, ator }, e) => cancelarTitulo(infra, ator, e.id, e.motivo) },
    'titulos.inadimplencia': { executar: ({ infra, ator }) => inadimplencia(infra, ator) },
    'titulos.renegociar': { executar: ({ infra, ator }, e) => renegociar(infra, ator, e) },
    'titulos.recibo': {
      executar: async ({ infra, ator }, e) => {
        exigir(ator, 'financeiro.ver')
        const tituloId = (infra.bruto.prepare('SELECT titulo_id t FROM baixa WHERE id = ?').get(e.baixaId) as { t: number } | undefined)?.t
        if (!tituloId) throw new Error('Baixa não encontrada')
        const t = obterTitulo(infra, ator, tituloId)
        const extra = infra.bruto
          .prepare(
            `SELECT p.documento, (SELECT i.logradouro || ', ' || i.numero || coalesce(' — ' || i.complemento, '') || ', ' || i.bairro || ', ' || i.cidade || '/' || i.uf FROM imovel i JOIN contrato_locacao c ON c.imovel_id = i.id WHERE c.id = ?) imovel,
              (SELECT i.cidade FROM imovel i JOIN contrato_locacao c ON c.imovel_id = i.id WHERE c.id = ?) cidade FROM pessoa p WHERE p.id = ?`
          )
          .get(t.contratoId, t.contratoId, t.pessoaId) as { documento: string; imovel: string | null; cidade: string | null }
        const html = gerarReciboHtml({ empresa: lerConfig(infra, 'empresa'), logo: lerLogoDataUrl(dirMarca), emitidoEm: infra.agora(), emitidoPor: ator.nome, titulo: t, baixaId: e.baixaId, pagadorDocumento: extra.documento, imovel: extra.imovel, cidade: extra.cidade ?? '' })
        const ok = await salvarPdf(infra, html, `recibo-${String(e.baixaId).padStart(6, '0')}.pdf`)
        if (ok) infra.bruto.transaction(() => auditar(infra, ator, { acao: 'RECIBO_EMITIDO', entidade: 'titulo', entidadeId: tituloId, descricao: `Recibo da baixa #${e.baixaId}` }))()
        return ok
      }
    },

    'repasses.saldos': { executar: ({ infra, ator }, e) => saldosARepassar(infra, ator, e?.tipo) },
    'repasses.extrato': { executar: ({ infra, ator }, e) => extratoPendente(infra, ator, e.tipo, e.pessoaId) },
    'repasses.listar': { executar: ({ infra, ator }, e) => listarRepasses(infra, ator, (e ?? {}) as never) },
    'repasses.gerar': { executar: ({ infra, ator }, e) => gerarRepasse(infra, ator, e) },
    'repasses.gerarLote': { executar: ({ infra, ator }, e) => gerarRepassesEmLote(infra, ator, e.vencimento) },
    'repasses.cancelar': { executar: ({ infra, ator }, e) => cancelarRepasse(infra, ator, e.id, e.motivo) },
    'repasses.demonstrativo': { executar: ({ infra, ator }, e) => demonstrativoRepasse(infra, ator, e.id) },
    'repasses.demonstrativoPdf': {
      executar: async ({ infra, ator }, e) => {
        const dem = demonstrativoRepasse(infra, ator, e.id)
        const doc = (infra.bruto.prepare('SELECT documento FROM pessoa WHERE id = ?').get(dem.repasse.pessoaId) as { documento: string }).documento
        const html = gerarDemonstrativoHtml({ empresa: lerConfig(infra, 'empresa'), logo: lerLogoDataUrl(dirMarca), emitidoEm: infra.agora(), emitidoPor: ator.nome, repasse: dem.repasse, linhas: dem.linhas, documento: doc })
        return salvarPdf(infra, html, `demonstrativo-repasse-${e.id}.pdf`)
      }
    }
  }
}
