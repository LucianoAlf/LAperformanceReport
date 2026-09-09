import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260909082804_relatorio_coordenacao_amostra_exata_painel_v4.sql',
  import.meta.url,
);

const dockerWindows = join(
  process.env.LOCALAPPDATA || '',
  'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe',
);
const dockerExecutable = process.platform === 'win32' && existsSync(dockerWindows)
  ? dockerWindows
  : 'docker';

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024,
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
    ('10000000-0000-0000-0000-000000000001','Unidade Fixture',true);

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
    observacao text,
    capturado_em timestamptz not null default now(),
    capturado_por uuid,
    aprovado_em timestamptz,
    aprovado_por uuid,
    fechado_em timestamptz,
    fechado_por uuid
  );

  create function public.hash_jsonb_canonico(payload jsonb)
  returns text language sql stable as $$
    select encode(digest(coalesce(payload,'{}'::jsonb)::text,'sha256'),'hex')
  $$;

  create function public.fn_health_score_professor_v3_competencia_ciclo_vivo(date,date)
  returns date language sql stable security definer as $$ select $1 $$;

  create function public.get_health_score_professor_v3_performance_snapshot_v3(
    date,uuid,text
  ) returns table (professor_id integer, metrica text, amostra integer)
  language sql stable security definer as $$
    values (1,'retencao',null::integer),(1,'presenca',7)
  $$;

  create function public.montar_relatorio_coordenacao_conteudo_v4(
    p_unidade_id uuid,p_ano integer,p_mes integer,p_periodicidade text
  ) returns jsonb language sql stable security definer as $$
    select jsonb_build_object(
      'schema_version',4,
      'periodo',jsonb_build_object(
        'ano',p_ano,'mes',p_mes,'periodicidade',p_periodicidade,
        'unidade_id',p_unidade_id
      ),
      'professores',jsonb_build_array(jsonb_build_object(
        'professor_id',1,
        'nome','Professora Fixture',
        'metricas',jsonb_build_object(
          'retencao',jsonb_build_object('valor_bruto',null,'amostra',0),
          'presenca',jsonb_build_object('valor_bruto',70,'amostra',7)
        )
      )),
      'motor_documento',jsonb_build_object('versao','anterior')
    )
  $$;

  create function public.materializar_relatorio_coordenacao_documento_v4(
    p_unidade_id uuid,p_ano integer,p_mes integer,p_periodicidade text,
    p_status text default 'preview',p_observacao text default null
  ) returns jsonb language plpgsql security definer as $$
  declare
    v_id uuid := gen_random_uuid();
    v_escopo text := case when p_unidade_id is null then 'consolidado' else 'unidade' end;
    v_dominio text := case when p_periodicidade='ciclo'
      then 'relatorio_coordenacao_ciclo' else 'relatorio_coordenacao' end;
    v_conteudo jsonb;
    v_hash text;
    v_versao integer;
    v_payload jsonb;
  begin
    v_conteudo := public.montar_relatorio_coordenacao_conteudo_v4(
      p_unidade_id,p_ano,p_mes,p_periodicidade
    );
    v_hash := public.hash_jsonb_canonico(v_conteudo);
    select coalesce(max(versao),0)+1 into v_versao
    from public.fechamento_mensal_snapshots
    where ano=p_ano and mes=p_mes and escopo=v_escopo
      and unidade_id is not distinct from p_unidade_id and dominio=v_dominio;
    v_payload := v_conteudo || jsonb_build_object('documento',jsonb_build_object(
      'id',v_id,'versao',v_versao,'hash',v_hash,'status',p_status
    ));
    insert into public.fechamento_mensal_snapshots(
      id,ano,mes,escopo,unidade_id,dominio,versao,status,fonte,payload,payload_hash,observacao
    ) values (
      v_id,p_ano,p_mes,v_escopo,p_unidade_id,v_dominio,v_versao,p_status,
      'fixture',v_payload,v_hash,p_observacao
    );
    return jsonb_build_object('ok',true,'id',v_id,'versao',v_versao);
  end
  $$;

  select public.materializar_relatorio_coordenacao_documento_v4(
    null,2026,9,'ciclo','preview','documento anterior preservado'
  );
`;

test('documento V4 preserva null e numero da amostra exatamente como o painel', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  assert.equal(existsSync(migrationPath), true, 'migration de amostra exata ausente');
  const container = `la-coord-amostra-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const applied = psql(container, `${fixture}\n${migration}`);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = psql(container, String.raw`
      with latest as (
        select distinct on (ano,mes,escopo,coalesce(unidade_id::text,'consolidado'),dominio)
          *
        from public.fechamento_mensal_snapshots
        order by ano,mes,escopo,coalesce(unidade_id::text,'consolidado'),dominio,versao desc
      )
      select jsonb_build_object(
        'documentos',count(*),
        'hash_validos',count(*) filter(
          where payload_hash=public.hash_jsonb_canonico(payload-'documento')
        ),
        'motor_correto',bool_and(
          payload#>>'{motor_documento,versao}'='coordenacao-v4-amostra-exata-20260909'
        ),
        'amostra_nula_exata',bool_and(
          jsonb_typeof(payload#>'{professores,0,metricas,retencao,amostra}')='null'
        ),
        'amostra_numerica_exata',bool_and(
          payload#>'{professores,0,metricas,presenca,amostra}'='7'::jsonb
        ),
        'documentos_anteriores_preservados',(
          select count(*) from public.fechamento_mensal_snapshots
        ) > count(*)
      )::text
      from latest;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      documentos: 12,
      hash_validos: 12,
      motor_correto: true,
      amostra_nula_exata: true,
      amostra_numerica_exata: true,
      documentos_anteriores_preservados: true,
    });
  } finally {
    docker(['stop', container]);
  }
});
