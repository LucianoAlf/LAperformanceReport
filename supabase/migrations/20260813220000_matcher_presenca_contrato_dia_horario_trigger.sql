-- Matcher do vinculo aula-aluno (trigger de INSERT de aula_alunos_emusys):
-- passa a resolver o aluno pelo CONTRATO da aula (matricula_disciplina_id ->
-- jornada) e, na linha container (sem contrato), desempata entre as varias
-- matriculas da mesma pessoa usando o dia/horario da grade.
--
-- Caso que motivou (2026-08-13): Vinicius Lopa (Campo Grande) tem 3 matriculas
-- de Power Kids ativas simultaneas, cada uma com dia/horario proprio. O
-- desempate antigo (curso -> ativo -> menor id) escolhia a mesma matricula
-- para qualquer aula de Power Kids, e o sync de presenca (fallback por nome,
-- instavel entre runs) gravava presenca para ids diferentes na MESMA aula —
-- o mesmo aluno aparecia 3x na chamada da Agenda.

create or replace function public.fn_aula_alunos_emusys_casar_aluno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_emusys_id integer;
  v_candidato integer;
  v_candidatos integer[];
begin
  if new.aluno_id is not null or new.aluno_emusys_id is null then
    return new;
  end if;

  -- 1) CONTRATO DA AULA: matricula_disciplina_id > 0 tem dono unico na
  -- jornada. Resolve sem depender de nome, mesmo com varias matriculas
  -- ativas da mesma pessoa.
  select j.aluno_id into v_candidato
  from aulas_emusys ae
  join aluno_jornada_matricula_disciplina j
    on j.unidade_id = ae.unidade_id
   and j.emusys_matricula_disciplina_id = ae.matricula_disciplina_id
  where ae.id = new.aula_emusys_id
    and ae.matricula_disciplina_id > 0
    and j.status_matricula is distinct from 'finalizada'
  limit 1;

  if v_candidato is not null then
    new.aluno_id := v_candidato;
    return new;
  end if;

  select ae.curso_emusys_id into v_curso_emusys_id
  from aulas_emusys ae
  where ae.id = new.aula_emusys_id;

  -- 2) DIA/HORARIO (linha container, sem contrato): entre as matriculas da
  -- pessoa, so uma tem grade no dia e hora da aula. Reagendada usa o horario
  -- original (a jornada reflete a grade regular do contrato).
  select array_agg(c.id) into v_candidatos
  from (
    select a.id
    from alunos a
    join aluno_jornada_matricula_disciplina j
      on j.aluno_id = a.id
     and j.unidade_id = new.unidade_id
     and j.status_matricula is distinct from 'finalizada'
    cross join aulas_emusys ae
    where ae.id = new.aula_emusys_id
      and a.emusys_student_id = new.aluno_emusys_id::text
      and a.unidade_id = new.unidade_id
      and j.dia_semana is not null and j.horario is not null
      and lower(unaccent(split_part(j.dia_semana, '-', 1))) =
          (case extract(isodow from (coalesce(ae.data_hora_inicio_original, ae.data_hora_inicio) at time zone 'America/Sao_Paulo'))
             when 1 then 'segunda'
             when 2 then 'terca'
             when 3 then 'quarta'
             when 4 then 'quinta'
             when 5 then 'sexta'
             when 6 then 'sabado'
             else 'domingo'
           end)
      and left(j.horario::text, 5) =
          to_char((coalesce(ae.data_hora_inicio_original, ae.data_hora_inicio) at time zone 'America/Sao_Paulo'), 'HH24:MI')
    group by a.id
  ) c;

  if v_candidatos is not null and cardinality(v_candidatos) = 1 then
    new.aluno_id := v_candidatos[1];
    return new;
  end if;

  -- 3) Fallback antigo: desempata pelo curso da aula (alunos sao MATRICULAS,
  -- nao pessoas: a mesma pessoa com 2 cursos tem 2 linhas com o mesmo
  -- emusys_student_id).
  select a.id into new.aluno_id
  from alunos a
  left join cursos c on c.id = a.curso_id
  where a.emusys_student_id = new.aluno_emusys_id::text
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
