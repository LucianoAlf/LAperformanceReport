-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create or replace function public.sol_caixa_v3_validar_approval_v1(
  p_payload jsonb,
  p_operacao text default 'lancar_recebimento'
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_preview_id uuid := nullif(p_payload->>'v3_preview_id','')::uuid;
  v_approval_id uuid := nullif(p_payload->>'v3_approval_id','')::uuid;
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_valor_centavos int;
  v_categoria text := lower(coalesce(nullif(p_payload->>'categoria',''), ''));
  v_forma text := lower(coalesce(nullif(p_payload->>'forma',''), ''));
  v_chat text := coalesce(nullif(p_payload->>'grupo_jid',''), nullif(p_payload->>'chat_id',''));
  v_ator_numero text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_actor_hash text := nullif(p_payload->>'v3_actor_id_hash','');
  v_preview_hash text := nullif(p_payload->>'v3_preview_hash','');
  v_approval_event_hash text := nullif(p_payload->>'v3_approval_event_hash','');
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_operacao text := lower(coalesce(nullif(p_operacao,''), ''));
  v_preview_operacao_esperada text;
  v_policy_any boolean := false;
  v_grupo_ok jsonb;
  v_auth jsonb;
  v_p public.sol_caixa_shadow_previews_v1%rowtype;
  v_a public.sol_caixa_shadow_approvals_v1%rowtype;
  v_e public.sol_caixa_shadow_eventos_v1%rowtype;
  v_motivo text;
begin
  if p_payload ? 'valor' and nullif(p_payload->>'valor','') is not null then
    v_valor_centavos := round((p_payload->>'valor')::numeric * 100)::int;
  end if;

  v_preview_operacao_esperada := case v_operacao
    when 'lancar_recebimento' then 'entrada'
    when 'lancar_saida' then 'saida'
    when 'corrigir_forma_recebimento' then 'correcao_forma'
    when 'corrigir_movimento' then 'correcao_movimento'
    when 'estornar_movimento' then 'estorno'
    else null
  end;

  if v_preview_id is null then v_motivo := 'v3_preview_id_obrigatorio';
  elsif v_approval_id is null then v_motivo := 'v3_approval_id_obrigatorio';
  elsif v_unidade is null then v_motivo := 'unidade_invalida';
  elsif v_chat is null then v_motivo := 'grupo_jid_obrigatorio';
  elsif v_ator_numero is null or length(v_ator_numero) < 8 then v_motivo := 'ator_numero_obrigatorio_v3';
  elsif v_actor_hash is null then v_motivo := 'v3_actor_hash_obrigatorio';
  elsif v_preview_hash is null then v_motivo := 'v3_preview_hash_obrigatorio';
  elsif v_preview_operacao_esperada is null then v_motivo := 'operacao_v3_nao_suportada';
  end if;

  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;

  select coalesce(autoriza_qualquer_membro, false)
    into v_policy_any
  from public.sol_caixa_unidade_policy
  where unidade_id = v_unidade;

  if coalesce(v_policy_any, false) then
    v_grupo_ok := public.sol_caixa_grupo_operacao_ok(v_unidade, v_chat, v_operacao);
    if not coalesce((v_grupo_ok->>'autorizado')::boolean, false) then
      return jsonb_build_object('ok', false, 'motivo', 'grupo_oficial_obrigatorio_v3', 'grupo_auth', v_grupo_ok);
    end if;
  end if;

  v_auth := public.sol_caixa_autorizar_payload_v1(v_unidade, p_payload, v_operacao);
  if not coalesce((v_auth->>'autorizado')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'ator_nao_autorizado_v3', 'auth', v_auth);
  end if;

  if v_valor_centavos is null then
    return jsonb_build_object('ok', false, 'motivo', 'valor_obrigatorio_v3');
  elsif v_forma = '' then
    return jsonb_build_object('ok', false, 'motivo', 'forma_obrigatoria_v3');
  elsif v_categoria = '' then
    return jsonb_build_object('ok', false, 'motivo', 'categoria_obrigatoria_v3');
  end if;

  select * into v_p
  from public.sol_caixa_shadow_previews_v1
  where id = v_preview_id
  for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'preview_v3_nao_encontrado');
  end if;

  select * into v_a
  from public.sol_caixa_shadow_approvals_v1
  where id = v_approval_id
    and preview_id = v_preview_id
  for update;
  if v_a.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'approval_v3_nao_encontrado');
  end if;

  select * into v_e
  from public.sol_caixa_shadow_eventos_v1
  where id = v_p.evento_id;
  if v_e.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'evento_v3_nao_encontrado');
  end if;

  if v_a.decision <> 'approved' then
    return jsonb_build_object('ok', false, 'motivo', 'approval_nao_aprovado');
  elsif v_a.actor_id_hash is null then
    return jsonb_build_object('ok', false, 'motivo', 'approval_ator_obrigatorio_v3');
  elsif v_a.criado_em < now() - interval '4 hours' then
    return jsonb_build_object('ok', false, 'motivo', 'approval_expirado');
  elsif v_p.unidade_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'preview_unidade_obrigatoria_v3');
  elsif v_p.unidade_id is distinct from v_unidade then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_divergente_v3');
  elsif v_e.unidade_id is not null and v_e.unidade_id is distinct from v_unidade then
    return jsonb_build_object('ok', false, 'motivo', 'evento_unidade_divergente_v3');
  elsif v_e.chat_id_hash <> md5(v_chat) then
    return jsonb_build_object('ok', false, 'motivo', 'grupo_divergente_v3');
  elsif v_a.actor_id_hash is distinct from v_actor_hash then
    return jsonb_build_object('ok', false, 'motivo', 'ator_divergente_v3');
  elsif v_approval_event_hash is not null and v_a.approval_event_hash is distinct from v_approval_event_hash then
    return jsonb_build_object('ok', false, 'motivo', 'approval_evento_divergente_v3');
  elsif v_p.preview_hash <> v_preview_hash then
    return jsonb_build_object('ok', false, 'motivo', 'preview_hash_divergente_v3');
  elsif lower(coalesce(v_p.operacao, '')) is distinct from v_preview_operacao_esperada then
    return jsonb_build_object('ok', false, 'motivo', 'operacao_divergente_v3', 'preview_operacao', v_p.operacao, 'operacao_esperada', v_preview_operacao_esperada);
  elsif v_p.valor_centavos is null then
    return jsonb_build_object('ok', false, 'motivo', 'preview_valor_obrigatorio_v3');
  elsif v_p.valor_centavos is distinct from v_valor_centavos then
    return jsonb_build_object('ok', false, 'motivo', 'valor_divergente_v3');
  elsif v_p.forma is null or lower(v_p.forma) = '' or lower(v_p.forma) = 'unknown' then
    return jsonb_build_object('ok', false, 'motivo', 'preview_forma_obrigatoria_v3');
  elsif lower(v_p.forma) is distinct from v_forma then
    return jsonb_build_object('ok', false, 'motivo', 'forma_divergente_v3');
  elsif v_p.categoria is null or lower(v_p.categoria) = '' or lower(v_p.categoria) = 'unknown' then
    return jsonb_build_object('ok', false, 'motivo', 'preview_categoria_obrigatoria_v3');
  elsif lower(v_p.categoria) is distinct from v_categoria then
    return jsonb_build_object('ok', false, 'motivo', 'categoria_divergente_v3');
  end if;

  insert into public.sol_caixa_v3_approval_consumos_v1
    (approval_id, preview_id, unidade_id, operacao, idempotency_key, payload_hash)
  values
    (v_approval_id, v_preview_id, v_unidade, v_operacao, v_key, md5(p_payload::text));

  return jsonb_build_object('ok', true, 'preview_id', v_preview_id, 'approval_id', v_approval_id, 'operacao', v_operacao, 'preview_operacao', v_p.operacao);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'approval_v3_ja_consumido');
end;
$function$;

revoke execute on function public.sol_caixa_v3_validar_approval_v1(jsonb, text) from public, anon, authenticated, sol_caixa_readonly;
grant execute on function public.sol_caixa_v3_validar_approval_v1(jsonb, text) to sol_acesso_restrito, service_role;
