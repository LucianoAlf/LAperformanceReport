import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260905000151_contrato_assinado_canonico.sql';

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 24 * 1024 * 1024,
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
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL 17 descartavel nao ficou pronto');
}

const oldReturn = `
  pessoa_chave text, aluno_id_canonico integer, aluno_ids_locais integer[], nome text,
  unidade_id uuid, classificacao text, status_operacional text, matriculas_ativas integer,
  cursos text[], entrou_em date, matricula_recente_em date, responsavel_nome text,
  professores text[], aulas_resumo text[], anamnese_preenchida boolean, anamnese_em date,
  anamnese_tipo text, anamnese_flag_sem_registro boolean, anamnese_orfa_candidata_id integer,
  anamnese_orfa_match text, tem_instagram boolean, instagram_nao_possui boolean,
  tem_telefone boolean, tem_responsavel boolean, tem_foto boolean, tem_data_contrato boolean,
  contrato_vencido boolean, cadastro_completo boolean, cadastro_faltando text[],
  presenca_confirmadas integer, faltas_confirmadas integer, faltas_provaveis integer,
  chamadas_indeterminadas integer, presenca_taxa_geral numeric, presenca_confianca text,
  presenca_regra_versao text, ultima_aula_em date, dias_desde_ultima_aula integer,
  inadimplente boolean, faturas_vencidas_abertas integer, em_aviso_previo boolean,
  aviso_previo_mes_saida date, proxima_renovacao_em date, vence_em_30d boolean,
  na_comunidade_wa boolean, comunidade_status text, comunidade_capturado_em timestamptz,
  pendencias text[], fonte text, regra_versao text`;

