# Manual básico de operação — Fases 1 a 5

## Acesso
- **Entrar:** usuário e senha. Após 5 tentativas inválidas o usuário fica bloqueado por 15 minutos (um administrador pode desbloquear antes em *Usuários e perfis*).
- **Primeiro acesso de um usuário novo:** o sistema exige a troca da senha temporária.
- **Bloqueio automático:** após 10 minutos sem uso, a tela é bloqueada e pede a senha. Para bloquear manualmente, clique no cadeado no topo da tela.
- **Tema claro/escuro:** ícone de lua/sol no topo.
- **Minha conta:** clique no seu nome para trocar a senha.

## Pessoas (cadastro único)
Cada CPF/CNPJ é cadastrado **uma única vez**. A mesma pessoa pode ser proprietária, locatária, fiadora etc. — marque os papéis em *Dados gerais → Papéis no sistema*.

1. *Pessoas → Nova pessoa*.
2. Informe tipo (PF/PJ), CPF ou CNPJ (aceita CNPJ alfanumérico), nome e ao menos um papel. Se o documento já existir, o sistema avisa e oferece abrir o cadastro existente.
3. Abas **Endereços**, **Contatos** e **Relações** (cônjuge, representante legal, sócio, procurador).
4. **Salvar**. O código é gerado automaticamente.

Após salvar, ficam disponíveis:
- **Dados bancários** (somente para perfis autorizados): os dados aparecem mascarados; **Exibir** mostra os dados completos e registra o acesso na auditoria.
- **Documentos:** escolha a categoria e clique em **Anexar…**. Os arquivos são guardados cifrados. *Abrir* exibe o arquivo; o ícone de download salva uma cópia.
- **Histórico:** todas as alterações, com usuário, data e campos modificados.

**Excluir** exige motivo e não apaga o histórico. Pessoas vinculadas a usuários ou relacionadas a outras pessoas não podem ser excluídas.

## Imóveis
**Cadastrar:** *Imóveis → Novo imóvel* (ou atalho no Painel). As abas são:
1. **Identificação e endereço** — tipo, finalidade, matrícula + cartório, inscrição municipal/IPTU e endereço.
2. **Cômodos e características** — dormitórios, suítes, banheiros, vagas, áreas (m²), descrição comercial (vai para a ficha), observações internas (não vão para a ficha) e características.
3. **Valores e disponibilidade** — marque *Ofertar para venda* e/ou *Ofertar para locação*, com valor e comissão prevista; condomínio, IPTU e corretor responsável.
4. **Proprietários** — busque a pessoa e informe a participação. A soma deve ser 100% (use *Dividir igualmente* para coproprietários). Quem ainda não era proprietário recebe o papel automaticamente.

O **código** do imóvel é gerado ao salvar.

**Disponibilidade:** venda e locação têm situações independentes (Disponível, Reservado, Em negociação, Alugado/Vendido, Indisponível, Inativo). Use *Alterar situação* no cartão da modalidade e informe o motivo — tudo fica na aba *Histórico*. Ao marcar a venda como **Vendido**, a oferta de locação disponível é inativada. *Alugado* e *Vendido* manuais servem para registrar a carteira atual; a partir das próximas fases eles serão definidos pelos contratos.

**Fotos:** aba *Fotos → Adicionar fotos…* (JPG, PNG ou WEBP). A primeira vira capa; use a estrela para trocar a capa, as setas para reordenar e o campo para legenda. Clique na foto para ampliar (setas do teclado navegam).

**Documentos:** matrícula, escritura, IPTU, plantas, laudos etc., guardados cifrados.

**Ficha em PDF:** *Ficha comercial* (para clientes — sem endereço exato nem proprietários) ou *Ficha interna* (com proprietários, matrícula e observações).

**Pesquisa:** busca por código, endereço, bairro, cidade ou descrição; filtros por modalidade, situação, tipo, cidade e bairro; *Mais filtros* para faixa de preço, dormitórios, vagas, finalidade e características. Alterne entre tabela e cards no canto direito.

