# LCDPR — leiaute 1.3: regras extraídas para o desenvolvimento

Fonte: leiaute LCDPR 1.3 (`referencias/leiaute-lcdpr-1-3.xlsx`) e Manual de Preenchimento, Anexo ao ADE COPES nº 1/2020 (`referencias/manual-lcdpr-1-3.pdf`). O manual declara validade **a partir do ano-calendário de 2019**.

A definição campo a campo, legível por máquina, está em [`leiaute-1.3.json`](leiaute-1.3.json). Ela é gerada da planilha oficial e deve ser a única fonte usada pelo gerador e pelo validador. Este documento resume as regras do manual que **não** aparecem na planilha.

## 1. Formato do arquivo (manual, cap. 2)

| Item | Regra |
|------|-------|
| Codificação | Texto "ASCII UTF-8"; sem packed, zonado, binário ou ponto flutuante |
| Linha | Começa na coluna 1 com o código do registro, **sem** `|` inicial |
| Delimitador | `|` ao final de cada campo, **exceto o último**; campo vazio = `||` |
| Fim de linha | CR LF (`\r\n`) em todas as linhas |
| Texto (C) | Qualquer caractere exceto `|` e ASCII 0–31; máximo de 255 quando o tamanho é `-` |
| Numérico (N) | Somente algarismos; sem separador de milhar, decimal, sinal ou `%` |
| Decimais | Quantidade fixa: R$ 1.255,42 → `125542`; 10.000 → `1000000`; 50% → `05000`; arredondar para 2 casas |
| Zero com 2 decimais | `000` (o manual aceita `0` em campos sem decimais) |
| Data | `ddmmaaaa` |
| Período | `mmaaaa` |
| Códigos (CPF, CNPJ, CEP...) | Todos os dígitos, com zeros à esquerda, sem máscara; tamanho exato |
| Número de documento | Como no original, **mantendo** pontuação (`2002/123456-78`) |

## 2. Ordem e obrigatoriedade

```
0000  abertura                                   O  1:1
0010  parâmetros de tributação                    O  1:1
0030  dados cadastrais                            O  1:1
0040  imóvel rural / exploração                   O  1:N
  0045  terceiros (logo após o seu 0040)          O se PARTICIPACAO < 100% ou TIPO_EXPLORACAO ≠ 1
0050  contas bancárias                            O  1:N
Q100  lançamentos                                 O  1:N (a aba do registro indica 0:N)
Q200  resumo mensal                               O  1:N (a aba do registro indica 0:N)
9999  contador e encerramento                     O  1:1
```

## 3. Regras por registro

### 0000 — abertura
- `COD_VER` = `0013` para o leiaute 1.3.
- A escrituração é identificada por `CPF` + `DT_FIN`.
- `IND_SIT_INI_PER`: 0 regular, 1 início de atividades no ano, 2 início de obrigatoriedade no curso do ano.
- `SIT_ESPECIAL`: 0 normal, 1 falecimento, 2 espólio, 3 saída definitiva do país; `DT_SIT_ESP` quando ≠ 0.
- Exemplo: `0000|LCDPR|0013|11111111191|JOSÉ DA SILVA|0|0||01012019|31122019`

### 0010 — forma de apuração
- 1 = Livro Caixa; 2 = 20% da receita bruta (art. 5º da Lei 8.023/1990).

### 0030 — dados cadastrais
- `UF` e `COD_MUN` (IBGE, 7 dígitos) seguem a tabela externa do SPED; `CEP` com 8 dígitos; `EMAIL` obrigatório.

### 0040 — imóveis rurais
- `COD_IMOVEL` com 3 dígitos (`001`), sequencial.
- **Mudança de exploração no ano** (individual → condomínio, ou alteração de percentuais) gera **um novo 0040 do mesmo imóvel** para cada alteração. Cada 0040 é, na prática, um *período de exploração* com código próprio, e os Q100 apontam o código vigente na data.
- `CAD_ITR` = CAFIR com DV (8 dígitos), obrigatório para imóvel em zona rural no Brasil.
- `CAEPF` (14 dígitos) obrigatório na exploração individual e, na coletiva, para o primeiro titular ou representante.
- `INSCR_ESTADUAL` é N 14: somente dígitos.
- `TIPO_EXPLORACAO`: 1 individual (imóvel próprio), 2 condomínio, 3 arrendado, 4 parceria, 5 comodato, 6 outros.
- `PARTICIPACAO`: N 5 com 2 decimais (`05000` = 50%).

### 0045 — terceiros
- Filho do 0040: aparece **logo após** o 0040 a que se refere.
- `TIPO_CONTRAPARTE`: 1 condômino, 2 arrendador, 3 parceiro, 4 comodante, 5 outros.
- `ID_CONTRAPARTE` com 11 (CPF) ou 14 (CNPJ) dígitos; `PERC_CONTRAPARTE` N 5,2.

