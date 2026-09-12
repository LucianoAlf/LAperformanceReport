-- A aula experimental do Emusys e uma ocorrencia propria, mesmo quando o
-- mesmo aluno aparece no roster de uma turma regular no mesmo horario.
-- Esta migration corrige somente a exposicao/pendencia da Agenda; nao altera
-- cadastro, roster bruto ou historico de presenca.

do $migration$
declare
  v_item record;
  v_def text;
  v_horario_anchor text :=
    '   and le.horario_experimental = (b.data_hora_inicio at time zone ''America/Sao_Paulo'')::time';
  v_horario_novo text :=
    v_horario_anchor || E'\n'
    || '   and (' || E'\n'
    || '     nullif(le.emusys_aula_id, 0) is null' || E'\n'
    || '     or le.emusys_aula_id = b.emusys_id' || E'\n'
    || '   )';
  v_dedupe_antigo text := $sql$
    and (
      coalesce(le.aluno_id, l.aluno_id) is null
      or not exists (
        select 1
        from participantes p
        where p.chave = b.chave
          and p.aluno_id = coalesce(le.aluno_id, l.aluno_id)
      )
    )
  $sql$;
  v_dedupe_novo text := $sql$
    and (
      coalesce(le.aluno_id, l.aluno_id) is null
      or (
        not exists (
          select 1
          from public.aula_alunos_emusys aa_exp
          where aa_exp.aula_emusys_id = b.id
            and aa_exp.aluno_id = coalesce(le.aluno_id, l.aluno_id)
            and aa_exp.ativo_operacional
        )
        and not exists (
          select 1
          from public.aluno_presenca ap_exp
          where ap_exp.aula_emusys_id = b.id
            and ap_exp.aluno_id = coalesce(le.aluno_id, l.aluno_id)
            and (
              not exists (
                select 1
                from public.aula_alunos_emusys aa_exp_presence
                where aa_exp_presence.aula_emusys_id = ap_exp.aula_emusys_id
                  and aa_exp_presence.aluno_id = ap_exp.aluno_id
              )
              or exists (
                select 1
                from public.aula_alunos_emusys aa_exp_presence
                where aa_exp_presence.aula_emusys_id = ap_exp.aula_emusys_id
                  and aa_exp_presence.aluno_id = ap_exp.aluno_id
                  and aa_exp_presence.ativo_operacional
              )
            )
        )
      )
    )
  $sql$;
begin
  for v_item in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.oid in (
        'public.get_agenda_dia(date,uuid)'::regprocedure,
        'public.get_agenda_semana(date,uuid)'::regprocedure
      )
  loop
    v_def := pg_get_functiondef(v_item.oid);

    if position('nullif(le.emusys_aula_id, 0)' in v_def) = 0 then
      if position(v_horario_anchor in v_def) = 0 then
        raise exception
          'agenda experimental: trecho de horario nao encontrado em %',
          v_item.oid::regprocedure;
      end if;
      v_def := replace(v_def, v_horario_anchor, v_horario_novo);
    end if;

    if position('aa_exp.aula_emusys_id = b.id' in v_def) = 0 then
      if position(v_dedupe_antigo in v_def) = 0 then
        raise exception
          'agenda experimental: deduplicacao antiga nao encontrada em %',
          v_item.oid::regprocedure;
      end if;
      v_def := replace(v_def, v_dedupe_antigo, v_dedupe_novo);
    end if;

    execute v_def;
  end loop;
end
$migration$;

-- Quando o Emusys registra a mesma pessoa na turma regular e na experimental
-- do mesmo horario, a experimental terminal cobre a ocorrencia operacional.
-- Assim a pessoa aparece no cartao experimental e nao abre uma pendencia
-- regular duplicada.
do $migration$
declare
  v_oid oid := 'public.fn_presenca_pendencias_do_dia_v2(uuid,date)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_anchor text := $sql$
        and public.fn_presenca_pendencia_elegivel(
          ae.unidade_id,
          r.aluno_id,
          ae.data_aula,
          ae.matricula_disciplina_id,
          ae.curso_nome
        )
  $sql$;
  v_replacement text := $sql$
        and public.fn_presenca_pendencia_elegivel(
          ae.unidade_id,
          r.aluno_id,
          ae.data_aula,
          ae.matricula_disciplina_id,
          ae.curso_nome
        )
        and not exists (
          select 1
          from public.lead_experimentais le
          left join public.leads le_lead on le_lead.id = le.lead_id
          where le.unidade_id = ae.unidade_id
            and le.data_experimental = ae.data_aula
            and le.horario_experimental = (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time
            and le.professor_experimental_id = ae.professor_id
            and lower(btrim(le.status::text)) in ('experimental_realizada', 'experimental_faltou')
            and coalesce(le.aluno_id, le_lead.aluno_id) = r.aluno_id
            and (
              nullif(le.emusys_aula_id, 0) is null
              or exists (
                select 1
                from public.aulas_emusys ae_exp
                where ae_exp.emusys_id = le.emusys_aula_id
                  and ae_exp.unidade_id = ae.unidade_id
                  and ae_exp.data_aula = ae.data_aula
                  and coalesce(ae_exp.categoria, 'normal') = 'experimental'
                  and ae_exp.professor_id = ae.professor_id
                  and ae_exp.data_hora_inicio = ae.data_hora_inicio
                  and ae_exp.data_hora_fim = ae.data_hora_fim
              )
            )
        )
  $sql$;
begin
  if position('lead_experimentais le' in v_def) > 0 then
    null;
  elsif position(v_anchor in v_def) > 0 then
    execute replace(v_def, v_anchor, v_replacement);
  else
    raise exception
      'pendencias experimentais: ponto de insercao nao encontrado em %',
      v_oid::regprocedure;
  end if;
end
$migration$;

comment on function public.get_agenda_dia(date, uuid) is
  'Agenda operacional: experimental usa a aula Emusys canonica e nao duplica no roster regular.';

comment on function public.get_agenda_semana(date, uuid) is
  'Agenda semanal: experimental usa a aula Emusys canonica e nao duplica no roster regular.';

comment on function public.fn_presenca_pendencias_do_dia_v2(uuid, date) is
  'Pendencias canonicas: experimental terminal cobre duplicata regular do mesmo aluno e horario.';
