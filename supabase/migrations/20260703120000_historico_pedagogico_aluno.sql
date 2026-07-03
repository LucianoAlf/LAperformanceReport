-- Feature: Relatório de Histórico Pedagógico do aluno
-- Fonte: aulas_emusys.anotacoes (conteúdo pedagógico preenchido pelo professor no Emusys),
-- cruzado com aluno_presenca. SELECT-only, aditivo, não altera métricas canônicas.
--
-- Regras:
-- * Escopo = TODOS os cursos da PESSOA (pessoa = nome + unidade_id; alunos = matrículas,
--   uma linha por curso). Consolida o histórico de todas as matrículas da pessoa.
-- * Inclui aulas individuais E de turma (decisão de produto).
-- * O Emusys às vezes entrega a mesma aula duas vezes (uma como 'individual' e outra como
--   'turma') com conteúdo idêntico → dedup por (data_aula, curso_nome, conteúdo),
--   preferindo a linha 'individual' (que traz professor_nome).
-- * Ignora aulas canceladas e anotações vazias.

create or replace function public.get_historico_pedagogico_aluno(p_aluno_id integer)
returns table(
  data_aula date,
  horario_aula time without time zone,
  status text,
  curso_nome text,
  professor_nome text,
  tipo text,
  turma_nome text,
  unidade_nome text,
  anotacoes text
)
language sql
stable
set search_path to 'public'
as $function$
  with pessoa as (
    select nome, unidade_id
    from alunos
    where id = p_aluno_id
  ),
  matriculas as (
    select a.id
    from alunos a
    join pessoa p
      on a.nome = p.nome
     and a.unidade_id = p.unidade_id
  )
  select
    d.data_aula,
    d.horario_aula,
    d.status,
    d.curso_nome,
    d.professor_nome,
    d.tipo,
    d.turma_nome,
    d.unidade_nome,
    d.anotacoes
  from (
    select distinct on (ae.data_aula, ae.curso_nome, btrim(ae.anotacoes))
      ae.data_aula,
      (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time as horario_aula,
      ap.status,
      ae.curso_nome,
      ae.professor_nome,
      ae.tipo,
      ae.turma_nome,
      u.nome as unidade_nome,
      ae.anotacoes
    from aluno_presenca ap
    join aulas_emusys ae on ae.id = ap.aula_emusys_id
    join unidades u on u.id = ae.unidade_id
    where ap.aluno_id in (select id from matriculas)
      and ae.cancelada = false
      and ae.anotacoes is not null
      and btrim(ae.anotacoes) <> ''
    order by
      ae.data_aula,
      ae.curso_nome,
      btrim(ae.anotacoes),
      (ae.tipo <> 'individual'),   -- prefere a linha individual (professor_nome preenchido)
      (ae.professor_nome is null)
  ) d
  order by d.data_aula desc, d.curso_nome, d.horario_aula;
$function$;

comment on function public.get_historico_pedagogico_aluno(integer) is
  'Histórico pedagógico (conteúdo de aula do Emusys) de todas as matrículas da pessoa. SELECT-only, aditivo.';

grant execute on function public.get_historico_pedagogico_aluno(integer) to anon, authenticated;
