# Prompt técnico — Escrituração e gestão financeira do produtor rural PF (v1)

> Versão 1 do prompt técnico para orientar o desenvolvimento do aplicativo.
> Os itens marcados como **[confirmar]** dependem de verificação na legislação do
> ano-calendário e não devem ser fixados no código.
>
> Referências do LCDPR neste repositório:
> - [`lcdpr/leiaute-1.3.md`](lcdpr/leiaute-1.3.md) — regras do manual relevantes para o desenvolvimento;
> - [`lcdpr/leiaute-1.3.json`](lcdpr/leiaute-1.3.json) — definição campo a campo, gerada da planilha oficial;
> - [`lcdpr/referencias/`](lcdpr/referencias/) — planilha do leiaute 1.3 e manual de preenchimento (ADE COPES nº 1/2020).

---

## 1. Papel e objetivo

Você é responsável por projetar e implementar um aplicativo **desktop para Windows**, instalado e executado localmente, destinado à escrituração e gestão financeira de **produtores rurais pessoa física**. O aplicativo deve:

1. organizar documentos fiscais e extratos bancários por produtor;
2. conciliar as movimentações bancárias com os documentos que as justificam;
3. classificar receitas, despesas e movimentações não operacionais;
4. gerar relatórios financeiros rastreáveis;
5. preparar, validar e gerar o arquivo do **LCDPR** (Livro Caixa Digital do Produtor Rural).

O usuário principal é um contador ou escritório contábil que atende vários produtores.

## 2. Princípios obrigatórios

Estes princípios prevalecem sobre qualquer decisão de implementação:

| # | Princípio | Consequência prática |
|---|-----------|----------------------|
| P1 | **Funciona offline** | Importação, OCR, conciliação, relatórios e geração do LCDPR rodam sem internet. |
| P2 | **Nenhum dado sai da máquina** | Proibido enviar documentos ou dados financeiros a APIs, nuvem, OCR on-line ou telemetria. Atualizações de tabelas (alíquotas, leiautes) são importadas manualmente pelo usuário. |
| P3 | **Separação por produtor** | Todo dado pertence a exatamente um produtor. Nenhuma tela, consulta ou relatório mistura produtores. |
| P4 | **Extração automática não é dado confirmado** | Tudo que vem de OCR, PDF ou sugestão do sistema nasce com status `pendente de revisão` e só passa a valer após confirmação explícita do usuário. |
| P5 | **XML tem prioridade** | Quando houver XML da NF-e/NFP-e, os dados estruturados do XML prevalecem sobre PDF/imagem do mesmo documento. |
| P6 | **Extrato é a base do caixa** | Entradas e saídas de dinheiro efetivo são as do extrato bancário (ou de lançamento manual de conta/caixa justificado). |
| P7 | **Sem vínculo por coincidência** | Igualdade de valor ou data gera, no máximo, uma *sugestão*. O vínculo definitivo exige ação do usuário. |
| P8 | **Banco ≠ fiscal** | A movimentação observada no banco e a composição fiscal da operação (bruto, retenções, líquido) são registradas e exibidas separadamente. |
| P9 | **Nada de presunção tributária** | Não presumir FUNRURAL em toda venda, nem lançar retenção automaticamente como entrada, saída ou despesa. Não presumir obrigatoriedade de entrega do LCDPR. |
| P10 | **Rastreabilidade total** | Todo total de relatório deve poder ser aberto até os lançamentos e documentos originais que o compõem. |
| P11 | **Original preservado** | O arquivo original importado é guardado sem alteração, com hash, e pode ser aberto a partir do lançamento. |

## 3. Arquitetura e tecnologia

### 3.1 Stack recomendada