**Exclusão:** exige motivo; não é permitida com oferta reservada, em negociação ou alugada.

No cadastro da pessoa, a aba **Imóveis** lista os imóveis de que ela é proprietária. Não é possível remover o papel Proprietário (ou Corretor) de quem está vinculado a imóveis.

## Locações e financeiro

### Preparação (uma vez)
1. **Financeiro → Contas bancárias → Nova conta**: cadastre a conta onde os aluguéis são recebidos com titularidade **Recursos de terceiros** e, se houver, a conta própria da imobiliária. Informe o saldo inicial e a data.
2. **Financeiro → Índices e feriados**: informe mensalmente a variação do IGP-M/IPCA (necessária para reajustes) e os feriados municipais.

### Contrato de locação
1. **Locações → Novo contrato**: busque o imóvel (precisa ter oferta de locação), adicione o(s) locatário(s) e fiador(es), informe início e prazo (o término é calculado), aluguel, dia de vencimento, índice, taxas e garantia. Encargos (condomínio, IPTU, seguro) podem ser cobrados com o aluguel e destinados ao proprietário, a um terceiro (ex.: condomínio) ou à imobiliária.
2. **Salvar** cria um **rascunho**. **Ativar contrato** registra os proprietários atuais como locadores, marca o imóvel como *Alugado* e, se houver caução, gera a cobrança da caução.
3. Contrato ativo: aluguel, datas e partes mudam apenas por **aditivo** (aba *Reajustes e aditivos*), **reajuste** ou **rescisão**.

### Rotina mensal
1. **Cobranças do mês**: escolha a competência (mês de uso), confira a prévia e clique em **Gerar**. Gerar novamente não duplica. Contratos com reajuste pendente aparecem como *Bloqueada*.
2. **Contas a receber**: clique no título → **Registrar recebimento**. Informe data, valor, conta e forma; multa e juros são calculados automaticamente (pode-se receber parcial). Desconto e dispensa de encargos exigem permissão específica. O ícone de PDF emite o **recibo**.
3. **Repasses → Saldos a repassar**: mostra, por proprietário, apenas o que foi efetivamente recebido, já descontada a taxa. **Gerar repasse** (ou *Gerar todos*) cria o título a pagar; em **Repasses gerados → Pagar** registre a transferência. O **demonstrativo** em PDF detalha cada crédito e débito.
4. **Inadimplência**: títulos vencidos com encargos até hoje. Selecione títulos do mesmo contrato e **Renegociar** para parcelar.
5. **Reajustes**: aniversários dos próximos 45 dias com o índice acumulado e o novo valor. **Aplicar** ou **Dispensar** (com motivo). Índice negativo não reduz o aluguel, salvo cláusula marcada no contrato.

### Lançamentos avulsos (aba do contrato)
- **Cobrança ao locatário**: entra na próxima cobrança (ex.: 2ª via de chave). Valor negativo = crédito ao locatário por conta do proprietário (ex.: abatimento de pintura).
- **Débito ao proprietário**: descontado imediatamente do saldo a repassar (ex.: conserto pago pela imobiliária).
- **IRRF retido pelo locatário** (locatário pessoa jurídica): marque a opção e informe o valor negativo. Abate do aluguel do proprietário e aparece na base da DIMOB.

### Correções
- **Estornar** uma baixa (ícone na lista de baixas do título) desfaz caixa, saldos e receitas; fica tudo no histórico.
- **Cancelar título** (sem baixas) permite gerar novamente a cobrança da competência.

### Rescisão
Aba **Rescisão** do contrato: informe a entrega das chaves e veja a memória de cálculo (aluguel proporcional, multa proporcional ao prazo restante, caução a devolver). Ao confirmar (digitando RESCINDIR), o sistema gera a cobrança proporcional, o título da rescisão e a devolução da caução, e libera o imóvel para locação.