### 0050 — contas bancárias
- Contas individuais ou conjuntas usadas na atividade rural. Também entram contas de sociedade de que o produtor participe por contrato registrado, desde que um dos parceiros seja titular.
- `COD_CONTA` com 3 dígitos; `000` e `999` são reservados (ver Q100) e não devem ser cadastrados no 0050.
- `BANCO` = código de compensação (3 dígitos); `AGENCIA` com 4 dígitos, **sem** DV; `NUM_CONTA` até 16 dígitos, **com** DV, sem máscara (exemplo do manual: `0000000123456789`).

### Q100 — demonstrativo do resultado
- **`SLD_FIN` não é saldo bancário.** É o resultado acumulado (receitas − despesas) do LCDPR: começa em **zero** no início de cada ano, e o último Q100 traz o resultado do período. Valor sempre sem sinal; a natureza vai em `NAT_SLD_FIN` (`P` ou `N`).
- `DATA` = data da entrada ou saída efetiva do recurso (regime de caixa).
- `COD_CONTA`: código do 0050; `000` = espécie; `999` = **numerário em trânsito**, quando o valor não passou por conta do 0050 nem foi pago em espécie. Exemplos do manual: contas de outros condôminos, financiamento pago direto ao fornecedor, permuta de ativos.
- `COD_IMOVEL`:
  - despesa de vários imóveis: atribuir ao imóvel principal ou ratear (uso direto ou atribuição indireta);
  - despesa comum de condomínio/parceria que abrange vários imóveis: pode usar `000` e identificar o condomínio/parceria no `HIST`.
- Em exploração não individual, os valores lançados respeitam o `0040.PARTICIPACAO` (cota do produtor), e o `HIST` explica a composição do total.
- `TIPO_DOC`: 1 nota fiscal, 2 fatura, 3 recibo, 4 contrato, 5 folha de pagamento, 6 outros.
- `TIPO_LANC`: 1 receita da atividade rural; 2 despesas de custeio e investimentos; 3 receita de produtos entregues no ano referente a adiantamento de recursos.
- `ID_PARTIC`:
  - folha: CPF de cada trabalhador ou, pelo total, o CPF do próprio produtor;
  - tributos: CPF/CNPJ do **sujeito passivo** do tributo;
  - importação/exportação direta com estrangeiro: CPF do próprio produtor, e `NUM_DOC` = nº da DI/DE (fora do Mercosul) ou da nota fiscal (Mercosul).
- Exemplo: `Q100|02012019|001|001|2|3|Venda de 100 sacas de milho|12345678912|1|1000000|000|1100000|P`

### Q200 — resumo mensal
- Gerado a partir dos Q100. `MES` em `mmaaaa`.
- `SLD_FIN` é cumulativo: saldo do mês + saldo final do mês anterior.
- Validação: Σ Q100 do mês = `VL_ENTRADA`/`VL_SAIDA` do Q200; `SLD_FIN` do último Q100 do mês = `SLD_FIN` do Q200.

### 9999 — encerramento
- Dados do contador (opcionais) e `QTD_LIN` = **total de linhas do arquivo, incluindo o próprio 9999**.

## 4. Fora do arquivo

- Atividade rural no exterior não entra no LCDPR; vai direto à DIRPF.
- Compensação de prejuízo de anos anteriores é feita na DIRPF, não no LCDPR.
- O arquivo é assinado com certificado ICP-Brasil e transmitido pelo programa oficial da RFB; o app apenas gera o TXT.
- Obrigatoriedade: receita bruta total da atividade rural (todas as unidades exploradas) **superior ao limite** fixado para o ano. O manual não traz o valor; ele vem da IN SRF 83/2001, com as alterações das IN RFB 1.848/2018 e 1.903/2019. Abaixo do limite, a entrega é facultativa. Multa por atraso, omissão ou incorreção: art. 57 da MP 2.158-35/2001.

## 5. Inconsistências do material oficial a tratar no validador

| Ponto | Divergência | Decisão proposta |
|-------|-------------|------------------|
| Ocorrência do Q100/Q200 | Tabela geral: `O [1:N]`; aba do registro: `0:N` | Exigir ao menos 1 Q100; gerar Q200 para cada mês que tenha Q100 |
| Zero em campo com 2 decimais | Regra geral: `000`; exemplo do Q100 usa `0` | Gerar `000` (opção configurável) |
| Exemplo do Q200 | Mostra espaços antes dos valores (`| 8500000`) | Nunca gerar espaços; tratar como erro de digitação do manual |
| Nível do 0000 | Planilha: 1; manual: 0 | Irrelevante para o arquivo |
| Natureza do saldo zero | Não definida | Usar `P` |
| Campos N com tamanho | Códigos exigem tamanho exato; valores monetários (N 19) usam tamanho máximo | Preencher códigos com zeros à esquerda; valores sem zeros à esquerda |
