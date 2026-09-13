import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../vps/la-hq/sol/scripts/lareport-readonly-mcp.sh', import.meta.url),
  'utf8',
);

test('LA Report read-only MCP keeps the database credential out of argv', () => {
  assert.match(source, /export DATABASE_URI/);
  assert.match(source, /--access-mode=restricted/);
  assert.match(source, /postgres-mcp==0\.3\.0/);
  assert.match(source, /mcp<2/);
  assert.doesNotMatch(source, /postgres-mcp "\$CONN"/);
  assert.doesNotMatch(source, /server-postgres "\$CONN"/);
});
