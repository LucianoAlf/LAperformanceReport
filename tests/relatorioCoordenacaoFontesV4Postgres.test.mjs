import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260909040936_relatorio_coordenacao_fontes_v4.sql',
  import.meta.url,
);
const carteiraTotalMigrationPath = new URL(
  '../supabase/migrations/20260909042112_relatorio_coordenacao_carteira_total_v4.sql',
  import.meta.url,
);
const matriculadorFechadoMigrationPath = new URL(
  '../supabase/migrations/20260909042826_relatorio_coordenacao_matriculador_fechado_v4.sql',
  import.meta.url,
);
const carteiraRosterMigrationPath = new URL(
  '../supabase/migrations/20260909043652_relatorio_coordenacao_carteira_roster_v4.sql',
  import.meta.url,
);
const matriculadorSemFallbackMigrationPath = new URL(
  '../supabase/migrations/20260909045906_relatorio_coordenacao_sem_fallback_legado_v4.sql',
  import.meta.url,
);
const matriculadorImutavelMigrationPath = new URL(
  '../supabase/migrations/20260909081127_relatorio_comercial_professor_experimental_imutavel.sql',
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
    maxBuffer: 30 * 1024 * 1024,
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const mainProcess = docker([
      'exec', container,
      'sh', '-c', 'test "$(cat /proc/1/comm)" = postgres',
    ]);
    if (mainProcess.status === 0 && psql(container, 'select 1;').status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

const unitId = '10000000-0000-0000-0000-000000000001';
const secondUnitId = '20000000-0000-0000-0000-000000000002';

const fixture = String.raw`
  create extension pgcrypto;
  create extension unaccent;
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

  create table public.unidades (
    id uuid primary key,
    codigo text not null,
    nome text not null,
    ativo boolean not null default true
  );
  create table public.professores (
    id integer primary key,
    nome text not null,
    nome_normalizado text,
    ativo boolean not null default true
  );
  create table public.professores_unidades (
    professor_id integer not null,
    unidade_id uuid not null,
    emusys_ativo boolean not null default true,
    validacao_status text not null default 'validado'
  );
  create table public.alunos (
    id integer primary key,
    nome text,
    professor_experimental_id integer,
    is_segundo_curso boolean not null default false,
    created_at timestamptz not null
  );
  create table public.professor_carteira_mensal_canonica (
    id uuid primary key default gen_random_uuid(),
    competencia date not null,
    unidade_id uuid not null,
    professor_id integer not null,
    carteira_alunos integer not null,
    fonte text,
    auditado_em timestamptz,
    created_at timestamptz not null default now()
  );
  create table public.fixture_carteira_composicao (
    competencia date not null,
    unidade_id uuid not null,
    professor_id integer not null,
    carteira_regular integer,
    carteira_atividade_extra integer,
    carteira_so_atividade_extra integer,
    carteira_total integer,
    turmas_regular integer,
    turmas_total integer
  );
  create table public.fixture_carteira_kpi (
    competencia date not null,
    unidade_id uuid not null,
    professor_id integer not null,
    carteira_alunos integer,
    media_alunos_turma numeric,
    total_turmas integer,
    alunos_via_turmas integer,
    turmas_elegiveis_media integer
  );
  create table public.fixture_matriculas_live (
    unidade_id uuid not null,
    aluno_id integer not null,
    data_matricula date not null,
    conta boolean not null default true
  );
  create table public.motivos_saida (
    id integer primary key,
    nome text,
    ativo boolean,
    conta_score_professor boolean
  );
  create table public.movimentacoes_admin (
    id integer primary key,
    unidade_id uuid not null,
    data date not null,
    tipo text not null,
    aluno_nome text,
    aluno_id integer,
    professor_id integer,
    motivo text,
    motivo_saida_id integer,
    valor_parcela_evasao numeric,
    valor_parcela_anterior numeric,
    anulado boolean not null default false
  );
  create table public.health_score_professor_v3_snapshots (
    id uuid primary key default gen_random_uuid(),
    professor_id integer not null,
    escopo text not null,
    unidade_id uuid,
    competencia date not null,
    revisao integer not null,
    estado text not null,
    invalidado_em timestamptz,
    periodicidade text not null,
    criado_em timestamptz not null default now()
  );
  create table public.health_score_professor_v3_snapshot_metricas (
    id uuid primary key default gen_random_uuid(),
    snapshot_id uuid not null,
    metrica text not null,
    valor_bruto numeric,
    numerador numeric,
    denominador numeric,
    amostra integer,
    estado_base text,
    confianca text,
    fonte text,
    regra_versao text,
    motivo_sem_base text,
    codigo_evidencia text,
    detalhes jsonb
  );
  create table public.fechamento_mensal_snapshots (
    id uuid primary key default gen_random_uuid(),
    ano integer not null,
    mes integer not null,
    escopo text not null,
    unidade_id uuid,
    dominio text not null,
    versao integer not null,
    status text not null,
    fonte text not null default 'fixture',
    payload jsonb not null,
    payload_hash text not null default 'fixture',
    observacao text,
    capturado_em timestamptz not null,
    capturado_por uuid,
    aprovado_em timestamptz,
    aprovado_por uuid,
    fechado_em timestamptz,
    fechado_por uuid,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  );
  create table public.fechamento_mensal_auditoria (
    id bigserial primary key,
    snapshot_id uuid not null,
    ano integer not null,
    mes integer not null,
    escopo text not null,
    unidade_id uuid,
    acao text not null,
    detalhes jsonb not null,
    actor_id uuid
  );

  create function public.hash_jsonb_canonico(payload jsonb)
  returns text language sql stable as $$
    select encode(digest(coalesce(payload, '{}'::jsonb)::text, 'sha256'), 'hex')
  $$;

  create function public.montar_relatorio_comercial_mensal_payload_v1(uuid,integer,integer)
  returns jsonb language sql stable security definer as $$
    select jsonb_build_object(
      'competencia',jsonb_build_object('ano',$2,'mes',$3),
      'unidade',jsonb_build_object('id',$1),
      'matriculas','[]'::jsonb,
      'resumo',jsonb_build_object('matriculas',0)
    )
  $$;

  insert into public.unidades values
    ('${unitId}', 'CG', 'Campo Grande', true),
    ('${secondUnitId}', 'OUTRA', 'Unidade sem professor 2 no roster', true);
  insert into public.professores values
    (1, 'Valdo Delfino', 'valdo delfino', true),
    (2, 'Professor sem matricula', 'professor sem matricula', true);
  insert into public.professores_unidades values
    (1, '${unitId}', true, 'validado'),
    (2, '${unitId}', true, 'validado'),
    (1, '${secondUnitId}', true, 'validado'),
    (2, '${secondUnitId}', true, 'validado');

  create function public.fn_health_score_v3_periodo(p_competencia date, p_periodicidade text)
  returns table(periodo_inicio date, periodo_fim date, ciclo_codigo text, periodo_label text)
  language sql stable as $$
    select case
      when p_periodicidade = 'ciclo' and extract(month from p_competencia)::int between 6 and 8 then date '2026-06-01'
      when p_periodicidade = 'ciclo' and extract(month from p_competencia)::int between 9 and 11 then date '2026-09-01'
      else date_trunc('month', p_competencia)::date end,
    case
      when p_periodicidade = 'ciclo' and extract(month from p_competencia)::int between 6 and 8 then date '2026-08-31'
      when p_periodicidade = 'ciclo' and extract(month from p_competencia)::int between 9 and 11 then date '2026-11-30'
      else (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date end,
    case when p_periodicidade = 'ciclo' then 'fixture-ciclo' else to_char(p_competencia, 'YYYY-MM') end,
    case when p_periodicidade = 'ciclo' then 'Ciclo fixture' else to_char(p_competencia, 'MM/YYYY') end;
  $$;

  create function public.fn_health_score_v3_unidades_permitidas_sombra(uuid)
  returns table(unidade_id uuid) language sql stable as $$
    select id from public.unidades where ativo order by id
  $$;

  create function public.get_carteira_professor_periodo_composicao_v1(
    p_ano integer, p_mes integer, p_unidade_id uuid,
    p_data_inicio date, p_data_fim date
  ) returns table(
    professor_id integer, unidade_id uuid, carteira_regular integer,
    carteira_atividade_extra integer, carteira_so_atividade_extra integer,
    carteira_total integer, turmas_regular integer, turmas_total integer,
    atividades_extras jsonb
  ) language sql stable as $$
    select f.professor_id, f.unidade_id, f.carteira_regular,
      f.carteira_atividade_extra, f.carteira_so_atividade_extra,
      f.carteira_total, f.turmas_regular, f.turmas_total, '[]'::jsonb
    from public.fixture_carteira_composicao f
    where f.competencia = make_date(p_ano, p_mes, 1)
      and f.unidade_id = p_unidade_id;
  $$;

  create function public.get_carteira_professor_periodo_canonica(
    p_ano integer, p_mes integer, p_unidade_id uuid,
    p_data_inicio date, p_data_fim date
  ) returns table(
    professor_id integer, unidade_id uuid, carteira_alunos integer,
    media_alunos_turma numeric, total_turmas integer,
    alunos_via_turmas integer, turmas_elegiveis_media integer,
    fonte_carteira text
  ) language sql stable as $$
    select f.professor_id, f.unidade_id, f.carteira_alunos,
      f.media_alunos_turma, f.total_turmas, f.alunos_via_turmas,
      f.turmas_elegiveis_media, 'fixture'
    from public.fixture_carteira_kpi f
    where f.competencia = make_date(p_ano, p_mes, 1)
      and f.unidade_id = p_unidade_id;
  $$;

  create function public.matriculas_comerciais_v1(uuid, date, date)
  returns table(
    aluno_id integer, nome text, curso text, tipo_matricula text,
    valor_parcela numeric, valor_passaporte numeric, data_matricula date,
    conta boolean, motivo_fora text, passaporte_pago boolean
  ) language sql stable as $$
    select f.aluno_id, a.nome, 'Curso', 'Regular', 400::numeric, 400::numeric,
      f.data_matricula, f.conta, null::text, true
    from public.fixture_matriculas_live f
    join public.alunos a on a.id = f.aluno_id
    where f.unidade_id = $1 and f.data_matricula >= $2 and f.data_matricula < $3
    order by f.data_matricula, f.aluno_id;
  $$;

  create function public.is_movimentacao_admin_retencao_valida(integer)
  returns boolean language sql stable as $$ select true $$;

  create function public.montar_relatorio_coordenacao_payload_v3(
    p_unidade_id uuid, p_ano integer, p_mes integer,
    p_periodicidade text default 'mensal'
  ) returns jsonb language plpgsql stable as $$
  declare v_periodo record;
  begin
    select * into v_periodo
    from public.fn_health_score_v3_periodo(make_date(p_ano,p_mes,1),p_periodicidade);
    return jsonb_build_object(
      'schema_version', 3,
      'periodo', jsonb_build_object(
        'ano', p_ano, 'mes', p_mes, 'periodicidade', p_periodicidade,
        'inicio', v_periodo.periodo_inicio, 'fim', v_periodo.periodo_fim,
        'data_corte', v_periodo.periodo_fim,
        'publicacao_oficial', true, 'ranking_habilitado', true,
        'unidade_id', p_unidade_id, 'unidade_nome', 'Campo Grande'
      ),
      'resumo_equipe', jsonb_build_object('total_professores',2),
      'professores', case when p_unidade_id = '${secondUnitId}'::uuid then jsonb_build_array(
        jsonb_build_object(
          'professor_id',1,'nome','Valdo Delfino','score',91,'score_observado',91,
          'score_comparavel',91,'comparabilidade_estado','comparavel',
          'metricas',jsonb_build_object(
            'numero_alunos',jsonb_build_object('valor',999,'valor_bruto',999,'numerador',999,'detalhes','{}'::jsonb),
            'presenca',jsonb_build_object('valor',70,'valor_bruto',70,'numerador',7,'denominador',10,'amostra',10,'codigo_evidencia','fixture'),
            'conversao',jsonb_build_object('valor',50,'valor_bruto',50,'numerador',1,'denominador',2,'amostra',2)
          ),
          'operacional',jsonb_build_object('carteira_alunos',999,'matriculas_comerciais',999)
        )
      ) else jsonb_build_array(
        jsonb_build_object(
          'professor_id',1,'nome','Valdo Delfino','score',91,'score_observado',91,
          'score_comparavel',91,'comparabilidade_estado','comparavel',
          'metricas',jsonb_build_object(
            'numero_alunos',jsonb_build_object('valor',999,'valor_bruto',999,'numerador',999,'detalhes','{}'::jsonb),
            'presenca',jsonb_build_object('valor',70,'valor_bruto',70,'numerador',7,'denominador',10,'amostra',10,'codigo_evidencia','fixture'),
            'conversao',jsonb_build_object('valor',50,'valor_bruto',50,'numerador',1,'denominador',2,'amostra',2)
          ),
          'operacional',jsonb_build_object('carteira_alunos',999,'matriculas_comerciais',999)
        ),
        jsonb_build_object(
          'professor_id',2,'nome','Professor sem matricula','score',80,'score_observado',80,
          'score_comparavel',80,'comparabilidade_estado','comparavel',
          'metricas',jsonb_build_object(
            'numero_alunos',jsonb_build_object('valor',null,'valor_bruto',null,'numerador',null,'detalhes','{}'::jsonb),
            'presenca',jsonb_build_object('valor',null,'valor_bruto',null,'numerador',0,'denominador',0,'amostra',0,'codigo_evidencia','calendario_sem_aulas_elegiveis'),
            'conversao',jsonb_build_object('valor',null,'valor_bruto',null,'numerador',0,'denominador',0,'amostra',0)
          ),
          'operacional',jsonb_build_object('carteira_alunos',null,'matriculas_comerciais',999)
        )
      ) end,
      'presenca',jsonb_build_object('pendencias',1),
      'carteira_carga','{}'::jsonb,
      'saidas_retencao','{}'::jsonb,
      'experimentais',jsonb_build_object('matriculas_pos_experimental',1),
      'auditoria',jsonb_build_object('gerado_em',now())
    );
  end;
  $$;

  create function public.montar_relatorio_coordenacao_conteudo_v4(uuid,integer,integer,text)
  returns jsonb language sql stable as $$
    select public.montar_relatorio_coordenacao_payload_v3($1,$2,$3,$4)
  $$;

  insert into public.professor_carteira_mensal_canonica
    (competencia,unidade_id,professor_id,carteira_alunos,fonte,auditado_em)
  values
    ('2026-06-01','${unitId}',1,12,'fechamento','2026-07-01'),
    ('2026-07-01','${unitId}',1,14,'fechamento','2026-08-01'),
    ('2026-08-01','${unitId}',1,13,'fechamento','2026-09-01'),
    ('2026-06-01','${unitId}',2,10,'fechamento','2026-07-01'),
    ('2026-07-01','${unitId}',2,10,'fechamento','2026-08-01'),
    ('2026-08-01','${unitId}',2,11,'fechamento','2026-09-01'),
    ('2026-06-01','${secondUnitId}',1,2,'fechamento','2026-07-01'),
    ('2026-07-01','${secondUnitId}',1,2,'fechamento','2026-08-01'),
    ('2026-08-01','${secondUnitId}',1,2,'fechamento','2026-09-01'),
    ('2026-06-01','${secondUnitId}',2,3,'fechamento','2026-07-01'),
    ('2026-07-01','${secondUnitId}',2,3,'fechamento','2026-08-01'),
    ('2026-08-01','${secondUnitId}',2,3,'fechamento','2026-09-01');
  insert into public.fixture_carteira_composicao values
    ('2026-06-01','${unitId}',1,10,2,2,12,5,6),
    ('2026-07-01','${unitId}',1,14,0,0,14,6,6),
    ('2026-08-01','${unitId}',1,13,0,0,13,7,7),
    ('2026-06-01','${unitId}',2,10,0,0,10,5,5),
    ('2026-07-01','${unitId}',2,10,0,0,10,5,5),
    ('2026-08-01','${unitId}',2,11,0,0,11,5,5),
    ('2026-06-01','${secondUnitId}',1,2,0,0,2,1,1),
    ('2026-07-01','${secondUnitId}',1,2,0,0,2,1,1),
    ('2026-08-01','${secondUnitId}',1,2,0,0,2,1,1),
    ('2026-06-01','${secondUnitId}',2,3,0,0,3,1,1),
    ('2026-07-01','${secondUnitId}',2,3,0,0,3,1,1),
    ('2026-08-01','${secondUnitId}',2,3,0,0,3,1,1);
  insert into public.fixture_carteira_kpi values
    ('2026-06-01','${unitId}',1,12,2,5,10,5),
    ('2026-07-01','${unitId}',1,14,2,6,12,6),
    ('2026-08-01','${unitId}',1,13,2,7,14,7),
    ('2026-06-01','${unitId}',2,10,2,5,10,5),
    ('2026-07-01','${unitId}',2,10,2,5,10,5),
    ('2026-08-01','${unitId}',2,11,2,5,10,5),
    ('2026-06-01','${secondUnitId}',1,2,2,1,2,1),
    ('2026-07-01','${secondUnitId}',1,2,2,1,2,1),
    ('2026-08-01','${secondUnitId}',1,2,2,1,2,1),
    ('2026-06-01','${secondUnitId}',2,3,3,1,3,1),
    ('2026-07-01','${secondUnitId}',2,3,3,1,3,1),
    ('2026-08-01','${secondUnitId}',2,3,3,1,3,1);

  insert into public.alunos values
    (101,'Aluno 101',1,false,'2026-06-10 12:00Z'),
    (102,'Aluno 102',1,false,'2026-06-20 12:00Z'),
    (103,'Aluno tardio',1,false,'2026-07-01 12:00Z'),
    -- O cadastro vivo mudou para outro professor depois do fechamento; o
    -- documento comercial de julho preserva Valdo como autor da experimental.
    (104,'Aluno 104',2,false,'2026-07-10 12:00Z'),
    (105,'Aluno por nome',null,false,'2026-07-11 12:00Z'),
    (106,'Aluno sem professor',null,false,'2026-07-12 12:00Z'),
    (107,'Aluno 107',1,false,'2026-08-10 12:00Z'),
    (108,'Aluno 108',1,false,'2026-08-11 12:00Z'),
    (1770,'Aluno historico CG',2,false,'2026-06-12 12:00Z'),
    (201,'Aluno movimento 1',null,false,'2026-01-01 12:00Z'),
    (202,'Aluno movimento 2',null,false,'2026-01-01 12:00Z'),
    (203,'Aluno movimento 3',null,false,'2026-01-01 12:00Z');
  insert into public.fixture_matriculas_live values
    ('${unitId}',101,'2026-06-10',true),
    ('${unitId}',102,'2026-06-20',true),
    ('${unitId}',103,'2026-06-30',true),
    ('${unitId}',104,'2026-07-10',true),
    ('${unitId}',105,'2026-07-11',true),
    ('${unitId}',106,'2026-07-12',true),
    ('${unitId}',107,'2026-08-10',true),
    ('${unitId}',108,'2026-08-11',true);

  insert into public.fechamento_mensal_snapshots
    (ano,mes,escopo,unidade_id,dominio,versao,status,payload,capturado_em)
  values
    (2026,6,'unidade','${unitId}','relatorio_gerencial',1,'fechado',
      '{"dados_mes_atual":[{"novas_matriculas":999}]}'::jsonb,'2026-07-01 03:00Z'),
    (2026,6,'unidade','${unitId}','relatorio_comercial_mensal',1,'fechado',
      '{"matriculas":[
        {"id":101,"professores_experimentais":"Valdo Delfino"},
        {"id":102,"professores_experimentais":"Valdo Delfino"},
        {"id":1770,"professores_experimentais":"Nome atual incorreto"}
      ]}'::jsonb,'2026-07-01 03:00Z'),
    (2026,7,'unidade','${unitId}','relatorio_comercial_mensal',1,'fechado',
      '{"matriculas":[
        {"id":104,"professores_experimentais":"Valdo Delfino"},
        {"id":105,"professores_experimentais":"Valdo Delfino"},
        {"id":106}
      ]}'::jsonb,'2026-08-01 03:00Z'),
    (2026,8,'unidade','${unitId}','relatorio_comercial_mensal',1,'fechado',
      '{"matriculas":[
        {"id":107,"professores_experimentais":"Valdo Delfino"},
        {"id":108,"professores_experimentais":"Valdo Delfino"}
      ]}'::jsonb,'2026-09-01 03:00Z'),
    (2026,6,'unidade','${secondUnitId}','relatorio_gerencial',1,'fechado',
      '{"dados_mes_atual":[{"novas_matriculas":42}]}'::jsonb,'2026-07-01 03:00Z');

  update public.fechamento_mensal_snapshots
  set payload_hash = public.hash_jsonb_canonico(payload);

  insert into public.motivos_saida values (1,'Desistencia',true,true);
  insert into public.movimentacoes_admin values
    (1,'${unitId}','2026-06-10','evasao','Aluno movimento 1',201,1,'Desistencia',1,400,null,false),
    (2,'${unitId}','2026-06-11','evasao','Aluno movimento 2',202,1,'Desistencia',1,300,null,true),
    (3,'${unitId}','2026-06-12','nao_renovacao','Aluno movimento 3',203,1,'Desistencia',1,null,null,false);

  with s as (
    insert into public.health_score_professor_v3_snapshots
      (professor_id,escopo,unidade_id,competencia,revisao,estado,periodicidade,criado_em)
    values
      (1,'unidade','${unitId}','2026-09-01',1,'provisorio','mensal','2026-09-30'),
      (1,'unidade','${unitId}','2026-10-01',1,'provisorio','mensal','2026-10-31'),
      (1,'unidade','${unitId}','2026-11-01',1,'provisorio','mensal','2026-11-30'),
      (2,'unidade','${unitId}','2026-09-01',1,'provisorio','mensal','2026-09-30')
    returning id,professor_id,competencia
  )
  insert into public.health_score_professor_v3_snapshot_metricas
    (snapshot_id,metrica,valor_bruto,numerador,denominador,amostra,estado_base,
     confianca,fonte,regra_versao,motivo_sem_base,codigo_evidencia,detalhes)
  select id,'presenca',
    case competencia when '2026-09-01' then 80 when '2026-10-01' then 90 else 100 end,
    case competencia when '2026-09-01' then 8 when '2026-10-01' then 9 else 10 end,
    10,10,'ok','alta','fixture','fixture',null,'evidencia_valida',
    jsonb_build_object('competencia_referencia',case when competencia='2026-09-01' then '2026-08-01' else competencia::text end)
  from s where professor_id=1
  union all
  select id,'presenca',null,0,0,0,'sem_base','alta','fixture','fixture',
    'Calendario sem aulas elegiveis','calendario_sem_aulas_elegiveis','{}'::jsonb
  from s where professor_id=2;
`;

test('fontes V4 preservam historico, acumulam fatos e nao fabricam zero', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-coord-fontes-v4-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const carteiraTotalMigration = readFileSync(carteiraTotalMigrationPath, 'utf8');
    const matriculadorFechadoMigration = readFileSync(matriculadorFechadoMigrationPath, 'utf8');
    const carteiraRosterMigration = readFileSync(carteiraRosterMigrationPath, 'utf8');
    const matriculadorSemFallbackMigration = readFileSync(
      matriculadorSemFallbackMigrationPath,
      'utf8',
    );
    const matriculadorImutavelMigration = readFileSync(
      matriculadorImutavelMigrationPath,
      'utf8',
    );
    const applied = psql(
      container,
      `${fixture}\n${migration}\n${carteiraTotalMigration}\n${matriculadorFechadoMigration}\n${carteiraRosterMigration}\n${matriculadorSemFallbackMigration}\n${matriculadorImutavelMigration}`,
    );
    assert.equal(
      applied.status,
      0,
      `${applied.stderr || applied.stdout}\n${docker(['logs', container]).output}`,
    );

    const query = psql(container, String.raw`
      update public.professores set nome='Valdo renomeado depois do fechamento' where id=1;
      update public.alunos set professor_experimental_id=2 where id between 101 and 108;

      with periodos as (
        select * from public.relatorio_coordenacao_periodos_v4(2026,9,'ciclo','2026-09-30')
      ), carteira as (
        select * from public.relatorio_coordenacao_carteira_v4(
          '${unitId}',2026,8,'ciclo','2026-08-31'
        ) where professor_id=1
      ), presenca as (
        select * from public.relatorio_coordenacao_presenca_v4(
          '${unitId}',2026,9,'ciclo','2026-10-31'
        ) where professor_id=1
      ), matriculas as (
        select public.relatorio_coordenacao_matriculas_v4(
          '${unitId}',2026,8,'ciclo','2026-08-31'
        ) payload
      ), matriculas_sem_fechamento as (
        select public.relatorio_coordenacao_matriculas_v4(
          '${secondUnitId}',2026,6,'mensal','2026-06-30'
        ) payload
      ), saidas as (
        select public.relatorio_coordenacao_saidas_v4(
          '${unitId}','2026-06-01','2026-08-31'
        ) payload
      ), documento as (
        select public.montar_relatorio_coordenacao_conteudo_v4(
          '${unitId}',2026,8,'ciclo'
        ) payload
      ), consolidado as (
        select public.montar_relatorio_coordenacao_conteudo_v4(
          null,2026,8,'ciclo'
        ) payload
      ), congelamento as (
        select jsonb_build_object(
          'documentos',count(distinct s.id),
          'versao_minima',min(s.versao),
          'todos_com_chave',bool_and(not exists (
            select 1 from jsonb_array_elements(s.payload->'matriculas') item
            where not (item ? 'professor_experimental_id_fechado')
          )),
          'historico_1770',max((item->>'professor_experimental_id_fechado')::integer)
            filter (where item->>'id'='1770'),
          'ids',jsonb_agg(distinct item->'professor_experimental_id_fechado'
            order by item->'professor_experimental_id_fechado')
        ) payload
        from public.fechamento_mensal_snapshots s
        cross join lateral jsonb_array_elements(s.payload->'matriculas') item
        where s.unidade_id='${unitId}' and s.ano=2026 and s.mes between 6 and 8
          and s.dominio='relatorio_comercial_mensal' and s.versao=2
      )
      select jsonb_build_object(
        'periodos', (select jsonb_build_object('qtd',count(*),'max',max(competencia)) from periodos),
        'carteira', (select to_jsonb(c) from carteira c),
        'presenca', (select to_jsonb(p) from presenca p),
        'matriculas', (select payload from matriculas),
        'matriculas_sem_fechamento', (select payload from matriculas_sem_fechamento),
        'saidas', (select payload from saidas),
        'documento', (select jsonb_build_object(
          'score',payload#>'{professores,0,score_observado}',
          'conversao',payload#>'{professores,0,metricas,conversao}',
          'carteira',payload#>'{professores,0,metricas,numero_alunos,valor}',
          'carteira_total',payload#>'{carteira_carga,alunos_na_carteira}',
          'matriculas_valdo',payload#>'{professores,0,operacional,matriculas_comerciais}',
          'matriculas_sem',payload#>'{professores,1,operacional,matriculas_comerciais}',
          'schema_version',payload->'schema_version'
        ) from documento),
        'carteira_consolidada', (select payload#>'{carteira_carga,alunos_na_carteira}' from consolidado),
        'congelamento', (select payload from congelamento)
      )::text;
    `);
    assert.equal(query.status, 0, query.stderr || query.stdout);
    const result = JSON.parse(query.stdout.trim().split(/\r?\n/).at(-1));

    assert.deepEqual(result.periodos, { qtd: 1, max: '2026-09-01' });
    assert.equal(Number(result.carteira.carteira_media), 12.33);
    assert.equal(result.carteira.meses_observados, 3);
    assert.equal(Number(result.presenca.valor), 85);
    assert.equal(Number(result.presenca.numerador), 17);
    assert.equal(Number(result.presenca.denominador), 20);
    assert.equal(result.matriculas.origem_completa, true);
    assert.equal(result.matriculas.matriculas_total, 8);
    assert.equal(result.matriculas.matriculas_sem_professor, 1);
    assert.equal(result.matriculas.por_professor['1'], 6);
    assert.equal(result.matriculas.documentos.length, 3);
    assert.ok(result.matriculas.documentos.every((item) => item.tipo === 'relatorio_comercial_mensal'));
    assert.equal(result.matriculas_sem_fechamento.origem_completa, false);
    assert.equal(result.matriculas_sem_fechamento.matriculas_total, null);
    assert.equal(result.matriculas_sem_fechamento.matriculas_atribuidas_professor, null);
    assert.equal(result.matriculas_sem_fechamento.matriculas_sem_professor, null);
    assert.equal(result.matriculas_sem_fechamento.documentos[0].tipo, 'fechamento_comercial_ausente');
    assert.equal(result.saidas.saidas_validas_total, 2);
    assert.equal(Number(result.saidas.mrr_perdido_total), 400);
    assert.equal(result.saidas.valores_mrr_pendentes, 1);
    assert.equal(result.saidas.movimentos.length, 2);
    assert.equal(result.saidas.movimentos[1].valor_mrr, null);
    assert.equal(Number(result.documento.score), 91);
    assert.equal(Number(result.documento.conversao.valor), 50);
    assert.equal(Number(result.documento.carteira), 12.33);
    assert.equal(Number(result.documento.carteira_total), 22.67);
    assert.equal(result.documento.matriculas_valdo, 6);
    assert.equal(result.documento.matriculas_sem, 0);
    assert.equal(result.documento.schema_version, 4);
    assert.equal(Number(result.carteira_consolidada), 24.67);
    assert.equal(result.congelamento.documentos, 3);
    assert.equal(result.congelamento.versao_minima, 2);
    assert.equal(result.congelamento.todos_com_chave, true);
    assert.equal(result.congelamento.historico_1770, 36);
    assert.deepEqual(result.congelamento.ids, [null, 1, 36]);

    const privateHelper = psql(container, String.raw`
      set role authenticated;
      select public.relatorio_coordenacao_matriculas_v4(
        '${unitId}',2026,8,'ciclo','2026-08-31'
      );
    `);
    assert.notEqual(privateHelper.status, 0);
    assert.match(privateHelper.stderr, /permission denied/i);
  } finally {
    docker(['stop', container]);
  }
});

