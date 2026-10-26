// Contrato RPC entre interface e processo principal: método → [entrada, saída].
import type * as D from './dto'
import type * as S from './schemas'
import type * as F from './dto-financeiro'
import type * as L from './schemas-locacao'
import type * as R from './relatorios'
import type * as C from './dto-crm'
import type * as K from './schemas-crm'
import type { MapaCsv } from './financeiro/extratos'

type P<T> = T

export type EntidadeAnexo = 'pessoa' | 'imovel' | 'contrato'

export interface ContratoApi {
  'sistema.estado': [void, D.EstadoSistema]
  'sistema.configurarInicial': [S.ConfiguracaoInicialInput, void]
  'sistema.escolherBackup': [void, string | null]
  'sistema.inspecionarBackup': [{ arquivo: string; senha: string }, D.ResumoBackup]
  'sistema.restaurarInicial': [{ arquivo: string; senha: string }, void]

  'auth.entrar': [S.LoginInput, D.SessaoDto]
  'auth.sair': [void, void]
  'auth.sessao': [void, D.SessaoDto | null]
  'auth.atividade': [void, void]
  'auth.bloquear': [void, void]
  'auth.desbloquear': [{ senha: string }, D.SessaoDto]
  'auth.trocarSenha': [S.TrocarSenhaInput, void]

  'usuarios.listar': [void, D.UsuarioDto[]]
  'usuarios.criar': [S.CriarUsuarioInput, D.UsuarioDto]
  'usuarios.atualizar': [{ id: number; dados: S.UsuarioInput }, D.UsuarioDto]
  'usuarios.redefinirSenha': [{ id: number; senhaTemporaria: string }, void]
  'usuarios.desbloquear': [{ id: number }, void]

  'perfis.listar': [void, D.PerfilDto[]]
  'perfis.criar': [S.PerfilInput, D.PerfilDto]
  'perfis.atualizar': [{ id: number; dados: S.PerfilInput }, D.PerfilDto]
  'perfis.excluir': [{ id: number }, void]

  'pessoas.listar': [S.ListarPessoasInput, D.PaginaResultado<D.PessoaResumo>]
  'pessoas.obter': [{ id: number }, D.PessoaDetalhe]
  'pessoas.criar': [S.PessoaInput, { id: number }]
  'pessoas.atualizar': [{ id: number; dados: S.PessoaInput }, void]
  'pessoas.excluir': [{ id: number; motivo: string }, void]
  'pessoas.verificarDocumento': [{ documento: string; ignorarId?: number }, { id: number; nome: string } | null]
  'pessoas.historico': [{ id: number }, D.RegistroAuditoria[]]

  'bancarios.adicionar': [{ pessoaId: number; dados: S.DadoBancarioInput }, { id: number }]
  'bancarios.atualizar': [{ id: number; dados: S.DadoBancarioInput }, void]
  'bancarios.remover': [{ id: number }, void]
  'bancarios.revelar': [{ id: number }, D.DadoBancarioRevelado]

  'pessoas.imoveis': [{ id: number }, D.ImovelDoProprietario[]]

  'imoveis.listar': [S.ListarImoveisInput, D.PaginaResultado<D.ImovelResumo>]
  'imoveis.obter': [{ id: number }, D.ImovelDetalhe]
  'imoveis.criar': [S.ImovelInput, { id: number }]
  'imoveis.atualizar': [{ id: number; dados: S.ImovelInput }, void]
  'imoveis.excluir': [{ id: number; motivo: string }, void]
  'imoveis.alterarSituacao': [S.AlterarSituacaoInput, void]
  'imoveis.historicoSituacao': [{ id: number }, D.HistoricoSituacaoDto[]]
  'imoveis.historico': [{ id: number }, D.RegistroAuditoria[]]
  'imoveis.caracteristicas': [void, D.CaracteristicaDto[]]
  'imoveis.localidades': [void, { cidade: string; uf: string; bairros: string[] }[]]
  'imoveis.ficha': [{ id: number; interna: boolean }, boolean]
  'imoveis.fotos.listar': [{ imovelId: number }, D.FotoDto[]]
  'imoveis.fotos.adicionar': [{ imovelId: number }, D.FotoDto[]]
  'imoveis.fotos.ver': [{ id: number }, string]
  'imoveis.fotos.legenda': [{ id: number; legenda: string }, void]
  'imoveis.fotos.capa': [{ id: number }, void]
  'imoveis.fotos.reordenar': [{ imovelId: number; ids: number[] }, void]
  'imoveis.fotos.remover': [{ id: number; motivo: string }, void]

