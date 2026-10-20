// Envia um e-mail de teste com as configurações SMTP do .env.
// Uso: npm run testar-email -- destino@exemplo.com
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.join(import.meta.dirname, '..');
if (fs.existsSync(path.join(raiz, '.env'))) process.loadEnvFile(path.join(raiz, '.env'));
const { enviarEmail, smtpConfigurado } = await import('../lib/email.js');

const destino = process.argv[2];
if (!destino) {
  console.error('Informe o e-mail de destino: npm run testar-email -- voce@exemplo.com');
  process.exit(1);
}
if (!smtpConfigurado()) console.log('Atenção: SMTP_HOST está vazio no .env; a mensagem será apenas exibida aqui.');
try {
  await enviarEmail({ para: destino, assunto: 'AGRO S – teste de e-mail', texto: 'Se você recebeu esta mensagem, o envio de e-mails do sistema está funcionando.' });
  console.log(`E-mail de teste enviado para ${destino}.`);
} catch (e) {
  console.error(`Falha ao enviar: ${e.message}`);
  console.error('Confira SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no .env e se o servidor tem acesso à internet.');
  process.exit(1);
}
