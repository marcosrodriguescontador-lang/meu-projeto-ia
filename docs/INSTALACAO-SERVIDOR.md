# Instalação no servidor interno (computador do escritório)

O sistema fica instalado em **um computador da empresa que permanece ligado**. Os outros
computadores, notebooks e celulares que estão na rede do escritório (cabo ou Wi-Fi) abrem
o sistema pelo navegador, digitando o endereço desse computador, por exemplo
`http://192.168.0.10:3000`.

Antes de começar, tenha em mãos:

- o computador que será o servidor (Windows 10/11 ou Linux);
- acesso ao roteador da internet (usuário e senha de administrador) para fixar o IP;
- a pasta do sistema (`agros-controle`);
- os dados da conta de e-mail da empresa, se quiser o envio do código de "Esqueci minha senha".

---

## Windows

### 1) Instalar o Node.js
1. Acesse https://nodejs.org e baixe a versão **LTS** (22 ou mais nova).
2. Abra o instalador e clique em **Avançar** até concluir (pode deixar tudo como está).
3. Para conferir: abra o menu Iniciar, digite **cmd**, abra o **Prompt de Comando** e digite
   `node -v`. Deve aparecer `v22...` ou maior.

### 2) Copiar a pasta do sistema
Copie a pasta `agros-controle` para `C:\agros-controle` (evite a Área de Trabalho e pastas
sincronizadas com OneDrive).

### 3) Instalar as dependências
No Prompt de Comando:
```
cd C:\agros-controle
npm install --omit=dev
```

### 4) Iniciar o servidor
Dê dois cliques em **`iniciar.bat`**. Uma janela preta abre com a mensagem
`AGRO S – Controle Interno rodando em http://localhost:3000`. **Não feche essa janela**
(no passo 7 o sistema passa a iniciar sozinho, sem janela).

No próprio servidor, abra o navegador em `http://localhost:3000` e crie o administrador
(primeiro acesso).

### 5) Fixar o IP do computador no roteador
O endereço do servidor não pode mudar, senão os outros computadores deixam de encontrá-lo.

1. Descubra o IP atual: no Prompt de Comando digite `ipconfig` e anote o **Endereço IPv4**
   (ex.: `192.168.0.10`) e o **Endereço físico (MAC)** com `ipconfig /all`.
2. Entre no roteador (normalmente `http://192.168.0.1` ou `http://192.168.1.1`, a etiqueta do
   roteador informa) e procure por **DHCP**, **Reserva de IP**, **IP fixo** ou **Address
   Reservation**.
3. Reserve o IP anotado para o MAC do servidor e salve.

Se não tiver acesso ao roteador, peça ao técnico de informática: "reservar o IP do servidor no DHCP".

### 6) Liberar a porta no firewall do Windows
Abra o **PowerShell como administrador** (menu Iniciar → digite PowerShell → botão direito →
Executar como administrador) e cole:
```
New-NetFirewallRule -DisplayName "AGRO S Controle Interno" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```
Na primeira vez que o sistema iniciar, se aparecer o aviso do Firewall, marque **Redes
privadas** e clique em **Permitir acesso**. A rede do escritório deve estar como **Privada**
(Configurações → Rede e Internet → propriedades da rede).

Teste em outro computador ou celular da rede: `http://192.168.0.10:3000` (use o IP do servidor).

### 7) Iniciar sozinho junto com o computador
Escolha **uma** das opções.

**Opção A – Serviço do Windows com NSSM (recomendada; inicia mesmo sem ninguém fazer login)**
1. Baixe o NSSM em https://nssm.cc/download e copie `nssm.exe` (pasta `win64`) para `C:\agros-controle`.
2. No Prompt de Comando **como administrador**:
   ```
   cd C:\agros-controle
   nssm install AgroS "C:\Program Files\nodejs\node.exe" "--disable-warning=ExperimentalWarning server.js"
   nssm set AgroS AppDirectory C:\agros-controle
   nssm set AgroS AppStdout C:\agros-controle\data\servidor.log
   nssm set AgroS AppStderr C:\agros-controle\data\servidor.log
   nssm set AgroS Start SERVICE_AUTO_START
   nssm start AgroS
   ```
