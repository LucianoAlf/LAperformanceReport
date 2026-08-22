-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

do $$
declare
  ddl text;
begin
  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='sol_caixa_corrigir_movimento_v1'
    and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';

  ddl := replace(ddl,
$src$  v_prev record;
begin$src$,
$src$  v_prev record;
  v_v3 jsonb;
begin$src$);

  ddl := replace(ddl,
$src$  v_aut := public.sol_caixa_autorizar_payload_v1(v_unidade, p_payload, 'corrigir_movimento');
  if not coalesce((v_aut->>'autorizado')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'ator_nao_autorizado', 'auth', v_aut);
  end if;

  v_forma :=$src$,
$src$  v_aut := public.sol_caixa_autorizar_payload_v1(v_unidade, p_payload, 'corrigir_movimento');
  if not coalesce((v_aut->>'autorizado')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'ator_nao_autorizado', 'auth', v_aut);
  end if;

  v_v3 := public.sol_caixa_v3_validar_approval_v1(p_payload, 'corrigir_movimento');
  if not coalesce((v_v3->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', coalesce(v_v3->>'motivo', 'approval_v3_invalido'), 'v3', v_v3);
  end if;

  v_forma :=$src$);

  if ddl not like '%sol_caixa_v3_validar_approval_v1(p_payload, ''corrigir_movimento'')%' then
    raise exception 'patch_corrigir_movimento_v3_nao_aplicado';
  end if;
  execute ddl;

  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='sol_caixa_estornar_movimento_v1'
    and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';

  ddl := replace(ddl,
$src$  v_prev record;
begin$src$,
$src$  v_prev record;
  v_v3 jsonb;
begin$src$);

  ddl := replace(ddl,
$src$  v_aut := public.sol_caixa_autorizar_payload_v1(v_unidade, p_payload, 'estornar_movimento');
  if not coalesce((v_aut->>'autorizado')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'ator_nao_autorizado', 'auth', v_aut);
  end if;

  v_tipo_estorno :=$src$,
$src$  v_aut := public.sol_caixa_autorizar_payload_v1(v_unidade, p_payload, 'estornar_movimento');
  if not coalesce((v_aut->>'autorizado')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'ator_nao_autorizado', 'auth', v_aut);
  end if;

  v_v3 := public.sol_caixa_v3_validar_approval_v1(p_payload, 'estornar_movimento');
  if not coalesce((v_v3->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', coalesce(v_v3->>'motivo', 'approval_v3_invalido'), 'v3', v_v3);
  end if;

  v_tipo_estorno :=$src$);

  if ddl not like '%sol_caixa_v3_validar_approval_v1(p_payload, ''estornar_movimento'')%' then
    raise exception 'patch_estornar_movimento_v3_nao_aplicado';
  end if;
  execute ddl;
end $$;

revoke execute on function public.sol_caixa_corrigir_movimento_v1(jsonb) from public, anon, authenticated, sol_caixa_readonly;
revoke execute on function public.sol_caixa_estornar_movimento_v1(jsonb) from public, anon, authenticated, sol_caixa_readonly;
grant execute on function public.sol_caixa_corrigir_movimento_v1(jsonb) to sol_acesso_restrito, service_role;
grant execute on function public.sol_caixa_estornar_movimento_v1(jsonb) to sol_acesso_restrito, service_role;
