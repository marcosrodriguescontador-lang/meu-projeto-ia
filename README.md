# STATUS ERP IMOBILIÁRIO

Sistema desktop de gestão administrativa, comercial e financeira da **Status Negócios Imobiliários** (CRECI 038595-J).
Funciona 100% offline no Windows, com banco de dados local cifrado, auditoria imutável e backup cifrado.

**Situação:** Fases 1 (Fundação), 2 (Imóveis), 3 (Locações e núcleo financeiro), 4 (Financeiro completo) e 5 (Vendas e CRM) concluídas — ver relatórios em [`docs/`](docs/) (`fase-1-entrega.md` a `fase-5-entrega.md`).

## Tecnologias
Electron · React 19 · TypeScript · Tailwind CSS 4 · SQLite/SQLCipher (`better-sqlite3-multiple-ciphers`) · Drizzle ORM · Zod · Argon2id · Vitest · Playwright · electron-builder (NSIS)

## Comandos
| Comando | Ação |
|---|---|
| `npm ci` | Instala dependências |
| `npm run dev` | Executa em modo desenvolvimento |
| `npm test` | Testes automatizados (domínio, segurança, backup) |
| `npm run typecheck` | Verificação de tipos (main e interface) |
| `npm run build` | Compila para `out/` |
| `node tests/e2e/faseN.e2e.cjs` (N = 1 a 5) | Testes ponta a ponta no app real (após `build`; em Linux sem monitor use `xvfb-run -a`) |
| `npm run dist:win` | Gera o instalador Windows em `release/` (executar no Windows ou via CI) |
| `npm run db:generate` | Gera migração a partir de `src/main/infra/db/schema.ts` |

Variável `STATUS_ERP_DADOS` permite apontar outra pasta de dados (testes).

## Estrutura
```
src/main/        processo principal: casos de uso, persistência, infraestrutura
  infra/         banco cifrado, criptografia, cofre de chaves, log, zip
  ipc/           roteador RPC (única porta de entrada da interface)
  modules/       seguranca · pessoas · imoveis · locacoes · financeiro · anexos · backup · configuracoes · painel
  nucleo/        contexto, inicialização, utilitários
src/preload/     ponte mínima (contextBridge)
src/renderer/    interface React (design system Status em components/ui)
src/shared/      schemas Zod, DTOs, contrato RPC, permissões, validadores, regras financeiras puras (financeiro/)
db/migrations/   migrações SQL versionadas
tests/           testes Vitest + E2E Playwright
docs/            arquitetura, modelo de dados, regras, plano, ADRs, manuais
assets/brand/    logotipos oficiais (logo.svg|png, logo-negativo.svg|png)
```

## Documentação
- [Arquitetura](docs/01-arquitetura.md) · [Modelo de dados](docs/02-modelo-de-dados.md) · [Regras de negócio](docs/03-regras-a-esclarecer.md) · [Plano de execução](docs/04-plano-de-execucao.md) · [Decisões técnicas](docs/05-decisoes-tecnicas.md)
- [Manual de instalação](docs/manual-instalacao.md) · [Manual de operação](docs/manual-operacao.md)
