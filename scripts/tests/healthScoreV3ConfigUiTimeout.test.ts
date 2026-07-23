import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260721155000_health_score_v3_config_ui_timeout.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

test('leitura da configuracao V3 tem timeout explicito para cache frio', () => {
  assert.match(
    migration,
    /alter function public\.get_health_score_professor_v3_config_ui\(\)\s+set statement_timeout = '60s'/i,
  );
  assert.match(
    migration,
    /alter function public\.get_health_score_professor_v3_config_ui_pre_catalogo_v1\(\)\s+set statement_timeout = '60s'/i,
  );
});
