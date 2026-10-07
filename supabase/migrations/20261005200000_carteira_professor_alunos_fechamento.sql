-- Lista de alunos da carteira do professor em MÊS FECHADO = os nomes do próprio fechamento.
--
-- Defeito (05/10/2026, Gestão de Professores, Gabriel Antony/Barra, Set/2026): o cabeçalho
-- mostrava "47 alunos" de setembro (snapshot professor_carteira_mensal_canonica), mas a
-- lista ao expandir era a carteira de HOJE (get_jornada_professor, sem período). Mesmo
-- total, pessoas diferentes: a lista trazia o Jairo (que em setembro tinha aula com o
-- Erick) e escondia a Liv, que estava no número de setembro.
--
-- O fechamento já grava os nomes em professor_carteira_mensal_detalhe, na mesma transação
-- do total (capturar_carteira_professores_mensal). A tabela é trancada de propósito
-- (RLS sem policy, sem grant para authenticated): esta função é a porta de leitura,
-- com o escopo de unidade aplicado aqui dentro.
--
-- Não muda número nenhum: só faz a lista falar do mesmo mês que o cabeçalho.
--
-- ⚠️ O detalhe gravado INCLUI atividade extra (banda); o total não. Cada linha sai com
-- `atividade_extra` e a função devolve `pessoas_regulares` para o front comparar com o
-- total — em set/2026 bate nos 77 professores; em jul/ago 15 divergem (total capturado
-- antes de a carteira excluir banda, 08/09) e jun/2026 não tem detalhe (total lançado
-- pela coordenação). O front declara essas diferenças em vez de escondê-las.
--
-- ⚠️ Escopo: em SECURITY DEFINER `current_user` é o dono, então o discriminador é a
-- presença de claim (auth.uid() is null = chamada interna). Admin vem antes do ramo de
-- unidade porque o vínculo dele é global e get_user_unidade_ids() devolve vazio.
-- Mesmo padrão de get_carteira_professor_periodo_composicao_v1 (20260908180000).
--
-- Custo: leitura pontual ao expandir um professor; ~50 linhas por chamada.

create or replace function public.get_carteira_professor_fechamento_alunos_v1(
  p_professor_id integer,
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with escopo as (
    select s.unidade_id, s.carteira_alunos, s.fonte
    from public.professor_carteira_mensal_canonica s
    where s.competencia = make_date(p_ano, p_mes, 1)
      and s.professor_id = p_professor_id
      and (p_unidade_id is null or s.unidade_id = p_unidade_id)
      and (
        (select auth.uid()) is null
        or (select public.is_admin())
        or s.unidade_id in (select public.get_user_unidade_ids())
      )
  ),
  linhas as (
    select
      d.unidade_id,
      u.nome as unidade_nome,
      d.aluno_id,
      coalesce(a.nome, 'Aluno ' || d.pessoa_chave) as aluno_nome,
      d.pessoa_chave,
      case when d.pessoa_chave ~ '^[0-9]+$' then d.pessoa_chave end as emusys_aluno_id,
      d.curso_id,
      c.nome as curso_nome,
      coalesce(c.is_projeto_banda, false) as atividade_extra,
      j.dia_semana,
      j.horario
    from public.professor_carteira_mensal_detalhe d
    join escopo e
      on e.unidade_id = d.unidade_id
    left join public.alunos a
      on a.id = d.aluno_id
    left join public.unidades u
      on u.id = d.unidade_id
    left join public.cursos c
      on c.id = d.curso_id
    left join lateral (
      select j.dia_semana, j.horario
      from public.aluno_jornada_matricula_disciplina j
      where j.aluno_id = d.aluno_id
        and j.curso_id is not distinct from d.curso_id
        and j.professor_id = d.professor_id
      order by (j.status_matricula = 'ativa') desc, j.updated_at desc
      limit 1
    ) j on true
    where d.competencia = make_date(p_ano, p_mes, 1)
      and d.professor_id = p_professor_id
  )
  select jsonb_build_object(
    'fechado', exists (select 1 from escopo),
    'carteira_alunos', (select sum(e.carteira_alunos) from escopo e),
    'fontes', coalesce((select jsonb_agg(distinct e.fonte) from escopo e), '[]'::jsonb),
    'pessoas_regulares', (
      select count(distinct (l.unidade_id, l.pessoa_chave))
      from linhas l
      where not l.atividade_extra
    ),
    'linhas', coalesce(
      (select jsonb_agg(to_jsonb(l) order by l.aluno_nome) from linhas l),
      '[]'::jsonb
    )
  );
$function$;

comment on function public.get_carteira_professor_fechamento_alunos_v1(integer, integer, integer, uuid) is
  'Nomes da carteira do professor gravados no fechamento do mês (professor_carteira_mensal_detalhe), com escopo de unidade. Lista da Gestão de Professores em mês fechado. fechado=false quando não há fechamento para o mês.';

revoke all on function public.get_carteira_professor_fechamento_alunos_v1(integer, integer, integer, uuid) from public;
revoke all on function public.get_carteira_professor_fechamento_alunos_v1(integer, integer, integer, uuid) from anon;
grant execute on function public.get_carteira_professor_fechamento_alunos_v1(integer, integer, integer, uuid) to authenticated, service_role;

do $$
declare
  v_def text := pg_get_functiondef('public.get_carteira_professor_fechamento_alunos_v1(integer,integer,integer,uuid)'::regprocedure);
begin
  if v_def ilike '%current_user%' then
    raise exception 'FECHAMENTO_CARTEIRA_NAO_PODE_ESCOPAR_POR_CURRENT_USER';
  end if;
  if not v_def ilike '%auth.uid()%' then
    raise exception 'FECHAMENTO_CARTEIRA_SEM_DISCRIMINADOR_DE_CLAIM';
  end if;
  if has_function_privilege('anon', 'public.get_carteira_professor_fechamento_alunos_v1(integer,integer,integer,uuid)', 'execute') then
    raise exception 'FECHAMENTO_CARTEIRA_EXECUTAVEL_POR_ANON';
  end if;
end
$$;
