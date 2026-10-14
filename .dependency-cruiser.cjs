/** Module boundary rules. */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'module-public-api-only',
      comment: 'Another module may only be imported through its index.ts.',
      severity: 'error',
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/api/src/modules/[^/]+/',
        pathNot: ['^apps/api/src/modules/$1/', '^apps/api/src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'kernel-is-standalone',
      comment: 'The kernel runs in browser and server: no app code, no Node built-ins.',
      severity: 'error',
      from: { path: '^packages/kernel/' },
      to: { path: '^apps/' },
    },
    {
      name: 'kernel-no-node-builtins',
      severity: 'error',
      from: { path: '^packages/kernel/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'web-not-api',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^apps/api/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'default'] },
  },
};
