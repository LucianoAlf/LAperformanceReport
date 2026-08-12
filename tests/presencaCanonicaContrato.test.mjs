import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const migrationName = readdirSync(migrationsDir)
  .find((name) => /_presenca_canonica_resolvedor_conflitos\.sql$/u.test(name));
const hardeningName = readdirSync(migrationsDir)
  .find((name) => /_presenca_canonica_conflitos_acl\.sql$/u.test(name));

test('a migration canônica de presença existe e fecha somente estados terminais', () => {
  assert.ok(migrationName, 'falta a migration única presenca_canonica_resolvedor_conflitos');

  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.fn_presenca_fecha_chamada\s*\(\s*p_status_presenca\s+text\s*,\s*p_respondido_por\s+text\s*\)/iu);
  assert.match(sql, /p_status_presenca\s+in\s*\(\s*'presente'\s*,\s*'falta'\s*,\s*'falta_justificada'\s*\)/iu);
  assert.match(sql, /p_respondido_por\s*=\s*'emusys'\s+and\s+p_status_presenca\s*=\s*'presente'/iu);
});

test('a migration preserva evidência do Emusys, registra conflitos e não deixa helper público', () => {
  assert.ok(migrationName, 'falta a migration única presenca_canonica_resolvedor_conflitos');

  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');

  assert.match(sql, /emusys_presenca_bruta_anterior/iu);
  assert.match(sql, /espelhado_de_presenca_id/iu);
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.aluno_presenca_conflitos/iu);
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.fn_sincronizar_gemeos_presenca\s*\(\s*integer\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/iu);
});

test('a confirmação de chamada do Fábio é idempotente e passa pela ação pendente', () => {
  assert.ok(migrationName, 'falta a migration única presenca_canonica_resolvedor_conflitos');

  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.fabio_confirmar_chamada_acao\s*\(\s*p_acao_id\s+uuid\s*,\s*p_professor_id\s+integer\s*,\s*p_wa_message_id\s+text/iu);
  assert.match(sql, /from\s+public\.fabio_acoes_pendentes/iu);
  assert.match(sql, /from\s+public\.fabio_acao_eventos/iu);
  assert.match(sql, /fabio_registrar_presencas_aula/iu);
});

test('os consumidores operacionais usam o resolvedor e a secretaria não apaga o raw', () => {
  assert.ok(migrationName, 'falta a migration única presenca_canonica_resolvedor_conflitos');

  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');
  const agenda = sql.slice(sql.indexOf('create or replace function public.app_minha_agenda_sessao'));
  const secretaria = sql.slice(
    sql.indexOf('create or replace function public.app_registrar_chamada_agenda'),
    sql.indexOf('create or replace function public.fabio_confirmar_chamada_acao'),
  );
  const gemeos = sql.slice(
    sql.indexOf('create or replace function public.fn_sincronizar_gemeos_presenca'),
    sql.indexOf('create or replace function public.trg_sincronizar_gemeos_presenca'),
  );

  assert.match(agenda, /public\.fn_presenca_fecha_chamada/iu);
  assert.match(sql, /create\s+or\s+replace\s+view\s+public\.vw_presenca_pendencia/iu);
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.fabio_aulas_candidatas/iu);
  assert.doesNotMatch(secretaria, /delete\s+from\s+public\.aluno_presenca/iu);
  assert.doesNotMatch(gemeos, /emusys_presenca_bruta\s*=\s*v_fonte\./iu);
});

test('a tabela de conflitos não herda escrita/leitura direta do navegador', () => {
  assert.ok(hardeningName, 'falta a migration de hardening de ACL dos conflitos');

  const sql = readFileSync(join(migrationsDir, hardeningName), 'utf8');
  assert.match(sql, /revoke\s+all\s+on\s+table\s+public\.aluno_presenca_conflitos\s+from\s+public\s*,\s*anon\s*,\s*authenticated/iu);
  assert.match(sql, /grant\s+all\s+on\s+table\s+public\.aluno_presenca_conflitos\s+to\s+service_role/iu);
});
