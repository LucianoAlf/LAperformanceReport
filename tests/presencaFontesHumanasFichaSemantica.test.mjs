import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath =
  'supabase/migrations/20260722153000_presenca_fontes_humanas_ficha_semantica.sql';
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8')
  : '';

test('presenca semantica usa a matriz unica de fontes humanas fortes', () => {
  assert.ok(migration, 'migration de fontes humanas ainda nao existe');
  assert.match(
    migration,
    /create\s+or\s+replace\s+view\s+public\.vw_aluno_presenca_semantica_v1/i,
  );
  assert.match(migration, /public\.fn_presenca_e_forte\s*\(\s*e\.respondido_por/i);
  assert.match(migration, /'fabio_audio'/i);
  assert.match(migration, /'professor_whatsapp'/i);
  assert.match(migration, /presenca-semantica-v1\.3/i);
});

test('fonte humana confirma falta e fica fora da revisao operacional', () => {
  assert.match(
    migration,
    /fn_presenca_e_forte[\s\S]{0,220}status\s*=\s*'ausente'[\s\S]{0,120}'falta_confirmada'/i,
  );
  assert.match(
    migration,
    /respondido_em_confiavel[\s\S]*not\s+public\.fn_presenca_e_forte\s*\(\s*c\.respondido_por/i,
  );
  assert.match(
    migration,
    /revisao_operacional_exigida[\s\S]*not\s+public\.fn_presenca_e_forte\s*\(\s*c\.respondido_por/i,
  );
});

test('app_aluno_ficha expoe resultado semantico preservando compatibilidade', () => {
  assert.match(
    migration,
    /create\s+or\s+replace\s+function\s+public\.app_aluno_ficha\s*\(\s*p_aluno_id\s+integer/i,
  );
  assert.match(migration, /from\s+public\.vw_aluno_presenca_semantica_v1\s+ps/i);
  assert.match(migration, /'status'\s*,\s*ps\.estado_origem/i);
  assert.match(migration, /'resultado_pedagogico'\s*,\s*ps\.resultado_pedagogico/i);
  assert.match(migration, /'confianca'\s*,\s*ps\.confianca/i);
  assert.match(migration, /'revisao_operacional_exigida'/i);
});

test('migration preserva seguranca e nao cria Health Score no LA Teacher', () => {
  assert.match(migration, /security_invoker\s*=\s*true/i);
  assert.match(
    migration,
    /revoke\s+all\s+on\s+table\s+public\.vw_aluno_presenca_semantica_v1[\s\S]*public[\s\S]*anon[\s\S]*authenticated/i,
  );
  assert.match(
    migration,
    /grant\s+execute\s+on\s+function\s+public\.app_aluno_ficha\s*\(\s*integer\s*\)\s+to\s+authenticated/i,
  );
  assert.doesNotMatch(migration, /app_meu_health_score_v3/i);
  assert.doesNotMatch(
    migration,
    /\b(update|delete|truncate)\s+(from\s+)?public\.aluno_presenca\b/i,
  );
});
