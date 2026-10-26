# STATUS ERP IMOBILIÁRIO — Arquitetura Proposta

> Documento de arquitetura. Status: **aprovado em 25/10/2026** (propostas padrão de `03-regras-a-esclarecer.md` aceitas). Ajustes feitos durante a Fase 1 estão em `05-decisoes-tecnicas.md`.
> Data: 25/10/2026

## 1. Visão geral

Aplicação desktop Windows, monousuário por estação na versão inicial (ver questão Q1 em `03-regras-a-esclarecer.md`), 100% funcional offline, com banco SQLite local, anexos em diretório gerenciado e backup criptografado.

```
┌──────────────────────────────────────────────────────────────────────┐
│ RENDERER (Chromium, sandbox)                                         │
│ React + TypeScript + Tailwind + TanStack Query/Table + React Hook    │
│ Form + Zod  ── nenhuma API Node, nenhum acesso a disco ou banco ──   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ IPC tipado (contextBridge, canal único
                               │ "rpc", payload validado por Zod)
┌──────────────────────────────▼───────────────────────────────────────┐
│ MAIN PROCESS (Node.js)                                               │
│ ┌──────────────┐  ┌───────────────────────┐  ┌────────────────────┐  │
│ │ Camada de    │→ │ Aplicação (casos de   │→ │ Domínio (regras    │  │
│ │ entrada IPC  │  │ uso, transações,      │  │ puras: cálculos de │  │
│ │ auth + RBAC  │  │ auditoria)            │  │ aluguel, juros,    │  │
│ └──────────────┘  └──────────┬────────────┘  │ repasse, comissão) │  │
│                              │               └────────────────────┘  │
│                   ┌──────────▼────────────┐  ┌────────────────────┐  │
│                   │ Persistência          │  │ Infraestrutura     │  │
│                   │ Drizzle + better-     │  │ PDF, DOCX, XLSX,   │  │
│                   │ sqlite3 (WAL)         │  │ OFX/CSV, backup,   │  │
│                   │ migrações versionadas │  │ criptografia, FS   │  │
│                   └───────────────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Princípios
1. **O renderer nunca toca o banco.** Toda operação passa por um caso de uso no processo principal, que valida permissão, valida dados (Zod, mesmos schemas do frontend), executa em transação e grava auditoria.
2. **Domínio puro e testável.** Regras financeiras ficam em funções sem I/O (`domain/`), cobertas por testes unitários com casos de borda (centavos, pro rata, feriados, juros, arredondamento).
3. **Dinheiro em centavos inteiros** (`INTEGER`). Nunca `float`. Percentuais em *basis points* ou partes por milhão (`INTEGER`). Arredondamento explícito e documentado (half-even para rateios, com distribuição do resíduo na última parcela/beneficiário).
4. **Lançamentos financeiros são imutáveis.** Correção = estorno (lançamento inverso vinculado) + novo lançamento. Nada de `UPDATE`/`DELETE` em movimentos já efetivados.
5. **Idempotência.** Toda geração automática (cobranças mensais, repasses, comissões) usa chave única natural (ex.: `contrato + competência + tipo`). Rodar duas vezes não duplica.
6. **Exclusão lógica** para cadastros (`excluido_em`), com bloqueio quando há vínculos. Exclusão física apenas pelo fluxo LGPD de anonimização.

## 2. Stack e decisões técnicas (ADRs resumidos)

| # | Decisão | Escolha | Motivo |
|---|---------|---------|--------|
| ADR-01 | Shell desktop | **Electron** + `electron-vite` | Requisito; build rápido; HMR no desenvolvimento |
| ADR-02 | UI | **React 18 + TypeScript + Tailwind**, componentes próprios estilo *shadcn/ui* (Radix) | Acessibilidade, consistência, tema claro/escuro via CSS variables |
| ADR-03 | ORM/migrações | **Drizzle ORM + better-sqlite3** (em vez de Prisma) | Prisma no Electron exige empacotar binário do query engine, tem transações interativas assíncronas limitadas no SQLite e aumenta o instalador. better-sqlite3 é síncrono, com transações reais (`db.transaction`), API de backup online nativa e é o padrão de mercado em Electron. Drizzle gera migrações SQL versionadas e revisáveis. |
| ADR-04 | Criptografia do banco | **SQLCipher** via `better-sqlite3-multiple-ciphers`; chave guardada com **Electron `safeStorage`** (DPAPI do Windows) | Protege dados pessoais e bancários se o arquivo for copiado. Ver Q22. |
| ADR-05 | Hash de senha | **Argon2id** (`@node-rs/argon2`, binário pré-compilado p/ Windows) | Recomendação OWASP atual |
| ADR-06 | Validação | **Zod** compartilhado (frontend + backend) | Uma única fonte de verdade para regras de formulário |
| ADR-07 | PDF | `webContents.printToPDF` de HTML renderizado offline | Fidelidade visual, fontes embarcadas, sem dependência externa |
| ADR-08 | DOCX | `docx` (geração) a partir do mesmo modelo estruturado | Modelos editáveis em editor rico (TipTap) armazenados em JSON → exportados para HTML/PDF e DOCX |
| ADR-09 | XLSX | `exceljs` | Relatórios com formatação, fórmulas e logotipo |
| ADR-10 | Gráficos | `recharts` | Leve, React-nativo |
| ADR-11 | OFX/CSV | Parser próprio OFX 1.x (SGML) e 2.x (XML) + `papaparse` com perfis de mapeamento por banco | Bancos brasileiros variam muito; precisamos controlar o parser |
| ADR-12 | Testes | **Vitest** (domínio e casos de uso com SQLite em memória) + **Playwright** (E2E do Electron) | Rápidos, TypeScript nativo |
| ADR-13 | Instalador | `electron-builder` → **NSIS** (.exe), auto-update desativado (offline) | Padrão; permite escolher pasta de dados |
| ADR-14 | Integrações futuras | Tabela **outbox** de eventos de domínio + interfaces de "portas" (e-mail, WhatsApp, portais) | Integrações poderão ser plugadas sem alterar o núcleo |
| ADR-15 | Contabilidade interna | **Razão de partidas dobradas simplificado** por baixo de títulos/baixas | Única forma robusta de separar recursos próprios × de terceiros e rastrear cada centavo (detalhe em `02-modelo-de-dados.md` §6) |

## 3. Estrutura do repositório

```
status-erp/                     # pacote único (ver ADR-17)
├─ src/
│  ├─ main/                     # processo principal
│  │  ├─ ipc/                   # roteador RPC, middleware auth/RBAC/validação
│  │  ├─ modules/               # um diretório por módulo de negócio
│  │  │  ├─ seguranca/          # usuários, perfis, sessões, auditoria
│  │  │  ├─ pessoas/
│  │  │  ├─ imoveis/
│  │  │  ├─ locacoes/
│  │  │  ├─ financeiro/         # razão, títulos, baixas, tesouraria, conciliação
│  │  │  ├─ vendas/
│  │  │  ├─ crm/
│  │  │  ├─ documentos/
│  │  │  ├─ manutencao/
│  │  │  ├─ relatorios/
│  │  │  └─ backup/
│  │  │     └─ (cada módulo: domain/ · application/ · repository/ · ipc.ts)
│  │  ├─ infra/                 # db, crypto, fs de anexos, pdf, docx, xlsx, ofx, logger
│  │  └─ index.ts
│  ├─ preload/                  # contextBridge: expõe só `statusErp.rpc(metodo, entrada)`
│  ├─ renderer/                 # React
│     ├─ app/ (rotas, layout, menu lateral, tema)
│     ├─ components/ui/         # design system Status
│     └─ features/<módulo>/     # telas por módulo
│  └─ shared/                   # schemas Zod, DTOs, contrato RPC, permissões, validadores
├─ db/migrations/               # SQL versionado (0001_*.sql …)
├─ assets/brand/                # logotipos oficiais (fornecidos pela Status)
├─ tests/ (e2e)
└─ docs/ (ADRs, manuais)
```

## 4. Segurança e LGPD (desenho)

- **Electron endurecido:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP restritiva, sem `remote`, navegação externa bloqueada, só um canal IPC com lista branca de métodos.
- **Autenticação:** Argon2id; política de senha; bloqueio após N tentativas; troca obrigatória no 1º acesso; **bloqueio de tela por inatividade** (configurável, padrão 10 min) exigindo senha.
- **RBAC:** perfis (Administrador, Gerente, Financeiro, Corretor, Atendimento, Consulta) × permissões granulares (`financeiro.baixa.criar`, `pessoas.dados_bancarios.ver`, …). Corretor vê apenas a própria carteira (configurável).
- **Dados sensíveis:** banco cifrado (SQLCipher); anexos cifrados em disco (AES-256-GCM); dados bancários mascarados na UI salvo permissão explícita; toda visualização de dado bancário completo é auditada.
- **Auditoria:** tabela append-only com encadeamento de hash (cada registro contém o hash do anterior → adulteração detectável). Registra usuário, ação, entidade, antes/depois **com redação** de campos sensíveis (senhas nunca; dados bancários mascarados).
- **Logs técnicos:** arquivo rotativo local, com filtro de redação automático; nunca contém senha, token, conta bancária completa ou CPF completo.
- **Prevenção de exclusão acidental:** exclusão lógica, confirmação com digitação para itens críticos, bloqueio por integridade referencial (FKs `ON DELETE RESTRICT`).
- **LGPD:** cadastro de base legal/consentimento por pessoa, relatório "dados do titular", anonimização (não exclusão) quando há obrigação legal de guarda (contratos/financeiro — ver Q24).

## 5. Backup e recuperação (desenho)

- Snapshot via **`VACUUM INTO`** (transação de leitura consistente, mesmo com gravações em andamento; mantém a cifragem SQLCipher) — nunca cópia simples do arquivo. Ver ADR-16.
- Pacote `.sbak` = ZIP contendo: banco, anexos, modelos de documentos, configurações, `manifest.json` (versão do app, versão do schema, data, SHA-256 de cada arquivo). Pacote cifrado com **senha de backup** (Argon2id → AES-256-GCM), para poder ser restaurado em outro computador.
- Validação: após gerar, reabre o banco do backup, executa `PRAGMA integrity_check` e confere hashes.
- Automático: agendado (ex.: diário ao fechar o app / a cada X horas), retenção configurável (ex.: 7 diários, 4 semanais, 12 mensais), destino local + unidade externa/pasta de rede.
- Restauração assistida: escolhe arquivo → valida → mostra resumo (data, versão, contagens) → cria backup de segurança do estado atual → restaura → aplica migrações se o backup for de versão anterior.

## 6. Identidade visual

- Paleta: preto `#0A0A0A`, branco, escala de cinzas neutros; **cor de destaque discreta** sugerida: verde-petróleo `#0F766E` (positivo/ações) e âmbar/vermelho apenas para alertas e atrasos. Aguardando confirmação (Q27).
- Tipografia: **Inter** (embarcada, offline), números tabulares em tabelas financeiras.
- Layout: menu lateral recolhível, cabeçalho com busca global e usuário, cartões de indicadores, tabelas com filtros/ordenação/exportação.
- Logotipo usado apenas como arquivo original (SVG/PNG), sem recolorir nem distorcer; versões claro/escuro **somente se fornecidas** pela Status.
- **Pendência:** os logotipos não foram anexados a esta sessão (Q26).
