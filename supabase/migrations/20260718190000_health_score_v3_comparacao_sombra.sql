-- Health Score Professor V3 - Gate 6.
-- Comparador interno e somente leitura entre o KPI canonico V2 e o ultimo
-- snapshot V3 de uma unidade. Nao publica snapshot e nao altera consumidores.

create or replace function public.get_health_score_professor_v3_comparacao_sombra(
  p_competencia date,
  p_unidade_id uuid
)
returns table (
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  metrica text,
  valor_v2 numeric,
  valor_v3 numeric,
  delta numeric,
  nota_v3 numeric,
  meta_v3 numeric,
  peso_v3 numeric,
  amostra_v3 integer,
  cobertura_score_v3 numeric,
  confianca_v3 text,
  estado_base_v3 text,
  fonte_v2 text,
  fonte_v3 text,
  snapshot_estado text,
  snapshot_revisao integer,
  config_versao integer,
  explicacao text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: comparacao interna'
      using errcode = '42501';
  end if;
  if p_competencia is null or p_unidade_id is null then
    raise exception 'HEALTH_SCORE_V3_COMPARACAO_INVALIDA: competencia e unidade obrigatorias';
  end if;

  return query
  with v2 as (
    select k.*
    from public.get_kpis_professor_periodo_canonico_v2(
      extract(year from v_competencia)::integer,
      extract(month from v_competencia)::integer,
      p_unidade_id,
      v_competencia,
      (v_competencia + interval '1 month - 1 day')::date
    ) k
    where k.unidade_id = p_unidade_id
  ), snapshots_mais_recentes as (
    select distinct on (s.professor_id, s.unidade_id)
      s.id,
      s.professor_id,
      s.unidade_id,
      s.competencia,
      s.estado,
      s.revisao,
      s.config_versao,
      s.cobertura
    from public.health_score_professor_v3_snapshots s
    where s.competencia = v_competencia
      and s.unidade_id = p_unidade_id
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
    order by s.professor_id, s.unidade_id, s.revisao desc
  ), v3 as (
    select
      s.professor_id,
      s.unidade_id,
      s.competencia,
      s.estado,
      s.revisao,
      s.config_versao,
      s.cobertura,
      m.metrica,
      m.valor_bruto,
      m.nota,
      m.meta_aplicada,
      m.peso,
      m.amostra,
      m.confianca,
      m.estado_base,
      m.fonte
    from snapshots_mais_recentes s
    join public.health_score_professor_v3_snapshot_metricas m
      on m.snapshot_id = s.id
  ), professores_base as (
    select x.professor_id, max(x.professor_nome) as professor_nome
    from (
      select v.professor_id, v.professor_nome from v2 v
      union all
      select v.professor_id, p.nome from v3 v
      join public.professores p on p.id = v.professor_id
    ) x
    group by x.professor_id
  ), metricas as (
    select unnest(array[
      'retencao',
      'permanencia',
      'conversao',
      'media_turma',
      'numero_alunos',
      'presenca'
    ]::text[]) as metrica
  ), base as (
    select
      p.professor_id,
      p.professor_nome,
      p_unidade_id as unidade_id,
      v_competencia as competencia,
      m.metrica,
      case m.metrica
        when 'retencao' then k.taxa_renovacao
        when 'permanencia' then null::numeric
        when 'conversao' then k.taxa_conversao
        when 'media_turma' then k.media_alunos_turma
        when 'numero_alunos' then k.carteira_alunos::numeric
        when 'presenca' then case when k.presenca_publicavel then k.media_presenca end
      end as valor_v2,
      v.valor_bruto as valor_v3,
      v.nota as nota_v3,
      v.meta_aplicada as meta_v3,
      v.peso as peso_v3,
      v.amostra as amostra_v3,
      v.cobertura as cobertura_score_v3,
      v.confianca as confianca_v3,
      v.estado_base as estado_base_v3,
      case
        when m.metrica = 'permanencia' then 'sem equivalente canonico V2'
        else 'get_kpis_professor_periodo_canonico_v2'
      end as fonte_v2,
      v.fonte as fonte_v3,
      v.estado as snapshot_estado,
      v.revisao as snapshot_revisao,
      v.config_versao,
      case m.metrica
        when 'retencao' then 'V2 usa taxa de renovacao; V3 usa retencao atribuivel. O delta e apenas diagnostico.'
        when 'permanencia' then 'A V2 nao possui permanencia professor-matricula-disciplina; somente a V3 historica e comparavel.'
        when 'conversao' then 'V2 representa o periodo mensal; V3 usa coorte trimestral por experimental confirmada e credito unico.'
        when 'media_turma' then 'V3 deduplica pessoa canonica por turma regular elegivel.'
        when 'numero_alunos' then 'V3 conta pessoa canonica na carteira professor-unidade.'
        when 'presenca' then 'Somente valores publicaveis entram; sem base permanece nulo.'
      end as explicacao
    from professores_base p
    cross join metricas m
    left join v2 k on k.professor_id = p.professor_id
    left join v3 v
      on v.professor_id = p.professor_id
     and v.metrica = m.metrica
  )
  select
    b.professor_id,
    b.professor_nome,
    b.unidade_id,
    b.competencia,
    b.metrica,
    b.valor_v2,
    b.valor_v3,
    case
      when b.valor_v2 is not null and b.valor_v3 is not null
        then round(b.valor_v3 - b.valor_v2, 4)
    end as delta,
    b.nota_v3,
    b.meta_v3,
    b.peso_v3,
    b.amostra_v3,
    b.cobertura_score_v3,
    b.confianca_v3,
    b.estado_base_v3,
    b.fonte_v2,
    b.fonte_v3,
    b.snapshot_estado,
    b.snapshot_revisao,
    b.config_versao,
    b.explicacao
  from base b
  order by b.professor_nome, b.metrica;
end;
$$;

revoke all on function public.get_health_score_professor_v3_comparacao_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_health_score_professor_v3_comparacao_sombra(date, uuid)
  to service_role;

comment on function public.get_health_score_professor_v3_comparacao_sombra(date, uuid) is
  'Gate 6: comparacao interna, somente leitura, entre KPI canonico V2 e snapshot V3 mais recente por professor e unidade.';
