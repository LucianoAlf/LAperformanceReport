-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.get_experimentais_emusys_operacional_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal',
  p_data date default null
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with periodo as (
    select
      case
        when lower(coalesce(p_periodo, 'mensal')) = 'diario'
          then coalesce(p_data, make_date(p_ano, p_mes, 1))
        else make_date(p_ano, p_mes, 1)
      end as data_inicio,
      case
        when lower(coalesce(p_periodo, 'mensal')) = 'diario'
          then coalesce(p_data, make_date(p_ano, p_mes, 1)) + interval '1 day'
        else make_date(p_ano, p_mes, 1) + interval '1 month'
      end as data_fim_exclusivo
  ),
  base as (
    select r.*
    from public.emusys_experimentais_raw r
    cross join periodo p
    where r.data_aula >= p.data_inicio
      and r.data_aula < p.data_fim_exclusivo
      and (p_unidade_id is null or r.unidade_id = p_unidade_id)
  ),
  por_unidade as (
    select
      u.id as unidade_id,
      u.nome as unidade_nome,
      count(b.*)::integer as linhas_raw,
      count(b.*) filter (where b.situacao_operacional = 'presente')::integer as presentes,
      count(b.*) filter (where b.situacao_operacional = 'matriculado')::integer as matriculados,
      count(b.*) filter (where b.situacao_operacional in ('presente', 'matriculado'))::integer as realizadas_emusys,
      count(b.*) filter (where b.situacao_operacional = 'faltou')::integer as faltas,
      count(b.*) filter (where b.situacao_operacional = 'cancelada')::integer as canceladas,
      count(b.*) filter (where b.aluno_id is null)::integer as sem_aluno_id,
      count(b.*) filter (where b.lead_id is null)::integer as sem_lead_id
    from public.unidades u
    left join base b on b.unidade_id = u.id
    where p_unidade_id is null or u.id = p_unidade_id
    group by u.id, u.nome
  ),
  total as (
    select
      count(*)::integer as linhas_raw,
      count(*) filter (where situacao_operacional = 'presente')::integer as presentes,
      count(*) filter (where situacao_operacional = 'matriculado')::integer as matriculados,
      count(*) filter (where situacao_operacional in ('presente', 'matriculado'))::integer as realizadas_emusys,
      count(*) filter (where situacao_operacional = 'faltou')::integer as faltas,
      count(*) filter (where situacao_operacional = 'cancelada')::integer as canceladas,
      count(*) filter (where aluno_id is null)::integer as sem_aluno_id,
      count(*) filter (where lead_id is null)::integer as sem_lead_id
    from base
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'tipo', lower(coalesce(p_periodo, 'mensal')),
      'data', p_data
    ),
    'resumo', jsonb_build_object(
      'linhas_raw', total.linhas_raw,
      'presentes', total.presentes,
      'matriculados', total.matriculados,
      'realizadas_emusys', total.realizadas_emusys,
      'faltas', total.faltas,
      'canceladas', total.canceladas,
      'sem_aluno_id', total.sem_aluno_id,
      'sem_lead_id', total.sem_lead_id
    ),
    'por_unidade', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'unidade_id', unidade_id,
            'unidade_nome', unidade_nome,
            'linhas_raw', linhas_raw,
            'presentes', presentes,
            'matriculados', matriculados,
            'realizadas_emusys', realizadas_emusys,
            'faltas', faltas,
            'canceladas', canceladas,
            'sem_aluno_id', sem_aluno_id,
            'sem_lead_id', sem_lead_id
          )
          order by unidade_nome
        )
        from por_unidade
      ),
      '[]'::jsonb
    )
  )
  from total;
$$;