| Camada | Escolha | Observação |
|--------|---------|------------|
| Linguagem | Python 3.12 | Ecossistema maduro para PDF, OCR, OFX e Excel. |
| Interface | PySide6 (Qt 6) | Nativo no Windows, sem navegador embutido. |
| Banco | SQLite (modo WAL) via SQLAlchemy 2 + Alembic | Migrações versionadas. |
| OCR | Tesseract 5 com idioma `por`, empacotado no instalador | Nenhuma chamada externa. |
| PDF (texto) | pdfplumber / pypdf; pypdfium2 para rasterizar páginas para OCR | Tentar texto nativo antes do OCR. |
| XML NF-e | lxml com validação por XSD quando disponível | |
| OFX | parser próprio tolerante (OFX 1.x SGML e 2.x XML) ou `ofxtools` | Bancos brasileiros fogem ao padrão com frequência. |
| Excel | openpyxl | |
| PDF (saída) | ReportLab | |
| Empacotamento | PyInstaller + Inno Setup | Instalador `.exe`, instalação por usuário, sem privilégio de administrador quando possível. |
| Testes | pytest | |

Alternativa aceitável: .NET 8 + WPF + EF Core + Tesseract.NET. Escolha uma stack e mantenha-a; não misture.

### 3.2 Camadas

```
ui/            telas Qt, sem regra de negócio
app/           casos de uso (importar, conciliar, gerar LCDPR...)
domain/        entidades, regras, validações, cálculos
infra/         banco, arquivos, OCR, parsers, exportadores
lcdpr/         leiautes versionados, gerador e validador
reports/       consultas de relatório + renderizadores PDF/Excel
```

Regras: a camada `domain` não depende de Qt nem de SQLAlchemy; valores monetários usam `Decimal` (nunca `float`), com arredondamento `ROUND_HALF_EVEN` apenas na apresentação/exportação e conforme o leiaute.

### 3.3 Armazenamento e separação dos produtores

```
%LOCALAPPDATA%\<NomeApp>\
  catalogo.db                      lista de produtores, configurações globais, tabelas de alíquotas e leiautes
  produtores\<uuid-produtor>\
    dados.db                       todos os dados do produtor
    documentos\AAAA\MM\<sha256>.<ext>   originais imutáveis
    exportacoes\                   LCDPR e relatórios gerados
  backups\
  logs\                            sem dados financeiros em texto aberto
```

- **Um banco por produtor** reforça a separação (P3) e simplifica backup e restauração individuais.
- O usuário seleciona o produtor antes de qualquer importação ou registro; a seleção fica visível em todas as telas.
- Diretório de dados configurável (ex.: pasta em rede local do escritório), mas sem sincronização em nuvem embutida.

### 3.4 Backup, restauração e histórico

- Backup manual e agendado (ao fechar o app, diário) em arquivo `.zip` contendo `dados.db` (via API de backup do SQLite, nunca cópia a quente), originais e manifesto com hashes. Opção de senha (AES-256).
- Restauração por produtor, com prévia (data, quantidade de documentos e lançamentos) e cópia de segurança automática do estado atual antes de sobrescrever.
- **Histórico de alterações**: tabela `auditoria` com usuário do Windows, data/hora, entidade, id, operação (`criar`, `alterar`, `excluir`, `confirmar`, `vincular`, `desvincular`), valores antes/depois em JSON. Exclusão de registro confirmado é lógica.
- Períodos podem ser **fechados**; alterar lançamento em período fechado exige reabertura justificada e registrada.

## 4. Modelo de dados (mínimo)

Todas as tabelas de `dados.db` pertencem a um único produtor.

