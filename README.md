# AGRO S – Controle Interno

Sistema web de controle interno da AGRO S (revenda de defensivos agrícolas):
pedidos de venda, relatórios, ficha de emissão de NF-e, duplicatas, contratos e
cadastros. Roda em um computador/servidor da empresa e é acessado pelo navegador
(computador, notebook ou celular).

## Instalação rápida

1. Instale o Node.js 22.13 ou superior (https://nodejs.org).
2. Na pasta do sistema: `npm install`
3. Copie `.env.example` para `.env` e ajuste (opcional).
4. Inicie: `npm start` e abra `http://localhost:3000`.

No primeiro acesso, o sistema pede para criar o administrador (nome, e-mail e
CPF). A senha inicial é o CPF (somente números); depois do primeiro login o
sistema pede uma senha pessoal.
