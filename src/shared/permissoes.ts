// Catálogo de permissões. Fonte única para o backend (verificação) e para a interface (exibição).

export const PERMISSOES = {
  'usuarios.ver': 'Visualizar usuários',
  'usuarios.gerenciar': 'Criar, editar e bloquear usuários',
  'perfis.gerenciar': 'Gerenciar perfis e permissões',
  'pessoas.ver': 'Visualizar cadastro de pessoas',
  'pessoas.criar': 'Cadastrar pessoas',
  'pessoas.editar': 'Editar pessoas',
  'pessoas.excluir': 'Excluir pessoas',
  'pessoas.dados_bancarios.ver': 'Ver dados bancários completos',
  'pessoas.dados_bancarios.editar': 'Cadastrar e alterar dados bancários',
  'pessoas.documentos.ver': 'Ver documentos anexados',
  'pessoas.documentos.gerenciar': 'Anexar e remover documentos',
  'imoveis.ver': 'Visualizar imóveis',
  'imoveis.criar': 'Cadastrar imóveis',
  'imoveis.editar': 'Editar imóveis, ofertas e fotos',
  'imoveis.excluir': 'Excluir imóveis',
  'imoveis.situacao': 'Alterar situação de venda/locação',
  'imoveis.dados_internos.ver': 'Ver proprietários, matrícula e dados internos',
  'imoveis.documentos.ver': 'Ver documentos do imóvel',
  'imoveis.documentos.gerenciar': 'Anexar e remover documentos do imóvel',
  'locacoes.ver': 'Visualizar contratos de locação',
  'locacoes.gerenciar': 'Cadastrar, ativar e alterar contratos, encargos e lançamentos',
  'locacoes.reajustar': 'Aplicar ou dispensar reajustes e aditivos',
  'locacoes.rescindir': 'Rescindir contratos',
  'financeiro.ver': 'Consultar títulos, saldos e extratos',
  'financeiro.gerar_cobrancas': 'Gerar cobranças mensais',
  'financeiro.receber': 'Registrar recebimentos',
  'financeiro.pagar': 'Registrar pagamentos (repasses e terceiros)',
  'financeiro.estornar': 'Estornar baixas e lançamentos',
  'financeiro.dispensar_encargos': 'Dispensar multa/juros e conceder descontos',
  'financeiro.renegociar': 'Renegociar débitos',
  'financeiro.repasses': 'Gerar e cancelar repasses',
  'financeiro.contas': 'Cadastrar contas bancárias e caixa',
  'indices.gerenciar': 'Cadastrar índices econômicos e feriados',
  'auditoria.ver': 'Consultar auditoria',
  'backup.executar': 'Executar backup',
  'backup.restaurar': 'Restaurar backup',
  'configuracoes.gerenciar': 'Alterar configurações do sistema'
} as const

export type Permissao = keyof typeof PERMISSOES

export const TODAS_PERMISSOES = Object.keys(PERMISSOES) as Permissao[]

export const GRUPOS_PERMISSAO: Record<string, string> = {
  usuarios: 'Usuários',
  perfis: 'Perfis',
  pessoas: 'Pessoas',
  imoveis: 'Imóveis',
  locacoes: 'Locações',
  financeiro: 'Financeiro',
  indices: 'Índices e feriados',
  auditoria: 'Auditoria',
  backup: 'Backup',
  configuracoes: 'Configurações'
}

export const PERFIS_PADRAO: { nome: string; descricao: string; permissoes: Permissao[] }[] = [
  { nome: 'Administrador', descricao: 'Acesso total ao sistema', permissoes: TODAS_PERMISSOES },
  {
    nome: 'Gerente',
    descricao: 'Gestão operacional e consulta de auditoria',
    permissoes: TODAS_PERMISSOES.filter((p) => !['perfis.gerenciar', 'backup.restaurar', 'configuracoes.gerenciar'].includes(p))
  },
  {
    nome: 'Financeiro',
    descricao: 'Operações financeiras e dados bancários',
    permissoes: ['pessoas.ver', 'pessoas.criar', 'pessoas.editar', 'pessoas.dados_bancarios.ver', 'pessoas.dados_bancarios.editar', 'pessoas.documentos.ver', 'imoveis.ver', 'imoveis.dados_internos.ver', 'imoveis.documentos.ver', 'backup.executar',
      'locacoes.ver', 'locacoes.gerenciar', 'locacoes.reajustar', 'financeiro.ver', 'financeiro.gerar_cobrancas', 'financeiro.receber', 'financeiro.pagar', 'financeiro.estornar',
      'financeiro.dispensar_encargos', 'financeiro.renegociar', 'financeiro.repasses', 'financeiro.contas', 'indices.gerenciar']
  },
  {
    nome: 'Corretor',
    descricao: 'Atendimento comercial',
    permissoes: ['pessoas.ver', 'pessoas.criar', 'pessoas.editar', 'pessoas.documentos.ver', 'pessoas.documentos.gerenciar', 'imoveis.ver', 'imoveis.criar', 'imoveis.editar', 'imoveis.situacao', 'imoveis.dados_internos.ver', 'imoveis.documentos.ver', 'imoveis.documentos.gerenciar', 'locacoes.ver']
  },
  {
    nome: 'Atendimento',
    descricao: 'Recepção e cadastro',
    permissoes: ['pessoas.ver', 'pessoas.criar', 'pessoas.editar', 'pessoas.documentos.ver', 'pessoas.documentos.gerenciar', 'imoveis.ver', 'locacoes.ver', 'financeiro.ver']
  },
  { nome: 'Consulta', descricao: 'Somente leitura', permissoes: ['pessoas.ver', 'imoveis.ver', 'locacoes.ver'] }
]
