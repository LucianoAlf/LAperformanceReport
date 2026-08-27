-- Checkpoint 8.1/8.2: contrato numerico de presenca.
--
-- A fonte e exclusivamente a ocorrencia canonica v2. O contrato separa falta
-- de falta justificada, carrega frescor e falha fechado: dado incompleto nunca
-- e convertido em zero. Esta migration nao reprocessa dados nem snapshots.

-- Preserva os três consumidores vivos antes de publicar suas versões v2. As
-- cópias não recebem ACL pública e serão usadas apenas pelos adapters de
-- rollout criados depois da configuração por superfície.
do $preserva_kpis_legados$
declare
  v_def text;
begin
  if to_regprocedure('public.get_faltas_periodo(uuid,date,date)') is not null then
    select pg_get_functiondef('public.get_faltas_periodo(uuid,date,date)'::regprocedure)
      into v_def;
    v_def := regexp_replace(
      v_def,
      'FUNCTION public\.get_faltas_periodo\(',
      'FUNCTION public.get_faltas_periodo_legado_v1(',
      'i'
    );
    execute v_def;
    revoke all on function public.get_faltas_periodo_legado_v1(uuid, date, date)
      from public, anon, authenticated, service_role;
  end if;

  if to_regclass('public.vw_absenteismo_aluno') is not null then
    execute 'create view public.vw_absenteismo_aluno_legado_v1 '
      || 'with (security_invoker = true) as '
      || pg_get_viewdef('public.vw_absenteismo_aluno'::regclass, true);
    revoke all on public.vw_absenteismo_aluno_legado_v1
      from public, anon, authenticated, service_role;
  end if;

  if to_regclass('public.vw_radar_aluno_sinais') is not null then
    execute 'create view public.vw_radar_aluno_sinais_legado_v1 '
      || 'with (security_invoker = true) as '
      || pg_get_viewdef('public.vw_radar_aluno_sinais'::regclass, true);
    revoke all on public.vw_radar_aluno_sinais_legado_v1
      from public, anon, authenticated, service_role;
  end if;
end
$preserva_kpis_legados$;

-- BEGIN PRESENCA KPI V2 KERNEL

create or replace view public.vw_presenca_ocorrencia_metrica_v2
with (security_barrier = true) as
select
  o.slot_key,
  o.aluno_id,
  o.unidade_id,
  o.professor_id,
  o.data_aula,
  o.data_hora_inicio,
  o.data_hora_fim,
  o.curso_nome,
  o.resultado_canonico,
  o.fecha_chamada,
  o.fonte_decisao,
  o.decidido_em,
  o.possui_conflito,
  o.ids_aulas_emusys,
  o.regra_versao as ocorrencia_regra_versao,
  (
    o.resultado_canonico in ('presente', 'falta', 'falta_justificada')
  ) as considera_frequencia_denominador,
  (o.resultado_canonico = 'presente') as considera_presenca,
  (o.resultado_canonico = 'falta') as considera_falta,
  (o.resultado_canonico = 'falta_justificada')
    as considera_falta_justificada,
  (
    o.resultado_canonico = 'indeterminado'
    or o.possui_conflito
  ) as ocorrencia_incompleta
from public.vw_presenca_ocorrencia_canonica_v2 o;

revoke all on public.vw_presenca_ocorrencia_metrica_v2
  from public, anon, authenticated;
grant select on public.vw_presenca_ocorrencia_metrica_v2 to service_role;

comment on view public.vw_presenca_ocorrencia_metrica_v2 is
  'Kernel metrico service-only. SECURITY INVOKER exigiria abrir a ocorrencia nominal subjacente aos consumidores autenticados; o acesso externo ocorre pelas RPCs com ACL de unidade.';

create or replace function public.fn_presenca_estado_publicacao_periodo_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with dias_operacionais as (
    select distinct ae.data_aula
    from public.aulas_emusys ae
    where ae.unidade_id = p_unidade_id
      and ae.data_aula between p_data_inicio and p_data_fim
      and ae.data_hora_fim < clock_timestamp()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and not coalesce(ae.cancelada, false)
      and ae.professor_id is not null
  ), pendencias_por_dia as (
    select
      d.data_aula,
      public.fn_presenca_pendencias_do_dia_v2(
        p_unidade_id,
        d.data_aula
      ) as estado
    from dias_operacionais d
  ), resumo as (
    select
      count(*)::integer as dias_operacionais,
      count(*) filter (
        where p.estado ->> 'dados_status' = 'atualizados'
          and jsonb_array_length(
            coalesce(p.estado -> 'pendencias', '[]'::jsonb)
          ) = 0
          and jsonb_array_length(
            coalesce(p.estado -> 'conflitos', '[]'::jsonb)
          ) = 0
      )::integer as dias_publicaveis,
      count(*) filter (
        where p.estado ->> 'dados_status' = 'dados_desatualizados'
      )::integer as dias_desatualizados,
      count(*) filter (
        where p.estado ->> 'dados_status' = 'roster_em_revisao'
          or jsonb_array_length(
            coalesce(p.estado -> 'revisoes_estruturais', '[]'::jsonb)
          ) > 0
      )::integer as dias_roster_em_revisao,
      count(*) filter (
        where jsonb_array_length(
          coalesce(p.estado -> 'pendencias', '[]'::jsonb)
        ) > 0
      )::integer as dias_com_pendencias,
      count(*) filter (
        where jsonb_array_length(
          coalesce(p.estado -> 'conflitos', '[]'::jsonb)
        ) > 0
      )::integer as dias_com_conflitos,
      max(nullif(p.estado ->> 'sincronizado_em', '')::timestamptz)
        as sincronizado_em
    from pendencias_por_dia p
  )
  select jsonb_build_object(
    'dados_status', case
      when r.dias_operacionais = 0 then 'sem_base'
      when r.dias_roster_em_revisao > 0 then 'roster_em_revisao'
      when r.dias_desatualizados > 0 then 'dados_desatualizados'
      when r.dias_com_pendencias > 0 or r.dias_com_conflitos > 0
        then 'em_auditoria'
      when r.dias_publicaveis = r.dias_operacionais then 'atualizados'
      else 'em_auditoria'
    end,
    'estado_publicacao', case
      when r.dias_operacionais = 0 then 'sem_base'
      when r.dias_roster_em_revisao > 0 then 'bloqueado_roster'
      when r.dias_desatualizados > 0 then 'bloqueado_frescor'
      when r.dias_com_pendencias > 0 or r.dias_com_conflitos > 0
        then 'em_auditoria'
      when r.dias_publicaveis = r.dias_operacionais then 'publicavel'
      else 'em_auditoria'
    end,
    'publicavel',
      r.dias_operacionais > 0
      and r.dias_roster_em_revisao = 0
      and r.dias_desatualizados = 0
      and r.dias_com_pendencias = 0
      and r.dias_com_conflitos = 0
      and r.dias_publicaveis = r.dias_operacionais,
    'dias_operacionais', r.dias_operacionais,
    'dias_publicaveis', r.dias_publicaveis,
    'dias_desatualizados', r.dias_desatualizados,
    'dias_roster_em_revisao', r.dias_roster_em_revisao,
    'dias_com_pendencias', r.dias_com_pendencias,
    'dias_com_conflitos', r.dias_com_conflitos,
    'sincronizado_em', r.sincronizado_em,
    'regra_versao', 'presenca-publicacao-periodo-v2.2'
  )
  from resumo r;
