import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const IMAGE = process.env.PRESENCA_ROSTER_POSTGRES_IMAGE || 'postgres:17-alpine';
const UNIDADE = '11111111-1111-1111-1111-111111111111';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
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
  return docker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA'], {
    input: sql,
  });
}

function waitForPostgres(container) {
  let consecutivos = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1',
    ], { encoding: 'utf8' });
    consecutivos = probe.status === 0 ? consecutivos + 1 : 0;
    if (consecutivos >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 17 descartavel nao ficou pronto');
}

function migrationRoster() {
  const nomes = readdirSync(MIGRATIONS)
    .filter((nome) => /^\d+_presenca_roster_operacional\.sql$/u.test(nome));
  assert.equal(nomes.length, 1, 'migration de roster operacional ausente ou duplicada');
  return join(MIGRATIONS, nomes[0]);
}

function jsonUltimaLinha(output) {
  return JSON.parse(output.split(/\r?\n/u).at(-1));
}

const snapshotInicial = JSON.stringify([
  { emusys_id: 100, estado: 'completo', qtd_esperada: 2, qtd_recebida: 2, aluno_chaves: ['emusys:101', 'emusys:102'] },
  { emusys_id: 200, estado: 'vazio_confirmado', qtd_esperada: 0, qtd_recebida: 0, aluno_chaves: [] },
  { emusys_id: 300, estado: 'incompleto', qtd_esperada: 2, qtd_recebida: 1, aluno_chaves: ['emusys:301'] },
  { emusys_id: 400, estado: 'ambiguo', qtd_esperada: 1, qtd_recebida: 1, aluno_chaves: ['nome:aluno ambiguo:'] },
]);

const snapshotSemAluno = JSON.stringify([
  { emusys_id: 100, estado: 'completo', qtd_esperada: 1, qtd_recebida: 1, aluno_chaves: ['emusys:101'] },
  { emusys_id: 200, estado: 'vazio_confirmado', qtd_esperada: 0, qtd_recebida: 0, aluno_chaves: [] },
  { emusys_id: 300, estado: 'incompleto', qtd_esperada: 2, qtd_recebida: 1, aluno_chaves: ['emusys:301'] },
  { emusys_id: 400, estado: 'ambiguo', qtd_esperada: 1, qtd_recebida: 1, aluno_chaves: ['nome:aluno ambiguo:'] },
]);

