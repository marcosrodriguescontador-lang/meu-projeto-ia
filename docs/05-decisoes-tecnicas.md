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
