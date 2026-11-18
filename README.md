# APSA — Portal de Relações com Investidores

Site estático de Relações com Investidores da **Algodoeira Palmeirense Sociedade Anônima – APSA**
(CNPJ nº 12.505.731/0001-78 · NIRE 35300453671 · Companhia fechada · Rancharia – SP),
construído a partir das Demonstrações Financeiras de 31/12/2025.

## Páginas

| Página | Conteúdo |
|---|---|
| `index.html` | Início: destaques, indicadores e alerta de continuidade operacional |
| `a-companhia.html` | Perfil, dados cadastrais, administração e linha do tempo |
| `informacoes-financeiras.html` | Indicadores, gráficos e BP, DRE/DRA, DMPL e DFC interativos |
| `notas-explicativas.html` | As 20 notas explicativas com índice |
| `central-de-resultados.html` | Download do PDF, Relatório da Administração e eventos subsequentes |
| `contato.html` | Formulário e canal de atendimento ao acionista |

## Estrutura

- `assets/js/data.js` — números das demonstrações (fonte única para as tabelas) e **dados de contato do RI**
- `assets/js/main.js` — cabeçalho/rodapé, tabelas, abas e gráficos (sem dependências)
- `assets/css/style.css` — estilos
- `documentos/` — PDF oficial das demonstrações

## Como visualizar

```bash
python3 -m http.server 8000
```

Acesse http://localhost:8000. Para publicar, basta servir a pasta (ex.: GitHub Pages a partir da raiz).

## Pendências

- Preencher `contato.email` e `contato.telefone` em `assets/js/data.js` (o formulário envia por `mailto:`).
