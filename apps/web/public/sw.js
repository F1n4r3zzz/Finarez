// Retires the service worker of the old FinanzLog prototype, which answered every request
// from its own cache. Browsers that still have it fetch this file when checking for an
// update, install it, and it deletes the old caches, unregisters itself and reloads open
// tabs so they load the current app from the network. Finanz itself registers no worker.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const client of windows) client.navigate(client.url);
    })(),
  );
});
