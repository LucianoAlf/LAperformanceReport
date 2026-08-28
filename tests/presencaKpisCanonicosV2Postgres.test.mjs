import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260827031300_presenca_consumidores_numericos_v2.sql';

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = docker([
      'exec', container, 'pg_isready', '-h', '127.0.0.1',
      '-U', 'postgres', '-d', 'postgres',
    ]);
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL 17 descartavel nao ficou pronto');
}

function extractKernel(sql) {
  const startMarker = '-- BEGIN PRESENCA KPI V2 KERNEL';
  const endMarker = '-- END PRESENCA KPI V2 KERNEL';
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker);
  assert.notEqual(start, -1, 'marcador inicial do kernel ausente');
  assert.notEqual(end, -1, 'marcador final do kernel ausente');
  return sql.slice(start + startMarker.length, end);
}

test('PostgreSQL separa falta justificada e bloqueia stale ou incompleto', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-presenca-kpi-v2-${process.pid}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const kernel = extractKernel(migration);

    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;

      create table public.vw_presenca_ocorrencia_canonica_v2 (
        slot_key text,
        aluno_id integer,
        unidade_id uuid,
        professor_id integer,
        data_aula date,
        data_hora_inicio timestamptz,
        data_hora_fim timestamptz,
        curso_nome text,
        resultado_canonico text,
        fecha_chamada boolean,
        fonte_decisao text,
        decidido_em timestamptz,
        emusys_presenca_bruta text,
        possui_conflito boolean,
        ids_aulas_emusys integer[],
        regra_versao text
      );

      create table public.aulas_emusys (
        id integer primary key,
        unidade_id uuid not null,
        data_aula date not null,
        data_hora_fim timestamptz,
        categoria text,
        cancelada boolean,
        professor_id integer
      );

      create table public.presenca_sync_cobertura_fixture (
        unidade_id uuid,
        data_alvo date,
        publicavel boolean,
        finalizada_em timestamptz
      );

      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;

      create function public.fn_presenca_dados_frescos_interno_v1(uuid, date)
      returns jsonb language sql stable as $$
        select coalesce(
          (select jsonb_build_object(
             'publicavel', f.publicavel,
             'status', case when f.publicavel then 'concluida' else 'falhou' end,
             'finalizada_em', f.finalizada_em
           )
           from public.presenca_sync_cobertura_fixture f
           where f.unidade_id = $1 and f.data_alvo = $2),
          jsonb_build_object('publicavel', false, 'status', 'sem_cobertura')
        )
      $$;

      create function public.fn_presenca_pendencias_do_dia_v2(uuid, date)
      returns jsonb language plpgsql stable security definer as $$
      begin
        if coalesce(current_setting('request.jwt.claim.role', true), '') = 'authenticated'
           and $1 <> '10000000-0000-0000-0000-000000000001'::uuid then
          raise insufficient_privilege using message = 'UNIDADE_NAO_AUTORIZADA';
        end if;
        return jsonb_build_object(
          'dados_status', case
            when $1 = '40000000-0000-0000-0000-000000000004'::uuid
              then 'roster_em_revisao'
            when coalesce((public.fn_presenca_dados_frescos_interno_v1($1, $2)->>'publicavel')::boolean, false)
              then 'atualizados'
            else 'dados_desatualizados'
          end,
          'sincronizado_em', public.fn_presenca_dados_frescos_interno_v1($1, $2)->>'finalizada_em',
          'pendencias', case
            when $1 = '50000000-0000-0000-0000-000000000005'::uuid
              then jsonb_build_array(jsonb_build_object('slot_key', 'missing'))
            else '[]'::jsonb
          end,
          'conflitos', '[]'::jsonb,
          'revisoes_estruturais', case
            when $1 = '40000000-0000-0000-0000-000000000004'::uuid
              then jsonb_build_array(jsonb_build_object('aula_id', 4))
            else '[]'::jsonb
          end
        );
      end
      $$;

      ${kernel}
    `);

    const U_FRESH = '10000000-0000-0000-0000-000000000001';
    const U_STALE = '20000000-0000-0000-0000-000000000002';
    const U_REVIEW = '30000000-0000-0000-0000-000000000003';
    const U_ROSTER = '40000000-0000-0000-0000-000000000004';
    const U_MISSING = '50000000-0000-0000-0000-000000000005';
    const U_EMPTY = '60000000-0000-0000-0000-000000000006';

    psql(container, String.raw`
      insert into public.aulas_emusys values
        (1, '${U_FRESH}', '2026-08-20', '2026-08-20 12:00-03', 'normal', false, 10),
        (2, '${U_STALE}', '2026-08-20', '2026-08-20 12:00-03', 'normal', false, 20),
        (3, '${U_REVIEW}', '2026-08-20', '2026-08-20 12:00-03', 'normal', false, 30),
        (4, '${U_ROSTER}', '2026-08-20', '2026-08-20 12:00-03', 'normal', false, 40),
        (5, '${U_MISSING}', '2026-08-20', '2026-08-20 12:00-03', 'normal', false, 50);

      insert into public.presenca_sync_cobertura_fixture values
        ('${U_FRESH}', '2026-08-20', true, '2026-08-20 12:05-03'),
        ('${U_STALE}', '2026-08-20', false, '2026-08-20 11:00-03'),
        ('${U_REVIEW}', '2026-08-20', true, '2026-08-20 12:05-03'),
        ('${U_ROSTER}', '2026-08-20', true, '2026-08-20 12:05-03'),
        ('${U_MISSING}', '2026-08-20', true, '2026-08-20 12:05-03');

      insert into public.vw_presenca_ocorrencia_canonica_v2 values
        ('fresh-presente', 1, '${U_FRESH}', 10, '2026-08-20', '2026-08-20 09:00-03', '2026-08-20 10:00-03', 'Piano', 'presente', true, 'agenda_secretaria', now(), null, false, array[1], 'v2'),
        ('fresh-falta', 1, '${U_FRESH}', 10, '2026-08-20', '2026-08-20 10:00-03', '2026-08-20 11:00-03', 'Piano', 'falta', true, 'professor_la_teacher', now(), null, false, array[2], 'v2'),
        ('fresh-justificada-outro-curso', 1, '${U_FRESH}', 10, '2026-08-20', '2026-08-20 10:00-03', '2026-08-20 11:00-03', 'Canto', 'falta_justificada', true, 'agenda_secretaria', now(), null, false, array[3], 'v2'),
        ('stale-presente', 2, '${U_STALE}', 20, '2026-08-20', '2026-08-20 09:00-03', '2026-08-20 10:00-03', 'Bateria', 'presente', true, 'emusys', now(), 'presente', false, array[4], 'v2'),
        ('review-presente', 3, '${U_REVIEW}', 30, '2026-08-20', '2026-08-20 09:00-03', '2026-08-20 10:00-03', 'Violao', 'presente', true, 'agenda_secretaria', now(), null, true, array[5], 'v2'),
        ('review-indeterminado', 3, '${U_REVIEW}', 30, '2026-08-20', '2026-08-20 10:00-03', '2026-08-20 11:00-03', 'Violao', 'indeterminado', false, 'indeterminado', now(), 'ausente', false, array[6], 'v2');
    `);

    const fresh = JSON.parse(psql(container, String.raw`
      select row_to_json(x) from public.get_presenca_metricas_canonicas_v2(
        '${U_FRESH}', '2026-08-20', '2026-08-20', 10, 1
      ) x;
    `));
    assert.equal(fresh.denominador, 3);
    assert.equal(fresh.presentes, 1);
    assert.equal(fresh.faltas, 1);
    assert.equal(fresh.faltas_justificadas, 1);
    assert.equal(fresh.faltas_total, 2);
    assert.equal(fresh.percentual_presenca, 33.33);
    assert.equal(fresh.dados_status, 'atualizados');
    assert.equal(fresh.estado_publicacao, 'publicavel');

    const stale = JSON.parse(psql(container, String.raw`
      select row_to_json(x) from public.get_presenca_metricas_canonicas_v2(
        '${U_STALE}', '2026-08-20', '2026-08-20', 20, 2
      ) x;
    `));
    assert.equal(stale.estado_publicacao, 'bloqueado_frescor');
    assert.equal(stale.dados_status, 'dados_desatualizados');
    for (const field of ['denominador', 'presentes', 'faltas', 'faltas_justificadas', 'faltas_total', 'percentual_presenca']) {
      assert.equal(stale[field], null, `${field} stale deveria ser null`);
    }

    const review = JSON.parse(psql(container, String.raw`
      select row_to_json(x) from public.get_presenca_metricas_canonicas_v2(
        '${U_REVIEW}', '2026-08-20', '2026-08-20', 30, 3
      ) x;
    `));
    assert.equal(review.estado_publicacao, 'em_auditoria');
    assert.equal(review.dados_status, 'em_auditoria');
    assert.equal(review.percentual_presenca, null);
    assert.equal(review.ocorrencias_incompletas, 2);
    assert.equal(review.conflitos, 1);

    const roster = JSON.parse(psql(container, String.raw`
      select row_to_json(x) from public.get_presenca_metricas_canonicas_v2(
        '${U_ROSTER}', '2026-08-20', '2026-08-20', null, null
      ) x;
    `));
    assert.equal(roster.estado_publicacao, 'bloqueado_roster');
    assert.equal(roster.dados_status, 'roster_em_revisao');
    assert.equal(roster.denominador, null);

    const missing = JSON.parse(psql(container, String.raw`
      select row_to_json(x) from public.get_presenca_metricas_canonicas_v2(
        '${U_MISSING}', '2026-08-20', '2026-08-20', null, null
      ) x;
    `));
    assert.equal(missing.estado_publicacao, 'em_auditoria');
    assert.equal(missing.denominador, null);

    const empty = JSON.parse(psql(container, String.raw`
      select row_to_json(x) from public.get_presenca_metricas_canonicas_v2(
        '${U_EMPTY}', '2026-08-20', '2026-08-20', null, null
      ) x;
    `));
    assert.equal(empty.estado_publicacao, 'sem_base');
    assert.equal(empty.dados_status, 'sem_base');
    assert.equal(empty.ocorrencias_observadas, 0);
    assert.equal(empty.denominador, null);

    const aclUnidade = psql(container, String.raw`
      set session authorization authenticated;
      select set_config('request.jwt.claim.role', 'authenticated', false);
      select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
      select public.fn_presenca_estado_publicacao_periodo_v2(
        '${U_FRESH}', '2026-08-20', '2026-08-20'
      )->>'estado_publicacao';
      do $acl$
      begin
        begin
          perform public.fn_presenca_estado_publicacao_periodo_v2(
            '${U_STALE}', '2026-08-20', '2026-08-20'
          );
          raise exception 'metadata cross-unit liberada';
        exception when insufficient_privilege then null;
        end;
      end
      $acl$;
    `);
    assert.match(aclUnidade, /publicavel/u);

    const acl = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'view_anon', has_table_privilege('anon', 'public.vw_presenca_ocorrencia_metrica_v2', 'select'),
        'view_auth', has_table_privilege('authenticated', 'public.vw_presenca_ocorrencia_metrica_v2', 'select'),
        'view_service', has_table_privilege('service_role', 'public.vw_presenca_ocorrencia_metrica_v2', 'select'),
        'rpc_anon', has_function_privilege('anon', 'public.get_presenca_metricas_canonicas_v2(uuid,date,date,integer,integer)', 'execute'),
        'rpc_auth', has_function_privilege('authenticated', 'public.get_presenca_metricas_canonicas_v2(uuid,date,date,integer,integer)', 'execute'),
        'rpc_service', has_function_privilege('service_role', 'public.get_presenca_metricas_canonicas_v2(uuid,date,date,integer,integer)', 'execute')
      );
    `));
    assert.deepEqual(acl, {
      view_anon: false,
      view_auth: false,
      view_service: true,
      rpc_anon: false,
      rpc_auth: false,
      rpc_service: true,
    });
  } finally {
    docker(['rm', '-f', container]);
  }
});
