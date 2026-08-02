begin;

create or replace function public.get_relatorio_coordenacao_canonico_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date;
  v_periodo_fim date;
  v_unidade_nome text;
  v_contexto_operacional text;
  v_professores jsonb := '[]'::jsonb;
  v_mapa_sinais jsonb := '[]'::jsonb;
  v_resumo jsonb := '{}'::jsonb;
  v_retencao_permanencia jsonb := '{}'::jsonb;
  v_presenca jsonb := '{}'::jsonb;
  v_experimentais jsonb := '{}'::jsonb;
  v_carteira_carga jsonb := '{}'::jsonb;
  v_agenda_treinamentos jsonb := '{}'::jsonb;
  v_qualidade_dados jsonb := '{}'::jsonb;
  v_ranking_oficial jsonb;
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_ano is null or p_ano < 2020 or p_ano > 2100
     or p_mes is null or p_mes < 1 or p_mes > 12 then
    raise exception 'RELATORIO_COORDENACAO_PERIODO_INVALIDO: ano e mes obrigatorios'
      using errcode = '22023';
  end if;

  v_competencia := make_date(p_ano, p_mes, 1);
  v_periodo_fim := (v_competencia + interval '1 month - 1 day')::date;

  if p_unidade_id is null then
    v_unidade_nome := 'Consolidado';
  else
    select u.nome
      into v_unidade_nome
    from public.unidades u
    where u.id = p_unidade_id;

    if v_unidade_nome is null then
      raise exception 'RELATORIO_COORDENACAO_UNIDADE_INVALIDA: unidade inexistente'
        using errcode = '22023';
    end if;
  end if;

  v_contexto_operacional := case
    when p_ano = 2026 and p_mes = 7 then 'recesso_parcial'
    else 'operacao_regular'
  end;

  with professores_ativos as (
    select p.id as professor_id, p.nome
    from public.professores p
    where p.ativo = true
      and exists (
        select 1
        from public.professores_unidades pu
        where pu.professor_id = p.id
          and pu.emusys_ativo = true
          and coalesce(pu.validacao_status, 'validado') <> 'ignorado'
          and (p_unidade_id is null or pu.unidade_id = p_unidade_id)
      )
  ), performance_raw as (
    select r.*
    from public.get_health_score_professor_v3_performance(
      v_competencia,
      p_unidade_id,
      'mensal'
    ) r
  ), performance as (
    select
      r.professor_id,
      max(r.estado_publicacao) as estado_publicacao,
      bool_or(r.score_exibivel) as score_exibivel,
      bool_or(r.ranking_habilitado) as ranking_habilitado,
      max(r.score) as score,
      max(r.cobertura) as cobertura,
      max(r.classificacao) as classificacao,
      max(r.estado) as estado,
      max(r.confianca) filter (where r.papel = 'nota' and r.nota is not null) as confianca,
      (array_agg(r.codigo_evidencia order by
        case when r.codigo_evidencia in ('evidencia_valida', 'valida') then 2 else 1 end,
        r.metrica
      ) filter (where r.codigo_evidencia is not null))[1] as codigo_evidencia_principal,
      jsonb_object_agg(
        r.metrica,
        jsonb_strip_nulls(jsonb_build_object(
          'valor', r.valor_bruto,
          'numerador', r.numerador,
          'denominador', r.denominador,
          'nota', r.nota,
          'meta', r.meta,
          'amostra', r.amostra,
          'estado_base', r.estado_base,
          'codigo_evidencia', r.codigo_evidencia,
          'motivo', r.motivo_sem_base,
          'confianca', r.confianca,
          'papel', r.papel,
          'peso_original', r.peso,
          'peso_efetivo', r.peso_efetivo
        )) order by r.metrica
      ) as metricas
    from performance_raw r
    group by r.professor_id
  ), equipe as (
    select
      p.professor_id,
      p.nome,
      f.score,
      f.cobertura,
      f.classificacao,
      f.estado,
      f.estado_publicacao,
      coalesce(f.score_exibivel, false) as score_exibivel,
      coalesce(f.ranking_habilitado, false) as ranking_habilitado,
      f.confianca,
      coalesce(f.metricas, '{}'::jsonb) as metricas,
      case
        when f.professor_id is null then 'fonte_canonica_indisponivel'
        when f.estado = 'em_maturacao' then 'professor_em_maturacao'
        when f.score is null then coalesce(f.codigo_evidencia_principal, 'evidencia_pendente')
        when f.estado_publicacao = 'oficial' and f.ranking_habilitado then 'avaliacao_oficial'
        else 'avaliacao_parcial'
      end as estado_evidencia
    from professores_ativos p
    left join performance f on f.professor_id = p.professor_id
  )
  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'professor_id', e.professor_id,
      'nome', e.nome,
      'score', e.score,
      'cobertura', e.cobertura,
      'classificacao', e.classificacao,
      'confianca', e.confianca,
      'estado', e.estado,
      'estado_publicacao', e.estado_publicacao,
      'score_exibivel', e.score_exibivel,
      'ranking_habilitado', e.ranking_habilitado,
      'estado_evidencia', e.estado_evidencia,
      'metricas', e.metricas
    )) order by e.professor_id
  ), '[]'::jsonb)
  into v_professores
  from equipe e;

  with sinais as (
    select
      s.professor_id,
      p.nome,
      s.sinal,
      s.severidade,
      s.evidencias
    from public.get_health_score_professor_v3_sinais(v_competencia, p_unidade_id) s
    join public.professores p on p.id = s.professor_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'professor_id', s.professor_id,
    'professor', s.nome,
    'sinal', s.sinal,
    'severidade', s.severidade,
    'evidencias', s.evidencias
  ) order by
    case s.severidade when 'alto' then 1 when 'medio' then 2 else 3 end,
    s.professor_id,
    s.sinal
  ), '[]'::jsonb)
  into v_mapa_sinais
  from sinais s;

  with equipe as (
    select value as p from jsonb_array_elements(v_professores)
  )
  select jsonb_build_object(
    'total_professores', count(*),
    'com_score', count(*) filter (where (p ->> 'score') is not null),
    'oficiais', count(*) filter (where p ->> 'estado_publicacao' = 'oficial'),
    'parciais', count(*) filter (where p ->> 'estado_evidencia' = 'avaliacao_parcial'),
    'em_maturacao', count(*) filter (where p ->> 'estado_evidencia' = 'professor_em_maturacao'),
    'com_evidencia_pendente', count(*) filter (where (p ->> 'score') is null),
    'saudaveis', count(*) filter (where p ->> 'classificacao' = 'saudavel'),
    'atencao', count(*) filter (where p ->> 'classificacao' = 'atencao'),
    'criticos', count(*) filter (where p ->> 'classificacao' = 'critico'),
    'score_medio_visivel', round(avg((p ->> 'score')::numeric), 1)
  )
  into v_resumo
  from equipe;

  with equipe as (
    select value as p from jsonb_array_elements(v_professores)
  )
  select jsonb_build_object(
    'professores_com_retencao', count(*) filter (
      where p #>> '{metricas,retencao,valor}' is not null
    ),
    'retencao_media', round(avg((p #>> '{metricas,retencao,valor}')::numeric), 1),
    'professores_com_permanencia', count(*) filter (
      where p #>> '{metricas,permanencia,valor}' is not null
    ),
    'permanencia_media_meses', round(avg((p #>> '{metricas,permanencia,valor}')::numeric), 1)
  )
  into v_retencao_permanencia
  from equipe;

  with equipe as (
    select value as p from jsonb_array_elements(v_professores)
  )
  select jsonb_build_object(
    'professores_com_evidencia', count(*) filter (
      where p #>> '{metricas,presenca,valor}' is not null
    ),
    'presencas_confirmadas', coalesce(sum((p #>> '{metricas,presenca,numerador}')::numeric), 0),
    'eventos_elegiveis', coalesce(sum((p #>> '{metricas,presenca,denominador}')::numeric), 0),
    'presenca_media', round(
      100 * sum((p #>> '{metricas,presenca,numerador}')::numeric)
      / nullif(sum((p #>> '{metricas,presenca,denominador}')::numeric), 0),
      1
    ),
    'pendencias', count(*) filter (
      where p #>> '{metricas,presenca,valor}' is null
    )
  )
  into v_presenca
  from equipe;

  with equipe as (
    select value as p from jsonb_array_elements(v_professores)
  )
  select jsonb_build_object(
    'professores_com_amostra', count(*) filter (
      where coalesce((p #>> '{metricas,conversao,peso_efetivo}')::numeric, 0) > 0
    ),
    'professores_sem_experimental', count(*) filter (
      where p #>> '{metricas,conversao,codigo_evidencia}' = 'sem_experimental_periodo'
    ),
    'professores_com_amostra_insuficiente', count(*) filter (
      where p #>> '{metricas,conversao,codigo_evidencia}' = 'amostra_insuficiente'
    ),
    'matriculas_pos_experimental', coalesce(sum((p #>> '{metricas,conversao,numerador}')::numeric), 0),
    'experimentais_observadas', coalesce(sum((p #>> '{metricas,conversao,denominador}')::numeric), 0),
    'taxa_conversao_observada', round(
      100 * sum((p #>> '{metricas,conversao,numerador}')::numeric)
      / nullif(sum((p #>> '{metricas,conversao,denominador}')::numeric), 0),
      1
    )
  )
  into v_experimentais
  from equipe;

  with equipe as (
    select value as p from jsonb_array_elements(v_professores)
  )
  select jsonb_build_object(
    'alunos_na_carteira', coalesce(sum((p #>> '{metricas,numero_alunos,valor}')::numeric), 0),
    'media_por_professor', round(avg((p #>> '{metricas,numero_alunos,valor}')::numeric), 1),
    'professores_com_carteira_observada', count(*) filter (
      where p #>> '{metricas,numero_alunos,valor}' is not null
    ),
    'alertas_de_carga', jsonb_array_length(v_mapa_sinais)
  )
  into v_carteira_carga
  from equipe;

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
    and pa.data_agendada::date between v_competencia and v_periodo_fim;

  with equipe as (
    select value as p from jsonb_array_elements(v_professores)
  ), motivos as (
    select p ->> 'estado_evidencia' as motivo, count(*) as quantidade
    from equipe
    where p ->> 'estado_evidencia' not in ('avaliacao_oficial', 'avaliacao_parcial')
    group by p ->> 'estado_evidencia'
  )
  select jsonb_build_object(
    'professores_avaliados', jsonb_array_length(v_professores),
    'professores_sem_fonte', count(*) filter (
      where p ->> 'estado_evidencia' = 'fonte_canonica_indisponivel'
    ),
    'motivos', coalesce((
      select jsonb_object_agg(m.motivo, m.quantidade order by m.motivo)
      from motivos m
    ), '{}'::jsonb)
  )
  into v_qualidade_dados
  from equipe;

  with equipe as (
    select value as p from jsonb_array_elements(v_professores)
    where value ->> 'estado_publicacao' = 'oficial'
      and coalesce((value ->> 'ranking_habilitado')::boolean, false)
      and (value ->> 'score') is not null
  )
  select jsonb_agg(jsonb_build_object(
    'professor_id', (p ->> 'professor_id')::integer,
    'nome', p ->> 'nome',
    'score', (p ->> 'score')::numeric,
    'cobertura', (p ->> 'cobertura')::numeric,
    'classificacao', p ->> 'classificacao'
  ) order by (p ->> 'score')::numeric desc, p ->> 'nome')
  into v_ranking_oficial
  from equipe;

  return jsonb_build_object(
    'schema_version', 1,
    'periodo', jsonb_build_object(
      'unidade_id', p_unidade_id,
      'unidade_nome', v_unidade_nome,
      'ano', p_ano,
      'mes', p_mes,
      'inicio', v_competencia,
      'fim', v_periodo_fim,
      'coordenadores', jsonb_build_array('Quintela', 'Juliana'),
      'contexto_operacional', v_contexto_operacional
    ),
    'resumo_equipe', v_resumo,
    'professores', v_professores,
    'mapa_sinais', v_mapa_sinais,
    'retencao_permanencia', v_retencao_permanencia,
    'presenca', v_presenca,
    'experimentais', v_experimentais,
    'carteira_carga', v_carteira_carga,
    'agenda_treinamentos', v_agenda_treinamentos,
    'qualidade_dados', v_qualidade_dados,
    'ranking_oficial', v_ranking_oficial,
    'auditoria', jsonb_build_object(
      'contrato', 'relatorio-coordenacao-pedagogica-1',
      'gerado_em', now(),
      'imutavel', p_ano < extract(year from current_date)::integer
        or (p_ano = extract(year from current_date)::integer and p_mes < extract(month from current_date)::integer)
    )
  );
end;
$function$;

revoke all on function public.get_relatorio_coordenacao_canonico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_coordenacao_canonico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_coordenacao_canonico_v1(uuid, integer, integer) is
  'Contrato pedagogico mensal versionado: equipe ativa completa, Health Score V3, sinais, agenda e qualidade de dados sem informacao financeira.';

commit;
