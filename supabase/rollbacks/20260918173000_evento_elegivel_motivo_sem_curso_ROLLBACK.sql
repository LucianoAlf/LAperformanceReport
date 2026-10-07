-- ROLLBACK de 20260918173000_evento_elegivel_motivo_sem_curso.sql (LAPE-39)
--
-- Volta a view para a forma da 20260918170000: sem `motivo_sem_curso`. A aba Alunos passa a
-- exibir "0 apresentacoes" sem distinguir quem nao tem o que apresentar (banda/Power Kids)
-- de quem esta com o cadastro incompleto — ou seja, o defeito volta a parecer regra.

create or replace view public.vw_evento_aluno_elegivel_v1
with (security_invoker = true) as
with matricula as (
  select
    a.id                                              as aluno_id,
    a.unidade_id,
    pc.pessoa_chave,
    a.nome,
    a.data_nascimento,
    a.curso_id,
    c.nome                                            as curso_nome,
    coalesce(c.is_projeto_banda, false)               as curso_e_banda,
    a.professor_atual_id                              as professor_id,
    p.nome                                            as professor_nome
  from public.alunos a
  join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  left join public.cursos c       on c.id = a.curso_id
  left join public.professores p  on p.id = a.professor_atual_id
  where a.status = 'ativo'
)
select
  m.unidade_id,
  m.pessoa_chave,
  (array_agg(m.aluno_id order by m.aluno_id desc))[1]   as aluno_id_referencia,
  (array_agg(m.nome    order by m.aluno_id desc))[1]     as nome,
  max(m.data_nascimento)                                 as data_nascimento,
  case
    when max(m.data_nascimento) is null then null
    else extract(year from age(max(m.data_nascimento)))::integer
  end                                                    as idade_anos,
  count(distinct m.curso_id) filter (where not m.curso_e_banda and m.curso_id is not null)
                                                         as cursos_no_recital,
  coalesce(
    jsonb_agg(distinct jsonb_build_object(
      'curso_id',       m.curso_id,
      'curso_nome',     m.curso_nome,
      'professor_id',   m.professor_id,
      'professor_nome', m.professor_nome
    )) filter (where not m.curso_e_banda and m.curso_id is not null),
    '[]'::jsonb
  )                                                      as cursos,
  bool_or(m.curso_e_banda)                               as faz_banda
from matricula m
group by m.unidade_id, m.pessoa_chave;

revoke all on table public.vw_evento_aluno_elegivel_v1 from public, anon, authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to service_role;
