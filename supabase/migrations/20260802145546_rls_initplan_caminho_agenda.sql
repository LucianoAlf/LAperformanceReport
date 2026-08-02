-- Envolve chamadas de funcao INDEPENDENTES DA LINHA em (select ...) para que o
-- Postgres as avalie uma vez por query (InitPlan) em vez de uma vez por linha.
--
-- Semantica IDENTICA: os predicados sao os mesmos, so mudou onde a funcao e
-- avaliada. Nenhum EXISTS correlacionado foi tocado. Todos sao ALTER POLICY,
-- entao roles, cmd e permissividade ficam intactos por construcao.
--
-- Escopo: apenas as tabelas do caminho da RPC get_agenda_dia (SECURITY INVOKER,
-- assim como as views vw_jornada_aluno_atual e vw_risco_evasao_atual).
--
-- Medido: get_agenda_dia('2026-08-04', null) como authenticated (admin)
--   antes  1175 ms / 78435 buffers
--   depois   95 ms / 25283 buffers   (mesmas 186 aulas)
-- Por tabela: aula_alunos_emusys 341 -> 6,7 ms; alunos 33 -> 2,2 ms.
--
-- Equivalencia verificada antes/depois com JWT real de 3 perfis (admin,
-- unidade Campo Grande, professor): contagem de linhas visiveis identica em
-- aula_alunos_emusys, aluno_presenca, alunos, aluno_jornada_matricula_disciplina,
-- risco_evasao, vw_risco_evasao_atual e vw_jornada_aluno_atual.
--
-- Este e o BLOCO A de um levantamento maior: o mesmo padrao existe em ~90
-- outras policies fora do caminho da Agenda (leads, metas, movimentacoes,
-- salas, cursos...). Nao foram tocadas aqui de proposito.

-- O EXISTS correlacionado (ae.id = aula_alunos_emusys.aula_emusys_id) continua
-- por linha, como tem de ser; so fn_professor_do_usuario() saiu de dentro dele.
alter policy "aula_alunos_emusys_leitura_escopada" on public.aula_alunos_emusys
  using (
    (select is_admin())
    or (unidade_id in (select get_user_unidade_ids()))
    or (exists (
          select 1 from aulas_emusys ae
          where ae.id = aula_alunos_emusys.aula_emusys_id
            and ae.professor_id = (select fn_professor_do_usuario())
       ))
  );

alter policy "aluno_presenca_leitura_escopada" on public.aluno_presenca
  using (
    (select is_admin())
    or (unidade_id in (select get_user_unidade_ids()))
    or (professor_id = (select fn_professor_do_usuario()))
  );

alter policy "alunos_select_policy" on public.alunos
  using ((select is_admin()) or (unidade_id in (select get_user_unidade_ids())));

-- cmd=ALL com TO public: e avaliada tambem para authenticated, por linha.
alter policy "service_role_all_aluno_jornada_matricula_disciplina"
  on public.aluno_jornada_matricula_disciplina
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);

alter policy "risco_evasao_select_policy" on public.risco_evasao
  using ((select is_admin()) or (unidade_id in (select get_user_unidade_ids())));
