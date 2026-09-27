import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260927130000_vw_emusys_historico_aula_aluno_v1.sql',
);

function docker(args, input, timeout = 120_000) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-qAt',
  ], sql);
}

async function waitForPostgres(container) {
  let probesEstaveis = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      probesEstaveis += 1;
      if (probesEstaveis >= 2) return;
    } else {
      probesEstaveis = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

function ok(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout || result.error?.message}`);
  return result.stdout.trim().split(/\r?\n/u).filter(Boolean);
}

const unidade = '11111111-1111-1111-1111-111111111111';

// Fixture minima: so as colunas que a view toca. O contrato nao depende de FK.
const fixture = String.raw`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create table public.unidades (
    id uuid primary key,
    nome text not null
  );

  create table public.alunos (
    id integer primary key,
    unidade_id uuid not null references public.unidades(id),
    nome text not null,
    status text not null default 'ativo',
    emusys_student_id text
  );

  create table public.emusys_aulas_historico_staging_v1 (
    id bigint generated always as identity primary key,
    unidade_id uuid not null references public.unidades(id),
    emusys_aula_id bigint not null,
    data_hora_inicio timestamptz,
    categoria text,
    cancelada boolean not null default false,
    emusys_turma_id bigint,
    turma_nome text,
    emusys_disciplina_id bigint,
    disciplina_nome text,
    emusys_professor_id bigint,
    professor_nome text,
    payload jsonb not null,
    payload_hash text not null,
    coletado_em timestamptz not null default now(),
    unique (unidade_id, emusys_aula_id)
  );

  create table public.emusys_aula_alunos_historico_staging_v1 (
    id bigint generated always as identity primary key,
    aula_staging_id bigint not null references public.emusys_aulas_historico_staging_v1(id),
    unidade_id uuid not null references public.unidades(id),
    emusys_aula_id bigint not null,
    emusys_aluno_id bigint,
    aluno_id integer,
    aluno_nome_origem text,
    presenca_origem text,
    linha_hash text not null,
    payload jsonb not null,
    coletado_em timestamptz not null default now(),
    unique (aula_staging_id, linha_hash)
  );

  insert into public.unidades values ('${unidade}', 'Unidade Teste');

  -- pessoa com duas matriculas (10 e 11): mesmo emusys_student_id '91'
  insert into public.alunos (id, unidade_id, nome, status, emusys_student_id) values
    (10, '${unidade}', 'Aluno Dez', 'ativo', '91'),
    (11, '${unidade}', 'Aluno Dez', 'ativo', '91'),
    (20, '${unidade}', 'Aluno Vinte', 'ativo', '92');

  -- aula 500: aluno 91 com duas observacoes de roster (presenca mudou de
  -- presente para ausente entre coletas), aluno 92 estavel, aluno 99 sem
  -- cadastro local e uma linha de lead sem emusys_aluno_id
  insert into public.emusys_aulas_historico_staging_v1 (
    unidade_id, emusys_aula_id, data_hora_inicio, categoria, cancelada,
    turma_nome, disciplina_nome, emusys_professor_id, professor_nome,
    payload, payload_hash
  ) values
    ('${unidade}', 500, '2026-09-01 14:00:00-03', 'normal', false,
     null, 'Piano', 7001, 'Prof Um',
     '{"anotacoes": "  trabalhou escalas  "}'::jsonb,
     'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ('${unidade}', 501, '2026-09-08 14:00:00-03', 'normal', true,
     null, 'Piano', 7001, 'Prof Um',
     '{"anotacoes": "   "}'::jsonb,
     'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
    ('${unidade}', 502, '2026-09-15 14:00:00-03', 'normal', false,
     'Turma X', 'Musicalizacao', 7002, 'Prof Dois',
     '{"itens_origem": [{"anotacoes": "nota da turma"}]}'::jsonb,
     'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');

  insert into public.emusys_aula_alunos_historico_staging_v1 (
    aula_staging_id, unidade_id, emusys_aula_id, emusys_aluno_id,
    presenca_origem, linha_hash, payload, coletado_em
  ) values
    (1, '${unidade}', 500, 91, 'presente',
     'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
     '{}', '2026-09-01 20:00:00-03'),
    (1, '${unidade}', 500, 91, 'ausente',
     'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
     '{}', '2026-09-02 20:00:00-03'),
    (1, '${unidade}', 500, 92, 'presente',
     'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
     '{}', '2026-09-01 20:00:00-03'),
    (1, '${unidade}', 500, 99, 'presente',
     '0101010101010101010101010101010101010101010101010101010101010101',
     '{}', '2026-09-01 20:00:00-03'),
    (1, '${unidade}', 500, null, 'presente',
     '0202020202020202020202020202020202020202020202020202020202020202',
     '{}', '2026-09-01 20:00:00-03'),
    (2, '${unidade}', 501, 91, 'ausente',
     '0303030303030303030303030303030303030303030303030303030303030303',
     '{}', '2026-09-08 20:00:00-03'),
    (3, '${unidade}', 502, 91, 'presente',
     '0404040404040404040404040404040404040404040404040404040404040404',
     '{}', '2026-09-15 20:00:00-03');

  -- aluno ligado DEPOIS do staging ja existir: linha de roster antiga do
  -- emusys_aluno_id 95, cadastro local criado agora (requisito "mantida pela
  -- rotina diaria": ninguem roda nada para a ligacao aparecer)
  insert into public.emusys_aula_alunos_historico_staging_v1 (
    aula_staging_id, unidade_id, emusys_aula_id, emusys_aluno_id,
    presenca_origem, linha_hash, payload, coletado_em
  ) values
    (1, '${unidade}', 500, 95, 'presente',
     '0505050505050505050505050505050505050505050505050505050505050505',
     '{}', '2026-09-01 20:00:00-03');
  insert into public.alunos (id, unidade_id, nome, status, emusys_student_id)
    values (30, '${unidade}', 'Aluno Recem Ligado', 'ativo', '95');
`;

test('vw_emusys_historico_aula_aluno_v1 honra o contrato do LA Teacher', {
  timeout: 120_000,
}, async (t) => {
  assert.ok(fs.existsSync(migrationPath), 'migration da view nao existe');
  const dockerInfo = docker(['info'], undefined, 5_000);
  if (dockerInfo.status !== 0 || dockerInfo.error) {
    t.skip('Docker indisponivel para fixture PostgreSQL do contrato do historico');
    return;
  }

  const container = `la-historico-view-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    ok(psql(container, fixture), 'fixture');
    ok(psql(container, fs.readFileSync(migrationPath, 'utf8')), 'migration');

    // 1. contrato: nomes, ordem e tipos das colunas
    const colunas = ok(psql(container, `
      select string_agg(column_name || ':' || data_type, ',' order by ordinal_position)
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'vw_emusys_historico_aula_aluno_v1';
    `), 'colunas').at(-1);
    assert.equal(colunas, [
      'unidade_id:uuid',
      'aluno_id:integer',
      'emusys_aula_id:integer',
      'data_hora_inicio:timestamp with time zone',
      'disciplina_nome:text',
      'professor_nome:text',
      'emusys_professor_id:integer',
      'turma_nome:text',
      'categoria:text',
      'cancelada:boolean',
      'presenca:text',
      'anotacoes:text',
    ].join(','));

    // 2. fechada: anon/authenticated sem grant, service_role le
    const acl = ok(psql(container, `
      select
        has_table_privilege('anon', 'public.vw_emusys_historico_aula_aluno_v1', 'select') || '|' ||
        has_table_privilege('authenticated', 'public.vw_emusys_historico_aula_aluno_v1', 'select') || '|' ||
        has_table_privilege('service_role', 'public.vw_emusys_historico_aula_aluno_v1', 'select');
    `), 'acl').at(-1);
    assert.equal(acl, 'false|false|true');

    const negado = psql(container, `
      set role authenticated;
      select count(*) from public.vw_emusys_historico_aula_aluno_v1;
    `);
    assert.notEqual(negado.status, 0, 'authenticated nao deveria ler a view');
    assert.match(negado.stderr, /42501|permission denied/u);

    // 3. uma linha por (aula, aluno): aula 500 tem 5 linhas de roster mas a
    //    view entrega a mais recente de cada aluno ligado, uma vez por aluno_id
    const dedup = ok(psql(container, `
      select string_agg(aluno_id || '@' || emusys_aula_id || '=' || presenca, ',' order by aluno_id, emusys_aula_id)
        from public.vw_emusys_historico_aula_aluno_v1
       where emusys_aula_id = 500;
      select count(*) || '|' || count(distinct (emusys_aula_id, aluno_id))
        from public.vw_emusys_historico_aula_aluno_v1;
    `), 'dedup');
    assert.equal(dedup[0], '10@500=ausente,11@500=ausente,20@500=presente,30@500=presente');
    assert.equal(dedup[1].split('|')[0], dedup[1].split('|')[1]);

    // 4. ligacao por emusys_student_id: roster 99 (sem cadastro) e lead sem
    //    emusys_aluno_id ficam de fora; aluno recem-ligado aparece sozinho
    const ligacao = ok(psql(container, `
      select count(*) filter (where aluno_id in (10, 11)) as pessoa_dois_vinculos
        from public.vw_emusys_historico_aula_aluno_v1
       where emusys_aula_id = 500;
      select count(*) from public.vw_emusys_historico_aula_aluno_v1 where aluno_id = 30;
    `), 'ligacao');
    assert.equal(ligacao[0], '2');
    assert.equal(ligacao[1], '1');

    // 5. anotacoes: trim + nullif, e fallback para itens_origem
    const anotacoes = ok(psql(container, `
      select emusys_aula_id || '=' || coalesce(anotacoes, '<null>')
        from public.vw_emusys_historico_aula_aluno_v1
       where aluno_id = 10
       order by emusys_aula_id;
    `), 'anotacoes');
    assert.deepEqual(anotacoes, [
      '500=trabalhou escalas',
      '501=<null>',
      '502=nota da turma',
    ]);
  } finally {
    docker(['rm', '-f', container], undefined, 30_000);
  }
});
