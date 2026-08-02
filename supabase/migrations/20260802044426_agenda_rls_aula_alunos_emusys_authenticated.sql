-- Achado 1 (revisao final do modulo Agenda): get_agenda_dia e SECURITY INVOKER e
-- le aula_alunos_emusys, que nao tinha GRANT SELECT para `authenticated` nem policy
-- para esse role -> a tela inteira quebrava com "permission denied".
-- O GRANT sozinho nao resolve: com RLS ligada e so a policy de service_role, o
-- authenticated leria ZERO linhas e toda aula viraria "Sem aluno vinculado".
-- Por isso GRANT + policy de SELECT escopada por unidade, na MESMA forma que
-- `aluno_presenca` ja usa nesta base. A policy de service_role continua intacta.

GRANT SELECT ON TABLE public.aula_alunos_emusys TO authenticated;

DROP POLICY IF EXISTS aula_alunos_emusys_leitura_escopada ON public.aula_alunos_emusys;

CREATE POLICY aula_alunos_emusys_leitura_escopada
  ON public.aula_alunos_emusys
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR (unidade_id IN (SELECT get_user_unidade_ids()))
    -- a tabela nao tem professor_id proprio; o equivalente ao terceiro termo de
    -- `aluno_presenca` vem da aula pai (aulas_emusys ja e legivel por authenticated).
    OR EXISTS (
      SELECT 1 FROM public.aulas_emusys ae
      WHERE ae.id = aula_alunos_emusys.aula_emusys_id
        AND ae.professor_id = fn_professor_do_usuario()
    )
  );

-- get_agenda_dia estava executavel por PUBLIC (logo, tambem por anon).
REVOKE EXECUTE ON FUNCTION public.get_agenda_dia(date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_agenda_dia(date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_agenda_dia(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agenda_dia(date, uuid) TO service_role;
