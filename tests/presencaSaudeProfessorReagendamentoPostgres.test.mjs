import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const IMAGE = process.env.PRESENCA_SAUDE_POSTGRES_IMAGE || 'postgres:17-alpine';
const MIGRATION = 'supabase/migrations/20260828095344_presenca_saude_professor_reagendamento.sql';
const UNIDADE = '11111111-1111-1111-1111-111111111111';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falhou\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run('docker', args, options);
}

function psql(container, sql) {
  return docker(
    ['exec', '-i', container, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA'],
    { input: sql },
  );
}

function waitForPostgres(container) {
  let consecutive = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync(
      'docker',
      ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1'],
      { encoding: 'utf8' },
    );
    consecutive = probe.status === 0 ? consecutive + 1 : 0;
    if (consecutive >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 17 descartavel nao ficou pronto');
}

test('saude do professor separa sobrescrita real de invalidacao por reagendamento', () => {
  const container = `la-presenca-saude-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;

      create table public.unidades(
        id uuid primary key,
        nome text not null,
        ativo boolean not null default true
      );
      create table public.aulas_emusys(
        id integer primary key,
        unidade_id uuid not null,
        professor_id integer,
        data_aula date not null,
        professor_presenca text,
        professor_presenca_origem text,
        cancelada boolean default false,
        cancelada_origem text
      );
      create table public.professor_ponto_confirmacoes(
        id uuid primary key,
        professor_id integer not null,
        aula_emusys_id integer not null,
        unidade_id uuid not null,
        data_aula date not null,
        estava_presente boolean,
        origem text not null,
        respondido_em timestamptz
      );
      create table public.automacao_log(
        id bigint generated always as identity primary key,
        acao text,
        detalhes jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default clock_timestamp()
      );

      insert into public.unidades(id,nome) values ('${UNIDADE}','Teste');
      insert into public.aulas_emusys(
        id,unidade_id,professor_id,data_aula,professor_presenca,
        professor_presenca_origem,cancelada,cancelada_origem
      ) values
        (1,'${UNIDADE}',10,current_date,'presente','agenda_secretaria',false,null),
        (2,'${UNIDADE}',20,current_date,'ausente',null,false,null),
        (3,'${UNIDADE}',30,current_date,'ausente',null,false,null),
        (4,'${UNIDADE}',40,current_date,'ausente',null,false,'sync_ausente_emusys'),
        (5,'${UNIDADE}',50,current_date,'ausente',null,false,'agenda_secretaria'),
        (6,'${UNIDADE}',60,current_date,'ausente',null,false,null);

      insert into public.professor_ponto_confirmacoes(
        id,professor_id,aula_emusys_id,unidade_id,data_aula,
        estava_presente,origem,respondido_em
      ) values
        ('00000000-0000-0000-0000-000000000001',10,1,'${UNIDADE}',current_date,true,'chamada_secretaria',now()-interval '1 hour'),
        ('00000000-0000-0000-0000-000000000002',20,2,'${UNIDADE}',current_date,true,'chamada_secretaria',now()-interval '1 hour'),
        ('00000000-0000-0000-0000-000000000003',30,3,'${UNIDADE}',current_date-1,true,'chamada_secretaria',now()-interval '1 day'),
        ('00000000-0000-0000-0000-000000000004',60,6,'${UNIDADE}',current_date,true,'chamada_secretaria',now()-interval '2 hours'),
        ('00000000-0000-0000-0000-000000000005',99,2,'${UNIDADE}',current_date,true,'chamada_secretaria',now()-interval '1 hour');

      insert into public.automacao_log(acao,detalhes,created_at)
      values(
        'presenca_limpa_por_reagendamento',
        jsonb_build_object('aula_id',6),
        now()-interval '1 hour'
      );
    `);

    psql(container, readFileSync(MIGRATION, 'utf8'));

    const health = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'marcacoes',marcacoes_humanas,
        'revertidas',revertidas,
        'cancelamentos',cancelamentos_humanos_desfeitos,
        'sem_procedencia',sem_procedencia_na_ficha
      )
      from public.vw_saude_presenca_professor
      where unidade_id='${UNIDADE}';
    `));

    assert.deepEqual(health, {
      marcacoes: 1,
      revertidas: 1,
      cancelamentos: 1,
      sem_procedencia: 1,
    });
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
  }
});
