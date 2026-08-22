-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- v2 da agenda por sessão, com os 3 fixes do Claude Code:
-- (1) presença REAL (aluno_presenca.status), (2) tem_registro com anotacoes legado (OR),
-- (3) data_hora_fim no shape. Ausente NÃO é filtrado (o professor precisa ver quem faltou),
-- mas vem marcado corretamente pra Alma tratar (ausente não recebe conteúdo).
create or replace function public.app_minha_agenda_sessao(p_data date default current_date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then return jsonb_build_object('erro','sem_professor_vinculado'); end if;

  return coalesce((
    with aulas_prof as (
      select ae.id, ae.data_hora_inicio, ae.data_hora_fim, ae.turma_nome, ae.tipo,
             ae.curso_nome, ae.qtd_alunos, ae.anotacoes_fabio, ae.anotacoes
      from public.aulas_emusys ae
      where ae.professor_id = v_prof and ae.data_aula = p_data and ae.cancelada = false
    ),
    aula_alunos as (
      select a.id as aula_id, a.tipo, a.turma_nome, a.data_hora_inicio, a.data_hora_fim,
             a.curso_nome, ap.aluno_id, al.nome as aluno_nome,
             coalesce(ap.status, 'presente') as presenca,
             a.anotacoes_fabio, a.anotacoes
      from aulas_prof a
      join public.aluno_presenca ap on ap.aula_emusys_id = a.id
      join public.alunos al on al.id = ap.aluno_id
    ),
    -- aluno → sua aula individual naquele slot: aula-alvo, presença e registro (fabio OU legado)
    aluno_individual as (
      select turma_nome, data_hora_inicio, aluno_id,
             aula_id as aula_individual,
             presenca as presenca_ind,
             ((anotacoes_fabio is not null and btrim(anotacoes_fabio) <> '')
               or (anotacoes is not null and btrim(anotacoes) <> '')) as tem_reg
      from aula_alunos where tipo = 'individual'
    ),
    slot_alunos as (
      select distinct turma_nome, data_hora_inicio, aluno_id, aluno_nome from aula_alunos
    ),
    slot_ancora as (
      select turma_nome, data_hora_inicio,
             coalesce(min(case when tipo='turma' then aula_id end), min(aula_id)) as aula_id_ancora,
             max(curso_nome) as curso_nome,
             max(data_hora_fim) as data_hora_fim,
             -- registro/presença da linha de turma (fallback quando não há individual)
             bool_or(case when tipo='turma' then
               ((anotacoes_fabio is not null and btrim(anotacoes_fabio) <> '')
                or (anotacoes is not null and btrim(anotacoes) <> '')) end) as turma_tem_reg,
             count(distinct aluno_id) as n_alunos
      from aula_alunos group by turma_nome, data_hora_inicio
    ),
    alunos_json as (
      select sa.turma_nome, sa.data_hora_inicio,
        jsonb_agg(
          jsonb_build_object(
            'aluno_id', sa.aluno_id,
            'nome', sa.aluno_nome,
            'aula_id_alvo', coalesce(ai.aula_individual, anc.aula_id_ancora),
            'presenca', coalesce(ai.presenca_ind, 'presente'),
            'tem_registro', coalesce(ai.tem_reg, anc.turma_tem_reg, false)
          ) order by sa.aluno_nome
        ) as alunos,
        count(*) filter (where coalesce(ai.tem_reg, anc.turma_tem_reg, false)) as n_registradas
      from slot_alunos sa
      join slot_ancora anc on anc.turma_nome=sa.turma_nome and anc.data_hora_inicio=sa.data_hora_inicio
      left join aluno_individual ai on ai.turma_nome=sa.turma_nome and ai.data_hora_inicio=sa.data_hora_inicio and ai.aluno_id=sa.aluno_id
      group by sa.turma_nome, sa.data_hora_inicio
    )
    select jsonb_agg(
      jsonb_build_object(
        'hora', to_char(anc.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI'),
        'hora_fim', to_char(anc.data_hora_fim at time zone 'America/Sao_Paulo','HH24:MI'),
        'data_hora_inicio', anc.data_hora_inicio,
        'data_hora_fim', anc.data_hora_fim,
        'curso', anc.curso_nome,
        'turma_nome', anc.turma_nome,
        'tipo', case when anc.n_alunos > 1 then 'turma' else 'individual' end,
        'aula_id_ancora', anc.aula_id_ancora,
        'n_alunos', anc.n_alunos,
        'n_registradas', aj.n_registradas,
        'alunos', aj.alunos
      ) order by anc.data_hora_inicio
    )
    from slot_ancora anc
    join alunos_json aj on aj.turma_nome=anc.turma_nome and aj.data_hora_inicio=anc.data_hora_inicio
  ), '[]'::jsonb);
end $$;
revoke all on function public.app_minha_agenda_sessao(date) from public, anon;
grant execute on function public.app_minha_agenda_sessao(date) to authenticated;
