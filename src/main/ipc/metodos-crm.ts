// Métodos RPC do CRM, vendas e comissões.
import { exigir } from '../nucleo/contexto'
import { agenda, agendarVisita, atividadesDe, cancelarAtividade, concluirAtividade, criarAtividade, reagendarAtividade, registrarResultadoVisita, visitasDe } from '../modules/crm/agenda'
import { atualizarLead, criarLead, criarOrigem, definirInteresse, descartarLead, listarLeads, listarOrigens, obterLead, reativarLead, sugerirImoveis } from '../modules/crm/leads'
import { atualizarNegocio, concluirLocacao, criarNegocio, indicadoresFunil, listarNegocios, moverEtapa, obterNegocio } from '../modules/crm/negocios'
import { alterarRateio, cancelarComissao, comissoesPorBeneficiario, lerRateioPadrao, listarComissoes, obterComissao, salvarRateioPadrao } from '../modules/financeiro/comissoes'
import { registrarProposta, responderProposta } from '../modules/vendas/propostas'
import { alterarSituacaoVenda, informarParcelaPaga, registrarComissaoLocacao, registrarVenda } from '../modules/vendas/vendas'
import type { Metodos } from './roteador'

type MetodosCrm = Pick<
  Metodos,
  Extract<keyof Metodos, `crm.${string}` | `leads.${string}` | `negocios.${string}` | `atividades.${string}` | `visitas.${string}` | `agenda.${string}` | `propostas.${string}` | `vendas.${string}` | `comissoes.${string}`>
>

export function criarMetodosCrm(): MetodosCrm {
  return {
    'crm.origens': { executar: ({ infra, ator }) => (exigir(ator, 'crm.ver'), listarOrigens(infra)) },
    'crm.criarOrigem': { executar: ({ infra, ator }, e) => criarOrigem(infra, ator, e.nome) },
    'crm.corretores': {
      executar: ({ infra, ator }) => {
        exigir(ator, 'crm.ver')
        return infra.bruto
          .prepare("SELECT p.id, p.nome FROM pessoa p JOIN pessoa_papel pp ON pp.pessoa_id = p.id AND pp.papel = 'CORRETOR' WHERE p.excluido_em IS NULL ORDER BY p.nome")
          .all() as { id: number; nome: string }[]
      }
    },
    'leads.listar': { executar: ({ infra, ator }, e) => listarLeads(infra, ator, e ?? {}) },
    'leads.obter': { executar: ({ infra, ator }, e) => obterLead(infra, ator, e.id) },
    'leads.criar': { executar: ({ infra, ator }, e) => criarLead(infra, ator, e) },
    'leads.atualizar': { executar: ({ infra, ator }, e) => atualizarLead(infra, ator, e.id, e.dados) },
    'leads.descartar': { executar: ({ infra, ator }, e) => descartarLead(infra, ator, e.id, e.motivo) },
    'leads.reativar': { executar: ({ infra, ator }, e) => reativarLead(infra, ator, e.id) },
    'leads.interesse': { executar: ({ infra, ator }, e) => definirInteresse(infra, ator, e.leadId, e.imovelId, e.incluir) },
    'leads.sugestoes': { executar: ({ infra, ator }, e) => sugerirImoveis(infra, ator, e.id) },
    'leads.atividades': { executar: ({ infra, ator }, e) => (obterLead(infra, ator, e.id), atividadesDe(infra, { leadId: e.id })) },
    'leads.visitas': { executar: ({ infra, ator }, e) => (obterLead(infra, ator, e.id), visitasDe(infra, { leadId: e.id })) },
    'negocios.listar': { executar: ({ infra, ator }, e) => listarNegocios(infra, ator, e ?? {}) },
    'negocios.obter': { executar: ({ infra, ator }, e) => obterNegocio(infra, ator, e.id) },
    'negocios.criar': { executar: ({ infra, ator }, e) => criarNegocio(infra, ator, e) },
    'negocios.atualizar': { executar: ({ infra, ator }, e) => atualizarNegocio(infra, ator, e.id, e.dados) },
    'negocios.mover': { executar: ({ infra, ator }, e) => moverEtapa(infra, ator, e) },
    'negocios.concluirLocacao': { executar: ({ infra, ator }, e) => concluirLocacao(infra, ator, e.negocioId, e.contratoId) },
    'negocios.indicadores': { executar: ({ infra, ator }, e) => indicadoresFunil(infra, ator, e) },
    'atividades.criar': { executar: ({ infra, ator }, e) => criarAtividade(infra, ator, e) },
    'atividades.concluir': { executar: ({ infra, ator }, e) => concluirAtividade(infra, ator, e.id, e.resultado) },
    'atividades.cancelar': { executar: ({ infra, ator }, e) => cancelarAtividade(infra, ator, e.id, e.motivo) },
    'atividades.reagendar': { executar: ({ infra, ator }, e) => reagendarAtividade(infra, ator, e.id, e.agendadaPara) },
    'visitas.agendar': { executar: ({ infra, ator }, e) => agendarVisita(infra, ator, e) },
    'visitas.resultado': { executar: ({ infra, ator }, e) => registrarResultadoVisita(infra, ator, e) },
    'agenda.listar': { executar: ({ infra, ator }, e) => agenda(infra, ator, e) },
    'propostas.registrar': { executar: ({ infra, ator }, e) => registrarProposta(infra, ator, e) },
    'propostas.responder': { executar: ({ infra, ator }, e) => responderProposta(infra, ator, e) },
    'vendas.registrar': { executar: ({ infra, ator }, e) => registrarVenda(infra, ator, e) },
    'vendas.situacao': { executar: ({ infra, ator }, e) => alterarSituacaoVenda(infra, ator, e) },
    'vendas.parcelaPaga': { executar: ({ infra, ator }, e) => informarParcelaPaga(infra, ator, e.parcelaId, e.data) },
    'comissoes.listar': { executar: ({ infra, ator }, e) => listarComissoes(infra, ator, e ?? {}) },
    'comissoes.obter': { executar: ({ infra, ator }, e) => obterComissao(infra, ator, e.id) },
    'comissoes.rateio': { executar: ({ infra, ator }, e) => alterarRateio(infra, ator, e.id, e.rateio) },
    'comissoes.cancelar': { executar: ({ infra, ator }, e) => cancelarComissao(infra, ator, e.id, e.motivo) },
    'comissoes.locacao': { executar: ({ infra, ator }, e) => registrarComissaoLocacao(infra, ator, e) },
    'comissoes.porBeneficiario': { executar: ({ infra, ator }) => comissoesPorBeneficiario(infra, ator) },
    'comissoes.rateioPadrao': { executar: ({ infra, ator }) => (exigir(ator, 'comissoes.ver'), lerRateioPadrao(infra)) },
    'comissoes.salvarRateioPadrao': { executar: ({ infra, ator }, e) => salvarRateioPadrao(infra, ator, e) }
  }
}
