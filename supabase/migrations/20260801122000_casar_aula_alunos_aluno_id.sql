create or replace function public.fn_aula_alunos_casar_aluno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_emusys_id integer;
begin
  if new.aluno_id is not null or new.emusys_aluno_id is null then
    return new;
  end if;

  select ae.curso_emusys_id into v_curso_emusys_id
  from aulas_emusys ae
  where ae.id = new.aula_emusys_id;

  -- Desempate entre as matriculas da mesma pessoa:
  -- 1) a do curso desta aula, 2) matricula viva, 3) o curso principal.
  -- emusys_student_id e text no banco; compara por texto.
  select a.id into new.aluno_id
  from alunos a
  left join cursos c on c.id = a.curso_id
  where a.emusys_student_id = new.emusys_aluno_id::text
    and a.unidade_id = new.unidade_id
  order by
    (v_curso_emusys_id is not null and c.emusys_ids @> array[v_curso_emusys_id]) desc,
    (a.status = 'ativo') desc,
    coalesce(a.is_segundo_curso, false) asc,
    a.id
  limit 1;

  return new;
end;
$$;

create trigger trg_aula_alunos_casar_aluno
  before insert or update on public.aula_alunos
  for each row execute function public.fn_aula_alunos_casar_aluno();

-- Backfill do que a Task 6 ja gravou sem aluno_id: um update vazio
-- dispara o trigger e aplica o mesmo criterio de desempate.
update public.aula_alunos
set updated_at = now()
where aluno_id is null and emusys_aluno_id is not null;
