begin;

create or replace function public.fn_resolver_jornada_curso_grade_atual_v1(
  p_unidade_id uuid,
  p_matricula_disciplina_id bigint
)
returns table (
  emusys_disciplina_id bigint,
  curso_id integer,
  curso_nome_grade text,
  modalidade text,
  aulas_evidencia integer,
  aulas_futuras integer,
  aulas_regulares integer,
  data_ultima_aula date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with candidatos as (
    select
      a.curso_emusys_id::bigint as emusys_disciplina_id,
      d.curso_id,
      coalesce(max(nullif(btrim(a.curso_nome), '')), max(c.nome)) as curso_nome_grade,
      cat.modalidade,
      count(*)::integer as aulas_evidencia,
      count(*) filter (where a.data_aula >= current_date)::integer as aulas_futuras,
      count(*)::integer as aulas_regulares,
      max(a.data_aula) as data_ultima_aula
    from public.aulas_emusys a
    join public.curso_emusys_depara d
      on d.unidade_id = a.unidade_id
     and d.emusys_disciplina_id = a.curso_emusys_id
     and d.status_mapeamento = 'mapeado'
    join public.emusys_disciplinas_catalogo cat
      on cat.unidade_id = a.unidade_id
     and cat.emusys_disciplina_id = a.curso_emusys_id
    left join public.cursos c on c.id = d.curso_id
    where a.unidade_id = p_unidade_id
      and a.matricula_disciplina_id = p_matricula_disciplina_id
      and a.data_aula between current_date - 14 and current_date + 60
      and lower(coalesce(a.categoria, 'normal')) = 'normal'
      and not coalesce(a.cancelada, false)
      and not coalesce(a.reagendada, false)
      and a.curso_emusys_id is not null
      and cat.modalidade in ('individual', 'turma')
    group by a.curso_emusys_id, d.curso_id, cat.modalidade
    having count(*) >= 2
  )
  select
    c.emusys_disciplina_id,
    c.curso_id,
    c.curso_nome_grade,
    c.modalidade,
    c.aulas_evidencia,
    c.aulas_futuras,
    c.aulas_regulares,
    c.data_ultima_aula
  from candidatos c
  order by
    c.aulas_futuras desc,
    c.data_ultima_aula desc,
    c.aulas_regulares desc,
    c.emusys_disciplina_id
  limit 1;
$function$;

comment on function public.fn_resolver_jornada_curso_grade_atual_v1(uuid, bigint) is
  'Resolve o curso atual pela grade recorrente nao reagendada. Reagendamentos preservam o curso da aula original e nunca redefinem a disciplina vigente da matricula.';

commit;