test('retificacao comercial falha fechado quando o snapshot de origem foi adulterado', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-coord-fontes-hash-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const prelude = [
      fixture,
      readFileSync(migrationPath, 'utf8'),
      readFileSync(carteiraTotalMigrationPath, 'utf8'),
      readFileSync(matriculadorFechadoMigrationPath, 'utf8'),
      readFileSync(carteiraRosterMigrationPath, 'utf8'),
      readFileSync(matriculadorSemFallbackMigrationPath, 'utf8'),
    ].join('\n');
    const prepared = psql(container, prelude);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);

    const corrupted = psql(container, String.raw`
      update public.fechamento_mensal_snapshots
      set payload = payload || '{"adulterado":true}'::jsonb
      where dominio='relatorio_comercial_mensal'
        and ano=2026 and mes=7 and unidade_id='${unitId}' and versao=1;
    `);
    assert.equal(corrupted.status, 0, corrupted.stderr || corrupted.stdout);

    const migration = readFileSync(matriculadorImutavelMigrationPath, 'utf8');
    const applied = psql(container, migration);
    assert.notEqual(applied.status, 0, applied.stderr || applied.stdout);
    assert.match(applied.stderr, /RELATORIO_COMERCIAL_SNAPSHOT_ORIGEM_HASH_INVALIDO/u);

    const versions = psql(container, String.raw`
      select count(*) from public.fechamento_mensal_snapshots
      where dominio='relatorio_comercial_mensal' and versao > 1;
    `);
    assert.equal(versions.status, 0, versions.stderr || versions.stdout);
    assert.equal(Number(versions.stdout.trim()), 0);
  } finally {
    docker(['stop', container]);
  }
});
