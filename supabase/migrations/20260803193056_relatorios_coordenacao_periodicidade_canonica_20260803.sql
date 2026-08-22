-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

begin;

-- Contrato V3 dos cinco relatÃ³rios da CoordenaÃ§Ã£o.
-- A competÃªncia continua sendo a referÃªncia de navegaÃ§Ã£o, mas todos os fatos
-- pedagÃ³gicos sÃ£o lidos do mesmo produtor do Health Score V3, no grÃ£o mensal
-- ou no ciclo oficial selecionado. Percentuais de ciclo sÃ£o recompostos pelos
-- numeradores e denominadores, nunca pela mÃ©dia de percentuais mensais.
create or replace function public.montar_relatorio_coordenacao_payload_v3(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text default 'mensal'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date;
  v_periodo_inicio date;
  v_periodo_fim date;
  v_ciclo_codigo text;
  v_periodo_label text;
  v_base jsonb;
  v_performance jsonb := '[]'::jsonb;
  v_kpis jsonb := '[]'::jsonb;
  v_operacional jsonb := '{}'::jsonb;
  v_professores jsonb := '[]'::jsonb;
  v_resumo jsonb := '{}'::jsonb;
  v_presenca jsonb := '{}'::jsonb;
  v_retencao_permanencia jsonb := '{}'::jsonb;
  v_experimentais jsonb := '{}'::jsonb;
  v_carteira_carga jsonb := '{}'::jsonb;
  v_saidas jsonb := '{}'::jsonb;
  v_ranking jsonb;
  v_qualidade_capacidade jsonb := '{}'::jsonb;
  v_estado_publicacao text;
  v_data_corte date;
  v_config_id uuid;
  v_regra_fingerprint text;
begin
  if p_ano is null or p_ano < 2020 or p_ano > 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V3_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  v_competencia := make_date(p_ano, p_mes, 1);

  select
    p.periodo_inicio,
    p.periodo_fim,
    p.ciclo_codigo,
    p.periodo_label
  into
    v_periodo_inicio,
    v_periodo_fim,
    v_ciclo_codigo,
    v_periodo_label
  from public.fn_health_score_v3_periodo(v_competencia, p_periodicidade) p;

  -- O V2 permanece como base compatÃ­vel para identidade, coordenaÃ§Ã£o, agenda,
  -- sinais fÃ­sicos e histÃ³rico fechado. Os nÃºmeros pedagÃ³gicos sÃ£o substituÃ­dos
  -- integralmente pelo produtor unificado abaixo.
  v_base := public.get_relatorio_coordenacao_canonico_v2(
    p_unidade_id,
    p_ano,
    p_mes
  );

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  into v_performance
  from public.get_health_score_professor_v3_performance(
    v_competencia,
    p_unidade_id,
    p_periodicidade
  ) r;

  if jsonb_array_length(v_performance) = 0 then
    raise exception 'RELATORIO_COORDENACAO_V3_HEALTH_SCORE_INDISPONIVEL';
  end if;

  select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
  into v_kpis
  from public.get_kpis_professor_periodo_canonico_v3(
    p_ano,
    p_mes,
    p_unidade_id,
    v_periodo_inicio,
    v_periodo_fim
  ) k;

  with kpis_raw as (
    select value as item
    from jsonb_array_elements(v_kpis)
  ),
  kpis_professor as (
    select
      (item->>'professor_id')::integer as professor_id,
      coalesce(sum((item->>'total_turmas')::integer), 0)::integer as total_turmas,
      coalesce(sum((item->>'alunos_via_turmas')::integer), 0)::integer as alunos_via_turmas,
      coalesce(sum((item->>'turmas_elegiveis_media')::integer), 0)::integer as turmas_elegiveis_media,
      coalesce(sum((item->>'carteira_alunos')::integer), 0)::integer as carteira_alunos
    from kpis_raw
    where nullif(item->>'professor_id', '') is not null
    group by (item->>'professor_id')::integer
  )
  select coalesce(
    jsonb_object_agg(
      professor_id::text,
      jsonb_build_object(
        'total_turmas', total_turmas,
        'alunos_via_turmas', alunos_via_turmas,
        'turmas_elegiveis_media', turmas_elegiveis_media,
        'carteira_alunos', carteira_alunos
      )
    ),
    '{}'::jsonb
  )
  into v_operacional
  from kpis_professor;

  with performance_raw as materialized (
    select value as item
    from jsonb_array_elements(v_performance)
  ),
  base_professores as (
    select value as item
    from jsonb_array_elements(coalesce(v_base->'professores', '[]'::jsonb))
  ),
  performance_professor as (
    select
      (r.item->>'professor_id')::integer as professor_id,
      jsonb_object_agg(
        r.item->>'metrica',
        jsonb_build_object(
          'valor', nullif(r.item->>'valor_bruto', '')::numeric,
          'valor_bruto', nullif(r.item->>'valor_bruto', '')::numeric,
          'numerador', nullif(r.item->>'numerador', '')::numeric,
          'denominador', nullif(r.item->>'denominador', '')::numeric,
          'nota', nullif(r.item->>'nota', '')::numeric,
          'meta', nullif(r.item->>'meta', '')::numeric,
          'amostra', coalesce(nullif(r.item->>'amostra', '')::integer, 0),
          'peso_original', coalesce(nullif(r.item->>'peso', '')::numeric, 0),
          'peso_efetivo', coalesce(nullif(r.item->>'peso_efetivo', '')::numeric, 0),
          'papel', r.item->>'papel',
          'codigo_evidencia', r.item->>'codigo_evidencia',
          'motivo', r.item->>'motivo_sem_base',
          'estado_base', r.item->>'estado_base',
          'confianca', r.item->>'confianca',
          'fonte', r.item->>'fonte',
          'regra_versao', r.item->>'regra_versao_metrica',
          'detalhes', coalesce(r.item->'detalhes', '{}'::jsonb)
        )
        order by r.item->>'metrica'
      ) as metricas,
      max(nullif(r.item->>'score_observado', '')::numeric) as score_observado,
      max(nullif(r.item->>'score_comparavel', '')::numeric) as score_comparavel,
      max(nullif(r.item->>'cobertura_normalizada', '')::numeric) as cobertura,
      max(r.item->>'classificacao') as classificacao,
      max(r.item->>'estado_publicacao') as estado_publicacao,
      bool_or(coalesce((r.item->>'score_exibivel')::boolean, false)) as score_exibivel,
      bool_or(coalesce((r.item->>'ranking_habilitado')::boolean, false)) as ranking_habilitado,
      max(nullif(r.item->>'pilares_validos', '')::integer) as pilares_validos,
      max(nullif(r.item->>'pilares_esperados', '')::integer) as pilares_esperados,
      max(r.item->>'comparabilidade_estado') as comparabilidade_estado,
      max(r.item->>'comparabilidade_motivo') as comparabilidade_motivo,
      max(nullif(r.item->>'competencia_referencia', '')::date) as competencia_referencia,
      max(nullif(r.item->>'score_referencia', '')::numeric) as score_referencia,
      max(r.item->>'classificacao_referencia') as classificacao_referencia,
      max(nullif(r.item->>'data_corte', '')::date) as data_corte,
      (array_agg(nullif(r.item->>'config_id', '')::uuid)
        filter (where nullif(r.item->>'config_id', '') is not null))[1] as config_id,
      max(r.item->>'regra_fingerprint') as regra_fingerprint,
      max(nullif(r.item->>'peso_pontuavel_total', '')::numeric) as peso_pontuavel_total,
      max(nullif(r.item->>'peso_disponivel_total', '')::numeric) as peso_disponivel_total,
      max(nullif(r.item->>'cobertura_minima_aplicada', '')::numeric) as cobertura_minima_aplicada,
      max(coalesce(r.item->'comparabilidade_motivos', '[]'::jsonb)::text)::jsonb
        as comparabilidade_motivos
    from performance_raw r
    where nullif(r.item->>'professor_id', '') is not null
      and nullif(r.item->>'metrica', '') is not null
    group by (r.item->>'professor_id')::integer
  )
  select coalesce(
    jsonb_agg(
      coalesce(
        b.item,
        jsonb_build_object(
          'professor_id', p.professor_id,
          'nome', coalesce(prof.nome, 'Professor nÃ£o informado')
        )
      )
      || jsonb_build_object(
        'score', p.score_observado,
        'score_observado', p.score_observado,
        'score_comparavel', p.score_comparavel,
        'cobertura', p.cobertura,
        'classificacao', p.classificacao,
        'estado_publicacao', p.estado_publicacao,
        'score_exibivel', p.score_exibivel,
        'ranking_habilitado', p.ranking_habilitado,
        'pilares_validos', coalesce(p.pilares_validos, 0),
        'pilares_esperados', coalesce(p.pilares_esperados, 0),
        'comparabilidade_estado', coalesce(p.comparabilidade_estado, 'sem_base_operacional'),
        'comparabilidade_motivo', coalesce(p.comparabilidade_motivo, 'fonte_canonica_indisponivel'),
        'estado_evidencia', coalesce(p.comparabilidade_estado, 'sem_base_operacional'),
        'competencia_referencia', p.competencia_referencia,
        'score_referencia', p.score_referencia,
        'classificacao_referencia', p.classificacao_referencia,
        'metricas', p.metricas,
        'operacional', coalesce(v_operacional->p.professor_id::text, '{}'::jsonb),
        'auditoria_health_score', jsonb_build_object(
          'data_corte', p.data_corte,
          'config_id', p.config_id,
          'regra_fingerprint', p.regra_fingerprint,
          'peso_pontuavel_total', p.peso_pontuavel_total,
          'peso_disponivel_total', p.peso_disponivel_total,
          'cobertura_normalizada', p.cobertura,
          'cobertura_minima_aplicada', p.cobertura_minima_aplicada,
          'comparabilidade_motivos', p.comparabilidade_motivos
        )
      )
      order by coalesce(b.item->>'nome', prof.nome, 'Professor nÃ£o informado')
    ),
    '[]'::jsonb
  )
  into v_professores
  from performance_professor p
  left join base_professores b
    on nullif(b.item->>'professor_id', '')::integer = p.professor_id
  left join public.professores prof on prof.id = p.professor_id;

  with equipe as (
    select value as p
    from jsonb_array_elements(v_professores)
  )
  select jsonb_build_object(
    'total_professores', count(*),
    'com_score', count(*) filter (where nullif(p->>'score_observado', '') is not null),
    'comparaveis', count(*) filter (where p->>'comparabilidade_estado' = 'comparavel'),
    'em_maturacao', count(*) filter (where p->>'comparabilidade_estado' = 'em_maturacao'),
    'sem_base_operacional', count(*) filter (where p->>'comparabilidade_estado' = 'sem_base_operacional'),
    'com_evidencia_pendente', count(*) filter (where p->>'comparabilidade_estado' = 'sem_base_operacional'),
    'saudaveis', count(*) filter (
      where p->>'comparabilidade_estado' = 'comparavel' and p->>'classificacao' = 'saudavel'
    ),
    'atencao', count(*) filter (
      where p->>'comparabilidade_estado' = 'comparavel' and p->>'classificacao' = 'atencao'
    ),
    'criticos', count(*) filter (
      where p->>'comparabilidade_estado' = 'comparavel' and p->>'classificacao' = 'critico'
    ),
    'score_medio_comparavel', round(avg(nullif(p->>'score_comparavel', '')::numeric), 1),
    'score_medio_observado', round(avg(nullif(p->>'score_observado', '')::numeric), 1),
    'score_medio_visivel', round(avg(nullif(p->>'score_comparavel', '')::numeric), 1)
  )
  into v_resumo
  from equipe;

  with raw as (
    select value as item
    from jsonb_array_elements(v_performance)
    where value->>'metrica' = 'presenca'
  )
  select jsonb_build_object(
    'presenca_media', case
      when sum(coalesce(nullif(item->>'denominador', '')::numeric, 0)) > 0
        then round(
          sum(coalesce(nullif(item->>'numerador', '')::numeric, 0))
            / sum(coalesce(nullif(item->>'denominador', '')::numeric, 0)) * 100,
          1
        )
      else null::numeric
    end,
    'professores_com_evidencia', count(*) filter (
      where coalesce(nullif(item->>'denominador', '')::numeric, 0) > 0
    ),
    'pendencias', count(*) filter (
      where coalesce(nullif(item->>'denominador', '')::numeric, 0) <= 0
    ),
    'eventos_elegiveis', coalesce(sum(coalesce(nullif(item->>'denominador', '')::numeric, 0)), 0),
    'presencas_confirmadas', coalesce(sum(coalesce(nullif(item->>'numerador', '')::numeric, 0)), 0),
    'regra_agregacao', 'soma_numeradores_dividida_pela_soma_denominadores'
  )
  into v_presenca
  from raw;

  with raw as (
    select value as item
    from jsonb_array_elements(v_performance)
  ),
  retencao as (
    select * from raw where item->>'metrica' = 'retencao'
  ),
  permanencia as (
    select * from raw where item->>'metrica' = 'permanencia'
  )
  select jsonb_build_object(
    'retencao_media', (
      select case when sum(coalesce(nullif(item->>'denominador', '')::numeric, 0)) > 0
        then round(
          sum(coalesce(nullif(item->>'numerador', '')::numeric, 0))
            / sum(coalesce(nullif(item->>'denominador', '')::numeric, 0)) * 100,
          1
        )
        else null::numeric end
      from retencao
    ),
    'professores_com_retencao', (
      select count(*) from retencao
      where coalesce(nullif(item->>'denominador', '')::numeric, 0) > 0
    ),
    'permanencia_media_meses', (
      select case when sum(coalesce(nullif(item->>'denominador', '')::numeric, 0)) > 0
        then round(
          sum(coalesce(
            nullif(item->>'numerador', '')::numeric,
            nullif(item->>'valor_bruto', '')::numeric
              * coalesce(nullif(item->>'denominador', '')::numeric, 0)
          )) / sum(coalesce(nullif(item->>'denominador', '')::numeric, 0)),
          1
        )
        else null::numeric end
      from permanencia
    ),
    'professores_com_permanencia', (
      select count(*) from permanencia
      where coalesce(nullif(item->>'denominador', '')::numeric, 0) > 0
    ),
    'regra_agregacao', 'fatos_brutos_ponderados_no_periodo'
  )
  into v_retencao_permanencia;

  with raw as (
    select value as item
    from jsonb_array_elements(v_performance)
    where value->>'metrica' = 'conversao'
  )
  select jsonb_build_object(
    'professores_com_amostra_minima', count(*) filter (
      where coalesce(nullif(item->>'denominador', '')::numeric, 0) >= 3
    ),
    'professores_conversao_pontuando', count(*) filter (
      where coalesce((item->>'peso_disponivel')::boolean, false)
        and coalesce(nullif(item->>'peso_efetivo', '')::numeric, 0) > 0
    ),
    'professores_sem_experimental', count(*) filter (
      where coalesce(nullif(item->>'denominador', '')::numeric, 0) = 0
    ),
    'professores_com_amostra_insuficiente', count(*) filter (
      where coalesce(nullif(item->>'denominador', '')::numeric, 0) between 1 and 2
    ),
    'taxa_conversao_observada', case
      when sum(coalesce(nullif(item->>'denominador', '')::numeric, 0)) > 0
        then round(
          sum(coalesce(nullif(item->>'numerador', '')::numeric, 0))
            / sum(coalesce(nullif(item->>'denominador', '')::numeric, 0)) * 100,
          1
        )
      else null::numeric
    end,
    'experimentais_confirmadas', coalesce(sum(coalesce(nullif(item->>'denominador', '')::numeric, 0)), 0),
    'matriculas_pos_experimental', coalesce(sum(coalesce(nullif(item->>'numerador', '')::numeric, 0)), 0),
    'regra_agregacao', 'soma_numeradores_dividida_pela_soma_denominadores'
  )
  into v_experimentais
  from raw;

  with professores as (
    select value as p
    from jsonb_array_elements(v_professores)
  ),
  carteira as (
    select
      nullif(p #>> '{metricas,numero_alunos,valor}', '')::numeric as valor
    from professores
  ),
  operacional as (
    select value as item from jsonb_array_elements(v_kpis)
  )
  select jsonb_build_object(
    'alunos_na_carteira', coalesce((select sum(valor) from carteira), 0),
    'professores_com_carteira_observada', (
      select count(*) from carteira where valor is not null
    ),
    'media_por_professor', (
      select round(avg(valor), 1) from carteira where valor is not null
    ),
    'total_turmas_operacionais', coalesce((
      select sum(coalesce(nullif(item->>'total_turmas', '')::numeric, 0))
      from operacional
    ), 0),
    'ocupacoes_elegiveis', coalesce((
      select sum(coalesce(nullif(item->>'alunos_via_turmas', '')::numeric, 0))
      from operacional
    ), 0),
    'turmas_elegiveis', coalesce((
      select sum(coalesce(nullif(item->>'turmas_elegiveis_media', '')::numeric, 0))
      from operacional
    ), 0),
    'media_alunos_turma', (
      select case
        when sum(coalesce(nullif(item->>'turmas_elegiveis_media', '')::numeric, 0)) > 0
          then round(
            sum(coalesce(nullif(item->>'alunos_via_turmas', '')::numeric, 0))
              / sum(coalesce(nullif(item->>'turmas_elegiveis_media', '')::numeric, 0)),
            2
          )
        else null::numeric
      end
      from operacional
    ),
    'grao_carteira', 'vinculo_professor_pessoa',
    'grao_turmas', 'turma_operacional',
    'grao_media', 'ocupacoes_elegiveis_por_turma_elegivel'
  )
  into v_carteira_carga;

  with movimentos as (
    select
      m.id,
      m.data,
      m.tipo::text as tipo,
      coalesce(nullif(btrim(m.aluno_nome), ''), a.nome, 'Aluno nÃ£o informado') as aluno_nome,
      m.professor_id,
      coalesce(p.nome, 'Professor nÃ£o informado') as professor_nome,
      nullif(btrim(coalesce(m.motivo, '')), '') as motivo,
      coalesce(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)::numeric as valor_mrr,
      coalesce(ms.conta_score_professor, false) as conta_score_professor
    from public.movimentacoes_admin m
    left join public.alunos a on a.id = m.aluno_id
    left join public.professores p on p.id = m.professor_id
    left join lateral (
      select motivo.conta_score_professor
      from public.motivos_saida motivo
      where motivo.ativo = true
        and (
          motivo.id = m.motivo_saida_id
          or (
            m.motivo_saida_id is null
            and m.motivo is not null
            and lower(btrim(motivo.nome)) = lower(btrim(m.motivo))
          )
        )
      order by case when motivo.id = m.motivo_saida_id then 0 else 1 end, motivo.id
      limit 1
    ) ms on true
    where m.tipo in ('evasao', 'nao_renovacao')
      and m.data between v_periodo_inicio and v_periodo_fim
      and (p_unidade_id is null or m.unidade_id = p_unidade_id)
      and public.is_movimentacao_admin_retencao_valida(m.id)
      and coalesce(a.is_segundo_curso, false) = false
  )
  select jsonb_build_object(
    'evasoes_validas', count(*) filter (where tipo = 'evasao'),
    'nao_renovacoes_validas', count(*) filter (where tipo = 'nao_renovacao'),
    'saidas_validas_total', count(*),
    'saidas_atribuiveis_professor', count(*) filter (where conta_score_professor),
    'mrr_perdido_total', coalesce(sum(valor_mrr), 0),
    'mrr_perdido_atribuivel', coalesce(sum(valor_mrr) filter (where conta_score_professor), 0),
    'movimentos', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'data', data,
        'tipo', tipo,
        'aluno_nome', aluno_nome,
        'professor_id', professor_id,
        'professor_nome', professor_nome,
        'motivo', motivo,
        'valor_mrr', valor_mrr,
        'conta_score_professor', conta_score_professor
      ) order by data, id
    ), '[]'::jsonb),
    'regra_publica', 'MovimentaÃ§Ãµes vÃ¡lidas do perÃ­odo, com impacto no professor separado do total operacional'
  )
  into v_saidas
  from movimentos;

  with equipe as (
    select value as p
    from jsonb_array_elements(v_professores)
    where value->>'comparabilidade_estado' = 'comparavel'
      and coalesce((value->>'ranking_habilitado')::boolean, false)
      and value->>'estado_publicacao' = 'oficial'
      and nullif(value->>'score_comparavel', '') is not null
  )
  select jsonb_agg(
    jsonb_build_object(
      'professor_id', (p->>'professor_id')::integer,
      'nome', p->>'nome',
      'score', (p->>'score_comparavel')::numeric,
      'cobertura', (p->>'cobertura')::numeric,
      'classificacao', p->>'classificacao'
    )
    order by (p->>'score_comparavel')::numeric desc, p->>'nome'
  )
  into v_ranking
  from equipe;

  with capacidade as (
    select value as sinal
    from jsonb_array_elements(coalesce(v_base->'mapa_sinais', '[]'::jsonb))
    where value->>'sinal' = 'capacidade_estimada_conferir'
  )
  select jsonb_build_object(
    'professores_afetados', count(distinct nullif(sinal->>'professor_id', '')::integer),
    'agrupamentos_estimados', coalesce(sum(
      case when jsonb_typeof(sinal #> '{evidencias,turmas}') = 'array'
        then jsonb_array_length(sinal #> '{evidencias,turmas}')
        else 0 end
    ), 0),
    'impacta_nota', false,
    'impacta_prioridade_pedagogica', false,
    'direcionamento', 'completar vÃ­nculo de turma e sala'
  )
  into v_qualidade_capacidade
  from capacidade;

  select
    max(value->>'estado_publicacao'),
    max(nullif(value->>'data_corte', '')::date),
    (array_agg(nullif(value->>'config_id', '')::uuid)
      filter (where nullif(value->>'config_id', '') is not null))[1],
    max(value->>'regra_fingerprint')
  into
    v_estado_publicacao,
    v_data_corte,
    v_config_id,
    v_regra_fingerprint
  from jsonb_array_elements(v_performance);

  return v_base || jsonb_build_object(
    'schema_version', 3,
    'periodo', coalesce(v_base->'periodo', '{}'::jsonb) || jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'inicio', v_periodo_inicio,
      'fim', v_periodo_fim,
      'periodicidade', p_periodicidade,
      'ciclo_codigo', v_ciclo_codigo,
      'label', v_periodo_label,
      'estado_publicacao', v_estado_publicacao,
      'data_corte', v_data_corte
    ),
    'resumo_equipe', v_resumo,
    'professores', v_professores,
    'presenca', v_presenca,
    'retencao_permanencia', v_retencao_permanencia,
    'experimentais', v_experimentais,
    'carteira_carga', v_carteira_carga,
    'saidas_retencao', v_saidas,
    'ranking_oficial', v_ranking,
    'qualidade_dados', coalesce(v_base->'qualidade_dados', '{}'::jsonb)
      || jsonb_build_object(
        'capacidade_estimada_pendente', v_qualidade_capacidade
      ),
    'auditoria', coalesce(v_base->'auditoria', '{}'::jsonb) || jsonb_build_object(
      'contrato', 'relatorio-coordenacao-pedagogica-3',
      'fonte_publica', 'Health Score Professor V3 e indicadores oficiais do perÃ­odo',
      'fonte_health_score', 'get_health_score_professor_v3_performance',
      'periodicidade', p_periodicidade,
      'ciclo_codigo', v_ciclo_codigo,
      'data_corte', v_data_corte,
      'config_id', v_config_id,
      'regra_fingerprint', v_regra_fingerprint,
      'agregacao_percentuais', 'numerador_denominador',
      'imutavel', coalesce(v_estado_publicacao = 'oficial', false)
    )
  );
end;
$function$;

revoke all on function public.montar_relatorio_coordenacao_payload_v3(
  uuid, integer, integer, text
) from public, anon, authenticated, service_role;

create or replace function public.get_relatorio_coordenacao_canonico_v3(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text default 'mensal'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);
  return public.montar_relatorio_coordenacao_payload_v3(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade
  );
end;
$function$;

revoke all on function public.get_relatorio_coordenacao_canonico_v3(
  uuid, integer, integer, text
) from public, anon;
grant execute on function public.get_relatorio_coordenacao_canonico_v3(
  uuid, integer, integer, text
) to authenticated, service_role;

comment on function public.montar_relatorio_coordenacao_payload_v3(
  uuid, integer, integer, text
) is
  'Produtor interno dos cinco relatÃ³rios da CoordenaÃ§Ã£o. Mensal mostra evidÃªncias da competÃªncia; ciclo agrega fatos brutos no ciclo oficial.';

comment on function public.get_relatorio_coordenacao_canonico_v3(
  uuid, integer, integer, text
) is
  'Contrato canÃ´nico V3 dos relatÃ³rios da CoordenaÃ§Ã£o, auditÃ¡vel por perÃ­odo, configuraÃ§Ã£o e regra do Health Score Professor V3.';

commit;
