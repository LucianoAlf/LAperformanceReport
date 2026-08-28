import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const IMAGE = process.env.PRESENCA_HARDENING_POSTGRES_IMAGE || 'postgres:17-alpine';
const CONTAINER = `la-presenca-hardening-${process.pid}`;
const TEMPLATE_DB = 'presenca_roster_template';
const UNIDADE = '11111111-1111-1111-1111-111111111111';
const OUTRA_UNIDADE = '22222222-2222-2222-2222-222222222222';
const RUN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const RUN_SUBSTITUTA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const RUN_ANTIGA = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
const HASH = 'a'.repeat(64);

const MIGRATION_SYNC = join(
  ROOT,
  'supabase',
  'migrations',
  '20260827030200_presenca_sync_cobertura_idempotente.sql',
);
const MIGRATION_ROSTER_V1 = join(
  ROOT,
  'supabase',
  'migrations',
  '20260827030500_presenca_roster_operacional.sql',
);
const MIGRATION_ROSTER_V2 = join(
  ROOT,
  'supabase',
  'migrations',
  '20260828005703_presenca_roster_v2_expansao_aditiva.sql',
);

const SNAPSHOT_COMPLETO = JSON.stringify([
  {
    emusys_id: 100,
    estado: 'completo',
    qtd_esperada: 2,
    qtd_recebida: 2,
    aluno_chaves: ['emusys:101', 'emusys:102'],
  },
]);

const SNAPSHOT_CONTAGEM_DIVERGENTE = JSON.stringify([
  {
    emusys_id: 300,
    estado: 'completo',
    qtd_esperada: 2,
    qtd_recebida: 2,
    aluno_chaves: ['emusys:301', 'emusys:302'],
  },
]);

let databaseSequence = 0;

function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

function run(command, args, options = {}) {
  const result = execute(command, args, options);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falhou\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run('docker', args, options);
}

function psql(database, sql) {
  return docker(
    [
      'exec', '-i', CONTAINER,
      'psql', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
      '-U', 'postgres', '-d', database, '-tA',
    ],
    { input: sql },
  );
}

function psqlFailure(database, sql) {
  const result = execute(
    'docker',
    [
      'exec', '-i', CONTAINER,
      'psql', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
      '-U', 'postgres', '-d', database, '-tA',
    ],
    { input: sql },
  );
  assert.notEqual(result.status, 0, 'SQL deveria falhar');
  return `${result.stdout}\n${result.stderr}`;
}

