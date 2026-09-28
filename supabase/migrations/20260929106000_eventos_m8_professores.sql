alter table public.evento_apresentacao
  add column if not exists professor_palco_id integer references public.professores(id),
  add column if not exists professor_apoio_id integer references public.professores(id),
  add constraint evento_apresentacao_professores_distintos
    check (professor_palco_id is null
           or professor_apoio_id is null
           or professor_palco_id <> professor_apoio_id);
comment on column public.evento_apresentacao.professor_palco_id is
  'Professor que SOBE ao palco junto (toca/canta com o aluno). professor_id continua sendo '
  'o dono pedagogico que lanca o relatorio no LA Teacher — sao papeis diferentes.';
comment on column public.evento_apresentacao.professor_apoio_id is
  'Professor de apoio (prepara entra/sai, afina, acompanha nos bastidores).';
