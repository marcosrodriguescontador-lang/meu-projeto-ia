import nodemailer from 'nodemailer';

let transporte = null;

export function smtpConfigurado() {
  return Boolean(process.env.SMTP_HOST);
}

function obterTransporte() {
  if (!transporte) {
    const porta = Number(process.env.SMTP_PORT || 587);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      secure: porta === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporte;
}

export async function enviarEmail({ para, assunto, texto }) {
  if (!smtpConfigurado()) {
    console.log(`\n[E-MAIL – SMTP não configurado, exibindo no console]\nPara: ${para}\nAssunto: ${assunto}\n${texto}\n`);
    return { console: true };
  }
  return obterTransporte().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: para,
    subject: assunto,
    text: texto,
  });
}

export function enviarCodigoRedefinicao(para, nome, codigo) {
  return enviarEmail({
    para,
    assunto: 'AGRO S – Código para redefinir sua senha',
    texto: `Olá, ${nome}.\n\nSeu código para redefinir a senha do sistema AGRO S – Controle Interno é:\n\n    ${codigo}\n\n` +
      'Ele vale por 15 minutos. Se você não pediu a redefinição, ignore esta mensagem.\n',
  });
}
