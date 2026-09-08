begin;

-- O contrato V3 herdava mapa, agenda e metadados do produtor V2. No mes
-- aberto, esse produtor recalculava toda a Performance duas vezes antes de o
-- V3 substituir os mesmos numeros pela fotografia do painel. Estes dois
-- helpers preservam o contexto publico sem entrar nessa cadeia legada.
create or replace function public.get_health_score_professor_v3_sinais_snapshot_v1(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text default 'mensal'
)
returns table (
  professor_id integer,
  unidade_id uuid,
  sinal text,
  severidade text,
  evidencias jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_competencia is null
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_SINAIS_SNAPSHOT_INVALIDO'
      using errcode = '22023';
  end if;

  return query
  with performance as materialized (
    select *
    from public.get_health_score_professor_v3_performance_snapshot_v3(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    )
  ), professores as (
    select
      p.professor_id,
      p.unidade_id,
      max(p.comparabilidade_estado) as estado,
      max(p.score_observado) as score,
      max(p.valor_bruto) filter (where p.metrica = 'numero_alunos') as carteira,
      max(p.valor_bruto) filter (where p.metrica = 'retencao') as retencao,
      max(p.meta) filter (where p.metrica = 'retencao') as meta_retencao,
      max(p.valor_bruto) filter (where p.metrica = 'presenca') as presenca,
      max(p.meta) filter (where p.metrica = 'presenca') as meta_presenca,
      max(p.codigo_evidencia) filter (where p.metrica = 'retencao') as evidencia_retencao,
      max(p.codigo_evidencia) filter (where p.metrica = 'presenca') as evidencia_presenca,
      bool_or(p.comparabilidade_estado = 'em_maturacao') as em_maturacao
    from performance p
    group by p.professor_id, p.unidade_id
  ), percentis as (
    select
      percentile_cont(0.5) within group (order by f.carteira) as p50,
      percentile_cont(0.75) within group (order by f.carteira) as p75
    from professores f
    where f.carteira is not null
  ), capacidade as (
    select
      d.professor_id,
      d.unidade_id,
      bool_or(d.capacidade_excedida and d.capacidade_fisica)
        as capacidade_fisica_excedida,
      bool_or(d.capacidade_excedida and not d.capacidade_fisica)
        as capacidade_estimada_excedida,
      jsonb_agg(d.evidencias order by d.curso_id, d.turma_chave)
        filter (where d.capacidade_excedida and d.capacidade_fisica)
        as evidencias_capacidade_fisica,
      jsonb_agg(d.evidencias order by d.curso_id, d.turma_chave)
        filter (where d.capacidade_excedida and not d.capacidade_fisica)
        as evidencias_capacidade_estimada
    from public.get_health_score_professor_v3_capacidade_diagnostico(
      p_competencia,
      p_unidade_id
    ) d
    where p_unidade_id is not null
    group by d.professor_id, d.unidade_id
  ), disponibilidade as (
    select
      pu.professor_id,
      pu.unidade_id,
      bool_or(coalesce(pu.disponibilidade, '{}'::jsonb) not in ('{}'::jsonb, '[]'::jsonb))
        as disponivel
    from public.professores_unidades pu
    where p_unidade_id is null or pu.unidade_id = p_unidade_id
    group by pu.professor_id, pu.unidade_id
  ), base as (
    select
      f.*,
      q.p50,
      q.p75,
      coalesce(c.capacidade_fisica_excedida, false) as capacidade_fisica_excedida,
      coalesce(c.capacidade_estimada_excedida, false) as capacidade_estimada_excedida,
      c.evidencias_capacidade_fisica,
      c.evidencias_capacidade_estimada,
      coalesce(d.disponivel, false) as tem_disponibilidade,
      coalesce(f.retencao >= f.meta_retencao, false) as retencao_saudavel,
      coalesce(f.presenca >= f.meta_presenca, false) as presenca_saudavel
    from professores f
    cross join percentis q
    left join capacidade c
      on c.professor_id = f.professor_id
     and c.unidade_id is not distinct from f.unidade_id
    left join disponibilidade d
      on d.professor_id = f.professor_id
     and d.unidade_id is not distinct from f.unidade_id
  ), sinais as (
    select
      b.professor_id,
      b.unidade_id,
      'possivel_sobrecarga'::text as sinal,
      case when b.capacidade_fisica_excedida then 'alto' else 'medio' end::text
        as severidade,
      jsonb_build_object(
        'carteira', b.carteira,
        'p75_unidade', b.p75,
        'retencao', b.retencao,
        'meta_retencao', b.meta_retencao,
        'presenca', b.presenca,
        'meta_presenca', b.meta_presenca,
        'capacidade_fisica_excedida', b.capacidade_fisica_excedida,
        'motivo', 'carteira_acima_p75_com_indicador_pedagogico_fragil'
      ) as evidencias
    from base b
    where b.carteira > b.p75
      and (
        not b.retencao_saudavel
        or not b.presenca_saudavel
        or b.capacidade_fisica_excedida
      )

    union all
    select
      b.professor_id,
      b.unidade_id,
      'expansao_sustentavel',
      'baixo',
      jsonb_build_object(
        'carteira', b.carteira,
        'p50_unidade', b.p50,
        'retencao', b.retencao,
        'presenca', b.presenca,
        'motivo', 'carteira_relevante_com_indicadores_saudaveis'
      )
    from base b
    where b.carteira >= b.p50
      and b.retencao_saudavel
      and b.presenca_saudavel
      and not b.capacidade_fisica_excedida

    union all
    select
      b.professor_id,
      b.unidade_id,
      'oportunidade_distribuicao',
      'baixo',
      jsonb_build_object(
        'carteira', b.carteira,
        'p50_unidade', b.p50,
        'retencao', b.retencao,
        'presenca', b.presenca,
        'disponibilidade_cadastrada', b.tem_disponibilidade,
        'motivo', 'carteira_abaixo_p50_com_saude_e_disponibilidade'
      )
    from base b
    where b.carteira < b.p50
      and b.retencao_saudavel
      and b.presenca_saudavel
      and b.tem_disponibilidade

    union all
    select
      b.professor_id,
      b.unidade_id,
      'concentracao_operacional',
      'alto',
      jsonb_build_object(
        'capacidade_fisica_excedida', true,
        'turmas', coalesce(b.evidencias_capacidade_fisica, '[]'::jsonb),
        'motivo', 'ocupacao_acima_da_capacidade_fisica_cadastrada'
      )
    from base b
    where b.capacidade_fisica_excedida

    union all
    select
      b.professor_id,
      b.unidade_id,
      'capacidade_estimada_conferir',
      'medio',
      jsonb_build_object(
        'capacidade_estimada_excedida', true,
        'fonte', 'estimada_segmento',
        'turmas', coalesce(b.evidencias_capacidade_estimada, '[]'::jsonb),
        'motivo', 'estimativa_sem_vinculo_fisico_de_turma_ou_sala'
      )
    from base b
    where b.capacidade_estimada_excedida

    union all
    select
      b.professor_id,
      b.unidade_id,
      'maturacao',
      'baixo',
      jsonb_build_object(
        'estado', b.estado,
        'score', b.score,
        'evidencia_retencao', b.evidencia_retencao,
        'evidencia_presenca', b.evidencia_presenca,
        'motivo', 'professor_ou_base_em_maturacao'
      )
    from base b
    where b.em_maturacao or b.estado = 'em_maturacao'
  )
  select s.professor_id, s.unidade_id, s.sinal, s.severidade, s.evidencias
  from sinais s
  order by
    case s.severidade when 'alto' then 1 when 'medio' then 2 else 3 end,
    s.professor_id,
    s.sinal;
end;
$function$;

revoke all on function public.get_health_score_professor_v3_sinais_snapshot_v1(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_health_score_professor_v3_sinais_snapshot_v1(
  date, uuid, text
) to service_role;

create or replace function public.montar_relatorio_coordenacao_contexto_v3_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text default 'mensal'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date;
  v_periodo_inicio date;
  v_periodo_fim date;
  v_ciclo_codigo text;
  v_periodo_label text;
  v_unidade_nome text;
  v_contexto_operacional text;
  v_mapa_sinais jsonb := '[]'::jsonb;
  v_agenda_treinamentos jsonb := '{}'::jsonb;
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_ano is null or p_ano < 2020 or p_ano > 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_CONTEXTO_V3_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  v_competencia := make_date(p_ano, p_mes, 1);
  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo, p.periodo_label
  into v_periodo_inicio, v_periodo_fim, v_ciclo_codigo, v_periodo_label
  from public.fn_health_score_v3_periodo(v_competencia, p_periodicidade) p;

  if p_unidade_id is null then
    v_unidade_nome := 'Consolidado';
  else
    select u.nome into v_unidade_nome
    from public.unidades u
    where u.id = p_unidade_id;

    if v_unidade_nome is null then
      raise exception 'RELATORIO_COORDENACAO_CONTEXTO_V3_UNIDADE_INVALIDA'
        using errcode = '22023';
    end if;
  end if;

  v_contexto_operacional := case
    when v_periodo_inicio <= date '2026-07-31'
     and v_periodo_fim >= date '2026-07-01' then 'recesso_parcial'
    else 'operacao_regular'
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'professor_id', s.professor_id,
    'professor', prof.nome,
    'sinal', s.sinal,
    'severidade', s.severidade,
    'evidencias', s.evidencias
  ) order by
    case s.severidade when 'alto' then 1 when 'medio' then 2 else 3 end,
    s.professor_id,
    s.sinal
  ), '[]'::jsonb)
  into v_mapa_sinais
  from public.get_health_score_professor_v3_sinais_snapshot_v1(
    v_competencia,
    p_unidade_id,
    p_periodicidade
  ) s
  join public.professores prof on prof.id = s.professor_id;

  select jsonb_build_object(
    'treinamentos_agendados', count(*) filter (where pa.tipo = 'treinamento'),
    'reunioes_agendadas', count(*) filter (where pa.tipo = 'reuniao'),
    'checkpoints_agendados', count(*) filter (where pa.tipo = 'checkpoint'),
    'concluidos', count(*) filter (where pa.status = 'concluido'),
    'atrasados', count(*) filter (
      where pa.status = 'pendente' and pa.data_agendada < current_date
    ),
    'acoes', coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'professor_id', pa.professor_id,
      'tipo', pa.tipo,
      'titulo', pa.titulo,
      'status', pa.status,
      'data', pa.data_agendada
    )) order by pa.data_agendada) filter (where pa.id is not null), '[]'::jsonb),
    'catalogo', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nome', ct.nome,
        'descricao', ct.descricao,
        'foco', ct.foco
      ) order by ct.nome), '[]'::jsonb)
      from public.catalogo_treinamentos ct
      where ct.ativo = true
    )
  )
  into v_agenda_treinamentos
  from public.professor_acoes pa
  where (p_unidade_id is null or pa.unidade_id = p_unidade_id)
    and pa.data_agendada::date between v_periodo_inicio and v_periodo_fim;

  return jsonb_build_object(
    'schema_version', 3,
    'periodo', jsonb_build_object(
      'unidade_id', p_unidade_id,
      'unidade_nome', v_unidade_nome,
      'ano', p_ano,
      'mes', p_mes,
      'inicio', v_periodo_inicio,
      'fim', v_periodo_fim,
      'periodicidade', p_periodicidade,
      'ciclo_codigo', v_ciclo_codigo,
      'label', v_periodo_label,
      'coordenadores', jsonb_build_array('Quintela', 'Juliana'),
      'contexto_operacional', v_contexto_operacional
    ),
    'professores', '[]'::jsonb,
    'mapa_sinais', v_mapa_sinais,
    'agenda_treinamentos', v_agenda_treinamentos,
    'qualidade_dados', '{}'::jsonb,
    'auditoria', jsonb_build_object(
      'contrato_contexto', 'relatorio-coordenacao-contexto-v3-1',
      'fonte_contexto', 'fotografia do painel e cadastros operacionais do periodo',
      'gerado_em', now()
    )
  );
