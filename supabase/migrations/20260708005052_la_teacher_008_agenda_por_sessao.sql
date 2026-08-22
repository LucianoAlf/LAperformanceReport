-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.app_minha_agenda_sessao(p_data date default current_date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then return jsonb_build_object('erro','sem_professor_vinculado'); end if;

  return coalesce((
    with aulas_prof as (
      select ae.id, ae.data_hora_inicio, ae.turma_nome, ae.tipo,
             ae.curso_nome, ae.qtd_alunos, ae.anotacoes_fabio
      from public.aulas_emusys ae
      where ae.professor_id = v_prof and ae.data_aula = p_data and ae.cancelada = false
    ),
    aula_alunos as (
      select a.id as aula_id, a.tipo, a.turma_nome, a.data_hora_inicio,
             ap.aluno_id, al.nome as aluno_nome, a.anotacoes_fabio
      from aulas_prof a
      join public.aluno_presenca ap on ap.aula_emusys_id = a.id
      join public.alunos al on al.id = ap.aluno_id
    ),
    -- aluno → sua aula individual naquele slot (se houver)
    aluno_individual as (
      select turma_nome, data_hora_inicio, aluno_id,
             aula_id as aula_individual,
             (anotacoes_fabio is not null and btrim(anotacoes_fabio) <> '') as tem_reg
      from aula_alunos where tipo = 'individual'
    ),
    -- lista distinta de alunos por slot
    slot_alunos as (
      select distinct turma_nome, data_hora_inicio, aluno_id, aluno_nome
      from aula_alunos
    ),
    -- âncora por slot (a linha turma, senão a menor id)
    slot_ancora as (
      select turma_nome, data_hora_inicio,
             coalesce(
               min(case when tipo='turma' then aula_id end),
               min(aula_id)
             ) as aula_id_ancora,
             max(curso_nome) as curso_nome,
             count(distinct aluno_id) as n_alunos
      from aula_alunos
      group by turma_nome, data_hora_inicio
    ),
    -- montar os alunos de cada slot como json
    alunos_json as (
      select sa.turma_nome, sa.data_hora_inicio,
        jsonb_agg(
          jsonb_build_object(
            'aluno_id', sa.aluno_id,
            'nome', sa.aluno_nome,
            'aula_id_alvo', coalesce(ai.aula_individual, anc.aula_id_ancora),
            'presenca', 'presente',
            'tem_registro', coalesce(ai.tem_reg, false)
          ) order by sa.aluno_nome
        ) as alunos
      from slot_alunos sa
      join slot_ancora anc on anc.turma_nome=sa.turma_nome and anc.data_hora_inicio=sa.data_hora_inicio
      left join aluno_individual ai on ai.turma_nome=sa.turma_nome and ai.data_hora_inicio=sa.data_hora_inicio and ai.aluno_id=sa.aluno_id
      group by sa.turma_nome, sa.data_hora_inicio
    )
    select jsonb_agg(
      jsonb_build_object(
        'hora', to_char(anc.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI'),
        'data_hora_inicio', anc.data_hora_inicio,
        'curso', anc.curso_nome,
        'turma_nome', anc.turma_nome,
        'tipo', case when anc.n_alunos > 1 then 'turma' else 'individual' end,
        'aula_id_ancora', anc.aula_id_ancora,
        'n_alunos', anc.n_alunos,
        'alunos', aj.alunos
      ) order by anc.data_hora_inicio
    )
    from slot_ancora anc
    join alunos_json aj on aj.turma_nome=anc.turma_nome and aj.data_hora_inicio=anc.data_hora_inicio
  ), '[]'::jsonb);
end $$;
revoke all on function public.app_minha_agenda_sessao(date) from public, anon;
grant execute on function public.app_minha_agenda_sessao(date) to authenticated;
