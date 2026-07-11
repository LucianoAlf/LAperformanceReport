-- Policy de leitura de risco_evasao pro frontend (tela Sucesso do Aluno).
-- Escopo por unidade, mesmo padrao de public.alunos: admin ve tudo, demais so
-- veem o risco dos alunos da propria unidade. O upsert continua sendo feito pela
-- edge com service_role (bypassa RLS), entao so precisamos da policy de SELECT.

CREATE POLICY risco_evasao_select_policy ON public.risco_evasao
  FOR SELECT
  USING (is_admin() OR (unidade_id = get_user_unidade_id()));