| Entidade | Campos principais |
|----------|-------------------|
| `produtor` (catálogo) | id, CPF, nome, endereço completo, código IBGE do município, CEP, telefone, e-mail, situação especial e data, forma de apuração, contador responsável (nome, CPF/CNPJ, CRC, e-mail, telefone) |
| `imovel_rural` | id, país (BR), moeda (BRL), CAFIR com DV (CAD_ITR, 8 dígitos), CAEPF (14), inscrição estadual (somente dígitos), nome (até 50), endereço, número, complemento, bairro/distrito, UF, município IBGE, CEP |
| `exploracao_imovel` | imóvel, **código LCDPR (3 dígitos, sequencial)**, tipo de exploração (1 individual, 2 condomínio, 3 arrendado, 4 parceria, 5 comodato, 6 outros), percentual de participação do produtor, início e fim de vigência. Cada mudança de exploração ou de percentual no ano gera um novo período com código próprio (um registro 0040 por período) |
| `terceiro_exploracao` | período de exploração, tipo de contraparte (1 condômino, 2 arrendador, 3 parceiro, 4 comodante, 5 outros), CPF/CNPJ, nome (até 50), percentual (base do 0045) |
| `conta_bancaria` | id, código LCDPR (3 dígitos; `000` e `999` reservados), país, código de compensação do banco (3), nome do banco (até 30), agência (4, sem DV), número com DV (até 16), tipo (corrente, poupança, investimento), imóvel padrão, saldo de abertura e data |
| `conta_especial` | contas fixas do sistema, não cadastráveis: **Espécie** (LCDPR `000`) e **Numerário em trânsito** (LCDPR `999`: valores que não passaram por conta do produtor, como financiamento pago direto ao fornecedor, conta de outro condômino ou permuta) |
| `participante` | CPF/CNPJ, nome, tipo (cliente, fornecedor, ambos), UF, validação de dígito |
| `documento` | tipo (NF-e venda, NF-e compra, NFP-e, nota avulsa, recibo, contrato, fatura, folha, outro), número, série, chave de acesso, emissão, participante, imóvel, valor bruto, origem (`xml`, `pdf`, `imagem`, `manual`), status (`pendente_revisao`, `confirmado`, `cancelado`), arquivo original |
| `documento_item` | produto/serviço, CFOP, NCM, quantidade, unidade, valor |
| `retencao` | documento, tipo (FUNRURAL/contribuição previdenciária, SENAR, RAT/GILRAT, IR, outra), base, alíquota, valor sugerido, valor documentado, fonte (`documento`, `calculado`, `manual`), status (`sugerida`, `conferida`) |
| `arquivo_original` | sha256, nome original, tipo MIME, tamanho, data de importação, caminho |
| `extrato_importacao` | conta, arquivo, período, saldo inicial e final informados pelo banco |
| `movimento_bancario` | conta, data, valor (com sinal), histórico do banco, documento do banco (FITID/nº), hash de deduplicação, origem, status de conciliação, justificativa de pendência |
| `conciliacao` | movimento, tipo de vínculo, observação, usuário, data |
| `conciliacao_item` | conciliação, documento (opcional), valor alocado |
| `lancamento` | data do recurso, conta (ou `000`/`999`), período de exploração do imóvel (ou `000` para despesa comum de condomínio/parceria), documento (número como no original e tipo LCDPR: 1 NF, 2 fatura, 3 recibo, 4 contrato, 5 folha, 6 outros), participante, tipo (1 receita da atividade, 2 despesa de custeio e investimento, 3 receita de produto entregue referente a adiantamento, ou não operacional), categoria, histórico, valor total da operação, percentual do produtor, **valor da cota do produtor**, origem (movimento bancário), indicador `entra_no_lcdpr`, status |
| `categoria` | plano de categorias financeiras configurável, com natureza (receita da atividade, despesa de custeio, investimento, financeira, patrimonial, neutra) |
| `aliquota_vigencia` | tipo de retenção, alíquota, início e fim de vigência, base legal (texto), regra de aplicação (ex.: venda a PJ adquirente) |
| `periodo_fechamento` | ano, mês, status, usuário, data |
| `auditoria` | ver 3.4 |

## 5. Funcionalidades

### 5.1 Produtores, imóveis e contas

- CRUD de produtor, imóvel rural, períodos de exploração, terceiros e conta bancária, com validação de CPF/CNPJ, CEP, UF e código IBGE (tabelas do SPED de países, UF e municípios embarcadas) e dos tamanhos do leiaute.
- Ao cadastrar exploração com participação menor que 100% ou tipo diferente de "individual", exigir os terceiros (0045) e conferir se a soma dos percentuais fecha em 100%.
- O CAEPF é exigido na exploração individual e, na coletiva, quando o produtor for o primeiro titular ou o representante.
- As contas especiais **Espécie (000)** e **Numerário em trânsito (999)** existem em todo produtor, não aparecem no 0050 e não têm extrato bancário.
- Tela inicial exige produtor selecionado; troca de produtor fecha telas abertas do anterior.

