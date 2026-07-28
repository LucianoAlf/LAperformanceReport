-- Health Score Professor V3 - percentuais preservam o valor real.
-- Recria os dois motores internos sem alterar wrappers ou read models.

create or replace function public.materializar_health_score_professor_v3_periodo_impl(
  p_competencia date,
  p_periodicidade text default 'mensal',
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_periodo record;
  v_scope record;
  v_alvo record;
  v_snapshot_id uuid;
  v_revisao integer;
  v_cobertura numeric;
  v_score numeric;
  v_tem_fidelizacao boolean;
  v_base_suficiente boolean;
  v_classificacao text;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;
  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODO_INVALIDO: use mensal ou ciclo';
  end if;

  select * into v_periodo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade);

  select * into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and date_trunc('month', p_competencia)::date >= c.vigencia_inicio
    and (c.vigencia_fim is null or date_trunc('month', p_competencia)::date <= c.vigencia_fim)
  order by c.versao desc
  limit 1;
  if not found then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: nenhuma configuracao ativa no periodo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'health_score_v3_periodo:' || date_trunc('month', p_competencia)::date::text
      || ':' || p_periodicidade, 0
  ));

  create temporary table if not exists health_score_v3_metricas_periodo_execucao (
    metrica text,
    professor_id integer,
    professor_nome text,
    unidade_id uuid,
    competencia date,
    valor_bruto numeric,
    numerador numeric,
    denominador numeric,
    amostra integer,
    estado_base text,
    publicavel boolean,
    confianca text,
    fonte text,
    regra_versao text,
    motivo_sem_base text,
    detalhes jsonb
  ) on commit drop;

  create temporary table if not exists
    health_score_v3_segmentos_periodo_execucao (
      metrica text,
      professor_id integer,
      professor_nome text,
      unidade_id uuid,
      competencia date,
      curso_id integer,
      curso_nome text,
      modalidade text,
      config_meta_segmento_id uuid,
      atribuicao_id uuid,
      atribuicao_formal boolean,
      atribuicao_pontuavel boolean,
      pessoas_unicas integer,
      pessoas_unicas_total numeric,
      pessoas_fechamentos integer,
      meses_com_base integer,
      meses_com_base_consolidado integer,
      meses_no_periodo integer,
      vinculos_ativos integer,
      turmas_elegiveis integer,
      ocupacoes_unicas integer,
      valor_observado numeric,
      capacidade_maxima numeric,
      meta_aplicada numeric,
      numerador numeric,
      denominador numeric,
      nota_segmento numeric,
      estado_base text,
      publicavel boolean,
      capacidade_excedida boolean,
      alertas_capacidade jsonb,
      fonte text,
      regra_versao text,
      linha_diagnostico boolean,
      dados_sem_resolucao integer,
      estados_resolucao jsonb,
      divergencias jsonb,
      detalhes jsonb
    ) on commit drop;

  create temporary table if not exists
    health_score_v3_metricas_segmentadas_agregadas_execucao (
      metrica text,
      professor_id integer,
      professor_nome text,
      unidade_id uuid,
      competencia date,
      valor_bruto numeric,
      numerador numeric,
      denominador numeric,
      amostra integer,
      estado_base text,
      publicavel boolean,
      confianca text,
      fonte text,
      regra_versao text,
      motivo_sem_base text,
      detalhes jsonb,
      nota_segmentada_estruturada numeric
    ) on commit drop;

  truncate health_score_v3_segmentos_periodo_execucao;
  insert into health_score_v3_segmentos_periodo_execucao
  select d.*
  from public.get_health_score_professor_v3_metricas_segmentadas_v1(
    p_competencia,
    v_config.id,
    p_unidade_id,
    p_periodicidade
  ) d
  where p_professor_id is null or d.professor_id = p_professor_id;

  for v_scope in
    select u.id as unidade_id
    from public.unidades u
    where u.ativo and p_unidade_id is null
    union all
    select null::uuid where p_unidade_id is null
    union all
    select p_unidade_id where p_unidade_id is not null
  loop
    truncate health_score_v3_metricas_periodo_execucao;
    truncate health_score_v3_metricas_segmentadas_agregadas_execucao;

    insert into health_score_v3_metricas_segmentadas_agregadas_execucao
    with detalhe as (
      select d.*
      from health_score_v3_segmentos_periodo_execucao d
      where v_scope.unidade_id is null
         or d.unidade_id = v_scope.unidade_id
    ), unidades as (
      select
        d.metrica,
        d.professor_id,
        max(d.professor_nome)::text as professor_nome,
        d.unidade_id,
        max(d.pessoas_unicas_total)::numeric as pessoas_unicas_total,
        max(d.pessoas_fechamentos)::integer as pessoas_fechamentos,
        max(d.meses_com_base)::integer as meses_com_base,
        max(d.meses_com_base_consolidado)::integer
          as meses_com_base_consolidado,
        max(d.meses_no_periodo)::integer as meses_no_periodo,
        coalesce(sum(d.vinculos_ativos) filter (
          where d.curso_id is not null
        ), 0)::integer as vinculos_curso_modalidade,
        coalesce(sum(d.turmas_elegiveis) filter (
          where d.curso_id is not null
        ), 0)::integer as turmas_elegiveis,
        coalesce(sum(d.ocupacoes_unicas) filter (
          where d.curso_id is not null
        ), 0)::integer as ocupacoes_unicas,
        sum(d.numerador) filter (
          where d.numerador is not null
        ) as numerador,
        sum(d.denominador) filter (
          where d.denominador is not null
        ) as denominador,
        bool_or(d.estado_base = 'regra_ausente') as tem_regra_ausente,
        bool_or(d.estado_base = 'segmentacao_incompleta')
          as tem_segmentacao_incompleta,
        bool_or(d.estado_base = 'divergencia_nao_ofertada')
          as tem_divergencia_nao_ofertada,
        count(*) filter (
          where d.estado_base = 'sem_base_zero_carteira'
        )::integer as segmentos_zero_carteira,
        count(*) filter (
          where d.estado_base = 'sem_base_sem_turmas'
        )::integer as segmentos_sem_turmas,
        count(*) filter (
          where d.capacidade_excedida
        )::integer as segmentos_capacidade_excedida,
        coalesce(
          jsonb_agg(jsonb_build_object(
            'unidade_id', d.unidade_id,
            'curso_id', d.curso_id,
            'curso_nome', d.curso_nome,
            'modalidade', d.modalidade,
            'estado_base', d.estado_base,
            'pessoas_unicas', d.pessoas_unicas,
            'vinculos_ativos', d.vinculos_ativos,
            'turmas_elegiveis', d.turmas_elegiveis,
            'ocupacoes_unicas', d.ocupacoes_unicas,
            'meta_aplicada', d.meta_aplicada,
            'numerador', d.numerador,
            'denominador', d.denominador,
            'nota_segmento', d.nota_segmento,
            'config_meta_segmento_id', d.config_meta_segmento_id,
            'atribuicao_id', d.atribuicao_id
          ) order by d.curso_id, d.modalidade)
            filter (where d.curso_id is not null),
          '[]'::jsonb
        ) as segmentos_resumo,
        coalesce(
          jsonb_agg(d.divergencias)
            filter (where d.divergencias <> '{}'::jsonb),
          '[]'::jsonb
        ) as divergencias,
        coalesce(
          jsonb_agg(d.alertas_capacidade)
            filter (where d.capacidade_excedida),
          '[]'::jsonb
        ) as alertas_capacidade
      from detalhe d
      group by d.metrica, d.professor_id, d.unidade_id
    ), agregado as (
      select
        u.metrica,
        u.professor_id,
        max(u.professor_nome)::text as professor_nome,
        v_scope.unidade_id as unidade_saida,
        case
          when sum(u.pessoas_fechamentos) = 0 then 0::numeric
          when v_scope.unidade_id is null then round(
            sum(u.pessoas_fechamentos)::numeric
              / nullif(max(u.meses_com_base_consolidado), 0),
            2
          )
          else round(
            sum(u.pessoas_fechamentos)::numeric
              / nullif(max(u.meses_com_base), 0),
            2
          )
        end as pessoas_unicas_total,
        sum(u.pessoas_fechamentos)::integer as pessoas_fechamentos,
        max(u.meses_com_base)::integer as meses_com_base,
        max(u.meses_com_base_consolidado)::integer
          as meses_com_base_consolidado,
        max(u.meses_no_periodo)::integer as meses_no_periodo,
        sum(u.vinculos_curso_modalidade)::integer
          as vinculos_curso_modalidade,
        sum(u.turmas_elegiveis)::integer as turmas_elegiveis,
        sum(u.ocupacoes_unicas)::integer as ocupacoes_unicas,
        sum(u.numerador) filter (where u.numerador is not null) as numerador,
        sum(u.denominador) filter (where u.denominador is not null) as denominador,
        bool_or(u.tem_regra_ausente) as tem_regra_ausente,
        bool_or(u.tem_segmentacao_incompleta) as tem_segmentacao_incompleta,
        bool_or(u.tem_divergencia_nao_ofertada)
          as tem_divergencia_nao_ofertada,
        sum(u.segmentos_zero_carteira)::integer as segmentos_zero_carteira,
        sum(u.segmentos_sem_turmas)::integer as segmentos_sem_turmas,
        sum(u.segmentos_capacidade_excedida)::integer
          as segmentos_capacidade_excedida,
        jsonb_agg(u.segmentos_resumo order by u.unidade_id)
          as segmentos_resumo,
        jsonb_agg(u.divergencias order by u.unidade_id) as divergencias,
        jsonb_agg(u.alertas_capacidade order by u.unidade_id)
          as alertas_capacidade
      from unidades u
      group by u.metrica, u.professor_id
    ), avaliadas as (
      select
        a.*,
        (
          a.tem_regra_ausente
          or a.tem_segmentacao_incompleta
          or a.tem_divergencia_nao_ofertada
        ) as tem_bloqueio,
        case
          when a.tem_regra_ausente then 'regra_ausente'
          when a.tem_segmentacao_incompleta then 'segmentacao_incompleta'
          when a.tem_divergencia_nao_ofertada
            then 'divergencia_nao_ofertada'
          when a.denominador is null and a.metrica = 'media_turma'
            then 'sem_base_sem_turmas'
          when a.denominador is null and a.metrica = 'numero_alunos'
            then 'sem_base_zero_carteira'
          else 'ok'
        end::text as estado_base_calculado
      from agregado a
    ), pontuadas as (
      select
        a.*,
        case
          when a.tem_bloqueio then null::numeric
          when a.denominador > 0 then round(least(
            100::numeric,
            100::numeric * a.numerador / nullif(a.denominador, 0)
          ), 2)
          else null::numeric
        end as nota_segmentada
      from avaliadas a
    )
    select
      a.metrica,
      a.professor_id,
      a.professor_nome,
      a.unidade_saida,
      date_trunc('month', p_competencia)::date,
      case
        when a.metrica = 'media_turma' and a.turmas_elegiveis > 0
          then round(
            a.ocupacoes_unicas::numeric
              / nullif(a.turmas_elegiveis, 0),
            2
          )
        when a.metrica = 'numero_alunos'
          then a.pessoas_unicas_total::numeric
        else null::numeric
      end,
      a.numerador,
      a.denominador,
      case
        when a.metrica = 'media_turma' then a.turmas_elegiveis
        else a.vinculos_curso_modalidade
      end::integer,
      a.estado_base_calculado,
      a.estado_base_calculado = 'ok'
        and a.nota_segmentada is not null,
      case
        when a.estado_base_calculado = 'ok' then 'alta'
        when a.tem_bloqueio then 'revisar'
        else 'sem_base'
      end::text,
      'get_health_score_professor_v3_metricas_segmentadas_v1'::text,
      'health-score-professor-v3-metricas-segmentadas-agregadas-1'::text,
      case
        when a.tem_regra_ausente
          then 'regra segmentada ausente; nenhuma meta de outro segmento foi usada'
        when a.tem_segmentacao_incompleta
          then 'curso, modalidade ou atribuicao formal pendente de resolucao'
        when a.tem_divergencia_nao_ofertada
          then 'segmento marcado como nao ofertado possui dados observados'
        when a.metrica = 'media_turma' and a.denominador is null
          then 'professor sem turma regular elegivel no periodo'
        when a.metrica = 'numero_alunos' and a.denominador is null
          then 'somente segmentos formais com carteira zero; peso indisponivel'
        else null::text
      end,
      jsonb_build_object(
        'nome_exibicao', case
          when a.metrica = 'numero_alunos' then 'Carteira por curso'
          else 'Media de alunos por turma'
        end,
        'periodicidade', p_periodicidade,
        'config_id', v_config.id,
        'pessoas_unicas_total', a.pessoas_unicas_total,
        'pessoas_fechamentos', a.pessoas_fechamentos,
        'meses_com_base', a.meses_com_base,
        'meses_com_base_consolidado', a.meses_com_base_consolidado,
        'meses_no_periodo', a.meses_no_periodo,
        'vinculos_curso_modalidade', a.vinculos_curso_modalidade,
        'vinculos_ativos_pontuaveis', case
          when a.metrica = 'numero_alunos' then a.numerador
        end,
        'turmas_elegiveis', a.turmas_elegiveis,
        'ocupacoes_unicas', a.ocupacoes_unicas,
        'media_observada', case
          when a.metrica = 'media_turma' and a.turmas_elegiveis > 0
            then round(
              a.ocupacoes_unicas::numeric
                / nullif(a.turmas_elegiveis, 0),
              2
            )
        end,
        'meta_assentos_pontuaveis', case
          when a.metrica = 'media_turma' then a.denominador
        end,
        'metas_carteira_pontuaveis', case
          when a.metrica = 'numero_alunos' then a.denominador
        end,
        'nota_segmentada', a.nota_segmentada,
        'segmentos_zero_carteira', a.segmentos_zero_carteira,
        'segmentos_sem_turmas', a.segmentos_sem_turmas,
        'segmentos_capacidade_excedida', a.segmentos_capacidade_excedida,
        'segmentos_resumo', a.segmentos_resumo,
        'divergencias', a.divergencias,
        'alertas_capacidade', a.alertas_capacidade,
        'valor_real_preservado', true,
        'evidencia_estruturada',
          'health_score_professor_v3_snapshot_metrica_segmentos',
        'apta_oficial', p_periodicidade = 'ciclo'
          and a.estado_base_calculado = 'ok'
          and a.nota_segmentada is not null
      ),
      a.nota_segmentada
    from pontuadas a;

    perform set_config(
      'app.health_score_v3_segmentos_precarregados',
      'on',
      true
    );
    insert into health_score_v3_metricas_periodo_execucao
    select *
    from public.get_health_score_professor_v3_metricas_periodo(
      p_competencia, v_scope.unidade_id, p_periodicidade
    ) m
    where (p_professor_id is null or m.professor_id = p_professor_id)
      and m.metrica not in ('media_turma', 'numero_alunos');
    perform set_config(
      'app.health_score_v3_segmentos_precarregados',
      'off',
      true
    );

    insert into health_score_v3_metricas_periodo_execucao (
      metrica,
      professor_id,
      professor_nome,
      unidade_id,
      competencia,
      valor_bruto,
      numerador,
      denominador,
      amostra,
      estado_base,
      publicavel,
      confianca,
      fonte,
      regra_versao,
      motivo_sem_base,
      detalhes
    )
    select
      a.metrica,
      a.professor_id,
      a.professor_nome,
      a.unidade_id,
      a.competencia,
      a.valor_bruto,
      a.numerador,
      a.denominador,
      a.amostra,
      a.estado_base,
      a.publicavel,
      a.confianca,
      a.fonte,
      a.regra_versao,
      a.motivo_sem_base,
      a.detalhes
    from health_score_v3_metricas_segmentadas_agregadas_execucao a;

    for v_alvo in
      select m.professor_id, max(m.professor_nome) as professor_nome,
             m.unidade_id
      from health_score_v3_metricas_periodo_execucao m
      group by m.professor_id, m.unidade_id
    loop
      select coalesce(max(s.revisao), 0) + 1 into v_revisao
      from public.health_score_professor_v3_snapshots s
      where s.professor_id = v_alvo.professor_id
        and s.unidade_id is not distinct from v_alvo.unidade_id
        and s.competencia = date_trunc('month', p_competencia)::date
        and s.periodicidade = p_periodicidade;

      insert into public.health_score_professor_v3_snapshots (
        professor_id, escopo, unidade_id, competencia, trimestre_inicio,
        revisao, estado, config_id, config_versao, periodicidade,
        periodo_inicio, periodo_fim, ciclo_codigo, estado_publicacao,
        score_exibivel, ranking_habilitado, regra_versao
      ) values (
        v_alvo.professor_id,
        case when v_alvo.unidade_id is null then 'consolidado' else 'unidade' end,
        v_alvo.unidade_id,
        date_trunc('month', p_competencia)::date,
        v_periodo.periodo_inicio,
        v_revisao,
        'provisorio',
        v_config.id,
        v_config.versao,
        p_periodicidade,
        v_periodo.periodo_inicio,
        v_periodo.periodo_fim,
        v_periodo.ciclo_codigo,
        'sem_base',
        false,
        false,
        'health-score-professor-v3-motor-periodo-1'
      ) returning id into v_snapshot_id;

      insert into public.health_score_professor_v3_snapshot_metricas (
        snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
        estado_base, publicavel, confianca, fonte, regra_versao,
        motivo_sem_base, detalhes, nota, peso, peso_disponivel,
        contribuicao, meta_aplicada
      )
      select
        v_snapshot_id,
        cm.metrica,
        r.valor_bruto,
        r.numerador,
        r.denominador,
        r.amostra,
        coalesce(r.estado_base, 'sem_base'),
        coalesce(r.publicavel, false) and calc.nota_calculada is not null,
        coalesce(r.confianca, 'sem_base'),
        coalesce(r.fonte, 'health-score-v3-periodo-sem-linha'),
        coalesce(r.regra_versao, 'health-score-professor-v3-motor-periodo-1'),
        case
          when r.professor_id is null then 'metrica sem linha para professor e escopo'
          when cm.metrica in ('media_turma', 'numero_alunos')
            and calc.nota_calculada is null
            then coalesce(r.motivo_sem_base, 'metrica segmentada sem base pontuavel')
          when cm.metrica not in ('media_turma', 'numero_alunos')
            and cm.meta is null then 'meta versionada ausente'
          else r.motivo_sem_base
        end,
        case
          when cm.metrica in ('media_turma', 'numero_alunos') then
            coalesce(r.detalhes, '{}'::jsonb) || jsonb_build_object(
              'meta_versionada', null::numeric,
              'normalizacao', 'segmentada_unidade_curso_modalidade',
              'valor_real_preservado', true
            )
          else coalesce(r.detalhes, '{}'::jsonb) || jsonb_build_object(
            'meta_versionada', cm.meta,
            'normalizacao', 'meta_versionada',
            'valor_real_preservado', true
          )
        end,
        calc.nota_calculada,
        cm.peso,
        calc.nota_calculada is not null,
        case
          when calc.nota_calculada is not null
            then round(calc.nota_calculada * cm.peso / 100, 4)
          else null::numeric
        end,
        calc.meta_calculada
      from public.health_score_professor_v3_config_metricas cm
      left join health_score_v3_metricas_periodo_execucao r
        on r.metrica = cm.metrica
       and r.professor_id = v_alvo.professor_id
       and r.unidade_id is not distinct from v_alvo.unidade_id
      left join health_score_v3_metricas_segmentadas_agregadas_execucao sa
        on sa.metrica = cm.metrica
       and sa.professor_id = v_alvo.professor_id
       and sa.unidade_id is not distinct from v_alvo.unidade_id
      cross join lateral (
        select
          case
            when cm.metrica in ('media_turma', 'numero_alunos')
              and r.publicavel
              then sa.nota_segmentada_estruturada
            when cm.metrica in ('retencao', 'conversao', 'presenca')
              and r.publicavel
              and r.valor_bruto is not null
              and cm.meta > 0
              then greatest(
                0::numeric,
                least(100::numeric, r.valor_bruto)
              )
            when cm.metrica = 'permanencia'
              and r.publicavel
              and r.valor_bruto is not null
              and cm.meta > 0
              then round(least(100::numeric, greatest(
                0::numeric, r.valor_bruto / cm.meta * 100
              )), 2)
            else null::numeric
          end as nota_calculada,
          case
            when cm.metrica in ('media_turma', 'numero_alunos')
              then null::numeric
            else cm.meta
          end as meta_calculada
      ) calc
      where cm.config_id = v_config.id;

      insert into public.health_score_professor_v3_snapshot_metrica_segmentos (
        snapshot_metrica_id,
        config_meta_segmento_id,
        atribuicao_id,
        unidade_id,
        curso_id,
        modalidade,
        atribuicao_formal,
        atribuicao_pontuavel,
        pessoas_unicas,
        pessoas_unicas_total,
        pessoas_fechamentos,
        meses_com_base,
        meses_com_base_consolidado,
        meses_no_periodo,
        vinculos_ativos,
        turmas_elegiveis,
        ocupacoes_unicas,
        capacidade_maxima,
        meta_aplicada,
        numerador,
        denominador,
        nota,
        estado_base,
        capacidade_excedida,
        alertas_capacidade,
        divergencias,
        fonte,
        regra_versao,
        detalhes
      )
      select
        sm.id,
        d.config_meta_segmento_id,
        d.atribuicao_id,
        d.unidade_id,
        d.curso_id,
        d.modalidade,
        d.atribuicao_formal,
        d.atribuicao_pontuavel,
        d.pessoas_unicas,
        d.pessoas_unicas_total,
        d.pessoas_fechamentos,
        d.meses_com_base,
        d.meses_com_base_consolidado,
        d.meses_no_periodo,
        d.vinculos_ativos,
        d.turmas_elegiveis,
        d.ocupacoes_unicas,
        d.capacidade_maxima,
        d.meta_aplicada,
        d.numerador,
        d.denominador,
        d.nota_segmento,
        d.estado_base,
        d.capacidade_excedida,
        d.alertas_capacidade,
        d.divergencias,
        d.fonte,
        d.regra_versao,
        coalesce(d.detalhes, '{}'::jsonb)
      from public.health_score_professor_v3_snapshot_metricas sm
      join health_score_v3_segmentos_periodo_execucao d
        on d.metrica = sm.metrica
       and d.professor_id = v_alvo.professor_id
      where sm.snapshot_id = v_snapshot_id
        and sm.metrica in ('media_turma', 'numero_alunos')
        and not d.linha_diagnostico
        and d.curso_id is not null
        and d.modalidade in ('individual', 'turma')
        and (
          v_alvo.unidade_id is null
          or d.unidade_id = v_alvo.unidade_id
        );

      insert into public.health_score_professor_v3_snapshot_metrica_diagnosticos (
        snapshot_metrica_id,
        unidade_id,
        pessoas_unicas_total,
        dados_sem_resolucao,
        estados_resolucao,
        estado_base,
        fonte,
        regra_versao,
        divergencias,
        detalhes
      )
      select
        sm.id,
        d.unidade_id,
        d.pessoas_unicas_total,
        d.dados_sem_resolucao,
        d.estados_resolucao,
        d.estado_base,
        d.fonte,
        d.regra_versao,
        d.divergencias,
        coalesce(d.detalhes, '{}'::jsonb)
      from public.health_score_professor_v3_snapshot_metricas sm
      join health_score_v3_segmentos_periodo_execucao d
        on d.metrica = sm.metrica
       and d.professor_id = v_alvo.professor_id
      where sm.snapshot_id = v_snapshot_id
        and sm.metrica in ('media_turma', 'numero_alunos')
        and d.linha_diagnostico
        and (
          v_alvo.unidade_id is null
          or d.unidade_id = v_alvo.unidade_id
        );

      select
        coalesce(sum(m.peso) filter (where m.nota is not null), 0),
        case when coalesce(sum(m.peso) filter (where m.nota is not null), 0) > 0
          then round(
            sum(m.nota * m.peso) filter (where m.nota is not null)
            / sum(m.peso) filter (where m.nota is not null), 2
          ) else null end,
        coalesce(bool_or(
          m.metrica in ('retencao', 'permanencia') and m.nota is not null
        ), false)
      into v_cobertura, v_score, v_tem_fidelizacao
      from public.health_score_professor_v3_snapshot_metricas m
      where m.snapshot_id = v_snapshot_id;

      v_base_suficiente := v_cobertura >= v_config.cobertura_minima
        and (not v_config.exige_pilar_fidelizacao or v_tem_fidelizacao);
      if not v_base_suficiente then v_score := null; end if;
      v_classificacao := case
        when v_score is null then 'sem_base'
        when v_score >= v_config.faixa_saudavel_min then 'saudavel'
        when v_score >= v_config.faixa_atencao_min then 'atencao'
        else 'critico'
      end;

      update public.health_score_professor_v3_snapshots
      set score = v_score,
          cobertura = v_cobertura,
          classificacao = v_classificacao,
          estado = case when exists (
            select 1 from public.health_score_professor_v3_snapshot_metricas m
            where m.snapshot_id = v_snapshot_id and m.estado_base = 'em_maturacao'
          ) then 'em_maturacao' else 'provisorio' end,
          publicavel = false,
          publicado = false,
          estado_publicacao = case when v_score is null then 'sem_base' else 'parcial' end,
          score_exibivel = v_score is not null,
          ranking_habilitado = false,
          motivo_bloqueio = case
            when v_score is null then 'cobertura ou pilar de fidelizacao insuficiente'
            else 'Health Score parcial; ranking e premiacao dependem do fechamento oficial do ciclo'
          end
      where id = v_snapshot_id;

      v_count := v_count + 1;
      v_ids := v_ids || jsonb_build_array(v_snapshot_id);
    end loop;
  end loop;

  return jsonb_build_object(
    'snapshots_criados', v_count,
    'snapshot_ids', v_ids,
    'competencia', date_trunc('month', p_competencia)::date,
    'periodicidade', p_periodicidade,
    'periodo_inicio', v_periodo.periodo_inicio,
    'periodo_fim', v_periodo.periodo_fim,
    'ciclo_codigo', v_periodo.ciclo_codigo,
    'estado_publicacao', 'parcial',
    'ranking_habilitado', false,
    'config_versao', v_config.versao
  );
