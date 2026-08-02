import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const configPath = 'vite.config.ts';
const source = fs.readFileSync(configPath, 'utf8');

test('preview local trata /app como rota SPA em vez de resolver App.tsx no Windows', () => {
  assert.match(source, /function\s+appSpaFallbackPlugin/i);
  assert.match(source, /\^\\\/app\(\?:\\\/\|\\\?\|#\|\$\)/i);
  assert.match(source, /req\.url\s*=\s*`\/index\.html\$\{query\}`/i);
  assert.match(source, /configureServer/i);
  assert.match(source, /configurePreviewServer/i);
  assert.match(source, /plugins:\s*\[appSpaFallbackPlugin\(\),\s*react\(\)\]/i);
});
