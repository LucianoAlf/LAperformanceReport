-- C1 Sprint 4: identidade/permissões — revoga PUBLIC/anon das 4 funções chamadas
-- só pelo front autenticado (AuthContext). Mantém authenticated/service_role/postgres.
--
-- DELIBERADAMENTE FORA (exceção permanente): is_admin, is_admin_usuario,
-- get_user_unidade_id, get_unidade_usuario são helpers usados em policies RLS com
-- roles={public}. Precisam continuar executáveis por anon, senão a avaliação do RLS
-- dispara 'permission denied for function' quando anon toca alunos/leads/metas/etc.
-- São inofensivas (retornam boolean/uuid do auth.uid() do chamador; anon = false/null).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'usuario_permissoes','usuario_perfis_lista','usuario_tem_permissao','admin_update_user_password'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
  END LOOP;
END $$;
