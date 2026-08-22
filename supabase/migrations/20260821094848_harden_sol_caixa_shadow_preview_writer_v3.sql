-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create or replace function public.sol_caixa_shadow_registrar(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_event_id uuid;
  v_preview_id uuid;
  v_event_hash text := nullif(p_payload->>'event_id_hash', '');
  v_preview_hash text := nullif(p_payload->>'preview_hash', '');
  v_unidade_id uuid;
  v_operacao text := lower(coalesce(nullif(p_payload->>'operacao', ''), ''));
  v_categoria text := lower(coalesce(nullif(p_payload->>'categoria', ''), ''));
  v_forma text := lower(coalesce(nullif(p_payload->>'forma', ''), ''));
  v_valor_centavos integer;
  v_preview_status text := lower(coalesce(nullif(p_payload->>'preview_status', ''), 'shadow_private'));
  v_financial_ops constant text[] := array['entrada','saida','correcao_forma','correcao_movimento','estorno'];
  v_requires_financial_contract boolean := false;
begin
  if v_event_hash is null then
    raise exception 'event_id_hash obrigatório';
  end if;

  if nullif(p_payload->>'unidade_id', '') is not null then
    v_unidade_id := nullif(p_payload->>'unidade_id', '')::uuid;
  end if;

  if nullif(p_payload->>'valor_centavos', '') is not null then
    v_valor_centavos := nullif(p_payload->>'valor_centavos', '')::integer;
  end if;

  insert into public.sol_caixa_shadow_eventos_v1 (
    event_id_hash, chat_id_hash, sender_id_hash, unidade_id, observed_at,
    source, mode, status, raw_ref, resolver_json, warnings, blocks
  ) values (
    v_event_hash,
    coalesce(nullif(p_payload->>'chat_id_hash', ''), 'unknown'),
    nullif(p_payload->>'sender_id_hash', ''),
    v_unidade_id,
    nullif(p_payload->>'observed_at', '')::timestamptz,
    coalesce(nullif(p_payload->>'source', ''), 'sol_whatsapp_group_observe'),
    coalesce(nullif(p_payload->>'mode', ''), 'shadow_inline_private'),
    coalesce(nullif(p_payload->>'status', ''), 'observed'),
    coalesce(p_payload->'raw_ref', '{}'::jsonb),
    coalesce(p_payload->'resolver_json', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'warnings', '[]'::jsonb))), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'blocks', '[]'::jsonb))), '{}'::text[])
  )
  on conflict (event_id_hash) do update set
    status = excluded.status,
    resolver_json = excluded.resolver_json,
    warnings = excluded.warnings,
    blocks = excluded.blocks,
    atualizado_em = now()
  returning id into v_event_id;

  if v_preview_hash is not null then
    v_requires_financial_contract :=
      v_operacao = any(v_financial_ops)
      or v_preview_status in ('awaiting_approval','approved','written');

    if v_requires_financial_contract then
      if not (v_operacao = any(v_financial_ops)) then
        raise exception 'operacao_financeira_v3_invalida: %', coalesce(v_operacao, 'null');
      elsif v_unidade_id is null then
        raise exception 'unidade_obrigatoria_preview_v3';
      elsif v_valor_centavos is null then
        raise exception 'valor_obrigatorio_preview_v3';
      elsif v_forma = '' or v_forma = 'unknown' then
        raise exception 'forma_obrigatoria_preview_v3';
      elsif v_categoria = '' or v_categoria = 'unknown' then
        raise exception 'categoria_obrigatoria_preview_v3';
      end if;
    end if;

    insert into public.sol_caixa_shadow_previews_v1 (
      evento_id, preview_hash, unidade_id, operacao, categoria, valor_centavos,
      forma, status, preview_json
    ) values (
      v_event_id,
      v_preview_hash,
      v_unidade_id,
      nullif(v_operacao, ''),
      nullif(v_categoria, ''),
      v_valor_centavos,
      nullif(v_forma, ''),
      v_preview_status,
      coalesce(p_payload->'preview_json', '{}'::jsonb)
    )
    on conflict (evento_id, preview_hash) do update set
      unidade_id = excluded.unidade_id,
      operacao = excluded.operacao,
      categoria = excluded.categoria,
      valor_centavos = excluded.valor_centavos,
      forma = excluded.forma,
      status = excluded.status,
      preview_json = excluded.preview_json
    returning id into v_preview_id;
  end if;

  return jsonb_build_object('ok', true, 'event_id', v_event_id, 'preview_id', v_preview_id);
end;
$function$;

revoke execute on function public.sol_caixa_shadow_registrar(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_shadow_registrar(jsonb) to sol_acesso_restrito;
