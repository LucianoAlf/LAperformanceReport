-- CAUSA DO CUSTO: o filtro de aula gemea cancelada/justificada nao mencionava data_aula.
-- O indice de aulas_emusys e (unidade_id, data_aula), entao para cada aula do dia o banco
-- varria TODAS as aulas da unidade no ano (28.750 linhas x 173 loops, 443 mil heap blocks)
-- para descartar 73. Acrescentar g.data_aula = a.data_aula e logicamente redundante
-- (a gemea tem o mesmo data_hora_inicio; medido: 0 divergencias em 65.715 aulas entre
-- data_aula e a data derivada de data_hora_inicio) mas e o que deixa o indice ser usado.
-- Medido isolado: 2.353ms -> 21ms, com resultado identico (73 = 73).
create or replace function public.fn_presenca_candidatos_periodo_v1(
  p_unidade_id uuid, p_data_inicio date, p_data_fim date
)
returns table (
  slot_key text, aluno_id integer, aula_emusys_id integer, unidade_id uuid,
  professor_id integer, data_aula date, data_hora_inicio timestamptz,
  data_hora_fim timestamptz, curso_nome text, turma_nome text,
  roster_estado text, tem_vinculo_roster boolean
)
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public'
set plan_cache_mode to 'force_custom_plan'
as $function$
begin
  if p_unidade_id is null or p_data_inicio is null or p_data_fim is null
     or p_data_inicio > p_data_fim or p_data_fim - p_data_inicio > 370 then
    raise exception using errcode = '22023',
      message = 'PRESENCA_CANDIDATOS_PERIODO_INVALIDO';
  end if;

  return query
  with alvo as materialized (
    select ae.id, ae.unidade_id, ae.professor_id, ae.data_aula,
           ae.data_hora_inicio, ae.data_hora_fim, ae.curso_nome,
           ae.turma_nome, ae.tipo, ae.matricula_disciplina_id
    from public.aulas_emusys ae
    where ae.unidade_id = p_unidade_id
      and ae.data_aula between p_data_inicio and p_data_fim
      and ae.data_hora_fim < now()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and not coalesce(ae.cancelada, false)
      and ae.professor_id is not null
  ), universo as materialized (
    select u.aula_id, u.aluno_id, bool_or(u.tem_vinculo) as tem_vinculo
    from (
      select a.id as aula_id, aa.aluno_id, true as tem_vinculo
      from alvo a
      join public.aula_alunos_emusys aa on aa.aula_emusys_id = a.id
      where aa.ativo_operacional and aa.aluno_id is not null
      union all
      -- rastro da reconciliacao de grade: remove o vinculo, preserva a presenca
      select a.id, ap.aluno_id, false
      from alvo a
      join public.aluno_presenca ap on ap.aula_emusys_id = a.id
      where ap.aluno_id is not null
    ) u
    group by u.aula_id, u.aluno_id
  ), candidatos as (
    select
      public.fn_presenca_slot_key_v2(un.aluno_id, a.unidade_id, a.professor_id,
        a.data_hora_inicio, a.data_hora_fim, a.curso_nome)::text as c_slot_key,
      un.aluno_id as c_aluno_id, a.id as c_aula_emusys_id,
      a.unidade_id as c_unidade_id, a.professor_id as c_professor_id,
      a.data_aula as c_data_aula, a.data_hora_inicio as c_data_hora_inicio,
      a.data_hora_fim as c_data_hora_fim,
      a.curso_nome::text as c_curso_nome, a.turma_nome::text as c_turma_nome,
      coalesce(re.estado, 'sem_fotografia')::text as c_roster_estado,
      bool_or(un.tem_vinculo) over (
        partition by un.aluno_id, a.unidade_id, a.professor_id,
                     a.data_hora_inicio, a.data_hora_fim,
                     lower(btrim(coalesce(a.curso_nome, '')))) as c_tem_vinculo_roster,
      row_number() over (
        partition by un.aluno_id, a.unidade_id, a.professor_id,
                     a.data_hora_inicio, a.data_hora_fim,
                     lower(btrim(coalesce(a.curso_nome, '')))
        order by nullif(a.matricula_disciplina_id, 0) nulls last,
                 case when a.tipo = 'turma' then 0 else 1 end, a.id) as c_posicao
    from universo un
    join alvo a on a.id = un.aula_id
    left join public.aula_roster_sync_estado re on re.aula_id = a.id
    where exists (select 1 from public.alunos al where al.id = un.aluno_id)
      and public.fn_presenca_pendencia_elegivel(a.unidade_id, un.aluno_id,
            a.data_aula, a.matricula_disciplina_id, a.curso_nome)
      and not exists (
        select 1 from public.lead_experimentais le
        left join public.leads le_lead on le_lead.id = le.lead_id
        where le.unidade_id = a.unidade_id
          and le.data_experimental = a.data_aula
          and le.horario_experimental = (a.data_hora_inicio at time zone 'America/Sao_Paulo')::time
          and le.professor_experimental_id = a.professor_id
          and lower(btrim(le.status::text)) in ('experimental_realizada', 'experimental_faltou')
          and coalesce(le.aluno_id, le_lead.aluno_id) = un.aluno_id
          and (nullif(le.emusys_aula_id, 0) is null
            or exists (select 1 from public.aulas_emusys ae_exp
              where ae_exp.emusys_id = le.emusys_aula_id
                and ae_exp.unidade_id = a.unidade_id
                and ae_exp.data_aula = a.data_aula
                and coalesce(ae_exp.categoria, 'normal') = 'experimental'
                and ae_exp.professor_id = a.professor_id
                and ae_exp.data_hora_inicio = a.data_hora_inicio
                and ae_exp.data_hora_fim = a.data_hora_fim)))
      and not exists (
        select 1 from public.aulas_emusys g
        where g.unidade_id = a.unidade_id
          and g.data_aula = a.data_aula   -- <<< so para o indice (unidade_id, data_aula) valer
          and g.professor_id = a.professor_id
          and g.data_hora_inicio = a.data_hora_inicio
          and g.data_hora_fim = a.data_hora_fim
          and lower(btrim(coalesce(g.curso_nome, ''))) = lower(btrim(coalesce(a.curso_nome, '')))
          and (coalesce(g.cancelada, false) or coalesce(g.justificada, false)))
  )
  select c.c_slot_key, c.c_aluno_id, c.c_aula_emusys_id, c.c_unidade_id,
         c.c_professor_id, c.c_data_aula, c.c_data_hora_inicio, c.c_data_hora_fim,
         c.c_curso_nome, c.c_turma_nome, c.c_roster_estado, c.c_tem_vinculo_roster
  from candidatos c where c.c_posicao = 1;
end;
$function$;

revoke all on function public.fn_presenca_candidatos_periodo_v1(uuid, date, date) from public, anon;
grant execute on function public.fn_presenca_candidatos_periodo_v1(uuid, date, date) to authenticated, service_role;

drop function if exists public._teste_candidatos_invoker(uuid, date, date);;
