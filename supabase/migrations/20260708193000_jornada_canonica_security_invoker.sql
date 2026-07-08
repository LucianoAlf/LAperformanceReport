-- Hardening da camada canonica de jornada.
-- Mantem leitura autenticada sob RLS e evita bypass por SECURITY DEFINER em views/RPCs.

drop policy if exists "authenticated_select_aluno_jornada_matricula_disciplina"
  on public.aluno_jornada_matricula_disciplina;

create policy "authenticated_select_aluno_jornada_matricula_disciplina"
  on public.aluno_jornada_matricula_disciplina
  for select
  to authenticated
  using (true);

grant select on public.aluno_jornada_matricula_disciplina to authenticated;

alter view public.vw_jornada_aluno_atual set (security_invoker = on);
alter view public.vw_jornada_aluno_com_presenca set (security_invoker = on);
alter view public.vw_jornada_professor_atual set (security_invoker = on);
alter view public.vw_jornada_marcos set (security_invoker = on);

alter function public.get_jornada_aluno(integer) security invoker;
alter function public.get_jornada_professor(integer) security invoker;
