# Fase 5 — Vendas e CRM: relatório de entrega

Data: 26/10/2026 · Versão 0.5.0 · Schema `0010_crm_regras`

## Escopo entregue
**CRM**
- Leads com origem do contato (lista editável: indicação, placa, portal, site, redes sociais, WhatsApp…), interesse (compra/locação), perfil de busca, imóveis de interesse com **sugestões automáticas** compatíveis, vínculo opcional ao cadastro de pessoas, consentimento de comunicação (LGPD) e identificador externo (preparo para integrações com portais, site e WhatsApp sem duplicar contatos).
- Funis de **venda** e de **locação** em quadro (kanban) com arrastar e soltar; etapas Captação → Atendimento → Visita → Proposta → Negociação → Contrato → Conclusão (e Perdido, com motivo).
- Histórico de etapas imutável; avanço automático por visita, proposta, aceite, venda e escritura.
- Atividades (ligação, WhatsApp, e-mail, reunião, tarefa) com responsável, agenda unificada com visitas e atrasos destacados.
- Visitas agendadas com bloqueio de conflito de horário (imóvel ou corretor) e registro de resultado e interesse.
- Indicadores de conversão por etapa, tempo médio por etapa, taxa de ganho, ciclo médio, motivos de perda, desempenho por origem e por corretor.
- Carteira do corretor: usuário ligado à pessoa do corretor vê e atua só nos próprios clientes.

**Vendas**
- Propostas e contrapropostas versionadas e imutáveis (sinal, parcelas, financiamento, condições, validade).
- Registro da venda com compradores/vendedores (vendedores conferidos com os proprietários do imóvel), forma de pagamento (sinal, parcelas, financiamento, pagamento na escritura), cada parcela **direta** (apenas registrada) ou **pela imobiliária** (recurso de terceiros com repasse ao vendedor).
- Situações: contratada, aguardando financiamento, escriturada, concluída e distrato (cancela valores não recebidos e devolve o imóvel à venda).
- Imóvel: proposta aceita → em negociação; venda → vendido (oferta de locação inativada, salvo imóvel alugado); distrato → disponível.

**Comissões**
- Comissão de venda (% sobre o valor, com pagador e vencimento, ou retida do sinal) e comissão de intermediação de locação.
- Rateio entre imobiliária, captador, vendedor, gerente e parceiros, com modelo padrão configurável (Q24).
- Liberação proporcional ao recebido pela imobiliária, gerando contas a pagar aos corretores; estornos refletidos automaticamente.
- Relatório **Comissões por corretor** (previsto, liberado, pago, a pagar, aguardando recebimento) em tela, PDF e Excel.

**Painel**
- Novos indicadores: negócios em andamento, leads do mês, minhas tarefas (hoje/atrasadas), visitas da semana, despesas do mês, resultado do mês e comissões a receber; gráfico com filtro de período (6, 12 ou 24 meses).
- Correção: "Receita própria no mês" passou a incluir todas as receitas próprias (antes considerava só as receitas de locação, deixando de fora comissões e receitas lançadas na Fase 4).

## Critérios de aceite

| Critério (docs/04-plano-de-execucao.md) | Situação | Evidência |
|---|---|---|
| Concluir venda não gera recebimento | ✅ | `vendas-crm.test.ts`: nenhum lançamento novo no razão ao registrar a venda, informar pagamento direto e escriturar; E2E: "Nenhum valor foi lançado como recebido" |
| Comissão do corretor só vira "a pagar" após recebimento pela imobiliária | ✅ | teste: 0 títulos a pagar antes; recebimento de 1/3 libera 2.000 + 3.000; restante libera o total; estorno cancela a liberação não paga e é bloqueado se a parte já foi paga; teste de propriedade (300 casos aleatórios) da liberação proporcional; E2E (captura 42) |
| Taxa de conversão por etapa calculada do histórico real | ✅ | teste "indicadores de conversão vêm do histórico real de etapas" (alcançaram 3/3/2/1/1/1/1; Atendimento→Visita 66,67%); E2E (captura 45) |

## Resultados de execução
- `npm run typecheck` — sem erros
- `npm test` — 13 arquivos, **137 testes aprovados** (10 novos na Fase 5)
- E2E Fases 1 a 5 — **aprovados** no app real (Fase 5: lead com sugestão de imóvel, negócio, visita realizada, proposta → contraproposta → aceite, funil, venda com sinal pela imobiliária e rateio, recebimento da comissão, liberação aos corretores em contas a pagar, posição por corretor, escritura concluindo o negócio, agenda, indicadores, verificação do razão, painel)
- Capturas 36–46 em `docs/capturas/`

## Observações e decisões a validar
1. **Rateio padrão** 50% imobiliária / 20% captador / 30% vendedor (proposta da Q24) — informe o seu e ajuste em Comissões → Modelo padrão.
2. **Distrato** mantém a comissão (pode ser devida conforme o contrato); cancelá-la é decisão explícita, permitida só sem recebimentos.
3. **Retenções na comissão do corretor** (INSS/IRRF/RPA, Q22): o sistema registra a comissão bruta; retenções ficam para o pagamento (campo de observação) — sem cálculo de folha.
4. Integrações com WhatsApp, e-mail, portais e site **não** foram ativadas (exigem internet); a estrutura de leads já evita duplicidades por origem.
5. Pendências anteriores continuam: repositório GitHub (Q2), logotipos (Q26), validação em Windows real.
