-- Health Score Professor V3 - hardening das metricas segmentadas, Task 5.
-- Upgrade aditivo para instalacoes locais que tenham executado uma versao
-- intermediaria da 203000. Permanece em sombra e nao materializa snapshots.

-- Hardening de schema da evidencia segmentada.
alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  alter column pessoas_unicas_total type numeric
    using pessoas_unicas_total::numeric,
  add column if not exists pessoas_fechamentos integer,
  add column if not exists meses_com_base integer,
  add column if not exists meses_com_base_consolidado integer,
  add column if not exists meses_no_periodo integer;

alter table public.health_score_professor_v3_snapshot_metrica_diagnosticos
  alter column pessoas_unicas_total type numeric
    using pessoas_unicas_total::numeric;

alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  add constraint health_score_v3_segmento_pessoas_fechamentos_chk
    check (pessoas_fechamentos is null or pessoas_fechamentos >= 0)
    not valid,
  add constraint health_score_v3_segmento_meses_com_base_chk
    check (meses_com_base is null or meses_com_base >= 0)
    not valid,
  add constraint health_score_v3_segmento_meses_consolidado_chk
    check (
      meses_com_base_consolidado is null
      or meses_com_base_consolidado >= 0
    ) not valid,
  add constraint health_score_v3_segmento_meses_periodo_chk
    check (meses_no_periodo is null or meses_no_periodo >= 1)
    not valid,
  add constraint health_score_v3_segmento_atribuicao_pontuavel_chk
    check (
      not coalesce(atribuicao_pontuavel, false)
      or coalesce(atribuicao_formal, false)
    ) not valid,
  add constraint health_score_v3_segmento_atribuicao_formal_chk
    check (
      not coalesce(atribuicao_formal, false)
      or atribuicao_id is not null
    ) not valid;

alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  validate constraint health_score_v3_segmento_pessoas_fechamentos_chk,
  validate constraint health_score_v3_segmento_meses_com_base_chk,
  validate constraint health_score_v3_segmento_meses_consolidado_chk,
  validate constraint health_score_v3_segmento_meses_periodo_chk,
  validate constraint health_score_v3_segmento_atribuicao_pontuavel_chk,
  validate constraint health_score_v3_segmento_atribuicao_formal_chk;

create unique index if not exists
  uq_professor_curso_modalidade_id_escopo
  on public.professor_unidade_curso_modalidade (
    id,
    unidade_id,
    curso_id,
    modalidade
  );

alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  add constraint health_score_v3_segmento_atribuicao_escopo_fk
  foreign key (
    atribuicao_id,
    unidade_id,
    curso_id,
    modalidade
  ) references public.professor_unidade_curso_modalidade (
    id,
    unidade_id,
    curso_id,
    modalidade
  ) on delete restrict
  not valid;

alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  validate constraint health_score_v3_segmento_atribuicao_escopo_fk;

create index if not exists
  idx_health_score_v3_snapshot_segmentos_atribuicao_escopo
  on public.health_score_professor_v3_snapshot_metrica_segmentos (
    atribuicao_id,
    unidade_id,
    curso_id,
    modalidade
  )
  where atribuicao_id is not null;

create index if not exists
  idx_health_score_v3_snapshots_materializacao_revisao
  on public.health_score_professor_v3_snapshots (
    professor_id,
    competencia,
    periodicidade,
    unidade_id,
    revisao desc
  );
-- Fim do hardening de schema da evidencia segmentada.

-- Reforca o isolamento dos objetos internos, inclusive em bancos onde as
-- roles restritas tenham sido criadas depois da migration base.
alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  enable row level security;
alter table public.health_score_professor_v3_snapshot_metrica_diagnosticos
  enable row level security;

revoke all on table
  public.health_score_professor_v3_snapshot_metrica_segmentos
  from public, anon, authenticated, service_role;
grant select on table
  public.health_score_professor_v3_snapshot_metrica_segmentos
  to service_role;

revoke all on table
  public.health_score_professor_v3_snapshot_metrica_diagnosticos
  from public, anon, authenticated, service_role;
grant select on table
  public.health_score_professor_v3_snapshot_metrica_diagnosticos
  to service_role;

do $restricted_role_revokes$
declare
  role_name text;
begin
  foreach role_name in array array[
    'fabio_agent',
    'gabriel_agent',
    'juliana_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all on table public.health_score_professor_v3_snapshot_metrica_segmentos from %I',
        role_name
      );
      execute format(
        'revoke all on table public.health_score_professor_v3_snapshot_metrica_diagnosticos from %I',
        role_name
      );
    end if;
  end loop;
end;
$restricted_role_revokes$;

revoke all on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(date, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(date, uuid, uuid, text)
  to service_role;

revoke all on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(date, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(date, uuid, uuid, text)
  to service_role;

alter function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(date, uuid, uuid, text)
  set search_path = public, pg_temp;
alter function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(date, uuid, uuid, text)
  set search_path = public, pg_temp;
alter function
  public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  set search_path = public, pg_temp;
alter function
  public.materializar_health_score_professor_v3_periodo_impl(date, text, uuid, integer)
  set search_path = public, pg_temp;
alter function
  public.materializar_health_score_professor_v3_periodo(date, text, uuid, integer)
  set search_path = public, pg_temp;

alter view public.vw_health_score_professor_v3_parcial_observado
  set (security_invoker = true);

comment on index public.idx_health_score_v3_snapshots_materializacao_revisao is
  'Suporta a leitura da maior revisao sob o advisory lock do recorte.';
