# Manual de instalação — STATUS ERP IMOBILIÁRIO

## Requisitos
- Windows 10 ou 11, 64 bits
- 4 GB de RAM (8 GB recomendado) e 2 GB livres em disco
- Não requer internet para funcionar

## Instalação
1. Execute `STATUS-ERP-Setup-<versão>.exe`.
   - Enquanto o instalador não tiver assinatura digital (Q4), o Windows SmartScreen exibirá um aviso: clique em **Mais informações → Executar assim mesmo**.
2. Escolha a pasta de instalação (padrão: pasta do usuário) e conclua.
3. Abra **STATUS ERP** pelo atalho na área de trabalho.

## Primeira utilização
Na tela **Bem-vindo ao STATUS ERP**, escolha:
- **Nova instalação**: informe os dados da empresa, crie o usuário administrador e defina a **senha de backup**.
  > A senha de backup é exigida para restaurar as cópias em outro computador e **não pode ser recuperada**. Guarde-a com a diretoria.
- **Restaurar de um backup**: para migrar de computador ou recuperar após reinstalação do Windows. Selecione o arquivo `.sbak`, informe a senha de backup, valide e restaure. O aplicativo reinicia sozinho.

## Onde ficam os dados
`%APPDATA%\STATUS ERP IMOBILIÁRIO\dados\`

| Item | Conteúdo |
|---|---|
| `status.db` | Banco de dados cifrado (SQLCipher) |
| `chaves.json` | Chave do banco protegida pelo Windows (DPAPI) — vinculada a este usuário do Windows |
| `anexos\` | Documentos anexados, cifrados |
| `backups\` | Destino padrão dos backups |
| `logs\` | Log técnico (sem senhas nem dados bancários) |

A desinstalação **não apaga** esta pasta.

## Atualização
Execute o instalador da nova versão. Os dados são preservados e as migrações do banco são aplicadas automaticamente na abertura. Recomenda-se gerar um backup manual antes.

## Troca de computador ou reinstalação do Windows
A chave do banco fica protegida pelo usuário do Windows. Após reinstalar o Windows ou trocar de computador, os arquivos da pasta `dados` **não abrem diretamente** — use **Restaurar de um backup** com a senha de backup.

## Gerar o instalador (equipe técnica)
O instalador é gerado pelo GitHub Actions (`.github/workflows/ci.yml`, job `instalador-windows`) ou em uma máquina Windows:
```
npm ci
npm test
npm run dist:win     # gera release\STATUS-ERP-Setup-<versão>.exe
```
