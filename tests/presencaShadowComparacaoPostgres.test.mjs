import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260827031500_presenca_shadow_comparacao_v2.sql';

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

test('shadow e previa sao estritamente read-only e service-role only', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /get_presenca_shadow_comparacao_v2/u);
  assert.match(sql, /get_presenca_previa_reparo_v2/u);
  assert.match(sql, /sem_explicacao/u);
  assert.match(sql, /amostras_redigidas/u);
  assert.match(sql, /backfill_presenca_falta', false/u);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate)\b/iu);
  assert.match(sql, /grant execute[\s\S]*to service_role/iu);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to (?:anon|authenticated)/iu);
});

test('shadow explica deltas e fecha 30 dias nas tres unidades', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-presenca-shadow-${process.pid}`;
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
      create role app_user login password 'app' in role authenticated;

      create table public.unidades (id uuid primary key, nome text);
      create table public.aulas_emusys (
        id integer primary key, unidade_id uuid, professor_id integer,
        data_aula date, data_hora_inicio timestamptz, data_hora_fim timestamptz,
        duracao_minutos integer, curso_nome text, categoria text,
        cancelada boolean default false, justificada boolean default false
      );
      create table public.aluno_presenca (
        id integer primary key, aluno_id integer, unidade_id uuid,
        professor_id integer, data_aula date, horario_aula time,
        curso_nome text, aula_emusys_id integer,
        status text, status_presenca text, respondido_por text,
        respondido_em timestamptz, emusys_presenca_bruta text,
        sincronizado_emusys_em timestamptz
      );
      create table public.aula_alunos_emusys (
        id integer primary key, aula_emusys_id integer, unidade_id uuid,
        aluno_id integer, ativo_operacional boolean,
        ultimo_run_visto uuid
      );
      create table public.aula_roster_sync_estado (
        aula_id integer primary key, unidade_id uuid, run_id uuid,
        estado text, qtd_esperada integer, qtd_recebida integer,
        snapshot_hash text
      );
      create table public.presenca_sync_cobertura (
        unidade_id uuid, modo text, data_alvo date,
        status text, snapshot_hash text
      );
      create table public.vw_presenca_ocorrencia_canonica_v2 (
        slot_key text, aluno_id integer, unidade_id uuid,
        professor_id integer, data_aula date,
        data_hora_inicio timestamptz, data_hora_fim timestamptz,
        curso_nome text, resultado_canonico text, fecha_chamada boolean,
        fonte_decisao text, decidido_em timestamptz,
        emusys_presenca_bruta text, possui_conflito boolean,
        ids_aulas_emusys integer[], regra_versao text
      );
      create function public.fn_presenca_slot_key_v2(
        integer, uuid, integer, timestamptz, timestamptz, text
      ) returns text language sql immutable as $$
        select md5(jsonb_build_array(
          $1, $2::text, $3, extract(epoch from $4), extract(epoch from $5),
          lower(btrim(coalesce($6, '')))
        )::text)
      $$;
    `);

    psql(container, readFileSync(migrationPath, 'utf8'));

    const units = [
      '81000000-0000-0000-0000-000000000001',
      '81000000-0000-0000-0000-000000000002',
      '81000000-0000-0000-0000-000000000003',
    ];

    psql(container, String.raw`
      insert into public.unidades values
        ('${units[0]}', 'Recreio'),
        ('${units[1]}', 'Barra'),
        ('${units[2]}', 'Campo Grande');

      with fixture as (
        select
          u.ord,
          u.unidade_id,
          g.i,
          (date '2026-08-01' + g.i)::date as dia,
          u.ord * 1000 + g.i as aula_id,
          u.ord * 1000 + g.i as presenca_id,
          u.ord * 100 + g.i as aluno_id,
          ('82000000-0000-0000-0000-' || lpad((u.ord * 1000 + g.i)::text, 12, '0'))::uuid as run_id
        from (values
          (1, '${units[0]}'::uuid),
          (2, '${units[1]}'::uuid),
          (3, '${units[2]}'::uuid)
        ) u(ord, unidade_id)
        cross join generate_series(0, 29) g(i)
      )
      insert into public.aulas_emusys(
        id, unidade_id, professor_id, data_aula, data_hora_inicio,
        data_hora_fim, duracao_minutos, curso_nome, categoria
      ) select
        aula_id, unidade_id, 10, dia,
        (dia::timestamp + time '12:00') at time zone 'America/Sao_Paulo',
        (dia::timestamp + time '13:00') at time zone 'America/Sao_Paulo',
        60, 'Piano', 'normal'
      from fixture;

      with fixture as (
        select u.ord, u.unidade_id, g.i,
          (date '2026-08-01' + g.i)::date as dia,
          u.ord * 1000 + g.i as aula_id,
          u.ord * 1000 + g.i as presenca_id,
          u.ord * 100 + g.i as aluno_id,
          ('82000000-0000-0000-0000-' || lpad((u.ord * 1000 + g.i)::text, 12, '0'))::uuid as run_id
        from (values
          (1, '${units[0]}'::uuid), (2, '${units[1]}'::uuid),
          (3, '${units[2]}'::uuid)
        ) u(ord, unidade_id)
        cross join generate_series(0, 29) g(i)
      )
      insert into public.aluno_presenca(
        id, aluno_id, unidade_id, professor_id, data_aula, curso_nome,
        aula_emusys_id, status, status_presenca, respondido_por,
        emusys_presenca_bruta, sincronizado_emusys_em
      ) select
        presenca_id, aluno_id, unidade_id, 10, dia, 'Piano', aula_id,
        'presente', null, 'emusys', 'presente', now()
      from fixture;

      with fixture as (
        select u.ord, u.unidade_id, g.i,
          (date '2026-08-01' + g.i)::date as dia,
          u.ord * 1000 + g.i as aula_id,
          u.ord * 100 + g.i as aluno_id,
          ('82000000-0000-0000-0000-' || lpad((u.ord * 1000 + g.i)::text, 12, '0'))::uuid as run_id
        from (values
          (1, '${units[0]}'::uuid), (2, '${units[1]}'::uuid),
          (3, '${units[2]}'::uuid)
        ) u(ord, unidade_id)
        cross join generate_series(0, 29) g(i)
      )
      insert into public.aula_roster_sync_estado
      select aula_id, unidade_id, run_id, 'completo', 1, 1, repeat('a', 32)
      from fixture;

      with fixture as (
        select u.ord, u.unidade_id, g.i,
          u.ord * 1000 + g.i as aula_id,
          u.ord * 100 + g.i as aluno_id,
          ('82000000-0000-0000-0000-' || lpad((u.ord * 1000 + g.i)::text, 12, '0'))::uuid as run_id
        from (values
          (1, '${units[0]}'::uuid), (2, '${units[1]}'::uuid),
          (3, '${units[2]}'::uuid)
        ) u(ord, unidade_id)
        cross join generate_series(0, 29) g(i)
      )
      insert into public.aula_alunos_emusys
      select aula_id, aula_id, unidade_id, aluno_id, true, run_id from fixture;

      insert into public.presenca_sync_cobertura
      select u.unidade_id, 'presenca', (date '2026-08-01' + g.i)::date,
        'concluida', repeat('b', 64)
      from (values ('${units[0]}'::uuid), ('${units[1]}'::uuid),
                   ('${units[2]}'::uuid)) u(unidade_id)
      cross join generate_series(0, 29) g(i);

      insert into public.vw_presenca_ocorrencia_canonica_v2
      select
        public.fn_presenca_slot_key_v2(
          ap.aluno_id, ap.unidade_id, ae.professor_id,
          ae.data_hora_inicio, ae.data_hora_fim, ae.curso_nome
        ), ap.aluno_id, ap.unidade_id, ae.professor_id, ae.data_aula,
        ae.data_hora_inicio, ae.data_hora_fim, ae.curso_nome,
        'presente', true, 'emusys', now(), 'presente', false,
        array[ae.id], 'fixture-v2'
      from public.aluno_presenca ap
      join public.aulas_emusys ae on ae.id = ap.aula_emusys_id;
    `);

    const coverage = JSON.parse(psql(container, String.raw`
      select set_config('request.jwt.claim.role', 'service_role', false);
      with resultado as (
        select x.*
        from (values ('${units[0]}'::uuid), ('${units[1]}'::uuid),
                     ('${units[2]}'::uuid)) u(unidade_id)
        cross join lateral public.get_presenca_shadow_comparacao_v2(
          u.unidade_id, date '2026-08-01', date '2026-08-30'
        ) x
      )
      select json_build_object(
        'linhas', count(*),
        'sem_explicacao', sum(sem_explicacao),
        'sync_incompleto', sum(sync_incompleto),
        'delta_absoluto', sum(abs(delta))
      ) from resultado;
    `).split(/\r?\n/u).at(-1));
    assert.deepEqual(coverage, {
      linhas: 90,
      sem_explicacao: 0,
      sync_incompleto: 0,
      delta_absoluto: 0,
    });

    const scenarios = JSON.parse(psql(container, String.raw`
      select set_config('request.jwt.claim.role', 'service_role', false);
      -- Gemeas: duas linhas legadas, um slot canonico.
      insert into public.aulas_emusys values
        (9001, '${units[0]}', 10, '2026-07-31', '2026-07-31 12:00-03', '2026-07-31 13:00-03', 60, 'Piano', 'normal', false, false),
        (9002, '${units[0]}', 10, '2026-07-31', '2026-07-31 12:00-03', '2026-07-31 13:00-03', 60, 'Piano', 'normal', false, false),
        (9003, '${units[0]}', 10, '2026-07-30', '2026-07-30 12:00-03', '2026-07-30 13:00-03', 60, 'Piano', 'normal', false, false),
        (9004, '${units[0]}', 10, '2026-07-29', '2026-07-29 12:00-03', '2026-07-29 13:00-03', 60, 'Piano', 'normal', false, false),
        (9005, '${units[0]}', 10, '2026-07-28', '2026-07-28 12:00-03', '2026-07-28 13:00-03', 60, 'Piano', 'normal', false, false),
        (9006, '${units[0]}', 10, '2026-07-26', '2026-07-26 12:00-03', '2026-07-26 13:00-03', 60, 'Piano', 'normal', false, false);
      insert into public.aluno_presenca values
        (9001, 77, '${units[0]}', 10, '2026-07-31', null, 'Piano', 9001, 'presente', null, 'emusys', null, 'presente', now()),
        (9002, 77, '${units[0]}', 10, '2026-07-31', null, 'Piano', 9002, 'presente', null, 'emusys', null, 'presente', now()),
        (9003, 78, '${units[0]}', 10, '2026-07-30', null, 'Piano', 9003, 'ausente', null, 'emusys', null, 'ausente', now()),
        (9004, 79, '${units[0]}', 10, '2026-07-29', null, 'Piano', 9004, 'presente', null, 'emusys', null, 'presente', now()),
        (9006, 80, '${units[0]}', 10, '2026-07-27', '12:00', 'Piano', null, 'presente', 'presente', 'agenda_secretaria', now(), null, null),
        (9007, 81, '${units[0]}', 10, '2026-07-26', null, 'Piano', 9006, 'presente', null, 'emusys', null, 'presente', now());
      insert into public.presenca_sync_cobertura values
        ('${units[0]}', 'presenca', '2026-07-31', 'concluida', repeat('c', 64)),
        ('${units[0]}', 'presenca', '2026-07-30', 'concluida', repeat('c', 64)),
        ('${units[0]}', 'presenca', '2026-07-29', 'concluida', repeat('c', 64));
      insert into public.aula_roster_sync_estado values
        (9001, '${units[0]}', '83000000-0000-0000-0000-000000009001', 'completo', 1, 1, repeat('d', 32)),
        (9002, '${units[0]}', '83000000-0000-0000-0000-000000009002', 'completo', 1, 1, repeat('d', 32)),
        (9005, '${units[0]}', '83000000-0000-0000-0000-000000009005', 'completo', 2, 1, repeat('d', 32));
      insert into public.aula_alunos_emusys values
        (9001, 9001, '${units[0]}', 77, true, '83000000-0000-0000-0000-000000000001'),
        (9002, 9002, '${units[0]}', 77, true, '83000000-0000-0000-0000-000000009002');
      insert into public.vw_presenca_ocorrencia_canonica_v2 values
        (public.fn_presenca_slot_key_v2(77, '${units[0]}', 10, '2026-07-31 12:00-03', '2026-07-31 13:00-03', 'Piano'), 77, '${units[0]}', 10, '2026-07-31', '2026-07-31 12:00-03', '2026-07-31 13:00-03', 'Piano', 'presente', true, 'emusys', now(), 'presente', false, array[9001,9002], 'fixture-v2'),
        (public.fn_presenca_slot_key_v2(78, '${units[0]}', 10, '2026-07-30 12:00-03', '2026-07-30 13:00-03', 'Piano'), 78, '${units[0]}', 10, '2026-07-30', '2026-07-30 12:00-03', '2026-07-30 13:00-03', 'Piano', 'indeterminado', false, 'indeterminado', now(), 'ausente', false, array[9003], 'fixture-v2'),
        (public.fn_presenca_slot_key_v2(79, '${units[0]}', 10, '2026-07-29 12:00-03', '2026-07-29 13:00-03', 'Piano'), 79, '${units[0]}', 10, '2026-07-29', '2026-07-29 12:00-03', '2026-07-29 13:00-03', 'Piano', 'falta', true, 'agenda_secretaria', now(), 'presente', false, array[9004], 'fixture-v2'),
        (public.fn_presenca_slot_key_v2(81, '${units[0]}', 10, '2026-07-26 12:00-03', '2026-07-26 13:00-03', 'Piano'), 81, '${units[0]}', 10, '2026-07-26', '2026-07-26 12:00-03', '2026-07-26 13:00-03', 'Piano', 'falta', true, 'agenda_secretaria', now(), 'presente', false, array[9006], 'fixture-v2');

      select json_build_object(
        'gemeas', (select row_to_json(x) from public.get_presenca_shadow_comparacao_v2('${units[0]}', '2026-07-31', '2026-07-31') x),
        'politica', (select row_to_json(x) from public.get_presenca_shadow_comparacao_v2('${units[0]}', '2026-07-30', '2026-07-30') x),
        'nao_explicado', (select row_to_json(x) from public.get_presenca_shadow_comparacao_v2('${units[0]}', '2026-07-29', '2026-07-29') x),
        'sync_nao_mascara', (select row_to_json(x) from public.get_presenca_shadow_comparacao_v2('${units[0]}', '2026-07-26', '2026-07-26') x),
        'previa', public.get_presenca_previa_reparo_v2('${units[0]}', '2026-07-27', '2026-07-31')
      );
    `).split(/\r?\n/u).at(-1));

    assert.equal(scenarios.gemeas.contagem_v1, 2);
    assert.equal(scenarios.gemeas.contagem_v2, 1);
    assert.equal(scenarios.gemeas.delta, -1);
    assert.equal(scenarios.gemeas.duplicidade_emusys, 1);
    assert.equal(scenarios.gemeas.sem_explicacao, 0);
    assert.equal(scenarios.politica.politica_temporal, 1);
    assert.equal(scenarios.politica.sem_explicacao, 0);
    assert.equal(scenarios.nao_explicado.sem_explicacao, 1);
    assert.equal(scenarios.sync_nao_mascara.sync_incompleto, 1);
    assert.equal(scenarios.sync_nao_mascara.sem_explicacao, 1);
    assert.equal(scenarios.previa.dry_run, true);
    assert.equal(scenarios.previa.backfill_presenca_falta, false);
    assert.deepEqual(Object.keys(scenarios.previa.acoes).sort(), [
      'estados_snapshot_corrigir',
      'funcoes_live_only_versionar',
      'gemeas_reconciliar',
      'vinculos_roster_soft_inativar',
    ]);
    assert.ok(scenarios.previa.acoes.vinculos_roster_soft_inativar.length >= 1);
    assert.ok(scenarios.previa.acoes.estados_snapshot_corrigir.length >= 1);
    assert.ok(scenarios.previa.acoes.gemeas_reconciliar.length >= 1);
    assert.deepEqual(
      scenarios.previa.integridade_decisoes_humanas.antes,
      scenarios.previa.integridade_decisoes_humanas.depois,
    );
    assert.equal(
      scenarios.previa.integridade_decisoes_humanas.alteracao_prevista,
      false,
    );

    const unauthorized = docker([
      'exec', '-e', 'PGPASSWORD=app', '-i', container,
      'psql', '-h', '127.0.0.1', '-v', 'ON_ERROR_STOP=1',
      '-U', 'app_user', '-d', 'postgres', '-At',
    ], String.raw`
      select set_config('request.jwt.claim.role', 'authenticated', false);
      select * from public.get_presenca_shadow_comparacao_v2(
        '${units[0]}', '2026-08-01', '2026-08-01'
      );
    `);
    assert.notEqual(unauthorized.status, 0);
  } finally {
    docker(['rm', '-f', container]);
  }
});
