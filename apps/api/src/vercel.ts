import { getRequestListener } from '@hono/node-server';
import { loadConfig } from './config';
import { createRuntime } from './runtime';

// Entry for the Vercel Function (bundled by scripts/vercel-build.mjs). Vercel sets
// x-forwarded-for itself, overwriting any value the client sent.
const { app } = createRuntime(loadConfig());

export default getRequestListener(app.fetch);