### 5.2 Importação de documentos

1. Usuário seleciona produtor e arquivos (XML, PDF, JPG/PNG/TIFF; arrastar e soltar; lote).
2. O original é copiado para a pasta do produtor com hash SHA-256; arquivo repetido é detectado pelo hash e pela chave de acesso.
3. Extração:
   - **XML NF-e/NFP-e**: ler emitente, destinatário, chave, número, série, data, itens, CFOP, totais e informações complementares. Validar se o CPF do produtor é emitente ou destinatário; se não for, alertar.
   - **PDF com texto**: extrair texto nativo; se insuficiente, rasterizar e aplicar OCR.
   - **Imagem**: pré-processar (escala de cinza, correção de inclinação, binarização) e aplicar OCR `por`.
   - Reconhecer chave de acesso de 44 dígitos (validar dígito verificador). Se houver XML com a mesma chave, o XML prevalece.
4. **Tela de conferência** lado a lado: original à esquerda, campos extraídos à direita com indicação de confiança e origem de cada campo. Campos de baixa confiança destacados.
5. O documento só fica `confirmado` após o usuário salvar a conferência. Documentos `pendente_revisao` não entram em conciliação definitiva, relatórios de escrituração nem no LCDPR.
6. Cadastro manual com o mesmo formulário e anexo opcional do original.

### 5.3 Importação de extratos

- **OFX**: ler conta, período, saldos e transações (FITID). Verificar se banco/agência/conta do arquivo correspondem à conta selecionada.
- **PDF**: extrair tabelas por texto; OCR quando necessário. Permitir **modelos de leitura por banco** (colunas, formato de data, sinal D/C) reutilizáveis, configurados pelo usuário.
- Prévia obrigatória antes de gravar, com conferência de **saldo inicial + créditos − débitos = saldo final**; divergência bloqueia a gravação até ser explicada ou corrigida.
- Deduplicação por FITID ou por hash (conta + data + valor + histórico + ordem no dia), exibindo possíveis duplicidades para decisão do usuário.
- Movimento manual permitido (com justificativa e anexo opcional).

### 5.4 Conciliação bancária

Cada movimento bancário assume um dos estados:

| Estado | Significado |
|--------|-------------|
| `nao_conciliado` | Ainda não tratado |
| `sugerido` | Sistema encontrou candidatos (não é vínculo) |
| `conciliado_documento` | Vinculado a um ou mais documentos, com soma conferida |
| `transferencia_propria` | Par com movimento de outra conta do mesmo produtor |
| `classificado` | Aplicação, resgate, rendimento, empréstimo (captação/amortização), tarifa, juros, retirada pessoal, aporte, outra movimentação |
| `pendente_justificado` | Mantido pendente com justificativa obrigatória |

Regras:

- **N:N**: um movimento pode se ligar a vários documentos e um documento a vários movimentos (pagamento parcelado). O sistema controla o saldo em aberto de cada documento.
- A soma alocada deve fechar com o valor do movimento; diferença é exibida e precisa ser explicada (juros, desconto, retenção, tarifa) antes de concluir.
- **Venda recebida pelo líquido**: o vínculo mostra *valor bruto da nota − retenções documentadas = líquido esperado* versus *crédito observado no banco*. A retenção não vira movimento bancário.
- **Transferências entre contas próprias**: o par (débito em uma conta e crédito em outra) é vinculado e excluído das receitas e despesas. Transferência sem par fica como pendência.
- **Sugestões** usam valor, data (janela configurável), participante e histórico, com pontuação explicada; sempre exigem aceite.
- Visão por **produtor + conta + período** com: saldo inicial, créditos, débitos, saldo final (calculado e informado pelo banco), conciliados, pendentes, diferenças e possíveis duplicidades.

### 5.5 Lançamentos

