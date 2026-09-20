import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationName = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((entry) => /_emusys_cpf_hmac_e_faturas_futuras\.sql$/u.test(entry))
  .sort()
  .at(-1);
const migrationPath = migrationName
  ? path.join(root, 'supabase', 'migrations', migrationName)
  : '';
const resolverMigrationName = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((entry) => /_emusys_cpf_hmac_resolver_nomes\.sql$/u.test(entry))
  .sort()
  .at(-1);
const resolverMigrationPath = resolverMigrationName
  ? path.join(root, 'supabase', 'migrations', resolverMigrationName)
  : '';
const resolverBatchMigrationName = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((entry) => /_emusys_cpf_hmac_resolver_lote\.sql$/u.test(entry))
  .sort()
  .at(-1);
const resolverBatchMigrationPath = resolverBatchMigrationName
  ? path.join(root, 'supabase', 'migrations', resolverBatchMigrationName)
  : '';

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

const fixture = String.raw`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create schema vault;
  create schema extensions;

  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('app.test_role', true), ''), current_user::text)
  $$;

  create table vault.decrypted_secrets (
    name text primary key,
    decrypted_secret text not null
  );
  insert into vault.decrypted_secrets values (
    'emusys_cpf_hmac_key_v1',
    repeat('ab', 32)
  );

  create table public.unidades (
    id uuid primary key,
    nome text not null
  );
  create table public.alunos (
    id integer primary key,
    unidade_id uuid not null references public.unidades(id),
    nome text not null,
    responsavel_nome text,
    emusys_matricula_id text,
    emusys_student_id text,
    arquivado_em timestamptz
  );
  create table public.emusys_matriculas_estado_atual (
    unidade_id uuid not null references public.unidades(id),
    emusys_matricula_id bigint not null,
    emusys_aluno_id bigint,
    aluno_id integer references public.alunos(id),
    payload_snapshot jsonb not null,
    payload_hash text not null,
    updated_at timestamptz not null default now(),
    primary key (unidade_id, emusys_matricula_id)
  );
  create table public.emusys_api_payload (
    id bigint generated always as identity primary key,
    payload jsonb not null
  );
  create table public.matriculas_emusys_decisoes_canonicas (
    id bigint generated always as identity primary key,
    snapshot_emusys jsonb not null
  );
  create table public.automacao_log (
    id bigint generated always as identity primary key,
    payload_bruto jsonb,
    detalhes jsonb
  );
  create table public.webhook_debug_log (
    id bigint generated always as identity primary key,
    payload jsonb not null
  );
  create table public.leads_automacao_log (
    id bigint generated always as identity primary key,
    payload_bruto jsonb
  );
  create table public.sync_runs (
    id uuid primary key default gen_random_uuid(),
    competencia date not null,
    run_type text not null,
    status text not null,
    snapshot_complete boolean not null default false,
    unidades_concluidas integer not null default 0,
    completed_at timestamptz
  );
  create table public.sync_run_items (
    id bigint generated always as identity primary key,
    run_id uuid not null references public.sync_runs(id),
    status text not null,
    source_missing boolean not null default false
  );
  create function public.enqueue_financeiro_sync_competencias(
    p_competencias date[], p_trigger_source text, p_requested_by text, p_priority integer
  ) returns jsonb language sql as $$ select to_jsonb(p_competencias) $$;

  insert into public.unidades values ('${unidade}', 'Unidade Teste');
  insert into public.alunos (
    id, unidade_id, nome, responsavel_nome, emusys_matricula_id, emusys_student_id
  ) values (10, '${unidade}', 'Aluno Teste', 'Responsavel Teste', '701', '91');

  insert into public.emusys_matriculas_estado_atual values (
    '${unidade}', 701, 91, 10,
    '{"aluno":{"id":91,"cpf":"123.456.789-01"},"responsavel":{"id":92,"cpf":"987.654.321-00"},"lista":[{"CPF":"11122233344"}]}'::jsonb,
    'legado', now()
  );
  insert into public.emusys_matriculas_estado_atual values (
    '${unidade}', 702, 93, null,
    '{"aluno":{"id":93,"cpf":"222.333.444-55","nome":"Aluno Historico"},"responsavel":{"id":94,"cpf":"333.444.555-66","nome":"Responsavel Historico"}}'::jsonb,
    'legado-2', now()
  );
  insert into public.emusys_api_payload(payload)
    values ('{"aluno":{"cpf":"12345678901"}}'::jsonb);
  insert into public.matriculas_emusys_decisoes_canonicas(snapshot_emusys)
    values ('{"responsavel":{"cpf":"98765432100"}}'::jsonb);
  insert into public.automacao_log(payload_bruto, detalhes)
    values ('{"CPF":"12345678901"}'::jsonb, '{"cpf_responsavel":"98765432100"}'::jsonb);
  insert into public.webhook_debug_log(payload)
    values ('{"matricula":{"aluno":{"cpf":"12345678901"}}}'::jsonb);
  insert into public.leads_automacao_log(payload_bruto)
    values ('{"cpf":"12345678901"}'::jsonb);
`;

