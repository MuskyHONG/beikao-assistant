import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const version = (await readFile(new URL('VERSION', root), 'utf8')).trim();
assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
for (const path of ['package.json', 'apps/web/package.json', 'apps/api/package.json']) {
  assert.equal(JSON.parse(await readFile(new URL(path, root), 'utf8')).version, version, `${path} differs from VERSION`);
}
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, `v${version}`, 'Release tag differs from VERSION');
console.log(`Version consistent: v${version}`);
