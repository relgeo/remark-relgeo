import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

test('publishes a self-contained ESM/CJS/type export boundary', () => {
  assert.equal(packageJson.version.startsWith('0.5.'), true);
  assert.deepEqual(packageJson.files, ['dist']);
  assert.equal(packageJson.exports['.'].import, './dist/index.mjs');
  assert.equal(packageJson.exports['.'].require, './dist/index.js');
  assert.equal(packageJson.exports['.'].types, './dist/index.d.ts');
  assert.equal(existsSync(new URL('../dist/index.mjs', import.meta.url)), true);
  assert.equal(existsSync(new URL('../dist/index.js', import.meta.url)), true);
  assert.equal(existsSync(new URL('../dist/index.d.ts', import.meta.url)), true);

  for (const dependency of Object.values(packageJson.dependencies ?? {})) {
    assert.equal(String(dependency).startsWith('workspace:'), false);
  }
});
