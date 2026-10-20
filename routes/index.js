import { router as auth } from './auth.js';
import { router as colaboradores, routerVendedores } from './colaboradores.js';
import { router as clientes } from './clientes.js';
import { router as produtos } from './produtos.js';
import { router as pedidos } from './pedidos.js';
import { router as relatorios } from './relatorios.js';
import { router as notas } from './notas.js';
import { router as config, routerPublico as configPublico } from './config.js';

// Monta todas as rotas da API. Rotas abaixo de exigirLogin precisam de sessão.
export function montar(app, exigirLogin) {
  app.use('/api', auth);
  app.use('/api', configPublico);
  app.use('/api', exigirLogin);
  app.use('/api', config);
  app.use('/api', routerVendedores);
  app.use('/api', clientes);
  app.use('/api', produtos);
  app.use('/api', pedidos);
  app.use('/api', relatorios);
  app.use('/api', notas);
  app.use('/api', colaboradores);
}
