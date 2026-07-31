-- Ticket medio da carteira do professor passa a usar o criterio canonico da casa.
--
-- PROBLEMA: a RPC aproximava "quem entra no ticket" por `valor_parcela > 0`. Isso
-- erra nos dois sentidos:
--   - bolsista parcial pagante ENTRAVA no ticket (13 alunos ativos) quando
--     `tipos_matricula.entra_ticket_medio = false` diz que nao deve;
--   - bolsista integral em curso regular ficava de fora por pagar zero, e nao por regra.
-- Alem disso o calculo era assimetrico: o numerador somava todos os pagantes
-- (inclusive segundo curso) mas o denominador contava so `not is_segundo_curso`,
-- o que INFLAVA o ticket.
--
-- CRITERIO CANONICO (docs/METRICAS.md, "Ticket medio (mensalidade)"):
--   entra_financeiro_ativo AND tipos_matricula.entra_ticket_medio AND valor_parcela > 0.
-- Ja usado por 9 funcoes, entre elas `get_kpis_alunos_financeiro_vivo_canonico`
-- e `snapshot_dados_mensais`. Esta RPC era a excecao.
--
-- Segundo curso tem `entra_ticket_medio = true`, entao passa a entrar nos DOIS lados.
-- A dedup por pessoa que a regra geral aplica nao cabe aqui: na carteira por professor,
-- um aluno com 2 cursos e carteira dos 2 professores; deduplicar faria um deles perder
-- o aluno.
--
-- MRR NAO MUDA: bolsista parcial paga de verdade, e receita real. Ele sai do ticket
-- (regra), nao do faturamento. Por isso o numerador do ticket deixou de ser igual ao
-- MRR, e a RPC passa a devolver `mrr_ticket` e `alunos_ticket` — sem eles o card
-- agregado da aba nao tem como somar (media de medias nao e media).
--
-- `total_alunos` continua sendo o headcount inteiro: e quantos alunos o professor
-- atende, e isso nao mudou.
--
-- Efeito medido: 24 professores com ticket subindo. Willian de Andrade 312,58 -> 413,41;
-- Ramon Pina 108,59 -> 434,36; card agregado 350,41 -> 402,24.
--
-- DROP + CREATE (e nao REPLACE) porque a assinatura de retorno ganhou colunas.
-- Unico chamador: src/components/App/Professores/TabCarteiraProfessores.tsx.

drop function if exists public.get_carteira_professores(uuid);

create function public.get_carteira_professores(p_unidade_id uuid default null)
returns table(
  professor_id integer,
  professor_nome text,
  foto_url text,
  total_alunos integer,
  alunos_lamk integer,
  alunos_emla integer,
  mrr_total numeric,
  ticket_medio numeric,
  tempo_medio_meses numeric,
  total_turmas integer,
  media_alunos_turma numeric,
  cursos text[],
  unidades text[],
  alunos_ticket integer,
  mrr_ticket numeric
)
language plpgsql
set search_path to 'public'
as $function$
begin
  return query
  with alunos_base as (
    select
      a.professor_atual_id,
      a.classificacao,
      a.valor_parcela,
      a.is_segundo_curso,
      a.tempo_permanencia_meses,
      a.curso_id,
      a.dia_aula,
      a.horario_aula,
      c.nome::text                                                as curso_nome,
      u.nome::text                                                as unidade_nome,
      (c.is_projeto_banda is null or c.is_projeto_banda = false)  as conta_turma,
      (
        coalesce(tm.entra_ticket_medio, false)
        and coalesce(a.valor_parcela, 0) > 0
      )                                                           as entra_ticket
    from public.alunos a
    join public.cursos c on a.curso_id = c.id
    join public.unidades u on a.unidade_id = u.id
    left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
    where public.fn_aluno_entra_base_ativa_v131(a.id, a.unidade_id)
      and a.professor_atual_id is not null
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
  )
  select
    p.id::integer,
    p.nome::text,
    p.foto_url::text,
    count(*)::integer,
    count(*) filter (where ab.classificacao = 'LAMK')::integer,
    count(*) filter (where ab.classificacao = 'EMLA')::integer,
    -- MRR = receita recorrente real: todo mundo que paga, inclusive bolsista parcial.
    coalesce(
      sum(case when ab.valor_parcela > 0 then ab.valor_parcela else 0 end),
      0
    )::numeric(12,2),
    -- Ticket = simetrico, mesmo universo nos dois lados.
    coalesce(
      round(
        sum(ab.valor_parcela) filter (where ab.entra_ticket)
        / nullif(count(*) filter (where ab.entra_ticket), 0),
        2
      ),
      0
    )::numeric(10,2),
    coalesce(round(avg(ab.tempo_permanencia_meses), 1), 0)::numeric(5,1),
    count(distinct case
      when ab.conta_turma
        and ab.dia_aula is not null
        and ab.horario_aula is not null
        then ab.curso_id::text || '@' || ab.dia_aula || ':' || ab.horario_aula
      else null
    end)::integer,
    case
      when count(distinct case
        when ab.conta_turma
          and ab.dia_aula is not null
          and ab.horario_aula is not null
          then ab.curso_id::text || '@' || ab.dia_aula || ':' || ab.horario_aula
        else null
      end) > 0
        then round(
          count(*) filter (where ab.conta_turma)::numeric /
          count(distinct case
            when ab.conta_turma
              and ab.dia_aula is not null
              and ab.horario_aula is not null
              then ab.curso_id::text || '@' || ab.dia_aula || ':' || ab.horario_aula
            else null
          end),
          2
        )
      else 0
    end::numeric(5,2),
    array_remove(array_agg(distinct ab.curso_nome), null)::text[],
    array_remove(array_agg(distinct ab.unidade_nome), null)::text[],
    -- Base do ticket, exposta para o card agregado somar numeradores e denominadores.
    count(*) filter (where ab.entra_ticket)::integer,
    coalesce(sum(ab.valor_parcela) filter (where ab.entra_ticket), 0)::numeric(12,2)
  from public.professores p
  join alunos_base ab on ab.professor_atual_id = p.id
  where p.ativo = true
  group by p.id, p.nome, p.foto_url
  order by p.nome;
end;
$function$;

grant execute on function public.get_carteira_professores(uuid) to authenticated, service_role;

comment on function public.get_carteira_professores(uuid) is
  'Carteira por professor. Ticket medio usa tipos_matricula.entra_ticket_medio (criterio canonico): exclui banda e bolsistas. MRR inclui todo pagante. total_alunos e o headcount inteiro.';