- Gerados a partir da conciliação (movimento + documento + classificação) ou manualmente.
- Cada lançamento indica se **entra no LCDPR** (receita/despesa da atividade rural) ou é apenas financeiro (aplicação, resgate, rendimento, empréstimo, transferência, retirada).
- **Rateio entre imóveis**: atribuir ao imóvel principal ou ratear (uso direto ou critério indireto configurável). Despesa comum de condomínio/parceria que abrange vários imóveis pode usar o código `000`, com o condomínio/parceria identificado no histórico.
- **Exploração coletiva**: o valor que vai ao LCDPR é a cota do produtor (`valor × participação`). O app guarda o total e a cota e monta o histórico com a composição (ex.: "Venda 1.000 sc milho — total R$ 100.000,00, cota 50%").
- O imóvel do lançamento é resolvido pelo **período de exploração vigente na data**.
- Lançamento sem movimento bancário exige conta `000` (espécie) ou `999` (numerário em trânsito), documento e justificativa.
- **Participante** conforme o manual:
  - folha de pagamento: CPF de cada trabalhador ou, pelo total, o CPF do produtor;
  - tributos: CPF/CNPJ do sujeito passivo;
  - importação/exportação direta: CPF do produtor, com o número da DI/DE (ou da NF no Mercosul) como documento.

### 5.6 Retenções e FUNRURAL

- Registrar a retenção **conforme o documento** (valor destacado na nota ou em informações complementares do XML).
- Tabela de alíquotas configurável por tipo e **vigência**, mantida pelo usuário; o app não traz alíquota "oficial" fixa sem indicação de fonte e data de vigência.
- Cálculo é **sugestão** editável; quando o valor editado diverge do calculado, registrar o motivo.
- Uso na escrituração só após status `conferida`.
- Não aplicar retenção por padrão: o usuário marca se a operação tem retenção (ex.: venda a adquirente PJ) ou se o produtor recolhe diretamente, conforme a documentação.
- O tratamento da retenção no LCDPR e nos relatórios segue configuração explícita do usuário por produtor/ano, com orientação na tela. **[confirmar: o manual do LCDPR 1.3 não trata de retenções]**

## 6. Relatórios financeiros

Filtros comuns: produtor (obrigatório), conta, imóvel, período, categoria, participante, status.
Exportação: PDF e Excel (Excel com abas de detalhe e fórmulas de soma que batem com o PDF).

Cada relatório traz no cabeçalho a sua **natureza**, de forma visível:

- **Movimentação bancária** — o que passou no banco;
- **Classificação financeira** — movimentação classificada por categoria/natureza;
- **Escrituração LCDPR** — valores preparados para o livro caixa.

Relatórios mínimos:

1. Conciliação bancária detalhada (por conta e período).
2. Entradas e saídas por mês.
3. Receitas por cliente e despesas por fornecedor.
4. Despesas por categoria.
5. Vendas com valores bruto, retido e líquido.
6. Saldos inicial e final por conta.
7. Aplicações, resgates e rendimentos (separados das receitas da atividade).
8. Transferências entre contas próprias (sem duplicar receitas ou despesas).
9. Pendências de conciliação e documentos sem vínculo.
10. Resumo financeiro mensal, trimestral e anual.

Rastreabilidade: na tela, clicar em qualquer total abre a lista de lançamentos; cada lançamento abre o movimento bancário e o documento original. No Excel, aba "Detalhe" com id do lançamento, documento e movimento. Rodapé com data de geração, usuário, filtros aplicados e status dos dados (há pendências? período fechado?).

## 7. Geração do LCDPR

### 7.1 Leiaute versionado