3. Para parar/reiniciar: `nssm stop AgroS` / `nssm restart AgroS` (ou pelo app **Serviços** do Windows).

**Opção B – Agendador de Tarefas**
1. Abra o **Agendador de Tarefas** → **Criar Tarefa**.
2. Aba Geral: nome `AGRO S`; marque **Executar estando o usuário conectado ou não** e
   **Executar com privilégios mais altos**.
3. Aba Disparadores: **Novo** → Iniciar a tarefa: **Na inicialização**.
4. Aba Ações: **Novo** → Programa: `C:\agros-controle\iniciar.bat`; Iniciar em: `C:\agros-controle`.
5. Aba Configurações: desmarque **Parar a tarefa se ela for executada por mais de**.

Desative também a suspensão do computador (Configurações → Sistema → Energia → Suspender: **Nunca**).

### Backup diário (Windows)
1. Agendador de Tarefas → **Criar Tarefa Básica** → nome `Backup AGRO S` → **Diariamente**,
   por exemplo às 12:30.
2. Ação **Iniciar um programa**: `C:\agros-controle\backup.bat`.
3. As cópias ficam em `C:\agros-controle\backup\` (os 30 últimos dias). Copie essa pasta também
   para fora do servidor (pen drive, HD externo ou nuvem) pelo menos uma vez por semana.

---

## Linux (Ubuntu/Debian)

### 1) Instalar o Node.js
```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

### 2) Copiar a pasta e criar um usuário para o sistema
```
sudo useradd --system --create-home --shell /usr/sbin/nologin agros
sudo cp -r agros-controle /opt/agros-controle
sudo chown -R agros:agros /opt/agros-controle
```

### 3) Instalar as dependências
```
cd /opt/agros-controle
sudo -u agros npm install --omit=dev
```

### 4) Iniciar (teste)
```
sudo -u agros ./iniciar.sh
```
Abra `http://IP-DO-SERVIDOR:3000` e crie o administrador. Pare com `Ctrl+C`.

### 5) Fixar o IP
Igual ao Windows: reserve o IP no DHCP do roteador. Para ver IP e MAC: `ip addr`.

### 6) Liberar a porta no firewall
```
sudo ufw allow from 192.168.0.0/16 to any port 3000 proto tcp
```

### 7) Iniciar sozinho (systemd)
```
sudo cp /opt/agros-controle/scripts/agros-controle.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now agros-controle
systemctl status agros-controle        # ver se está rodando
journalctl -u agros-controle -f        # ver as mensagens (inclui o código de senha sem SMTP)
```

### Backup diário (Linux)
```
sudo crontab -u agros -e
```
Acrescente a linha (todo dia às 12:30):
```
30 12 * * * /opt/agros-controle/backup.sh
```

---

## Restaurar um backup

1. Pare o sistema (Windows: `nssm stop AgroS` ou feche a janela; Linux: `sudo systemctl stop agros-controle`).
2. Guarde o banco atual por segurança: renomeie `data/agrocontrol.db` para `data/agrocontrol-antes.db`
   e apague `data/agrocontrol.db-wal` e `data/agrocontrol.db-shm`, se existirem.
3. Copie o backup desejado de `backup/` para `data/` e renomeie para `agrocontrol.db`.
4. Inicie o sistema novamente e confira os dados.

Mantenha também uma cópia do arquivo `data/session_secret` (sem ele os usuários apenas
precisam fazer login de novo) e do `.env`.

---

## E-mail real (código de "Esqueci minha senha")

1. Copie `.env.example` para `.env` e preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
   `SMTP_PASS` e `SMTP_FROM` com os dados da conta de e-mail da empresa
   (o próprio `.env.example` traz exemplos para Gmail, Outlook e provedores).
2. Gmail/Google Workspace exige uma **senha de app** (Conta Google → Segurança →
   Verificação em duas etapas → Senhas de app); a senha normal não funciona.
3. Reinicie o sistema e teste:
   ```
   npm run testar-email -- seuemail@empresa.com.br
   ```
