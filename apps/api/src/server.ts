import { serve } from '@hono/node-server';
import { loadConfig } from './config';
import { loadLocalEnv } from './env';
import { clientAddressFromSocket } from './http/client-address';
import { createRuntime } from './runtime';

loadLocalEnv();
const config = loadConfig();
const { app, pool } = createRuntime(config);

// Direct Node listener: the client address comes from the socket, never from request headers.
// (On Vercel, the platform sets x-forwarded-for itself.)
const server = serve({
  fetch: (req, env) =>
    app.fetch(clientAddressFromSocket(req, env.incoming.socket.remoteAddress), env),
  port: config.PORT,
});
console.log(`API listening on http://localhost:${config.PORT}/api`);

const shutdown = () => server.close(() => void pool.end());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
