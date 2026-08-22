-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION public.sol_caixa_readonly_preflight_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT jsonb_build_object(
    'function', 'sol_caixa_readonly_preflight_v1',
    'function_current_user', current_user,
    'function_session_user', session_user,
    'role_setting', current_setting('role', true),
    'financial_groups', (
      SELECT jsonb_build_object(
        'total', count(*),
        'active', count(*) FILTER (WHERE ativo),
        'items', coalesce(jsonb_agg(jsonb_build_object(
          'grupo_jid_md5', md5(grupo_jid),
          'unidade_id', unidade_id,
          'nome_grupo', nome_grupo,
          'ativo', ativo
        ) ORDER BY nome_grupo), '[]'::jsonb)
      )
      FROM public.caixa_financeiro_grupos_whatsapp
    ),
    'unit_policy', (
      SELECT jsonb_build_object(
        'total', count(*),
        'autoriza_qualquer_membro_true', count(*) FILTER (WHERE autoriza_qualquer_membro)
      )
      FROM public.sol_caixa_unidade_policy
    ),
    'authorized_actors', (
      SELECT jsonb_build_object(
        'total', count(*),
        'active', count(*) FILTER (WHERE ativo)
      )
      FROM public.sol_caixa_autorizados
    ),
    'safe_whatsapp_view_count', (
      SELECT count(*) FROM public.vw_whatsapp_caixas_departamento
    ),
    'generated_at_utc', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;

REVOKE ALL ON FUNCTION public.sol_caixa_readonly_preflight_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sol_caixa_readonly_preflight_v1() TO sol_caixa_readonly;
COMMENT ON FUNCTION public.sol_caixa_readonly_preflight_v1() IS 'Safe read-only preflight source for Sol Caixa V3 Gate B real. Returns hashed group ids and aggregate policy counts only.';
