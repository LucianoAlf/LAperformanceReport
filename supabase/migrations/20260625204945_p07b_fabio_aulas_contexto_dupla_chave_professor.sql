-- P07B - Fabio context accepts both historical LA professor_id and new Emusys professor_id.

drop function if exists public.get_fabio_aulas_do_professor(uuid, integer, date);
drop view if exists public.vw_fabio_aulas_contexto;

create or replace view public.vw_fabio_aulas_contexto as
select
  ae.id as aula_local_id,
  ae.emusys_id as aula_emusys_id,
  ae.unidade_id,
  u.codigo as unidade_codigo,
  u.nome as unidade_nome,
  ae.data_aula,
  ae.data_hora_inicio,
  ae.data_hora_fim,
  (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time as horario_inicio_brt,
  (ae.data_hora_fim at time zone 'America/Sao_Paulo')::time as horario_fim_brt,
  ae.tipo as aula_tipo,
  ae.categoria as aula_categoria,
  ae.turma_nome,
  ae.curso_emusys_id,
  ae.curso_nome,
  ae.sala_nome,
  ae.professor_id as professor_id_origem_aula,
  ae.professor_nome as professor_nome_origem_aula,
  coalesce(pu_emusys.emusys_id, pu_la.emusys_id) as emusys_professor_id,
  coalesce(pu_emusys.emusys_nome, pu_la.emusys_nome, ae.professor_nome) as emusys_professor_nome,
  coalesce(pu_emusys.professor_id, p_la.id) as professor_id,
  coalesce(p_emusys.nome, p_la.nome, ae.professor_nome) as professor_nome,
  coalesce(pu_emusys.validacao_status, pu_la.validacao_status) as professor_emusys_validacao_status,
  case
    when pu_emusys.id is not null then 'emusys_professor_id'
    when p_la.id is not null then 'professor_la_id_historico'
    else 'sem_match'
  end as professor_match_fonte,
  ap.aluno_id,
  a.nome as aluno_nome,
  a.emusys_student_id,
  a.emusys_matricula_id,
  ap.status as presenca_status,
  ap.respondido_em as presenca_respondida_em,
  ae.cancelada,
  ae.nr_da_aula,
  ae.qtd_alunos,
  ae.anotacoes,
  ae.anotacoes_fabio,
  case
    when coalesce(pu_emusys.professor_id, p_la.id) is null then 'professor_sem_vinculo_la'
    when ap.aluno_id is null then 'aula_sem_aluno_presenca'
    when a.id is null then 'presenca_sem_aluno_la'
    else 'ok'
  end as qualidade_contexto
from public.aulas_emusys ae
join public.unidades u on u.id = ae.unidade_id
left join public.professores_unidades pu_emusys
  on pu_emusys.unidade_id = ae.unidade_id
 and pu_emusys.emusys_id = ae.professor_id
left join public.professores p_emusys on p_emusys.id = pu_emusys.professor_id
left join public.professores p_la on p_la.id = ae.professor_id
left join public.professores_unidades pu_la
  on pu_la.unidade_id = ae.unidade_id
 and pu_la.professor_id = p_la.id
left join public.aluno_presenca ap
  on ap.unidade_id = ae.unidade_id
 and ap.aula_emusys_id = ae.emusys_id
left join public.alunos a on a.id = ap.aluno_id;

grant select on public.vw_fabio_aulas_contexto to anon, authenticated;

create or replace function public.get_fabio_aulas_do_professor(
  p_unidade_id uuid default null,
  p_emusys_professor_id integer default null,
  p_data_aula date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'data_aula', p_data_aula,
    'total', count(*),
    'aulas', coalesce(
      jsonb_agg(to_jsonb(v) order by v.data_hora_inicio, v.aluno_nome)
        filter (where v.aula_local_id is not null),
      '[]'::jsonb
    )
  )
  from public.vw_fabio_aulas_contexto v
  where (p_unidade_id is null or v.unidade_id = p_unidade_id)
    and (p_emusys_professor_id is null or v.emusys_professor_id = p_emusys_professor_id)
    and v.data_aula = p_data_aula;
$$;

grant execute on function public.get_fabio_aulas_do_professor(uuid, integer, date) to anon, authenticated;
