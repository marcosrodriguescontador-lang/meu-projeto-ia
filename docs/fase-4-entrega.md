# Fase 4 — Financeiro completo: relatório de entrega

Data: 26/10/2026 · Versão 0.4.0 · Schema `0008_plano_contas_ampliado`

## Escopo entregue
**Contas a pagar e a receber gerais**
- Despesas e receitas próprias da imobiliária com categoria do plano de contas, competência, documento, à vista ou parceladas (até 120×, rateio exato de centavos), já quitadas ou em aberto.
- Plano de contas ampliado: receitas de venda, avaliações, rendimentos; despesas de pessoal, escritório, tecnologia, marketing, contabilidade, CRECI, tarifas, tributos etc. Criação de categorias pelo usuário (3.9.NN / 4.8.NN). Receitas automáticas das locações não aceitam lançamento manual.
- IRRF retido por locatário pessoa jurídica (lançamento avulso de natureza IRRF).

**Tesouraria**
- Transferências entre contas com estorno; da conta de terceiros para a própria, limitadas ao que pertence à imobiliária.
- Quadro *Separação de recursos*: saldo das contas de terceiros × proprietários a repassar + terceiros a pagar + cauções.
- Página por conta: movimentos com saldo acumulado e marca de conciliado, transferências, importações.

**Extratos e conciliação**
- Importação OFX (SGML e XML, UTF-8 ou Windows-1252) e CSV com mapeamento de colunas (valor único ou débito/crédito, três formatos de data).
- Antiduplicidade em dois níveis (arquivo e transação) — arquivos com períodos sobrepostos só trazem o que é novo.
- Conciliação automática (par único, até 3 dias), sugestões (até 5 dias), escolha manual, lançamento a partir da linha (tarifas, rendimentos), ignorar com motivo, desfazer.
- Confronto do saldo do sistema com o saldo do extrato do banco na mesma data.

**Fluxo de caixa e relatórios**
- Fluxo de caixa mensal previsto × realizado por grupo de contas, com gráficos de entradas/saídas e de saldo.
- 12 relatórios com prévia na tela e exportação PDF/Excel: contas a receber e a pagar por vencimento, inadimplência, receitas próprias, despesas por categoria, fluxo de caixa, resultado gerencial mensal (caixa ou competência), rentabilidade da administração, valores a repassar (com conferência contábil), posição de recursos de terceiros, extrato do proprietário, base DIMOB.
- Painel: gráfico de receitas próprias × despesas dos últimos 12 meses.
- Auditoria de todas as novas ações (categorias, despesas, receitas, transferências, importações, conciliações, exportações).

## Critérios de aceite

| Critério (docs/04-plano-de-execucao.md) | Situação | Evidência |
|---|---|---|
| Importar o mesmo OFX duas vezes não duplica | ✅ | `financeiro-geral.test.ts` (arquivo recusado; sobreposto traz 1 de 2); `extratos.test.ts`; E2E passo 3 |
| Saldo do sistema bate com o extrato conciliado | ✅ | teste de importação: diferença R$ 0,00 após lançar tarifa e rendimento; E2E: indicador "Diferença na data do extrato" = R$ 0,00 (captura 28) |
| "Valores a repassar" bate com o passivo de terceiros | ✅ | teste: total do relatório = saldo da conta 2.1.01 (após repasse parcial); E2E: observação "confere com o saldo" (captura 33) |
| Receita própria nunca inclui aluguel bruto | ✅ | teste: recebimento de R$ 2.500 gera R$ 200 de receitas; rentabilidade 10%; resultado gerencial só com contas 3.x/4.x |

## Resultados de execução
- `npm run typecheck` — sem erros
- `npm test` — 12 arquivos, **127 testes aprovados** (23 novos na Fase 4: 14 de leitura de extratos, 9 de integração financeira)
- E2E Fases 1, 2, 3 e 4 — **aprovados** no app real (Fase 4: contas própria e de terceiros, recebimento, importação OFX com conciliação automática, reimportação recusada, tarifa lançada a partir do extrato, diferença zero, transferência bloqueada e permitida, despesa paga, fluxo de caixa, relatórios com exportação Excel e PDF, verificação do razão, painel com gráfico)
- Exemplo: `docs/capturas/relatorio-dimob-exemplo.pdf`; capturas 27–35

## Observações e decisões a validar
1. **DIMOB**: o sistema entrega a base de conferência (por locador e mês de pagamento); o arquivo oficial continua sendo gerado no programa da Receita. Gerar o arquivo no layout oficial pode ser incluído na Fase 7, se desejado.
2. **Comissão na DIMOB** = taxa de administração + intermediação efetivamente retidas no mês.
3. **Despesa paga pela conta de terceiros** é permitida, mas o sistema avisa; o quadro de separação mostra a falta de recursos de terceiros que isso causa.
4. **Conciliação** não altera valores: diferenças de centavos entre banco e sistema devem ser corrigidas por estorno + novo lançamento.
5. Pendências anteriores continuam: repositório GitHub (Q2), logotipos (Q26), validação em Windows real.