  'anexos.listar': [{ entidade: EntidadeAnexo; entidadeId: number }, D.AnexoDto[]]
  'anexos.adicionar': [{ entidade: EntidadeAnexo; entidadeId: number; categoria: string }, D.AnexoDto[]]
  'anexos.abrir': [{ id: number }, void]
  'anexos.salvarComo': [{ id: number }, boolean]
  'anexos.remover': [{ id: number; motivo: string }, void]

  'financeiro.contas.listar': [{ incluirInativas?: boolean }, F.ContaFinanceiraDto[]]
  'financeiro.contas.salvar': [{ id: number | null; dados: L.ContaFinanceiraInput }, { id: number }]
  'financeiro.verificarRazao': [void, { lancamentos: number; desbalanceados: number[]; somaGeral: number }]
  'indices.listar': [void, F.IndiceDto[]]
  'indices.salvarValor': [L.IndiceValorInput, void]
  'feriados.listar': [void, F.FeriadoDto[]]
  'feriados.salvar': [{ data: string; descricao: string; abrangencia: string }, void]
  'feriados.remover': [{ id: number }, void]

  'contratos.listar': [{ situacao?: string; busca?: string; vencendoDias?: number; imovelId?: number; pessoaId?: number }, F.ContratoResumo[]]
  'contratos.obter': [{ id: number }, F.ContratoDetalhe]
  'contratos.salvar': [{ id: number | null; dados: L.ContratoInput }, { id: number }]
  'contratos.ativar': [{ id: number }, void]
  'contratos.excluirRascunho': [{ id: number }, void]
  'contratos.historico': [{ id: number }, D.RegistroAuditoria[]]
  'contratos.lancamentos': [{ id: number }, F.LancamentoAvulsoDto[]]
  'contratos.criarLancamento': [L.LancamentoAvulsoInput, { id: number }]
  'contratos.cancelarLancamento': [{ id: number; motivo: string }, void]
  'contratos.aditivos': [{ id: number }, { id: number; tipo: string; data: string; descricao: string; dataFimNova: string | null; valorNovoCentavos: number | null }[]]
  'contratos.registrarAditivo': [L.AditivoInput, void]
  'contratos.reajustes': [{ id: number }, { id: number; dataBase: string; aplicadoPpm: number; valorAnteriorCentavos: number; valorNovoCentavos: number; situacao: string; motivo: string | null; criadoEm: string }[]]
  'contratos.simularRescisao': [{ id: number; data: string }, F.MemoriaRescisao]
  'contratos.rescindir': [L.RescisaoInput, { tituloRescisaoId: number | null; repasseCaucaoId: number | null }]
  'reajustes.pendentes': [{ ate?: string }, F.ReajustePendente[]]
  'reajustes.aplicar': [{ contratoId: number }, F.ReajustePendente]
  'reajustes.dispensar': [{ contratoId: number; motivo: string }, void]
  'cobrancas.previa': [{ competencia: string }, F.PreviaCobranca[]]
  'cobrancas.gerar': [{ competencia: string; contratoIds?: number[] }, { geradas: number; jaGeradas: number; bloqueadas: { contrato: number; motivo: string }[]; valorCentavos: number }]

  'titulos.listar': [
    { sentido?: 'RECEBER' | 'PAGAR'; situacao?: string; pessoaId?: number; contratoId?: number; origem?: string; vencimentoDe?: string; vencimentoAte?: string; competencia?: string; busca?: string; pagina?: number },
    { itens: F.TituloResumo[]; total: number; somaSaldo: number }
  ]
  'titulos.obter': [{ id: number }, F.TituloDetalhe]
  'titulos.previaRecebimento': [{ id: number; data: string }, F.PreviaRecebimento]
  'titulos.receber': [L.BaixaReceberInput, { baixaId: number; total: number; multa: number; juros: number; principal: number; desconto: number }]
  'titulos.pagar': [L.BaixaPagarInput, { baixaId: number }]
  'titulos.estornar': [{ baixaId: number; motivo: string }, void]
  'titulos.cancelar': [{ id: number; motivo: string }, void]
  'titulos.inadimplencia': [void, F.InadimplenciaLinha[]]
  'titulos.renegociar': [L.RenegociacaoInput, { renegociacaoId: number; titulos: number[] }]
  'titulos.recibo': [{ baixaId: number }, boolean]

