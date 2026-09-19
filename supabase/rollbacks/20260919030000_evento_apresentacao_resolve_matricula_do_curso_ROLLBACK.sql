-- ROLLBACK de 20260919030000_evento_apresentacao_resolve_matricula_do_curso.sql (LAPE-39)
--
-- 🔴 LEIA ANTES DE RODAR: este rollback REINTRODUZ UM DEFEITO CONHECIDO.
--
-- A migration que ele desfaz existe porque a versao anterior gravava a apresentacao na
-- matricula errada. Caso medido: Maria Fernanda Sellos Correa Peres (Barra) tem Canto (839,
-- prof. Lohana), Violao (1349, prof. Pedro Sergio) e Minha Banda Para Sempre (1370, prof.
-- Willian). Com a v1, `aluno_id_referencia` era a 1370 e uma apresentacao de Canto nascia
-- ancorada na matricula da BANDA, com professor nulo ou o da banda — a programacao impressa
-- diria "Maria Fernanda — Canto — Prof. Willian".
--
-- Se o motivo do rollback for outro (a v2 quebrou alguma coisa), prefira corrigir a v2 a
-- voltar para uma versao que grava dado errado em silencio. Apresentacoes JA GRAVADAS pela
-- v2 continuam corretas — este script nao as altera.
--
-- Para conferir se ha apresentacao afetada antes de decidir:
--   select ap.id, al.nome, cu.nome as curso, pr.nome as professor
--     from evento_apresentacao ap
--     join alunos al on al.id = ap.aluno_id
--     join cursos cu on cu.id = ap.curso_id
--     left join professores pr on pr.id = ap.professor_id
--    where al.curso_id is distinct from ap.curso_id;   -- procedencia de outro curso

-- ─────────── 1. RPC volta a NAO resolver a matricula do curso ───────────

create or replace function public.evento_apresentacao_adicionar_v1(
  p_bloco_id bigint,
  p_aluno_id integer,
  p_curso_id integer
)
returns bigint
language plpgsql
as $function$
declare
  v_id     bigint;
  v_nome   text;
  v_curso  text;
begin
  insert into public.evento_apresentacao (bloco_id, aluno_id, curso_id, ordem)
  select p_bloco_id, p_aluno_id, p_curso_id, coalesce(max(ap.ordem), 0) + 1
    from public.evento_apresentacao ap
   where ap.bloco_id = p_bloco_id
  returning id into v_id;

  return v_id;

exception
  when unique_violation then
    select a.nome, c.nome into v_nome, v_curso
      from public.alunos a
      left join public.cursos c on c.id = p_curso_id
     where a.id = p_aluno_id;
    raise exception '% já tem uma apresentação de % neste evento.',
      coalesce(v_nome, 'Esta pessoa'), coalesce(v_curso, 'deste curso')
      using
        errcode = 'P0001',
        hint = 'Duas matrículas do mesmo curso geram uma apresentação só. '
               'Cursos diferentes, sim, geram duas.';
end;
$function$;

revoke execute on function public.evento_apresentacao_adicionar_v1(bigint, integer, integer)
  from public, anon;
grant execute on function public.evento_apresentacao_adicionar_v1(bigint, integer, integer)
  to authenticated, service_role;

-- ─────────── 2. view volta a eleger a referencia sem preferir o palco ───────────

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
),
pessoa as (
  select
    m.unidade_id,
    m.pessoa_chave,
    (array_agg(m.aluno_id order by m.aluno_id desc))[1]   as aluno_id_referencia,
    (array_agg(m.nome    order by m.aluno_id desc))[1]     as nome,
    max(m.data_nascimento)                                 as data_nascimento,
    count(distinct m.curso_id)
      filter (where not m.curso_e_banda and m.curso_id is not null)
                                                           as cursos_no_recital,
    count(distinct m.curso_id) filter (where m.curso_id is not null)
                                                           as cursos_matriculados,
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
  group by m.unidade_id, m.pessoa_chave
)
select
  p.unidade_id,
  p.pessoa_chave,
  p.aluno_id_referencia,
  p.nome,
  p.data_nascimento,
  case
    when p.data_nascimento is null then null
    else extract(year from age(p.data_nascimento))::integer
  end                                                      as idade_anos,
  p.cursos_no_recital,
  p.cursos,
  p.faz_banda,
  case
    when p.cursos_no_recital > 0        then null
    when p.cursos_matriculados > 0      then 'so_atividade_extra'
    else                                     'curso_nao_cadastrado'
  end                                                      as motivo_sem_curso
from pessoa p;

revoke all on table public.vw_evento_aluno_elegivel_v1 from public, anon, authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to service_role;
