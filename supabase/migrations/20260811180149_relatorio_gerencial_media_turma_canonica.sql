-- O fechamento mensal continua usando a mesma cadeia de rankings para
-- permanencia, presenca e conversao. Media/turma, porem, deve vir do read
-- model canonico de turmas, que deduplica pessoa + ocupacao por turma e nao do
-- valor bruto do snapshot Health Score parcial.

create or replace function public.get_relatorio_gerencial_ranking_mensal_media_turma_canonico_v1(
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
  v_base jsonb;
  v_media jsonb;
begin
  v_base := public.get_relatorio_gerencial_ranking_mensal_v2(
    p_unidade_id,
    p_ano,
    p_mes
  );

  with turmas_base as materialized (
    select
      k.professor_id,
      p.nome::text as professor_nome,
      k.ocupacoes_elegiveis,
      k.turmas_elegiveis,
      k.media_alunos_turma,
      k.competencia_status
    from public.get_kpis_turmas_canonicos_v2(
      p_ano,
      p_mes,
      p_unidade_id,
      make_date(p_ano, p_mes, 1),
      (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
    ) k
    join public.professores p on p.id = k.professor_id
    where k.competencia_status = 'fechado'
  ),
  resumo as (
    select
      count(*)::integer as professores_total,
      count(*) filter (
        where media_alunos_turma is not null
          and turmas_elegiveis > 0
      )::integer as professores_publicaveis
    from turmas_base
  ),
  itens as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'professor', x.professor_nome,
        'amostra', x.ocupacoes_elegiveis,
        'numerador', x.ocupacoes_elegiveis,
        'denominador', x.turmas_elegiveis,
        'confianca', 'alta',
        'media_alunos_turma', round(x.media_alunos_turma, 2),
        'alunos_via_turmas', x.ocupacoes_elegiveis,
        'turmas_elegiveis', x.turmas_elegiveis
      )
      order by x.media_alunos_turma desc, x.professor_nome
    ) filter (where x.media_alunos_turma is not null and x.turmas_elegiveis > 0), '[]'::jsonb) as payload
    from (
      select t.*, row_number() over (
        order by t.media_alunos_turma desc, t.professor_nome
      ) as ordem
      from turmas_base t
      where t.media_alunos_turma is not null
        and t.turmas_elegiveis > 0
    ) x
    where x.ordem <= 3
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'status', 'oficial',
    'tipo', 'fechamento_mensal',
    'competencia', to_char(make_date(p_ano, p_mes, 1), 'YYYY-MM'),
    'cobertura', format(
      '%s de %s professores',
      coalesce(r.professores_publicaveis, 0),
      coalesce(r.professores_total, 0)
    ),
    'regra', 'media-alunos-turma-canonica-v2',
    'itens', i.payload,
    'motivo', case when coalesce(r.professores_publicaveis, 0) = 0
      then 'nenhuma_amostra_publicavel' else null end
  ))
  into v_media
  from resumo r
  cross join itens i;

  return jsonb_set(
    coalesce(v_base, '{}'::jsonb),
    '{media_turma}',
    coalesce(v_media, '{}'::jsonb),
    true
  );
end;
$function$;

revoke all on function public.get_relatorio_gerencial_ranking_mensal_media_turma_canonico_v1(uuid, integer, integer)
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
  select public.get_relatorio_gerencial_ranking_mensal_media_turma_canonico_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );
$function$;

revoke all on function public.get_relatorio_gerencial_ranking_mensal_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;