  'repasses.saldos': [{ tipo?: 'PROPRIETARIO' | 'TERCEIRO' | 'CAUCAO' }, F.SaldoRepasse[]]
  'repasses.extrato': [{ tipo: 'PROPRIETARIO' | 'TERCEIRO' | 'CAUCAO'; pessoaId: number }, F.ExtratoLinha[]]
  'repasses.listar': [{ situacao?: string; pessoaId?: number }, F.RepasseDto[]]
  'repasses.gerar': [{ tipo: 'PROPRIETARIO' | 'TERCEIRO' | 'CAUCAO'; pessoaId: number; vencimento: string }, F.RepasseDto]
  'repasses.gerarLote': [{ vencimento: string }, { gerados: F.RepasseDto[]; ignorados: { pessoa: string; motivo: string }[] }]
  'repasses.cancelar': [{ id: number; motivo: string }, void]
  'repasses.demonstrativo': [{ id: number }, { repasse: F.RepasseDto; linhas: F.ExtratoLinha[] }]
  'repasses.demonstrativoPdf': [{ id: number }, boolean]

  'categorias.listar': [{ natureza?: 'RECEITA' | 'DESPESA'; manuais?: boolean }, F.CategoriaDto[]]
  'categorias.criar': [L.CategoriaInput, F.CategoriaDto]
  'titulos.criarManual': [L.TituloManualInput, { titulos: number[] }]
  'tesouraria.transferir': [L.TransferenciaInput, { id: number }]
  'tesouraria.estornarTransferencia': [{ id: number; motivo: string }, void]
  'tesouraria.transferencias': [void, F.TransferenciaDto[]]
  'tesouraria.movimentos': [{ contaId: number; de?: string; ate?: string }, { saldoAnterior: number; movimentos: F.MovimentoDto[] }]
  'tesouraria.posicaoTerceiros': [void, F.PosicaoTerceiros]
  'extratos.escolherArquivo': [void, { token: string; nome: string; formato: 'OFX' | 'CSV'; previa: { separador: string; linhas: string[][] } | null } | null]
  'extratos.importar': [{ contaId: number; token: string; mapaCsv?: MapaCsv | null }, F.ResultadoImportacao]
  'extratos.linhas': [{ contaId: number; situacao?: string }, F.LinhaExtratoDto[]]
  'extratos.resumo': [{ contaId: number }, F.ResumoConciliacao]
  'conciliacao.pendentes': [{ contaId: number }, F.MovimentoPendente[]]
  'conciliacao.sugestoes': [{ contaId: number }, F.Sugestao[]]
  'conciliacao.conciliar': [{ contaId: number; linhaId: number; partidaId: number }, void]
  'conciliacao.automatica': [{ contaId: number }, number]
  'conciliacao.desfazer': [{ linhaId: number }, void]
  'conciliacao.ignorar': [{ linhaId: number; motivo: string }, void]
  'conciliacao.lancar': [{ linhaId: number; categoriaId: number; pessoaId: number; descricao: string }, void]
  'relatorios.gerar': [{ codigo: R.CodigoRelatorio; parametros: R.ParametrosRelatorio }, R.RelatorioDados]
  'relatorios.exportar': [{ codigo: R.CodigoRelatorio; parametros: R.ParametrosRelatorio; formato: 'PDF' | 'XLSX' }, boolean]
  'relatorios.fluxoCaixa': [{ mesesAnteriores?: number; mesesFuturos?: number; titularidade?: 'TODAS' | 'PROPRIO' | 'TERCEIROS' }, R.PontoFluxo[]]

