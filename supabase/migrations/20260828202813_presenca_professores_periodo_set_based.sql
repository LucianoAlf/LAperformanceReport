-- Hotfix aditivo de performance para os consumidores de professores (ledger remoto alinhado).
-- Nao altera precedencia, semantica, resultados, view canonica nem escrita.
-- Remove somente dois trabalhos redundantes:
--   1. uma consulta da view canonica para cada dia do periodo;
--   2. uma varredura da mesma view apenas para descobrir as tres unidades.

create or replace function public.fn_presenca_ocorrencias_escopo_interno_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_professor_id integer default null,
  p_aluno_id integer default null
)
returns setof public.vw_presenca_ocorrencia_metrica_v2
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_unidade_id is null
     or p_data_inicio is null
     or p_data_fim is null
     or p_data_inicio > p_data_fim
     or p_data_fim - p_data_inicio > 370 then
    raise exception using
      errcode = '22023',
      message = 'PRESENCA_ESCOPO_INTERNO_INVALIDO';
  end if;

  return query
  select o.*
  from public.vw_presenca_ocorrencia_metrica_v2 o
  where o.unidade_id = p_unidade_id
    and o.data_aula between p_data_inicio and p_data_fim
    and (p_professor_id is null or o.professor_id = p_professor_id)
    and (p_aluno_id is null or o.aluno_id = p_aluno_id);
end;
$function$;

revoke all on function public.fn_presenca_ocorrencias_escopo_interno_v2(
  uuid, date, date, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.fn_presenca_ocorrencias_escopo_interno_v2(
  uuid, date, date, integer, integer
) to service_role;

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
as $function$
  with parametros as (
    select
      coalesce(p_data_inicio, make_date(p_ano, p_mes, 1)) as inicio,
      coalesce(
        p_data_fim,
        (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
      ) as fim
  ), unidades_alvo as (
    select u.id as unidade_id
    from public.unidades u
    where (p_unidade_id is null or u.id = p_unidade_id)
      and (
        auth.role() = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          auth.role() = 'authenticated'
          and (
            (select public.is_admin())
            or u.id in (select public.get_user_unidade_ids())
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
$function$;

revoke all on function public.get_frequencia_professor_periodo_canonica_v1(
  integer, integer, uuid, date, date
) from public, anon, authenticated, service_role;
grant execute on function public.get_frequencia_professor_periodo_canonica_v1(
  integer, integer, uuid, date, date
) to authenticated, service_role;

comment on function public.fn_presenca_ocorrencias_escopo_interno_v2(
  uuid, date, date, integer, integer
) is 'Kernel interno set-based de ocorrencias canonicas por unidade e periodo.';

comment on function public.get_frequencia_professor_periodo_canonica_v1(
  integer, integer, uuid, date, date
) is 'Frequencia canonica de professores sem varredura redundante para descobrir unidades.';
