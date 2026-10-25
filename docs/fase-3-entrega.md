# Fase 3 — Locações e núcleo financeiro: relatório de entrega

Data: 25/10/2026 · Versão 0.3.0 · Schema `0006_aluguel_vigencia`

## Escopo entregue
**Locações**
- Contrato residencial/comercial: imóvel, locadores (congelados na ativação conforme participação), locatários, fiadores, prazo, aluguel, dia de vencimento, índice e periodicidade de reajuste, taxa de administração, intermediação no 1º aluguel, multa e juros por atraso (destino configurável), multa rescisória, garantia (caução ≤ 3 aluguéis, fiança, seguro-fiança, título de capitalização).
- Rascunho → ativação (imóvel passa a *Alugado*; situação manual bloqueada enquanto houver contrato ativo; caução gera cobrança).
- Encargos recorrentes (condomínio, IPTU, seguro…) com destino proprietário/terceiro/imobiliária e proporcionalidade.
- Lançamentos avulsos: cobrança ao locatário (inclusive crédito) e débito ao proprietário.
- Aditivos (renovação, alteração de valor com vigência), reajuste com confirmação (índices informados manualmente, acumulado composto, índice negativo não reduz), dispensa com motivo.
- Rescisão com aluguel proporcional, multa proporcional (art. 4º), dispensa justificada, devolução de caução e liberação do imóvel.
- Documentos do contrato e histórico.

**Financeiro**
- Razão em partidas dobradas, imutável, com estorno e verificação de integridade.
- Contas bancárias/caixa com titularidade (próprio × terceiros) e saldos derivados do razão.
- Geração mensal idempotente com prévia, pro rata, vencimento em dia útil (feriados nacionais calculados + locais).
- Recebimento integral, parcial, antecipado e em atraso (multa + juros pro rata die), desconto e dispensa sob permissão, recibo em PDF com valor por extenso.
- Estorno de baixa com reversão completa; cancelamento de título.
- Inadimplência com encargos atualizados; renegociação em parcelas preservando a destinação dos valores.
- Saldos a repassar (proprietários, terceiros, cauções), extrato, repasse individual ou em lote, pagamento com verificação de saldo, demonstrativo em PDF, cancelamento.
- Painel: contratos ativos/vencendo, reajustes, a receber no mês, vencidos, repasses pendentes, receita própria do mês, saldo em contas.
- 14 novas permissões, concedidas automaticamente aos perfis padrão (ADR-27).

## Critérios de aceite

| Critério (docs/04-plano-de-execucao.md) | Situação | Evidência |
|---|---|---|
| Gerar cobranças da competência duas vezes não duplica | ✅ | `locacao-financeiro.test.ts` ("idempotente"); E2E passo 3 |
| Cobrança emitida não altera caixa, receita nem repasse | ✅ | teste "emitir cobrança não movimenta…" (0 lançamentos) |
| Recebimento parcial deixa título parcial e repassa só o recebido | ✅ | teste "recebimento parcial…" (saldo 1.500, taxa proporcional) |
| Taxa de administração como receita própria apenas no recebimento | ✅ | testes de recebimento; E2E: receita própria = R$ 250 de R$ 2.762,50 recebidos |
| Estorno reverte todos os efeitos e fica auditado | ✅ | teste "estorno reverte…"; bloqueio com repasse aberto; saldo devedor após repasse pago |
| Σ débitos = Σ créditos em 100% dos lançamentos | ✅ | verificação em 14 cenários; tela *Verificar razão* no E2E |
| ≥ 40 cenários financeiros | ✅ | **22** cenários de domínio puro + **28** de integração + **10** de valor por extenso = 60 |

## Resultados de execução
- `npm run typecheck` — sem erros
- `npm test` — 10 arquivos, **104 testes aprovados** (60 novos na Fase 3)
- E2E Fases 1, 2 e 3 — **aprovados** no app real (Fase 3: conta bancária, contrato, ativação, geração idempotente, recebimento com encargos, recibo PDF, repasse, pagamento, demonstrativo PDF, inadimplência, verificação do razão, painel)
- Exemplos: `docs/capturas/recibo-exemplo.pdf`, `docs/capturas/demonstrativo-repasse-exemplo.pdf`, capturas 18–26

## Observações e decisões a validar
1. **Intermediação no 1º aluguel**: o formulário sugere 100% (o 1º aluguel inteiro como receita da imobiliária, conforme Q8). Ajuste por contrato se a prática for outra.
2. **Multa rescisória e encargos de renegociação** vão ao proprietário (padrão Q5); multa rescisória sem taxa de administração.
3. Quando a cobrança do mês da entrega já foi paga integralmente, a rescisão gera crédito da diferença proporcional ao locatário; a taxa de administração do mês cheio não é revertida.
4. A taxa fica na conta de terceiros até a transferência para a conta própria — transferências entre contas e conciliação bancária são da **Fase 4**.
5. Vistorias de entrada/saída com checklist estão na **Fase 6** (conforme plano).
6. Pendências anteriores continuam: repositório GitHub (Q2), logotipos (Q26), validação em Windows real.