end;
$$;

create or replace function public.simular_health_score_professor_v3_config_pre_catalogo_v1(
  p_config_id uuid,
  p_competencia date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '60s'
as $$
declare
  v_ator integer;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_competencia date;
  v_fingerprint text;
  v_resultado jsonb;
  v_simulacao_id uuid;
  v_simulada_em timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  if p_competencia is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: competencia obrigatoria';
  end if;
  v_competencia := date_trunc('month', p_competencia)::date;

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found or v_config.status <> 'rascunho' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser simulado';
  end if;

  v_fingerprint := public.fn_health_score_professor_v3_config_fingerprint(
    p_config_id
  );

  with detalhe as materialized (
    select d.*
    from public.get_health_score_professor_v3_metricas_segmentadas_v1(
      v_competencia,
      p_config_id,
      null,
      'mensal'
    ) d
  ), segmentadas_consolidadas as materialized (
    select a.*
    from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
      v_competencia,
      p_config_id,
      null,
      'mensal'
    ) a
  ), segmentadas_unidade_base as (
    select
      d.metrica,
      d.professor_id,
      d.unidade_id,
      sum(d.numerador) filter (where d.numerador is not null) as numerador,
      sum(d.denominador) filter (where d.denominador is not null) as denominador,
      bool_or(d.estado_base in (
        'regra_ausente',
        'segmentacao_incompleta',
        'divergencia_nao_ofertada'
      )) as tem_bloqueio
    from detalhe d
    group by d.metrica, d.professor_id, d.unidade_id
  ), segmentadas_unidade as (
    select
      s.metrica,
      s.professor_id,
      s.unidade_id,
      case
        when s.tem_bloqueio or s.denominador is null then null::numeric
        when s.denominador > 0 then round(least(
          100::numeric,
          100::numeric * s.numerador / nullif(s.denominador, 0)
        ), 2)
        else null::numeric
      end as nota
    from segmentadas_unidade_base s
  ), segmentadas_escopo as (
    select s.metrica, s.professor_id, s.unidade_id, s.nota
    from segmentadas_unidade s
    union all
    select
      s.metrica,
      s.professor_id,
      null::uuid as unidade_id,
      s.nota
    from segmentadas_consolidadas s
  ), snapshots as (
    select distinct on (s.professor_id, s.unidade_id)
      s.id,
      s.professor_id,
      s.unidade_id
    from public.health_score_professor_v3_snapshots s
    where s.competencia = v_competencia
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
    order by s.professor_id, s.unidade_id, s.revisao desc
  ), alvos as (
    select s.professor_id, s.unidade_id from snapshots s
    union
    select d.professor_id, d.unidade_id from detalhe d
    union
    select s.professor_id, null::uuid from segmentadas_consolidadas s
  ), metricas as (
    select
      a.professor_id,
      a.unidade_id,
      cm.metrica,
      cm.peso,
      case
        when cm.metrica in ('media_turma', 'numero_alunos')
          and cm.parametros->>'normalizacao'
            = 'segmentada_unidade_curso_modalidade'
          then se.nota
        when sm.valor_bruto is null
          or cm.meta is null
          or cm.meta <= 0
          or sm.publicavel is not true
          or sm.estado_base in ('sem_base', 'em_maturacao', 'bloqueada')
          then null::numeric
        when cm.metrica in ('retencao', 'conversao', 'presenca')
          then greatest(
            0::numeric,
            least(100::numeric, sm.valor_bruto)
          )
        when cm.metrica in ('permanencia', 'media_turma', 'numero_alunos')
          then least(
            100::numeric,
            greatest(0::numeric, sm.valor_bruto / cm.meta * 100)
          )
        else null::numeric
      end as nota
    from alvos a
    cross join public.health_score_professor_v3_config_metricas cm
    left join snapshots s
      on s.professor_id = a.professor_id
     and s.unidade_id is not distinct from a.unidade_id
    left join public.health_score_professor_v3_snapshot_metricas sm
      on sm.snapshot_id = s.id
     and sm.metrica = cm.metrica
    left join segmentadas_escopo se
      on se.professor_id = a.professor_id
     and se.unidade_id is not distinct from a.unidade_id
     and se.metrica = cm.metrica
    where cm.config_id = p_config_id
  ), scores as (
    select
      m.professor_id,
      m.unidade_id,
      coalesce(sum(m.peso) filter (where m.nota is not null), 0) as cobertura,
      case
        when count(*) filter (where m.nota is not null) > 0 then
          sum(m.nota * m.peso) filter (where m.nota is not null)
            / nullif(sum(m.peso) filter (where m.nota is not null), 0)
      end as score_candidato,
      coalesce(bool_or(
        m.metrica in ('retencao', 'permanencia') and m.nota is not null
      ), false) as tem_fidelizacao
    from metricas m
    group by m.professor_id, m.unidade_id
  ), classificados as (
    select
      s.*,
      case
        when s.cobertura < v_config.cobertura_minima then null::numeric
        when v_config.exige_pilar_fidelizacao and not s.tem_fidelizacao
          then null::numeric
        else round(s.score_candidato, 2)
      end as score
    from scores s
  )
  select jsonb_build_object(
    'config_id', p_config_id,
    'config_versao', v_config.versao,
    'competencia', v_competencia,
    'total', count(*),
    'saudaveis', count(*) filter (
      where c.score >= v_config.faixa_saudavel_min
    ),
    'atencao', count(*) filter (
      where c.score >= v_config.faixa_atencao_min
        and c.score < v_config.faixa_saudavel_min
    ),
    'criticos', count(*) filter (
      where c.score < v_config.faixa_atencao_min
    ),
    'sem_base', count(*) filter (where c.score is null),
    'score_medio', round(avg(c.score), 2),
    'impacto_professores', coalesce(jsonb_agg(
      jsonb_build_object(
        'professor_id', c.professor_id,
        'unidade_id', c.unidade_id,
        'cobertura', c.cobertura,
        'score', c.score,
        'classificacao', case
          when c.score is null then 'sem_base'
          when c.score >= v_config.faixa_saudavel_min then 'saudavel'
          when c.score >= v_config.faixa_atencao_min then 'atencao'
          else 'critico'
        end
      )
      order by c.professor_id, c.unidade_id::text
    ), '[]'::jsonb),
    'impacto_segmentos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'metrica', d.metrica,
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'estado_base', d.estado_base,
          'valor_observado', d.valor_observado,
          'meta_aplicada', d.meta_aplicada,
          'nota', d.nota_segmento,
          'capacidade_excedida', d.capacidade_excedida
        )
        order by
          d.professor_id,
          d.unidade_id::text,
          d.metrica,
          d.curso_id nulls last,
          d.modalidade nulls last
      )
      from detalhe d
    ), '[]'::jsonb),
    'regra_ausente', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'atribuicao_id', d.atribuicao_id
        )
        order by d.professor_id, d.unidade_id::text, d.curso_id, d.modalidade
      )
      from detalhe d
      where d.metrica = 'numero_alunos'
        and (
          d.estado_base = 'regra_ausente'
          or (
            d.config_meta_segmento_id is null
            and d.curso_id is not null
            and d.modalidade in ('individual', 'turma')
          )
        )
    ), '[]'::jsonb),
    'atribuicoes_pontuaveis_sem_meta', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'atribuicao_id', d.atribuicao_id,
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade
        )
        order by d.professor_id, d.unidade_id::text, d.curso_id, d.modalidade
      )
      from detalhe d
      where d.metrica = 'numero_alunos'
        and d.atribuicao_pontuavel
        and d.config_meta_segmento_id is null
    ), '[]'::jsonb),
    'zero_carteira', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'atribuicao_id', d.atribuicao_id,
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'meta_carteira_curso', d.meta_aplicada
        )
        order by d.professor_id, d.unidade_id::text, d.curso_id, d.modalidade
      )
      from detalhe d
      where d.metrica = 'numero_alunos'
        and d.estado_base = 'sem_base_zero_carteira'
    ), '[]'::jsonb),
    'superlotacao', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'alertas_capacidade', d.alertas_capacidade
        )
        order by d.professor_id, d.unidade_id::text, d.curso_id, d.modalidade
      )
      from detalhe d
      where d.metrica = 'media_turma'
        and d.capacidade_excedida
    ), '[]'::jsonb),
    'segmentacao_incompleta', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'dados_sem_resolucao', d.dados_sem_resolucao,
          'estados_resolucao', d.estados_resolucao,
          'divergencias', d.divergencias
        )
        order by
          d.professor_id,
          d.unidade_id::text,
          d.curso_id nulls last,
          d.modalidade nulls last
      )
      from detalhe d
      where d.metrica = 'numero_alunos'
        and d.estado_base = 'segmentacao_incompleta'
    ), '[]'::jsonb),
    'nao_ofertada_observada', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade
        )
        order by d.professor_id, d.unidade_id::text, d.curso_id, d.modalidade
      )
      from detalhe d
      where d.metrica = 'numero_alunos'
        and (
          d.estado_base = 'divergencia_nao_ofertada'
          or d.divergencias->>'nao_ofertada_com_dados' = 'true'
        )
    ), '[]'::jsonb),
    'publica', false
  ) into v_resultado
  from classificados c;

  insert into public.health_score_professor_v3_config_simulacoes (
    config_id,
    competencia,
    config_fingerprint,
    resultado,
    simulado_por
  ) values (
    p_config_id,
    v_competencia,
    v_fingerprint,
    v_resultado,
    v_ator
  ) returning id, criado_em into v_simulacao_id, v_simulada_em;

  return v_resultado || jsonb_build_object(
    'simulacao_id', v_simulacao_id,
    'simulada_em', v_simulada_em,
    'config_fingerprint', v_fingerprint
  );
end;
$$;

