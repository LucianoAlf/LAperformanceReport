-- MODULO EVENTOS — a apresentacao resolve a matricula DO CURSO, nao a de referencia (LAPE-39)
--
-- 🔴 DEFEITO ACHADO ANTES DE IR PARA A TELA, medindo dado real em 19/09/2026.
--
-- `vw_evento_aluno_elegivel_v1.aluno_id_referencia` devolve UMA matricula da pessoa, e a
-- v1 escolhia a mais recente. Para Maria Fernanda Sellos Correa Peres (Barra) a mais
-- recente e a 1370 — "Minha Banda Para Sempre", exatamente o curso que a view EXCLUI do
-- recital. As outras duas sao Canto (839, prof. Lohana) e Violao (1349, prof. Pedro Sergio).
--
-- A tela passa (aluno_id_referencia, curso_id) para adicionar uma apresentacao. Com a v1:
--   • `aluno_id` gravado seria a matricula da BANDA, como procedencia de uma apresentacao
--     de Canto;
--   • `professor_id` ficava NULO (a v1 nem o preenchia) e, se derivado do aluno passado,
--     seria o Willian — professor da banda.
-- Ou seja: a programacao impressa diria "Maria Fernanda — Canto — Prof. Willian". Errado e
-- plausivel, que e o tipo de erro que ninguem confere.
--
-- DUAS CORRECOES:
--
-- 1) A RPC passa a resolver, pela PESSOA, a matricula ativa DAQUELE curso, e tira dela o
--    `aluno_id` e o `professor_id`. O `p_aluno_id` que a tela manda vira apenas a forma de
--    dizer "de quem estamos falando" — a identidade continua sendo (unidade, pessoa_chave),
--    nunca a matricula.
--
-- 2) A view passa a PREFERIR uma matricula que entra no recital ao eleger a referencia.
--    Nao e o que corrige o defeito acima (a RPC e), mas ancorar a participacao da pessoa na
--    matricula de banda so gera confusao na leitura de quem for auditar depois.
--
-- ⚠️ `order by a.id desc limit 1` entre matriculas do MESMO curso e deliberado: duas
-- matriculas do mesmo curso sao duplicata de cadastro, e a regra do Hugo diz que geram UMA
-- apresentacao. Escolher a mais recente e a mesma regra que a view ja usa para o nome.

-- ─────────────────── 1. a RPC resolve pessoa + curso ───────────────────

create or replace function public.evento_apresentacao_adicionar_v1(
  p_bloco_id bigint,
  p_aluno_id integer,
  p_curso_id integer
)
returns bigint
language plpgsql
as $function$
declare
  v_id          bigint;
  v_pessoa      text;
  v_unidade     uuid;
  v_aluno       integer;
  v_professor   integer;
  v_nome        text;
  v_curso       text;
begin
  select pc.pessoa_chave, a.unidade_id, a.nome
    into v_pessoa, v_unidade, v_nome
    from public.alunos a
    join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
   where a.id = p_aluno_id;

  if v_pessoa is null then
    raise exception 'evento_apresentacao_adicionar_v1: matricula % nao existe', p_aluno_id
      using errcode = 'P0001';
  end if;

  select c.nome into v_curso from public.cursos c where c.id = p_curso_id;

  -- A matricula DAQUELE curso, da MESMA pessoa. `unidade_id` entra no filtro porque
  -- `emusys_student_id` colide entre unidades (91 ids com nomes diferentes) — pessoa e o
  -- PAR (unidade, chave), nunca a chave sozinha.
  select a.id, a.professor_atual_id
    into v_aluno, v_professor
    from public.alunos a
    join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
   where pc.pessoa_chave = v_pessoa
     and a.unidade_id    = v_unidade
     and a.curso_id      = p_curso_id
     and a.status        = 'ativo'
   order by a.id desc
   limit 1;

  if v_aluno is null then
    -- Recusa em vez de gravar procedencia errada. Sem isto, escolher um curso que a pessoa
    -- nao faz criaria uma apresentacao ancorada na matricula errada, com o professor errado.
    raise exception '% não tem matrícula ativa de %.',
      coalesce(v_nome, 'Esta pessoa'), coalesce(v_curso, 'deste curso')
      using errcode = 'P0001',
            hint = 'A apresentação é sempre de um curso que a pessoa cursa hoje.';
  end if;

  insert into public.evento_apresentacao (bloco_id, aluno_id, curso_id, professor_id, ordem)
  select p_bloco_id, v_aluno, p_curso_id, v_professor, coalesce(max(ap.ordem), 0) + 1
    from public.evento_apresentacao ap
   where ap.bloco_id = p_bloco_id
  returning id into v_id;

  return v_id;

exception
  when unique_violation then
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

comment on function public.evento_apresentacao_adicionar_v1(bigint, integer, integer) is
  'Adiciona apresentacao resolvendo a matricula e o professor DO CURSO pedido, pela pessoa. '
  'p_aluno_id e so a porta de entrada da identidade, nunca a procedencia gravada.';

-- ─────────────── 2. a view prefere referencia que va ao palco ───────────────

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
    -- Banda por ULTIMO: ancorar a participacao da pessoa na matricula de um curso que nem
    -- sobe no palco e confuso para quem for auditar depois. Entre as elegiveis, a mais
    -- recente, como antes.
    (array_agg(m.aluno_id order by m.curso_e_banda, m.aluno_id desc))[1]
                                                           as aluno_id_referencia,
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

comment on view public.vw_evento_aluno_elegivel_v1 is
  'Candidatos ao recital por PESSOA (unidade_id, pessoa_chave), derivada de alunos ativos. '
  'Banda filtra CURSO, nunca pessoa, e nunca e a matricula de referencia quando ha outra. '
  'motivo_sem_curso separa a regra (so_atividade_extra) do defeito (curso_nao_cadastrado). '
  'security_invoker: herda a RLS de alunos.';

revoke all on table public.vw_evento_aluno_elegivel_v1 from public, anon, authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to service_role;