## Tesouraria, conciliação e relatórios

### Despesas e receitas da imobiliária
- **Contas a pagar → Nova despesa** (ou **Contas a receber → Nova receita própria**): escolha favorecido/pagador, categoria do plano de contas (o botão **+** cria uma categoria nova), valor e competência. À vista ou parcelado (até 120 parcelas mensais, sem perder centavos). Se já foi paga/recebida, marque a opção e informe data, conta e forma.
- Aluguéis, taxas de administração, intermediação e multas são lançados automaticamente pelas locações — não use estas telas para eles.

### Transferências entre contas
**Contas bancárias → Transferir entre contas.** O quadro *Separação de recursos* mostra quanto das contas de terceiros já pertence à imobiliária (taxas e receitas apuradas); somente esse valor pode ser levado para a conta própria. Se aparecer falta de recursos de terceiros, verifique despesas próprias pagas pela conta de terceiros. Transferências podem ser estornadas na página da conta (aba *Transferências*), com motivo.

### Importar extrato e conciliar
1. **Contas bancárias** → clique na conta → **Importar extrato (OFX/CSV)**. OFX é lido diretamente; no CSV, indique na prévia as colunas de data, descrição e valor (ou débito/crédito).
2. O mesmo arquivo não é aceito duas vezes, e transações já importadas por outro arquivo são ignoradas. Após importar, o sistema concilia automaticamente os pares inequívocos (mesmo valor, até 3 dias).
3. Na aba **Conciliação**, para cada linha pendente: **Aceitar** a sugestão, **escolher** o movimento manualmente (ícone de corrente), **lançar no sistema** o que só existe no banco (tarifas, rendimentos — vira despesa/receita já quitada) ou **ignorar** com motivo. Tudo pode ser desfeito.
4. O indicador **Diferença na data do extrato** deve ficar em **R$ 0,00**: significa que o saldo do sistema bate com o saldo informado pelo banco.

### Fluxo de caixa
Realizado (movimentos bancários) nos meses passados e previsto (títulos em aberto) nos próximos; vencidos não pagos entram no mês atual. Filtre por contas próprias, de terceiros ou todas. Transferências dentro do mesmo grupo não contam como entrada/saída.

### Relatórios
**Financeiro → Relatórios**: escolha o relatório, ajuste os parâmetros e confira a prévia; **PDF** e **Excel** exportam exatamente o que está na tela (a exportação fica registrada na auditoria). Destaques:
- **Resultado gerencial mensal** — receitas próprias menos despesas, regime de caixa ou competência. Aluguéis e valores de terceiros nunca entram.
- **Valores a repassar** — por proprietário, com a conferência contra o saldo contábil.
- **Posição de recursos de terceiros**, **Rentabilidade da administração**, **Extrato do proprietário**.
- **Base para a DIMOB** — aluguel, comissão e IRRF por locador e mês de pagamento, para conferência e digitação no programa da Receita.

## Comercial: leads, funil, vendas e comissões

### Preparação
- Cadastre os corretores em **Pessoas** (papel Corretor, com CRECI) e, em **Usuários e perfis**, ligue cada usuário corretor à sua pessoa em **Pessoa vinculada**. Com o perfil Corretor, ele verá apenas a própria carteira.
- Em **Comissões → Modelo padrão de rateio**, ajuste a divisão sugerida (padrão: imobiliária 50%, captador 20%, vendedor 30%). O captador é o corretor do imóvel; o vendedor, o corretor do negócio.

### Leads
**Comercial → Leads → Novo lead**: nome, telefone/e-mail, origem do contato, interesse, perfil de busca (tipo, bairros, faixa de valor, dormitórios) e a autorização de comunicações (LGPD). Na página do lead aparecem **sugestões de imóveis** compatíveis com o perfil — marque os de interesse. Registre ligações e retornos em **Histórico de atendimento** e agende visitas. **Abrir negócio** inicia o funil.

