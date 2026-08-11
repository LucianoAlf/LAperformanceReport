-- O ranking do fechamento mensal precisa ser uma leitura da mesma cadeia
-- canônica usada na tela de Professores. O snapshot do Health Score continua
-- servindo ao ciclo, mas não é a fonte do mês fechado.

create or replace function public.get_relatorio_gerencial_ranking_mensal_canonico_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  with parametros as (
    select
      make_date(p_ano, p_mes, 1) as inicio,
      (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date as fim
  ), universo as materialized (
    select distinct pu.professor_id
    from public.professores_unidades pu
    join public.professores pr on pr.id = pu.professor_id
    where pu.unidade_id = p_unidade_id
      and pr.ativo = true
      and coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado') <> 'ignorado'
  ), kpis as materialized (
    select k.*
    from parametros prm
    cross join lateral public.get_kpis_professor_periodo_canonico_v3(
      p_ano,
      p_mes,
      p_unidade_id,
      prm.inicio,
      prm.fim
    ) k
    join universo u on u.professor_id = k.professor_id
  ), permanencia as materialized (
    select h.*
    from parametros prm
    cross join lateral public.get_health_score_professor_v3_permanencia_periodo_v2(
      prm.inicio,
      p_unidade_id,
      'mensal'
    ) h
    join universo u on u.professor_id = h.professor_id
    where h.publicavel = true
      and h.valor_bruto is not null
  )
  select jsonb_build_object(
    'retencao', jsonb_strip_nulls(jsonb_build_object(
      'status', 'oficial',
      'tipo', 'fechamento_mensal',
      'competencia', to_char(prm.inicio, 'YYYY-MM'),
      'cobertura', format(
        '%s de %s professores',
        (select count(*) from permanencia),
        (select count(*) from universo)
      ),
      'regra', 'permanencia-canonica-v3',
      'itens', coalesce((
        select jsonb_agg(jsonb_build_object(
          'professor', x.professor_nome,
          'amostra', x.amostra,
          'numerador', x.numerador,
          'denominador', x.denominador,
          'confianca', x.confianca,
          'tempo_medio_permanencia', round(x.valor_bruto, 1)
        ) order by x.valor_bruto desc, x.professor_nome)
        from (
          select *
          from permanencia
          order by valor_bruto desc, professor_nome
          limit 3
        ) x
      ), '[]'::jsonb)
    )),
    'matriculadores', jsonb_strip_nulls(jsonb_build_object(
      'status', 'oficial',
      'tipo', 'fechamento_mensal',
      'competencia', to_char(prm.inicio, 'YYYY-MM'),
      'cobertura', format(
        '%s de %s professores',
        (select count(*) from kpis where experimentais >= 3 and matriculas_pos_exp > 0),
        (select count(*) from universo)
      ),
      'regra', 'conversao-experimental-mensal-canonica-v3',
      'itens', coalesce((
        select jsonb_agg(jsonb_build_object(
          'professor', x.professor_nome,
          'amostra', x.experimentais,
          'numerador', x.matriculas_pos_exp,
          'denominador', x.experimentais,
          'confianca', 'alta',
          'matriculas', x.matriculas_pos_exp,
          'experimentais', x.experimentais,
          'taxa_conversao', round(x.taxa_conversao, 2)
        ) order by x.matriculas_pos_exp desc, x.taxa_conversao desc, x.professor_nome)
        from (
          select *
          from kpis
          where experimentais >= 3
            and matriculas_pos_exp > 0
          order by matriculas_pos_exp desc, taxa_conversao desc, professor_nome
          limit 3
        ) x
      ), '[]'::jsonb)
    )),
    'presenca', jsonb_strip_nulls(jsonb_build_object(
      'status', 'oficial',
      'tipo', 'fechamento_mensal',
      'competencia', to_char(prm.inicio, 'YYYY-MM'),
      'cobertura', format(
        '%s de %s professores',
        (select count(*) from kpis where presenca_publicavel and media_presenca is not null),
        (select count(*) from universo)
      ),
      'regra', 'presenca-canonica-v3',
      'itens', coalesce((
        select jsonb_agg(jsonb_build_object(
          'professor', x.professor_nome,
          'amostra', x.presenca_eventos_confirmados,
          'numerador', round(
            x.media_presenca * x.presenca_eventos_confirmados / 100,
            0
          )::integer,
          'denominador', x.presenca_eventos_confirmados,
          'confianca', x.presenca_confianca,
          'presenca_media', round(x.media_presenca, 1)
        ) order by x.media_presenca desc, x.professor_nome)
        from (
          select *
          from kpis
          where presenca_publicavel
            and media_presenca is not null
          order by media_presenca desc, professor_nome
          limit 3
        ) x
      ), '[]'::jsonb)
    )),
    'media_turma', jsonb_strip_nulls(jsonb_build_object(
      'status', 'oficial',
      'tipo', 'fechamento_mensal',
      'competencia', to_char(prm.inicio, 'YYYY-MM'),
      'cobertura', format(
        '%s de %s professores',
        (select count(*) from kpis
          where media_alunos_turma is not null
            and coalesce(turmas_elegiveis_media, 0) > 0),
        (select count(*) from universo)
      ),
      'regra', 'media-alunos-turma-canonica-v2',
      'itens', coalesce((
        select jsonb_agg(jsonb_build_object(
          'professor', x.professor_nome,
          'amostra', x.alunos_via_turmas,
          'numerador', x.alunos_via_turmas,
          'denominador', x.turmas_elegiveis_media,
          'confianca', 'alta',
          'media_alunos_turma', round(x.media_alunos_turma, 2),
          'alunos_via_turmas', x.alunos_via_turmas,
          'turmas_elegiveis', x.turmas_elegiveis_media
        ) order by x.media_alunos_turma desc, x.professor_nome)
        from (
          select *
          from kpis
          where media_alunos_turma is not null
            and coalesce(turmas_elegiveis_media, 0) > 0
          order by media_alunos_turma desc, professor_nome
          limit 3
        ) x
      ), '[]'::jsonb)
    ))
  )
  into v_result
  from parametros prm;

  return v_result;
end;
$function$;

revoke all on function public.get_relatorio_gerencial_ranking_mensal_canonico_v2(uuid, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.get_relatorio_gerencial_ranking_mensal_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $function$
  select public.get_relatorio_gerencial_ranking_mensal_canonico_v2(
    p_unidade_id,
    p_ano,
    p_mes
  );
$function$;

revoke all on function public.get_relatorio_gerencial_ranking_mensal_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.get_relatorio_gerencial_ranking_mensal_v1(uuid, integer, integer) is
  'Ranking mensal: quatro metricas derivadas dos produtores canonicos por competencia, sem snapshots parciais do ciclo.';
