-- Mantem a carteira operacional de professores alinhada ao estado corrente
-- canonico das matriculas Emusys, sem alterar assinatura nem formato da RPC.
create or replace function public.get_carteira_professores(
  p_unidade_id uuid default null::uuid
)
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
  unidades text[]
)
language plpgsql
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
      (c.is_projeto_banda is null or c.is_projeto_banda = false) as conta_turma
    from public.alunos a
    join public.cursos c on a.curso_id = c.id
    join public.unidades u on a.unidade_id = u.id
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
    coalesce(
      sum(case when ab.valor_parcela > 0 then ab.valor_parcela else 0 end),
      0
    )::numeric(12,2),
    case
      when count(*) filter (
        where ab.valor_parcela > 0 and not ab.is_segundo_curso
      ) > 0
        then round(
          sum(case when ab.valor_parcela > 0 then ab.valor_parcela else 0 end) /
          count(*) filter (
            where ab.valor_parcela > 0 and not ab.is_segundo_curso
          ),
          2
        )
      else 0
    end::numeric(10,2),
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
    array_remove(array_agg(distinct ab.unidade_nome), null)::text[]
  from public.professores p
  join alunos_base ab on ab.professor_atual_id = p.id
  where p.ativo = true
  group by p.id, p.nome, p.foto_url
  order by p.nome;
end;
$function$;

comment on function public.get_carteira_professores(uuid) is
  'Carteira operacional por professor baseada no estado atual canonico v1.3.1; trancadas, concluidas, interrompidas e estados ambiguos nao entram na base viva.';

revoke all on function public.get_carteira_professores(uuid) from public, anon;
grant execute on function public.get_carteira_professores(uuid)
  to authenticated, service_role;
