// Implementação dos métodos do contrato RPC (delegam aos casos de uso).
import { BrowserWindow, dialog, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { erro } from '@shared/erros'
import { backupConfigSchema, empresaSchema, segurancaConfigSchema } from '@shared/schemas'
import { VERSAO_SCHEMA } from '../infra/db/conexao'
import { exigir, SISTEMA, type Caminhos } from '../nucleo/contexto'
import { adicionarAnexo, exportarAnexo, listarAnexos, nomeAnexo, removerAnexo, TIPOS_PERMITIDOS } from '../modules/anexos/anexos'
import { alterarSenhaBackup, criarBackup, EXTENSAO, inspecionarBackup, listarBackups, prepararRestauracao } from '../modules/backup/backup'
import { gravarConfig, lerConfig } from '../modules/configuracoes/configuracoes'
import { indicadoresPainel } from '../modules/painel'
import { adicionarDadoBancario, atualizarDadoBancario, removerDadoBancario, revelarDadoBancario } from '../modules/pessoas/bancarios'
import { atualizarPessoa, criarPessoa, documentoEmUso, excluirPessoa, historicoPessoa, listarPessoas, obterPessoa } from '../modules/pessoas/pessoas'
import { listarAuditoria, verificarIntegridadeAuditoria } from '../modules/seguranca/auditoria'
import { configurarInicial, estaConfigurado } from '../modules/seguranca/autenticacao'
import { atualizarPerfil, criarPerfil, excluirPerfil, listarPerfis } from '../modules/seguranca/perfis'
import { atualizarUsuario, carregarUsuarioSessao, criarUsuario, desbloquearUsuario, listarUsuarios, redefinirSenha } from '../modules/seguranca/usuarios'
import type { Cofre } from '../infra/keystore'
import type { Metodos } from './roteador'

export interface DependenciasMetodos {
  versaoApp: string
  caminhos: Caminhos
  cofre: () => Cofre
  erroInicializacao: () => string | undefined
  reiniciar: () => void
}

const janela = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]!

async function escolherArquivoBackup(): Promise<string | null> {
  const r = await dialog.showOpenDialog(janela(), { title: 'Selecionar backup', filters: [{ name: 'Backup STATUS ERP', extensions: [EXTENSAO.slice(1)] }], properties: ['openFile'] })
  return r.canceled ? null : (r.filePaths[0] ?? null)
}