$$;

revoke all on function public.fn_presenca_estado_publicacao_periodo_v2(
  uuid, date, date
) from public, anon, authenticated, service_role;
grant execute on function public.fn_presenca_estado_publicacao_periodo_v2(
  uuid, date, date
) to authenticated, service_role;

create or replace function public.get_presenca_metricas_canonicas_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_professor_id integer default null,
  p_aluno_id integer default null
)
returns table (
  unidade_id uuid,
  professor_id integer,
  aluno_id integer,
  periodo_inicio date,
  periodo_fim date,
  ocorrencias_observadas bigint,
  denominador_observado bigint,
  presentes_observados bigint,
  faltas_observadas bigint,
  faltas_justificadas_observadas bigint,
  eventos_excluidos_observados bigint,
  ocorrencias_incompletas bigint,
  conflitos bigint,
  denominador bigint,
  presentes bigint,
  faltas bigint,
  faltas_justificadas bigint,
  faltas_total bigint,
  percentual_presenca numeric,
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
begin
  if p_unidade_id is null
     or p_data_inicio is null
     or p_data_fim is null
     or p_data_inicio > p_data_fim then
    raise exception using
      errcode = '22023',
      message = 'PRESENCA_METRICA_PERIODO_INVALIDO';
  end if;

  return query
  with observada as (
    select
      o.unidade_id,
      o.professor_id,
      o.aluno_id,
      count(*)::bigint as ocorrencias_observadas,
      count(*) filter (
        where o.considera_frequencia_denominador
      )::bigint as denominador_observado,
      count(*) filter (
        where o.considera_presenca
      )::bigint as presentes_observados,
      count(*) filter (
        where o.considera_falta
      )::bigint as faltas_observadas,
      count(*) filter (
        where o.considera_falta_justificada
      )::bigint as faltas_justificadas_observadas,
      count(*) filter (
        where o.resultado_canonico in ('aula_cancelada', 'aula_justificada')
      )::bigint as eventos_excluidos_observados,
      count(*) filter (
        where o.ocorrencia_incompleta
      )::bigint as ocorrencias_incompletas,
      count(*) filter (
        where o.possui_conflito
      )::bigint as conflitos
    from public.vw_presenca_ocorrencia_metrica_v2 o
    where o.unidade_id = p_unidade_id
      and o.data_aula between p_data_inicio and p_data_fim
      and (p_professor_id is null or o.professor_id = p_professor_id)
      and (p_aluno_id is null or o.aluno_id = p_aluno_id)
    group by o.unidade_id, o.professor_id, o.aluno_id
  ), alvo_deterministico as (
    select o.*
    from observada o

    union all

    select
      p_unidade_id::uuid as unidade_id,
      p_professor_id::integer as professor_id,
      p_aluno_id::integer as aluno_id,
      0::bigint as ocorrencias_observadas,
      0::bigint as denominador_observado,
      0::bigint as presentes_observados,
      0::bigint as faltas_observadas,
      0::bigint as faltas_justificadas_observadas,
      0::bigint as eventos_excluidos_observados,
      0::bigint as ocorrencias_incompletas,
      0::bigint as conflitos
    where not exists (select 1 from observada)
  ), com_frescor as (
    select
      o.*,
      public.fn_presenca_estado_publicacao_periodo_v2(
        o.unidade_id,
        p_data_inicio,
        p_data_fim
      ) as frescor
    from alvo_deterministico o
  ), classificada as (
    select
      f.*,
      case
        when f.frescor ->> 'estado_publicacao' = 'sem_base'
          then 'sem_base'
        when f.frescor ->> 'estado_publicacao' = 'bloqueado_roster'
          then 'bloqueado_roster'
        when f.frescor ->> 'estado_publicacao' = 'bloqueado_frescor'
          then 'bloqueado_frescor'
        when f.frescor ->> 'estado_publicacao' = 'em_auditoria'
          then 'em_auditoria'
        when f.ocorrencias_incompletas > 0 or f.conflitos > 0
          then 'em_auditoria'
        when f.denominador_observado = 0 then 'sem_base'
        else 'publicavel'
      end as estado_publicacao_calculado,
      case
        when f.frescor ->> 'estado_publicacao' = 'sem_base'
          then 'sem_base'
        when f.frescor ->> 'estado_publicacao' = 'bloqueado_roster'
          then 'roster_em_revisao'
        when f.frescor ->> 'estado_publicacao' = 'bloqueado_frescor'
          then 'dados_desatualizados'
        when f.frescor ->> 'estado_publicacao' = 'em_auditoria'
          then 'em_auditoria'
        when f.ocorrencias_incompletas > 0 or f.conflitos > 0
          then 'em_auditoria'
        when f.denominador_observado = 0 then 'sem_base'
        else 'atualizados'
      end as dados_status_calculado
    from com_frescor f
  )
  select
    c.unidade_id,
    c.professor_id,
    c.aluno_id,
    p_data_inicio,
    p_data_fim,
    c.ocorrencias_observadas,
    c.denominador_observado,
    c.presentes_observados,
    c.faltas_observadas,
    c.faltas_justificadas_observadas,
    c.eventos_excluidos_observados,
    c.ocorrencias_incompletas,
    c.conflitos,
    case when c.estado_publicacao_calculado = 'publicavel' then c.denominador_observado else null end,
    case when c.estado_publicacao_calculado = 'publicavel' then c.presentes_observados else null end,
    case when c.estado_publicacao_calculado = 'publicavel' then c.faltas_observadas else null end,
    case when c.estado_publicacao_calculado = 'publicavel' then c.faltas_justificadas_observadas else null end,
    case when c.estado_publicacao_calculado = 'publicavel' then c.faltas_observadas + c.faltas_justificadas_observadas else null end,
    case
      when c.estado_publicacao_calculado = 'publicavel'
        then round(
          c.presentes_observados::numeric
            / nullif(c.denominador_observado, 0) * 100,
          2
        )
      else null
    end,
    c.dados_status_calculado,
    c.estado_publicacao_calculado,
    nullif(c.frescor ->> 'sincronizado_em', '')::timestamptz,
    'presenca-metricas-canonicas-v2.2'::text
  from classificada c
  order by c.professor_id, c.aluno_id;
end;
$$;

revoke all on function public.get_presenca_metricas_canonicas_v2(
  uuid, date, date, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_presenca_metricas_canonicas_v2(
  uuid, date, date, integer, integer
) to service_role;

-- END PRESENCA KPI V2 KERNEL

-- Frequencia por pessoa/unidade. A identidade de pessoa continua sendo usada
-- somente para consolidacao de leitura; a ocorrencia permanece no grao v2.
create or replace view public.vw_aluno_frequencia_canonica_v1
with (security_invoker = true) as
with mapa_identidade as materialized (
  select
    i.unidade_id,
    i.pessoa_chave,
    i.aluno_id_canonico,
    i.aluno_ids_locais,
    i.identidade_fonte,
    i.identidade_confianca,
    local.aluno_local_id
  from public.vw_aluno_identidade_unidade_canonica i
  cross join lateral unnest(i.aluno_ids_locais) local(aluno_local_id)
), linhas as materialized (
  select
    i.unidade_id,
    i.pessoa_chave,
    i.aluno_id_canonico,
    i.aluno_ids_locais,
    i.identidade_fonte,
    i.identidade_confianca,
    o.slot_key,
    o.data_aula,
    o.data_hora_inicio,
    o.data_hora_fim,
    o.professor_id,
    o.curso_nome,
    o.resultado_canonico,
    o.considera_frequencia_denominador,
    o.considera_presenca,
    o.considera_falta,
    o.considera_falta_justificada,
    o.ocorrencia_incompleta,
    o.possui_conflito,
    md5(jsonb_build_array(
      i.unidade_id::text,
      i.pessoa_chave,
      o.professor_id,
      extract(epoch from o.data_hora_inicio)::numeric,
      extract(epoch from o.data_hora_fim)::numeric,
      lower(btrim(o.curso_nome))
    )::text) as evento_chave
  from public.vw_presenca_ocorrencia_metrica_v2 o
  join mapa_identidade i
    on i.unidade_id = o.unidade_id
   and i.aluno_local_id = o.aluno_id
  where o.data_aula <= current_date
), eventos as (
  select
    l.unidade_id,
    l.pessoa_chave,
    l.aluno_id_canonico,
    l.aluno_ids_locais,
    l.identidade_fonte,
    l.identidade_confianca,
    l.evento_chave,
    min(l.data_aula) as data_aula,
    bool_or(l.considera_frequencia_denominador) as confirmado,
    bool_or(l.considera_presenca) as presente,
    bool_or(l.considera_falta) as falta,
    bool_or(l.considera_falta_justificada) as falta_justificada,
    bool_or(l.resultado_canonico = 'aula_cancelada') as cancelada,
    bool_or(l.resultado_canonico = 'aula_justificada') as aula_justificada,
    bool_or(l.ocorrencia_incompleta) as incompleta,
    bool_or(l.possui_conflito) as conflito
  from linhas l
  group by
    l.unidade_id, l.pessoa_chave, l.aluno_id_canonico,
    l.aluno_ids_locais, l.identidade_fonte, l.identidade_confianca,
    l.evento_chave
), agregada as (
  select
    e.unidade_id,
    e.pessoa_chave,
    e.aluno_id_canonico,
    e.aluno_ids_locais,
    e.identidade_fonte,
    e.identidade_confianca,
    count(*)::integer as total_eventos_evidencia,
    count(*) filter (where e.confirmado)::integer
      as eventos_resultado_confirmado,
    count(*) filter (where e.presente)::integer as presencas_confirmadas,
    count(*) filter (where e.falta or e.falta_justificada)::integer
      as faltas_confirmadas,
    0::integer as faltas_provaveis,
    count(*) filter (where e.incompleta)::integer as chamadas_indeterminadas,
    count(*) filter (where e.cancelada or e.aula_justificada)::integer
      as eventos_excluidos,
    count(*) filter (where e.conflito)::integer as conflitos,
    max(e.data_aula) filter (where e.confirmado) as data_ultima_aula_confirmada,
    count(*) filter (
      where e.data_aula >= current_date - 60 and e.confirmado
    )::integer as eventos_confirmados_60d,
    count(*) filter (
      where e.data_aula >= current_date - 60 and e.presente
    )::integer as presencas_confirmadas_60d,
    count(*) filter (
      where e.data_aula >= current_date - 30 and e.confirmado
    )::integer as eventos_confirmados_30d,
    count(*) filter (
      where e.data_aula >= current_date - 30 and e.presente
    )::integer as presencas_confirmadas_30d,
    count(*) filter (
      where e.data_aula >= current_date - 60 and e.incompleta
    )::integer as eventos_incertos_60d,
    count(*) filter (
      where e.data_aula >= current_date - 30 and e.incompleta
    )::integer as eventos_incertos_30d,
    count(*) filter (where e.falta_justificada)::integer
      as faltas_justificadas
  from eventos e
  group by
    e.unidade_id, e.pessoa_chave, e.aluno_id_canonico,
    e.aluno_ids_locais, e.identidade_fonte, e.identidade_confianca
), publicada as (
  select
    a.*,
    public.fn_presenca_estado_publicacao_periodo_v2(
      a.unidade_id,
      greatest(current_date - 60, date '2026-08-01'),
      current_date
    ) as frescor
  from agregada a
)
select
  a.unidade_id,
  a.pessoa_chave,
  a.aluno_id_canonico,
  a.aluno_ids_locais,
  a.identidade_fonte,
  a.identidade_confianca,
  a.total_eventos_evidencia,
  a.eventos_resultado_confirmado,
  a.presencas_confirmadas,
  a.faltas_confirmadas,
  a.faltas_provaveis,
  a.chamadas_indeterminadas,
  a.eventos_excluidos,
  a.conflitos,
  a.data_ultima_aula_confirmada,
  a.eventos_confirmados_60d,
  a.presencas_confirmadas_60d,
  a.eventos_confirmados_30d,
  a.presencas_confirmadas_30d,
  a.eventos_incertos_60d,
  a.eventos_incertos_30d,
  case
    when a.frescor ->> 'estado_publicacao' = 'publicavel'
      and a.eventos_resultado_confirmado > 0
      then round(a.presencas_confirmadas::numeric
        / a.eventos_resultado_confirmado, 6)
    else null
  end as taxa_presenca_geral,
  case
    when a.frescor ->> 'estado_publicacao' = 'publicavel'
      and a.eventos_confirmados_60d > 0
      then round(a.presencas_confirmadas_60d::numeric
        / a.eventos_confirmados_60d, 6)
    else null
  end as taxa_presenca_60d,
  case
    when a.frescor ->> 'estado_publicacao' = 'publicavel'
      and a.eventos_confirmados_30d > 0
      then round(a.presencas_confirmadas_30d::numeric
        / a.eventos_confirmados_30d, 6)
    else null
  end as taxa_presenca_30d,
  case
    when a.eventos_resultado_confirmado + a.chamadas_indeterminadas > 0
      then round(a.eventos_resultado_confirmado::numeric
        / (a.eventos_resultado_confirmado + a.chamadas_indeterminadas), 6)
    else null
  end as cobertura_resultado_confirmado,
  case
    when a.frescor ->> 'estado_publicacao' <> 'publicavel'
      then a.frescor ->> 'dados_status'
    when a.identidade_confianca = 'baixa' or a.conflitos > 0 then 'baixa'
    when a.eventos_resultado_confirmado = 0 then 'sem_base'
    when a.chamadas_indeterminadas = 0
      and a.eventos_resultado_confirmado >= 4 then 'alta'
    when a.eventos_resultado_confirmado >= 4
      and a.eventos_resultado_confirmado::numeric
        / nullif(a.eventos_resultado_confirmado + a.chamadas_indeterminadas, 0)
        >= 0.8 then 'media'
    else 'baixa'
  end as confianca_presenca,
  'frequencia-canonica-v2.1'::text as regra_versao,
  a.faltas_justificadas,
  a.frescor ->> 'dados_status' as dados_status,
  a.frescor ->> 'estado_publicacao' as estado_publicacao,
  nullif(a.frescor ->> 'sincronizado_em', '')::timestamptz as sincronizado_em
from publicada a;

revoke all on public.vw_aluno_frequencia_canonica_v1
  from public, anon, authenticated;
grant select on public.vw_aluno_frequencia_canonica_v1 to service_role;

create or replace function public.get_frequencia_professor_periodo_canonica_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table (
  professor_id integer,
  unidade_id uuid,
  ano integer,
  mes integer,
  total_pessoas_evidencia integer,
  total_eventos_evidencia integer,
  eventos_resultado_confirmado integer,
  presencas_confirmadas integer,
  faltas_confirmadas integer,
  faltas_provaveis integer,
  chamadas_indeterminadas integer,
  eventos_excluidos integer,
  conflitos integer,
  media_presenca numeric,
  taxa_faltas numeric,
  cobertura_resultado_confirmado numeric,
  confianca_presenca text,
  regra_versao text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with parametros as (
    select
      coalesce(p_data_inicio, make_date(p_ano, p_mes, 1)) as inicio,
      coalesce(
        p_data_fim,
        (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
      ) as fim
  ), unidades_alvo as (
    select distinct o.unidade_id
    from public.vw_presenca_ocorrencia_metrica_v2 o
    cross join parametros p
    where o.data_aula between p.inicio and p.fim
      and (p_unidade_id is null or o.unidade_id = p_unidade_id)
      and (
        current_setting('request.jwt.claim.role', true) = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          current_setting('request.jwt.claim.role', true) = 'authenticated'
          and (
            (select public.is_admin())
            or o.unidade_id in (select public.get_user_unidade_ids())
          )
        )
      )
  ), metricas as (
    select m.*
    from unidades_alvo u
    cross join parametros p
    cross join lateral public.get_presenca_metricas_canonicas_v2(
      u.unidade_id, p.inicio, p.fim, null, null
    ) m
  ), agregado as (
    select
      m.professor_id,
      m.unidade_id,
      count(distinct m.aluno_id)::integer as total_pessoas_evidencia,
      sum(m.ocorrencias_observadas)::integer as total_eventos_evidencia,
      sum(m.denominador_observado)::integer as eventos_resultado_confirmado,
      sum(m.presentes_observados)::integer as presencas_confirmadas,
      sum(m.faltas_observadas + m.faltas_justificadas_observadas)::integer
        as faltas_confirmadas,
      0::integer as faltas_provaveis,
      sum(m.ocorrencias_incompletas)::integer as chamadas_indeterminadas,
      sum(m.eventos_excluidos_observados)::integer as eventos_excluidos,
      sum(m.conflitos)::integer as conflitos,
      bool_and(m.estado_publicacao = 'publicavel') as publicavel
    from metricas m
    where m.professor_id is not null
    group by m.professor_id, m.unidade_id
  )
  select
    a.professor_id,
    a.unidade_id,
    p_ano,
    p_mes,
    a.total_pessoas_evidencia,
    a.total_eventos_evidencia,
    a.eventos_resultado_confirmado,
    a.presencas_confirmadas,
    a.faltas_confirmadas,
    a.faltas_provaveis,
    a.chamadas_indeterminadas,
    a.eventos_excluidos,
    a.conflitos,
    case
      when a.publicavel and a.eventos_resultado_confirmado > 0
        then round(a.presencas_confirmadas::numeric
          / a.eventos_resultado_confirmado * 100, 2)
      else null
    end,
    case
      when a.publicavel and a.eventos_resultado_confirmado > 0
        then round(a.faltas_confirmadas::numeric
          / a.eventos_resultado_confirmado * 100, 2)
      else null
    end,
    case
      when a.eventos_resultado_confirmado + a.chamadas_indeterminadas > 0
        then round(a.eventos_resultado_confirmado::numeric
          / (a.eventos_resultado_confirmado + a.chamadas_indeterminadas), 6)
      else null
    end,
    case
      when not a.publicavel then 'em_auditoria'
      when a.conflitos > 0 then 'baixa'
      when a.eventos_resultado_confirmado = 0 then 'sem_base'
      when a.eventos_resultado_confirmado >= 10
        and a.chamadas_indeterminadas = 0 then 'alta'
      when a.eventos_resultado_confirmado >= 5
        and a.eventos_resultado_confirmado::numeric
          / nullif(a.eventos_resultado_confirmado + a.chamadas_indeterminadas, 0)
          >= 0.8 then 'media'
      else 'baixa'
    end,
    'frequencia-professor-canonica-v2.1'::text
  from agregado a
  order by a.professor_id, a.unidade_id;
$$;

revoke all on function public.get_frequencia_professor_periodo_canonica_v1(
  integer, integer, uuid, date, date
) from public, anon, authenticated, fabio_agent;
grant execute on function public.get_frequencia_professor_periodo_canonica_v1(
  integer, integer, uuid, date, date
) to authenticated, service_role;

create or replace function public.get_frequencia_professor_periodo_publicavel_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table (
  professor_id integer,
  unidade_id uuid,
  ano integer,
  mes integer,
  media_presenca numeric,
  taxa_faltas numeric,
  cobertura_resultado_confirmado numeric,
  confianca_presenca text,
  publicavel boolean,
  eventos_resultado_confirmado integer,
  eventos_incertos integer,
  regra_versao text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    f.professor_id,
    f.unidade_id,
    f.ano,
    f.mes,
    case when f.confianca_presenca = 'alta' then f.media_presenca else null end,
    case when f.confianca_presenca = 'alta' then f.taxa_faltas else null end,
    f.cobertura_resultado_confirmado,
    f.confianca_presenca,
    f.confianca_presenca = 'alta' as publicavel,
    f.eventos_resultado_confirmado,
    f.chamadas_indeterminadas as eventos_incertos,
    'frequencia-professor-publicavel-v2.1'::text
  from public.get_frequencia_professor_periodo_canonica_v1(
    p_ano, p_mes, p_unidade_id, p_data_inicio, p_data_fim
  ) f;
$$;

revoke all on function public.get_frequencia_professor_periodo_publicavel_v1(
  integer, integer, uuid, date, date
) from public, anon, authenticated, fabio_agent;
grant execute on function public.get_frequencia_professor_periodo_publicavel_v1(
  integer, integer, uuid, date, date
) to service_role;

-- Contrato expandido para a lista de faltas. O adaptador legado abaixo so
-- publica linhas completas; consumidores novos recebem estado e frescor.
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
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with unidades_observadas as (
    select distinct o.unidade_id
    from public.vw_presenca_ocorrencia_metrica_v2 o
    where o.data_aula between p_data_inicio and p_data_fim
      and (p_unidade_id is null or o.unidade_id = p_unidade_id)
      and (
        current_setting('request.jwt.claim.role', true) = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          current_setting('request.jwt.claim.role', true) = 'authenticated'
          and (
            (select public.is_admin())
            or o.unidade_id in (select public.get_user_unidade_ids())
          )
        )
      )
  ), unidades_alvo as (
    select u.unidade_id from unidades_observadas u
    union
    select p_unidade_id
    where p_unidade_id is not null
      and (
        current_setting('request.jwt.claim.role', true) = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          current_setting('request.jwt.claim.role', true) = 'authenticated'
          and (
            (select public.is_admin())
            or p_unidade_id in (select public.get_user_unidade_ids())
          )
        )
      )
  ), metricas as (
    select m.*
    from unidades_alvo u
    cross join lateral public.get_presenca_metricas_canonicas_v2(
      u.unidade_id, p_data_inicio, p_data_fim, null, null
    ) m
  ), agregada as (
    select
      m.aluno_id,
      m.unidade_id,
      sum(m.denominador_observado)::bigint as denominador_observado,
      sum(m.presentes_observados)::bigint as presentes_observados,
      sum(m.faltas_observadas)::bigint as faltas_observadas,
      sum(m.faltas_justificadas_observadas)::bigint
        as faltas_justificadas_observadas,
      bool_and(m.estado_publicacao = 'publicavel') as publicavel,
      max(m.dados_status) as dados_status,
      max(m.estado_publicacao) as estado_publicacao,
      max(m.sincronizado_em) as sincronizado_em
    from metricas m
    where m.aluno_id is not null
    group by m.aluno_id, m.unidade_id
  )
  select
    a.id,
    a.nome::text,
    g.unidade_id,
    u.codigo::text,
    c.nome::text,
    pr.nome::text,
    a.telefone::text,
    a.whatsapp::text,
    a.responsavel_telefone::text,
    case when g.publicavel then g.denominador_observado else null end,
    case when g.publicavel then g.presentes_observados else null end,
    case when g.publicavel then g.faltas_observadas else null end,
    case when g.publicavel then g.faltas_justificadas_observadas else null end,
    case when g.publicavel
      then g.faltas_observadas + g.faltas_justificadas_observadas
      else null
    end,
    case when g.publicavel and g.denominador_observado > 0
      then round(
        g.presentes_observados::numeric / g.denominador_observado * 100,
        2
      )
      else null
    end,
    coalesce(c.is_projeto_banda, false),
    g.dados_status,
    g.estado_publicacao,
    g.sincronizado_em,
    'faltas-periodo-v2.1'::text
  from agregada g
  join public.alunos a
    on a.id = g.aluno_id and a.unidade_id = g.unidade_id
  left join public.unidades u on u.id = a.unidade_id
  left join public.cursos c on c.id = a.curso_id
  left join public.professores pr on pr.id = a.professor_atual_id
  where g.faltas_observadas + g.faltas_justificadas_observadas >= 1
    and a.status in ('ativo', 'aviso_previo')
  order by
    g.faltas_observadas + g.faltas_justificadas_observadas desc,
    a.nome;
$$;

revoke all on function public.get_faltas_periodo_v2(uuid, date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_faltas_periodo_v2(uuid, date, date)
  to authenticated, service_role;

create or replace function public.get_faltas_periodo(
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
  total_aulas bigint,
  faltas bigint,
  presencas bigint,
  pct_presenca numeric,
  is_projeto_banda boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    f.aluno_id,
    f.nome,
    f.unidade_id,
    f.unidade_codigo,
    f.curso_nome,
    f.professor_nome,
    f.telefone,
    f.whatsapp,
    f.responsavel_telefone,
    f.denominador,
    f.faltas_total,
    f.presentes,
    f.percentual_presenca,
    f.is_projeto_banda
  from public.get_faltas_periodo_v2(
    p_unidade_id, p_data_inicio, p_data_fim
  ) f
  where f.estado_publicacao = 'publicavel';
$$;

revoke all on function public.get_faltas_periodo(uuid, date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_faltas_periodo(uuid, date, date)
  to authenticated, service_role;

-- Mantem as nove colunas historicas na mesma ordem e acrescenta o diagnostico
-- v2 ao final. Se os ultimos 30 dias nao forem publicaveis, os numeros antigos
-- ficam nulos em vez de parecerem zero.
create or replace view public.vw_absenteismo_aluno as
with base as (
  select
    o.aluno_id,
    o.unidade_id,
    count(*) filter (
      where o.considera_frequencia_denominador
    )::bigint as total_aulas_observado,
    count(*) filter (
      where o.considera_presenca
    )::bigint as presentes_observado,
    count(*) filter (
      where o.considera_falta
    )::bigint as faltas_observado,
    count(*) filter (
      where o.considera_falta_justificada
    )::bigint as faltas_justificadas_observado,
    count(*) filter (
      where o.data_aula >= current_date - 30
        and o.considera_frequencia_denominador
    )::bigint as aulas_30d_observado,
    count(*) filter (
      where o.data_aula >= current_date - 30 and o.considera_presenca
    )::bigint as presentes_30d_observado,
    count(*) filter (
      where o.data_aula >= current_date - 30 and o.considera_falta
    )::bigint as faltas_30d_observado,
    count(*) filter (
      where o.data_aula >= current_date - 30
        and o.considera_falta_justificada
    )::bigint as faltas_justificadas_30d_observado,
    max(o.data_aula) filter (where o.considera_presenca) as ultima_presenca,
    bool_or(o.ocorrencia_incompleta) as possui_incompleta
  from public.vw_presenca_ocorrencia_metrica_v2 o
  where o.data_aula <= current_date
    and (
      current_setting('request.jwt.claim.role', true) = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        current_setting('request.jwt.claim.role', true) = 'authenticated'
        and (
          (select public.is_admin())
          or o.unidade_id in (select public.get_user_unidade_ids())
        )
      )
    )
  group by o.aluno_id, o.unidade_id
), publicada as (
  select
    b.*,
    public.fn_presenca_estado_publicacao_periodo_v2(
      b.unidade_id,
      greatest(current_date - 30, date '2026-08-01'),
      current_date
    ) as frescor
  from base b
), classificada as (
  select
    p.*,
    (
      p.frescor ->> 'estado_publicacao' = 'publicavel'
      and not p.possui_incompleta
    ) as publicavel
  from publicada p
)
select
  c.aluno_id,
  case when c.publicavel then c.total_aulas_observado else null end
    as total_aulas,
  case when c.publicavel
    then c.faltas_observado + c.faltas_justificadas_observado
    else null
  end as faltas,
  case when c.publicavel and c.total_aulas_observado > 0
    then round(
      (c.faltas_observado + c.faltas_justificadas_observado)::numeric
        / c.total_aulas_observado,
      3
    )
    else null
  end as taxa_historica,
  case when c.publicavel and c.aulas_30d_observado > 0
    then round(
      (c.faltas_30d_observado + c.faltas_justificadas_30d_observado)::numeric
        / c.aulas_30d_observado,
      3
    )
    else null
  end as taxa_recente_30d,
  case when c.publicavel
      and c.total_aulas_observado > 0
      and c.aulas_30d_observado > 0
    then round(
      (c.faltas_30d_observado + c.faltas_justificadas_30d_observado)::numeric
        / c.aulas_30d_observado
      - (c.faltas_observado + c.faltas_justificadas_observado)::numeric
        / c.total_aulas_observado,
      3
    )
    else null
  end as tendencia,
  case when c.publicavel then c.ultima_presenca else null end
    as ultima_presenca,
  case when c.publicavel then current_date - c.ultima_presenca else null end
    as dias_sem_presenca,
  c.publicavel and c.total_aulas_observado >= 4 as confiavel,
  case when c.publicavel then c.presentes_observado else null end
    as presentes,
  case when c.publicavel then c.faltas_observado else null end
    as faltas_nao_justificadas,
  case when c.publicavel then c.faltas_justificadas_observado else null end
    as faltas_justificadas,
  case when c.publicavel then c.aulas_30d_observado else null end
    as denominador_30d,
  case when c.publicavel then c.presentes_30d_observado else null end
    as presentes_30d,
  case when c.publicavel then c.faltas_30d_observado else null end
    as faltas_nao_justificadas_30d,
  case when c.publicavel then c.faltas_justificadas_30d_observado else null end
    as faltas_justificadas_30d,
  c.frescor ->> 'dados_status' as dados_status,
  case when c.possui_incompleta then 'em_auditoria'
    else c.frescor ->> 'estado_publicacao'
  end as estado_publicacao,
  nullif(c.frescor ->> 'sincronizado_em', '')::timestamptz
    as sincronizado_em,
  'absenteismo-aluno-v2.1'::text as regra_versao
from classificada c;

revoke all on public.vw_absenteismo_aluno from public, anon;
grant select on public.vw_absenteismo_aluno to authenticated, service_role;

-- Radar/Success: o slot ja chega deduplicado pela ocorrencia v2. O frescor da
-- unidade bloqueia todos os sinais numericos; nenhum roster ausente vira zero.
create or replace view public.vw_radar_aluno_sinais as
with coorte as (
  select id as professor_id
  from public.professores
  where coalesce(ativo, true) and usuario_id is not null
), aula as (
  select
    o.aluno_id,
    o.unidade_id,
    o.data_aula,
    o.data_hora_inicio,
    o.considera_presenca as veio,
    o.considera_falta as faltou,
    o.considera_falta_justificada as falta_justificada
  from public.vw_presenca_ocorrencia_metrica_v2 o
  where o.considera_frequencia_denominador
    and o.data_aula >= date '2026-08-01'
    and o.data_aula <= current_date
), ordenada as (
  select
    a.*,
    row_number() over (
      partition by a.aluno_id
      order by a.data_aula desc, a.data_hora_inicio desc nulls last
    ) as rn
  from aula a
), janela as (
  select
    o.aluno_id,
    count(*)::bigint as aulas_medidas,
    count(*) filter (where not o.veio)::bigint as faltas_janela
  from ordenada o
  where o.rn <= 10
  group by o.aluno_id
), consecutivas as (
  select o.aluno_id, count(*)::bigint as faltas_consecutivas
  from ordenada o
  where not o.veio
    and not exists (
      select 1 from ordenada anterior
      where anterior.aluno_id = o.aluno_id
        and anterior.rn < o.rn
        and anterior.veio
    )
  group by o.aluno_id
), mes as (
  select
    a.aluno_id,
    count(*)::bigint as aulas_mes,
    count(*) filter (where not a.veio)::bigint as faltas_mes,
    count(*) filter (where a.falta_justificada)::bigint
      as faltas_justificadas_mes
  from aula a
  where a.data_aula >= public.fn_competencia_feedback()
  group by a.aluno_id
), frescor_unidade as (
  select
    u.unidade_id,
    public.fn_presenca_estado_publicacao_periodo_v2(
      u.unidade_id,
      date '2026-08-01',
      current_date
    ) as frescor
  from (select distinct unidade_id from aula) u
), semaforo as (
  select distinct on (f.aluno_id, f.professor_id)
    f.aluno_id,
    f.professor_id,
    f.feedback,
    f.pratica_em_casa,
    f.evolucao,
    f.animo,
    nullif(btrim(f.observacao), '') as observacao,
    f.competencia
  from public.aluno_feedback_professor f
  where f.competencia = public.fn_competencia_feedback()
  order by
    f.aluno_id, f.professor_id,
    coalesce(f.atualizado_em, f.respondido_em) desc
), aviso as (
  select ma.aluno_id, min(ma.mes_saida) as mes_saida
  from public.movimentacoes_admin ma
  where ma.tipo = 'aviso_previo'
    and ma.mes_saida >= public.fn_competencia_feedback()
    and ma.aluno_id is not null
  group by ma.aluno_id
)
select
  s.id as aluno_id,
  s.nome as aluno_nome,
  s.unidade_id,
  s.unidade_codigo,
  s.professor_atual_id as professor_id,
  s.professor_nome,
  s.curso_nome,
  case when fu.frescor ->> 'estado_publicacao' = 'publicavel'
    then coalesce(j.aulas_medidas, 0)
    else null
  end as aulas_medidas,
  case when fu.frescor ->> 'estado_publicacao' = 'publicavel'
    then coalesce(j.faltas_janela, 0)
    else null
  end as faltas_janela,
  case when fu.frescor ->> 'estado_publicacao' = 'publicavel'
      and coalesce(j.aulas_medidas, 0) > 0
    then round(100.0 * j.faltas_janela / j.aulas_medidas, 1)
    else null
  end as absenteismo_pct,
  case when fu.frescor ->> 'estado_publicacao' = 'publicavel'
    then coalesce(m.faltas_mes, 0)
    else null
  end as faltas_mes,
  case when fu.frescor ->> 'estado_publicacao' = 'publicavel'
    then coalesce(m.aulas_mes, 0)
    else null
  end as aulas_mes,
  sf.feedback,
  sf.pratica_em_casa,
  sf.evolucao,
  sf.animo,
  sf.observacao,
  sf.competencia as feedback_competencia,
  av.aluno_id is not null as avisou_que_sai,
  av.mes_saida,
  case when fu.frescor ->> 'estado_publicacao' = 'publicavel'
    then coalesce(fc.faltas_consecutivas, 0)
    else null
  end as faltas_consecutivas,
  s.foto_url as aluno_foto_url,
  case when fu.frescor ->> 'estado_publicacao' = 'publicavel'
    then coalesce(m.faltas_justificadas_mes, 0)
    else null
  end as faltas_justificadas_mes,
  coalesce(fu.frescor ->> 'dados_status', 'sem_base') as dados_status,
  coalesce(fu.frescor ->> 'estado_publicacao', 'sem_base')
    as estado_publicacao,
  nullif(fu.frescor ->> 'sincronizado_em', '')::timestamptz
    as sincronizado_em,
  'radar-aluno-sinais-v2.1'::text as regra_versao
from public.vw_aluno_sucesso_lista s
join coorte c on c.professor_id = s.professor_atual_id
left join janela j on j.aluno_id = s.id
left join consecutivas fc on fc.aluno_id = s.id
left join mes m on m.aluno_id = s.id
left join semaforo sf
  on sf.aluno_id = s.id and sf.professor_id = s.professor_atual_id
left join aviso av on av.aluno_id = s.id
left join frescor_unidade fu on fu.unidade_id = s.unidade_id
where (
  current_setting('request.jwt.claim.role', true) = 'service_role'
  or session_user::text in ('postgres', 'service_role')
  or (
    current_setting('request.jwt.claim.role', true) = 'authenticated'
    and (
      (select public.is_admin())
      or s.unidade_id in (select public.get_user_unidade_ids())
    )
  )
);

revoke all on public.vw_radar_aluno_sinais from public, anon;
grant select on public.vw_radar_aluno_sinais to authenticated, service_role;

-- Health Score Professor V3: somente ciclos abertos e novas materializacoes
-- usam esta funcao. Nenhum snapshot fechado e atualizado por esta migration.
create or replace function public.get_health_score_professor_v3_presenca_periodo_v2(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text, professor_id integer, professor_nome text, unidade_id uuid,
  competencia date, valor_bruto numeric, numerador numeric,
  denominador numeric, amostra integer, estado_base text, publicavel boolean,
  confianca text, fonte text, regra_versao text, motivo_sem_base text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PRESENCA_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo
    into v_inicio, v_fim_periodo, v_codigo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade) p;

  v_fim_recorte := least(v_fim_periodo, current_date);

  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), estado_unidade as (
    select
      up.unidade_id,
      public.fn_presenca_estado_publicacao_periodo_v2(
        up.unidade_id, v_inicio, v_fim_recorte
      ) as estado
    from unidades_permitidas up
  ), observada as (
    select
      o.professor_id,
      o.unidade_id,
      count(*) filter (
        where o.considera_frequencia_denominador
      )::integer as denominador_observado,
      count(*) filter (where o.considera_presenca)::integer
        as presentes_observados,
      count(*) filter (where o.considera_falta)::integer
        as faltas_observadas,
      count(*) filter (where o.considera_falta_justificada)::integer
        as faltas_justificadas_observadas,
      count(*) filter (where o.ocorrencia_incompleta)::integer
        as incompletas,
      count(*) filter (where o.possui_conflito)::integer as conflitos
    from public.vw_presenca_ocorrencia_metrica_v2 o
    join unidades_permitidas up on up.unidade_id = o.unidade_id
    where o.data_aula between v_inicio and v_fim_recorte
    group by o.professor_id, o.unidade_id
  ), alvo_unidade as (
    select distinct pu.professor_id, pu.unidade_id
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado')
        not in ('ignorado', 'rejeitado')
    union
    select distinct o.professor_id, o.unidade_id
    from observada o
    where o.professor_id is not null
  ), por_professor as (
    select
      a.professor_id,
      case when p_unidade_id is null then null::uuid else a.unidade_id end
        as unidade_saida,
      sum(coalesce(o.denominador_observado, 0))::integer
        as denominador_observado,
      sum(coalesce(o.presentes_observados, 0))::integer
        as presentes_observados,
      sum(coalesce(o.faltas_observadas, 0))::integer as faltas_observadas,
      sum(coalesce(o.faltas_justificadas_observadas, 0))::integer
        as faltas_justificadas_observadas,
      sum(coalesce(o.incompletas, 0))::integer as incompletas,
      sum(coalesce(o.conflitos, 0))::integer as conflitos,
      bool_or(e.estado ->> 'estado_publicacao' = 'bloqueado_roster')
        as bloqueado_roster,
      bool_or(e.estado ->> 'estado_publicacao' = 'bloqueado_frescor')
        as bloqueado_frescor,
      bool_or(e.estado ->> 'estado_publicacao' = 'em_auditoria')
        as em_auditoria,
      bool_and(e.estado ->> 'estado_publicacao' in ('publicavel', 'sem_base'))
        as unidades_resolvidas,
      max(nullif(e.estado ->> 'sincronizado_em', '')::timestamptz)
        as sincronizado_em
    from alvo_unidade a
    join estado_unidade e on e.unidade_id = a.unidade_id
    left join observada o
      on o.professor_id = a.professor_id and o.unidade_id = a.unidade_id
    group by a.professor_id,
      case when p_unidade_id is null then null::uuid else a.unidade_id end
  ), classificada as (
    select
      p.*,
      case
        when p.bloqueado_roster then 'bloqueado_roster'
        when p.bloqueado_frescor then 'bloqueado_frescor'
        when p.em_auditoria or p.incompletas > 0 or p.conflitos > 0
          then 'em_auditoria'
        when p.denominador_observado = 0 then 'sem_base'
        when p.denominador_observado < 10 then 'sem_base_amostra'
        else 'ok'
      end as estado_base_calculado,
      p.unidades_resolvidas
        and not p.bloqueado_roster
        and not p.bloqueado_frescor
        and not p.em_auditoria
        and p.incompletas = 0
        and p.conflitos = 0
        and p.denominador_observado >= 10 as publicavel_calculado
    from por_professor p
  )
  select
    'presenca'::text,
    c.professor_id,
    pr.nome::text,
    c.unidade_saida,
    v_competencia,
    case when c.publicavel_calculado then round(
      c.presentes_observados::numeric / c.denominador_observado * 100,
      2
    ) else null end,
    case when c.publicavel_calculado
      then c.presentes_observados::numeric else null end,
    case when c.publicavel_calculado
      then c.denominador_observado::numeric else null end,
    case when c.publicavel_calculado
      then c.denominador_observado else null end,
    c.estado_base_calculado,
    c.publicavel_calculado,
    case
      when c.publicavel_calculado then 'alta'
      when c.estado_base_calculado = 'sem_base' then 'sem_base'
      when c.estado_base_calculado = 'sem_base_amostra' then 'baixa'
      else 'auditoria'
    end,
    'vw_presenca_ocorrencia_canonica_v2'::text,
    'health-score-professor-v3-presenca-v2.2'::text,
    case c.estado_base_calculado
      when 'bloqueado_roster' then 'roster incompleto ou em revisao no periodo'
      when 'bloqueado_frescor' then 'sincronizacao incompleta no periodo'
      when 'em_auditoria' then 'ocorrencia pendente ou conflitante no periodo'
      when 'sem_base' then 'nenhuma ocorrencia confirmada no periodo'
      when 'sem_base_amostra' then 'base minima de 10 eventos nao atingida'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'denominador_observado', c.denominador_observado,
      'presentes_observados', c.presentes_observados,
      'faltas_observadas', c.faltas_observadas,
      'faltas_justificadas_observadas',
        c.faltas_justificadas_observadas,
      'faltas_total_observado',
        c.faltas_observadas + c.faltas_justificadas_observadas,
      'ocorrencias_incompletas', c.incompletas,
      'conflitos', c.conflitos,
      'estado_publicacao', c.estado_base_calculado,
      'sincronizado_em', c.sincronizado_em,
      'fonte_veredito', 'vw_presenca_ocorrencia_canonica_v2',
      'apta_oficial', c.publicavel_calculado
        and p_periodicidade = 'ciclo'
        and v_fim_periodo <= current_date
    )
  from classificada c
  join public.professores pr on pr.id = c.professor_id;
end;
$$;

revoke all on function public.get_health_score_professor_v3_presenca_periodo_v2(
  date, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_presenca_periodo_v2(
  date, uuid, text
) to authenticated, service_role;

-- PRODUTORES REDEFINIDOS NESTA MIGRATION
--   vw_aluno_frequencia_canonica_v1
--   get_frequencia_professor_periodo_canonica_v1
--   get_frequencia_professor_periodo_publicavel_v1
--   get_faltas_periodo_v2 + adaptador comprovado get_faltas_periodo
--   vw_absenteismo_aluno
--   vw_radar_aluno_sinais (Radar/Success do Aluno)
--   get_health_score_professor_v3_presenca_periodo_v2
--
-- PRODUTORES INDIRETOS OU PRESERVADOS
--   get_kpis_professor_periodo_canonico_v2 consome
--     get_frequencia_professor_periodo_publicavel_v1; nao foi redefinido.
--   get_kpis_professor_periodo_canonico_v3 encadeia a v2; nao foi redefinido.
--   Relatorios de coordenacao, incluindo get_relatorio_coordenacao_canonico_v3,
--     encadeiam get_kpis_professor_periodo_canonico_v3; nao foram redefinidos.
--   O relatorio gerencial get_relatorio_gerencial_canonico_v1 e seu snapshot
--     fechado foram preservados; nenhuma linha historica foi reprocessada.
--   vw_aluno_sucesso_lista continua consumindo vw_absenteismo_aluno e, assim,
--     recebe o contrato v2 indiretamente; nao foi redefinida.
