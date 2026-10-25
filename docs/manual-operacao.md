# Manual básico de operação — Fases 1 a 3

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

### Correções
- **Estornar** uma baixa (ícone na lista de baixas do título) desfaz caixa, saldos e receitas; fica tudo no histórico.
- **Cancelar título** (sem baixas) permite gerar novamente a cobrança da competência.

### Rescisão
Aba **Rescisão** do contrato: informe a entrega das chaves e veja a memória de cálculo (aluguel proporcional, multa proporcional ao prazo restante, caução a devolver). Ao confirmar (digitando RESCINDIR), o sistema gera a cobrança proporcional, o título da rescisão e a devolução da caução, e libera o imóvel para locação.

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
