-- Completa a cobertura da FK de revisao humana para instalacoes ja migradas.
create index if not exists
  idx_professor_curso_modalidade_revisado_por
  on public.professor_unidade_curso_modalidade (revisado_por)
  where revisado_por is not null;