test('PostgreSQL prova lote atomico, identidade por unidade e regra conservadora por pessoa', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-contrato-assinado-${process.pid}`;
  const started = docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine']);
  assert.equal(started.status, 0, started.stderr);

  try {
    await waitForPostgres(container);
    const fullMigration = readFileSync(migrationPath, 'utf8');
    const migration = fullMigration.slice(0, fullMigration.indexOf('-- Duas janelas:')) + '\ncommit;';
    const UA = '10000000-0000-4000-8000-000000000001';
    const UB = '20000000-0000-4000-8000-000000000002';

    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role sol_acesso_restrito nologin;
      create schema auth;
      create function auth.role() returns text language sql stable as $$ select current_user::text $$;

      create table public.unidades (id uuid primary key, codigo text);
      create table public.cursos (id integer primary key, nome text, is_projeto_banda boolean default false);
      create table public.alunos (
        id integer primary key,
        unidade_id uuid not null references public.unidades(id),
        curso_id integer references public.cursos(id),
        arquivado_em timestamptz,
        emusys_matricula_id text
      );
      create table public.emusys_matriculas_estado_atual (
        unidade_id uuid not null,
        emusys_matricula_id bigint not null,
        emusys_aluno_id bigint,
        aluno_id integer,
        emusys_contrato_id bigint,
        status_emusys text not null,
        payload_snapshot jsonb not null default '{}'::jsonb,
        payload_hash text not null default '',
        sincronizado_em timestamptz not null default now(),
        primary key (unidade_id, emusys_matricula_id)
      );
      create table public.vw_alunos_estado_operacional_v131 (
        aluno_id integer primary key,
        entra_base_ativa boolean not null
      );
      create function public.fn_usuario_atual_tem_permissao(text, uuid)
      returns boolean language sql stable as $$ select true $$;

      create table public.situacao_fixture (
        pessoa_chave text primary key,
        aluno_id_canonico integer,
        aluno_ids_locais integer[],
        nome text,
        unidade_id uuid
      );

      create function public.get_situacao_alunos_v1(uuid, date default current_date, boolean default false)
      returns table (${oldReturn}) language sql stable as $$
        select f.pessoa_chave, f.aluno_id_canonico, f.aluno_ids_locais, f.nome,
               f.unidade_id, 'LAMK'::text, 'ativo'::text, cardinality(f.aluno_ids_locais),
               '{}'::text[], null::date, null::date, null::text,
               '{}'::text[], '{}'::text[], false, null::date,
               null::text, false, null::integer,
               null::text, false, false,
               false, false, false, true,
               false, true, '{}'::text[],
               0, 0, 0,
               0, null::numeric, null::text,
               null::text, null::date, null::integer,
               false, 0, false,
               null::date, null::date, false,
               null::boolean, 'sem_captura'::text, null::timestamptz,
               '{}'::text[], 'fixture'::text, 'fixture'::text
        from public.situacao_fixture f where f.unidade_id = $1
        order by f.nome
      $$;

      insert into public.unidades values ('${UA}', 'A'), ('${UB}', 'B');
      insert into public.cursos values (1, 'Canto', false), (2, 'GarageBand', true);

      ${migration}

      insert into public.alunos values
        (1, '${UA}', 1, null, '865'), (2, '${UA}', 1, null, '866'),
        (3, '${UA}', 1, null, '867'), (4, '${UA}', 1, null, '868'),
        (5, '${UA}', 1, null, '869'), (6, '${UA}', 2, null, '870'),
        (7, '${UB}', 1, null, '865');
      insert into public.vw_alunos_estado_operacional_v131
      select id, true from public.alunos;
      insert into public.situacao_fixture values
        ('p-assinado', 1, array[1,2], 'Assinado', '${UA}'),
        ('p-nao-assinado', 3, array[3], 'Nao assinado', '${UA}'),
        ('p-sem-contrato', 4, array[4], 'Sem contrato', '${UA}'),
        ('p-nao-verificado', 5, array[5], 'Nao verificado', '${UA}'),
        ('p-dispensado', 6, array[6], 'Dispensado', '${UA}');

      insert into public.contrato_assinatura_sync_execucoes (id, unidade_id, unidade_slug)
      values ('30000000-0000-4000-8000-000000000001', '${UA}', 'a');
      select public.registrar_contrato_assinatura_lote_v1(
        '30000000-0000-4000-8000-000000000001', '${UA}', '2026-09-04 05:20-03',
        jsonb_build_array(
          jsonb_build_object('unidade_id','${UA}','emusys_matricula_id','865','emusys_aluno_id','1','contrato_emusys_id','901','contrato_assinado',true),
          jsonb_build_object('unidade_id','${UA}','emusys_matricula_id','866','emusys_aluno_id','2','contrato_emusys_id','902','contrato_assinado',true),
          jsonb_build_object('unidade_id','${UA}','emusys_matricula_id','867','emusys_aluno_id','3','contrato_emusys_id','903','contrato_assinado',false),
          jsonb_build_object('unidade_id','${UA}','emusys_matricula_id','868','emusys_aluno_id','4','contrato_emusys_id',null,'contrato_assinado',null)
        )
      );
      update public.contrato_assinatura_sync_execucoes
      set completed_at = '2026-09-04 05:21-03' where unidade_id = '${UA}';

      insert into public.contrato_assinatura_sync_execucoes (id, unidade_id, unidade_slug)
      values ('30000000-0000-4000-8000-000000000002', '${UB}', 'b');
      select public.registrar_contrato_assinatura_lote_v1(
        '30000000-0000-4000-8000-000000000002', '${UB}', '2026-09-04 05:22-03',
        jsonb_build_array(
          jsonb_build_object('unidade_id','${UB}','emusys_matricula_id','865','emusys_aluno_id','7','contrato_emusys_id','999','contrato_assinado',false)
        )
      );
    `);

    const statuses = JSON.parse(psql(container, String.raw`
      select jsonb_object_agg(nome, contrato_assinatura_status)
      from public.get_situacao_alunos_v1('${UA}', '2026-09-04', false);
    `));
    assert.deepEqual(statuses, {
      Assinado: 'assinado',
      'Nao assinado': 'nao_assinado',
      'Sem contrato': 'sem_contrato',
      'Nao verificado': 'nao_verificado',
      Dispensado: 'dispensado',
    });

    const allSigned = JSON.parse(psql(container, String.raw`
      select row_to_json(x) from (
        select contratos_relevantes, contratos_assinados, contratos_assinados_todos
        from public.get_situacao_alunos_v1('${UA}', '2026-09-04', false)
        where pessoa_chave = 'p-assinado'
      ) x;
    `));
    assert.deepEqual(allSigned, {
      contratos_relevantes: 2,
      contratos_assinados: 2,
      contratos_assinados_todos: true,
    });

    const scoped = Number(psql(container, String.raw`
      select count(distinct unidade_id) from public.aluno_contratos_emusys
      where emusys_matricula_id = '865';
    `));
    assert.equal(scoped, 2);

    const invalid = docker([
      'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1',
      '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-At',
    ], String.raw`
      insert into public.contrato_assinatura_sync_execucoes (id, unidade_id, unidade_slug)
      values ('30000000-0000-4000-8000-000000000003', '${UA}', 'a');
      select public.registrar_contrato_assinatura_lote_v1(
        '30000000-0000-4000-8000-000000000003', '${UA}', now(),
        '[{"unidade_id":"${UA}","emusys_matricula_id":"999","contrato_emusys_id":"1"}]'::jsonb
      );
    `);
    assert.notEqual(invalid.status, 0, 'lote sem booleano deveria falhar fechado');
    assert.equal(Number(psql(container, "select count(*) from public.aluno_contratos_emusys where emusys_matricula_id='999';")), 0);
  } finally {
    docker(['rm', '-f', container]);
  }
});
