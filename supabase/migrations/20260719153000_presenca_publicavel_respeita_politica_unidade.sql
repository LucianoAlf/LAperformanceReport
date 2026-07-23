-- Presenca de professor - publicacao condicionada a politica da unidade.
--
-- A confianca estatistica da chamada nao basta para liberar o indicador. A
-- politica temporal da unidade tambem precisa autorizar publicacao sem revisao
-- operacional. Assim Campo Grande permanece em auditoria, enquanto Barra e
-- Recreio podem publicar o recorte aprovado.

create or replace function public.get_frequencia_professor_periodo_publicavel_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table(
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
set search_path = public, pg_temp
as $$
  with recorte as (
    select
      coalesce(p_data_inicio, make_date(p_ano, p_mes, 1)) as data_inicio,
      coalesce(
        p_data_fim,
        (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
      ) as data_fim
  ), base as (
    select
      f.*,
      r.data_inicio,
      r.data_fim
    from public.get_frequencia_professor_periodo_canonica_v1(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    ) f
    cross join recorte r
  ), avaliada as (
    select
      r.*,
      exists (
        select 1
        from public.presenca_politicas_confiabilidade p
        where p.unidade_id = r.unidade_id
          and p.ativa
          and p.exige_revisao_operacional = false
          and p.data_inicio <= r.data_fim
          and p.data_fim >= r.data_inicio
      ) as politica_publicavel
    from base r
  )
  select
    f.professor_id,
    f.unidade_id,
    f.ano,
    f.mes,
    case
      when f.confianca_presenca = 'alta' and f.politica_publicavel
        then f.media_presenca
      else null
    end as media_presenca,
    case
      when f.confianca_presenca = 'alta' and f.politica_publicavel
        then f.taxa_faltas
      else null
    end as taxa_faltas,
    f.cobertura_resultado_confirmado,
    case
      when f.politica_publicavel then f.confianca_presenca
      else 'em_auditoria'
    end as confianca_presenca,
    f.confianca_presenca = 'alta' and f.politica_publicavel as publicavel,
    f.eventos_resultado_confirmado,
    f.faltas_provaveis + f.chamadas_indeterminadas as eventos_incertos,
    'frequencia-professor-publicavel-politica-v2'::text as regra_versao
  from avaliada f;
$$;

comment on function public.get_frequencia_professor_periodo_publicavel_v1(
  integer, integer, uuid, date, date
) is
  'Publica frequencia somente com confianca alta e politica temporal da unidade sem revisao operacional pendente.';

revoke all on function public.get_frequencia_professor_periodo_publicavel_v1(
  integer, integer, uuid, date, date
) from public, anon, authenticated, fabio_agent;
grant execute on function public.get_frequencia_professor_periodo_publicavel_v1(
  integer, integer, uuid, date, date
) to service_role;
