# Prompt técnico — Escrituração e gestão financeira do produtor rural PF (v1)

> Versão 1 do prompt técnico para orientar o desenvolvimento do aplicativo.
> Os itens marcados como **[confirmar]** dependem de verificação no leiaute oficial
> do LCDPR ou na legislação do ano-calendário e não devem ser fixados no código.

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
| `imovel_rural` | id, código LCDPR (3 dígitos) **[confirmar]**, país, moeda, CIB/NIRF (CAD_ITR), CAEPF, inscrição estadual, nome, endereço, UF, município IBGE, CEP, tipo de exploração, percentual de participação, vigência |
| `terceiro_imovel` | imóvel, tipo de contraparte, CPF/CNPJ, nome, percentual (base do registro 0045) |
| `conta_bancaria` | id, código LCDPR, país, código do banco, nome do banco, agência, número, tipo (corrente, poupança, investimento, caixa/espécie), imóvel padrão, saldo de abertura e data |
| `participante` | CPF/CNPJ, nome, tipo (cliente, fornecedor, ambos), UF, validação de dígito |
| `documento` | tipo (NF-e venda, NF-e compra, NFP-e, nota avulsa, recibo, contrato, fatura, folha, outro), número, série, chave de acesso, emissão, participante, imóvel, valor bruto, origem (`xml`, `pdf`, `imagem`, `manual`), status (`pendente_revisao`, `confirmado`, `cancelado`), arquivo original |
| `documento_item` | produto/serviço, CFOP, NCM, quantidade, unidade, valor |
| `retencao` | documento, tipo (FUNRURAL/contribuição previdenciária, SENAR, RAT/GILRAT, IR, outra), base, alíquota, valor sugerido, valor documentado, fonte (`documento`, `calculado`, `manual`), status (`sugerida`, `conferida`) |
| `arquivo_original` | sha256, nome original, tipo MIME, tamanho, data de importação, caminho |
| `extrato_importacao` | conta, arquivo, período, saldo inicial e final informados pelo banco |
| `movimento_bancario` | conta, data, valor (com sinal), histórico do banco, documento do banco (FITID/nº), hash de deduplicação, origem, status de conciliação, justificativa de pendência |
| `conciliacao` | movimento, tipo de vínculo, observação, usuário, data |
| `conciliacao_item` | conciliação, documento (opcional), valor alocado |
| `lancamento` | data, conta, imóvel, documento, participante, tipo (receita, despesa, receita de adiantamento, não operacional), categoria, histórico, valor, origem (movimento bancário), indicador `entra_no_lcdpr`, status |
| `categoria` | plano de categorias financeiras configurável, com natureza (receita da atividade, despesa de custeio, investimento, financeira, patrimonial, neutra) |
| `aliquota_vigencia` | tipo de retenção, alíquota, início e fim de vigência, base legal (texto), regra de aplicação (ex.: venda a PJ adquirente) |
| `periodo_fechamento` | ano, mês, status, usuário, data |
| `auditoria` | ver 3.4 |

## 5. Funcionalidades

### 5.1 Produtores, imóveis e contas

- CRUD de produtor, imóvel rural, terceiros do imóvel e conta bancária, com validação de CPF/CNPJ, CEP, UF e código IBGE (tabela de municípios embarcada).
- Conta do tipo **caixa/espécie** para movimentos em dinheiro, tratada como conta própria.
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
- Rateio entre imóveis quando aplicável.
- Lançamento sem movimento bancário (ex.: pagamento em espécie) exige conta caixa e documento.

### 5.6 Retenções e FUNRURAL

- Registrar a retenção **conforme o documento** (valor destacado na nota ou em informações complementares do XML).
- Tabela de alíquotas configurável por tipo e **vigência**, mantida pelo usuário; o app não traz alíquota "oficial" fixa sem indicação de fonte e data de vigência.
- Cálculo é **sugestão** editável; quando o valor editado diverge do calculado, registrar o motivo.
- Uso na escrituração só após status `conferida`.
- Não aplicar retenção por padrão: o usuário marca se a operação tem retenção (ex.: venda a adquirente PJ) ou se o produtor recolhe diretamente, conforme a documentação.
- O tratamento da retenção no LCDPR e nos relatórios segue configuração explícita do usuário por produtor/ano, com orientação na tela. **[confirmar com o leiaute e as regras vigentes]**

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

- O leiaute 1.3 é a **referência estrutural inicial**. Cada leiaute é descrito em arquivo de definição (JSON/YAML) com registros, campos, ordem, tipo, tamanho, obrigatoriedade, domínio de valores e regras.
- Antes de gerar, o usuário escolhe o ano-calendário e o sistema mostra qual leiaute está associado; se não houver leiaute cadastrado/confirmado para aquele ano, a geração fica **bloqueada** com aviso para verificar o leiaute oficial publicado pela Receita Federal.
- Novos leiautes são importados como arquivo, sem nova versão do app.

