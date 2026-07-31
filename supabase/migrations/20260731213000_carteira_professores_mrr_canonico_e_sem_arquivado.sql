-- MRR da carteira do professor passa a seguir a regra canonica, e arquivado sai da base.
--
-- Decisao do Luciano (31/07/2026): "aluno bolsista parcial nao conta como aluno
-- pagante" e "aluno inativo/trancado tem que sair do MRR, isso e valor falso".
--
-- 1) MRR pelo criterio canonico. `get_kpis_alunos_financeiro_vivo_canonico` define
--    MRR com o MESMO `tipos_matricula.entra_ticket_medio` do ticket — MRR e o
--    numerador do ticket, nao um numero a parte. A carteira somava todo pagante,
--    inflando em R$ 2.433,50 (os bolsistas parciais que pagam). Com isso a coluna
--    `mrr_ticket`, criada horas antes na migration 20260731203000, virou redundante
--    e foi REMOVIDA — `mrr_total` agora e ela.
--
-- 2) Arquivado fora da base. `fn_aluno_entra_base_ativa_v131` nao filtra
--    `arquivado_em`, mas a RPC canonica de MRR filtra. Havia 5 matriculas na lixeira
--    contando como carteira e somando R$ 1.210,00 de MRR: Ester Soares (#1426),
--    Julia da Costa (#1430), Joao Pedro Costa (#1591), Leonardo Imperial (#1656) e
--    Matheus Lopes (#1585) — os quatro primeiros ja estavam na lista de "arquivados
--    mas vivos". Agora saem tambem do `total_alunos`.
--
-- TRANCADO E INATIVO JA ESTAVAM FORA — nao houve mudanca aqui. O `alunos.status`
-- local e apenas fallback (METRICAS.md, "Estado operacional"); o estado real vem de
-- `vw_alunos_estado_operacional_v131`, e nela trancado/inativo/evadido tem
-- `entra_base_ativa = false`. Os 6 casos levantados como suspeitos eram falso
-- positivo: o status local estava defasado e o Emusys diz `ativa` para todos os 6.
-- Verificado: 100% das 1.187 linhas da carteira tinham `status_operacional = ativo`.
--
-- Resultado: MRR 415.941,12 -> 412.297,62, que bate exatamente com o canonico.
-- Headcount 1.187 -> 1.182. Ticket agregado inalterado em R$ 402,24 (numerador e
-- denominador cairam juntos).
--
-- DROP + CREATE porque a assinatura perdeu `mrr_ticket`.
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
  alunos_ticket integer
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
      and a.arquivado_em is null
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
    -- MRR = numerador do ticket. Mesmo filtro, por regra canonica.
    coalesce(sum(ab.valor_parcela) filter (where ab.entra_ticket), 0)::numeric(12,2),
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
    -- Denominador do ticket, exposto porque difere do headcount.
    count(*) filter (where ab.entra_ticket)::integer
  from public.professores p
  join alunos_base ab on ab.professor_atual_id = p.id
  where p.ativo = true
  group by p.id, p.nome, p.foto_url
  order by p.nome;
end;
$function$;

grant execute on function public.get_carteira_professores(uuid) to authenticated, service_role;

comment on function public.get_carteira_professores(uuid) is
  'Carteira por professor. MRR e ticket seguem tipos_matricula.entra_ticket_medio (regra canonica): banda, bolsista integral e bolsista parcial ficam de fora. Arquivados excluidos. total_alunos e o headcount (inclui banda/bolsista); alunos_ticket e o denominador do ticket.';
