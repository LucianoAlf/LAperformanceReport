begin;

alter function public.salvar_health_score_professor_v3_config_rascunho(
  uuid,
  date,
  text,
  jsonb,
  jsonb
)
  rename to salvar_health_score_professor_v3_config_rascunho_pre_oferta_formal_v1;

create or replace function public.salvar_health_score_professor_v3_config_rascunho(
  p_config_id uuid,
  p_vigencia_inicio date,
  p_justificativa text,
  p_metricas jsonb,
  p_metas_segmentadas jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_metas_segmentadas, '[]'::jsonb)) as r(
      unidade_id uuid,
      curso_id integer,
      modalidade text,
      estado text,
      capacidade_maxima numeric,
      meta_media_turma numeric,
      meta_carteira_curso numeric,
      parametros jsonb
    )
    join public.fn_health_score_professor_v3_catalogo_segmentos_v1(
      p_config_id
    ) c
      on c.unidade_id = r.unidade_id
     and c.curso_id = r.curso_id
     and c.modalidade = r.modalidade
    where c.formalmente_ofertado is true
      and r.estado = 'nao_ofertada'
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: oferta formal nao pode ser marcada como nao ofertada';
  end if;

  return public.salvar_health_score_professor_v3_config_rascunho_pre_oferta_formal_v1(
    p_config_id,
    p_vigencia_inicio,
    p_justificativa,
    p_metricas,
    p_metas_segmentadas
  );
end;
$function$;

revoke all on function public.salvar_health_score_professor_v3_config_rascunho_pre_oferta_formal_v1(
  uuid,
  date,
  text,
  jsonb,
  jsonb
) from public, anon, authenticated;

revoke all on function public.salvar_health_score_professor_v3_config_rascunho(
  uuid,
  date,
  text,
  jsonb,
  jsonb
) from public, anon;

grant execute on function public.salvar_health_score_professor_v3_config_rascunho(
  uuid,
  date,
  text,
  jsonb,
  jsonb
) to authenticated;

comment on function public.salvar_health_score_professor_v3_config_rascunho(
  uuid,
  date,
  text,
  jsonb,
  jsonb
) is
  'Salva o rascunho governado e impede que uma oferta formal do catalogo Emusys seja marcada como nao ofertada.';

commit;
