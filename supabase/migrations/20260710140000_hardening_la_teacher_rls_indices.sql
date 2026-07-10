-- Policies explicitas para o service role e indices de suporte das novas FKs.

drop policy if exists aula_alunos_emusys_service_role on public.aula_alunos_emusys;
create policy aula_alunos_emusys_service_role
  on public.aula_alunos_emusys
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists aluno_presenca_administrativo_service_role on public.aluno_presenca_administrativo;
create policy aluno_presenca_administrativo_service_role
  on public.aluno_presenca_administrativo
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists professor_ponto_confirmacoes_service_role on public.professor_ponto_confirmacoes;
create policy professor_ponto_confirmacoes_service_role
  on public.professor_ponto_confirmacoes
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists aluno_presenca_retificacoes_service_role on public.aluno_presenca_retificacoes;
create policy aluno_presenca_retificacoes_service_role
  on public.aluno_presenca_retificacoes
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists idx_aula_alunos_emusys_unidade
  on public.aula_alunos_emusys (unidade_id, aula_emusys_id);

create index if not exists idx_aluno_presenca_administrativo_aula
  on public.aluno_presenca_administrativo (aula_emusys_id, aluno_id);

create index if not exists idx_aluno_presenca_administrativo_unidade
  on public.aluno_presenca_administrativo (unidade_id, aula_emusys_id);

create index if not exists idx_professor_ponto_confirmacoes_aula
  on public.professor_ponto_confirmacoes (aula_emusys_id);

create index if not exists idx_professor_ponto_confirmacoes_unidade_data
  on public.professor_ponto_confirmacoes (unidade_id, data_aula);

create index if not exists idx_aluno_presenca_retificacoes_presenca
  on public.aluno_presenca_retificacoes (aluno_presenca_id, created_at desc);

create index if not exists idx_aluno_presenca_retificacoes_unidade
  on public.aluno_presenca_retificacoes (unidade_id, created_at desc);

create index if not exists idx_aluno_presenca_retificacoes_autor
  on public.aluno_presenca_retificacoes (autor_usuario_id, created_at desc);

create index if not exists idx_disponibilidade_propostas_vinculo
  on public.disponibilidade_professor_propostas (professores_unidade_id);

create index if not exists idx_disponibilidade_propostas_decisor
  on public.disponibilidade_professor_propostas (decidido_por_usuario_id)
  where decidido_por_usuario_id is not null;

create index if not exists idx_disponibilidade_propostas_efetivador
  on public.disponibilidade_professor_propostas (efetivado_por_usuario_id)
  where efetivado_por_usuario_id is not null;