test('roster completo inativa logicamente e estados inseguros nunca viram pendencia nominal', () => {
  assert.match(IMAGE, /^postgres:17(?:[-.][a-z0-9.-]+)?$/iu);
  const container = `la-presenca-roster-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create extension if not exists pgcrypto;
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;

      create table public.unidades(id uuid primary key, nome text not null);
      insert into public.unidades values ('${UNIDADE}', 'Campo Grande');
      create table public.aulas_emusys(
        id integer primary key,
        emusys_id integer not null,
        unidade_id uuid not null references public.unidades(id),
        data_aula date not null,
        data_hora_inicio timestamptz,
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
      insert into public.usuarios values (1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

      insert into public.aulas_emusys(id, emusys_id, unidade_id, data_aula, data_hora_inicio, curso_nome, turma_nome)
      values
        (10, 100, '${UNIDADE}', current_date, now(), 'Piano', 'Turma completa'),
        (20, 200, '${UNIDADE}', current_date, now(), 'Bateria', 'Turma vazia'),
        (30, 300, '${UNIDADE}', current_date, now(), 'Canto', 'Foto incompleta'),
        (40, 400, '${UNIDADE}', current_date, now(), 'Violao', 'Identidade ambigua');
      insert into public.aula_alunos_emusys(aula_emusys_id, unidade_id, aluno_chave, aluno_emusys_id, aluno_id, aluno_nome)
      values
        (10, '${UNIDADE}', 'emusys:101', 101, 1001, 'Aluno Um'),
        (10, '${UNIDADE}', 'emusys:102', 102, 1002, 'Aluno Dois'),
        (20, '${UNIDADE}', 'emusys:201', 201, 2001, 'Aluno Antigo'),
        (30, '${UNIDADE}', 'emusys:301', 301, 3001, 'Aluno Preservado'),
        (40, '${UNIDADE}', 'emusys:401', 401, 4001, 'Aluno Ambiguo');
      insert into public.aluno_presenca(aula_emusys_id, aluno_id, status_presenca, respondido_por)
      values (10, 1002, 'presente', 'agenda_secretaria');
    `);

    psql(container, readFileSync(migrationRoster(), 'utf8'));
    psql(container, String.raw`
      insert into public.aula_alunos_emusys(
        aula_emusys_id, unidade_id, aluno_chave, aluno_emusys_id, aluno_id, aluno_nome
      ) values (30, '${UNIDADE}', 'emusys:302', 302, 3002, 'Novo ainda nao validado');
    `);

    const primeira = jsonUltimaLinha(psql(container, String.raw`
      select public.reconciliar_grade_snapshot_emusys_v1(
        '${UNIDADE}', current_date, current_date, '${snapshotInicial}'::jsonb, false
      );
    `));
    assert.equal(primeira.status, 'ok');
    assert.equal(primeira.vinculos_inativados, 1);

    const estados = JSON.parse(psql(container, String.raw`
      select json_object_agg(a.emusys_id, json_build_object(
        'estado', e.estado,
        'ativos', (select count(*) from public.aula_alunos_emusys aa where aa.aula_emusys_id=a.id and aa.ativo_operacional),
        'pendenciasNominais', coalesce((select json_agg(v.aluno_id order by v.aluno_id) from public.vw_aula_roster_operacional_v1 v where v.aula_emusys_id=a.id), '[]'::json)
      )) from public.aulas_emusys a join public.aula_roster_sync_estado e on e.aula_id=a.id;
    `));
    assert.equal(estados['100'].estado, 'completo');
    assert.equal(estados['100'].ativos, 2);
    assert.equal(estados['200'].estado, 'vazio_confirmado');
    assert.deepEqual(estados['200'].pendenciasNominais, []);
    assert.equal(estados['300'].estado, 'incompleto');
    assert.equal(estados['300'].ativos, 1);
    assert.deepEqual(estados['300'].pendenciasNominais, []);
    assert.equal(estados['400'].estado, 'ambiguo');
    assert.deepEqual(estados['400'].pendenciasNominais, []);

    const filaEstruturalOutput = psql(container, String.raw`
      select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
      select public.get_conciliacao_roster_operacional_v1(
        '${UNIDADE}', current_date, current_date, 'incompleto', 100, 0
      );
    `);
    const filaEstrutural = jsonUltimaLinha(filaEstruturalOutput);
    assert.equal(filaEstrutural.resumo.total, 1);
    assert.equal(filaEstrutural.revisoes[0].estado, 'incompleto');
    assert.equal(filaEstrutural.revisoes[0].qtd_esperada, 2);
    assert.equal(JSON.stringify(filaEstrutural).includes('Aluno Preservado'), false);

    const removido = jsonUltimaLinha(psql(container, String.raw`
      select public.reconciliar_grade_snapshot_emusys_v1(
        '${UNIDADE}', current_date, current_date, '${snapshotSemAluno}'::jsonb, false
      );
    `));
    assert.equal(removido.vinculos_inativados, 1);

    const historico = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'vinculoAtivo', aa.ativo_operacional,
        'motivo', aa.inativado_motivo,
        'presencaPreservada', exists(
          select 1 from public.aluno_presenca ap
          where ap.aula_emusys_id=10 and ap.aluno_id=1002
            and ap.status_presenca='presente' and ap.respondido_por='agenda_secretaria'
        )
      ) from public.aula_alunos_emusys aa where aa.aula_emusys_id=10 and aa.aluno_id=1002;
    `));
    assert.equal(historico.vinculoAtivo, false);
    assert.equal(historico.motivo, 'ausente_snapshot_completo');
    assert.equal(historico.presencaPreservada, true);

    const repetido = jsonUltimaLinha(psql(container, String.raw`
      select public.reconciliar_grade_snapshot_emusys_v1(
        '${UNIDADE}', current_date, current_date, '${snapshotSemAluno}'::jsonb, false
      );
    `));
    assert.equal(repetido.alteracoes_aplicadas, 0);

    const acl = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'anon_rpc', has_function_privilege('anon', 'public.reconciliar_grade_snapshot_emusys_v1(uuid,date,date,jsonb,boolean)', 'execute'),
        'auth_rpc', has_function_privilege('authenticated', 'public.reconciliar_grade_snapshot_emusys_v1(uuid,date,date,jsonb,boolean)', 'execute'),
        'service_rpc', has_function_privilege('service_role', 'public.reconciliar_grade_snapshot_emusys_v1(uuid,date,date,jsonb,boolean)', 'execute'),
        'anon_fila', has_function_privilege('anon', 'public.get_conciliacao_roster_operacional_v1(uuid,date,date,text,integer,integer)', 'execute'),
        'auth_fila', has_function_privilege('authenticated', 'public.get_conciliacao_roster_operacional_v1(uuid,date,date,text,integer,integer)', 'execute'),
        'auth_estado_select', has_table_privilege('authenticated', 'public.aula_roster_sync_estado', 'select'),
        'auth_view_select', has_table_privilege('authenticated', 'public.vw_aula_roster_operacional_v1', 'select'),
        'view_security_invoker', (select reloptions @> array['security_invoker=true'] from pg_class where oid='public.vw_aula_roster_operacional_v1'::regclass)
      );
    `));
    assert.deepEqual(acl, {
      anon_rpc: false,
      auth_rpc: false,
      service_rpc: true,
      anon_fila: false,
      auth_fila: true,
      auth_estado_select: false,
      auth_view_select: false,
      view_security_invoker: true,
    });
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
  }
});
