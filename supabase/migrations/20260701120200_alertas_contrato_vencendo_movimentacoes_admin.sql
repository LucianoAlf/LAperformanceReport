-- Task 13 (aposentar renovacoes): ramo CONTRATO_VENCENDO de vw_alertas_inteligentes deixa de
-- fazer join na tabela legada renovacoes (que usava status 'concluida' inexistente -> join morto,
-- contava TODOS os contratos vencendo). Passa a excluir quem tem renovacao confirmada nos ultimos
-- 90 dias em movimentacoes_admin. Preserva security_invoker=on. Demais 6 ramos intactos.
DO $$
DECLARE
  v_def text;
  v_new text;
  v_old text := 'LEFT JOIN renovacoes r ON r.aluno_id = a.id AND r.data_fim_novo_contrato > a.data_fim_contrato AND r.status::text = ''concluida''::text';
  v_repl text := 'LEFT JOIN movimentacoes_admin r ON r.aluno_id = a.id AND r.tipo::text = ''renovacao''::text AND r.renovacao_status = ANY (ARRAY[''confirmada''::text, ''antecipada_confirmada''::text]) AND r.data >= (CURRENT_DATE - ''90 days''::interval)';
BEGIN
  SELECT pg_get_viewdef('public.vw_alertas_inteligentes'::regclass, true) INTO v_def;
  v_new := replace(v_def, v_old, v_repl);
  IF v_new = v_def THEN
    RAISE EXCEPTION 'LEFT JOIN renovacoes nao encontrado - replace falhou, nada aplicado';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_alertas_inteligentes WITH (security_invoker=on) AS ' || v_new;
END $$;
