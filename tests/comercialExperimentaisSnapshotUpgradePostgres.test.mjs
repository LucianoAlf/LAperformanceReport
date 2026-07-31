import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260731163000_snapshot_experimentais_acl_payload_duravel.sql';
const requirePostgres = process.env.COMERCIAL_EXP_REQUIRE_POSTGRES === '1';

function psql(containerName, input) {
  return spawnSync(
    'docker',
    [
      'exec',
      '--interactive',
      containerName,
      'psql',
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--username',
      'postgres',
      '--dbname',
      'postgres',
    ],
    { encoding: 'utf8', input },
  );
}

test('upgrade posterior recupera bancos com 160500 e 161000 antigos', {
  skip: !requirePostgres,
  timeout: 30_000,
}, () => {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);

  const image =
    process.env.COMERCIAL_EXP_POSTGRES_IMAGE || 'postgres:17-alpine';
  const containerName =
    `la-comercial-exp-upgrade-${process.pid}-${Date.now()}`;
  const started = spawnSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--env',
      'POSTGRES_PASSWORD=postgres',
      image,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(
    started.status,
    0,
    `PostgreSQL de upgrade nao iniciou:\n${started.stderr}`,
  );

  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const readiness = spawnSync(
        'docker',
        [
          'exec',
          containerName,
          'pg_isready',
          '--username',
          'postgres',
          '--dbname',
          'postgres',
        ],
        { encoding: 'utf8' },
      );
      if (readiness.status === 0) {
        ready = true;
        break;
      }
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        250,
      );
    }
    assert.equal(ready, true, 'PostgreSQL de upgrade nao ficou pronto');

    const oldState = psql(
      containerName,
      String.raw`
        \set ON_ERROR_STOP on

        create role anon;
        create role authenticated;
        create role service_role;

        create table public.emusys_experimentais_raw (
          id bigserial primary key,
          aluno_nome text not null,
          data_aula date not null,
          horario_aula time without time zone,
          situacao_operacional text not null,
          professor_id integer,
          unidade_id uuid not null,
          payload jsonb not null,
          emusys_lead_id integer,
          emusys_aluno_id integer,
          emusys_aula_id integer not null
        );

        insert into public.emusys_experimentais_raw (
          aluno_nome,
          data_aula,
          horario_aula,
          situacao_operacional,
          professor_id,
          unidade_id,
          payload,
          emusys_lead_id,
          emusys_aluno_id,
          emusys_aula_id
        ) values (
          'Aluno Upgrade',
          '2026-07-10',
          '10:00',
          'presente',
          1,
          '11111111-1111-1111-1111-111111111111',
          jsonb_build_object(
            'schema_version', 1,
            'data_aula', '2026-07-10',
            'horario_aula', '10:00',
            'cancelada', false,
            'aula', jsonb_build_object('id', 10),
            'participante', jsonb_build_object(
              'id_lead', null,
              'id_aluno', 202
            )
          ),
          null,
          202,
          10
        );

        create or replace function public.fixture_consumidor_upgrade()
        returns boolean
        language sql
        stable
        as $fixture$
          select coalesce(bool_or(
            nullif(r.emusys_lead_id::text, '') = '0'
            and (
              case
                when nullif(r.emusys_aluno_id::text, '') ~ '^[0-9]+$'
                  then r.emusys_aluno_id::bigint
                else 0
              end
            ) > 0
          ), false)
          from public.emusys_experimentais_raw r
        $fixture$;

        do $before$
        begin
          if public.fixture_consumidor_upgrade() then
            raise exception 'fixture antiga nao representa o scrub com zero perdido';
          end if;
        end;
        $before$;
      `,
    );
    assert.equal(
      oldState.status,
      0,
      `nao preparou estado das migrations antigas:\n${oldState.stderr}`,
    );

    const applied = psql(
      containerName,
      readFileSync(migrationPath, 'utf8'),
    );
    assert.equal(
      applied.status,
      0,
      `upgrade posterior falhou:\n${applied.stderr}`,
    );

    const assertions = psql(
      containerName,
      String.raw`
        \set ON_ERROR_STOP on

        do $upgrade$
        declare
          v_definicao text;
        begin
          if not public.fixture_consumidor_upgrade() then
            raise exception 'consumidor antigo nao recuperou id_lead zero';
          end if;

          select pg_get_functiondef(p.oid)
          into v_definicao
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'fixture_consumidor_upgrade';

          if v_definicao not like '%r.emusys_lead_id_zero%' then
            raise exception 'consumidor antigo nao foi reescrito';
          end if;

          if not exists (
            select 1
            from public.emusys_experimentais_raw
            where emusys_lead_id_zero is true
              and emusys_lead_id is null
              and emusys_aluno_id = 202
              and payload #>> '{participante,id_lead}' = '0'
              and payload #>> '{participante,id_aluno}' = '202'
          ) then
            raise exception 'marcador zero perdido nao foi recuperado';
          end if;

          if not exists (
            select 1
            from pg_trigger
            where tgrelid = 'public.emusys_experimentais_raw'::regclass
              and tgname =
                'trg_normalizar_payload_emusys_experimental_minimo'
              and not tgisinternal
          ) then
            raise exception 'trigger duravel nao foi instalado';
          end if;

          if not has_column_privilege(
            'authenticated',
            'public.emusys_experimentais_raw',
            'professor_id',
            'select'
          ) or not has_column_privilege(
            'authenticated',
            'public.emusys_experimentais_raw',
            'unidade_id',
            'select'
          ) or has_column_privilege(
            'authenticated',
            'public.emusys_experimentais_raw',
            'payload',
            'select'
          ) then
            raise exception 'ACL posterior nao foi reconciliada';
          end if;
        end;
        $upgrade$;

        update public.emusys_experimentais_raw
        set payload = jsonb_build_object(
          'aluno',
          jsonb_build_object(
            'id_lead', 0,
            'id_aluno', 202,
            'telefone_aluno', '21999996666'
          ),
          'segredo', 'nao pode persistir'
        );

        do $durable$
        begin
          if exists (
            select 1
            from public.emusys_experimentais_raw
            where payload::text like '%telefone_aluno%'
               or payload::text like '%nao pode persistir%'
               or payload #>> '{participante,id_lead}' <> '0'
          ) then
            raise exception 'payload voltou a aceitar PII apos upgrade';
          end if;
        end;
        $durable$;
      `,
    );
    assert.equal(
      assertions.status,
      0,
      `contrato de upgrade posterior falhou:\n${assertions.stderr}`,
    );
  } finally {
    spawnSync('docker', ['rm', '--force', containerName], {
      encoding: 'utf8',
    });
  }
});
