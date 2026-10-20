# AGRO S – Controle Interno

Sistema web de controle interno da **AGRO S – Sustentabilidade no Agro** (revenda de
defensivos agrícolas, Paraguaçu Paulista/SP). Funciona no navegador do computador,
notebook e celular, com o servidor instalado em um computador da empresa.

## O que o sistema faz

| Módulo | Quem usa | Resumo |
|---|---|---|
| Início | todos | Vendas do mês, pedidos a aprovar, aprovados sem nota, duplicatas vencidas e a vencer em 7 dias |
| Pedidos | todos (vendedor vê só os seus) | Pedido em campo, itens com preço editável, condição de pagamento, resumo por WhatsApp, impressão |
| Relatórios | todos (vendedor vê só os seus) | Por dia, semana, quinzena, mês, trimestre, semestre ou ano; gráfico, rankings, CSV e impressão |
| Notas fiscais | admin e financeiro | Ficha de emissão para digitar na Conta Azul Pro, registro da NF emitida (chave conferida), cancelamento |
| Duplicatas | admin e financeiro | Geração por parcela, boleto, baixa, protesto, impressão A4 (duas por folha) |
| Contratos | admin e financeiro | Contrato de compra ou venda com cláusulas, testemunhas e impressão numerada |
| Clientes / Produtos | todos (produtos: só admin e financeiro editam) | Cadastros com CPF/CNPJ validado e dados fiscais por produto |
| Colaboradores / Configurações | admin | Usuários e perfis, dados da empresa, padrões de cobrança e logo |

> **A NF-e não é emitida por este sistema.** A emissão oficial continua na Conta Azul Pro;
> aqui ficam a ficha com os dados prontos e o controle das notas emitidas.

## Instalação

Requisito: **Node.js 22.13 ou superior** (https://nodejs.org).

```bash
npm install          # instala as dependências (Express e Nodemailer)
cp .env.example .env # opcional: porta, e-mail (SMTP) etc.
npm start            # inicia em http://localhost:3000
```

No **primeiro acesso** o sistema pede nome, e-mail e CPF do administrador. A senha
inicial de todo usuário é o **CPF (somente números)**; o login aceita o CPF com ou sem
pontuação. Por segurança, no primeiro login o sistema pede uma senha pessoal
(pode ser desligado em Configurações, mas não é recomendado).

Para instalar no servidor do escritório (iniciar sozinho, IP fixo, firewall, backup
diário e acesso dos vendedores pela internet), siga o guia
[docs/INSTALACAO-SERVIDOR.md](docs/INSTALACAO-SERVIDOR.md).

### Variáveis de ambiente (`.env`)

| Variável | Para que serve |
|---|---|
| `PORT` | Porta do sistema (padrão 3000) |
| `SESSION_SECRET` | Segredo das sessões. Se vazio, é gerado e guardado em `data/session_secret` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | E-mail para o código de "Esqueci minha senha". Sem `SMTP_HOST`, o código aparece no terminal do servidor |
| `DB_PATH` | (opcional) caminho do banco; padrão `data/agrocontrol.db` |

## Dados de demonstração

```bash
npm run demo             # só com o banco vazio
npm run demo -- --limpar # guarda uma cópia do banco atual e recria com dados fictícios
```

Cria 1 administrador, 1 financeiro, 3 vendedores, 10 clientes, 15 produtos e 60
pedidos espalhados nos últimos 12 meses (com notas e duplicatas). Os e-mails e senhas
aparecem no terminal.

## Testes

```bash
npm test
```

Cobrem validação de CPF/CNPJ, valor por extenso, geração de parcelas (arredondamento na
última), chave da NF-e, linha digitável, ficha fiscal, relatórios por quinzena,
trimestre e semestre, e as regras de permissão por perfil (inclusive pela API).

## Backup

Todos os dados ficam no arquivo `data/agrocontrol.db`. Faça cópia diária com
`npm run backup` (guarda os últimos 30 em `backup/`). Restauração: veja o guia de
instalação.

## Segurança

- Senhas com hash scrypt; sessão de 12 horas em cookie HttpOnly.
- Bloqueio de 10 minutos após 8 tentativas de login erradas.
- Código de redefinição de 6 dígitos, válido por 15 minutos e com no máximo 5 tentativas.
- Política de segurança de conteúdo (CSP `script-src 'self'`), sem scripts embutidos.
- Toda regra (permissões, totais, validações) é conferida no servidor.
- O sistema guarda CPF e dados de clientes (LGPD): mantenha o acesso por perfil, os
  backups protegidos e use HTTPS ou VPN no acesso externo.

## Antes de usar em produção

1. **Duplicata e contrato** seguem os requisitos da Lei 5.474/1968 e cláusulas usuais,
   mas são **modelos**: peça ao advogado da empresa para revisar.
2. **Tributação** (CST/CSOSN, alíquota, redução de base, PIS/COFINS, CFOP) é definida
   por produto pelo contador; o sistema não presume nada.
3. **Logo**: a logo atual é provisória. Envie a definitiva em Configurações (ou troque
   `public/img/logo.png` e `public/img/logo.svg`).

## Estrutura

```
server.js        servidor Express (segurança, rotas, arquivos estáticos)
db.js            banco SQLite (node:sqlite) e esquema
lib/             regras: validação, parcelas, extenso, chave NF-e, boleto, ficha, relatórios, contrato
routes/          API por módulo
public/          index.html, style.css e js/ (um script por módulo)
scripts/         demo, backup e inicialização
test/            testes automatizados (node --test)
```
