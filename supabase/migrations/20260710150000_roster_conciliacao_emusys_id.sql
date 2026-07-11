-- Concilia roster somente quando o ID Emusys identifica um unico aluno na unidade.

with candidatos as (
  select
    r.unidade_id,
    r.aluno_emusys_id,
    min(a.id) as aluno_id
  from public.aula_alunos_emusys r
  join public.alunos a
    on a.unidade_id = r.unidade_id
   and a.emusys_student_id = r.aluno_emusys_id::text
  where r.aluno_id is null
    and r.aluno_emusys_id is not null
  group by r.unidade_id, r.aluno_emusys_id
  having count(distinct a.id) = 1
)
update public.aula_alunos_emusys r
set
  aluno_id = c.aluno_id,
  updated_at = now()
from candidatos c
where r.aluno_id is null
  and r.unidade_id = c.unidade_id
  and r.aluno_emusys_id = c.aluno_emusys_id;
