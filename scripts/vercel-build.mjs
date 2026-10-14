// Builds the Vercel deployment as Build Output API files in .vercel/output: the web app as
// static files, the API as one bundled Node function at /api. In production, the database
// migrations run first, so a failed migration stops the deployment.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}.vercel/output`;
const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

if (process.env.VERCEL_ENV === 'production') {
  // Schema changes go through the direct connection, not the pooler.
  const direct = process.env.DATABASE_URL_UNPOOLED;
  run(
    'pnpm',
    ['--filter', '@finanz/api', 'db:migrate'],
    direct ? { MIGRATION_DATABASE_URL: direct } : {},
  );
}

rmSync(out, { recursive: true, force: true });

run('pnpm', ['--filter', '@finanz/web', 'build']);
cpSync(`${root}apps/web/dist`, `${out}/static`, { recursive: true });

const fn = `${out}/functions/api.func`;
await build({
  entryPoints: [`${root}apps/api/src/vercel.ts`],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  // CommonJS dependencies (pg) call require(); give the ESM bundle one.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  // Optional native addon of pg; the pure JavaScript client is used instead.
  external: ['pg-native'],
  legalComments: 'none',
  logLevel: 'warning',
});
writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({
    runtime: 'nodejs24.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    maxDuration: 30,
  }),
);

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};
mkdirSync(out, { recursive: true });
writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/(.*)$', headers: securityHeaders, continue: true },
        // The kill switch for the old service worker must never be cached.
        { src: '^/sw\\.js$', headers: { 'Cache-Control': 'no-cache' }, continue: true },
        { src: '^/api(/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        // Client-side routes (paths without a file extension) load the app.
        { src: '^/[^.]*$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('Build output ready in .vercel/output');