test('migration deriva HMAC, limpa o passivo, protege novos writes e amplia o backlog', {
  timeout: 120_000,
}, async (t) => {
  assert.ok(migrationPath && fs.existsSync(migrationPath), 'migration ausente');
  assert.ok(
    resolverMigrationPath && fs.existsSync(resolverMigrationPath),
    'migration do resolver com nomes ausente',
  );
  assert.ok(
    resolverBatchMigrationPath && fs.existsSync(resolverBatchMigrationPath),
    'migration do resolver em lote ausente',
  );
  const dockerInfo = docker(['info'], undefined, 5_000);
  if (dockerInfo.status !== 0 || dockerInfo.error) {
    t.skip('Docker indisponivel para fixture PostgreSQL de CPF HMAC');
    return;
  }

  const container = `la-cpf-hmac-${process.pid}-${Date.now()}`;
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
    ok(psql(container, fs.readFileSync(resolverMigrationPath, 'utf8')), 'migration resolver');
    ok(psql(container, fs.readFileSync(resolverBatchMigrationPath, 'utf8')), 'migration resolver lote');

    const saneamento = ok(psql(container, `
      select
        (select count(*) from private.emusys_cpf_hmac_vinculos) || '|' ||
        (select count(*) from private.emusys_cpf_hmac_vinculos where cpf_hmac ~ '^[0-9a-f]{64}$') || '|' ||
        (select count(*) from public.emusys_matriculas_estado_atual
          where payload_snapshot is distinct from private.remover_cpf_claro_jsonb(payload_snapshot)) || '|' ||
        (select count(*) from public.emusys_api_payload
          where payload is distinct from private.remover_cpf_claro_jsonb(payload)) || '|' ||
        (select count(*) from public.matriculas_emusys_decisoes_canonicas
          where snapshot_emusys is distinct from private.remover_cpf_claro_jsonb(snapshot_emusys));
    `), 'saneamento').at(-1);
    assert.equal(saneamento, '4|4|0|0|0');

    const resolver = ok(psql(container, `
      select set_config('app.test_role', 'service_role', false);
      select papel_cpf || '|' || aluno_id || '|' || emusys_matricula_id
        from public.resolver_emusys_cpf_hmac(
          (select cpf_hmac from private.emusys_cpf_hmac_vinculos where papel = 'responsavel' and emusys_matricula_id = 701)
        );
    `), 'resolver').at(-1);
    assert.equal(resolver, 'responsavel|10|701');

    const fallbackHistorico = ok(psql(container, `
      select set_config('app.test_role', 'service_role', false);
      select aluno_nome || '|' || responsavel_nome || '|' || emusys_aluno_id || '|' || emusys_matricula_id
        from public.resolver_emusys_cpf_hmac(
          (select cpf_hmac from private.emusys_cpf_hmac_vinculos where papel = 'responsavel' and emusys_matricula_id = 702)
        )
       where emusys_matricula_id = 702;
    `), 'resolver historico').at(-1);
    assert.equal(fallbackHistorico, 'Aluno Historico|Responsavel Historico|93|702');

    const resolverLote = ok(psql(container, `
      select set_config('app.test_role', 'service_role', false);
      with hashes as (
        select array_agg(cpf_hmac order by papel) as valores
        from private.emusys_cpf_hmac_vinculos
        where emusys_matricula_id = 701
      )
      select count(*) || '|' || count(distinct cpf_hmac)
      from public.resolver_emusys_cpf_hmac_lote((select valores from hashes));
    `), 'resolver lote').at(-1);
    assert.equal(resolverLote, '2|2');

    const responsavelCompartilhado = ok(psql(container, `
      select set_config('app.test_role', 'service_role', false);
      insert into public.emusys_matriculas_estado_atual (
        unidade_id, emusys_matricula_id, emusys_aluno_id, aluno_id, payload_snapshot, payload_hash
      ) values (
        '${unidade}', 703, 95, null,
        '{"aluno":{"id":95,"nome":"Outro Aluno"},"responsavel":{"id":92,"nome":"Responsavel Compartilhado"}}'::jsonb,
        'snapshot-seguro-703'
      );
      select public.replace_emusys_cpf_hmac_vinculos(
        '${unidade}',
        '[{"emusys_matricula_id":703,"emusys_aluno_id":95,"aluno_id":null,"emusys_responsavel_id":92,"aluno_cpf":null,"responsavel_cpf":"98765432100"}]'::jsonb
      );
      with responsavel as (
        select cpf_hmac
        from private.emusys_cpf_hmac_vinculos
        where emusys_matricula_id = 701 and papel = 'responsavel'
      )
      select
        string_agg(papel_cpf, ',' order by emusys_matricula_id) || '|' ||
        count(*) || '|' ||
        bool_and(emusys_responsavel_id = 92)
      from public.resolver_emusys_cpf_hmac_lote(array[(select cpf_hmac from responsavel)]);
    `), 'responsavel compartilhado').at(-1);
    assert.equal(responsavelCompartilhado, 'responsavel,responsavel|2|true');

    const substituicao = ok(psql(container, `
      select set_config('app.test_role', 'service_role', false);
      select public.replace_emusys_cpf_hmac_vinculos(
        '${unidade}',
        '[{"emusys_matricula_id":701,"emusys_aluno_id":91,"aluno_id":10,"emusys_responsavel_id":92,"aluno_cpf":"11122233344","responsavel_cpf":null}]'::jsonb
      );
      select
        count(*) || '|' ||
        count(*) filter (where papel = 'aluno') || '|' ||
        count(*) filter (where cpf_hmac ~ '^[0-9a-f]{64}$')
      from private.emusys_cpf_hmac_vinculos
      where unidade_id = '${unidade}' and emusys_matricula_id = 701;
    `), 'substituicao').at(-1);
    assert.equal(substituicao, '1|1|1');

    const acl = ok(psql(container, `
      select
        has_function_privilege('anon', 'public.resolver_emusys_cpf_hmac(text)', 'execute') || '|' ||
        has_function_privilege('authenticated', 'public.resolver_emusys_cpf_hmac(text)', 'execute') || '|' ||
        has_function_privilege('service_role', 'public.resolver_emusys_cpf_hmac(text)', 'execute') || '|' ||
        has_table_privilege('authenticated', 'private.emusys_cpf_hmac_vinculos', 'select');
    `), 'acl').at(-1);
    assert.equal(acl, 'false|false|true|false');

    const aclLote = ok(psql(container, `
      select
        has_function_privilege('anon', 'public.resolver_emusys_cpf_hmac_lote(text[])', 'execute') || '|' ||
        has_function_privilege('authenticated', 'public.resolver_emusys_cpf_hmac_lote(text[])', 'execute') || '|' ||
        has_function_privilege('service_role', 'public.resolver_emusys_cpf_hmac_lote(text[])', 'execute');
    `), 'acl lote').at(-1);
    assert.equal(aclLote, 'false|false|true');

    const trigger = ok(psql(container, `
      insert into public.automacao_log(payload_bruto, detalhes)
      values ('{"aluno":{"cpf":"11122233344","nome":"Teste"}}'::jsonb, '{"cpf_hash":"seguro"}'::jsonb);
      select payload_bruto::text || '|' || detalhes::text
        from public.automacao_log order by id desc limit 1;
    `), 'trigger').at(-1);
    assert.equal(trigger, '{"aluno": {"nome": "Teste"}}|{"cpf_hash": "seguro"}');

    const triggerComColunaNula = ok(psql(container, `
      insert into public.automacao_log(payload_bruto)
      values ('{"aluno":{"cpf":"11122233344","nome":"Teste Nulo"}}'::jsonb);
      select
        (payload_bruto is distinct from private.remover_cpf_claro_jsonb(payload_bruto)) || '|' ||
        (detalhes is null)
      from public.automacao_log order by id desc limit 1;
    `), 'trigger com coluna nula').at(-1);
    assert.equal(triggerComColunaNula, 'false|true');

    const backlog = ok(psql(container, `
      select set_config('app.test_role', 'service_role', false);
      with competencias as (
        select jsonb_array_elements_text(public.enqueue_financeiro_sync_backlog('teste', 'teste'))::date as competencia
      )
      select count(*) || '|' ||
             min(competencia) || '|' ||
             max(competencia)
        from competencias;
    `), 'backlog').at(-1);
    const [quantidade, minima, maxima] = backlog.split('|');
    assert.equal(quantidade, '5');
    assert.equal(minima, new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 10));
    assert.equal(maxima, new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 3, 1)).toISOString().slice(0, 10));
  } finally {
    docker(['rm', '-f', container], undefined, 30_000);
  }
});