### 7.2 Registros (referência leiaute 1.3 — **[confirmar campos e formatos no leiaute oficial]**)

| Registro | Conteúdo | Ocorrência |
|----------|----------|------------|
| `0000` | Abertura: nome do arquivo (LCDPR), versão do leiaute, CPF e nome do produtor, indicador de situação no início do período, situação especial e data, data inicial e final | 1 |
| `0010` | Parâmetros de tributação (forma de apuração) | 1 |
| `0030` | Dados cadastrais (endereço, município, CEP, telefone, e-mail) | 1 |
| `0040` | Imóveis rurais (código, CAD_ITR, CAEPF, IE, endereço, tipo de exploração, participação) | 1:N |
| `0045` | Terceiros do imóvel (condôminos, arrendantes, parceiros etc.) | quando o tipo de exploração exigir |
| `0050` | Contas bancárias (código, país, banco, agência, conta) | 1:N |
| `Q100` | Demonstrativo do resultado: data, imóvel, conta, nº e tipo do documento, histórico, participante, tipo de lançamento, entrada, saída, saldo final e natureza do saldo | 0:N |
| `Q200` | Resumo mensal: mês, entradas, saídas, saldo e natureza | 12 (ou meses do período) |
| `9999` | Identificação do contador e encerramento (quantidade de linhas) | 1 |

Formatos (separador, codificação, formato de data, casas decimais e separador decimal, quebra de linha) vêm da definição do leiaute, nunca de constantes espalhadas no código.

### 7.3 Validações antes da exportação

Bloqueantes:

- campos obrigatórios preenchidos; domínios de códigos válidos; datas dentro do período;
- CPF/CNPJ válidos para produtor, participantes e terceiros;
- todo `Q100` referencia imóvel (`0040`) e conta (`0050`) existentes;
- `0045` presente quando o tipo de exploração exigir e soma de percentuais coerente;
- saldo acumulado do `Q100` recalculado e igual ao informado; `Q200` igual à soma mensal do `Q100`;
- nenhum lançamento `pendente_revisao` ou retenção não conferida incluída;
- quantidade de linhas no `9999` correta.

Alertas (não bloqueiam, mas exigem ciência): movimentos não conciliados no período, documentos sem vínculo, participantes sem nome, lançamentos sem documento.

### 7.4 Fluxo

1. Selecionar produtor e ano-calendário.
2. **Verificação de obrigatoriedade**: compara a receita bruta da atividade rural do ano com o limite configurado para aquele ano-calendário (tabela editável com fonte normativa). Resultado: *obrigado*, *não obrigado* ou *indeterminado*; o usuário pode gerar mesmo se não obrigado (entrega facultativa). **[confirmar limite vigente para cada ano]**
3. **Prévia** dos lançamentos que irão ao `Q100`, com filtros e totais mensais, permitindo corrigir e reclassificar.
4. Painel de validações com link direto para o item a corrigir.
5. Geração do `.txt` e de relatórios de conferência (PDF/Excel) com os mesmos totais.
6. Registro da geração (hash do arquivo, data, usuário, leiaute) no histórico; arquivo salvo em `exportacoes\`.

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
- gerador LCDPR: arquivo de exemplo conferido campo a campo com a definição do leiaute, saldos e `Q200` consistentes, contagem do `9999`;
- backup → restauração → mesmo conteúdo (hash dos registros).

Critérios de aceite da v1:

1. Dois produtores cadastrados não veem dados um do outro em nenhuma tela ou relatório.
2. Nenhum dado de OCR é gravado como confirmado sem a tela de conferência.
3. Extrato com saldo divergente não é gravado sem tratamento.
4. Conciliação não fecha automaticamente por valor igual.
5. Transferências próprias não aparecem como receita nem despesa.
6. Todo total de relatório abre seus lançamentos e documentos.
7. O LCDPR não é exportado com validação bloqueante pendente.
8. O app funciona com a rede desconectada.

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

- Transmissão do LCDPR (a entrega é feita pelo programa oficial da Receita Federal).
- Integração bancária on-line (Open Finance) e consulta on-line de NF-e.
- Escrituração contábil por partidas dobradas, folha de pagamento e emissão de nota fiscal.
- Apuração do IRPF/Atividade Rural (pode ser fase futura).

## 13. Pontos a confirmar

1. Leiaute oficial do LCDPR aplicável a cada ano-calendário (o leiaute 1.3 citado como anexo não está neste repositório).
2. Limite de receita bruta que torna a entrega obrigatória em cada ano-calendário.
3. Formato numérico, de data e de codificação dos campos no leiaute vigente.
4. Tratamento das retenções (FUNRURAL/SENAR/RAT) no `Q100`: valor bruto da nota ou valor efetivamente recebido, e como evidenciar a diferença.
5. Tratamento de adiantamentos de recursos (tipo de lançamento específico no `Q100`).
6. Tabela de categorias padrão a ser entregue com o app.
7. Necessidade de multiusuário em rede local ou apenas monousuário por máquina.
