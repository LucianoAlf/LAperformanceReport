-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.maria_lareport_roi_professores_base(
  p_ano integer,
  p_mes integer
)
returns table (
  la_report_professor_id integer,
  la_report_nome text,
  unidade_id uuid,
  unidade text,
  mrr_carteira numeric,
  alunos_ativos integer,
  media_alunos_turma numeric,
  ticket_medio numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with carteira as (
    select
      a.professor_atual_id as professor_id,
      a.unidade_id,
      count(*)::integer as alunos_ativos,
      coalesce(sum(case when coalesce(a.valor_parcela, 0) > 0 then a.valor_parcela else 0 end), 0)::numeric as mrr_carteira,
      case
        when count(*) filter (where coalesce(a.valor_parcela, 0) > 0) > 0
          then (
            sum(case when coalesce(a.valor_parcela, 0) > 0 then a.valor_parcela else 0 end)
            / nullif(count(*) filter (where coalesce(a.valor_parcela, 0) > 0), 0)
          )::numeric
        else 0::numeric
      end as ticket_medio
    from public.alunos a
    left join public.cursos c on c.id = a.curso_id
    where a.professor_atual_id is not null
      and a.unidade_id is not null
      and a.status::text in ('ativo', 'trancado')
      and coalesce(c.is_projeto_banda, false) = false
    group by a.professor_atual_id, a.unidade_id
  ),
  turmas_calc as (
    select
      vt.professor_id,
      vt.unidade_id,
      round(avg(vt.total_alunos), 2)::numeric as media_alunos_turma
    from public.vw_turmas_implicitas vt
    group by vt.professor_id, vt.unidade_id
  )
  select
    p.id::integer as la_report_professor_id,
    p.nome::text as la_report_nome,
    c.unidade_id,
    u.nome::text as unidade,
    round(coalesce(c.mrr_carteira, 0), 2)::numeric as mrr_carteira,
    coalesce(c.alunos_ativos, 0)::integer as alunos_ativos,
    round(coalesce(t.media_alunos_turma, 0), 2)::numeric as media_alunos_turma,
    round(coalesce(c.ticket_medio, 0), 2)::numeric as ticket_medio
  from carteira c
  join public.professores p on p.id = c.professor_id
  left join public.unidades u on u.id = c.unidade_id
  left join turmas_calc t on t.professor_id = c.professor_id and t.unidade_id = c.unidade_id
  where p.ativo = true
  order by u.nome, p.nome;
$$;

comment on function public.maria_lareport_roi_professores_base(integer, integer)
is 'Maria ROI professores: base sanitizada do LA Report por professor+unidade. Retorna somente métricas agregadas sem PII. p_ano/p_mes reservados para contrato mensal; versão atual usa carteira operacional vigente.';

revoke all on function public.maria_lareport_roi_professores_base(integer, integer) from public;
revoke execute on function public.maria_lareport_roi_professores_base(integer, integer) from anon;
revoke execute on function public.maria_lareport_roi_professores_base(integer, integer) from authenticated;

grant execute on function public.maria_lareport_roi_professores_base(integer, integer) to maria_lareport_rpc;
