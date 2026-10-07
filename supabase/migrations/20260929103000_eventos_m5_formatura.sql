alter table public.evento_participacao
  add column if not exists formatura boolean not null default false,
  add column if not exists formatura_tipo text
    check (formatura_tipo in ('kids', 'la')),
  add constraint evento_participacao_formatura_coerente
    check (formatura = false or formatura_tipo is not null);
comment on column public.evento_participacao.formatura is
  'Este aluno se FORMA neste recital (Kids -> LA ou conclusao). Marca a participacao, '
  'nao a apresentacao: e da pessoa, vale para todos os cursos dela no evento.';
