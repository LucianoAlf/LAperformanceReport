-- Auditoria de segurança C1 — Sprint 2: financeiro / estoque / penalidades (17 funções)
-- Camada 1: revoga EXECUTE de PUBLIC/anon (fecha acesso da internet pública via anon key).
-- Mantém authenticated (front: hooks useCaixaDiario/useFidelizaPrograma/useMatriculadorPrograma),
-- service_role e postgres (lojinha via edge, cron de inadimplência).
-- Bloco dinâmico cobre todos os overloads (registrar_venda_v2/_legacy têm 13 args).
--
-- ⚠️ Camada 2 (NÃO tratada aqui): 16 destas 17 são SECURITY DEFINER SEM guarda interna
-- (não checam admin/unidade). Qualquer autenticado ainda pode chamá-las. Tratar em sprint
-- próprio após definir a regra de negócio (quem pode vender/baixar estoque/penalizar).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'registrar_venda_v2','registrar_venda_legacy','registrar_entrada_estoque',
      'registrar_entrada_estoque_v2','ajustar_estoque_manual','estornar_venda','estoque_disponivel',
      'registrar_penalidade_fideliza','deletar_penalidade_fideliza','registrar_penalidade_matriculador',
      'deletar_penalidade_matriculador','salvar_historico_trimestral_fideliza','atualizar_config_fideliza',
      'atualizar_config_matriculador','marcar_inadimplentes_apos_vencimento','rpc_marcar_inadimplentes',
      'reabrir_caixa_diario'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
  END LOOP;
END $$;
