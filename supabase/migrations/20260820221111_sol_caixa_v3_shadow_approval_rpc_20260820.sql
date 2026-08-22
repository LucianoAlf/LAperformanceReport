-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create or replace function public.sol_caixa_shadow_registrar_approval(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview_id uuid;
  v_approval_event_hash text;
  v_actor_id_hash text;
  v_decision text;
  v_decision_json jsonb;
  v_existing uuid;
  v_id uuid;
begin
  v_preview_id := nullif(payload->>'preview_id', '')::uuid;
  v_approval_event_hash := nullif(payload->>'approval_event_hash', '');
  v_actor_id_hash := nullif(payload->>'actor_id_hash', '');
  v_decision := coalesce(nullif(payload->>'decision', ''), 'approved');
  v_decision_json := coalesce(payload->'decision_json', '{}'::jsonb);

  if v_preview_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'preview_id_obrigatorio');
  end if;
  if v_approval_event_hash is null then
    return jsonb_build_object('ok', false, 'motivo', 'approval_event_hash_obrigatorio');
  end if;
  if v_decision not in ('approved', 'rejected', 'correction_requested') then
    return jsonb_build_object('ok', false, 'motivo', 'decision_invalida');
  end if;
  if not exists (select 1 from public.sol_caixa_shadow_previews_v1 where id = v_preview_id) then
    return jsonb_build_object('ok', false, 'motivo', 'preview_shadow_nao_encontrado');
  end if;

  select id into v_existing
  from public.sol_caixa_shadow_approvals_v1
  where approval_event_hash = v_approval_event_hash
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'approval_id', v_existing, 'ja_registrado', true);
  end if;

  insert into public.sol_caixa_shadow_approvals_v1 (
    preview_id,
    approval_event_hash,
    actor_id_hash,
    decision,
    decision_json
  ) values (
    v_preview_id,
    v_approval_event_hash,
    v_actor_id_hash,
    v_decision,
    v_decision_json
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'approval_id', v_id, 'ja_registrado', false);
end;
$$;

revoke all on function public.sol_caixa_shadow_registrar_approval(jsonb) from public;
grant execute on function public.sol_caixa_shadow_registrar_approval(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_shadow_registrar_approval(jsonb) to service_role;
