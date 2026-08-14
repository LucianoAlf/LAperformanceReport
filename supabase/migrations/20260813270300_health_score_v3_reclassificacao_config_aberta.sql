begin;

-- Reclassifica retratos da competencia corrente quando a configuracao muda
-- durante um ciclo aberto. A evidencia capturada nao e recalculada: uma nova
-- revisao append-only referencia o retrato anterior e troca somente a
-- configuracao governada. Competencias fechadas nunca entram neste caminho.
create or replace function public.reclassificar_health_score_professor_v3_config_aberta(
  p_competencia date,
  p_periodicidade text,
  p_escopo text default null,
  p_unidade_id uuid default null,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_escopo text := nullif(lower(btrim(p_escopo)), '');
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_source record;
  v_snapshot_id uuid;
  v_revisao integer;
  v_pilares_validos integer;
  v_pilares_esperados integer;
  v_cobertura numeric;
  v_classificacao text;
  v_count integer := 0;
  v_skipped integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: reclassificacao interna'
      using errcode = '42501';
  end if;

  if p_competencia is null
    or v_competencia <> date_trunc('month', current_date)::date then
    raise exception 'HEALTH_SCORE_V3_COMPETENCIA_NAO_ABERTA: somente a competencia corrente'
      using errcode = '22023';
  end if;

  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA: use mensal ou ciclo'
      using errcode = '22023';
  end if;

  if v_escopo is not null and v_escopo not in ('unidade', 'consolidado') then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_INVALIDO: use unidade ou consolidado'
      using errcode = '22023';
  end if;

  if v_escopo = 'unidade' and p_unidade_id is null then
    raise exception 'HEALTH_SCORE_V3_UNIDADE_OBRIGATORIA: escopo unidade exige unidade_id'
      using errcode = '22023';
  end if;

  if v_escopo = 'consolidado' and p_unidade_id is not null then
    raise exception 'HEALTH_SCORE_V3_UNIDADE_INCOMPATIVEL: escopo consolidado exige unidade_id nulo'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_JUSTIFICATIVA_OBRIGATORIA: informe a razao da reclassificacao'
      using errcode = '22023';
  end if;

  select * into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and v_competencia >= c.vigencia_inicio
    and (c.vigencia_fim is null or v_competencia <= c.vigencia_fim)
  order by c.vigencia_inicio desc, c.versao desc, c.id desc
  limit 1;

  if not found then
    raise exception 'HEALTH_SCORE_V3_CONFIG_AUSENTE: nenhuma configuracao ativa para a competencia'
      using errcode = 'P0002';
  end if;

  -- Este caminho somente reclassifica uma configuracao sem mudanca numerica.
  -- Alteracao de pesos/metas continua exigindo materializacao completa.
  if exists (
    select 1
    from public.health_score_professor_v3_config_versoes origem
    join public.health_score_professor_v3_config_metricas mo
      on mo.config_id = origem.id
    join public.health_score_professor_v3_config_metricas mn
      on mn.config_id = v_config.id
     and mn.metrica = mo.metrica
    where origem.id in (
      select distinct s.config_id
      from public.health_score_professor_v3_snapshots s
      where s.competencia = v_competencia
        and s.periodicidade = p_periodicidade
        and s.estado <> 'fechado'
        and (v_escopo is null or s.escopo = v_escopo)
        and (p_unidade_id is null or s.unidade_id = p_unidade_id)
    )
      and (mo.peso is distinct from mn.peso or mo.meta is distinct from mn.meta)
  ) then
    raise exception 'HEALTH_SCORE_V3_RECLASSIFICACAO_REQUER_MATERIALIZACAO: pesos ou metas mudaram'
      using errcode = '22023';
  end if;

  for v_source in
    with candidatos as (
      select s.*,
        row_number() over (
          partition by s.professor_id, s.unidade_id
          order by s.revisao desc, s.criado_em desc, s.id desc
        ) as ordem_revisao
      from public.health_score_professor_v3_snapshots s
      where s.competencia = v_competencia
        and s.periodicidade = p_periodicidade
        and s.estado <> 'fechado'
        and (v_escopo is null or s.escopo = v_escopo)
        and (p_unidade_id is null or s.unidade_id = p_unidade_id)
    )
    select c.*
    from candidatos c
    where c.ordem_revisao = 1
      and c.config_id is distinct from v_config.id
    order by c.professor_id, c.unidade_id nulls first
  loop
    if exists (
      select 1
      from public.health_score_professor_v3_snapshots ja
      where ja.snapshot_anterior_id = v_source.id
        and ja.config_id = v_config.id
        and ja.periodicidade = p_periodicidade
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select
      count(distinct m.metrica) filter (
        where coalesce(m.papel, 'nota') = 'nota'
          and m.peso_disponivel
          and m.nota is not null
      )::integer,
      count(distinct m.metrica) filter (
        where coalesce(m.papel, 'nota') = 'nota'
          and m.peso > 0
      )::integer
    into v_pilares_validos, v_pilares_esperados
    from public.health_score_professor_v3_snapshot_metricas m
    where m.snapshot_id = v_source.id;

    v_cobertura := public.calcular_health_score_professor_v3_cobertura_pilares(
      coalesce(v_pilares_validos, 0),
      coalesce(v_pilares_esperados, 0)
    );

    v_classificacao := case
      when v_source.score is null then null::text
      when v_source.score >= v_config.faixa_saudavel_min then 'saudavel'
      when v_source.score >= v_config.faixa_atencao_min then 'atencao'
      else 'critico'
    end;

    select coalesce(max(s.revisao), 0) + 1
      into v_revisao
    from public.health_score_professor_v3_snapshots s
    where s.professor_id = v_source.professor_id
      and s.unidade_id is not distinct from v_source.unidade_id
      and s.competencia = v_source.competencia
      and s.periodicidade = v_source.periodicidade;

    insert into public.health_score_professor_v3_snapshots (
      professor_id, escopo, unidade_id, competencia, trimestre_inicio,
      revisao, estado, config_id, config_versao, score, cobertura,
      classificacao, publicavel, publicado, motivo_bloqueio, regra_versao,
      snapshot_anterior_id, justificativa_retificacao, criado_por, fechado_em,
      invalidado_em, periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
      estado_publicacao, score_exibivel, ranking_habilitado
    ) values (
      v_source.professor_id, v_source.escopo, v_source.unidade_id,
      v_source.competencia, v_source.trimestre_inicio, v_revisao,
      v_source.estado, v_config.id, v_config.versao, v_source.score,
      coalesce(v_cobertura, 0), v_classificacao, false, false,
      v_source.motivo_bloqueio,
      'health-score-professor-v3-reclassificacao-config-1',
      v_source.id, btrim(p_justificativa), null, null, null,
      v_source.periodicidade, v_source.periodo_inicio, v_source.periodo_fim,
      v_source.ciclo_codigo, v_source.estado_publicacao,
      v_source.score is not null, false
    ) returning id into v_snapshot_id;

    insert into public.health_score_professor_v3_snapshot_metricas (
      snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
      estado_base, publicavel, confianca, fonte, regra_versao,
      motivo_sem_base, detalhes, nota, peso, peso_disponivel, contribuicao,
      meta_aplicada, peso_efetivo, codigo_evidencia, papel
    )
    select
      v_snapshot_id, m.metrica, m.valor_bruto, m.numerador, m.denominador,
      m.amostra, m.estado_base, m.publicavel, m.confianca, m.fonte,
      m.regra_versao, m.motivo_sem_base,
      m.detalhes || jsonb_build_object(
        'reclassificacao_config', jsonb_build_object(
          'config_origem_versao', v_source.config_versao,
          'config_destino_versao', v_config.versao,
          'evidencia_reaproveitada', true
        )
      ),
      m.nota, m.peso, m.peso_disponivel, m.contribuicao, m.meta_aplicada,
      m.peso_efetivo, m.codigo_evidencia, m.papel
    from public.health_score_professor_v3_snapshot_metricas m
    where m.snapshot_id = v_source.id;

    if exists (
      select 1
      from public.health_score_professor_v3_snapshot_metrica_segmentos seg
      join public.health_score_professor_v3_snapshot_metricas oldm
        on oldm.id = seg.snapshot_metrica_id
      join public.health_score_professor_v3_config_metas_curso_modalidade antiga
        on antiga.id = seg.config_meta_segmento_id
      left join public.health_score_professor_v3_config_metas_curso_modalidade nova
        on nova.config_id = v_config.id
       and nova.unidade_id = antiga.unidade_id
       and nova.curso_id = antiga.curso_id
       and nova.modalidade = antiga.modalidade
      where oldm.snapshot_id = v_source.id
        and seg.config_meta_segmento_id is not null
        and nova.id is null
    ) then
      raise exception 'HEALTH_SCORE_V3_CONFIG_SEGMENTO_INCOMPATIVEL: segmento nao encontrado na configuracao destino'
        using errcode = 'P0001';
    end if;

    insert into public.health_score_professor_v3_snapshot_metrica_segmentos (
      snapshot_metrica_id, config_meta_segmento_id, unidade_id, curso_id,
      modalidade, pessoas_unicas, vinculos_ativos, turmas_elegiveis,
      ocupacoes_unicas, capacidade_maxima, meta_aplicada, numerador,
      denominador, nota, estado_base, fonte, regra_versao, detalhes,
      atribuicao_id, atribuicao_formal, atribuicao_pontuavel,
      pessoas_unicas_total, pessoas_fechamentos, meses_com_base,
      meses_com_base_consolidado, meses_no_periodo, capacidade_excedida,
      alertas_capacidade, divergencias
    )
    select
      newm.id, nova.id, seg.unidade_id, seg.curso_id, seg.modalidade,
      seg.pessoas_unicas, seg.vinculos_ativos, seg.turmas_elegiveis,
      seg.ocupacoes_unicas, seg.capacidade_maxima, seg.meta_aplicada,
      seg.numerador, seg.denominador, seg.nota, seg.estado_base, seg.fonte,
      seg.regra_versao, seg.detalhes, seg.atribuicao_id,
      seg.atribuicao_formal, seg.atribuicao_pontuavel,
      seg.pessoas_unicas_total, seg.pessoas_fechamentos, seg.meses_com_base,
      seg.meses_com_base_consolidado, seg.meses_no_periodo,
      seg.capacidade_excedida, seg.alertas_capacidade, seg.divergencias
    from public.health_score_professor_v3_snapshot_metrica_segmentos seg
    join public.health_score_professor_v3_snapshot_metricas oldm
      on oldm.id = seg.snapshot_metrica_id
    join public.health_score_professor_v3_snapshot_metricas newm
      on newm.snapshot_id = v_snapshot_id
     and newm.metrica = oldm.metrica
    left join public.health_score_professor_v3_config_metas_curso_modalidade antiga
      on antiga.id = seg.config_meta_segmento_id
    left join public.health_score_professor_v3_config_metas_curso_modalidade nova
      on nova.config_id = v_config.id
     and nova.unidade_id = antiga.unidade_id
     and nova.curso_id = antiga.curso_id
     and nova.modalidade = antiga.modalidade
    where oldm.snapshot_id = v_source.id;

    insert into public.health_score_professor_v3_snapshot_metrica_diagnosticos (
      snapshot_metrica_id, unidade_id, pessoas_unicas_total, dados_sem_resolucao,
      estados_resolucao, estado_base, fonte, regra_versao, divergencias, detalhes
    )
    select
      newm.id, d.unidade_id, d.pessoas_unicas_total, d.dados_sem_resolucao,
      d.estados_resolucao, d.estado_base, d.fonte, d.regra_versao,
      d.divergencias, d.detalhes
    from public.health_score_professor_v3_snapshot_metrica_diagnosticos d
    join public.health_score_professor_v3_snapshot_metricas oldm
      on oldm.id = d.snapshot_metrica_id
    join public.health_score_professor_v3_snapshot_metricas newm
      on newm.snapshot_id = v_snapshot_id
     and newm.metrica = oldm.metrica
    where oldm.snapshot_id = v_source.id;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'competencia', v_competencia,
    'periodicidade', p_periodicidade,
    'escopo', v_escopo,
    'unidade_id', p_unidade_id,
    'config_id', v_config.id,
    'config_versao', v_config.versao,
    'snapshots_criados', v_count,
    'snapshots_ignorados', v_skipped,
    'regra_versao', 'health-score-professor-v3-reclassificacao-config-1'
  );
end;
$function$;

revoke all on function public.reclassificar_health_score_professor_v3_config_aberta(
  date, text, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.reclassificar_health_score_professor_v3_config_aberta(
  date, text, text, uuid, text
) to service_role;

comment on function public.reclassificar_health_score_professor_v3_config_aberta(
  date, text, text, uuid, text
) is
  'Cria revisoes append-only apenas da competencia aberta quando pesos/metas nao mudaram; reaproveita evidencias e preserva fechados.';

commit;
