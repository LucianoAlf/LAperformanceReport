begin;

-- O consolidado so pode somar linhas que tambem pertencem ao roster historico
-- publicado pela respectiva unidade. Isso garante que o total consolidado seja
-- exatamente a soma dos tres documentos de unidade.
create or replace function public.relatorio_coordenacao_carteira_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_data_corte date
)
returns table (
  professor_id integer,
  carteira_media numeric,
  meses_observados integer,
  total_turmas integer,
  ocupacoes_elegiveis integer,
  turmas_elegiveis integer,
  media_alunos_turma numeric,
  fechamentos jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with periodos as materialized (
    select *
    from public.relatorio_coordenacao_periodos_v4(
      p_ano, p_mes, p_periodicidade, p_data_corte
    )
  ), unidades as materialized (
    select * from public.relatorio_coordenacao_unidades_v4(p_unidade_id)
  ), roster_unidade as materialized (
    select distinct
      u.unidade_id,
      nullif(p.item ->> 'professor_id', '')::integer as professor_id
    from unidades u
    cross join lateral jsonb_array_elements(
      public.montar_relatorio_coordenacao_payload_v3(
        u.unidade_id,
        p_ano,
        p_mes,
        p_periodicidade
      ) -> 'professores'
    ) p(item)
    where nullif(p.item ->> 'professor_id', '') is not null
  ), grade as materialized (
    select p.competencia, p.inicio, p.fim, u.unidade_id
    from periodos p
    cross join unidades u
  ), snapshots_ranked as (
    select
      g.competencia,
      s.unidade_id,
      s.professor_id,
      s.carteira_alunos,
      row_number() over (
        partition by g.competencia, s.unidade_id, s.professor_id
        order by s.auditado_em desc nulls last, s.created_at desc, s.id desc
      ) as ordem
    from grade g
    join public.professor_carteira_mensal_canonica s
      on s.competencia = g.competencia
     and s.unidade_id = g.unidade_id
  ), snapshots as (
    select competencia, unidade_id, professor_id, carteira_alunos
    from snapshots_ranked
    where ordem = 1
  ), composicao as materialized (
    select
      g.competencia,
      c.unidade_id,
      c.professor_id,
      c.carteira_regular,
      c.carteira_so_atividade_extra
    from grade g
    cross join lateral public.get_carteira_professor_periodo_composicao_v1(
      extract(year from g.competencia)::integer,
      extract(month from g.competencia)::integer,
      g.unidade_id,
      g.inicio,
      g.fim
    ) c
  ), kpis as materialized (
    select
      g.competencia,
      k.unidade_id,
      k.professor_id,
      k.total_turmas,
      k.alunos_via_turmas,
      k.turmas_elegiveis_media
    from grade g
    cross join lateral public.get_carteira_professor_periodo_canonica(
      extract(year from g.competencia)::integer,
      extract(month from g.competencia)::integer,
      g.unidade_id,
      g.inicio,
      g.fim
    ) k
  ), chaves_brutas as (
    select competencia, unidade_id, professor_id from snapshots
    union
    select competencia, unidade_id, professor_id from composicao
    union
    select competencia, unidade_id, professor_id from kpis
  ), chaves as (
    select c.competencia, c.unidade_id, c.professor_id
    from chaves_brutas c
    join roster_unidade r
      on r.unidade_id = c.unidade_id
     and r.professor_id = c.professor_id
  ), mensal_unidade as (
    select
      c.competencia,
      c.unidade_id,
      c.professor_id,
      case
        when s.professor_id is not null
         and (c.competencia + interval '1 month - 1 day')::date < current_date
          then greatest(
            s.carteira_alunos - coalesce(x.carteira_so_atividade_extra, 0),
            0
          )::numeric
        when x.professor_id is not null then x.carteira_regular::numeric
        when s.professor_id is not null then greatest(
          s.carteira_alunos - coalesce(x.carteira_so_atividade_extra, 0),
          0
        )::numeric
        else null::numeric
      end as carteira,
      k.total_turmas,
      k.alunos_via_turmas,
      k.turmas_elegiveis_media,
      case
        when s.professor_id is not null
         and (c.competencia + interval '1 month - 1 day')::date < current_date
          then 'fechamento_mensal_menos_extra_exclusivo'
        when x.professor_id is not null then 'composicao_regular'
        when s.professor_id is not null then 'fechamento_mensal_disponivel'
        else null::text
      end as origem
    from chaves c
    left join snapshots s
      on s.competencia = c.competencia
     and s.unidade_id = c.unidade_id
     and s.professor_id = c.professor_id
    left join composicao x
      on x.competencia = c.competencia
     and x.unidade_id = c.unidade_id
     and x.professor_id = c.professor_id
    left join kpis k
      on k.competencia = c.competencia
     and k.unidade_id = c.unidade_id
     and k.professor_id = c.professor_id
  ), mensal_professor as (
    select
      m.competencia,
      m.professor_id,
      case when count(m.carteira) > 0 then sum(m.carteira) end as carteira,
      case when count(m.total_turmas) > 0 then sum(m.total_turmas) end::integer
        as total_turmas,
      case when count(m.alunos_via_turmas) > 0 then sum(m.alunos_via_turmas) end::integer
        as ocupacoes_elegiveis,
      case when count(m.turmas_elegiveis_media) > 0 then sum(m.turmas_elegiveis_media) end::integer
        as turmas_elegiveis,
      jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'unidade_id', m.unidade_id,
        'valor', m.carteira,
        'origem', m.origem
      )) order by m.unidade_id) as unidades
    from mensal_unidade m
    group by m.competencia, m.professor_id
  )
  select
    m.professor_id,
    round(avg(m.carteira), 2) as carteira_media,
    count(m.carteira)::integer as meses_observados,
    case when count(m.total_turmas) > 0 then sum(m.total_turmas) end::integer,
    case when count(m.ocupacoes_elegiveis) > 0 then sum(m.ocupacoes_elegiveis) end::integer,
    case when count(m.turmas_elegiveis) > 0 then sum(m.turmas_elegiveis) end::integer,
    case
      when sum(m.turmas_elegiveis) > 0 then round(
        sum(m.ocupacoes_elegiveis)::numeric / sum(m.turmas_elegiveis),
        2
      )
      else null::numeric
    end as media_alunos_turma,
    jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'competencia', m.competencia,
      'valor', m.carteira,
      'total_turmas', m.total_turmas,
      'ocupacoes_elegiveis', m.ocupacoes_elegiveis,
      'turmas_elegiveis', m.turmas_elegiveis,
      'unidades', m.unidades
    )) order by m.competencia) as fechamentos
  from mensal_professor m
  group by m.professor_id
  order by m.professor_id;
$function$;

revoke all on function public.relatorio_coordenacao_carteira_v4(uuid, integer, integer, text, date)
  from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_carteira_v4(uuid, integer, integer, text, date)
  to service_role;

comment on function public.relatorio_coordenacao_carteira_v4(uuid, integer, integer, text, date) is
  'Carteira V4 por fechamento mensal, sem atividade extra exclusiva e limitada ao mesmo roster historico publicado por unidade.';

commit;
