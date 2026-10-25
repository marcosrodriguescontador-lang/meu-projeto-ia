# Fase 1 — Fundação: relatório de entrega

Data: 25/10/2026 · Versão 0.1.0 · Schema `0001_auditoria_imutavel`

## Escopo entregue
- Arquitetura em camadas (main/preload/renderer/shared), IPC tipado com validação Zod e controle de sessão.
- Banco SQLite **cifrado** (SQLCipher v4), migrações versionadas com verificação de hash, integridade referencial (`foreign_keys=ON`, `ON DELETE RESTRICT`).
- Identidade visual: menu lateral, tema claro/escuro, design system (botões, formulários, tabelas, diálogos, avisos, indicadores), fonte Inter embarcada.
- Configuração inicial (empresa, administrador, senha de backup) **ou** restauração de backup na primeira execução.
- Login com Argon2id, bloqueio por tentativas, troca obrigatória de senha temporária, bloqueio de tela por inatividade (verificado também no processo principal).
- Usuários e perfis (RBAC) com 15 permissões, 6 perfis padrão, Administrador protegido, proteção do último administrador.
- Cadastro único de pessoas PF/PJ com 9 papéis, endereços, contatos, relações (cônjuge, representante etc.), dados bancários com cifragem de campo, documentos anexados cifrados, histórico por pessoa, exclusão lógica com motivo.
- Auditoria append-only com cadeia de hash e verificação de integridade na interface.
- Backup manual e automático (agendado, com retenção), validação após geração, restauração assistida com backup de segurança prévio.
- Painel inicial com indicadores reais disponíveis nesta fase.
- Configuração de empacotamento Windows (NSIS) e pipeline de CI (testes + instalador).

## Critérios de aceite

| Critério (docs/04-plano-de-execucao.md) | Situação | Evidência |
|---|---|---|
| Instalar em Windows limpo e abrir sem internet | ⏳ **Pendente de validação em Windows** | Instalador gerado pelo job `instalador-windows` do CI. App empacotado testado em Linux (E2E completo passou no binário empacotado). |
| Primeiro acesso exige criar administrador e senha de backup | ✅ | E2E passo 1; `seguranca.test.ts` |
| Mesma pessoa com vários papéis sem duplicar CPF; CPF/CNPJ inválido rejeitado no front e no back | ✅ | E2E passos 3 e 5; `pessoas.test.ts` ("vários papéis", "valida dados no backend"); `documentos.test.ts` |
| Usuário sem permissão não vê dados bancários (UI mascarada e API recusa) | ✅ | `pessoas.test.ts` ("usuário sem permissão"); E2E passo 4 |
| Toda criação/alteração/exclusão na auditoria; senha nunca em log/auditoria | ✅ | `seguranca.test.ts` ("auditoria"); `pessoas.test.ts` (conta bancária ausente da auditoria) |
| Alteração direta da auditoria é detectada | ✅ | `seguranca.test.ts` (triggers bloqueiam; adulteração contornando trigger é detectada) |
| Backup durante gravações restaura íntegro em outra máquina com a senha de backup | ✅ | `backup.test.ts` (gravações concorrentes, cofre diferente, anexos e cadeia de auditoria conferidos); backup adulterado é rejeitado |
| Testes automatizados de documentos, hashing, RBAC, auditoria, backup/restore | ✅ | 27 testes Vitest + E2E de 11 etapas |

## Resultados de execução (ambiente de desenvolvimento)
- `npm run typecheck` — sem erros
- `npm test` — 5 arquivos, **27 testes aprovados**
- `tests/e2e/fase1.e2e.cjs` — **aprovado** no app de desenvolvimento e no app empacotado (configuração inicial, login inválido/válido, cadastro com validação, dados bancários, bloqueio de CPF duplicado, tema escuro, backup, auditoria íntegra, perfis, bloqueio/desbloqueio de tela, persistência após reabrir)
- Capturas de tela: `docs/capturas/`

## Pendências e observações
1. **Validação em Windows real** (instalação, DPAPI, atalhos): rodar o instalador do CI em uma máquina da Status.
2. **Logotipos (Q26):** não recebidos. A interface exibe o nome em texto até que `assets/brand/logo.svg|png` (e `logo-negativo`) sejam adicionados — nenhum redesenho foi feito. O ícone do instalador também depende desses arquivos.
3. **Repositório (Q2):** o código está versionado localmente (git); informe o repositório GitHub privado para envio e para ativar o CI que gera o instalador.
4. **Assinatura digital do instalador (Q4):** sem certificado, o Windows exibe aviso do SmartScreen.
5. Consulta de CEP é manual (offline); consulta online opcional pode ser adicionada depois.
6. Política LGPD (anonimização, relatório do titular) está planejada para a Fase 7, conforme o plano.
