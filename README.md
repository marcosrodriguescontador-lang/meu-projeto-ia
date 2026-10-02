# Auditor Contábil, Fiscal e Tributário — Systema

Aplicação que analisa os documentos de uma empresa cliente, cruza as informações e gera dois relatórios com o
timbre da Systema Serviços Contábeis e Financeiros:

- **Relatório interno**, para os analistas fiscais, contábeis e de departamento pessoal: todos os apontamentos,
  fundamentação legal e quadros de apoio.
- **Relatório para o cliente**: linguagem acessível, só com os pontos marcados para o cliente.

Os dois saem em **PDF (com timbre)** e em **Word (editável)**.

## Como abrir (Windows)

1. Instale o **Python**: <https://www.python.org/downloads/>. Na instalação, marque **"Add python.exe to PATH"**.
2. Na pasta `F:\temp\meu-projeto-ia`, dê **dois cliques em `iniciar.bat`**.
   - Na primeira vez ele baixa as bibliotecas, o que leva alguns minutos.
   - O navegador abre sozinho com o Auditor. Para encerrar, feche a janela preta.

## Como usar

1. **Barra lateral**: preencha razão social, CNPJ, ano, regime tributário, atividade e anexo do Simples.
2. **Aba 1 — Documentos**: arraste os arquivos (PDF, OFX, DOCX, XLS/XLSX, CSV). Para cada arquivo, confira o
   tipo sugerido (extrato, faturamento, folha, balanço...). Depois clique em **Consolidar documentos**.
3. **Aba 2 — Dados mensais**: confira a tabela mês a mês e corrija o que precisar. Também dá para digitar
   valores direto, sem documento. Preencha o faturamento e a folha do **ano anterior** para a RBT12 e o
   Fator R saírem exatos.
4. **Aba 3 — Auditoria**: clique em **Executar auditoria**. Em cada apontamento você escolhe se ele vai ou
   não para o relatório do cliente.
5. **Aba 4 — Relatórios**: baixe os PDFs e os arquivos Word.

Para testar, use os arquivos fictícios da pasta `exemplos/`.

## O que a auditoria verifica

**Simples Nacional (Anexos I a V)**
- Recalcula a RBT12, a faixa, a alíquota efetiva e o DAS de cada mês (LC 123/2006, redação da LC 155/2016).
- **Fator R** (Anexos III/V): se está acima ou abaixo de 28%, e quanto de folha/pró-labore falta para migrar
  do Anexo V para o III, com a economia estimada.
- **Anexo IV**: a CPP (INSS patronal) é paga fora do DAS. O sistema confere se ela aparece nos encargos.
  O Fator R não se aplica ao Anexo IV.
- Proximidade do **limite de R$ 4,8 milhões** e do **sublimite de R$ 3,6 milhões** (ICMS/ISS), incluindo
  excesso de até 20% e acima de 20%.
- Mudança de faixa se aproximando.
- DAS pago diferente do recalculado.
- Hipóteses de exclusão: despesas pagas acima de 120% dos ingressos e compras acima de 80% dos ingressos.

**Lucro Presumido e Lucro Real (anual com estimativa mensal ou trimestral)**
- IRPJ (com adicional), CSLL, PIS e COFINS estimados.
- Acréscimo de 10% na presunção para receita acima de R$ 5 milhões (LC 224/2025, a partir de 2026).
- Lembrete de balancete de suspensão/redução no Lucro Real anual.
- Limite de R$ 78 milhões do Presumido.

**Cruzamentos para todos os regimes**
- **Faturamento x movimentação bancária**, descontando transferências entre contas da própria empresa
  (identificadas automaticamente), resgates, empréstimos e estornos. Risco do art. 42 da Lei 9.430/96.
- Faturamento dos relatórios x receita declarada (PGDAS-D / DCTF / SPED).
- Compras x vendas (margem, compras maiores que vendas, meses com compras e sem vendas).
- Rendimentos de aplicação: tratamento no Simples, IRRF compensável no Presumido/Real, conferência com a
  contabilidade.
- Folha: pró-labore ausente, encargos fora do padrão (pagamento em duplicidade ou falta de recolhimento).
- Demonstrativos: balanço que não fecha, caixa negativo ou elevado, receita contábil x fiscal,
  distribuição de lucros acima do lucro, empréstimos de sócios.
- **Comparativo de regimes** (Simples x Presumido x Real) com a economia estimada.

## Inteligência artificial (opcional)

Informe uma chave da API da Anthropic na barra lateral para:
- **Ler com IA** documentos que a leitura automática não entendeu (PDF escaneado, layouts diferentes);
- **Gerar o parecer técnico e a carta ao cliente**, que entram nos relatórios.

Sem a chave, a auditoria por regras funciona normalmente. Com a IA ligada, os dados do documento são
enviados para a API da Anthropic.

## Identidade visual

Os arquivos da marca ficam em `assets/`:
- `timbre.pdf`: timbre usado ao fundo dos PDFs. A página 1 é a capa e a página 2 o papel de continuação.
- `logo.png` (texto preto) e `logo_branco.png` (texto branco, para fundos escuros).
- Para usar a fonte da marca (Poppins) nos PDFs, coloque `Poppins-Regular.ttf` e `Poppins-SemiBold.ttf` em
  `assets/fonts/`. Elas podem ser baixadas grátis em <https://fonts.google.com/specimen/Poppins>.

## Importante

- Os cálculos são **estimativas** a partir dos documentos e da legislação parametrizada em
  `auditor/tributos.py`. Confirme os pontos relevantes antes de retificar declarações.
- **Não coloque documentos de clientes nesta pasta do GitHub.** A pasta `documentos/` já está configurada
  para ser ignorada.

## Para desenvolvedores

```bash
pip install -r requirements.txt pytest
python -m pytest          # testes
streamlit run app.py      # interface
```

Estrutura:
- `app.py`: interface
- `auditor/leitores.py`: leitura de arquivos
- `auditor/consolidacao.py`: tabela mensal e transferências entre contas
- `auditor/tributos.py`: tabelas e cálculos
- `auditor/analises.py`: regras de auditoria
- `auditor/relatorios.py`: PDF e Word
- `auditor/ia.py`: integração com o Claude
