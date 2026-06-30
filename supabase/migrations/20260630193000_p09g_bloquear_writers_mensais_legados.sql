-- ============================================================================
-- P09G - Bloqueio de writers mensais legados para usuarios comuns
-- Projeto alvo: ouqwbbermlzqqvtqwlul
--
-- Objetivo:
-- - Impedir que chamadas anonimas/autenticadas acionem writers antigos de
--   snapshot/recalculo/fechamento de dados_mensais.
-- - Manter execucao apenas por service_role, para fluxos guardados.
--
-- Nao faz:
-- - Nao chama nenhum writer.
-- - Nao altera dados_mensais.
-- - Nao fecha competencia.
-- - Nao grava snapshot.
-- ============================================================================

DO $block$
DECLARE
  v_func record;
BEGIN
  FOR v_func IN
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'snapshot_dados_mensais',
        'fechar_dados_mensais',
        'recalcular_dados_mensais',
        'upsert_dados_mensais'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_func.func_signature
    );

    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      v_func.func_signature
    );
  END LOOP;
END;
$block$;

COMMENT ON FUNCTION public.atualizar_dados_mensais_por_snapshot(integer, integer, uuid, boolean) IS
  'Atualiza dados_mensais de compatibilidade usando snapshots aprovados/fechados. Dry-run por padrao; substitui chamadas legadas para competencias fechadas.';
