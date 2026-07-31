import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260730205500_conciliacao_experimentais_snapshot_ativo.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

function functionBlock(sql, name) {
  const start = sql
    .toLowerCase()
    .indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} deve existir`);
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test('migration cria nucleo privado sobre o snapshot vigente', () => {
  const sql = migration();
  const core = functionBlock(sql, 'get_conciliacao_experimentais_snapshot_v1');

  assert.match(core, /returns\s+jsonb[\s\S]{0,100}language\s+sql[\s\S]{0,100}stable/i);

  const rawAccesses = [
    ...core.matchAll(/(?:from|join)\s+public\.emusys_experimentais_raw\s+r\b/gi),
  ];
  assert.equal(rawAccesses.length, 2, 'nucleo deve manter os dois acessos raw canonicos');
  for (const access of rawAccesses) {
    const scope = core.slice(access.index, access.index + 2_500);
    assert.match(
      scope,
      /r\.snapshot_ativo\s+is\s+true/i,
      `acesso raw em ${access.index} nao restringe o snapshot vigente`,
    );
  }
});

test('reagendamento compara timestamp logico e aceita todos os estados conhecidos', () => {
  const core = functionBlock(
    migration(),
    'get_conciliacao_experimentais_snapshot_v1',
  );

  assert.match(
    core,
    /\(\s*le_reagendada\.data_experimental\s*,\s*coalesce\s*\(\s*le_reagendada\.horario_experimental\s*,\s*time\s*'00:00'\s*\)\s*\)\s*>\s*\(\s*le\.data_experimental\s*,\s*coalesce\s*\(\s*le\.horario_experimental\s*,\s*time\s*'00:00'\s*\)\s*\)/i,
  );

  for (const status of [
    'experimental_agendada',
    'experimental_realizada',
    'convertido',
    'matriculado',
    'experimental_faltou',
    'faltou',
    'no_show',
    'no-show',
    'cancelada',
    'cancelado',
    'experimental_cancelada',
  ]) {
    assert.match(core, new RegExp(`'${status.replace('-', '\\-')}'`, 'i'));
  }

  assert.match(
    core,
    /substituida_por_reagendamento\s+and\s+not\s+e\.presenca_raw_confirmada\s+and\s+not\s+e\.falta_raw_confirmada/i,
    'presenca ou falta raw ativa deve prevalecer sobre a heuristica',
  );
});

test('fachada preserva assinatura publica, P21, P22 e validacao P23', () => {
  const sql = migration();
  const facade = functionBlock(sql, 'get_conciliacao_experimentais_v2');
  const p21 = functionBlock(
    sql,
    'get_conciliacao_experimentais_snapshot_p21_v1',
  );

  assert.match(
    facade,
    /get_conciliacao_experimentais_v2\s*\(\s*p_unidade_id\s+uuid\s*,\s*p_ano\s+integer\s*,\s*p_mes\s+integer\s*,\s*p_periodo\s+text\s+default\s+'mensal'::text\s*,\s*p_data\s+date\s+default\s+null::date/i,
  );
  assert.match(facade, /security\s+definer/i);
  assert.match(facade, /from\s+public\.usuarios[\s\S]*auth_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(facade, /v_perfil\s*=\s*'unidade'[\s\S]*p_unidade_id\s+is\s+null/i);
  assert.match(facade, /p_unidade_id\s*<>\s*v_unidade_usuario/i);
  assert.match(facade, /usuario_tem_permissao\s*\([\s\S]*'comercial\.ver'/i);
  assert.match(facade, /get_conciliacao_experimentais_snapshot_p21_v1\s*\(/i);
  assert.match(p21, /get_conciliacao_experimentais_snapshot_v1\s*\(/i);

  assert.match(
    p21,
    /least\s*\(\s*v_conversoes_atual\s*,\s*v_matriculas_comerciais\s*\)/i,
  );
  assert.match(facade, /v_duplicidades_estimadas\s*:=\s*v_denominador\s*-\s*v_conversoes_original/i);
  assert.match(facade, /v_duplicidades_estimadas\s+between\s+1\s+and\s+5/i);
  assert.match(facade, /snapshot_ativo_p24/i);
});

test('ACL esconde nucleo e expoe apenas a fachada autenticada', () => {
  const sql = migration();

  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.get_conciliacao_experimentais_snapshot_v1\([^;]+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.get_conciliacao_experimentais_snapshot_v1\([^;]+to\s+service_role/i,
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.get_conciliacao_experimentais_v2\([^;]+from\s+public\s*,\s*anon/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.get_conciliacao_experimentais_v2\([^;]+to\s+authenticated\s*,\s*service_role/i,
  );
});
