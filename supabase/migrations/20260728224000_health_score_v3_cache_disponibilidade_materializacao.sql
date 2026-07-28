begin;

do $$
declare
  v_funcao oid :=
    'public.get_health_score_professor_v3_numero_alunos_disponibilidade(date,uuid,text)'::regprocedure::oid;
  v_dependencias integer;
begin
  select count(*)::integer
  into v_dependencias
  from (
    select d.objid
    from pg_depend d
    join pg_constraint c
      on c.oid = d.objid
     and d.classid = 'pg_constraint'::regclass
    where d.refobjid = v_funcao
      and c.contype = 'c'

    union all

    select d.objid
    from pg_depend d
    join pg_trigger t
      on t.oid = d.objid
     and d.classid = 'pg_trigger'::regclass
    where d.refobjid = v_funcao
      and not t.tgisinternal

    union all

    select d.objid
    from pg_depend d
    join pg_attrdef a
      on a.oid = d.objid
     and d.classid = 'pg_attrdef'::regclass
    where d.refobjid = v_funcao
  ) dependencias;

  if v_dependencias > 0 then
    raise exception
      'HEALTH_SCORE_V3_DEPENDENCIA_RUNTIME: funcao usada em CHECK, trigger ou default';
  end if;
end;
$$;

alter function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade(
    date, uuid, text
  )
  rename to
    get_health_score_professor_v3_numero_alunos_disponibilidade_raw_20260728;

revoke all on function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade_raw_20260728(
    date, uuid, text
  )
  from public, anon, authenticated;
grant execute on function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade_raw_20260728(
    date, uuid, text
  )
  to service_role;

create or replace function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade(
    p_competencia date,
    p_unidade_id uuid default null,
    p_periodicidade text default 'mensal'
  )
returns table (
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
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: leitura interna'
      using errcode = '42501';
  end if;

  if to_regclass('pg_temp.health_score_v3_numero_alunos_cache') is null then
    create temporary table pg_temp.health_score_v3_numero_alunos_cache (
      cache_competencia date not null,
      cache_unidade_id uuid,
      cache_periodicidade text not null,
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
    ) on commit drop;

    create index on pg_temp.health_score_v3_numero_alunos_cache (
      cache_competencia,
      cache_periodicidade,
      cache_unidade_id,
      professor_id
    );
  end if;

  if not exists (
    select 1
    from pg_temp.health_score_v3_numero_alunos_cache c
    where c.cache_competencia = v_competencia
      and c.cache_unidade_id is not distinct from p_unidade_id
      and c.cache_periodicidade = p_periodicidade
  ) then
    insert into pg_temp.health_score_v3_numero_alunos_cache (
      cache_competencia,
      cache_unidade_id,
      cache_periodicidade,
      metrica,
      professor_id,
      professor_nome,
      unidade_id,
      competencia,
      valor_bruto,
      numerador,
      denominador,
      amostra,
      estado_base,
      publicavel,
      confianca,
      fonte,
      regra_versao,
      motivo_sem_base,
      detalhes
    )
    select
      v_competencia,
      p_unidade_id,
      p_periodicidade,
      r.metrica,
      r.professor_id,
      r.professor_nome,
      r.unidade_id,
      r.competencia,
      r.valor_bruto,
      r.numerador,
      r.denominador,
      r.amostra,
      r.estado_base,
      r.publicavel,
      r.confianca,
      r.fonte,
      r.regra_versao,
      r.motivo_sem_base,
      r.detalhes
    from
      public.get_health_score_professor_v3_numero_alunos_disponibilidade_raw_20260728(
        p_competencia,
        p_unidade_id,
        p_periodicidade
      ) r;
  end if;

  return query
  select
    c.metrica,
    c.professor_id,
    c.professor_nome,
    c.unidade_id,
    c.competencia,
    c.valor_bruto,
    c.numerador,
    c.denominador,
    c.amostra,
    c.estado_base,
    c.publicavel,
    c.confianca,
    c.fonte,
    c.regra_versao,
    c.motivo_sem_base,
    c.detalhes
  from pg_temp.health_score_v3_numero_alunos_cache c
  where c.cache_competencia = v_competencia
    and c.cache_unidade_id is not distinct from p_unidade_id
    and c.cache_periodicidade = p_periodicidade;
end;
$$;

revoke all on function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade(
    date, uuid, text
  )
  from public, anon, authenticated;
grant execute on function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade(
    date, uuid, text
  )
  to service_role;

comment on function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade(
    date, uuid, text
  ) is
  'Cache transacional da carteira por disponibilidade; calcula uma vez por competencia, escopo e periodicidade durante a materializacao.';

comment on function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade_raw_20260728(
    date, uuid, text
  ) is
  'Implementacao canonica sem cache preservada para rollback do materializador V3.';

commit;
