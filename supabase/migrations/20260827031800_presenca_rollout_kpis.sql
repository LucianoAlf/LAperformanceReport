-- Cutover reversível dos consumidores numéricos que já existiam antes da v2.

do $clonar_kpis_canonicos$
declare
  v_def text;
begin
  select pg_get_functiondef('public.get_faltas_periodo_v2(uuid,date,date)'::regprocedure)
    into v_def;
  v_def := regexp_replace(
    v_def,
    'FUNCTION public\.get_faltas_periodo_v2\(',
    'FUNCTION public.get_faltas_periodo_canonico_v2(',
    'i'
  );
  execute v_def;

  execute 'create view public.vw_absenteismo_aluno_canonica_v2 '
    || 'with (security_invoker = true) as '
    || pg_get_viewdef('public.vw_absenteismo_aluno'::regclass, true);
  execute 'create view public.vw_radar_aluno_sinais_canonica_v2 '
    || 'with (security_invoker = true) as '
    || pg_get_viewdef('public.vw_radar_aluno_sinais'::regclass, true);
end
$clonar_kpis_canonicos$;

revoke all on function public.get_faltas_periodo_canonico_v2(uuid, date, date)
  from public, anon, authenticated, service_role;
revoke all on public.vw_absenteismo_aluno_canonica_v2
  from public, anon, authenticated, service_role;
revoke all on public.vw_radar_aluno_sinais_canonica_v2
  from public, anon, authenticated, service_role;

create or replace function public.get_faltas_periodo_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  aluno_id integer,
  nome text,
  unidade_id uuid,
  unidade_codigo text,
  curso_nome text,
  professor_nome text,
  telefone text,
  whatsapp text,
  responsavel_telefone text,
  denominador bigint,
  presentes bigint,
  faltas bigint,
  faltas_justificadas bigint,
  faltas_total bigint,
  percentual_presenca numeric,
  is_projeto_banda boolean,
  dados_status text,
  estado_publicacao text,
  sincronizado_em timestamptz,
  regra_versao text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_modo text;
begin
  if p_unidade_id is not null then
    v_modo := public.fn_presenca_rollout_modo_interno_v1(p_unidade_id, 'kpis');
    if v_modo = 'canonico_v2' then
      return query select *
      from public.get_faltas_periodo_canonico_v2(
        p_unidade_id, p_data_inicio, p_data_fim
      );
      return;
    end if;
    if v_modo = 'sombra' then
      begin
        perform * from public.get_faltas_periodo_canonico_v2(
          p_unidade_id, p_data_inicio, p_data_fim
        );
      exception when others then
        null;
      end;
    end if;
    return query
    select
      l.aluno_id, l.nome, l.unidade_id, l.unidade_codigo, l.curso_nome,
      l.professor_nome, l.telefone, l.whatsapp, l.responsavel_telefone,
      l.total_aulas, l.presencas, l.faltas, 0::bigint,
      l.faltas, l.pct_presenca, l.is_projeto_banda,
      'legado'::text, 'publicavel'::text, null::timestamptz,
      'presenca-legado-v1'::text
    from public.get_faltas_periodo_legado_v1(
      p_unidade_id, p_data_inicio, p_data_fim
    ) l;
    return;
  end if;

  -- Consolidado pode ter ondas diferentes por unidade. Cada linha escolhe a
  -- configuração de sua unidade sem publicar a v2 das demais.
  return query
  select c.*
  from public.get_faltas_periodo_canonico_v2(null, p_data_inicio, p_data_fim) c
  where public.fn_presenca_rollout_modo_interno_v1(c.unidade_id, 'kpis') = 'canonico_v2'
  union all
  select
    l.aluno_id, l.nome, l.unidade_id, l.unidade_codigo, l.curso_nome,
    l.professor_nome, l.telefone, l.whatsapp, l.responsavel_telefone,
    l.total_aulas, l.presencas, l.faltas, 0::bigint,
    l.faltas, l.pct_presenca, l.is_projeto_banda,
    'legado'::text, 'publicavel'::text, null::timestamptz,
    'presenca-legado-v1'::text
  from public.get_faltas_periodo_legado_v1(null, p_data_inicio, p_data_fim) l
  where public.fn_presenca_rollout_modo_interno_v1(l.unidade_id, 'kpis') <> 'canonico_v2';
end;
$$;

