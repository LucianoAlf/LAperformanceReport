-- Fonte UNICA de "quem e candidato a pendencia de presenca" num periodo.
-- Extraida de fn_presenca_pendencias_do_dia_v2 sem alterar a regra.
-- Consumidores aplicam a propria politica de ausencia sobre roster_estado:
--   diario  -> exige roster completo (nao acusar com foto incompleta)
--   mensal  -> aceita tudo e DECLARA a cobertura no rodape
create or replace function public.fn_presenca_candidatos_periodo_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  slot_key text,
  aluno_id integer,
  aula_emusys_id integer,
  unidade_id uuid,
  professor_id integer,
  data_aula date,
  data_hora_inicio timestamptz,
  data_hora_fim timestamptz,
  curso_nome text,
  turma_nome text,
  roster_estado text,
  tem_vinculo_roster boolean
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  with alvo as (
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
  ), universo as (
    -- lado A: vinculo do roster (mesmo filtro da vw_aula_roster_operacional_v1)
    select a.id as aula_id, aa.aluno_id, true as tem_vinculo
    from alvo a
    join public.aula_alunos_emusys aa on aa.aula_emusys_id = a.id
    where aa.ativo_operacional
    union
    -- lado B: quem tem linha de presenca sem estar no roster
    -- (rastro da reconciliacao de grade: remove vinculo, preserva presenca)
    select a.id, ap.aluno_id, false
    from alvo a
    join public.aluno_presenca ap on ap.aula_emusys_id = a.id
    where ap.aluno_id is not null
  ), candidatos as (
    select
      public.fn_presenca_slot_key_v2(
        un.aluno_id, a.unidade_id, a.professor_id,
        a.data_hora_inicio, a.data_hora_fim, a.curso_nome
      ) as slot_key,
      un.aluno_id,
      a.id as aula_emusys_id,
      a.unidade_id,
      a.professor_id,
      a.data_aula,
      a.data_hora_inicio,
      a.data_hora_fim,
      a.curso_nome,
      a.turma_nome,
      coalesce(re.estado, 'sem_fotografia') as roster_estado,
      bool_or(un.tem_vinculo) over (
        partition by un.aluno_id, a.unidade_id, a.professor_id,
                     a.data_hora_inicio, a.data_hora_fim,
                     lower(btrim(coalesce(a.curso_nome, '')))
      ) as tem_vinculo_roster,
      row_number() over (
        partition by un.aluno_id, a.unidade_id, a.professor_id,
                     a.data_hora_inicio, a.data_hora_fim,
                     lower(btrim(coalesce(a.curso_nome, '')))
        order by
          nullif(a.matricula_disciplina_id, 0) nulls last,
          case when a.tipo = 'turma' then 0 else 1 end,
          a.id
      ) as posicao
    from universo un
    join alvo a on a.id = un.aula_id
    left join public.aula_roster_sync_estado re on re.aula_id = a.id
    where public.fn_presenca_pendencia_elegivel(
            a.unidade_id, un.aluno_id, a.data_aula,
            a.matricula_disciplina_id, a.curso_nome
          )
      -- experimental ja contabilizada em lead_experimentais nao vira pendencia
      and not exists (
        select 1
        from public.lead_experimentais le
        left join public.leads le_lead on le_lead.id = le.lead_id
        where le.unidade_id = a.unidade_id
          and le.data_experimental = a.data_aula
          and le.horario_experimental = (a.data_hora_inicio at time zone 'America/Sao_Paulo')::time
          and le.professor_experimental_id = a.professor_id
          and lower(btrim(le.status::text)) in ('experimental_realizada', 'experimental_faltou')
          and coalesce(le.aluno_id, le_lead.aluno_id) = un.aluno_id
          and (
            nullif(le.emusys_aula_id, 0) is null
            or exists (
              select 1 from public.aulas_emusys ae_exp
              where ae_exp.emusys_id = le.emusys_aula_id
                and ae_exp.unidade_id = a.unidade_id
                and ae_exp.data_aula = a.data_aula
                and coalesce(ae_exp.categoria, 'normal') = 'experimental'
                and ae_exp.professor_id = a.professor_id
                and ae_exp.data_hora_inicio = a.data_hora_inicio
                and ae_exp.data_hora_fim = a.data_hora_fim
            )
          )
      )
      -- gemea cancelada/justificada no mesmo slot encerra a pendencia
      and not exists (
        select 1 from public.aulas_emusys g
        where g.unidade_id = a.unidade_id
          and g.professor_id = a.professor_id
          and g.data_hora_inicio = a.data_hora_inicio
          and g.data_hora_fim = a.data_hora_fim
          and lower(btrim(coalesce(g.curso_nome, ''))) = lower(btrim(coalesce(a.curso_nome, '')))
          and (coalesce(g.cancelada, false) or coalesce(g.justificada, false))
      )
  )
  select slot_key, aluno_id, aula_emusys_id, unidade_id, professor_id,
         data_aula, data_hora_inicio, data_hora_fim, curso_nome, turma_nome,
         roster_estado, tem_vinculo_roster
  from candidatos
  where posicao = 1;
$function$;

revoke all on function public.fn_presenca_candidatos_periodo_v1(uuid, date, date) from public, anon;
grant execute on function public.fn_presenca_candidatos_periodo_v1(uuid, date, date) to authenticated, service_role;;