export function criarMetodos(dep: DependenciasMetodos): Metodos {
  return {
    'sistema.estado': {
      publico: true,
      executar: ({ infra }) => ({
        configurado: infra ? estaConfigurado(infra) : false,
        versaoApp: dep.versaoApp,
        versaoSchema: VERSAO_SCHEMA,
        empresa: infra ? lerConfig(infra, 'empresa') : null,
        erroInicializacao: dep.erroInicializacao()
      })
    },
    'sistema.configurarInicial': { publico: true, executar: ({ infra }, e) => configurarInicial(infra, e) },
    'sistema.escolherBackup': { publico: true, executar: () => escolherArquivoBackup() },
    'sistema.inspecionarBackup': {
      publico: true,
      executar: async ({ infra }, e) => {
        if (infra && estaConfigurado(infra)) throw erro.semPermissao()
        return (await inspecionarBackup(dep.caminhos, e.arquivo, e.senha)).resumo
      }
    },
    'sistema.restaurarInicial': {
      publico: true,
      executar: async ({ infra }, e) => {
        if (infra && estaConfigurado(infra)) throw erro.regra('O sistema já está configurado. Use a tela de Backup para restaurar.')
        await prepararRestauracao({ caminhos: dep.caminhos, cofre: dep.cofre(), infra: null }, SISTEMA, e.arquivo, e.senha)
        setTimeout(dep.reiniciar, 300)
      }
    },

    'auth.entrar': { publico: true, executar: ({ auth }, e) => auth.entrar(e) },
    'auth.sair': { publico: true, executar: ({ auth }) => auth.sair() },
    'auth.sessao': { publico: true, executar: ({ auth }) => auth?.dto() ?? null },
    'auth.atividade': { publico: true, executar: ({ auth }) => auth.sessao.registrarAtividade() },
    'auth.bloquear': { publico: true, executar: ({ auth }) => auth.sessao.bloquear() },
    'auth.desbloquear': { publico: true, executar: ({ auth }, e) => auth.desbloquear(e.senha) },
    'auth.trocarSenha': { permitirTrocaPendente: true, executar: ({ auth }, e) => auth.trocarSenha(e) },

    'usuarios.listar': { executar: ({ infra, ator }) => listarUsuarios(infra, ator) },
    'usuarios.criar': { executar: ({ infra, ator }, e) => criarUsuario(infra, ator, e) },
    'usuarios.atualizar': {
      executar: ({ infra, ator, auth }, e) => {
        const r = atualizarUsuario(infra, ator, e.id, e.dados)
        if (e.id === ator.id) auth.sessao.atualizarPermissoes(carregarUsuarioSessao(infra, ator.id))
        return r
      }
    },
    'usuarios.redefinirSenha': { executar: ({ infra, ator }, e) => redefinirSenha(infra, ator, e.id, e.senhaTemporaria) },
    'usuarios.desbloquear': { executar: ({ infra, ator }, e) => desbloquearUsuario(infra, ator, e.id) },

    'perfis.listar': { executar: ({ infra, ator }) => listarPerfis(infra, ator) },
    'perfis.criar': { executar: ({ infra, ator }, e) => criarPerfil(infra, ator, e) },
    'perfis.atualizar': {
      executar: ({ infra, ator, auth }, e) => {
        const r = atualizarPerfil(infra, ator, e.id, e.dados)
        auth.sessao.atualizarPermissoes(carregarUsuarioSessao(infra, ator.id))
        return r
      }
    },
    'perfis.excluir': { executar: ({ infra, ator }, e) => excluirPerfil(infra, ator, e.id) },

    'pessoas.listar': { executar: ({ infra, ator }, e) => listarPessoas(infra, ator, e) },
    'pessoas.obter': { executar: ({ infra, ator }, e) => obterPessoa(infra, ator, e.id) },
    'pessoas.criar': { executar: ({ infra, ator }, e) => criarPessoa(infra, ator, e) },
    'pessoas.atualizar': { executar: ({ infra, ator }, e) => atualizarPessoa(infra, ator, e.id, e.dados) },
    'pessoas.excluir': { executar: ({ infra, ator }, e) => excluirPessoa(infra, ator, e.id, e.motivo) },
    'pessoas.verificarDocumento': {
      executar: ({ infra, ator }, e) => {
        exigir(ator, 'pessoas.ver')
        return documentoEmUso(infra, e.documento, e.ignorarId)
      }
    },
    'pessoas.historico': { executar: ({ infra, ator }, e) => historicoPessoa(infra, ator, e.id) },

    'bancarios.adicionar': { executar: ({ infra, ator }, e) => adicionarDadoBancario(infra, ator, e.pessoaId, e.dados) },
    'bancarios.atualizar': { executar: ({ infra, ator }, e) => atualizarDadoBancario(infra, ator, e.id, e.dados) },
    'bancarios.remover': { executar: ({ infra, ator }, e) => removerDadoBancario(infra, ator, e.id) },
    'bancarios.revelar': { executar: ({ infra, ator }, e) => revelarDadoBancario(infra, ator, e.id) },

    'anexos.listar': { executar: ({ infra, ator }, e) => listarAnexos(infra, ator, e.entidade, e.entidadeId) },
    'anexos.adicionar': {
      executar: async ({ infra, ator }, e) => {
        const r = await dialog.showOpenDialog(janela(), {
          title: 'Anexar documentos',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Documentos e imagens', extensions: Object.keys(TIPOS_PERMITIDOS).map((x) => x.slice(1)) }]
        })
        for (const arquivo of r.canceled ? [] : r.filePaths) await adicionarAnexo(infra, ator, e.entidade, e.entidadeId, e.categoria, arquivo)
        return listarAnexos(infra, ator, e.entidade, e.entidadeId)
      }
    },
    'anexos.abrir': {
      executar: async ({ infra, ator }, e) => {
        const dir = join(infra.caminhos.temporarios, randomUUID())
        await fs.mkdir(dir, { recursive: true })
        const destino = join(dir, nomeAnexo(infra, e.id))
        await exportarAnexo(infra, ator, e.id, destino)
        const falha = await shell.openPath(destino)
        if (falha) throw erro.regra(`Não foi possível abrir o arquivo: ${falha}`)
      }
    },
    'anexos.salvarComo': {
      executar: async ({ infra, ator }, e) => {
        const r = await dialog.showSaveDialog(janela(), { title: 'Salvar documento', defaultPath: nomeAnexo(infra, e.id) })
        if (r.canceled || !r.filePath) return false
        await exportarAnexo(infra, ator, e.id, r.filePath)
        return true
      }
    },
    'anexos.remover': { executar: ({ infra, ator }, e) => removerAnexo(infra, ator, e.id, e.motivo) },

    'auditoria.listar': {
      executar: ({ infra, ator }, e) => {
        exigir(ator, 'auditoria.ver')
        return listarAuditoria(infra, { ...e, pagina: e.pagina ?? 1, porPagina: Math.min(e.porPagina ?? 50, 200) })
      }
    },
    'auditoria.verificar': {
      executar: ({ infra, ator }) => {
        exigir(ator, 'auditoria.ver')
        return verificarIntegridadeAuditoria(infra)
      }
    },

    'backup.listar': { executar: ({ infra, ator }) => listarBackups(infra, ator) },
    'backup.executar': { executar: ({ infra, ator }, e) => criarBackup(infra, ator, { tipo: 'MANUAL', destino: e.destino }) },
    'backup.escolherDestino': {
      executar: async ({ ator }) => {
        exigir(ator, 'backup.executar')
        const r = await dialog.showOpenDialog(janela(), { title: 'Pasta de destino do backup', properties: ['openDirectory', 'createDirectory'] })
        return r.canceled ? null : (r.filePaths[0] ?? null)
      }
    },
    'backup.escolherArquivo': {
      executar: ({ ator }) => {
        exigir(ator, 'backup.restaurar')
        return escolherArquivoBackup()
      }
    },
    'backup.inspecionar': {
      executar: async ({ infra, ator }, e) => {
        exigir(ator, 'backup.restaurar')
        return (await inspecionarBackup(infra.caminhos, e.arquivo, e.senha)).resumo
      }
    },
    'backup.restaurar': {
      executar: async ({ infra, ator, auth }, e) => {
        exigir(ator, 'backup.restaurar')
        if (e.confirmacao !== 'RESTAURAR') throw erro.validacao('Digite RESTAURAR para confirmar.')
        await prepararRestauracao({ caminhos: infra.caminhos, cofre: infra.cofre, infra }, ator, e.arquivo, e.senha)
        auth.sair()
        setTimeout(dep.reiniciar, 300)
      }
    },
    'backup.alterarSenha': { executar: ({ infra, ator }, e) => alterarSenhaBackup(infra, ator, e.senhaAtual, e.novaSenha) },

    'config.obter': {
      executar: ({ infra }) => ({
        empresa: lerConfig(infra, 'empresa'),
        seguranca: lerConfig(infra, 'seguranca')!,
        backup: lerConfig(infra, 'backup')!,
        caminhoDados: infra.caminhos.dados
      })
    },
    'config.salvarEmpresa': {
      executar: ({ infra, ator }, e) => {
        exigir(ator, 'configuracoes.gerenciar')
        gravarConfig(infra, ator, 'empresa', empresaSchema.parse(e))
      }
    },
    'config.salvarSeguranca': {
      executar: ({ infra, ator }, e) => {
        exigir(ator, 'configuracoes.gerenciar')
        gravarConfig(infra, ator, 'seguranca', segurancaConfigSchema.parse(e))
      }
    },
    'config.salvarBackup': {
      executar: ({ infra, ator }, e) => {
        exigir(ator, 'configuracoes.gerenciar')
        gravarConfig(infra, ator, 'backup', backupConfigSchema.parse(e))
      }
    },

    'painel.indicadores': { executar: ({ infra }) => indicadoresPainel(infra) }
  }
}
