import { router as auth } from './auth.js';

// Monta todas as rotas da API. Rotas abaixo de exigirLogin precisam de sessão.
export function montar(app, exigirLogin) {
  app.use('/api', auth);
  app.use('/api', exigirLogin);
}