### Funil de negócios
Quadros separados para vendas e locações. Arraste o cartão para mudar a etapa (o histórico fica registrado e alimenta os indicadores). Para marcar como perdido, ative **Mostrar perdidos** e solte na coluna, ou use o botão na página do negócio — o motivo é obrigatório. As etapas avançam sozinhas quando a visita é realizada, a proposta é registrada ou aceita e a venda é registrada.

### Negócio
- **Visitas**: agende (o sistema impede dois compromissos no mesmo horário para o imóvel ou o corretor) e registre o resultado e o interesse do cliente.
- **Propostas**: exigem o cliente no cadastro de pessoas. Valores não são editados: negocie por **Contraproposta** (nova versão da outra parte). **Aceitar** coloca o imóvel "em negociação".
- **Venda** (negócios de venda): informe a forma de pagamento — cada parcela pode ser **direta entre as partes** (só registrada) ou **pela imobiliária** (vira conta a receber do comprador, como recurso de terceiros, e depois repasse ao vendedor). Defina a comissão (%), quem paga e o rateio; é possível **reter a comissão do sinal** pago pela imobiliária. **Registrar a venda não lança recebimento.** Depois: *Aguardando financiamento*, *Escriturada* ou *Concluída* (encerra o negócio como ganho) ou **distrato** (cancela valores ainda não recebidos e devolve o imóvel à venda; a comissão é mantida para decisão).
- **Locação**: quando o contrato estiver ativo, use **Concluir com contrato**. Após a 1ª cobrança, defina na aba **Comissão** o rateio da taxa de intermediação.

### Comissões
A parte de cada corretor só vira **conta a pagar** (Contas a pagar, origem "Comissão a pagar") na proporção do que a imobiliária já recebeu da comissão. Estornar um recebimento cancela as liberações ainda não pagas; se o corretor já recebeu, estorne antes o pagamento a ele. A aba **Por corretor** (e o relatório *Comissões por corretor*) mostra previsto, liberado, pago, a pagar e o que aguarda recebimento.

### Agenda e indicadores
**Agenda** reúne tarefas e visitas do período (atrasadas no topo). **Indicadores** mostra, para negócios abertos no período, quantos alcançaram cada etapa, a conversão para a etapa seguinte, o tempo médio em cada etapa, a taxa de ganho, o ciclo médio, os motivos de perda e o desempenho por origem e por corretor.

## Usuários e perfis (administrador)
- **Novo usuário:** nome, login, perfil e senha temporária.
- **Perfis padrão:** Administrador (protegido), Gerente, Financeiro, Corretor, Atendimento, Consulta. Crie perfis próprios marcando as permissões desejadas.
- O sistema impede desativar o último administrador ativo e o próprio usuário.

## Backup
- **Backup → Gerar backup:** cria um arquivo `.sbak` cifrado com banco, documentos e configurações, e o **valida** em seguida (integridade conferida).
- **Destino…:** permite salvar em pendrive, HD externo ou pasta de rede. Recomendação: manter uma cópia fora do escritório.
- **Automático:** ativado por padrão a cada 24 h, mantendo as 30 cópias automáticas mais recentes (ajustável em *Configurações*). Backups manuais nunca são apagados automaticamente.
- **Restaurar backup…:** selecione o arquivo, informe a senha de backup, **Validar**, confira o resumo e **Restaurar** (é necessário digitar RESTAURAR). Antes de restaurar, o sistema gera uma cópia de segurança do estado atual.

## Auditoria
Lista de todas as operações (quem, quando, o quê, em qual estação). **Verificar integridade** confere a cadeia de registros: qualquer alteração indevida no banco é detectada.

## Configurações (administrador)
Dados da empresa, tempo de bloqueio por inatividade, política de tentativas, backup automático e troca da senha de backup.
