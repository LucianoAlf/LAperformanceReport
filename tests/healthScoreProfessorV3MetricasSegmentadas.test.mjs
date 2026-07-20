import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260719203000_health_score_v3_metricas_segmentadas.sql';
const baselineMetricsPath =
  'supabase/migrations/20260719123500_health_score_v3_metricas_periodo_otimizada.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

function functionBlock(sql, name) {
  const start = sql.toLowerCase().indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} deve existir`);
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function functionDefinition(sql, name) {
  const block = functionBlock(sql, name);
  const end = block.indexOf('\n$$;');
  assert.notEqual(end, -1, `fim de ${name} deve existir`);
  return block.slice(0, end + 4);
}

function viewBlock(sql, name) {
  const start = sql.toLowerCase().indexOf(`create or replace view public.${name}`);
  assert.notEqual(start, -1, `${name} deve existir`);
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function between(sql, startMarker, endMarker) {
  const start = sql.indexOf(startMarker);
  assert.notEqual(start, -1, `marcador ausente: ${startMarker}`);
  const end = sql.indexOf(endMarker, start);
  assert.notEqual(end, -1, `marcador ausente: ${endMarker}`);
  return sql.slice(start, end);
}

test('Task 5 cria RPC detalhada e agregadora no contrato segmentado auditavel', () => {
  const sql = migration();
  const detail = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );
  const aggregate = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  );

  for (const block of [detail, aggregate]) {
    assert.match(block, /p_competencia\s+date/i);
    assert.match(block, /p_config_id\s+uuid/i);
    assert.match(block, /p_unidade_id\s+uuid\s+default\s+null/i);
    assert.match(block, /p_periodicidade\s+text\s+default\s+'mensal'/i);
    assert.match(block, /security definer/i);
    assert.match(block, /set search_path\s*=\s*public,\s*pg_temp/i);
  }

  for (const field of [
    'curso_id',
    'modalidade',
    'pessoas_unicas',
    'pessoas_unicas_total',
    'vinculos_ativos',
    'turmas_elegiveis',
    'ocupacoes_unicas',
    'valor_observado',
    'capacidade_maxima',
    'meta_aplicada',
    'numerador',
    'denominador',
    'nota_segmento',
    'estado_base',
    'fonte',
    'atribuicao_id',
    'atribuicao_formal',
    'divergencias',
  ]) {
    assert.match(detail, new RegExp(`\\b${field}\\b`, 'i'), `detalhe sem ${field}`);
  }
});

test('detalhe deriva da base canonica unica e so pontua curso e modalidade oficiais', () => {
  const detail = functionBlock(
    migration(),
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );

  assert.match(detail, /get_carteira_professor_periodo_detalhe_canonico_v1/i);
  assert.match(detail, /professor_unidade_curso_modalidade/i);
  assert.match(detail, /health_score_professor_v3_config_metas_curso_modalidade/i);
  assert.match(detail, /curso_resolvido/i);
  assert.match(detail, /modalidade_resolvida/i);
  assert.match(detail, /confianca\s+in\s*\(\s*'alta'\s*,\s*'revisada'\s*\)/i);
  assert.match(detail, /is_projeto_banda/i);
  assert.match(detail, /not\s+coalesce\([^)]*is_projeto_banda[^)]*,\s*false\s*\)/i);
  assert.doesNotMatch(detail, /from\s+public\.alunos\b/i);
  assert.doesNotMatch(detail, /rateio|proporcional/i);
});

test('media turma preserva bruto e calcula nota pela soma de ocupacoes sobre meta de assentos', () => {
  const sql = migration();
  const detail = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );
  const aggregate = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  );

  assert.match(
    detail,
    /turmas_elegiveis[^;]+\*[^;]+meta_media_turma/is,
  );
  assert.match(aggregate, /sum\s*\(\s*u\.ocupacoes_unicas\s*\)/i);
  assert.match(aggregate, /sum\s*\(\s*u\.turmas_elegiveis\s*\)/i);
  assert.match(
    aggregate,
    /least\s*\(\s*100::numeric\s*,\s*100::numeric\s*\*\s*a\.numerador\s*\/\s*nullif\s*\(\s*a\.denominador/is,
  );
  assert.match(
    aggregate,
    /a\.ocupacoes_unicas::numeric\s*\/\s*nullif\s*\(\s*a\.turmas_elegiveis/i,
  );
  assert.match(aggregate, /'media_observada'/i);
  assert.match(aggregate, /'meta_assentos_pontuaveis'/i);
});

test('carteira pontua vinculos por curso sem duplicar a pessoa no total visual', () => {
  const sql = migration();
  const detail = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );
  const aggregate = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  );

  assert.match(detail, /count\s*\(\s*distinct\s+[^)]*pessoa_chave/i);
  assert.match(detail, /meta_carteira_curso/i);
  assert.match(
    aggregate,
    /'nome_exibicao'\s*,\s*case[\s\S]*?numero_alunos'[\s\S]*?'Carteira por curso'/i,
  );
  assert.match(aggregate, /'pessoas_unicas_total'/i);
  assert.match(aggregate, /'vinculos_curso_modalidade'/i);
  assert.match(aggregate, /sum\s*\(\s*u\.numerador\s*\)/i);
  assert.match(aggregate, /sum\s*\(\s*u\.denominador\s*\)/i);
  assert.match(
    aggregate,
    /100::numeric\s*\*\s*a\.numerador\s*\/\s*nullif\s*\(\s*a\.denominador/i,
  );
});

test('zero carteira fica visivel e fora da nota; primeiro vinculo torna o segmento pontuavel', () => {
  const detail = functionBlock(
    migration(),
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );

  assert.match(detail, /'sem_base_zero_carteira'/i);
  assert.match(
    detail,
    /when\s+[\s\S]*?vinculos_ativos\s*=\s*0[\s\S]*?then\s+'sem_base_zero_carteira'/i,
  );
  assert.match(
    detail,
    /vinculos_ativos\s*>\s*0[\s\S]*?meta_carteira_curso/i,
  );
  assert.match(detail, /else\s+null::numeric\s+end\s+as\s+numerador/i);
  assert.match(detail, /else\s+null::numeric\s+end\s+as\s+denominador/i);
  assert.doesNotMatch(detail, /coalesce\s*\(\s*nota_segmento\s*,\s*0/i);
});

test('regra ausente e divergencias bloqueiam sem meta global ou valor fabricado', () => {
  const sql = migration();
  const detail = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );
  const aggregate = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  );

  for (const state of [
    'regra_ausente',
    'segmentacao_incompleta',
    'divergencia_nao_ofertada',
    'sem_base_sem_turmas',
  ]) {
    assert.match(detail, new RegExp(`'${state}'`, 'i'));
  }
  assert.match(aggregate, /bool_or\s*\([^)]*estado_base\s*=\s*'regra_ausente'/i);
  assert.match(aggregate, /when\s+[^\n]*tem_bloqueio[^\n]*then\s+null::numeric/i);
  assert.doesNotMatch(sql, /meta_global|fallback_global|rateio|proporcional/i);
  assert.doesNotMatch(sql, /coalesce\s*\([^)]*nota[^)]*,\s*0(?:\.0+)?\s*\)/i);
});

test('capacidade excedida gera alerta sem limitar ocupacao, bruto ou nota', () => {
  const detail = functionBlock(
    migration(),
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );

  assert.match(detail, /capacidade_excedida/i);
  assert.match(detail, /alertas_capacidade/i);
  assert.match(detail, /ocupacoes_unicas\s*>\s*[^\n]*capacidade_maxima/i);
  assert.match(detail, /'turma_chave'/i);
  assert.doesNotMatch(detail, /least\s*\([^)]*ocupacoes_unicas[^)]*capacidade_maxima/i);
  assert.doesNotMatch(detail, /greatest\s*\([^)]*capacidade_maxima[^)]*ocupacoes_unicas/i);
});

test('motor usa nota segmentada, meta nula e persiste cada componente estruturado', () => {
  const sql = migration();
  const metricas = functionBlock(sql, 'get_health_score_professor_v3_metricas_periodo');
  const materializer = functionBlock(
    sql,
    'materializar_health_score_professor_v3_periodo_impl',
  );

  assert.match(metricas, /get_health_score_professor_v3_metricas_segmentadas_agregadas_v1/i);
  assert.doesNotMatch(metricas, /get_health_score_professor_v3_carteira_periodo/i);
  assert.match(materializer, /health_score_professor_v3_snapshot_metrica_segmentos/i);
  assert.match(materializer, /get_health_score_professor_v3_metricas_segmentadas_v1/i);
  assert.match(
    materializer,
    /when\s+cm\.metrica\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*\)\s+then\s+null::numeric/i,
  );
  assert.match(materializer, /sa\.nota_segmentada_estruturada/i);
  assert.doesNotMatch(materializer, /detalhes\s*->>\s*'nota_segmentada'/i);
  assert.match(materializer, /sum\s*\(\s*m\.peso\s*\)\s*filter\s*\(\s*where\s+m\.nota\s+is\s+not\s+null\s*\)/i);
  assert.doesNotMatch(materializer, /coalesce\s*\(\s*m\.nota\s*,\s*0/i);
});

test('leitura parcial reutiliza nota segmentada armazenada e preserva formula dos demais pilares', () => {
  const view = viewBlock(
    migration(),
    'vw_health_score_professor_v3_parcial_observado',
  );

  assert.match(
    view,
    /when\s+m\.metrica\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*\)\s+then\s+m\.nota/i,
  );
  assert.match(view, /m\.valor_bruto\s*\/\s*m\.meta_aplicada\s*\*\s*100/i);
  assert.match(view, /[bm]\.nota_parcial_observada\s+is\s+not\s+null/i);
});

test('RPCs internas ficam privadas e somente service_role recebe execute', () => {
  const sql = migration();

  for (const name of [
    'get_health_score_professor_v3_metricas_segmentadas_v1',
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on function\\s+public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`,
        'i',
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function\\s+public\\.${name}\\([\\s\\S]*?to service_role`,
        'i',
      ),
    );
  }
});

test('conversao, retencao, permanencia e presenca permanecem byte a byte', () => {
  const baseline = readFileSync(baselineMetricsPath, 'utf8');
  const current = migration();

  assert.equal(
    between(
      current,
      '-- CONVERSAO EXPERIMENTAL -> MATRICULA',
      '-- MEDIA/TURMA E NUMERO DE ALUNOS',
    ),
    between(
      baseline,
      '-- CONVERSAO EXPERIMENTAL -> MATRICULA',
      '-- MEDIA/TURMA E NUMERO DE ALUNOS',
    ),
  );
  assert.equal(
    between(current, '-- RETENCAO ATRIBUIVEL.', '\nend;\n$$;'),
    between(baseline, '-- RETENCAO ATRIBUIVEL.', '\nend;\n$$;'),
  );
});

test('materializador usa nota agregada estruturada e nao interpreta detalhes JSON', () => {
  const materializer = functionBlock(
    migration(),
    'materializar_health_score_professor_v3_periodo_impl',
  );

  assert.match(
    materializer,
    /health_score_v3_metricas_segmentadas_agregadas_execucao/i,
  );
  assert.match(materializer, /nota_segmentada_estruturada/i);
  assert.doesNotMatch(materializer, /detalhes\s*->>\s*'nota_segmentada'/i);
  assert.doesNotMatch(
    materializer,
    /'nota_segmentada'\s*,\s*case\s+when\s+cm\.metrica/i,
  );
  assert.match(
    materializer,
    /else\s+coalesce\s*\(\s*r\.detalhes[\s\S]*?'meta_versionada'\s*,\s*cm\.meta[\s\S]*?'normalizacao'\s*,\s*'meta_versionada'[\s\S]*?'valor_real_preservado'\s*,\s*true/i,
  );
});

test('snapshot segmentado persiste atribuicao, alertas e diagnostico nao resolvido em colunas', () => {
  const sql = migration();
  const materializer = functionBlock(
    sql,
    'materializar_health_score_professor_v3_periodo_impl',
  );

  for (const column of [
    'atribuicao_id',
    'atribuicao_formal',
    'atribuicao_pontuavel',
    'pessoas_unicas_total',
    'capacidade_excedida',
    'alertas_capacidade',
    'divergencias',
  ]) {
    assert.match(
      sql,
      new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\b`, 'i'),
      `trilha filha sem coluna ${column}`,
    );
  }

  assert.match(
    sql,
    /create\s+table\s+if\s+not\s+exists\s+public\.health_score_professor_v3_snapshot_metrica_diagnosticos/i,
  );
  assert.match(
    materializer,
    /insert\s+into\s+public\.health_score_professor_v3_snapshot_metrica_diagnosticos/i,
  );
  assert.match(
    materializer,
    /and\s+not\s+d\.linha_diagnostico[\s\S]*?and\s+d\.curso_id\s+is\s+not\s+null/i,
  );
});

