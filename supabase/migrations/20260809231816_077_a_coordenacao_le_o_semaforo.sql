-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.app_coordenacao_feedback_mes(
  p_competencia date default null,
  p_unidade_id  uuid default null,
  p_limite      integer default 200
) returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_comp  date := public.fn_competencia_feedback(p_competencia);
  v_hoje  date := public.fn_hoje_brt();
  v_lim   int  := greatest(coalesce(p_limite, 200), 1);
begin
  if not public.fn_e_coordenacao_la_teacher() then
    raise exception 'apenas_admin';
  end if;

  return (
    with carteira as (
      select v.aluno_id,
             v.professor_id,
             min(v.aluno_nome)                        as aluno_nome,
             (array_agg(v.unidade_id))[1]             as unidade_id,
             (array_agg(v.unidade_nome))[1]           as unidade_nome,
             min(v.professor_nome)                    as professor_nome,
             string_agg(distinct v.curso_nome, ' · ') as cursos
        from public.vw_jornada_professor_atual v
        join public.alunos a on a.id = v.aluno_id
       where a.arquivado_em is null
       group by v.aluno_id, v.professor_id
    ),
    universo as (
      select * from carteira
       where p_unidade_id is null or unidade_id = p_unidade_id
    ),
    resp as (
      select f.aluno_id, f.professor_id, f.feedback, f.pratica_em_casa,
             f.evolucao, f.animo, nullif(btrim(f.observacao), '') as observacao,
             f.respondido_em, f.atualizado_em,
             (f.feedback is not null and f.pratica_em_casa is not null
              and f.evolucao is not null and f.animo is not null) as completo
        from public.aluno_feedback_professor f
       where f.competencia = v_comp
    ),
    linha as (
      select u.*, r.feedback, r.pratica_em_casa, r.evolucao, r.animo,
             r.observacao, r.respondido_em, r.atualizado_em,
             coalesce(r.completo, false) as completo,
             (r.feedback in ('vermelho','amarelo') or r.observacao is not null)
               as precisa_olho
        from universo u
        left join resp r
          on r.aluno_id = u.aluno_id and r.professor_id = u.professor_id
    ),
    olho as (
      select * from linha
       where precisa_olho
       order by case feedback when 'vermelho' then 0 when 'amarelo' then 1 else 2 end,
                (observacao is null),
                aluno_nome
       limit v_lim
    ),
    fac as (
      select c.unidade_id, min(c.unidade_nome) as nome,
             count(distinct c.aluno_id)::int as alunos
        from carteira c
       where c.unidade_id is not null
       group by c.unidade_id
    )
    select jsonb_build_object(
      'competencia',   v_comp,
      'janela_aberta', public.fn_janela_feedback_aberta(v_hoje),
      'resumo', (
        select jsonb_build_object(
          'alunos',         count(distinct aluno_id),
          'respondidos',    count(distinct aluno_id) filter (where completo),
          'verde',          count(distinct aluno_id) filter (where feedback = 'verde'),
          'amarelo',        count(distinct aluno_id) filter (where feedback = 'amarelo'),
          'vermelho',       count(distinct aluno_id) filter (where feedback = 'vermelho'),
          'sem_resposta',   count(distinct aluno_id) filter (where feedback is null),
          'com_recado',     count(distinct aluno_id) filter (where observacao is not null),
          'professores',    count(distinct professor_id),
          'professores_ok', count(distinct professor_id) filter (where completo))
          from linha),
      'precisam_de_olho', (select count(*) from linha where precisa_olho),
      'truncado',         (select count(*) from linha where precisa_olho) > v_lim,
      'alunos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'aluno_id',        o.aluno_id,
          'aluno_nome',      o.aluno_nome,
          'cursos',          o.cursos,
          'unidade_id',      o.unidade_id,
          'unidade_nome',    o.unidade_nome,
          'professor_id',    o.professor_id,
          'professor_nome',  o.professor_nome,
          'feedback',        o.feedback,
          'pratica_em_casa', o.pratica_em_casa,
          'evolucao',        o.evolucao,
          'animo',           o.animo,
          'observacao',      o.observacao,
          'completo',        o.completo,
          'respondido_em',   coalesce(o.atualizado_em, o.respondido_em)))
          from olho o), '[]'::jsonb),
      'filtros', jsonb_build_object(
        'unidades', coalesce((
          select jsonb_agg(jsonb_build_object(
            'unidade_id', f.unidade_id, 'nome', f.nome, 'alunos', f.alunos)
            order by f.nome)
            from fac f), '[]'::jsonb))
    )
  );
end;
$$;

comment on function public.app_coordenacao_feedback_mes(date, uuid, integer) is
  'Semáforo do mês pra COORDENAÇÃO: resumo + quem precisa de olho (vermelho, amarelo ou com observação do professor). Mesmo universo da mesa do professor (077).';

revoke all on function public.app_coordenacao_feedback_mes(date, uuid, integer) from public;
grant execute on function public.app_coordenacao_feedback_mes(date, uuid, integer) to authenticated;
