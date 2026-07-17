-- Gate 3 - hardening de indices e escopo das policies existentes.

create index if not exists idx_aluno_professor_transicoes_automacao_log
  on public.aluno_professor_transicoes (automacao_log_id)
  where automacao_log_id is not null;

create index if not exists idx_aluno_professor_transicoes_curso
  on public.aluno_professor_transicoes (curso_id)
  where curso_id is not null;

create index if not exists idx_aluno_professor_transicoes_curso_anterior
  on public.aluno_professor_transicoes (curso_anterior_id)
  where curso_anterior_id is not null;

create index if not exists idx_aluno_professor_transicoes_motivo_saida
  on public.aluno_professor_transicoes (motivo_saida_id)
  where motivo_saida_id is not null;

create index if not exists idx_aluno_professor_transicoes_revisado_por
  on public.aluno_professor_transicoes (revisado_por)
  where revisado_por is not null;

create index if not exists idx_professor_passagem_bastao_curso
  on public.professor_passagem_bastao (curso_id)
  where curso_id is not null;

drop policy if exists "service_role_all_aluno_professor_transicoes"
  on public.aluno_professor_transicoes;
create policy "service_role_all_aluno_professor_transicoes"
  on public.aluno_professor_transicoes
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service_role_all_professor_passagem_bastao"
  on public.professor_passagem_bastao;
create policy "service_role_all_professor_passagem_bastao"
  on public.professor_passagem_bastao
  for all
  to service_role
  using (true)
  with check (true);