  'crm.origens': [void, { id: number; nome: string; ativa: boolean }[]]
  'crm.criarOrigem': [{ nome: string }, { id: number }]
  'crm.corretores': [void, { id: number; nome: string }[]]
  'leads.listar': [{ busca?: string; situacao?: string; origemId?: number; corretorId?: number; interesse?: string }, C.LeadResumo[]]
  'leads.obter': [{ id: number }, C.LeadDetalhe]
  'leads.criar': [K.LeadInput, { id: number }]
  'leads.atualizar': [{ id: number; dados: K.LeadInput }, void]
  'leads.descartar': [{ id: number; motivo: string }, void]
  'leads.reativar': [{ id: number }, void]
  'leads.interesse': [{ leadId: number; imovelId: number; incluir: boolean }, void]
  'leads.sugestoes': [{ id: number }, C.ImovelInteresse[]]
  'leads.atividades': [{ id: number }, C.AtividadeDto[]]
  'leads.visitas': [{ id: number }, C.VisitaDto[]]
  'negocios.listar': [{ tipo?: 'VENDA' | 'LOCACAO'; corretorId?: number; busca?: string; incluirEncerrados?: boolean; leadId?: number; imovelId?: number }, C.NegocioCartao[]]
  'negocios.obter': [{ id: number }, C.NegocioDetalhe]
  'negocios.criar': [K.NegocioInput, { id: number }]
  'negocios.atualizar': [{ id: number; dados: Omit<K.NegocioInput, 'tipo' | 'etapa'> }, void]
  'negocios.mover': [K.MoverEtapaInput, void]
  'negocios.concluirLocacao': [{ negocioId: number; contratoId: number }, void]
  'negocios.indicadores': [{ tipo: 'VENDA' | 'LOCACAO'; de: string; ate: string; corretorId?: number }, C.IndicadoresFunil]
  'atividades.criar': [K.AtividadeInput, { id: number }]
  'atividades.concluir': [{ id: number; resultado: string }, void]
  'atividades.cancelar': [{ id: number; motivo: string }, void]
  'atividades.reagendar': [{ id: number; agendadaPara: string }, void]
  'visitas.agendar': [K.VisitaInput, { id: number }]
  'visitas.resultado': [K.ResultadoVisitaInput, void]
  'agenda.listar': [{ de: string; ate: string; responsavelId?: number; incluirConcluidas?: boolean }, C.AgendaItem[]]
  'propostas.registrar': [K.PropostaInput, { id: number }]
  'propostas.responder': [K.ResponderPropostaInput, void]
  'vendas.registrar': [K.VendaInput, { vendaId: number; comissaoId: number | null }]
  'vendas.situacao': [K.SituacaoVendaInput, { avisos: string[] }]
  'vendas.parcelaPaga': [{ parcelaId: number; data: string }, void]
  'comissoes.listar': [{ situacao?: 'ATIVA' | 'CANCELADA'; origem?: 'VENDA' | 'LOCACAO' }, C.ComissaoDto[]]
  'comissoes.obter': [{ id: number }, C.ComissaoDto]
  'comissoes.rateio': [{ id: number; rateio: K.RateioInput }, void]
  'comissoes.cancelar': [{ id: number; motivo: string }, void]
  'comissoes.locacao': [K.ComissaoLocacaoInput, { comissaoId: number }]
  'comissoes.porBeneficiario': [void, C.LinhaComissaoBeneficiario[]]
  'comissoes.rateioPadrao': [void, K.RateioPadrao]
  'comissoes.salvarRateioPadrao': [K.RateioPadrao, void]

  'auditoria.listar': [
    { entidade?: string; usuario?: string; de?: string; ate?: string; busca?: string; pagina?: number; porPagina?: number },
    D.PaginaResultado<D.RegistroAuditoria>
  ]
  'auditoria.verificar': [void, { integra: boolean; total: number; primeiroInvalido: number | null }]

  'backup.listar': [void, D.BackupRegistroDto[]]
  'backup.executar': [{ destino?: string | null }, D.BackupRegistroDto]
  'backup.escolherDestino': [void, string | null]
  'backup.escolherArquivo': [void, string | null]
  'backup.inspecionar': [{ arquivo: string; senha: string }, D.ResumoBackup]
  'backup.restaurar': [{ arquivo: string; senha: string; confirmacao: string }, void]
  'backup.alterarSenha': [{ senhaAtual: string; novaSenha: string }, void]

  'config.obter': [void, D.ConfiguracoesDto]
  'config.salvarEmpresa': [S.EmpresaInput, void]
  'config.salvarSeguranca': [S.SegurancaConfig, void]
  'config.salvarBackup': [S.BackupConfig, void]

  'painel.indicadores': [void, D.IndicadoresPainel]
}

export type MetodoApi = keyof ContratoApi
export type EntradaApi<M extends MetodoApi> = P<ContratoApi[M][0]>
export type SaidaApi<M extends MetodoApi> = P<ContratoApi[M][1]>

export type RespostaRpc<T> = { ok: true; dados: T } | { ok: false; erro: import('./erros').ErroSerializado }