test('materializador le detalhe canonico uma vez e deriva unidade e consolidado do cache', () => {
  const materializer = functionBlock(
    migration(),
    'materializar_health_score_professor_v3_periodo_impl',
  );
  const detailCalls = materializer.match(
    /from\s+public\.get_health_score_professor_v3_metricas_segmentadas_v1\s*\(/gi,
  ) || [];
  const detailInsert = materializer.search(
    /insert\s+into\s+health_score_v3_segmentos_periodo_execucao[\s\S]*?from\s+public\.get_health_score_professor_v3_metricas_segmentadas_v1/i,
  );
  const scopeLoop = materializer.search(/for\s+v_scope\s+in/i);

  assert.equal(detailCalls.length, 1, 'detalhe deve ser materializado uma unica vez');
  assert.ok(detailInsert >= 0 && detailInsert < scopeLoop);
  assert.match(
    materializer,
    /v_scope\.unidade_id\s+is\s+null\s+or\s+d\.unidade_id\s*=\s*v_scope\.unidade_id/i,
  );
});

test(
  'fixture PostgreSQL cobre segmentos, bloqueios e reproducao pai-filhos',
  { timeout: 120_000 },
  () => {
    const dockerVersion = spawnSync(
      'docker',
      ['version', '--format', '{{.Server.Version}}'],
      { encoding: 'utf8' },
    );
    assert.equal(
      dockerVersion.status,
      0,
      `Docker/PostgreSQL obrigatorio indisponivel:\n${dockerVersion.stderr}`,
    );

    const image = process.env.TASK5_POSTGRES_IMAGE || 'postgres:17-alpine';
    const imageInspection = spawnSync('docker', ['image', 'inspect', image], {
      encoding: 'utf8',
    });
    assert.equal(
      imageInspection.status,
      0,
      `imagem PostgreSQL obrigatoria ausente (${image}):\n${imageInspection.stderr}`,
    );

    const sql = migration();
    const structuredSchema = between(
      sql,
      '-- Evidencia estruturada aditiva dos segmentos.',
      '-- Fim da evidencia estruturada aditiva.',
    );
    const detailDefinition = functionDefinition(
      sql,
      'get_health_score_professor_v3_metricas_segmentadas_v1',
    );
    const aggregateDefinition = functionDefinition(
      sql,
      'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
    );
    const materializerDefinition = functionDefinition(
      sql,
      'materializar_health_score_professor_v3_periodo_impl',
    );
    const containerName = `la-task5-postgres-${process.pid}-${Date.now()}`;
    const started = spawnSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_PASSWORD=task5',
        image,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(started.status, 0, `nao iniciou PostgreSQL:\n${started.stderr}`);

    try {
      let ready = false;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const readiness = spawnSync(
          'docker',
          ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
          { encoding: 'utf8' },
        );
        if (readiness.status === 0) {
          ready = true;
          break;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      }
      assert.equal(ready, true, 'PostgreSQL da fixture nao ficou pronto');

      const fixtureSql = String.raw`
        \set ON_ERROR_STOP on

        create extension if not exists pgcrypto;
        create role anon;
        create role authenticated;
        create role service_role;
        create schema auth;
        create function auth.role() returns text
        language sql stable as $$ select 'service_role'::text $$;

        create table public.professores (
          id integer primary key,
          nome text not null
        );
        create table public.unidades (
          id uuid primary key,
          ativo boolean not null default true
        );
        create table public.cursos (
          id integer primary key,
          nome text not null,
          is_projeto_banda boolean not null default false
        );
        create table public.professor_unidade_curso_modalidade (
          id uuid primary key,
          professor_id integer not null,
          unidade_id uuid not null,
          curso_id integer not null,
          modalidade text not null,
          status text not null,
          fonte text not null,
          confianca text not null,
          vigencia_inicio date not null,
          vigencia_fim date,
          evidencias jsonb not null default '{}'::jsonb
        );
        create table public.health_score_professor_v3_config_versoes (
          id uuid primary key default gen_random_uuid(),
          versao integer not null,
          status text not null,
          vigencia_inicio date not null,
          vigencia_fim date,
          cobertura_minima numeric not null default 0,
          faixa_atencao_min numeric not null default 50,
          faixa_saudavel_min numeric not null default 70,
          exige_pilar_fidelizacao boolean not null default false
        );
        create table public.health_score_professor_v3_config_metricas (
          id uuid primary key default gen_random_uuid(),
          config_id uuid not null,
          metrica text not null,
          peso numeric not null,
          meta numeric
        );
        create table public.health_score_professor_v3_config_metas_curso_modalidade (
          id uuid primary key default gen_random_uuid(),
          config_id uuid not null,
          unidade_id uuid not null,
          curso_id integer not null,
          modalidade text not null,
          estado text not null,
          capacidade_maxima numeric,
          meta_media_turma numeric,
          meta_carteira_curso numeric
        );
        create table public.health_score_professor_v3_snapshots (
          id uuid primary key default gen_random_uuid(),
          professor_id integer not null,
          escopo text not null,
          unidade_id uuid,
          competencia date not null,
          trimestre_inicio date,
          revisao integer not null,
          estado text not null,
          config_id uuid not null,
          config_versao integer not null,
          periodicidade text not null,
          periodo_inicio date not null,
          periodo_fim date not null,
          ciclo_codigo text,
          estado_publicacao text,
          score_exibivel boolean,
          ranking_habilitado boolean,
          regra_versao text,
          score numeric,
          cobertura numeric,
          classificacao text,
          publicavel boolean,
          publicado boolean,
          motivo_bloqueio text
        );
        create table public.health_score_professor_v3_snapshot_metricas (
          id uuid primary key default gen_random_uuid(),
          snapshot_id uuid not null,
          metrica text not null,
          valor_bruto numeric,
          numerador numeric,
          denominador numeric,
          amostra integer,
          estado_base text not null,
          publicavel boolean not null,
          confianca text not null,
          fonte text not null,
          regra_versao text not null,
          motivo_sem_base text,
          detalhes jsonb not null default '{}'::jsonb,
          nota numeric,
          peso numeric not null,
          peso_disponivel boolean not null,
          contribuicao numeric,
          meta_aplicada numeric
        );
        create table public.health_score_professor_v3_snapshot_metrica_segmentos (
          id uuid primary key default gen_random_uuid(),
          snapshot_metrica_id uuid not null,
          config_meta_segmento_id uuid,
          unidade_id uuid not null,
          curso_id integer not null,
          modalidade text not null,
          pessoas_unicas integer not null default 0,
          vinculos_ativos integer not null default 0,
          turmas_elegiveis integer not null default 0,
          ocupacoes_unicas integer not null default 0,
          capacidade_maxima numeric,
          meta_aplicada numeric,
          numerador numeric,
          denominador numeric,
          nota numeric,
          estado_base text not null,
          fonte text not null,
          regra_versao text not null,
          detalhes jsonb not null default '{}'::jsonb
        );

        create function public.fn_health_score_professor_v3_bloquear_snapshot_segmento_fechado()
        returns trigger language plpgsql as $$
        begin
          if tg_op = 'DELETE' then return old; end if;
          return new;
        end;
        $$;

        ${structuredSchema}

        create table public.fixture_carteira_canonica (
          professor_id integer not null,
          unidade_id uuid not null,
          pessoa_chave text,
          curso_id integer,
          modalidade text,
          turma_chave text,
          elegivel_media boolean not null,
          fonte text not null,
          curso_resolvido boolean not null,
          modalidade_resolvida boolean not null,
          estado_resolucao text not null,
          ocupacao_chave text,
          carteira_total_auditado integer,
          carteira_total_detalhado integer not null,
          segmentacao_incompleta boolean not null
        );
        create sequence public.fixture_canonical_calls;

        create function public.fn_health_score_v3_periodo(date, text)
        returns table (
          periodo_inicio date,
          periodo_fim date,
          ciclo_codigo text,
          periodo_label text
        ) language sql stable as $$
          select
            date_trunc('month', $1)::date,
            (date_trunc('month', $1) + interval '1 month - 1 day')::date,
            to_char($1, 'YYYY-MM'),
            to_char($1, 'YYYY-MM')
        $$;
        create function public.fn_health_score_v3_unidades_permitidas_sombra(uuid)
        returns table (unidade_id uuid)
        language sql stable as $$
          select u.id from public.unidades u where u.ativo and ($1 is null or u.id = $1)
        $$;
        create function public.get_carteira_professor_periodo_detalhe_canonico_v1(
          integer, integer, uuid default null, date default null, date default null
        )
        returns table (
          professor_id integer,
          unidade_id uuid,
          pessoa_chave text,
          curso_id integer,
          modalidade text,
          turma_chave text,
          elegivel_media boolean,
          fonte text,
          curso_resolvido boolean,
          modalidade_resolvida boolean,
          estado_resolucao text,
          ocupacao_chave text,
          carteira_total_auditado integer,
          carteira_total_detalhado integer,
          segmentacao_incompleta boolean
        ) language plpgsql volatile as $$
        begin
          perform nextval('public.fixture_canonical_calls');
          return query
          select f.*
          from public.fixture_carteira_canonica f
          where $3 is null or f.unidade_id = $3;
        end;
        $$;

        ${detailDefinition}
        ${aggregateDefinition}

        create function public.get_health_score_professor_v3_metricas_periodo(
          p_competencia date,
          p_unidade_id uuid default null,
          p_periodicidade text default 'mensal'
        ) returns table (
          metrica text,
          professor_id integer,
          professor_nome text,
          unidade_id uuid,
          competencia date,
          valor_bruto numeric,
          numerador numeric,
          denominador numeric,
          amostra integer,
          estado_base text,
          publicavel boolean,
          confianca text,
          fonte text,
          regra_versao text,
          motivo_sem_base text,
          detalhes jsonb
        ) language sql stable as $$
          select
            null::text, null::integer, null::text, null::uuid, null::date,
            null::numeric, null::numeric, null::numeric, null::integer,
            null::text, null::boolean, null::text, null::text, null::text,
            null::text, null::jsonb
          where false
        $$;

        ${materializerDefinition}

        insert into public.unidades (id) values
          ('11111111-1111-1111-1111-111111111111'),
          ('22222222-2222-2222-2222-222222222222');
        insert into public.cursos (id, nome) values
          (10, 'Guitarra'),
          (20, 'Piano'),
          (30, 'Bateria'),
          (40, 'Violao'),
          (50, 'Canto');
        insert into public.professores (id, nome) values
          (101, 'Dois cursos'),
          (202, 'Zero carteira'),
          (303, 'Regra ausente'),
          (404, 'Nao ofertada'),
          (505, 'Nao resolvido');

        insert into public.health_score_professor_v3_config_versoes (
          id, versao, status, vigencia_inicio
        ) values (
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'ativa', date '2026-01-01'
        );
        insert into public.health_score_professor_v3_config_metricas (
          config_id, metrica, peso, meta
        ) values
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'retencao', 17, 100),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'permanencia', 17, 100),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'conversao', 17, 100),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'media_turma', 17, null),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'numero_alunos', 16, null),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'presenca', 16, 100);
        insert into public.health_score_professor_v3_config_metas_curso_modalidade (
          config_id, unidade_id, curso_id, modalidade, estado,
          capacidade_maxima, meta_media_turma, meta_carteira_curso
        ) values
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 10, 'turma', 'configurada', 2, 1, 2),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 20, 'individual', 'configurada', 1, 1, 2),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 30, 'turma', 'configurada', 3, 2, 2),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 50, 'turma', 'nao_ofertada', null, null, null),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 10, 'turma', 'configurada', 1, 1, 2);

        insert into public.professor_unidade_curso_modalidade (
          id, professor_id, unidade_id, curso_id, modalidade, status,
          fonte, confianca, vigencia_inicio
        ) values
          ('00000000-0000-0000-0000-000000000001', 101, '11111111-1111-1111-1111-111111111111', 10, 'turma', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000002', 101, '11111111-1111-1111-1111-111111111111', 20, 'individual', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000003', 101, '22222222-2222-2222-2222-222222222222', 10, 'turma', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000004', 202, '11111111-1111-1111-1111-111111111111', 30, 'turma', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000005', 303, '11111111-1111-1111-1111-111111111111', 40, 'turma', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000006', 404, '11111111-1111-1111-1111-111111111111', 50, 'turma', 'ativo', 'fixture', 'alta', date '2026-01-01');

        insert into public.fixture_carteira_canonica values
          (101, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-a', 10, 'turma', 'u1:t10', true, 'evento', true, true, 'resolvido', 'u1:t10', 1, 1, false),
          (101, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-a', 20, 'individual', 'u1:i20', true, 'evento', true, true, 'resolvido', 'u1:i20', 1, 1, false),
          (101, '22222222-2222-2222-2222-222222222222', 'u2:pessoa-b', 10, 'turma', 'u2:t10', true, 'evento', true, true, 'resolvido', 'u2:t10', 2, 2, false),
          (101, '22222222-2222-2222-2222-222222222222', 'u2:pessoa-c', 10, 'turma', 'u2:t10', true, 'evento', true, true, 'resolvido', 'u2:t10', 2, 2, false),
          (303, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-d', 40, 'turma', 'u1:t40', true, 'evento', true, true, 'resolvido', 'u1:t40', 1, 1, false),
          (404, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-e', 50, 'turma', 'u1:t50', true, 'evento', true, true, 'resolvido', 'u1:t50', 1, 1, false),
          (505, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-f', null, null, null, false, 'evento', false, false, 'curso_nao_resolvido', null, 1, 1, true);

        do $fixture$
        declare
          v_valor numeric;
          v_numerador numeric;
          v_denominador numeric;
          v_nota numeric;
          v_estado text;
          v_count integer;
          v_calls bigint;
          v_called boolean;
        begin
          select max(d.pessoas_unicas_total), sum(d.vinculos_ativos)
            into v_valor, v_numerador
          from public.get_health_score_professor_v3_metricas_segmentadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111',
            'mensal'
          ) d
          where d.professor_id = 101 and d.metrica = 'numero_alunos';
          if v_valor <> 1 or v_numerador <> 2 then
            raise exception 'dois cursos nao preservaram 1 pessoa e 2 vinculos: %, %', v_valor, v_numerador;
          end if;

          select a.valor_bruto, a.numerador, a.denominador, a.nota
            into v_valor, v_numerador, v_denominador, v_nota
          from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            null,
            'mensal'
          ) a
          where a.professor_id = 101 and a.metrica = 'numero_alunos';
          if row(v_valor, v_numerador, v_denominador, v_nota)
             is distinct from row(3::numeric, 4::numeric, 6::numeric, 66.67::numeric) then
            raise exception 'carteira multiunidade divergente: %, %, %, %', v_valor, v_numerador, v_denominador, v_nota;
          end if;

          select a.valor_bruto, a.numerador, a.denominador, a.nota
            into v_valor, v_numerador, v_denominador, v_nota
          from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            null,
            'mensal'
          ) a
          where a.professor_id = 101 and a.metrica = 'media_turma';
          if row(v_valor, v_numerador, v_denominador, v_nota)
             is distinct from row(1.3333::numeric, 4::numeric, 3::numeric, 100::numeric) then
            raise exception 'media multiunidade divergente: %, %, %, %', v_valor, v_numerador, v_denominador, v_nota;
          end if;

          perform setval('public.fixture_canonical_calls', 1, false);
          perform public.materializar_health_score_professor_v3_periodo_impl(
            date '2026-07-01', 'mensal', null, null
          );
          select last_value, is_called into v_calls, v_called
          from public.fixture_canonical_calls;
          if not v_called or v_calls <> 1 then
            raise exception 'detalhe canonico lido % vezes no materializador', v_calls;
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshots;
          if v_count <> 11 then
            raise exception 'esperados 11 snapshots, obtidos %', v_count;
          end if;

          select sm.valor_bruto, sm.numerador, sm.denominador, sm.nota
            into v_valor, v_numerador, v_denominador, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm
            on sm.snapshot_id = s.id
          where s.professor_id = 101
            and s.unidade_id is null
            and sm.metrica = 'numero_alunos';
          if row(v_valor, v_numerador, v_denominador, v_nota)
             is distinct from row(3::numeric, 4::numeric, 6::numeric, 66.67::numeric) then
            raise exception 'pai carteira nao preservado: %, %, %, %', v_valor, v_numerador, v_denominador, v_nota;
          end if;

          select sum(x.pessoas), sum(x.numerador), sum(x.denominador)
            into v_valor, v_numerador, v_denominador
          from (
            select
              c.unidade_id,
              max(c.pessoas_unicas_total)::numeric as pessoas,
              sum(c.numerador)::numeric as numerador,
              sum(c.denominador)::numeric as denominador
            from public.health_score_professor_v3_snapshots s
            join public.health_score_professor_v3_snapshot_metricas sm
              on sm.snapshot_id = s.id and sm.metrica = 'numero_alunos'
            join public.health_score_professor_v3_snapshot_metrica_segmentos c
              on c.snapshot_metrica_id = sm.id
            where s.professor_id = 101 and s.unidade_id is null
            group by c.unidade_id
          ) x;
          if row(v_valor, v_numerador, v_denominador)
             is distinct from row(3::numeric, 4::numeric, 6::numeric) then
            raise exception 'filhos carteira nao reproduzem pai: %, %, %', v_valor, v_numerador, v_denominador;
          end if;

          select sm.numerador, sm.denominador, sm.nota
            into v_numerador, v_denominador, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm
            on sm.snapshot_id = s.id
          where s.professor_id = 101
            and s.unidade_id is null
            and sm.metrica = 'media_turma';
          if row(v_numerador, v_denominador, v_nota)
             is distinct from row(4::numeric, 3::numeric, 100::numeric) then
            raise exception 'pai media nao preservado: %, %, %', v_numerador, v_denominador, v_nota;
          end if;
          select sum(c.numerador), sum(c.denominador)
            into v_numerador, v_denominador
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm
            on sm.snapshot_id = s.id and sm.metrica = 'media_turma'
          join public.health_score_professor_v3_snapshot_metrica_segmentos c
            on c.snapshot_metrica_id = sm.id
          where s.professor_id = 101 and s.unidade_id is null;
          if row(v_numerador, v_denominador)
             is distinct from row(4::numeric, 3::numeric) then
            raise exception 'filhos media nao reproduzem pai: %, %', v_numerador, v_denominador;
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          join public.health_score_professor_v3_snapshot_metrica_segmentos c on c.snapshot_metrica_id = sm.id
          where s.professor_id = 101
            and s.unidade_id is null
            and c.atribuicao_id is not null
            and c.atribuicao_formal
            and c.atribuicao_pontuavel;
          if v_count <> 6 then
            raise exception 'atribuicoes estruturadas esperadas 6, obtidas %', v_count;
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshot_metrica_segmentos
          where capacidade_excedida;
          if v_count = 0 then
            raise exception 'alerta de capacidade nao foi persistido';
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshot_metricas
          where metrica in ('retencao', 'permanencia', 'conversao', 'presenca')
            and detalhes ? 'nota_segmentada';
          if v_count <> 0 then
            raise exception 'detalhes legados receberam nota_segmentada';
          end if;

          select sm.estado_base, sm.nota into v_estado, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          where s.professor_id = 202 and s.unidade_id is null and sm.metrica = 'numero_alunos';
          if v_estado <> 'sem_base_zero_carteira' or v_nota is not null then
            raise exception 'zero carteira penalizado: %, %', v_estado, v_nota;
          end if;

          select sm.estado_base, sm.nota into v_estado, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          where s.professor_id = 303 and s.unidade_id is null and sm.metrica = 'numero_alunos';
          if v_estado <> 'regra_ausente' or v_nota is not null then
            raise exception 'regra ausente nao bloqueou: %, %', v_estado, v_nota;
          end if;

          select sm.estado_base, sm.nota into v_estado, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          where s.professor_id = 404 and s.unidade_id is null and sm.metrica = 'numero_alunos';
          if v_estado <> 'divergencia_nao_ofertada' or v_nota is not null then
            raise exception 'nao ofertada com dados nao bloqueou: %, %', v_estado, v_nota;
          end if;

          select sm.estado_base, sm.nota into v_estado, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          where s.professor_id = 505 and s.unidade_id is null and sm.metrica = 'numero_alunos';
          if v_estado <> 'segmentacao_incompleta' or v_nota is not null then
            raise exception 'escopo nao resolvido perdeu bloqueio: %, %', v_estado, v_nota;
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          join public.health_score_professor_v3_snapshot_metrica_diagnosticos d
            on d.snapshot_metrica_id = sm.id
          where s.professor_id = 505
            and s.unidade_id is null
            and d.dados_sem_resolucao = 1
            and d.pessoas_unicas_total = 1
            and d.divergencias <> '{}'::jsonb;
          if v_count <> 2 then
            raise exception 'diagnosticos estruturados esperados 2, obtidos %', v_count;
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          join public.health_score_professor_v3_snapshot_metrica_segmentos c on c.snapshot_metrica_id = sm.id
          where s.professor_id = 505 and s.unidade_id is null;
          if v_count <> 0 then
            raise exception 'escopo nao resolvido gerou segmento regular indevido';
          end if;
        end;
        $fixture$;
      `;

      const executed = spawnSync(
        'docker',
        [
          'exec',
          '--interactive',
          containerName,
          'psql',
          '--no-psqlrc',
          '--set',
          'ON_ERROR_STOP=1',
          '--username',
          'postgres',
          '--dbname',
          'postgres',
        ],
        {
          encoding: 'utf8',
          input: fixtureSql,
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      assert.equal(
        executed.status,
        0,
        `fixture PostgreSQL falhou:\nSTDOUT:\n${executed.stdout}\nSTDERR:\n${executed.stderr}`,
      );
    } finally {
      spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' });
    }
  },
);
