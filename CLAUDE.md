# AGRO S – Controle Interno

PROJETO: sistema web de controle interno para uma revenda de defensivos
agrícolas (empresa AGRO S, "Sustentabilidade no Agro", região de Paraguaçu
Paulista/SP). Roda em servidor interno (rede do escritório).

## Stack
- Node.js 22.13+ com Express e banco SQLite embutido (`node:sqlite`, sem
  dependências nativas). Variáveis de ambiente lidas com `process.loadEnvFile`.
- Front-end em HTML, CSS e JavaScript puros (módulos ES, sem build, sem
  framework), servido pelo próprio Express.
- Nodemailer para e-mail.

## Identidade visual
- Logo: `public/img/logo.svg` e `public/img/logo.png` (máx. 400 px de largura).
  A logo atual é PROVISÓRIA (o arquivo original `logo-original.webp` não foi
  fornecido); quando chegar, extrair as cores reais e substituir.
- Paleta (variáveis CSS em `public/style.css`):
  `--verde-escuro: #1e5631` (texto AGRO), `--verde-vivo: #3fa535` (quadrado S e
  frase), `--verde-claro: #eaf5e6`.

## Regras gerais
- Interface 100% em português do Brasil. Datas dd/mm/aaaa, moeda R$ (pt-BR).
- Layout responsivo: menu lateral no desktop/notebook, menu em gaveta no
  celular, tabelas viram cartões em telas pequenas, botões grandes para toque.
  Testar nas larguras 360, 768 e 1280 px.
- Segurança: senhas com hash scrypt, sessão em cookie HttpOnly, limite de
  tentativas de login, validação de tudo no servidor, sem onclick inline
  (CSP `script-src 'self'`).
- Validar CPF e CNPJ (dígitos verificadores) no servidor e no navegador
  (`lib/validacao.js` é compartilhado: servido também em `/lib/validacao.js`).
- Perfis: admin (tudo), financeiro (pedidos, NF, duplicatas, contratos,
  relatórios) e vendedor (só seus pedidos, clientes, produtos e seus relatórios).
- Valores monetários guardados em centavos (inteiros) no banco.
- Datas guardadas como texto ISO `aaaa-mm-dd` no banco; formatadas na tela.

## Organização
- `server.js` – app Express, segurança, montagem das rotas.
- `db.js` – conexão e esquema SQLite (`data/agrocontrol.db`).
- `lib/` – regras puras e testáveis (validação, extenso, parcelas, chave NF-e,
  permissões, relatórios, e-mail, senhas).
- `routes/` – rotas da API (`/api/...`) por módulo.
- `public/` – `index.html`, `style.css`, `js/` com um script por módulo.
- `scripts/` – demo, backup, iniciar.
- `test/` – testes `node --test`.

## Comandos
- `npm start` – inicia o servidor (porta 3000 por padrão).
- `npm test` – testes automatizados.
- `npm run demo` – popula dados fictícios.
