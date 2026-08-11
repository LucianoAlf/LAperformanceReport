import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath =
  'supabase/migrations/20260811150000_relatorio_gerencial_destaques_parciais.sql';

test('produtor gerencial materializa destaques parciais por metrica publicavel', () => {
  assert.equal(
    fs.existsSync(path.join(root, migrationPath)),
    true,
    'migration de destaques parciais ainda nao existe',
  );

  const sql = fs.readFileSync(path.join(root, migrationPath), 'utf8');

  assert.match(sql, /get_health_score_professor_v3_performance/);
  assert.match(sql, /metrica_publicavel\s*=\s*true/i);
  assert.match(sql, /valor_bruto\s+is\s+not\s+null/i);
  assert.match(sql, /destaques_mensais_parciais/);
  for (const metrica of ['retencao', 'presenca', 'media_turma']) {
    assert.match(sql, new RegExp(`'${metrica}'`, 'i'));
  }
  assert.match(sql, /cobertura/);
  assert.match(sql, /amostra/);
  assert.match(sql, /confianca/);
  assert.doesNotMatch(
    sql,
    /destaques_mensais_parciais[\s\S]{0,500}status['\"]?\s*,\s*['\"]indisponivel/i,
  );
});
