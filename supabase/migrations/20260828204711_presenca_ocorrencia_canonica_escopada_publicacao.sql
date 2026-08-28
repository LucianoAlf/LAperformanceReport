-- Publica o kernel escopado apenas para consumidores de periodo (ledger remoto alinhado). A view
-- compartilhada por Agenda, LA Teacher e agentes nao e reescrita.
-- Se reaparecer uma data de slot divergente, o caminho volta automaticamente
-- para a view integral, preservando a arbitragem multidata acima da latencia.

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
set plan_cache_mode = 'force_custom_plan'
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

  if exists (
    select 1
    from public.aulas_emusys ae
    where ae.unidade_id = p_unidade_id
      and ae.data_hora_inicio is not null
      and ae.data_aula is distinct from
        ((ae.data_hora_inicio at time zone 'America/Sao_Paulo')::date)
  ) then
    return query
    select o.*
    from public.vw_presenca_ocorrencia_metrica_v2 o
    where o.unidade_id = p_unidade_id
      and o.data_aula between p_data_inicio and p_data_fim
      and (p_professor_id is null or o.professor_id = p_professor_id)
      and (p_aluno_id is null or o.aluno_id = p_aluno_id);
    return;
  end if;

  return query
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
    o.resultado_canonico in (
      'presente', 'falta', 'falta_justificada'
    ) as considera_frequencia_denominador,
    o.resultado_canonico = 'presente' as considera_presenca,
    o.resultado_canonico = 'falta' as considera_falta,
    o.resultado_canonico = 'falta_justificada'
      as considera_falta_justificada,
    o.resultado_canonico = 'indeterminado' or o.possui_conflito
      as ocorrencia_incompleta
  from public.fn_presenca_ocorrencia_canonica_escopada_v2(
    p_unidade_id,
    p_data_inicio,
    p_data_fim
  ) o
  where (p_professor_id is null or o.professor_id = p_professor_id)
    and (p_aluno_id is null or o.aluno_id = p_aluno_id);
end;
$function$;

revoke all on function public.fn_presenca_ocorrencias_escopo_interno_v2(
  uuid, date, date, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.fn_presenca_ocorrencias_escopo_interno_v2(
  uuid, date, date, integer, integer
) to service_role;

alter function public.get_frequencia_professor_periodo_canonica_v1(
  integer, integer, uuid, date, date
) set plan_cache_mode = 'force_custom_plan';

alter function public.get_carteira_professor_periodo_detalhe_canonico_v1(
  integer, integer, uuid, date, date
) set plan_cache_mode = 'force_custom_plan';

alter function public.get_kpis_professor_periodo_canonico_v2(
  integer, integer, uuid, date, date
) set plan_cache_mode = 'force_custom_plan';

alter function public.get_kpis_professor_periodo_canonico_v3(
  integer, integer, uuid, date, date
) set plan_cache_mode = 'force_custom_plan';

comment on function public.fn_presenca_ocorrencias_escopo_interno_v2(
  uuid, date, date, integer, integer
) is 'Kernel metrico escopado; fallback integral fail-closed quando existe slot com data divergente.';
