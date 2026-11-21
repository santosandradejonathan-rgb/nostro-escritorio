// Service worker mínimo: deixa o chat instalável. Sempre busca a versão nova na rede.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
