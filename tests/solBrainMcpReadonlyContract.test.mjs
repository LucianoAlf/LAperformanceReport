import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../vps/la-hq/sol/scripts/sol-brain-mcp.sh', import.meta.url),
  'utf8',
);

test('Sol Brain MCP is read-only and excludes mutation tools', () => {
  assert.match(source, /--read-only/);
  assert.match(source, /execute_sql/);
  assert.doesNotMatch(source, /apply_migration/);
  assert.doesNotMatch(source, /deploy_edge_function/);
  assert.doesNotMatch(source, /acesso total de leitura E escrita/i);
});
