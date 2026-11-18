/*
 * Dados extraídos das Demonstrações Financeiras de 31/12/2025 e 31/12/2024
 * da Algodoeira Palmeirense Sociedade Anônima – APSA (valores em R$).
 * Formato das linhas: [descrição, nota, 2025, 2024, tipo]
 * tipo: "grupo" (subtotal de grupo), "total", "sub" (linha recuada) ou "" (normal)
 */
window.APSA = {
  empresa: {
    razao: "Algodoeira Palmeirense Sociedade Anônima – APSA",
    cnpj: "12.505.731/0001-78",
    nire: "35300453671",
    tipo: "Companhia fechada",
    sede: "Rancharia – SP",
    acoes: 1445000
  },

  // Contato de RI — preencha com os dados oficiais da Companhia
  contato: {
    email: "",
    telefone: "",
    endereco: "Rancharia – SP"
  },

  bp: {
    titulo: "Balanço Patrimonial em 31 de dezembro",
    colunas: ["31/12/2025", "31/12/2024"],
    ativo: [
      ["Circulante", "", 2448427.05, 6176574.26, "grupo"],
      ["Caixa e equivalentes de caixa", "5", 1734.61, 25918.54, "sub"],
      ["Clientes", "6", 2446692.44, 0, "sub"],
      ["Outros créditos", "7", 0, 6150655.72, "sub"],
      ["Não circulante", "", 15860505.37, 36751408.31, "grupo"],
      ["Realizável a longo prazo", "8", 2686433.50, 2274666.87, "sub"],
      ["Investimentos", "9", 346581.37, 346581.37, "sub"],
      ["Imobilizado", "10", 12827490.50, 34130160.07, "sub"],
      ["Total do ativo", "", 18308932.42, 42927982.57, "total"]
    ],
    passivo: [
      ["Circulante", "", 57182787.46, 27220951.05, "grupo"],
      ["Empréstimos bancários", "11", 6457257.15, 6457257.15, "sub"],
      ["Fornecedores", "12", 2422716.61, 2412627.75, "sub"],
      ["Obrigações tributárias", "13", 25203787.70, 16453951.24, "sub"],
      ["Obrigações trabalhistas e previdenciárias", "13", 21067977.35, 1371663.74, "sub"],
      ["Outras contas a pagar", "13", 96312.59, 55249.10, "sub"],
      ["Provisão para IRPJ e CSLL", "13", 1934736.06, 470202.07, "sub"],
      ["Não circulante", "", 2642872.04, 8856060.15, "grupo"],
      ["Parcelamentos tributários", "13", 2393086.93, 5524575.35, "sub"],
      ["Mútuos com partes relacionadas", "14", 249785.11, 3331484.80, "sub"],
      ["Patrimônio líquido (passivo a descoberto)", "15", -41516727.08, 6850971.37, "grupo"],
      ["Capital social", "", 1445000.00, 1445000.00, "sub"],
      ["Reserva de reavaliação", "", 12817591.86, 15036224.02, "sub"],
      ["Prejuízos acumulados", "", -55779318.94, -9630252.65, "sub"],
      ["Total do passivo e do patrimônio líquido", "", 18308932.42, 42927982.57, "total"]
    ],
    rodape: "Os saldos de 31/12/2024 correspondem à escrituração daquele exercício e não foram reapresentados (nota 3). Em 31/12/2024, a reserva de reavaliação estava classificada em reservas de lucros."
  },

  dre: {
    titulo: "Demonstração do Resultado",
    colunas: ["2025", "2024"],
    linhas: [
      ["Receita bruta de locação", "16", 8549300.64, 4200000.00, ""],
      ["(–) PIS e Cofins", "16", -312049.44, -189800.00, ""],
      ["Receita operacional líquida", "", 8237251.20, 4010200.00, "grupo"],
      ["(–) Custo da locação – depreciação", "10", -1606534.21, 0, ""],
      ["Resultado bruto", "", 6630716.99, 4010200.00, "grupo"],
      ["Despesas administrativas", "17", -728429.58, -669742.10, ""],
      ["Despesas tributárias", "17", -74587.28, -68147.07, ""],
      ["Resultado antes do resultado financeiro", "", 5827700.13, 3272310.83, "grupo"],
      ["Despesas financeiras", "17", -2343033.49, -636558.45, ""],
      ["Resultado antes do IRPJ e da CSLL", "", 3484666.64, 2635752.38, "grupo"],
      ["Contribuição social sobre o lucro", "18", -246219.85, -149760.00, ""],
      ["Imposto de renda da pessoa jurídica", "18", -659944.06, -392000.00, ""],
      ["Lucro líquido do exercício", "", 2578502.73, 2093992.38, "total"]
    ],
    lpa: [1.7844, 1.4491]
  },

  dra: {
    titulo: "Demonstração do Resultado Abrangente",
    colunas: ["2025", "2024"],
    linhas: [
      ["Lucro líquido do exercício", "", 2578502.73, 2093992.38, ""],
      ["Outros resultados abrangentes", "", 0, 0, ""],
      ["Resultado abrangente total do exercício", "", 2578502.73, 2093992.38, "total"]
    ]
  },

  dmpl: {
    titulo: "Demonstração das Mutações do Patrimônio Líquido",
    colunas: ["Capital social", "Reserva de reavaliação", "Reservas de lucros", "Prejuízos acumulados", "Total"],
    linhas: [
      ["Saldos em 31/12/2023", [1445000.00, 0, 15036224.02, -11724245.03, 4756978.99], "grupo"],
      ["Lucro líquido de 2024", [0, 0, 0, 2093992.38, 2093992.38], ""],
      ["Saldos em 31/12/2024", [1445000.00, 0, 15036224.02, -9630252.65, 6850971.37], "grupo"],
      ["Transferência da reserva de reavaliação para grupo próprio", [0, 15036224.02, -15036224.02, 0, 0], ""],
      ["Ajuste de exercícios anteriores – depreciação 2018 a 2024", [0, 0, 0, -19691993.35, -19691993.35], ""],
      ["Ajuste de exercícios anteriores – IPTU e REFIS municipal", [0, 0, 0, -1580689.16, -1580689.16], ""],
      ["Ajuste de exercícios anteriores – receita de 2024 não escriturada", [0, 0, 0, 1000000.00, 1000000.00], ""],
      ["Ajuste de exercícios anteriores – despesas de 2024 não escrituradas", [0, 0, 0, -1000000.00, -1000000.00], ""],
      ["Ajuste de exercícios anteriores – perdas estimadas", [0, 0, 0, -6150655.72, -6150655.72], ""],
      ["Ajuste de exercícios anteriores – débitos e encargos (PGFN e ICMS)", [0, 0, 0, -23522862.95, -23522862.95], ""],
      ["Saldos em 31/12/2024 ajustados", [1445000.00, 15036224.02, 0, -60576453.83, -44095229.81], "grupo"],
      ["Realização parcial da reserva de reavaliação", [0, -2218632.16, 0, 2218632.16, 0], ""],
      ["Lucro líquido de 2025", [0, 0, 0, 2578502.73, 2578502.73], ""],
      ["Saldos em 31/12/2025", [1445000.00, 12817591.86, 0, -55779318.94, -41516727.08], "total"]
    ]
  },

  dfc: {
    titulo: "Demonstração dos Fluxos de Caixa – Método Indireto",
    colunas: ["2025", "2024"],
    linhas: [
      ["Atividades operacionais", "", null, null, "grupo"],
      ["Lucro líquido do exercício", "", 2578502.73, 2093992.38, "sub"],
      ["Depreciações e amortizações", "", 1610676.22, 0, "sub"],
      ["Juros e encargos sobre tributos apropriados e não pagos", "", 2002162.12, 0, "sub"],
      ["Resultado ajustado", "", 6191341.07, 2093992.38, "grupo"],
      ["(Aumento) em clientes", "", -2446692.44, 0, "sub"],
      ["Aumento em fornecedores", "", 19358.09, 0, "sub"],
      ["(Redução) em obrigações tributárias, trabalhistas, previdenciárias e parcelamentos", "", -138931.56, -3021994.83, "sub"],
      ["Pagamento de IPTU de exercícios anteriores (REFIS municipal)", "", -146523.54, 0, "sub"],
      ["Caixa líquido das atividades operacionais", "", 3478551.62, -928002.45, "grupo"],
      ["Atividades de investimento", "", null, null, "grupo"],
      ["Mútuo concedido a parte relacionada", "14", -632647.64, 0, "sub"],
      ["Caixa líquido das atividades de investimento", "", -632647.64, 0, "grupo"],
      ["Atividades de financiamento", "", null, null, "grupo"],
      ["Mútuos recebidos de partes relacionadas", "14", 2876724.65, 953711.80, "sub"],
      ["Pagamento de mútuos a partes relacionadas", "14", -5721862.63, 0, "sub"],
      ["Caixa líquido das atividades de financiamento", "", -2845137.98, 953711.80, "grupo"],
      ["Aumento líquido de caixa e equivalentes de caixa", "", 766.00, 25709.35, "total"],
      ["Caixa e equivalentes no início do exercício", "", 25918.54, 209.19, ""],
      ["Reclassificação do depósito judicial para o realizável a longo prazo", "", -24949.93, 0, ""],
      ["Caixa e equivalentes no fim do exercício", "", 1734.61, 25918.54, "total"]
    ],
    complementar: [
      ["Ajustes de exercícios anteriores contra prejuízos acumulados (líquido)", "", 50946201.18, 0, ""],
      ["Compensação de saldos recíprocos de mútuos com parte relacionada", "14", 245830.94, 0, ""],
      ["Cessão de crédito entre partes relacionadas", "14", 1035666.23, 0, ""],
      ["Receita de locação de 2024 e despesas pagas com seus recursos", "", 1000000.00, 0, ""],
      ["Transferência de saldo de fornecedor para mútuo", "14", 9269.23, 0, ""],
      ["Realização parcial da reserva de reavaliação", "", 2218632.16, 0, ""],
      ["IRPJ e CSLL pagos no exercício", "", 912437.30, 455046.67, ""]
    ]
  }
};
