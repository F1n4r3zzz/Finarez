/** Loads the repo-root `.env` for local runs. Hosted environments inject variables directly. */
export function loadLocalEnv(): void {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
