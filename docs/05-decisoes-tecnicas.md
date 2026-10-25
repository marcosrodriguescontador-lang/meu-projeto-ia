# Registro de decisões técnicas (ADR)

Complementa a tabela de ADRs de `01-arquitetura.md`. Cada entrada registra contexto, decisão e consequência.

## ADR-03 (confirmado) — Drizzle ORM + better-sqlite3
Migrações SQL geradas por `drizzle-kit` a partir de `src/main/infra/db/schema.ts` e mantidas em `db/migrations/`. Migrações manuais (triggers, regras de integridade) são criadas com `npm run db:generate -- --custom`. O executor próprio (`infra/db/conexao.ts`) aplica cada migração em transação, registra o SHA-256 e **recusa iniciar se uma migração já aplicada for alterada**.

## ADR-04 (confirmado) — SQLCipher v4 via `better-sqlite3-multiple-ciphers`
Instalado com alias npm `better-sqlite3` (o driver do Drizzle importa esse nome). Chave mestra aleatória de 256 bits, protegida pelo DPAPI do Windows (`safeStorage`) em `chaves.json`. Subchaves derivadas por HKDF: `banco`, `campos` (dados bancários) e `anexos`.

## ADR-16 — Backup por `VACUUM INTO` em vez da API de backup online
**Contexto:** a API `db.backup()` do SQLite não aceita origem cifrada com SQLCipher ("incompatible source and target").
**Decisão:** `VACUUM INTO` gera um snapshot transacional consistente, já cifrado com a mesma chave.
**Consequência:** o pacote `.sbak` inclui a chave mestra **dentro** do conteúdo cifrado com a senha de backup (Argon2id → AES-256-GCM), permitindo restaurar em outro computador. Contagens do manifesto são lidas do próprio snapshot.

## ADR-17 — Pacote único em vez de monorepo
**Contexto:** módulos nativos e `electron-builder` funcionam de forma mais previsível com um único `package.json`.
**Decisão:** a separação de camadas é feita por diretórios (`src/main`, `src/preload`, `src/renderer`, `src/shared`) com aliases (`@shared`, `@`).
**Consequência:** nenhuma perda de isolamento — o renderer não importa nada de `src/main` (verificado pelos `tsconfig` separados).

## ADR-18 — CNPJ alfanumérico
A validação segue a IN RFB 2.229/2024 (vigente desde julho/2026): 12 posições alfanuméricas + 2 dígitos verificadores, com valor de cada caractere = código ASCII − 48. CNPJs numéricos antigos continuam válidos.

## ADR-19 — Restauração aplicada na inicialização
**Contexto:** no Windows não é possível substituir o arquivo do banco enquanto está aberto.
**Decisão:** a restauração valida o pacote, gera um backup de segurança do estado atual (`PRE_RESTAURACAO`), extrai o conteúdo em `restauracao-pendente/` e reinicia o aplicativo. A troca ocorre na próxima inicialização, **antes** de abrir o banco; o estado substituído é guardado em `substituido-<data>/` (3 últimas cópias).

## ADR-20 — Testes executados no runtime do Electron
`npm test` executa o Vitest com `ELECTRON_RUN_AS_NODE=1`, para que os módulos nativos tenham um único ABI (o mesmo do aplicativo). Não é necessário recompilar entre testes e execução.

## ADR-21 — Exclusão lógica e auditoria imutável
Cadastros usam `excluido_em` + motivo obrigatório. A tabela `auditoria` tem triggers que impedem `UPDATE`/`DELETE` e cada registro carrega o hash do anterior (cadeia SHA-256). A verificação de integridade fica disponível na tela de Auditoria.

## ADR-22 — Dados bancários com cifragem de campo
Agência, conta, dígito e chave PIX são cifrados com AES-256-GCM (chave `campos`) além da cifragem do banco. A listagem usa apenas a máscara (`•••890-1`); a exibição completa exige `pessoas.dados_bancarios.ver` e gera o evento `DADO_BANCARIO_VISUALIZADO` na auditoria. A auditoria e o log técnico mascaram esses campos.

## ADR-23 — Preferências de interface no navegador
Somente o tema (claro/escuro) é guardado em `localStorage`. Nenhum dado de negócio ou de sessão fica no renderer: a sessão vive no processo principal.

## ADR-24 — Ofertas por modalidade (Fase 2)
Cada imóvel tem até duas ofertas (`imovel_oferta`, única por imóvel + modalidade), cada uma com valor, comissão prevista e situação próprias. Toda mudança de situação gera registro append-only em `oferta_situacao_hist` (triggers impedem alteração/exclusão). Triggers de banco também impedem combinações inválidas (ex.: venda "Alugado").
- **Venda concluída** inativa automaticamente a oferta de locação disponível (se já estiver alugado, o contrato segue).
- **Alugado/Vendido manual:** permitido nesta fase, com motivo obrigatório, para registrar a carteira existente. A partir das Fases 3 e 5 essas situações passam a ser definidas pelos contratos.
- Ofertas reservadas, em negociação, alugadas ou vendidas não podem ser desativadas pelo cadastro; imóveis com oferta reservada, em negociação ou alugada não podem ser excluídos.

