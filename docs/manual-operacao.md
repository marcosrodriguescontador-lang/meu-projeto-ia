# Manual básico de operação — Fase 1

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