end;
$function$;

revoke all on function public.montar_relatorio_coordenacao_contexto_v3_v1(
  uuid, integer, integer, text
) from public, anon, authenticated, service_role;

-- Fecha a divergencia entre a tabela de Performance e os relatorios da
-- Coordenacao sem recalcular Health Score nem alterar suas regras. O corpo
-- grande continua sendo preservado pelo banco; este patch so aceita as duas
-- definicoes vivas medidas em 08/09/2026, depois das migrations 181141 e
-- 183928. Qualquer deriva aborta a transacao inteira.
do $migration$
declare
  v_enriquecer regprocedure :=
    'public.enriquecer_relatorio_coordenacao_v2_comparabilidade(jsonb,uuid,date)'::regprocedure;
  v_montar regprocedure :=
    'public.montar_relatorio_coordenacao_payload_v3(uuid,integer,integer,text)'::regprocedure;
  v_enriquecer_definition text;
  v_definition text;
  v_patched text;
  v_hash text;
  v_expected_enriquecer_hash constant text := 'e9de86a8e6afaff34d557b3e75636eb5';
  v_expected_montar_hash constant text := '00e8489216514a053208cb38740d1f87';
  v_expected_result_hash constant text := 'c7aeb3256b177cf4fd782c5705f03ab7';
  v_old_declarations constant text := E'  v_regra_fingerprint text;\nbegin';
  v_new_declarations constant text := E'  v_regra_fingerprint text;\n'
    || E'  v_periodo_publicacao_oficial boolean := false;\n'
    || E'  v_periodo_ranking_habilitado boolean := false;\n'
    || E'  v_ciclo_estado text;\n'
    || E'begin';
  v_period_anchor constant text :=
    '  from public.fn_health_score_v3_periodo(v_competencia, p_periodicidade) p;';
  v_old_base constant text := E'  v_base := public.get_relatorio_coordenacao_canonico_v2(\n'
    || E'    p_unidade_id,\n'
    || E'    p_ano,\n'
    || E'    p_mes\n'
    || E'  );';
  v_new_base constant text := E'  v_base := public.montar_relatorio_coordenacao_contexto_v3_v1(\n'
    || E'    p_unidade_id,\n'
    || E'    p_ano,\n'
    || E'    p_mes,\n'
    || E'    p_periodicidade\n'
    || E'  );';
  v_period_metadata constant text := E'  from public.fn_health_score_v3_periodo(v_competencia, p_periodicidade) p;\n\n'
    || E'  if p_periodicidade = ''ciclo'' then\n'
    || E'    select\n'
    || E'      coalesce(c.publicacao_oficial, false),\n'
    || E'      coalesce(c.ranking_habilitado, false),\n'
    || E'      c.estado\n'
    || E'    into\n'
    || E'      v_periodo_publicacao_oficial,\n'
    || E'      v_periodo_ranking_habilitado,\n'
    || E'      v_ciclo_estado\n'
    || E'    from public.health_score_professor_v3_ciclos c\n'
    || E'    where c.codigo = v_ciclo_codigo;\n\n'
    || E'    v_periodo_publicacao_oficial := coalesce(v_periodo_publicacao_oficial, false);\n'
    || E'    v_periodo_ranking_habilitado := coalesce(v_periodo_ranking_habilitado, false);\n'
    || E'  end if;';
  v_empty_snapshot_guard constant text := E'  if jsonb_array_length(v_performance) = 0 then\n'
    || E'    raise exception ''RELATORIO_COORDENACAO_V3_HEALTH_SCORE_INDISPONIVEL'';\n'
    || E'  end if;';
  v_old_operational constant text := E'    with base_professores as (\n'
    || E'    select value as item\n'
    || E'    from jsonb_array_elements(coalesce(v_base->''professores'', ''[]''::jsonb))\n'
    || E'    where nullif(value->>''professor_id'', '''') is not null\n'
    || E'  )\n'
    || E'  select coalesce(\n'
    || E'    jsonb_object_agg(\n'
    || E'      item->>''professor_id'',\n'
    || E'      coalesce(item->''operacional'', ''{}''::jsonb)\n'
    || E'    ),\n'
    || E'    ''{}''::jsonb\n'
    || E'  )\n'
    || E'  into v_operacional\n'
    || E'  from base_professores;';
  v_new_operational constant text := E'  with kpis_professor as (\n'
    || E'    select\n'
    || E'      k.professor_id,\n'
    || E'      coalesce(sum(k.total_turmas), 0)::integer as total_turmas,\n'
    || E'      coalesce(sum(k.alunos_via_turmas), 0)::integer as alunos_via_turmas,\n'
    || E'      coalesce(sum(k.turmas_elegiveis_media), 0)::integer as turmas_elegiveis_media,\n'
    || E'      coalesce(sum(k.carteira_alunos), 0)::integer as carteira_alunos\n'
    || E'    from public.get_kpis_professor_periodo_canonico_base_20260711(\n'
    || E'      p_ano,\n'
    || E'      p_mes,\n'
    || E'      p_unidade_id,\n'
    || E'      v_periodo_inicio,\n'
    || E'      v_periodo_fim\n'
    || E'    ) k\n'
    || E'    where k.professor_id is not null\n'
    || E'    group by k.professor_id\n'
    || E'  )\n'
    || E'  select coalesce(\n'
    || E'    jsonb_object_agg(\n'
    || E'      professor_id::text,\n'
    || E'      jsonb_build_object(\n'
    || E'        ''total_turmas'', total_turmas,\n'
    || E'        ''alunos_via_turmas'', alunos_via_turmas,\n'
    || E'        ''turmas_elegiveis_media'', turmas_elegiveis_media,\n'
    || E'        ''carteira_alunos'', carteira_alunos\n'
    || E'      )\n'
    || E'    ),\n'
    || E'    ''{}''::jsonb\n'
    || E'  )\n'
    || E'  into v_operacional\n'
    || E'  from kpis_professor;';
  v_roster_anchor constant text := E'  base_professores as (\n'
    || E'    select value as item\n'
    || E'    from jsonb_array_elements(coalesce(v_base->''professores'', ''[]''::jsonb))\n'
    || E'  ),\n'
    || E'  performance_professor as (';
  v_roster_ctes constant text := E'  base_professores as (\n'
    || E'    select value as item\n'
    || E'    from jsonb_array_elements(coalesce(v_base->''professores'', ''[]''::jsonb))\n'
    || E'  ),\n'
    || E'  active_roster as (\n'
    || E'    select distinct prof.id as professor_id, prof.nome\n'
    || E'    from public.professores prof\n'
    || E'    join public.professores_unidades pu on pu.professor_id = prof.id\n'
    || E'    where prof.ativo\n'
    || E'      and pu.emusys_ativo\n'
    || E'      and pu.validacao_status <> ''ignorado''\n'
    || E'      and (p_unidade_id is null or pu.unidade_id = p_unidade_id)\n'
    || E'  ),\n'
    || E'  performance_professor as (';
  v_old_driver constant text := E'  from performance_professor p\n'
    || E'  left join base_professores b\n'
    || E'    on nullif(b.item->>''professor_id'', '''')::integer = p.professor_id\n'
    || E'  left join public.professores prof on prof.id = p.professor_id;';
  v_new_driver constant text := E'  from active_roster roster\n'
    || E'  left join performance_professor p on p.professor_id = roster.professor_id\n'
    || E'  left join base_professores b\n'
    || E'    on nullif(b.item->>''professor_id'', '''')::integer = roster.professor_id;';
  v_period_json_anchor constant text := E'      ''estado_publicacao'', v_estado_publicacao,\n'
    || E'      ''data_corte'', v_data_corte';
  v_period_json_new constant text := E'      ''estado_publicacao'', v_estado_publicacao,\n'
    || E'      ''publicacao_oficial'', v_periodo_publicacao_oficial,\n'
    || E'      ''ranking_habilitado'', v_periodo_ranking_habilitado,\n'
    || E'      ''ciclo_estado'', v_ciclo_estado,\n'
    || E'      ''data_corte'', v_data_corte';
  v_quality_anchor constant text := E'    ''qualidade_dados'', coalesce(v_base->''qualidade_dados'', ''{}''::jsonb)\n'
    || E'      || jsonb_build_object(\n'
    || E'        ''capacidade_estimada_pendente'', v_qualidade_capacidade\n'
    || E'      ),';
  v_quality_new constant text := E'    ''qualidade_dados'', coalesce(v_base->''qualidade_dados'', ''{}''::jsonb)\n'
    || E'      || jsonb_build_object(\n'
    || E'        ''professores_sem_fonte'', coalesce(nullif(v_resumo->>''sem_base_operacional'', '''')::integer, 0),\n'
    || E'        ''capacidade_estimada_pendente'', v_qualidade_capacidade\n'
    || E'      ),';
  v_count integer;