## ADR-25 — Dados internos do imóvel
Matrícula, cartório, inscrição municipal, observações internas e proprietários exigem `imoveis.dados_internos.ver`. Sem essa permissão a API não os devolve e, na edição, **preserva** os valores existentes (o usuário não consegue apagá-los nem alterá-los). Cadastrar imóvel exige essa permissão, pois proprietário é obrigatório.

## ADR-26 — Fotos com miniatura cifrada
Cada foto é um anexo (`categoria = Foto`) cifrado, com miniatura JPEG de 480 px gerada pelo `nativeImage` do Electron e também cifrada. A interface recebe apenas *data URLs* via RPC (o renderer não acessa arquivos). A integridade da imagem original é conferida por SHA-256 ao abrir. Limite: 60 fotos por imóvel, 20 MB por foto.

## ADR-27 — Permissões novas em instalações existentes
A configuração `permissoes_conhecidas` registra as permissões já vistas. Ao atualizar o sistema, permissões **novas** são concedidas aos perfis padrão que as preveem; permissões antigas removidas pelo administrador **não** são reconcedidas. O evento fica na auditoria (`PERMISSOES_ATUALIZADAS`).

## ADR-28 — Ficha do imóvel em PDF
HTML gerado no processo principal (função pura, testada) e convertido por `printToPDF` em janela oculta, sem JavaScript e sem rede. Duas versões: **comercial** (sem endereço exato, proprietários ou matrícula; apenas ofertas disponíveis) e **interna** (exige `imoveis.dados_internos.ver`). O logotipo de `assets/brand/logo.*` é embutido quando fornecido.

## ADR-29 — Razão em partidas dobradas por baixo de títulos (Fase 3)
Toda movimentação financeira gera um `lancamento` com `partida`s balanceadas (Σ débitos = Σ créditos, validado em código e verificável na tela *Contas bancárias → Verificar razão*). Triggers impedem alterar/excluir lançamentos, partidas, baixas e itens de título; correções são feitas por **estorno** (lançamento inverso vinculado). Plano de contas de sistema:

| Conta | Natureza | Uso |
|---|---|---|
| 1.1.01 Disponibilidades | Ativo | Caixa e bancos (subconta = conta financeira) |
| 2.1.01 Proprietários — a repassar | Passivo (terceiros) | Subconta = proprietário |
| 2.1.02 Terceiros — a pagar | Passivo (terceiros) | Condomínio, prefeitura, prestadores do proprietário |
| 2.1.03 Cauções | Passivo (terceiros) | Subconta = locatário |
| 3.1.01–3.1.04 Receitas | Receita (própria) | Administração, intermediação, multas/juros (se da imobiliária), outras |

**Consequência:** emitir cobrança não afeta o razão; receber aluguel credita o proprietário (passivo), e só a taxa vira receita. "Saldo a repassar" é o saldo credor das partidas ainda não incluídas em repasse.

## ADR-30 — Títulos sem tabela de parcelas
O modelo de dados previa `titulo_parcela`. Optou-se por **um título por vencimento** (parcelas de renegociação são títulos irmãos vinculados por `renegociacao_id`). Simplifica saldo, baixa e consulta sem perda de rastreabilidade.

## ADR-31 — Composição por itens e alocação proporcional
Cada título tem itens com **destino** (proprietário, terceiro, imobiliária, caução, passivo) e taxa *congelada* na emissão (`taxa_bp`, `taxa_tipo`): alterar a taxa do contrato não afeta cobranças já emitidas. Pagamento parcial é alocado proporcionalmente aos saldos dos itens (maiores restos, sem perda de centavos); o rateio entre coproprietários usa a participação do contrato e o resto vai ao principal.

## ADR-32 — Competência, vencimento e pro rata
Competência = mês de uso; vencimento no dia contratual do **mês seguinte** (aluguel pós-pago, art. 42 da Lei 8.245/91), prorrogado ao próximo dia útil bancário (fins de semana, feriados nacionais incluindo Carnaval/Sexta-feira Santa/Corpus Christi calculados pela Páscoa, e feriados locais cadastrados). Juros contam do vencimento original quando o pagamento ocorre após o vencimento útil. Primeiro e último mês proporcionais por dias reais (Q11).

## ADR-33 — Aluguel por vigência
`aluguel_vigencia` registra o valor a partir de cada competência (contrato, reajuste, aditivo). Mudanças não podem retroagir a competências já cobradas. A geração é **bloqueada** para contratos com reajuste pendente até que o usuário aplique ou dispense (Q13).

## ADR-34 — Repasse por marcação de partidas
Gerar repasse marca (`repasse_id`) todas as partidas pendentes do favorecido e cria um título a pagar com o saldo exato. Isso torna o demonstrativo reprodutível. Regras: estorno de recebimento incluído em repasse **não pago** exige cancelar o repasse; após o pagamento, o estorno gera saldo devedor compensado nos próximos créditos. Pagamentos são recusados se a conta não tiver saldo.

## Pendências registradas para a Fase 4
- Transferência entre contas (ex.: mover a taxa da conta de terceiros para a conta própria), conciliação bancária e importação OFX/CSV.
- Vistorias de entrada/saída com checklist (previstas para a Fase 6).
