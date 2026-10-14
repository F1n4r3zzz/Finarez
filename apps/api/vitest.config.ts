import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
    globalSetup: ['./src/test/global-setup.ts'],
    // Integration tests share one database; files run one at a time to keep them independent.
    fileParallelism: false,
  },
});