4. O servidor precisa de acesso à internet (saída) na porta do SMTP (587 ou 465).

---

## Conferir se está no ar

Abra `http://IP-DO-SERVIDOR:3000/status`. Deve aparecer `"status": "no ar"`. Essa página
não mostra dados da empresa e pode ser usada por ferramentas de monitoramento.

## Instalar no celular

Abra o endereço do sistema no navegador do celular e use **Adicionar à tela inicial**
(Chrome: menu ⋮; iPhone/Safari: botão Compartilhar). Com acesso por HTTPS (Tailscale ou
Cloudflare, abaixo), o Chrome oferece **Instalar app** e o sistema abre como um aplicativo.

## HTTPS opcional com certificado próprio

Dentro da rede do escritório o acesso por `http` é aceitável. Para criptografar também na
rede interna:

1. Instale o **mkcert** (https://github.com/FiloSottile/mkcert) no servidor e gere o certificado:
   ```
   mkcert -install
   mkcert -cert-file certificados/agros.pem -key-file certificados/agros-key.pem 192.168.0.10 agros.local localhost
   ```
2. No `.env`, descomente e ajuste `HTTPS_CERT_FILE`, `HTTPS_KEY_FILE` e `HTTPS_PORT` (3443).
3. Libere a porta 3443 no firewall e reinicie o sistema. Acesse `https://192.168.0.10:3443`.
4. Em cada computador/celular, instale o certificado raiz do mkcert (arquivo `rootCA.pem`,
   mostrado por `mkcert -CAROOT`) para o navegador confiar no endereço.

---

## Vendedores na rua (acesso pelo 4G)

O servidor interno só é visto por quem está na rede do escritório. Para os vendedores em
campo, use **uma** das opções abaixo. **Não abra a porta no roteador** (expor o servidor
direto na internet traz risco de invasão).

### Opção recomendada: Tailscale (rede privada, gratuita para poucos usuários)
1. Crie uma conta em https://tailscale.com (pode entrar com a conta Google/Microsoft da empresa).
2. **No servidor**: baixe e instale o Tailscale (https://tailscale.com/download), abra e faça login.
   No painel (https://login.tailscale.com/admin/machines), renomeie a máquina para `agros`.
3. **Em cada celular de vendedor**: instale o app **Tailscale** (Play Store/App Store), entre
   com a conta da empresa (ou aceite o convite enviado pelo painel em **Users → Invite**) e
   deixe a VPN ligada.
4. No celular, abra `http://agros:3000` (ou o IP `100.x.y.z` que o painel mostra para o servidor).
5. HTTPS automático (recomendado, e libera o "Instalar app" no celular): no painel, em
   **DNS**, ative **MagicDNS** e **HTTPS Certificates**. No servidor, rode como administrador:
   ```
   tailscale serve --bg 3000
   ```
   O endereço passa a ser `https://agros.SEU-TAILNET.ts.net` (o comando mostra o endereço exato).
6. Para tirar o acesso de um vendedor que saiu: remova o aparelho no painel do Tailscale
   **e** desative o colaborador no sistema.

### Alternativa: Cloudflare Tunnel (endereço público com HTTPS, exige um domínio)
1. Tenha um domínio (ex.: `agros.com.br`) gerenciado na Cloudflare (conta gratuita).
2. No painel Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel** → escolha
   **Cloudflared**, dê o nome `agros` e siga as instruções para instalar o conector no servidor
   (Windows ou Linux; o painel mostra o comando pronto).
3. Em **Public Hostname**, crie `sistema.agros.com.br` apontando para `http://localhost:3000`.
4. Recomendado: em **Zero Trust → Access → Applications**, proteja o endereço exigindo
   login por e-mail (código enviado ao e-mail do vendedor), além do login do sistema.
5. Os vendedores acessam `https://sistema.agros.com.br`. Nenhuma porta é aberta no roteador.

O sistema já reconhece o HTTPS vindo do Tailscale/Cloudflare na mesma máquina e marca o
cookie de sessão como seguro automaticamente.
