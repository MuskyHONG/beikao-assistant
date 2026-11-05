import { readFileSync } from 'node:fs';
// The relative location stays identical in src/ and dist/.
export const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
