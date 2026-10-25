# Fase 2 — Imóveis: relatório de entrega

Data: 25/10/2026 · Versão 0.2.0 · Schema `0003_imoveis_dados_iniciais`

## Escopo entregue
- Cadastro completo de imóveis residenciais, comerciais, rurais e terrenos: código automático, tipo, finalidade, endereço, matrícula/cartório (únicos), inscrição municipal, áreas, dormitórios, suítes, banheiros, vagas, descrição comercial, observações internas, condomínio, IPTU e corretor responsável.
- Proprietários e coproprietários com participação percentual (soma obrigatória de 100%), principal, papel Proprietário atribuído automaticamente.
- Ofertas de **venda e locação simultâneas e independentes**: valor, comissão prevista (com estimativa), situação e histórico de situação imutável.
- Galeria de fotos (miniaturas, capa, ordem, legenda, visualizador ampliado), documentos do imóvel (9 categorias), catálogo de 38 características.
- Pesquisa por código/endereço/descrição, modalidade, situação, tipo, finalidade, cidade, bairro, faixa de preço, dormitórios, vagas, área e características; ordenação por código, recência e valor; visualização em tabela ou cards.
- Ficha do imóvel em PDF (comercial e interna) com a marca.
- Histórico de alterações e de disponibilidade por imóvel.
- Integração com Pessoas: aba *Imóveis* no proprietário; bloqueio de remover papel ou excluir pessoa vinculada.
- Painel com indicadores reais: imóveis cadastrados, disponíveis para venda, disponíveis para locação, alugados, em negociação e vendidos.
- 8 novas permissões, concedidas automaticamente aos perfis padrão em instalações existentes (ADR-27).

## Critérios de aceite

| Critério (docs/04-plano-de-execucao.md) | Situação | Evidência |
|---|---|---|
| Soma de participação ≠ 100% é recusada | ✅ | `imoveis.test.ts` ("exige participações somando 100%"); E2E passo 1 |
| Mesmo imóvel "alugado" na locação e "disponível" na venda | ✅ | `imoveis.test.ts` ("situações independentes"); E2E passo 3 e captura 13 |
| Busca por faixa de preço e bairro retorna corretamente | ✅ | `imoveis.test.ts` ("pesquisa", 11 combinações de filtro); E2E passo 6 |
| Histórico de alterações visível | ✅ | E2E passo 5 e captura 14; auditoria com antes/depois |
| Dashboard mostra totais reais de imóveis | ✅ | `imoveis.test.ts` ("indicadores"); E2E passo 8 e captura 17 |
| Ficha do imóvel em PDF com a marca | ✅ | `imoveis.test.ts` (conteúdo comercial × interno, escape de HTML); E2E gera PDF real (`docs/capturas/ficha-comercial-exemplo.pdf`) |

## Resultados de execução
- `npm run typecheck` — sem erros
- `npm test` — 7 arquivos, **44 testes aprovados** (17 novos na Fase 2)
- `tests/e2e/fase2.e2e.cjs` — **aprovado** (pessoas, cadastro com validação, proprietários, fotos reais com miniatura e capa, visualizador, situação, PDF, histórico, filtros, cards, integração com pessoas, painel)
- `tests/e2e/fase1.e2e.cjs` — **aprovado** novamente (sem regressões)
- Capturas: `docs/capturas/11` a `17`

## Observações
1. Situações *Alugado* e *Vendido* podem ser registradas manualmente (com motivo) para a carteira existente; a partir das Fases 3 e 5 serão definidas pelos contratos.
2. A comissão de locação exibida é apenas estimativa sobre um aluguel; taxa de administração, intermediação e repasses serão regidos pelo contrato (Fase 3, regras Q5–Q10 aprovadas).
3. Consulta de CEP continua manual (offline).
4. Pendências da Fase 1 continuam abertas: repositório GitHub (Q2), logotipos (Q26), validação em Windows real.
