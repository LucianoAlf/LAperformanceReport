import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const corePath = new URL(
  '../supabase/migrations/20260909040926_relatorio_coordenacao_documento_v4.sql',
  import.meta.url,
);
const finalityPath = new URL(
  '../supabase/migrations/20260909054818_relatorio_coordenacao_finalidade_v4.sql',
  import.meta.url,
);
const dockerWindows = join(
  process.env.LOCALAPPDATA || '',
  'Programs',
  'DockerDesktop',
  'resources',
  'bin',
  'docker.exe',
);
const dockerExecutable = process.platform === 'win32' && existsSync(dockerWindows)
  ? dockerWindows
  : 'docker';

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function waitForPostgres(container) {
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks >= 3) return;
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

const fixture = String.raw`
  create extension pgcrypto;
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

  create table public.unidades (
    id uuid primary key,
    nome text not null,
    ativo boolean not null default true
  );
  insert into public.unidades values
    ('10000000-0000-0000-0000-000000000001', 'Unidade Fixture', true);

  create table public.fechamento_mensal_snapshots (
    id uuid primary key default gen_random_uuid(),
    ano integer not null,
    mes integer not null,
    escopo text not null,
    unidade_id uuid,
    dominio text not null,
    versao integer not null,
    status text not null,
    fonte text not null,
    payload jsonb not null,
    payload_hash text not null,
    financeiro_realizado_disponivel boolean not null default false,
    observacao text,
    capturado_em timestamptz not null default now(),
    capturado_por uuid,
    aprovado_em timestamptz,
    aprovado_por uuid,
    fechado_em timestamptz,
    fechado_por uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint fechamento_mensal_snapshots_dominio_check check (
      dominio in (
        'alunos_admin','alunos_executivo','comercial','retencao','renovacoes',
        'professores','relatorio_admin','relatorio_admin_mensal',
        'relatorio_comercial_mensal','relatorio_gerencial','relatorio_coordenacao',
        'metas','programa_matriculador','programa_fideliza','compatibilidade_dados_mensais'
      )
    )
  );
  create unique index ux_fechamento_mensal_snapshots_competencia_dominio
    on public.fechamento_mensal_snapshots (
      ano,mes,escopo,
      coalesce(unidade_id,'00000000-0000-0000-0000-000000000000'::uuid),
      dominio,versao
    );

  create function public.hash_jsonb_canonico(payload jsonb)
  returns text language sql stable as $$
    select encode(digest(coalesce(payload, '{}'::jsonb)::text, 'sha256'), 'hex')
  $$;
  create function public.fn_health_score_professor_v3_ator_leitura(uuid)
  returns integer language sql stable security definer as $$ select 1 $$;
  grant execute on function public.fn_health_score_professor_v3_ator_leitura(uuid)
    to authenticated,service_role;

  create table public.fixture_relatorio_v3 (
    id integer primary key,
    valor integer not null
  );
  insert into public.fixture_relatorio_v3 values (1,1);
  create function public.get_relatorio_coordenacao_canonico_v3(
    p_unidade_id uuid,p_ano integer,p_mes integer,p_periodicidade text default 'mensal'
  ) returns jsonb language sql stable security definer as $$
    select jsonb_build_object(
      'schema_version',3,
      'periodo',jsonb_build_object('ano',p_ano,'mes',p_mes,'periodicidade',p_periodicidade),
      'professores',jsonb_build_array(jsonb_build_object(
        'professor_id',7,'nome','Professor Fixture','valor_fixture',valor
      ))
    ) from public.fixture_relatorio_v3 where id=1
  $$;
`;

test('documento final nao regride para preview e retificacao e imutavel', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-coord-finality-${process.pid}-${Date.now()}`;
  const started = docker([
    'run','--detach','--rm','--name',container,
    '--env','POSTGRES_PASSWORD=postgres','postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const core = readFileSync(corePath, 'utf8');
    const finality = readFileSync(finalityPath, 'utf8');
    const applied = psql(container, `${fixture}\n${core}\n${finality}`);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const lifecycle = psql(container, String.raw`
      set role service_role;
      select public.materializar_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001',2026,8,'mensal','preview','fixture'
      );
      select public.materializar_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001',2026,8,'mensal','fechado','fixture'
      );
      reset role;
      update public.fixture_relatorio_v3 set valor=2 where id=1;
      set role service_role;
      select public.materializar_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001',2026,8,'mensal','retificado','correcao'
      );
      select public.materializar_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001',2026,8,'mensal','preview','job diario'
      )::text;
    `);
    assert.equal(lifecycle.status, 0, lifecycle.stderr || lifecycle.stdout);
    const previewAfterFinal = JSON.parse(lifecycle.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(previewAfterFinal.criado, false);
    assert.equal(previewAfterFinal.status, 'retificado');
    assert.equal(previewAfterFinal.finalizado, true);

    const roguePreview = psql(container, String.raw`
      do $$
      declare v_id uuid:=gen_random_uuid(); v_content jsonb; v_hash text;
      begin
        v_content := jsonb_build_object(
          'schema_version',4,'periodo',jsonb_build_object('ano',2026,'mes',8,'periodicidade','mensal'),
          'professores',jsonb_build_array(jsonb_build_object('professor_id',7,'valor_fixture',999))
        );
        v_hash:=public.hash_jsonb_canonico(v_content);
        insert into public.fechamento_mensal_snapshots(
          id,ano,mes,escopo,unidade_id,dominio,versao,status,fonte,payload,payload_hash
        ) values (
          v_id,2026,8,'unidade','10000000-0000-0000-0000-000000000001',
          'relatorio_coordenacao',99,'preview','rogue',
          v_content || jsonb_build_object('documento',jsonb_build_object(
            'id',v_id,'versao',99,'hash',v_hash,'status','preview'
          )),v_hash
        );
      end $$;
      set role authenticated;
      select public.get_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001',2026,8,'mensal'
      ) #>> '{professores,0,valor_fixture}';
    `);
    assert.equal(roguePreview.status, 0, roguePreview.stderr || roguePreview.stdout);
    assert.equal(roguePreview.stdout.trim().split(/\r?\n/).at(-1), '2');

    const mutateFinal = psql(container, String.raw`
      update public.fechamento_mensal_snapshots
      set observacao='alterado'
      where dominio='relatorio_coordenacao' and status='retificado';
    `);
    assert.notEqual(mutateFinal.status, 0);
    assert.match(mutateFinal.stderr, /RELATORIO_COORDENACAO_V4_DOCUMENTO_FINAL_IMUTAVEL/);

    const deleteFinal = psql(container, String.raw`
      delete from public.fechamento_mensal_snapshots
      where dominio='relatorio_coordenacao' and status='retificado';
    `);
    assert.notEqual(deleteFinal.status, 0);
    assert.match(deleteFinal.stderr, /RELATORIO_COORDENACAO_V4_DOCUMENTO_FINAL_IMUTAVEL/);

    const newRetification = psql(container, String.raw`
      update public.fixture_relatorio_v3 set valor=3 where id=1;
      set role service_role;
      select public.materializar_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001',2026,8,'mensal','retificado','nova correcao'
      )::text;
    `);
    assert.equal(newRetification.status, 0, newRetification.stderr || newRetification.stdout);
    const retification = JSON.parse(newRetification.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(retification.criado, true);
    assert.equal(retification.status, 'retificado');
  } finally {
    docker(['stop',container]);
  }
});
