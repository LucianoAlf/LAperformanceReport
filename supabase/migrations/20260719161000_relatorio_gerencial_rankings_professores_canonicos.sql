-- Alinha os rankings de professores do relatorio gerencial aos mesmos
-- read models canonicos usados em Gestao de Professores. Os demais dominios
-- do relatorio (financeiro, alunos e comercial da unidade) permanecem intactos.

do $$
begin
  if to_regprocedure(
    'public.get_dados_relatorio_gerencial_legacy_rankings_p24_20260719(uuid,integer,integer)'
  ) is null then
    alter function public.get_dados_relatorio_gerencial(uuid, integer, integer)
      rename to get_dados_relatorio_gerencial_legacy_rankings_p24_20260719;
  end if;
end $$;

create or replace function public.get_dados_relatorio_gerencial(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (
    extract(year from (now() at time zone 'America/Sao_Paulo'))
  )::integer,
  p_mes integer default (
    extract(month from (now() at time zone 'America/Sao_Paulo'))
  )::integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_competencia date := make_date(p_ano, p_mes, 1);
  v_fim date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
  v_rankings jsonb;
  v_patch jsonb := '{}'::jsonb;
begin
  v_result := public.get_dados_relatorio_gerencial_legacy_rankings_p24_20260719(
    p_unidade_id,
    p_ano,
    p_mes
  );

  with kpis as materialized (
    select k.*
    from public.get_kpis_professor_periodo_canonico_v3(
      p_ano,
      p_mes,
      p_unidade_id,
      v_competencia,
      v_fim
    ) k
  ), permanencia as materialized (
    select
      h.professor_id,
      p.nome::text as professor_nome,
      h.valor_bruto,
      h.amostra,
      h.estado_base,
      h.confianca,
      h.fonte
    from public.get_health_score_professor_v3_performance(
      v_competencia,
      p_unidade_id,
      'mensal'
    ) h
    join public.professores p on p.id = h.professor_id
    join kpis k on k.professor_id = h.professor_id
    where h.metrica = 'permanencia'
      and h.valor_bruto is not null
  )
  select jsonb_build_object(
    'top_professores_media_turma', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'professor', x.professor_nome,
          'media_alunos_turma', x.media_alunos_turma,
          'ocupacoes', x.alunos_via_turmas,
          'turmas_elegiveis', x.turmas_elegiveis_media
        ) order by x.media_alunos_turma desc, x.professor_nome
      ), '[]'::jsonb)
      from (
        select
          k.professor_nome,
          round(k.media_alunos_turma, 2) as media_alunos_turma,
          k.alunos_via_turmas,
          k.turmas_elegiveis_media
        from kpis k
        where k.media_alunos_turma is not null
          and coalesce(k.turmas_elegiveis_media, 0) > 0
        order by k.media_alunos_turma desc, k.professor_nome
        limit 3
      ) x
    ),
    'top_professores_presenca', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'professor', x.professor_nome,
          'presenca_media', x.media_presenca,
          'publicavel', x.presenca_publicavel,
          'cobertura', x.presenca_cobertura,
          'confianca', x.presenca_confianca
        ) order by x.media_presenca desc, x.professor_nome
      ), '[]'::jsonb)
      from (
        select
          k.professor_nome,
          round(k.media_presenca, 1) as media_presenca,
          k.presenca_publicavel,
          k.presenca_cobertura,
          k.presenca_confianca
        from kpis k
        where k.media_presenca is not null
        order by k.media_presenca desc, k.professor_nome
        limit 3
      ) x
    ),
    'top_professores_matriculadores', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'professor_nome', x.professor_nome,
          'matriculas', x.matriculas,
          'experimentais', x.experimentais,
          'taxa_conversao', x.taxa_conversao
        ) order by x.matriculas desc, x.taxa_conversao desc, x.professor_nome
      ), '[]'::jsonb)
      from (
        select
          k.professor_nome,
          coalesce(k.matriculas_pos_exp, 0) as matriculas,
          coalesce(k.experimentais, 0) as experimentais,
          k.taxa_conversao
        from kpis k
        where coalesce(k.matriculas_pos_exp, 0) > 0
        order by
          coalesce(k.matriculas_pos_exp, 0) desc,
          k.taxa_conversao desc nulls last,
          k.professor_nome
        limit 3
      ) x
    ),
    'top_professores_retencao', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'professor', x.professor_nome,
          'tempo_medio_permanencia', x.tempo_medio_permanencia,
          'amostra', x.amostra,
          'estado_base', x.estado_base,
          'confianca', x.confianca
        ) order by x.tempo_medio_permanencia desc, x.professor_nome
      ), '[]'::jsonb)
      from (
        select
          p.professor_nome,
          round(p.valor_bruto, 1) as tempo_medio_permanencia,
          p.amostra,
          p.estado_base,
          p.confianca
        from permanencia p
        order by p.valor_bruto desc, p.professor_nome
        limit 3
      ) x
    )
  ) into v_rankings;

  -- Para competencias sem cobertura V3, preserva o ranking anterior em vez
  -- de fabricar uma lista vazia. A fonte explicita qual ranking foi substituido.
  if jsonb_array_length(v_rankings->'top_professores_media_turma') > 0 then
    v_patch := v_patch || jsonb_build_object(
      'top_professores_media_turma', v_rankings->'top_professores_media_turma'
    );
  end if;
  if jsonb_array_length(v_rankings->'top_professores_presenca') > 0 then
    v_patch := v_patch || jsonb_build_object(
      'top_professores_presenca', v_rankings->'top_professores_presenca'
    );
  end if;
  if jsonb_array_length(v_rankings->'top_professores_matriculadores') > 0 then
    v_patch := v_patch || jsonb_build_object(
      'top_professores_matriculadores', v_rankings->'top_professores_matriculadores'
    );
  end if;
  if jsonb_array_length(v_rankings->'top_professores_retencao') > 0 then
    v_patch := v_patch || jsonb_build_object(
      'top_professores_retencao', v_rankings->'top_professores_retencao'
    );
  end if;

  v_patch := v_patch || jsonb_build_object(
    'fonte_rankings_professores', jsonb_build_object(
      'versao', 'professores_canonicos_v3_p24',
      'carteira_media_presenca_conversao',
        'get_kpis_professor_periodo_canonico_v3',
      'permanencia', 'get_health_score_professor_v3_performance',
      'competencia', v_competencia,
      'fallback_legado', jsonb_build_object(
        'media_turma', jsonb_array_length(v_rankings->'top_professores_media_turma') = 0,
        'presenca', jsonb_array_length(v_rankings->'top_professores_presenca') = 0,
        'matriculadores', jsonb_array_length(v_rankings->'top_professores_matriculadores') = 0,
        'permanencia', jsonb_array_length(v_rankings->'top_professores_retencao') = 0
      )
    )
  );

  return v_result || v_patch;
end;
$$;

revoke all on function public.get_dados_relatorio_gerencial(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_dados_relatorio_gerencial(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_dados_relatorio_gerencial(uuid, integer, integer) is
  'P24: preserva os dominios validados do gerencial e substitui rankings de professores por carteira, ocupacao, presenca, conversao e permanencia canonicas V3 quando houver cobertura.';
