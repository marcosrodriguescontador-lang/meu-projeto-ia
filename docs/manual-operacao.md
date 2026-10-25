# Manual básico de operação — Fases 1 e 2

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
