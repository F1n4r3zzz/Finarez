import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const API_PORT = 3199;
export const WEB_URL = 'http://localhost:5199';
/** The API's output, including every email it "sends" (console transport). */
export const API_LOG = fileURLToPath(new URL('./.output/api.log', import.meta.url));

/** The link in each email the API sent to `to`, oldest first. */
export function emailedLinks(to: string): string[] {
  let log: string;
  try {
    log = readFileSync(API_LOG, 'utf8');
  } catch {
    return [];
  }
  return log
    .split('[email] To: ')
    .filter((block) => block.startsWith(`${to}\n`))
    .map((block) => block.match(/https?:\/\/\S+/)?.[0] ?? '');
}