- O **leiaute 1.3** (ADE COPES nº 1/2020, válido a partir do ano-calendário de 2019) é a versão inicial. Sua definição está em [`lcdpr/leiaute-1.3.json`](lcdpr/leiaute-1.3.json), gerada da planilha oficial, com registros, campos, ordem, tipo, tamanho, decimais, domínios e obrigatoriedade. O gerador e o validador leem esse arquivo; nenhum formato fica espalhado no código.
- Antes de gerar, o usuário escolhe o ano-calendário e o sistema mostra o leiaute associado. Se o usuário não tiver confirmado que aquele leiaute vale para o ano (a RFB pode publicar versão posterior), a geração fica **bloqueada** com aviso para verificar o leiaute oficial.
- Novos leiautes são importados como arquivo de definição, sem nova versão do app.

### 7.2 Estrutura do arquivo (leiaute 1.3)

Formato confirmado no manual:

- texto UTF-8, uma linha por registro, iniciada pelo código do registro (sem `|` no início);
- `|` após cada campo, exceto o último;
- linhas terminadas em CR LF;
- datas `ddmmaaaa`, meses `mmaaaa`;
- valores sem separadores, com 2 casas decimais fixas (R$ 1.255,42 → `125542`; zero → `000`);
- CPF, CNPJ, CEP e códigos com todos os dígitos e zeros à esquerda;
- número do documento como no original;
- texto sem `|` e sem caracteres de controle, até 255 caracteres quando não houver outro limite.

| Registro | Conteúdo | Ocorrência |
|----------|----------|------------|
| `0000` | `LCDPR`, versão `0013`, CPF, nome, indicador de início do período (0 regular, 1 abertura, 2 início de obrigatoriedade), situação especial (0 normal, 1 falecimento, 2 espólio, 3 saída definitiva) e data, data inicial e final | 1 |
| `0010` | Forma de apuração: 1 Livro Caixa; 2 20% da receita bruta (art. 5º da Lei 8.023/1990) | 1 |
| `0030` | Endereço, número, complemento, bairro, UF, município IBGE, CEP, telefone, e-mail | 1 |
| `0040` | Um registro por **período de exploração** do imóvel: código, país, moeda, CAFIR, CAEPF, IE, nome, endereço, UF, município, CEP, tipo de exploração, participação | 1:N |
| `0045` | Terceiros, **logo após o seu 0040**: tipo de contraparte, CPF/CNPJ, nome, percentual | obrigatório se participação < 100% ou exploração ≠ individual |
| `0050` | Contas: código, país, banco, nome do banco, agência sem DV, conta com DV | 1:N |
| `Q100` | Data, imóvel, conta (`000` espécie, `999` numerário em trânsito), nº e tipo do documento, histórico, participante, tipo de lançamento, entrada, saída, saldo, natureza (`P`/`N`) | 1:N |
| `Q200` | Resumo mensal: mês, entradas, saídas, saldo acumulado, natureza | 1 por mês com lançamento |
| `9999` | Nome, CPF/CNPJ, CRC, e-mail e telefone do contador; total de linhas do arquivo (inclusive a do 9999) | 1 |

**Saldo do Q100 não é saldo bancário.** `SLD_FIN` é o resultado acumulado do livro (receitas − despesas), começa em zero em 1º de janeiro e o último Q100 traz o resultado do ano. Por isso, aplicações, resgates, rendimentos financeiros, empréstimos, transferências e retiradas não entram no Q100. Saldo zero usa natureza `P`.

### 7.3 Validações antes da exportação

Bloqueantes:

- campos obrigatórios e obrigatórios condicionais (ex.: CAFIR e UF/município/CEP quando o país é BR; CAEPF conforme a exploração; `DT_SIT_ESP` quando há situação especial);
- tamanho exato dos códigos, tamanhos máximos dos textos e domínios de valores, conforme a definição do leiaute;
- datas dentro de `DT_INI`–`DT_FIN`, com `DT_INI` = 1º de janeiro quando `IND_SIT_INI_PER` = 0;
- CPF/CNPJ com dígito verificador válido para produtor, participantes, terceiros e contador;
- todo `Q100` aponta um `0040` cuja exploração está vigente na data (ou `000`) e uma conta do `0050` (ou `000`/`999`);
- `0045` presente quando exigido, e percentuais do produtor e dos terceiros somando 100%;
- códigos `000` e `999` ausentes do `0050`; códigos de imóvel e conta únicos;
- saldo do `Q100` recalculado em ordem cronológica e igual ao gerado; `Q200` = soma mensal do `Q100`, com saldo acumulado igual ao do último `Q100` do mês;
- cada `Q100` com entrada ou saída (nunca as duas), e coerente com o tipo de lançamento;
- nenhum lançamento `pendente_revisao` ou retenção não conferida;
- `QTD_LIN` igual ao número real de linhas.

