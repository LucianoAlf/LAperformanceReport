-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

begin;

alter table public.health_score_professor_v3_config_versoes
  add column if not exists pilares_minimos integer not null default 3;

alter table public.health_score_professor_v3_config_versoes
  drop constraint if exists health_score_professor_v3_config_pilares_minimos_chk;

alter table public.health_score_professor_v3_config_versoes
  add constraint health_score_professor_v3_config_pilares_minimos_chk
  check (pilares_minimos between 1 and 5);

comment on column public.health_score_professor_v3_config_versoes.pilares_minimos is
  'Quantidade minima de pilares pontuaveis com evidencia para comparacao. O valor e versionado e nao altera snapshots fechados.';

create or replace function public.fn_health_score_professor_v3_config_json_comparabilidade(
  p_config_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select case
    when c.id is null then null::jsonb
    else coalesce(public.fn_health_score_professor_v3_config_json(c.id), '{}'::jsonb)
      || jsonb_build_object(
        'pilares_minimos', c.pilares_minimos,
        'cobertura_minima', c.cobertura_minima,
        'exige_pilar_fidelizacao', c.exige_pilar_fidelizacao
      )
  end
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id;
$function$;

create or replace function public.fn_health_score_professor_v3_config_fingerprint_comparabilidade(
  p_config_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select md5(jsonb_build_object(
    'fingerprint_base', public.fn_health_score_professor_v3_config_fingerprint(c.id),
    'pilares_minimos', c.pilares_minimos,
    'cobertura_minima', c.cobertura_minima,
    'exige_pilar_fidelizacao', c.exige_pilar_fidelizacao
  )::text)
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id;
$function$;

create or replace function public.avaliar_health_score_professor_v3_comparabilidade(
  p_score_observado numeric,
  p_cobertura numeric,
  p_pilares_validos integer,
  p_tem_fidelizacao boolean,
  p_cobertura_minima numeric,
  p_pilares_minimos integer,
  p_fonte_canonica_disponivel boolean default true
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_estado text;
  v_motivo text;
  v_comparavel boolean := false;
  v_motivos jsonb := '[]'::jsonb;
begin
  if coalesce(p_pilares_validos, 0) = 0 then
    v_motivos := v_motivos || '"sem_pilares_validos"'::jsonb;
  elsif p_pilares_validos < coalesce(p_pilares_minimos, 3) then
    v_motivos := v_motivos || '"pilares_insuficientes"'::jsonb;
  end if;

  if p_score_observado is null then
    v_motivos := v_motivos || '"score_observado_indisponivel"'::jsonb;
  end if;
  if coalesce(p_cobertura, 0) < coalesce(p_cobertura_minima, 60) then
    v_motivos := v_motivos || '"cobertura_insuficiente"'::jsonb;
  end if;
  if not coalesce(p_tem_fidelizacao, false) then
    v_motivos := v_motivos || '"sem_pilar_fidelizacao"'::jsonb;
  end if;
  if not coalesce(p_fonte_canonica_disponivel, false) then
    v_motivos := v_motivos || '"fonte_canonica_indisponivel"'::jsonb;
  end if;

  if coalesce(p_pilares_validos, 0) = 0 then
    v_estado := 'sem_base_operacional';
    v_motivo := 'sem_pilares_validos';
  elsif not coalesce(p_fonte_canonica_disponivel, false) then
    v_estado := 'em_maturacao';
    v_motivo := 'fonte_em_auditoria';
  elsif p_score_observado is null then
    v_estado := 'em_maturacao';
    v_motivo := 'score_observado_indisponivel';
  elsif p_pilares_validos < coalesce(p_pilares_minimos, 3) then
    v_estado := 'em_maturacao';
    v_motivo := 'pilares_insuficientes';
  elsif coalesce(p_cobertura, 0) < coalesce(p_cobertura_minima, 60) then
    v_estado := 'em_maturacao';
    v_motivo := 'cobertura_insuficiente';
  elsif not coalesce(p_tem_fidelizacao, false) then
    v_estado := 'em_maturacao';
    v_motivo := 'sem_pilar_fidelizacao';
  else
    v_estado := 'comparavel';
    v_motivo := 'criterios_atendidos';
    v_comparavel := true;
    v_motivos := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'estado', v_estado,
    'motivo', v_motivo,
    'motivos', v_motivos,
    'comparavel', v_comparavel,
    'score_comparavel', case when v_comparavel then p_score_observado else null end,
    'pilares_minimos_aplicado', coalesce(p_pilares_minimos, 3),
    'cobertura_minima_aplicada', coalesce(p_cobertura_minima, 60)
  );
end;
$function$;

alter function public.get_health_score_professor_v3_config_ui(date)
  rename to get_hs_prof_v3_config_ui_base_20260803;

create or replace function public.get_health_score_professor_v3_config_ui(
  p_competencia date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '60s'
as $function$
declare
  v_base jsonb;
  v_ativa_id uuid;
  v_rascunho_id uuid;
begin
  v_base := public.get_hs_prof_v3_config_ui_base_20260803(p_competencia);
  v_ativa_id := nullif(v_base #>> '{ativa,id}', '')::uuid;
  v_rascunho_id := nullif(v_base #>> '{rascunho,id}', '')::uuid;

  return jsonb_set(
    jsonb_set(
      coalesce(v_base, '{}'::jsonb),
      '{ativa}',
      coalesce(
        public.fn_health_score_professor_v3_config_json_comparabilidade(v_ativa_id),
        'null'::jsonb
      ),
      true
    ),
    '{rascunho}',
    coalesce(
      public.fn_health_score_professor_v3_config_json_comparabilidade(v_rascunho_id),
      'null'::jsonb
    ),
    true
  );
end;
$function$;

create or replace function public.get_health_score_professor_v3_config_ui()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '60s'
as $function$
  select public.get_health_score_professor_v3_config_ui(
    date_trunc('month', timezone('America/Sao_Paulo', now()))::date
  );
$function$;

create or replace function public.criar_health_score_professor_v3_config_rascunho_v2(
  p_vigencia_inicio date,
  p_justificativa text,
  p_config_origem_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_resultado jsonb;
  v_config_id uuid;
begin
  v_resultado := public.criar_health_score_professor_v3_config_rascunho(
    p_vigencia_inicio,
    p_justificativa,
    p_config_origem_id
  );
  v_config_id := nullif(v_resultado ->> 'id', '')::uuid;

  update public.health_score_professor_v3_config_versoes destino
  set pilares_minimos = origem.pilares_minimos,
      cobertura_minima = origem.cobertura_minima,
      exige_pilar_fidelizacao = origem.exige_pilar_fidelizacao,
      atualizado_em = now()
  from public.health_score_professor_v3_config_versoes origem
  where destino.id = v_config_id
    and destino.status = 'rascunho'
    and origem.id = p_config_origem_id;

  return public.fn_health_score_professor_v3_config_json_comparabilidade(v_config_id)
    || (coalesce(v_resultado, '{}'::jsonb) - 'metricas' - 'metas_segmentadas');
end;
$function$;

create or replace function public.criar_health_score_professor_v3_config_revisao_ciclo_aberto_v2(
  p_config_origem_id uuid,
  p_vigencia_inicio date,
  p_vigencia_fim date,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_resultado jsonb;
  v_config_id uuid;
begin
  v_resultado := public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
    p_config_origem_id,
    p_vigencia_inicio,
    p_vigencia_fim,
    p_justificativa
  );
  v_config_id := nullif(v_resultado ->> 'id', '')::uuid;

  update public.health_score_professor_v3_config_versoes destino
  set pilares_minimos = origem.pilares_minimos,
      cobertura_minima = origem.cobertura_minima,
      exige_pilar_fidelizacao = origem.exige_pilar_fidelizacao,
      atualizado_em = now()
  from public.health_score_professor_v3_config_versoes origem
  where destino.id = v_config_id
    and destino.status = 'rascunho'
    and origem.id = p_config_origem_id;

  return public.fn_health_score_professor_v3_config_json_comparabilidade(v_config_id)
    || (coalesce(v_resultado, '{}'::jsonb) - 'metricas' - 'metas_segmentadas');
end;
$function$;

create or replace function public.salvar_health_score_professor_v3_config_rascunho_v2(
  p_config_id uuid,
  p_vigencia_inicio date,
  p_justificativa text,
  p_metricas jsonb,
  p_metas_segmentadas jsonb,
  p_cobertura_minima numeric,
  p_pilares_minimos integer,
  p_exige_pilar_fidelizacao boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_status text;
begin
  select c.status into v_status
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found or v_status <> 'rascunho' then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser alterado';
  end if;
  if p_cobertura_minima is null or p_cobertura_minima < 0 or p_cobertura_minima > 100 then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: cobertura minima deve estar entre 0 e 100';
  end if;
  if p_pilares_minimos is null or p_pilares_minimos not between 1 and 5 then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: pilares minimos deve estar entre 1 e 5';
  end if;
  if p_exige_pilar_fidelizacao is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: regra de fidelizacao obrigatoria';
  end if;

  perform public.salvar_health_score_professor_v3_config_rascunho(
    p_config_id,
    p_vigencia_inicio,
    p_justificativa,
    p_metricas,
    p_metas_segmentadas
  );

  update public.health_score_professor_v3_config_versoes
  set cobertura_minima = p_cobertura_minima,
      pilares_minimos = p_pilares_minimos,
      exige_pilar_fidelizacao = p_exige_pilar_fidelizacao,
      atualizado_em = now()
  where id = p_config_id
    and status = 'rascunho';

  return public.fn_health_score_professor_v3_config_json_comparabilidade(p_config_id);
end;
$function$;

revoke all on function public.fn_health_score_professor_v3_config_json_comparabilidade(uuid)
  from public, anon, authenticated;
revoke all on function public.fn_health_score_professor_v3_config_fingerprint_comparabilidade(uuid)
  from public, anon, authenticated;
revoke all on function public.avaliar_health_score_professor_v3_comparabilidade(
  numeric, numeric, integer, boolean, numeric, integer, boolean
) from public, anon;
revoke all on function public.get_health_score_professor_v3_config_ui(date)
  from public, anon;
revoke all on function public.get_health_score_professor_v3_config_ui()
  from public, anon;
revoke all on function public.criar_health_score_professor_v3_config_rascunho_v2(
  date, text, uuid
) from public, anon;
revoke all on function public.criar_health_score_professor_v3_config_revisao_ciclo_aberto_v2(
  uuid, date, date, text
) from public, anon;
revoke all on function public.salvar_health_score_professor_v3_config_rascunho_v2(
  uuid, date, text, jsonb, jsonb, numeric, integer, boolean
) from public, anon;

grant execute on function public.avaliar_health_score_professor_v3_comparabilidade(
  numeric, numeric, integer, boolean, numeric, integer, boolean
) to authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_config_ui(date)
  to authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_config_ui()
  to authenticated, service_role;
grant execute on function public.criar_health_score_professor_v3_config_rascunho_v2(
  date, text, uuid
) to authenticated, service_role;
grant execute on function public.criar_health_score_professor_v3_config_revisao_ciclo_aberto_v2(
  uuid, date, date, text
) to authenticated, service_role;
grant execute on function public.salvar_health_score_professor_v3_config_rascunho_v2(
  uuid, date, text, jsonb, jsonb, numeric, integer, boolean
) to authenticated, service_role;

commit;
