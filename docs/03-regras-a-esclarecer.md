# STATUS ERP IMOBILIÁRIO — Regras de Negócio a Esclarecer

> **Aprovado em 25/10/2026:** todas as propostas padrão foram aceitas. Pendências de informação ainda abertas: Q2 (nome do repositório GitHub), Q24 (percentuais de rateio de comissão), Q26 (arquivos de logotipo), Q21 (bancos para CNAB).

Para cada questão há uma **proposta padrão**. Alterações futuras de regra financeira devem ser registradas aqui com o impacto apresentado.
Itens marcados ⚠️ bloqueiam a fase indicada.

## A. Infraestrutura e operação

| # | Questão | Proposta padrão |
|---|---|---|
| Q1 ⚠️ F1 | **Quantos computadores usarão o sistema ao mesmo tempo?** SQLite em pasta de rede compartilhada corrompe dados com acesso simultâneo. | Fase 1–7: **uma estação** (vários usuários, um de cada vez). Arquitetura já separada para, numa fase futura, ativar um "modo servidor" em rede local (um PC hospeda o banco, os demais acessam via API local). |
| Q2 ⚠️ F1 | Onde o código-fonte será versionado? Este ambiente é temporário. | Criar um repositório GitHub privado da Status (informe o nome) e enviar o trabalho a cada etapa. |
| Q3 | Existem dados atuais (planilhas, outro sistema) a migrar? | Fase 7: importador XLSX/CSV para pessoas, imóveis e contratos ativos com saldos iniciais. |
| Q4 | Certificado de assinatura de código (code signing) para o instalador? | Sem certificado inicialmente (Windows exibirá aviso do SmartScreen). Recomendado adquirir antes da distribuição. |

## B. Locações — cálculos

| # | Questão | Proposta padrão |
|---|---|---|
| Q5 ⚠️ F3 | **Multa e juros por atraso: de quem são?** Do proprietário, da imobiliária ou divididos? | Pertencem ao **proprietário** (repassados), salvo cláusula diferente no contrato de administração; configurável por contrato. |
| Q6 ⚠️ F3 | Percentuais de atraso. | Multa 10% (residencial, conforme contrato), juros 1% a.m. **pro rata die**, sem correção monetária para atrasos < 30 dias; configuráveis por contrato. |
| Q7 ⚠️ F3 | **Base da taxa de administração**: aluguel contratado, aluguel recebido, ou aluguel + multa/juros? | Percentual sobre o **aluguel efetivamente recebido** (não incide sobre condomínio/IPTU repassados nem sobre multa/juros); cobrada só quando há recebimento. |
| Q8 ⚠️ F3 | **Taxa de intermediação / 1º aluguel**: a imobiliária retém o 1º aluguel (ou %) na contratação? | Configurável por contrato: % do 1º aluguel retido como receita própria, em vez da taxa de administração naquele mês. |
| Q9 ⚠️ F3 | **Repasse garantido ou após recebimento?** | **Após recebimento** (repasse só do que entrou). Garantido como opção por contrato, gerando adiantamento ao proprietário quando o locatário atrasa. |
| Q10 ⚠️ F3 | Prazo do repasse. | Dia fixo configurável por proprietário (ex.: dia 10) ou N dias úteis após recebimento. |
| Q11 | 1º e último mês proporcionais (pro rata)? | Sim, cálculo por dias corridos do mês (base 30 ou dias reais — **informe qual**; proposta: dias reais do mês). |
| Q12 | Vencimento em fim de semana/feriado. | Prorroga para o próximo dia útil sem encargos (tabela de feriados nacionais + municipais editável). |
| Q13 | Reajuste: índice negativo (ex.: IGP-M negativo) é aplicado? | Não reduz o aluguel por padrão (mantém valor); configurável por contrato. Índices digitados manualmente na tabela (offline). Reajuste **sempre exige confirmação** de um usuário — nunca automático silencioso. |
| Q14 | Desconto de pontualidade é usado? | Suportado, configurável por contrato (padrão: desligado). |
| Q15 | IPTU e condomínio: a imobiliária cobra do locatário e paga, ou o locatário paga direto? | Ambos suportados por contrato (`cobrado via imobiliária` × `pago direto pelo locatário`). |
| Q16 | Caução em dinheiro: fica em conta da imobiliária? Rende? | Tratada como **recurso de terceiros** em conta específica (passivo com o locatário), devolvida/abatida na rescisão. |
| Q17 | Multa rescisória. | Proporcional ao tempo restante (art. 4º Lei 8.245/91), com base em N aluguéis definidos no contrato (padrão 3). Cálculo exibe memória para conferência e exige aprovação. |

