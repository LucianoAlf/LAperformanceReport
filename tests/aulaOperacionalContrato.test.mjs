import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const migrationName = readdirSync(migrationsDir)
  .find((name) => /_aula_operacional_prioriza_roster\.sql$/u.test(name));
const recoveryName = readdirSync(migrationsDir)
  .find((name) => /_recuperar_fila_aula_operacional_transitoria\.sql$/u.test(name));

test('a migration de aula operacional usa uma única resolução em todos os consumidores', () => {
  assert.ok(migrationName, 'falta migration aula_operacional_prioriza_roster');
  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');

  assert.match(
    sql,
    /idx_aulas_emusys_slot_operacional[\s\S]*unidade_id[\s\S]*professor_id[\s\S]*data_hora_inicio[\s\S]*data_hora_fim[\s\S]*curso_nome/iu,
  );
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.fn_aula_operacional_id/iu);
  assert.match(sql, /aula_alunos_emusys/iu);
  assert.match(sql, /app_minha_agenda_sessao/iu);
  assert.match(sql, /vw_registro_pendencia/iu);
  assert.match(sql, /vw_presenca_pendencia/iu);
  assert.match(sql, /fabio_aulas_candidatas/iu);
  assert.match(sql, /fn_enfileirar_audio_core/iu);
});

test('a recuperação da fila é auditada e não apaga o espelho bruto', () => {
  assert.ok(migrationName, 'falta migration aula_operacional_prioriza_roster');
  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');

  assert.match(sql, /insert\s+into\s+public\.audit_log/iu);
  assert.match(sql, /status\s*=\s*'pendente'/iu);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.aulas_emusys/iu);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.aula_alunos_emusys/iu);

  assert.ok(recoveryName, 'falta migration recuperar_fila_aula_operacional_transitoria');
  const recovery = readFileSync(join(migrationsDir, recoveryName), 'utf8');
  assert.match(recovery, /erro_tipo\s*=\s*'transitorio'/iu);
  assert.match(recovery, /fn_aula_operacional_id/iu);
  assert.match(recovery, /relink_aula_roster/iu);
  assert.doesNotMatch(recovery, /erro\s+ilike/iu);
});

test('o helper privado não é uma nova porta do navegador', () => {
  assert.ok(migrationName, 'falta migration aula_operacional_prioriza_roster');
  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');

  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.fn_aula_operacional_id\s*\(\s*integer\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/iu);
});