Alertas (não bloqueiam, mas exigem ciência): movimentos não conciliados no período, documentos sem vínculo, lançamentos em `999` sem justificativa, histórico genérico, participante igual ao produtor fora dos casos previstos (folha, importação/exportação), lançamentos de exploração coletiva sem composição no histórico.

### 7.4 Fluxo

1. Selecionar produtor e ano-calendário.
2. **Verificação de obrigatoriedade**: compara a receita bruta **total** da atividade rural do ano, somando todas as unidades exploradas, com o limite configurado para aquele ano-calendário. O limite fica numa tabela editável com a fonte normativa (IN SRF 83/2001, alterada pelas IN RFB 1.848/2018 e 1.903/2019). Resultado: *obrigado*, *não obrigado* ou *indeterminado*. Abaixo do limite, a entrega é facultativa e o usuário pode gerar o arquivo. **[confirmar o limite vigente para cada ano]**
3. **Prévia** dos lançamentos que irão ao `Q100`, com filtros e totais mensais, permitindo corrigir e reclassificar.
4. Painel de validações com link direto para o item a corrigir.
5. Geração do `.txt` e de relatórios de conferência (PDF/Excel) com os mesmos totais.
6. Registro da geração (hash do arquivo, data, usuário, leiaute) no histórico; arquivo salvo em `exportacoes\`.
7. Orientação final: o arquivo deve ser validado, assinado com certificado ICP-Brasil e transmitido no programa oficial da RFB, até o prazo da DIRPF do ano-calendário.

Não entram no arquivo: atividade rural no exterior (informada direto na DIRPF) e compensação de prejuízo de anos anteriores (feita na DIRPF).

## 8. Interface

Menu lateral com as áreas: **Produtores · Imóveis rurais · Contas bancárias · Documentos · Extratos · Conciliação · Lançamentos · Relatórios financeiros · LCDPR**.

Barra superior fixa: produtor selecionado (nome e CPF mascarado), seletor de período em trabalho, indicador de pendências.

**Tela inicial (painel)**:

- produtor e período em destaque;
- saldo de cada conta (calculado × informado pelo banco, com sinal de divergência);
- movimentações conciliadas × total do período (quantidade e valor);
- pendências: movimentos não conciliados, documentos em revisão, documentos sem vínculo, retenções não conferidas, possíveis duplicidades;
- atalhos para importar documento, importar extrato e abrir conciliação.

Diretrizes: idioma pt-BR; datas `dd/mm/aaaa`; valores `R$ 1.234,56`; navegação completa por teclado; tabelas com filtro, ordenação e exportação; operações longas (OCR, importação em lote) em segundo plano com progresso e cancelamento.

## 9. Requisitos não funcionais

- Windows 10 e 11, 64 bits; funciona sem internet e sem privilégio de administrador após instalado.
- Desempenho: até 50 mil movimentos por produtor/ano com abertura de telas em menos de 2 s.
- Segurança: opção de senha de acesso ao app; backups criptografados opcionais; logs sem dados sensíveis.
- Robustez: transações atômicas em importações; falha no meio de um lote não deixa dados parciais.
- Acessibilidade básica: contraste, tamanho de fonte ajustável.

## 10. Testes e critérios de aceite

Testes automatizados obrigatórios:

- parser de XML NF-e (venda, compra, cancelada, NFP-e) e de OFX (amostras de bancos diferentes);
- cálculo de retenção com vigências que se sobrepõem a uma virada de mês;
- conciliação N:N, venda pelo líquido, transferência própria, pendência justificada;
- deduplicação de extratos importados duas vezes;
- relatórios: soma do detalhe = total exibido;
- gerador LCDPR:
  - reproduzir os exemplos do manual (`0000`, `0010`, `0030`, `0040`, `0045`, `0050`, `Q100`, `9999`) byte a byte, inclusive o CR LF;
  - formatação de valores conforme a tabela de exemplos do manual (`1.129.998,99` → `112999899`, `18,5%` → `01850`, `0,010` → `001`);
  - saldo do `Q100` partindo de zero, `Q200` cumulativo e `QTD_LIN` correto;
  - mudança de exploração no meio do ano gerando dois `0040` e os `Q100` apontando o código vigente;
  - exploração em condomínio com lançamento pela cota e `0045` logo após o `0040`;
- backup → restauração → mesmo conteúdo (hash dos registros).

Critérios de aceite da v1:

1. Dois produtores cadastrados não veem dados um do outro em nenhuma tela ou relatório.
2. Nenhum dado de OCR é gravado como confirmado sem a tela de conferência.
3. Extrato com saldo divergente não é gravado sem tratamento.
4. Conciliação não fecha automaticamente por valor igual.
5. Transferências próprias não aparecem como receita nem despesa.
6. Todo total de relatório abre seus lançamentos e documentos.
7. O LCDPR não é exportado com validação bloqueante pendente.
8. Aplicações, resgates, rendimentos financeiros, empréstimos e transferências próprias não aparecem no `Q100`.
9. O app funciona com a rede desconectada.

## 11. Entregas por fase

| Fase | Escopo |
|------|--------|
| 1 | Estrutura do projeto, banco por produtor, cadastros, auditoria, backup/restauração, instalador |
| 2 | Documentos: XML, manual, PDF/imagem com OCR e tela de conferência |
| 3 | Extratos OFX/PDF/manual, deduplicação, conferência de saldo |
| 4 | Conciliação, lançamentos, retenções |
| 5 | Relatórios com PDF/Excel e rastreabilidade |
| 6 | LCDPR: leiaute versionado, obrigatoriedade, prévia, validação, geração |

Cada fase termina com testes passando, instalador gerado e notas de versão.

## 12. Fora do escopo da v1

- Assinatura digital e transmissão do LCDPR (feitas no programa oficial da Receita Federal).
- Integração bancária on-line (Open Finance) e consulta on-line de NF-e.
- Escrituração contábil por partidas dobradas, folha de pagamento e emissão de nota fiscal.
- Apuração do IRPF/Atividade Rural (pode ser fase futura).

## 13. Pontos a confirmar

Já confirmados pelo leiaute 1.3 e pelo manual (ver [`lcdpr/leiaute-1.3.md`](lcdpr/leiaute-1.3.md)): registros, campos, tamanhos, domínios, formato do arquivo, códigos `000`/`999`, regras de exploração coletiva e de participante.

Ainda em aberto:

1. **Leiaute por ano-calendário**: o 1.3 vale a partir de 2019; conferir, para cada ano escriturado, se a RFB publicou versão posterior.
2. **Limite de obrigatoriedade** por ano-calendário: o manual não traz o valor.
3. **Codificação**: o manual diz "ASCII UTF-8". Gerar em UTF-8 sem BOM e validar no programa oficial com nomes acentuados.
4. **Divergências do próprio material oficial**: ocorrência do `Q100`/`Q200`, zero como `0` ou `000`, espaços no exemplo do `Q200`. A decisão proposta está em `lcdpr/leiaute-1.3.md`, seção 5, e deve ser confirmada no validador oficial.
5. **Retenções (FUNRURAL/SENAR/RAT) no `Q100`**: lançar o bruto da nota ou o valor recebido, e como evidenciar a diferença. O manual não trata do tema.
6. **Adiantamentos**: o manual prevê o tipo 3 para a receita de produtos entregues referente a adiantamento, mas não detalha o lançamento do recebimento do adiantamento em si.
7. Tabela de categorias padrão a ser entregue com o app.
8. Necessidade de multiusuário em rede local ou apenas monousuário por máquina.