begin
  select replace(pg_get_functiondef(v_enriquecer::oid), E'\r\n', E'\n')
  into v_enriquecer_definition;
  if md5(v_enriquecer_definition) <> v_expected_enriquecer_hash then
    raise exception 'RELATORIO_COORDENACAO_PAINEL_HASH_DIVERGENTE'
      using detail = format(
        'enriquecer esperado=%s encontrado=%s',
        v_expected_enriquecer_hash,
        md5(v_enriquecer_definition)
      );
  end if;

  select replace(pg_get_functiondef(v_montar::oid), E'\r\n', E'\n')
  into v_definition;
  v_hash := md5(v_definition);
  if v_hash <> v_expected_montar_hash then
    raise exception 'RELATORIO_COORDENACAO_PAINEL_HASH_DIVERGENTE'
      using detail = format(
        'montar esperado=%s encontrado=%s',
        v_expected_montar_hash,
        v_hash
      );
  end if;

  foreach v_hash in array array[
    v_old_declarations,
    v_period_anchor,
    v_old_base,
    v_empty_snapshot_guard,
    v_old_operational,
    v_roster_anchor,
    E'jsonb_build_object(\n          ''professor_id'', p.professor_id,',
    '''metricas'', p.metricas,',
    'v_operacional->p.professor_id::text',
    v_old_driver,
    v_period_json_anchor,
    v_quality_anchor
  ] loop
    v_count := (length(v_definition) - length(replace(v_definition, v_hash, '')))
      / length(v_hash);
    if v_count <> 1 then
      raise exception 'RELATORIO_COORDENACAO_PAINEL_ANCORA_DIVERGENTE'
        using detail = format('ocorrencias=%s ancora=%s', v_count, left(v_hash, 120));
    end if;
  end loop;

  v_count := (length(v_definition) - length(replace(v_definition, 'prof.nome', '')))
    / length('prof.nome');
  if v_count <> 2 then
    raise exception 'RELATORIO_COORDENACAO_PAINEL_ANCORA_DIVERGENTE'
      using detail = format('prof.nome ocorrencias=%s', v_count);
  end if;

  v_patched := replace(v_definition, v_old_declarations, v_new_declarations);
  v_patched := replace(v_patched, v_period_anchor, v_period_metadata);
  v_patched := replace(v_patched, v_old_base, v_new_base);
  v_patched := replace(v_patched, v_empty_snapshot_guard, '');
  v_patched := replace(v_patched, v_old_operational, v_new_operational);
  -- Neste ponto ainda existem apenas as duas referencias antigas. Fazer esta
  -- troca antes de inserir active_roster preserva o prof.nome da propria CTE.
  v_patched := replace(v_patched, 'prof.nome', 'roster.nome');
  v_patched := replace(v_patched, v_roster_anchor, v_roster_ctes);
  v_patched := replace(
    v_patched,
    E'jsonb_build_object(\n          ''professor_id'', p.professor_id,',
    E'jsonb_build_object(\n          ''professor_id'', roster.professor_id,'
  );
  v_patched := replace(v_patched, '''metricas'', p.metricas,', '''metricas'', coalesce(p.metricas, ''{}''::jsonb),');
  v_patched := replace(v_patched, 'v_operacional->p.professor_id::text', 'v_operacional->roster.professor_id::text');
  v_patched := replace(v_patched, v_old_driver, v_new_driver);
  v_patched := replace(v_patched, v_period_json_anchor, v_period_json_new);
  v_patched := replace(v_patched, v_quality_anchor, v_quality_new);

  if strpos(v_patched, 'from performance_professor p') > 0
     or strpos(v_patched, 'v_operacional->p.professor_id::text') > 0
     or strpos(v_patched, 'get_kpis_professor_periodo_canonico_v3(') > 0
     or strpos(v_patched, 'RELATORIO_COORDENACAO_V3_HEALTH_SCORE_INDISPONIVEL') > 0
     or strpos(v_patched, 'active_roster') = 0
     or strpos(v_patched, 'get_kpis_professor_periodo_canonico_base_20260711(') = 0
     or strpos(v_patched, '''professores_sem_fonte''') = 0 then
    raise exception 'RELATORIO_COORDENACAO_PAINEL_PATCH_INCOMPLETO';
  end if;

  if strpos(v_patched, 'get_relatorio_coordenacao_canonico_v2(') > 0 then
    raise exception 'RELATORIO_COORDENACAO_CONTEXTO_LEGADO_REMANESCENTE';
  end if;

  execute v_patched;

  select replace(pg_get_functiondef(v_montar::oid), E'\r\n', E'\n')
  into v_definition;
  if md5(v_definition) <> v_expected_result_hash then
    raise exception 'RELATORIO_COORDENACAO_PAINEL_RESULTADO_DIVERGENTE'
      using detail = format(
        'resultado esperado=%s encontrado=%s',
        v_expected_result_hash,
        md5(v_definition)
      );
  end if;
end;
$migration$;

comment on function public.montar_relatorio_coordenacao_payload_v3(
  uuid, integer, integer, text
) is
  'Produtor dos relatorios da Coordenacao: espelha o snapshot e o roster ativo do painel; contexto leve respeita o periodo mensal/ciclo completo; nao entra no produtor legado nem recalcula Health Score.';

commit;