function waitForPostgres() {
  let consecutivos = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = execute('docker', [
      'exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1',
    ]);
    consecutivos = probe.status === 0 ? consecutivos + 1 : 0;
    if (consecutivos >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 17 descartavel nao ficou pronto');
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonUltimaLinha(output) {
  for (const linha of output.split(/\r?\n/u).filter(Boolean).reverse()) {
    try {
      return JSON.parse(linha);
    } catch {
      // SET/RESET e o valor de set_config nao fazem parte do payload.
    }
  }
  throw new Error(`saida sem JSON valido: ${output}`);
}

function criarBanco(label) {
  databaseSequence += 1;
  const database = `presenca_${label}_${databaseSequence}`.replaceAll(/[^a-z0-9_]/gu, '_');
  psql('postgres', `create database ${database} template ${TEMPLATE_DB};`);
  return database;
}

function aplicarV2(database) {
  psql(database, readFileSync(MIGRATION_ROSTER_V2, 'utf8'));
}

function inserirRunSql({
  runId = RUN,
  unidadeId = UNIDADE,
  modo = 'presenca',
  status = 'iniciada',
  snapshotHash = null,
  paginas = 1,
  aulas = 1,
  presencas = 2,
  cobertura = true,
} = {}) {
  const hashSql = snapshotHash === null ? 'null' : sqlLiteral(snapshotHash);
  return String.raw`
    insert into public.presenca_sync_execucoes(
      id, request_id, unidade_id, modo, data_alvo, status, snapshot_hash,
      paginas_lidas, aulas_lidas, presencas_lidas, lease_segundos,
      heartbeat_em, finalizada_em
    ) values (
      '${runId}', gen_random_uuid(), '${unidadeId}', '${modo}', current_date,
      '${status}', ${hashSql}, ${paginas}, ${aulas}, ${presencas}, 300,
      clock_timestamp(), case when '${status}' = 'iniciada' then null else clock_timestamp() end
    );
    ${cobertura ? String.raw`
    insert into public.presenca_sync_cobertura(
      unidade_id, modo, data_alvo, run_id, status, lease_ate, heartbeat_em,
      snapshot_hash, paginas_lidas, aulas_lidas, presencas_lidas,
      iniciada_em, finalizada_em, atualizada_em
    ) values (
      '${unidadeId}', '${modo}', current_date, '${runId}', '${status}',
      case when '${status}' = 'iniciada' then clock_timestamp() + interval '5 minutes' else null end,
      clock_timestamp(), ${hashSql}, ${paginas}, ${aulas}, ${presencas},
      clock_timestamp(), case when '${status}' = 'iniciada' then null else clock_timestamp() end,
      clock_timestamp()
    );` : ''}
  `;
}

function chamarV2Sql({
  runId = RUN,
  unidadeId = UNIDADE,
  snapshot = SNAPSHOT_COMPLETO,
  dryRun = false,
} = {}) {
  return String.raw`
    set role service_role;
    select set_config('request.jwt.claim.role', 'service_role', false);
    select public.reconciliar_grade_snapshot_emusys_v2(
      '${runId}', '${unidadeId}', current_date, current_date,
      ${sqlLiteral(snapshot)}::jsonb, ${dryRun ? 'true' : 'false'}
    );
    reset role;
  `;
}

function finalizarRunSql({
  runId = RUN,
  hash = HASH,
  paginas = 1,
  aulas = 1,
  presencas = 2,
} = {}) {
  return String.raw`
    update public.presenca_sync_execucoes
       set status = 'concluida', snapshot_hash = '${hash}',
           paginas_lidas = ${paginas}, aulas_lidas = ${aulas},
           presencas_lidas = ${presencas}, finalizada_em = clock_timestamp()
     where id = '${runId}';
    update public.presenca_sync_cobertura
       set status = 'concluida', snapshot_hash = '${hash}', lease_ate = null,
           paginas_lidas = ${paginas}, aulas_lidas = ${aulas},
           presencas_lidas = ${presencas}, finalizada_em = clock_timestamp()
     where run_id = '${runId}';
  `;
}

function snapshotDados(database) {
  return jsonUltimaLinha(psql(database, String.raw`
    select jsonb_build_object(
      'roster', coalesce((
        select jsonb_agg(to_jsonb(aa) order by aa.id)
          from public.aula_alunos_emusys aa
      ), '[]'::jsonb),
      'estado', coalesce((
        select jsonb_agg(to_jsonb(e) order by e.aula_id)
          from public.aula_roster_sync_estado e
      ), '[]'::jsonb)
    );
  `));
}

function snapshotContratoV1(database) {
  return jsonUltimaLinha(psql(database, String.raw`
    select jsonb_build_object(
      'funcao', (
        select jsonb_build_object(
          'oid', p.oid::text,
          'prosrc', p.prosrc,
          'prosecdef', p.prosecdef,
          'provolatile', p.provolatile,
          'proconfig', p.proconfig,
          'proacl', p.proacl,
          'proargnames', p.proargnames,
          'proargtypes', p.proargtypes::text
        )
          from pg_proc p
         where p.oid = 'public.reconciliar_grade_snapshot_emusys_v1(uuid,date,date,jsonb,boolean)'::regprocedure
      ),
      'view_rewrite', (
        select r.ev_action::text
          from pg_rewrite r
         where r.ev_class = 'public.vw_aula_roster_operacional_v1'::regclass
           and r.rulename = '_RETURN'
      )
    );
  `));
}

function alunosPublicados(database, aulaId = 10) {
  return jsonUltimaLinha(psql(database, String.raw`
    select coalesce(jsonb_agg(v.aluno_id order by v.aluno_id), '[]'::jsonb)
      from public.vw_aula_roster_operacional_v2 v
     where v.aula_emusys_id = ${aulaId};
  `));
}

function alunosPublicadosComoServiceRole(database, aulaId = 10) {
  return jsonUltimaLinha(psql(database, String.raw`
    set role service_role;
    select coalesce(jsonb_agg(v.aluno_id order by v.aluno_id), '[]'::jsonb)
      from public.vw_aula_roster_operacional_v2 v
     where v.aula_emusys_id = ${aulaId};
    reset role;
  `));
}

function prepararPublicacao(database, { aulaId = 10 } = {}) {
  aplicarV2(database);
  psql(database, inserirRunSql());
  if (aulaId === 10) {
    jsonUltimaLinha(psql(database, chamarV2Sql()));
  } else {
    psql(database, String.raw`
      update public.aula_roster_sync_estado
         set run_id = '${RUN}', estado = 'completo', qtd_esperada = 2, qtd_recebida = 2
       where aula_id = ${aulaId};
      update public.aula_alunos_emusys
         set ativo_operacional = true, ultimo_run_visto = '${RUN}'
       where aula_emusys_id = ${aulaId};
    `);
  }
  psql(database, finalizarRunSql());
}

test.before(() => {
  assert.match(IMAGE, /^postgres:17(?:[-.][a-z0-9.-]+)?$/iu);
  docker(['run', '--rm', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  waitForPostgres();

  psql('postgres', String.raw`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create database presenca_roster_template;
  `);

  psql(TEMPLATE_DB, String.raw`
    create extension if not exists pgcrypto;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table public.unidades(id uuid primary key, nome text not null);
    insert into public.unidades values
      ('${UNIDADE}', 'Campo Grande'),
      ('${OUTRA_UNIDADE}', 'Barra');

    create table public.aulas_emusys(
      id integer primary key,
      emusys_id integer not null,
      unidade_id uuid not null references public.unidades(id),
      professor_id integer,
      data_aula date not null,
      data_hora_inicio timestamptz,
      data_hora_fim timestamptz,
      categoria text not null default 'normal',
      curso_nome text,
      turma_nome text,
      cancelada boolean not null default false,
      cancelada_origem text,
      cancelada_motivo text,
      cancelada_em timestamptz
    );
    create table public.aula_alunos_emusys(
      id bigint generated always as identity primary key,
      aula_emusys_id integer not null references public.aulas_emusys(id),
      unidade_id uuid not null references public.unidades(id),
      aluno_chave text not null,
      aluno_emusys_id bigint,
      aluno_id integer,
      aluno_nome text not null,
      aluno_nome_normalizado text,
      sincronizado_em timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(aula_emusys_id, aluno_chave)
    );
    create table public.aluno_presenca(
      id uuid primary key default gen_random_uuid(),
      aula_emusys_id integer not null,
      aluno_id integer not null,
      status text,
      status_presenca text,
      respondido_por text
    );
    create table public.usuarios(id integer primary key, auth_user_id uuid, ativo boolean default true);
    create function public.usuario_tem_permissao(integer, text, uuid)
    returns boolean language sql stable as $$ select true $$;

    grant select on table public.aulas_emusys to service_role;
    grant select, update on table public.aula_alunos_emusys to service_role;

    insert into public.aulas_emusys(
      id, emusys_id, unidade_id, data_aula, data_hora_inicio, curso_nome, turma_nome
    ) values
      (10, 100, '${UNIDADE}', current_date, now(), 'Piano', 'Completa'),
      (20, 200, '${UNIDADE}', current_date, now(), 'Canto', 'Identidade parcial'),
      (30, 300, '${UNIDADE}', current_date, now(), 'Bateria', 'Contagem parcial');

    insert into public.aula_alunos_emusys(
      aula_emusys_id, unidade_id, aluno_chave, aluno_emusys_id, aluno_id, aluno_nome
    ) values
      (10, '${UNIDADE}', 'emusys:101', 101, 1001, 'Aluno Um'),
      (10, '${UNIDADE}', 'emusys:102', 102, 1002, 'Aluno Dois'),
      (20, '${UNIDADE}', 'emusys:201', 201, 2001, 'Aluno Tres'),
      (20, '${UNIDADE}', 'emusys:202', 202, null, 'Aluno Sem Identidade Local'),
      (30, '${UNIDADE}', 'emusys:301', 301, 3001, 'Aluno Unico');
  `);

  psql(TEMPLATE_DB, readFileSync(MIGRATION_SYNC, 'utf8'));
  psql(TEMPLATE_DB, readFileSync(MIGRATION_ROSTER_V1, 'utf8'));
  psql(TEMPLATE_DB, String.raw`
    insert into public.aula_roster_sync_estado(
      aula_id, unidade_id, run_id, estado, qtd_esperada, qtd_recebida, snapshot_hash
    ) values
      (10, '${UNIDADE}', '${RUN_ANTIGA}', 'completo', 2, 2, repeat('1', 32)),
      (20, '${UNIDADE}', '${RUN_ANTIGA}', 'completo', 2, 2, repeat('2', 32)),
      (30, '${UNIDADE}', '${RUN_ANTIGA}', 'incompleto', 2, 1, repeat('3', 32));
    update public.aula_alunos_emusys set ultimo_run_visto = '${RUN_ANTIGA}';
  `);
});

test.after(() => {
  execute('docker', ['rm', '-f', CONTAINER]);
});

test('migration e aditiva: nao altera linhas nem redefine o contrato v1', () => {
  const database = criarBanco('aditiva');
  const dadosAntes = snapshotDados(database);
  const contratoAntes = snapshotContratoV1(database);
  const nomesAntes = jsonUltimaLinha(psql(database, String.raw`
    select jsonb_agg(v.aluno_id order by v.aluno_id)
      from public.vw_aula_roster_operacional_v1 v
     where v.aula_emusys_id = 10;
  `));

  aplicarV2(database);

  assert.deepEqual(snapshotDados(database), dadosAntes);
  assert.deepEqual(snapshotContratoV1(database), contratoAntes);
  assert.deepEqual(jsonUltimaLinha(psql(database, String.raw`
    select jsonb_agg(v.aluno_id order by v.aluno_id)
      from public.vw_aula_roster_operacional_v1 v
     where v.aula_emusys_id = 10;
  `)), nomesAntes);

  const resultadoV1 = jsonUltimaLinha(psql(database, String.raw`
    select public.reconciliar_grade_snapshot_emusys_v1(
      '${UNIDADE}', current_date, current_date,
      ${sqlLiteral(SNAPSHOT_COMPLETO)}::jsonb, false
    );
  `));
  assert.equal(resultadoV1.status, 'ok');
  assert.deepEqual(jsonUltimaLinha(psql(database, String.raw`
    select jsonb_agg(v.aluno_id order by v.aluno_id)
      from public.vw_aula_roster_operacional_v1 v
     where v.aula_emusys_id = 10;
  `)), [1001, 1002]);
});

test('v2 troca integralmente o run interno pelo run externo e so publica depois da conclusao integra', () => {
  const database = criarBanco('publicacao');
  aplicarV2(database);
  psql(database, inserirRunSql());

  const resultado = jsonUltimaLinha(psql(database, chamarV2Sql()));
  assert.equal(resultado.status, 'ok');
  assert.equal(resultado.run_id, RUN);
  assert.deepEqual(alunosPublicados(database), []);

  const vinculo = jsonUltimaLinha(psql(database, String.raw`
    select jsonb_build_object(
      'estado_run', (select run_id from public.aula_roster_sync_estado where aula_id = 10),
      'estados_run', (select count(*) from public.aula_roster_sync_estado where run_id = '${RUN}'),
      'vinculos_run', (select count(*) from public.aula_alunos_emusys where aula_emusys_id = 10 and ultimo_run_visto = '${RUN}'),
      'vinculos_outro_run', (select count(*) from public.aula_alunos_emusys where aula_emusys_id = 10 and ativo_operacional and ultimo_run_visto is distinct from '${RUN}'::uuid)
    );
  `));
  assert.deepEqual(vinculo, {
    estado_run: RUN,
    estados_run: 1,
    vinculos_run: 2,
    vinculos_outro_run: 0,
  });

  psql(database, finalizarRunSql());
  assert.deepEqual(alunosPublicados(database), [1001, 1002]);
  assert.deepEqual(alunosPublicadosComoServiceRole(database), [1001, 1002]);

  const acl = jsonUltimaLinha(psql(database, String.raw`
    select jsonb_build_object(
      'anon_rpc', has_function_privilege('anon', 'public.reconciliar_grade_snapshot_emusys_v2(uuid,uuid,date,date,jsonb,boolean)', 'execute'),
      'auth_rpc', has_function_privilege('authenticated', 'public.reconciliar_grade_snapshot_emusys_v2(uuid,uuid,date,date,jsonb,boolean)', 'execute'),
      'service_rpc', has_function_privilege('service_role', 'public.reconciliar_grade_snapshot_emusys_v2(uuid,uuid,date,date,jsonb,boolean)', 'execute'),
      'anon_view', has_table_privilege('anon', 'public.vw_aula_roster_operacional_v2', 'select'),
      'auth_view', has_table_privilege('authenticated', 'public.vw_aula_roster_operacional_v2', 'select'),
      'service_view', has_table_privilege('service_role', 'public.vw_aula_roster_operacional_v2', 'select'),
      'security_invoker', (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.vw_aula_roster_operacional_v2'::regclass)
    );
  `));
  assert.deepEqual(acl, {
    anon_rpc: false,
    auth_rpc: false,
    service_rpc: true,
    anon_view: false,
    auth_view: false,
    service_view: true,
    security_invoker: true,
  });
});

test('dry-run v2 preserva roster e estado e nunca publica', () => {
  const database = criarBanco('dry_run');
  aplicarV2(database);
  psql(database, inserirRunSql());
  const antes = snapshotDados(database);

  const resultado = jsonUltimaLinha(psql(database, chamarV2Sql({ dryRun: true })));

  assert.equal(resultado.status, 'ok');
  assert.equal(resultado.dry_run, true);
  assert.equal(resultado.run_id, RUN);
  assert.deepEqual(snapshotDados(database), antes);
  assert.deepEqual(alunosPublicados(database), []);
});

for (const [status, descricao] of [
  ['iniciada', 'iniciada'],
  ['falhou', 'falhou'],
  ['abortada', 'abortada'],
  ['concluida', 'concluida sem hash'],
]) {
  test(`run ${descricao} publica zero nomes`, () => {
    const database = criarBanco(`estado_${status}`);
    aplicarV2(database);
    psql(database, String.raw`
      ${inserirRunSql({ status, snapshotHash: null })}
      update public.aula_roster_sync_estado
         set run_id = '${RUN}', estado = 'completo', qtd_esperada = 2, qtd_recebida = 2
       where aula_id = 10;
      update public.aula_alunos_emusys
         set ativo_operacional = true, ultimo_run_visto = '${RUN}'
       where aula_emusys_id = 10;
    `);
    assert.deepEqual(alunosPublicados(database), []);
  });
}

test('run substituida deixa de publicar mesmo se a execucao antiga concluiu', () => {
  const database = criarBanco('substituida');
  prepararPublicacao(database);
  assert.deepEqual(alunosPublicados(database), [1001, 1002]);

  psql(database, String.raw`
    ${inserirRunSql({ runId: RUN_SUBSTITUTA, cobertura: false, paginas: 0, aulas: 0, presencas: 0 })}
    update public.presenca_sync_cobertura
       set run_id = '${RUN_SUBSTITUTA}', status = 'iniciada', snapshot_hash = null,
           paginas_lidas = 0, aulas_lidas = 0, presencas_lidas = 0,
           lease_ate = clock_timestamp() + interval '5 minutes', finalizada_em = null
     where unidade_id = '${UNIDADE}' and modo = 'presenca' and data_alvo = current_date;
  `);

  assert.deepEqual(alunosPublicados(database), []);
});

test('contagens divergentes, identidade parcial ou ultimo run desigual bloqueiam a aula inteira', () => {
  const databaseContagens = criarBanco('parcial_contagens');
  prepararPublicacao(databaseContagens);
  psql(databaseContagens, String.raw`
    update public.presenca_sync_cobertura
       set presencas_lidas = presencas_lidas - 1
     where run_id = '${RUN}';
  `);
  assert.deepEqual(alunosPublicados(databaseContagens), []);

  const databaseIdentidade = criarBanco('parcial_identidade');
  prepararPublicacao(databaseIdentidade, { aulaId: 20 });
  assert.deepEqual(alunosPublicados(databaseIdentidade, 20), []);

  const databaseRun = criarBanco('parcial_run');
  prepararPublicacao(databaseRun);
  psql(databaseRun, String.raw`
    update public.aula_alunos_emusys
       set ultimo_run_visto = '${RUN_ANTIGA}'
     where aula_emusys_id = 10 and aluno_id = 1002;
  `);
  assert.deepEqual(alunosPublicados(databaseRun), []);
});

test('v2 rejeita run incompativel e usa 40001 para substituicao ou contagem concorrente', () => {
  const databaseUnidade = criarBanco('run_unidade');
  aplicarV2(databaseUnidade);
  psql(databaseUnidade, inserirRunSql());
  const erroUnidade = psqlFailure(
    databaseUnidade,
    chamarV2Sql({ unidadeId: OUTRA_UNIDADE }),
  );
  assert.match(erroUnidade, /22023/u);
  assert.match(erroUnidade, /sync_run_incompativel/u);

  const databaseStatus = criarBanco('run_status');
  aplicarV2(databaseStatus);
  psql(databaseStatus, inserirRunSql({ status: 'falhou', snapshotHash: null }));
  const erroStatus = psqlFailure(databaseStatus, chamarV2Sql());
  assert.match(erroStatus, /22023/u);
  assert.match(erroStatus, /sync_run_incompativel/u);

  const databaseSubstituida = criarBanco('run_substituida');
  aplicarV2(databaseSubstituida);
  psql(databaseSubstituida, String.raw`
    ${inserirRunSql()}
    ${inserirRunSql({ runId: RUN_SUBSTITUTA, cobertura: false, paginas: 0, aulas: 0, presencas: 0 })}
    update public.presenca_sync_cobertura set run_id = '${RUN_SUBSTITUTA}' where run_id = '${RUN}';
  `);
  const erroSubstituida = psqlFailure(databaseSubstituida, chamarV2Sql());
  assert.match(erroSubstituida, /40001/u);
  assert.match(erroSubstituida, /sync_run_substituida/u);

  const databaseContagem = criarBanco('run_contagem');
  aplicarV2(databaseContagem);
  psql(databaseContagem, inserirRunSql());
  const erroContagem = psqlFailure(
    databaseContagem,
    chamarV2Sql({ snapshot: SNAPSHOT_CONTAGEM_DIVERGENTE }),
  );
  assert.match(erroContagem, /40001/u);
  assert.match(erroContagem, /roster_contagem_concorrente/u);
  assert.equal(psql(databaseContagem, 'select count(*) from public.aula_roster_sync_estado where aula_id = 30;'), '1');
  assert.equal(psql(databaseContagem, String.raw`
    select count(*) from public.aula_alunos_emusys
     where aula_emusys_id = 30 and ultimo_run_visto = '${RUN}';
  `), '0');
});
