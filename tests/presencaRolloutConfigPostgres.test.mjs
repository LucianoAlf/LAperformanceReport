import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260827031600_presenca_rollout_config.sql';

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function psql(container, sql) {
  const result = docker([
    'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function psqlAs(container, user, password, sql, expectedStatus = 0) {
  const result = docker([
    'exec', '-e', `PGPASSWORD=${password}`, '-i', container,
    'psql', '-h', '127.0.0.1', '-v', 'ON_ERROR_STOP=1',
    '-U', user, '-d', 'postgres', '-At',
  ], sql);
  assert.equal(
    result.status,
    expectedStatus,
    `${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker([
      'exec', container, 'pg_isready', '-h', '127.0.0.1',
      '-U', 'postgres', '-d', 'postgres',
    ]).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL 17 descartavel nao ficou pronto');
}

test('contrato de rollout e fechado, auditavel e sem cutover inicial', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  for (const surface of [
    'agenda', 'sol', 'la_teacher', 'lia', 'mila', 'relatorios', 'kpis',
  ]) assert.match(sql, new RegExp(`'${surface}'`, 'u'));
  for (const mode of ['legado', 'sombra', 'canonico_v2']) {
    assert.match(sql, new RegExp(`'${mode}'`, 'u'));
  }
  assert.match(sql, /alter table public\.presenca_rollout_config enable row level security/iu);
  assert.match(sql, /alter table public\.presenca_rollout_eventos enable row level security/iu);
  assert.match(sql, /admin_alterar_presenca_rollout_v1/iu);
  assert.match(sql, /get_presenca_rollout_modo_v1/iu);
  assert.match(sql, /fn_presenca_rollout_modo_interno_v1/iu);
  assert.match(sql, /dias_operacionais/iu);
  assert.match(sql, /sem_explicacao/iu);
  assert.match(sql, /publicacao_tecnica_inicial_sem_cutover/iu);
  for (const trigger of [
    'sync_incompleto_sem_bloqueio',
    'divergencia_agenda_sol',
    'comando_sem_recibo',
    'decisao_humana_sobrescrita',
    'vazamento_acl',
    'delta_sem_explicacao',
  ]) assert.match(sql, new RegExp(`'${trigger}'`, 'u'));
  assert.doesNotMatch(sql, /delete\s+from\s+public\.presenca_rollout_eventos/iu);
  assert.doesNotMatch(sql, /truncate\s+public\.presenca_rollout_eventos/iu);
});

test('PostgreSQL governa ondas e rollback por flag sem tocar presencas', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-presenca-rollout-${process.pid}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr);

  try {
    await waitForPostgres(container);
    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role app_admin login password 'admin' in role authenticated;
      create role app_user login password 'user' in role authenticated;
      create role app_service login password 'service' bypassrls in role service_role;

      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.unidades (id uuid primary key, nome text, ativa boolean);
      insert into public.unidades values
        ('91000000-0000-0000-0000-000000000001', 'Recreio', true),
        ('91000000-0000-0000-0000-000000000002', 'Barra', true);
      create function public.is_admin() returns boolean language sql stable as $$
        select current_setting('request.jwt.claim.email', true) = 'admin@la.test'
      $$;
    `);

    psql(container, readFileSync(migrationPath, 'utf8'));
    psql(container, String.raw`
      create function public.fixture_consumidor_rollout_interno(uuid, text)
      returns text language sql stable security definer
      set search_path = pg_catalog, public as $$
        select public.fn_presenca_rollout_modo_interno_v1($1, $2)
      $$;
      revoke all on function public.fixture_consumidor_rollout_interno(uuid, text)
        from public, anon, authenticated, service_role;
      grant execute on function public.fixture_consumidor_rollout_interno(uuid, text)
        to authenticated;
    `);

    const seeded = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'configuracoes', count(*),
        'todas_sombra', bool_and(modo = 'sombra'),
        'superficies', count(distinct superficie),
        'eventos', (select count(*) from public.presenca_rollout_eventos)
      ) from public.presenca_rollout_config;
    `));
    assert.deepEqual(seeded, {
      configuracoes: 14,
      todas_sombra: true,
      superficies: 7,
      eventos: 0,
    });

    const unitRecreio = '91000000-0000-0000-0000-000000000001';
    const unitBarra = '91000000-0000-0000-0000-000000000002';
    const actor = '92000000-0000-4000-8000-000000000001';
    const requestCanonical = '93000000-0000-4000-8000-000000000001';
    const requestRollback = '93000000-0000-4000-8000-000000000002';
    const validEvidence = JSON.stringify({
      dias_operacionais: 7,
      sem_explicacao: 0,
      sync_completo: true,
      agenda_sol_convergente: true,
      comandos_sem_recibo: 0,
      decisoes_humanas_sobrescritas: 0,
      vazamento_acl: 0,
    });

    const internalRead = psqlAs(container, 'app_user', 'user', String.raw`
      select set_config('request.jwt.claim.role', 'authenticated', false);
      select public.fixture_consumidor_rollout_interno('${unitRecreio}', 'agenda');
    `).split(/\r?\n/u).at(-1);
    assert.equal(internalRead, 'sombra');
    psqlAs(container, 'app_user', 'user', String.raw`
      select public.fn_presenca_rollout_modo_interno_v1('${unitRecreio}', 'agenda');
    `, 3);

    psqlAs(container, 'app_user', 'user', String.raw`
      select set_config('request.jwt.claim.role', 'authenticated', false);
      select set_config('request.jwt.claim.email', 'user@la.test', false);
      select set_config('request.jwt.claim.sub', '${actor}', false);
      select public.admin_alterar_presenca_rollout_v1(
        '${unitRecreio}', 'agenda', 'canonico_v2', 'tentativa sem admin',
        '${requestCanonical}', '${validEvidence}'::jsonb
      );
    `, 3);

    psqlAs(container, 'app_admin', 'admin', String.raw`
      select set_config('request.jwt.claim.role', 'authenticated', false);
      select set_config('request.jwt.claim.email', 'admin@la.test', false);
      select set_config('request.jwt.claim.sub', '${actor}', false);
      select public.admin_alterar_presenca_rollout_v1(
        '${unitRecreio}', 'agenda', 'canonico_v2', 'janela insuficiente',
        '${requestCanonical}', jsonb_build_object(
          'dias_operacionais', 6, 'sem_explicacao', 0,
          'sync_completo', true, 'agenda_sol_convergente', true,
          'comandos_sem_recibo', 0, 'decisoes_humanas_sobrescritas', 0,
          'vazamento_acl', 0
        )
      );
    `, 3);

    const activated = JSON.parse(psqlAs(
      container,
      'app_admin',
      'admin',
      String.raw`
        select set_config('request.jwt.claim.role', 'authenticated', false);
        select set_config('request.jwt.claim.email', 'admin@la.test', false);
        select set_config('request.jwt.claim.sub', '${actor}', false);
        select public.admin_alterar_presenca_rollout_v1(
          '${unitRecreio}', 'agenda', 'canonico_v2',
          'onda 1 aprovada apos sete dias verdes', '${requestCanonical}',
          '${validEvidence}'::jsonb
        );
      `,
    ).split(/\r?\n/u).at(-1));
    assert.equal(activated.aplicada, true);
    assert.equal(activated.modo_anterior, 'sombra');
    assert.equal(activated.modo_atual, 'canonico_v2');

    const replay = JSON.parse(psqlAs(
      container,
      'app_admin',
      'admin',
      String.raw`
        select set_config('request.jwt.claim.role', 'authenticated', false);
        select set_config('request.jwt.claim.email', 'admin@la.test', false);
        select set_config('request.jwt.claim.sub', '${actor}', false);
        select public.admin_alterar_presenca_rollout_v1(
          '${unitRecreio}', 'agenda', 'canonico_v2',
          'onda 1 aprovada apos sete dias verdes', '${requestCanonical}',
          '${validEvidence}'::jsonb
        );
      `,
    ).split(/\r?\n/u).at(-1));
    assert.equal(replay.aplicada, false);
    assert.equal(replay.idempotente, true);

    psqlAs(container, 'app_admin', 'admin', String.raw`
      select set_config('request.jwt.claim.role', 'authenticated', false);
      select set_config('request.jwt.claim.email', 'admin@la.test', false);
      select set_config('request.jwt.claim.sub', '${actor}', false);
      select public.admin_alterar_presenca_rollout_v1(
        '${unitRecreio}', 'agenda', 'legado', 'reuso conflitante',
        '${requestCanonical}', '{}'::jsonb
      );
    `, 3);

    psqlAs(container, 'app_admin', 'admin', String.raw`
      select set_config('request.jwt.claim.role', 'authenticated', false);
      select set_config('request.jwt.claim.email', 'admin@la.test', false);
      select set_config('request.jwt.claim.sub', '${actor}', false);
      select public.admin_alterar_presenca_rollout_v1(
        '${unitRecreio}', 'agenda', 'legado',
        'rollback: gatilho nao governado', '${requestRollback}',
        jsonb_build_object('gatilho', 'motivo_inventado')
      );
    `, 3);

    const rollback = JSON.parse(psqlAs(
      container,
      'app_admin',
      'admin',
      String.raw`
        select set_config('request.jwt.claim.role', 'authenticated', false);
        select set_config('request.jwt.claim.email', 'admin@la.test', false);
        select set_config('request.jwt.claim.sub', '${actor}', false);
        select public.admin_alterar_presenca_rollout_v1(
          '${unitRecreio}', 'agenda', 'legado',
          'rollback: divergencia Agenda x Sol', '${requestRollback}',
          jsonb_build_object('gatilho', 'divergencia_agenda_sol')
        );
      `,
    ).split(/\r?\n/u).at(-1));
    assert.equal(rollback.aplicada, true);
    assert.equal(rollback.modo_anterior, 'canonico_v2');
    assert.equal(rollback.modo_atual, 'legado');

    const finalState = JSON.parse(psqlAs(
      container,
      'app_service',
      'service',
      String.raw`
        select set_config('request.jwt.claim.role', 'service_role', false);
        select json_build_object(
          'recreio', public.get_presenca_rollout_modo_v1('${unitRecreio}', 'agenda'),
          'barra', public.get_presenca_rollout_modo_v1('${unitBarra}', 'agenda'),
          'eventos', (select count(*) from public.presenca_rollout_eventos
            where unidade_id = '${unitRecreio}' and superficie = 'agenda'),
          'presenca_criada', to_regclass('public.aluno_presenca') is not null
        );
      `,
    ).split(/\r?\n/u).at(-1));
    assert.deepEqual(finalState, {
      recreio: 'legado',
      barra: 'sombra',
      eventos: 2,
      presenca_criada: false,
    });

    psqlAs(container, 'app_admin', 'admin', String.raw`
      update public.presenca_rollout_config set modo = 'canonico_v2';
    `, 3);
    psqlAs(container, 'app_service', 'service', String.raw`
      delete from public.presenca_rollout_eventos;
    `, 3);
  } finally {
    docker(['rm', '-f', container]);
  }
});
