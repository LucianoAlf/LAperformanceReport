import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260801213000_retificar_barra_julho_matricula_tardia.sql',
);

function docker(args, input) {
  return spawnSync('docker', args, {
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

async function aguardarPostgres(container) {
  for (let tentativa = 0; tentativa < 60; tentativa += 1) {
    const pronto = docker(['exec', container, 'pg_isready', '-U', 'postgres']);
    if (pronto.status === 0) {
      const consulta = docker([
        'exec', container, 'psql', '--no-psqlrc',
        '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1',
      ]);
      if (consulta.status === 0 && consulta.stdout.trim() === '1') return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

test('matricula tardia entra em julho por retificacao e nao altera o snapshot', { timeout: 90_000 }, async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration da matrícula tardia ausente');
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const definitionSql = migration.replace(/do \$retificar_barra_julho\$[\s\S]*$/i, '');

  const versao = docker(['version', '--format', '{{.Server.Version}}']);
  if (versao.status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-report-matricula-tardia-${process.pid}-${Date.now()}`;
  const iniciado = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(iniciado.status, 0, iniciado.stderr || iniciado.stdout);

  try {
    await aguardarPostgres(container);

    const schema = psql(container, `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create extension if not exists pgcrypto;

      create function auth.role() returns text
      language sql stable as $$ select 'service_role'::text $$;
      create function auth.uid() returns uuid
      language sql stable as $$ select null::uuid $$;

      create table public.unidades (
        id uuid primary key,
        nome text not null,
        codigo text not null,
        gerente_nome text,
        hunter_nome text,
        ativo boolean not null
      );
      create table public.cursos (
        id bigint primary key,
        nome text,
        is_projeto_banda boolean
      );
      create table public.tipos_matricula (
        id bigint primary key,
        codigo text,
        conta_como_pagante boolean,
        entra_ticket_medio boolean
      );
      create table public.professores (id bigint primary key, nome text);
      create table public.formas_pagamento (id bigint primary key, nome text);
      create table public.canais_origem (id bigint primary key, nome text);
      create table public.leads (
        id bigint primary key,
        unidade_id uuid,
        aluno_id bigint,
        emusys_lead_id integer,
        canal_origem_id bigint,
        created_at timestamptz
      );
      create table public.alunos (
        id bigint primary key,
        unidade_id uuid,
        nome text,
        idade_atual integer,
        data_matricula date,
        telefone text,
        responsavel_telefone text,
        emusys_matricula_id text,
        emusys_lead_id text,
        lead_origem_id bigint,
        valor_passaporte numeric,
        valor_parcela numeric,
        curso_id bigint,
        professor_atual_id bigint,
        professor_experimental_id bigint,
        forma_pagamento_id bigint,
        canal_origem_id bigint,
        tipo_matricula_id bigint,
        is_segundo_curso boolean,
        status text,
        created_at timestamptz,
        arquivado_em timestamptz
      );
      create table public.fechamento_mensal_snapshots (
        id uuid primary key default gen_random_uuid(),
        unidade_id uuid,
        ano integer,
        mes integer,
        escopo text,
        dominio text,
        versao integer,
        status text,
        payload jsonb,
        payload_hash text,
        capturado_em timestamptz
      );
      create table public.fechamento_mensal_retificacoes (
        id uuid primary key default gen_random_uuid(),
        snapshot_id uuid not null,
        base_payload_hash text not null,
        payload_corrigido jsonb not null,
        payload_corrigido_hash text not null,
        motivo text not null,
        evidencias jsonb not null default '{}'::jsonb,
        created_by uuid,
        created_at timestamptz not null default now(),
        unique (snapshot_id, payload_corrigido_hash)
      );
      create table public.fechamento_mensal_auditoria (
        id uuid primary key default gen_random_uuid(),
        snapshot_id uuid,
        ano integer,
        mes integer,
        escopo text,
        unidade_id uuid,
        acao text check (acao = any (array[
          'preview_gerado'::text,
          'snapshot_gravado'::text,
          'snapshot_aprovado'::text,
          'snapshot_fechado'::text,
          'compatibilidade_dados_mensais_atualizada'::text,
          'writer_legado_bloqueado'::text,
          'retificacao_solicitada'::text
        ])),
        detalhes jsonb,
        actor_id uuid,
        created_at timestamptz default now()
      );

      create function public.hash_jsonb_canonico(p_payload jsonb)
      returns text language sql immutable as $$
        select encode(digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex')
      $$;

      create function public.get_relatorio_mensal_canonico_v1(
        p_tipo text,
        p_unidade_id uuid,
        p_ano integer,
        p_mes integer
      ) returns jsonb language plpgsql stable as $$
      declare
        v_snapshot public.fechamento_mensal_snapshots%rowtype;
        v_retificacao public.fechamento_mensal_retificacoes%rowtype;
        v_resultado jsonb;
      begin
        select * into strict v_snapshot
        from public.fechamento_mensal_snapshots
        where unidade_id=p_unidade_id and ano=p_ano and mes=p_mes
          and dominio='relatorio_comercial_mensal' and status='fechado';
        v_resultado := jsonb_build_object(
          'snapshot_id', v_snapshot.id,
          'payload_hash', v_snapshot.payload_hash,
          'versao', v_snapshot.versao,
          'status', v_snapshot.status,
          'payload', v_snapshot.payload
        );
        select * into v_retificacao
        from public.fechamento_mensal_retificacoes
        where snapshot_id=v_snapshot.id
        order by created_at desc, id desc limit 1;
        if v_retificacao.id is not null then
          v_resultado := v_resultado || jsonb_build_object(
            'snapshot_payload_hash', v_snapshot.payload_hash,
            'payload_hash', v_retificacao.payload_corrigido_hash,
            'payload', v_retificacao.payload_corrigido,
            'retificacao_id', v_retificacao.id,
            'retificado', true
          );
        end if;
        return v_resultado;
      end $$;

      create function public.get_conciliacao_experimentais_v2(
        p_unidade_id uuid,
        p_ano integer,
        p_mes integer,
        p_periodo text,
        p_data date
      ) returns jsonb language sql stable as $$
        select jsonb_build_object('resumo', jsonb_build_object(
          'matriculas_comerciais_canonicas_periodo', 20,
          'denominador_taxa_exp_mat', 43,
          'conversoes_exp_mat_canonicas', 17,
          'pendencias_taxa_exp_mat', 0
        ))
      $$;

      insert into public.unidades values
        ('368d47f5-2d88-4475-bc14-ba084a9a348e', 'Barra', 'BARRA', 'Krissya', 'Kailane', true),
        ('95553e96-971b-4590-a6eb-0201d013c14d', 'Recreio', 'REC', 'Fabiola/Clayton', 'Daiana', true);
      insert into public.cursos values (1, 'Canto', false);
      insert into public.tipos_matricula values (1, 'REGULAR', true, true);
      insert into public.professores values (1, 'Gabriel Santos Teixeira da Silva');
      insert into public.formas_pagamento values (1, 'Crédito Recorrente');
      insert into public.canais_origem values (1, 'Instagram');
      insert into public.leads values
        (11248, '368d47f5-2d88-4475-bc14-ba084a9a348e', 1893, 7093, 1, '2026-07-22 12:48:45+00');
      insert into public.alunos values (
        1893, '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Luíza P Caruso', 10,
        '2026-07-31', null, null, '840', '7093', 11248, 450, 440, 1, 1, 1, 1,
        null, 1, false, 'ativo', '2026-08-01 17:01:03+00', null
      );

      with itens as (
        select jsonb_agg(jsonb_build_object(
          'id', n,
          'nome', 'Aluno ' || n,
          'idade', 10,
          'data_matricula', '2026-07-15',
          'cursos', 'Canto',
          'professores', 'Professor',
          'professores_experimentais', 'Professor',
          'formas_pagamento', 'Crédito Recorrente',
          'canal', 'Instagram',
          'valor_passaporte', 400,
          'valor_parcela', 400,
          'parcelas', jsonb_build_array(400)
        ) order by n) payload
        from generate_series(1, 19) n
      ), documento as (
        select jsonb_build_object(
          'schema_version', 1,
          'tipo', 'comercial',
          'competencia', jsonb_build_object('ano', 2026, 'mes', 7, 'inicio', '2026-07-01', 'fim_exclusivo', '2026-08-01'),
          'unidade', jsonb_build_object('id', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'nome', 'Barra', 'hunter', 'Kailane'),
          'resumo', jsonb_build_object(
            'leads', 261, 'experimentais', 43, 'faltas', 5, 'visitas', 0,
            'matriculas', 19, 'conversoes_exp_mat', 16, 'pendencias_conciliacao', 0,
            'taxa_lead_exp', 16.5, 'taxa_exp_mat', 37.2, 'taxa_lead_mat', 7.3,
            'total_passaportes', 7600, 'total_parcelas', 7600,
            'ticket_medio_passaporte', 400, 'ticket_medio_parcela', 400
          ),
          'matriculas', itens.payload,
          'matriculas_por_canal', jsonb_build_array(jsonb_build_object('nome', 'Instagram', 'quantidade', 19)),
          'matriculas_por_curso', jsonb_build_array(jsonb_build_object('nome', 'Canto', 'quantidade', 19)),
          'alertas', '[]'::jsonb,
          'capturado_em', '2026-08-01T12:01:39.293689+00:00'
        ) payload
        from itens
      )
      insert into public.fechamento_mensal_snapshots (
        id, unidade_id, ano, mes, escopo, dominio,versao,status,payload,payload_hash,capturado_em
      )
      select
        '4f701560-05a8-455b-828f-00a5d72e3bb8',
        '368d47f5-2d88-4475-bc14-ba084a9a348e',
        2026,7,'unidade','relatorio_comercial_mensal',1,'fechado',
        payload, public.hash_jsonb_canonico(payload), '2026-08-01 12:01:39.293689+00'
      from documento;
    `);
    assert.equal(schema.status, 0, schema.stderr || schema.stdout);

    const aplicada = psql(container, definitionSql);
    assert.equal(aplicada.status, 0, aplicada.stderr || aplicada.stdout);

    const retificada = psql(container, `
      select public.aplicar_retificacao_relatorio_comercial_matricula_tardia_v1(
        '368d47f5-2d88-4475-bc14-ba084a9a348e', 2026, 7,
        (select payload_hash from public.fechamento_mensal_snapshots where id='4f701560-05a8-455b-828f-00a5d72e3bb8'),
        1893, '840', date '2026-07-31',
        'Inclusão auditada da matrícula lançada após o fechamento com competência em julho.',
        jsonb_build_object('origem', 'teste')
      )->>'inserida';
    `);
    assert.equal(retificada.status, 0, retificada.stderr || retificada.stdout);
    assert.equal(retificada.stdout.trim(), 'true');

    const verificacao = psql(container, `
      with base as (
        select *, public.hash_jsonb_canonico(payload) as hash_recalculado
        from public.fechamento_mensal_snapshots
        where id='4f701560-05a8-455b-828f-00a5d72e3bb8'
      ), efetivo as (
        select public.get_relatorio_mensal_canonico_v1(
          'comercial', unidade_id, ano, mes
        ) doc from base
      )
      select jsonb_build_object(
        'gerente', (select gerente_nome from public.unidades where codigo='REC'),
        'snapshot_matriculas', base.payload#>>'{resumo,matriculas}',
        'snapshot_hash_integro', base.payload_hash=base.hash_recalculado,
        'efetivo_matriculas', efetivo.doc#>>'{payload,resumo,matriculas}',
        'efetivo_lista', jsonb_array_length(efetivo.doc#>'{payload,matriculas}'),
        'contem_luiza', exists (
          select 1 from jsonb_array_elements(efetivo.doc#>'{payload,matriculas}') i
          where i->>'id'='1893'
        ),
        'datas_fora_julho', (
          select count(*) from jsonb_array_elements(efetivo.doc#>'{payload,matriculas}') i
          where (i->>'data_matricula')::date < date '2026-07-01'
             or (i->>'data_matricula')::date >= date '2026-08-01'
        ),
        'total_passaportes', efetivo.doc#>>'{payload,resumo,total_passaportes}',
        'total_parcelas', efetivo.doc#>>'{payload,resumo,total_parcelas}',
        'ticket_passaporte', efetivo.doc#>>'{payload,resumo,ticket_medio_passaporte}',
        'ticket_parcela', efetivo.doc#>>'{payload,resumo,ticket_medio_parcela}',
        'conversoes', efetivo.doc#>>'{payload,resumo,conversoes_exp_mat}',
        'taxa_exp_mat', efetivo.doc#>>'{payload,resumo,taxa_exp_mat}',
        'taxa_lead_mat', efetivo.doc#>>'{payload,resumo,taxa_lead_mat}',
        'canal_instagram', efetivo.doc#>>'{payload,matriculas_por_canal,0,quantidade}',
        'curso_canto', efetivo.doc#>>'{payload,matriculas_por_curso,0,quantidade}',
        'retificacoes', (select count(*) from public.fechamento_mensal_retificacoes),
        'auditorias', (select count(*) from public.fechamento_mensal_auditoria),
        'retificado', efetivo.doc->>'retificado'
      )
      from base cross join efetivo;
    `);
    assert.equal(verificacao.status, 0, verificacao.stderr || verificacao.stdout);
    const dados = JSON.parse(verificacao.stdout.trim());
    assert.equal(dados.gerente, 'Clayton');
    assert.equal(dados.snapshot_matriculas, '19');
    assert.equal(dados.snapshot_hash_integro, true);
    assert.equal(dados.efetivo_matriculas, '20');
    assert.equal(dados.efetivo_lista, 20);
    assert.equal(dados.contem_luiza, true);
    assert.equal(dados.datas_fora_julho, 0);
    assert.equal(dados.total_passaportes, '8050.00');
    assert.equal(dados.total_parcelas, '8040.00');
    assert.equal(dados.ticket_passaporte, '402.50');
    assert.equal(dados.ticket_parcela, '402.00');
    assert.equal(dados.conversoes, '17');
    assert.equal(dados.taxa_exp_mat, '39.5');
    assert.equal(dados.taxa_lead_mat, '7.7');
    assert.equal(dados.canal_instagram, '20');
    assert.equal(dados.curso_canto, '20');
    assert.equal(dados.retificacoes, 1);
    assert.equal(dados.auditorias, 1);
    assert.equal(dados.retificado, 'true');

    const reaplicada = psql(container, `
      with doc as (
        select public.get_relatorio_mensal_canonico_v1(
          'comercial', '368d47f5-2d88-4475-bc14-ba084a9a348e', 2026, 7
        ) value
      )
      select public.aplicar_retificacao_relatorio_comercial_matricula_tardia_v1(
        '368d47f5-2d88-4475-bc14-ba084a9a348e', 2026, 7,
        (select value->>'payload_hash' from doc),
        1893, '840', date '2026-07-31',
        'Reaplicação idempotente da matrícula tardia já auditada anteriormente.',
        '{}'::jsonb
      )->>'inserida';
      select count(*) from public.fechamento_mensal_retificacoes;
      select count(*) from public.fechamento_mensal_auditoria;
    `);
    assert.equal(reaplicada.status, 0, reaplicada.stderr || reaplicada.stdout);
    assert.deepEqual(reaplicada.stdout.trim().split(/\r?\n/), ['false', '1', '1']);
  } finally {
    docker(['rm', '--force', container]);
  }
});
