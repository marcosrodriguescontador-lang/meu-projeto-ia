// Service worker mínimo: permite instalar o sistema na tela inicial.
// Não guarda dados em cache: tudo vem sempre do servidor.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