## C. Tributos e obrigações

| # | Questão | Proposta padrão |
|---|---|---|
| Q18 ⚠️ F3 | **Retenção de IRRF** quando o locatário é PJ e o proprietário é PF: a imobiliária controla? | Registrar a retenção informada pelo locatário PJ (reduz o valor recebido, gera comprovante) — sem cálculo automático de carnê-leão. |
| Q19 | **DIMOB** (declaração anual obrigatória para imobiliárias): o sistema deve gerar o arquivo? | Fase 4: relatório com todos os dados da DIMOB; geração do arquivo no layout da Receita como entrega posterior. |
| Q20 | Regime tributário da Status (Simples, Presumido) e ISS sobre taxas — o sistema calcula impostos sobre a receita própria? | Fora do escopo inicial; relatórios de receita própria por tipo/competência para o contador. Exportação contábil em CSV. |
| Q21 | Emissão de boletos/PIX? Requer integração bancária (CNAB/API). | Fase 3: recibo e controle de cobrança sem boleto. Arquitetura preparada; **CNAB 240/400 (remessa/retorno por arquivo, funciona offline)** como fase adicional — informe o(s) banco(s). |

## D. Vendas e comissões

| # | Questão | Proposta padrão |
|---|---|---|
| Q22 | Corretores são autônomos, associados (Lei 13.097/2015) ou CLT? Há retenção de INSS/IRRF na comissão (RPA)? | Comissão bruta + campo de retenções informadas; sem cálculo de folha. |
| Q23 ⚠️ F5 | Corretor recebe comissão quando? | **Somente após a imobiliária receber** a comissão (proporcional a recebimentos parciais). |
| Q24 | Regra de rateio padrão. | Configurável por negócio, com modelo padrão (ex.: imobiliária 50%, captador 20%, vendedor 30%) — **informe o seu**. |
| Q25 | O sinal da compra transita pela conta da imobiliária? | Se transitar, é **recurso de terceiros** (do vendedor) e gera repasse; se for pago direto, apenas registrado para controle. |

## E. Segurança, LGPD e identidade

| # | Questão | Proposta padrão |
|---|---|---|
| Q26 ⚠️ F1 | **Logotipos não foram anexados a esta sessão.** | Envie os arquivos originais (preferencialmente SVG ou PNG alta resolução, versões fundo claro e escuro, se existirem). |
| Q27 | Cor de destaque. | Verde-petróleo discreto `#0F766E`; vermelho/âmbar só para alertas. |
| Q28 | Criptografia do banco: a chave fica atrelada ao usuário Windows (DPAPI). Se o Windows for reinstalado, só se recupera pelo backup (que tem senha própria). Aceitável? | Sim; senha de backup definida no primeiro uso e guardada pela diretoria. |
| Q29 | Prazos de retenção (LGPD). | Contratos e financeiro: 10 anos após encerramento (prazo prescricional geral, art. 205 CC); leads sem negócio: 2 anos sem interação → anonimização. **Validar com o jurídico.** |
| Q30 | Tempo de bloqueio por inatividade e política de senha. | 10 min; mínimo 10 caracteres; bloqueio 15 min após 5 tentativas. |

## F. Escopo de relatórios

| # | Questão | Proposta padrão |
|---|---|---|
| Q31 | Resultado gerencial: regime de **caixa** ou **competência**? | Ambos disponíveis; dashboard padrão em **caixa** (o que efetivamente entrou/saiu). |
| Q32 | Plano de contas gerencial. | Proposta de plano padrão para imobiliária (semeado na Fase 3), editável; se o contador tiver um plano, enviar para mapear. |
