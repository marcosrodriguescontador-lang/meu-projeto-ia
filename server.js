import fs from 'node:fs';
import path from 'node:path';

// Carrega o .env (se existir) antes de qualquer outro módulo do sistema.
const arquivoEnv = path.join(import.meta.dirname, '.env');
if (fs.existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const { default: express } = await import('express');
const { carregarUsuario, exigirLogin } = await import('./lib/sessao.js');
const { ErroHttp } = await import('./lib/http.js');
const rotas = await import('./routes/index.js');

export function criarApp() {
  const app = express();
  app.disable('x-powered-by');
  // Confia apenas em proxy local (ex.: Cloudflare Tunnel ou nginx na mesma máquina).
  app.set('trust proxy', 'loopback');

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; " +
        "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  app.use(express.json({ limit: '3mb' }));
  app.use(carregarUsuario);

  // Proteção CSRF: requisições que alteram dados precisam do cabeçalho X-AgroS
  // (enviado apenas pelo nosso front-end; outros sites não conseguem enviá-lo).
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-AgroS') !== '1') {
      return res.status(403).json({ erro: 'Requisição recusada.' });
    }
    res.set('Cache-Control', 'no-store');
    next();
  });

  rotas.montar(app, exigirLogin);

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Recurso não encontrado.' }));
  // Módulos de regras compartilhados com o navegador.
  for (const arq of ['validacao.js', 'parcelas.js', 'extenso.js', 'chave-nfe.js', 'contrato.js']) {
    app.get(`/lib/${arq}`, (req, res) => res.type('text/javascript').sendFile(path.join(import.meta.dirname, 'lib', arq)));
  }
  app.use(express.static(path.join(import.meta.dirname, 'public'), { index: 'index.html' }));

  app.use((err, req, res, next) => {
    if (err instanceof ErroHttp) return res.status(err.status).json({ erro: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Arquivo ou dados grandes demais.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Dados inválidos.' });
    if (/UNIQUE constraint failed: users\.email/.test(err.message)) return res.status(409).json({ erro: 'Já existe um cadastro com este e-mail.' });
    if (/UNIQUE constraint failed: users\.cpf/.test(err.message)) return res.status(409).json({ erro: 'Já existe um cadastro com este CPF.' });
    if (/UNIQUE constraint failed/.test(err.message)) return res.status(409).json({ erro: 'Já existe um cadastro com estes dados.' });
    console.error(err);
    res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente.' });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const porta = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  criarApp().listen(porta, host, () => {
    console.log(`AGRO S – Controle Interno rodando em http://localhost:${porta}`);
    if (!process.env.SMTP_HOST) console.log('SMTP não configurado: códigos de redefinição de senha aparecerão aqui no console.');
  });
}