revoke all on function public.get_faltas_periodo_v2(uuid, date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_faltas_periodo_v2(uuid, date, date)
  to authenticated, service_role;

create or replace view public.vw_absenteismo_aluno
with (security_invoker = true) as
select c.*
from public.vw_absenteismo_aluno_canonica_v2 c
join public.alunos a on a.id = c.aluno_id
where public.fn_presenca_rollout_modo_interno_v1(a.unidade_id, 'kpis') = 'canonico_v2'
union all
select
  l.aluno_id,
  l.total_aulas,
  l.faltas,
  l.taxa_historica,
  l.taxa_recente_30d,
  l.tendencia,
  l.ultima_presenca,
  l.dias_sem_presenca,
  l.confiavel,
  case when l.total_aulas is not null and l.faltas is not null
    then l.total_aulas - l.faltas else null end::bigint as presentes,
  l.faltas::bigint as faltas_nao_justificadas,
  0::bigint as faltas_justificadas,
  null::bigint as denominador_30d,
  null::bigint as presentes_30d,
  null::bigint as faltas_nao_justificadas_30d,
  null::bigint as faltas_justificadas_30d,
  'legado'::text as dados_status,
  'publicavel'::text as estado_publicacao,
  null::timestamptz as sincronizado_em,
  'presenca-legado-v1'::text as regra_versao
from public.vw_absenteismo_aluno_legado_v1 l
join public.alunos a on a.id = l.aluno_id
where public.fn_presenca_rollout_modo_interno_v1(a.unidade_id, 'kpis') <> 'canonico_v2';

revoke all on public.vw_absenteismo_aluno from public, anon;
grant select on public.vw_absenteismo_aluno to authenticated, service_role;

create or replace view public.vw_radar_aluno_sinais
with (security_invoker = true) as
select c.*
from public.vw_radar_aluno_sinais_canonica_v2 c
where public.fn_presenca_rollout_modo_interno_v1(c.unidade_id, 'kpis') = 'canonico_v2'
union all
select
  l.*,
  0::bigint as faltas_justificadas_mes,
  'legado'::text as dados_status,
  'publicavel'::text as estado_publicacao,
  null::timestamptz as sincronizado_em,
  'presenca-legado-v1'::text as regra_versao
from public.vw_radar_aluno_sinais_legado_v1 l
where public.fn_presenca_rollout_modo_interno_v1(l.unidade_id, 'kpis') <> 'canonico_v2';

revoke all on public.vw_radar_aluno_sinais from public, anon;
grant select on public.vw_radar_aluno_sinais to authenticated, service_role;

-- As views externas são security_invoker. O acesso às cópias privadas passa
-- por funções governadas, para não exigir SELECT direto que contornaria a flag.
create or replace function public.fn_absenteismo_aluno_rollout_v1()
returns setof public.vw_absenteismo_aluno_canonica_v2
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.*
  from public.vw_absenteismo_aluno_canonica_v2 c
  join public.alunos a on a.id = c.aluno_id
  where public.fn_presenca_rollout_modo_interno_v1(a.unidade_id, 'kpis') = 'canonico_v2'
    and (
      current_setting('request.jwt.claim.role', true) = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        current_setting('request.jwt.claim.role', true) = 'authenticated'
        and ((select public.is_admin()) or a.unidade_id in (select public.get_user_unidade_ids()))
      )
    )
  union all
  select
    l.aluno_id,
    l.total_aulas,
    l.faltas,
    l.taxa_historica,
    l.taxa_recente_30d,
    l.tendencia,
    l.ultima_presenca,
    l.dias_sem_presenca,
    l.confiavel,
    case when l.total_aulas is not null and l.faltas is not null
      then l.total_aulas - l.faltas else null end::bigint,
    l.faltas::bigint,
    0::bigint,
    null::bigint,
    null::bigint,
    null::bigint,
    null::bigint,
    'legado'::text,
    'publicavel'::text,
    null::timestamptz,
    'presenca-legado-v1'::text
  from public.vw_absenteismo_aluno_legado_v1 l
  join public.alunos a on a.id = l.aluno_id
  where public.fn_presenca_rollout_modo_interno_v1(a.unidade_id, 'kpis') <> 'canonico_v2'
    and (
      current_setting('request.jwt.claim.role', true) = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        current_setting('request.jwt.claim.role', true) = 'authenticated'
        and ((select public.is_admin()) or a.unidade_id in (select public.get_user_unidade_ids()))
      )
    );
$$;

create or replace function public.fn_radar_aluno_sinais_rollout_v1()
returns setof public.vw_radar_aluno_sinais_canonica_v2
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.*
  from public.vw_radar_aluno_sinais_canonica_v2 c
  where public.fn_presenca_rollout_modo_interno_v1(c.unidade_id, 'kpis') = 'canonico_v2'
    and (
      current_setting('request.jwt.claim.role', true) = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        current_setting('request.jwt.claim.role', true) = 'authenticated'
        and ((select public.is_admin()) or c.unidade_id in (select public.get_user_unidade_ids()))
      )
    )
  union all
  select
    l.*,
    0::bigint,
    'legado'::text,
    'publicavel'::text,
    null::timestamptz,
    'presenca-legado-v1'::text
  from public.vw_radar_aluno_sinais_legado_v1 l
  where public.fn_presenca_rollout_modo_interno_v1(l.unidade_id, 'kpis') <> 'canonico_v2'
    and (
      current_setting('request.jwt.claim.role', true) = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        current_setting('request.jwt.claim.role', true) = 'authenticated'
        and ((select public.is_admin()) or l.unidade_id in (select public.get_user_unidade_ids()))
      )
    );
$$;

revoke all on function public.fn_absenteismo_aluno_rollout_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_radar_aluno_sinais_rollout_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.fn_absenteismo_aluno_rollout_v1()
  to authenticated, service_role;
grant execute on function public.fn_radar_aluno_sinais_rollout_v1()
  to authenticated, service_role;

create or replace view public.vw_absenteismo_aluno
with (security_invoker = true) as
select * from public.fn_absenteismo_aluno_rollout_v1();

create or replace view public.vw_radar_aluno_sinais
with (security_invoker = true) as
select * from public.fn_radar_aluno_sinais_rollout_v1();

revoke all on public.vw_absenteismo_aluno from public, anon;
grant select on public.vw_absenteismo_aluno to authenticated, service_role;
revoke all on public.vw_radar_aluno_sinais from public, anon;
grant select on public.vw_radar_aluno_sinais to authenticated, service_role;

comment on function public.get_faltas_periodo_v2(uuid, date, date) is
  'Ranking governado por kpis: sombra calcula v2 e entrega o legado adaptado; canonico_v2 publica a ocorrência v2.';
