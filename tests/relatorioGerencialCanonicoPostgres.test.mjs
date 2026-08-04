import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260801222500_corrigir_relatorio_gerencial_metas_matriculador.sql',
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
    const pronto = psql(container, 'select 1;');
    if (pronto.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

test('produtor gerencial compila e preserva os numeros dos documentos fechados', { timeout: 90_000 }, async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration canonica ainda nao existe');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  const versao = docker(['version', '--format', '{{.Server.Version}}']);
  if (versao.status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-report-gerencial-${process.pid}-${Date.now()}`;
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

      create function auth.role() returns text
      language sql stable as $$ select 'service_role'::text $$;

      create table public.unidades (
        id uuid primary key,
        nome text not null,
        codigo text not null,
        gerente_nome text,
        hunter_nome text,
        ativo boolean not null
      );

      create table public.professores (
        id bigint primary key,
        nome text not null
      );

      create table public.programa_matriculador_config (
        id serial primary key,
        ano integer not null unique,
        meta_taxa_showup_experimental numeric not null,
        meta_taxa_experimental_matricula numeric not null,
        meta_taxa_lead_matricula numeric not null,
        meta_volume_campo_grande integer not null,
        meta_volume_recreio integer not null,
        meta_volume_barra integer not null,
        meta_ticket_campo_grande numeric not null,
        meta_ticket_recreio numeric not null,
        meta_ticket_barra numeric not null,
        mes_inicio integer not null,
        mes_fim integer not null
      );

      create table public.programa_fideliza_config (
        ano integer primary key,
        meta_churn_maximo numeric,
        meta_inadimplencia_maxima numeric,
        meta_renovacao_minima numeric,
        meta_reajuste_minimo numeric,
        metas_lojinha jsonb
      );

      create function public.pode_gerar_relatorio_admin_v1(p_unidade_id uuid)
      returns boolean language sql stable as $$ select true $$;

      create function public.get_relatorio_admin_mensal_rico_v1(
        p_unidade_id uuid, p_ano integer, p_mes integer
      ) returns jsonb language sql stable as $$
        select jsonb_build_object(
          'snapshot_id', '11111111-1111-1111-1111-111111111111',
          'payload_hash', 'hash-admin',
          'versao', 1,
          'status', 'fechado',
          'payload', jsonb_build_object(
            'unidade', jsonb_build_object(
              'id', p_unidade_id,
              'nome', 'Recreio',
              'codigo', 'REC',
              'gerente', 'Fabiola/Clayton',
              'farmers', jsonb_build_array('Fernanda', 'Daiana')
            ),
            'competencia', jsonb_build_object('ano', p_ano, 'mes', p_mes),
            'resumo', jsonb_build_object(
              'alunos_ativos', 344,
              'alunos_pagantes', 336,
              'alunos_nao_pagantes', 8,
              'bolsistas_integrais', 6,
              'bolsistas_parciais', 2,
              'alunos_trancados', 2,
              'matriculas_trancadas', 2,
              'novos_alunos', 17,
              'matriculas_ativas', 430,
              'matriculas_base', 344,
              'matriculas_banda', 59,
              'matriculas_adicionais', 27,
              'alunos_com_exatamente_2_cursos', 25,
              'alunos_com_exatamente_3_cursos', 1,
              'alunos_com_4_ou_mais_cursos', 0,
              'avisos_previos', 10,
              'evasoes', 7,
              'nao_renovacoes', 2,
              'renovacoes_realizadas', 23
            ),
            'indicadores_financeiros', jsonb_build_object(
              'mrr_atual', 150982.39,
              'faturamento_previsto', 150982.39,
              'faturamento_realizado', 149335.15,
              'ticket_medio', 449.35,
              'ltv_medio', 6691.59,
              'tempo_permanencia', 14.9
            ),
            'indicadores_retencao', jsonb_build_object(
              'churn_rate', 1.79,
              'inadimplencia', 1.19,
              'inadimplentes', 4,
              'total_evasoes', 7,
              'nao_renovacoes', 2,
              'mrr_perdido', 2412.85,
              'taxa_renovacao', 85.19,
              'renovacoes_previstas', 27,
              'renovacoes_realizadas', 23,
              'reajuste_medio', 8.13
            ),
            'metas_fideliza', jsonb_build_object(
              'leads', 160,
              'experimentais', 38.5,
              'matriculas', 21,
              'ticket_parcela', 435,
              'taxa_lead_exp', 22,
              'taxa_conversao', 13,
              'taxa_renovacao', 90,
              'inadimplencia', 1.5,
              'reajuste_medio', 10,
              'alunos_pagantes', 357
            ),
            'trancamentos_detalhados', jsonb_build_object(
              'total_alunos', 2,
              'total_matriculas', 2,
              'itens', jsonb_build_array(
                jsonb_build_object(
                  'aluno_nome', 'Layara Sales Magalhaes',
                  'faixa_politica', 'extensao_gerencial',
                  'dias_trancado', 55
                ),
                jsonb_build_object(
                  'aluno_nome', 'Sergio Roberto Rodriguez',
                  'faixa_politica', 'contratual',
                  'dias_trancado', 30
                )
              )
            ),
            'avisos_previos', jsonb_build_array(
              jsonb_build_object('aluno_nome', 'Aluno com aviso', 'motivo', 'Mudanca')
            ),
            'evasoes', jsonb_build_array(
              jsonb_build_object('aluno_nome', 'Aluno evadido', 'motivo', 'Financeiro')
            ),
            'nao_renovacoes', jsonb_build_array(
              jsonb_build_object('aluno_nome', 'Aluno nao renovado', 'motivo', 'Financeiro')
            )
          )
        )
      $$;

      create function public.get_relatorio_mensal_canonico_v1(
        p_tipo text, p_unidade_id uuid, p_ano integer, p_mes integer
      ) returns jsonb language sql stable as $$
        select jsonb_build_object(
          'snapshot_id', '22222222-2222-2222-2222-222222222222',
          'payload_hash', 'hash-comercial',
          'snapshot_payload_hash', 'hash-comercial-original',
          'retificado', true,
          'versao', 1,
          'status', 'fechado',
          'payload', jsonb_build_object(
            'unidade', jsonb_build_object(
              'id', p_unidade_id,
              'nome', 'Recreio',
              'codigo', 'REC',
              'hunter', 'Daiana'
            ),
            'competencia', jsonb_build_object('ano', p_ano, 'mes', p_mes),
            'resumo', jsonb_build_object(
              'leads', 297,
              'experimentais', 41,
              'faltas', 8,
              'visitas', 0,
              'matriculas', 17,
              'taxa_lead_exp', 13.8,
              'taxa_exp_mat', 34.1,
              'conversoes_exp_mat', 14,
              'taxa_lead_mat', 5.7,
              'total_passaportes', 6170,
              'total_parcelas', 7256,
              'ticket_medio_passaporte', 362.94,
              'ticket_medio_parcela', 426.82,
              'pendencias_conciliacao', 0
            ),
            'alertas', jsonb_build_array('1 lead sem curso ou canal'),
            'leads_por_canal', jsonb_build_array(
              jsonb_build_object('nome', 'Instagram', 'quantidade', 188)
            ),
            'leads_por_curso', jsonb_build_array(
              jsonb_build_object('nome', 'Sem curso', 'quantidade', 177),
              jsonb_build_object('nome', 'Canto', 'quantidade', 36)
            ),
            'matriculas_por_canal', jsonb_build_array(
              jsonb_build_object('nome', 'Visita/Placa', 'quantidade', 7)
            ),
            'matriculas_por_curso', jsonb_build_array(
              jsonb_build_object('nome', 'Canto', 'quantidade', 5)
            )
          )
        )
      $$;

      create function public.get_health_score_professor_v3_performance(
        p_competencia date,
        p_unidade_id uuid,
        p_periodicidade text
      ) returns table (
        professor_id bigint,
        estado_publicacao text,
        ranking_habilitado boolean,
        snapshot_publicavel boolean,
        score numeric,
        metrica text,
        valor_bruto numeric,
        numerador numeric,
        denominador numeric,
        amostra integer,
        estado_base text,
        confianca text,
        metrica_publicavel boolean
      ) language sql stable as $$
        select * from (values
          (1::bigint, 'oficial'::text, true, true, 88::numeric, 'permanencia'::text, 20.3::numeric, null::numeric, null::numeric, 12, 'ok'::text, 'alta'::text, true),
          (1::bigint, 'oficial'::text, true, true, 88::numeric, 'conversao'::text, 50::numeric, 4::numeric, 8::numeric, 8, 'ok'::text, 'alta'::text, true),
          (1::bigint, 'oficial'::text, true, true, 88::numeric, 'presenca'::text, 81.5::numeric, 81::numeric, 100::numeric, 100, 'ok'::text, 'alta'::text, true),
          (1::bigint, 'oficial'::text, true, true, 88::numeric, 'media_turma'::text, 1.5::numeric, 15::numeric, 10::numeric, 10, 'ok'::text, 'alta'::text, true),
          (2::bigint, 'parcial'::text, true, true, 99::numeric, 'permanencia'::text, 99::numeric, null::numeric, null::numeric, 12, 'ok'::text, 'alta'::text, true),
          (2::bigint, 'oficial'::text, false, true, 99::numeric, 'conversao'::text, 99::numeric, 9::numeric, 9::numeric, 9, 'ok'::text, 'alta'::text, true)
        ) as v(
          professor_id, estado_publicacao, ranking_habilitado,
          snapshot_publicavel, score, metrica, valor_bruto, numerador,
          denominador, amostra, estado_base, confianca, metrica_publicavel
        )
      $$;

      insert into public.unidades values (
        '95553e96-971b-4590-a6eb-0201d013c14d',
        'Recreio', 'REC', 'Fabiola/Clayton', 'Daiana', true
      );
      insert into public.professores values (1, 'Professora Canonica');
      insert into public.professores values (2, 'Professor Provisorio');
      insert into public.programa_matriculador_config (
        ano,
        meta_taxa_showup_experimental,
        meta_taxa_experimental_matricula,
        meta_taxa_lead_matricula,
        meta_volume_campo_grande,
        meta_volume_recreio,
        meta_volume_barra,
        meta_ticket_campo_grande,
        meta_ticket_recreio,
        meta_ticket_barra,
        mes_inicio,
        mes_fim
      ) values (
        2026,
        18,
        75,
        13.5,
        25,
        20,
        15,
        387,
        435,
        450,
        1,
        11
      );
      insert into public.programa_fideliza_config values (
        2026, 4, 1, 90, 7,
        '{"95553e96-971b-4590-a6eb-0201d013c14d":3000}'::jsonb
      );
    `);
    assert.equal(schema.status, 0, schema.stderr || schema.stdout);

    const aplicada = psql(container, migration);
    assert.equal(aplicada.status, 0, aplicada.stderr || aplicada.stdout);

    const consulta = psql(container, `
      select jsonb_build_object(
        'schema_version', r->>'schema_version',
        'status', r->>'status',
        'unidade', r#>>'{unidade,nome}',
        'gerente', r#>>'{unidade,gerente}',
        'hunter', r#>>'{unidade,hunter}',
        'ativos', r#>>'{administrativo,resumo,alunos_ativos}',
        'trancados', r#>>'{administrativo,resumo,alunos_trancados}',
        'inadimplencia', r#>>'{administrativo,indicadores_retencao,inadimplencia}',
        'renovacao', r#>>'{administrativo,indicadores_retencao,taxa_renovacao}',
        'leads', r#>>'{comercial,resumo,leads}',
        'taxa_lead_exp', r#>>'{comercial,resumo,taxa_lead_exp}',
        'ticket_parcela', r#>>'{comercial,resumo,ticket_medio_parcela}',
        'ranking', r#>>'{rankings,retencao,0,professor}',
        'meta_volume', r#>>'{metas,matriculador,meta_volume}',
        'meta_ticket', r#>>'{metas,matriculador,meta_ticket}',
        'meta_churn', r#>>'{metas,fideliza,meta_churn_maximo}',
        'comparativos', r#>>'{comparativos,status}',
        'admin_hash', r#>>'{auditoria,administrativo,payload_hash}',
        'comercial_retificado', r#>>'{auditoria,comercial,retificado}'
      )
      from (
        select public.get_relatorio_gerencial_canonico_v1(
          '95553e96-971b-4590-a6eb-0201d013c14d', 2026, 7
        ) r
      ) q;
    `);
    assert.equal(consulta.status, 0, consulta.stderr || consulta.stdout);
    assert.deepEqual(JSON.parse(consulta.stdout.trim()), {
      schema_version: '1',
      status: 'fechado',
      unidade: 'Recreio',
      gerente: 'Fabiola/Clayton',
      hunter: 'Daiana',
      ativos: '344',
      trancados: '2',
      inadimplencia: '1.19',
      renovacao: '85.19',
      leads: '297',
      taxa_lead_exp: '13.8',
      ticket_parcela: '426.82',
      ranking: 'Professora Canonica',
      meta_volume: '20',
      meta_ticket: '435',
      meta_churn: '4',
      comparativos: 'indisponivel',
      admin_hash: 'hash-admin',
      comercial_retificado: 'true',
    });
  } finally {
    docker(['rm', '--force', container]);
  }
});
