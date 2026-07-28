begin;

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
  v_resultado_base jsonb;
  v_snapshot_base record;
  v_snapshot_id uuid;
  v_numero record;
  v_media record;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_cobertura numeric;
  v_score numeric;
  v_tem_fidelizacao boolean;
  v_classificacao text;
  v_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;

  v_resultado_base :=
    public.materializar_health_score_professor_v3_periodo_impl_base_20260728(
      p_competencia,
      p_periodicidade,
      p_unidade_id,
      p_professor_id
    );

  for v_snapshot_base in
    select s.*
    from jsonb_array_elements_text(
      v_resultado_base -> 'snapshot_ids'
    ) j(id)
    join public.health_score_professor_v3_snapshots s
      on s.id = j.id::uuid
    where s.estado <> 'fechado'
  loop
    select n.* into v_numero
    from public.get_health_score_professor_v3_numero_alunos_disponibilidade(
      v_snapshot_base.competencia,
      v_snapshot_base.unidade_id,
      v_snapshot_base.periodicidade
    ) n
    where n.professor_id = v_snapshot_base.professor_id
      and n.unidade_id is not distinct from v_snapshot_base.unidade_id;

    select
      sum(s.ocupacoes_unicas)::numeric as ocupacoes,
      sum(s.turmas_elegiveis)::numeric as turmas,
      sum(s.numerador) filter (
        where s.numerador is not null
      )::numeric as numerador,
      sum(s.denominador) filter (
        where s.denominador is not null
      )::numeric as denominador,
      bool_or(s.estado_base in (
        'regra_ausente',
        'segmentacao_incompleta',
        'divergencia_nao_ofertada'
      )) as tem_bloqueio,
      count(*)::integer as segmentos_pontuaveis
    into v_media
    from public.health_score_professor_v3_snapshot_metrica_segmentos s
    join public.health_score_professor_v3_snapshot_metricas sm
      on sm.id = s.snapshot_metrica_id
    where sm.snapshot_id = v_snapshot_base.id
      and sm.metrica = 'media_turma'
      and s.atribuicao_pontuavel is true;

    insert into public.health_score_professor_v3_snapshots (
      professor_id,
      escopo,
      unidade_id,
      competencia,
      trimestre_inicio,
      revisao,
      estado,
      config_id,
      config_versao,
      score,
      cobertura,
      classificacao,
      publicavel,
      publicado,
      motivo_bloqueio,
      regra_versao,
      snapshot_anterior_id,
      justificativa_retificacao,
      criado_por,
      periodicidade,
      periodo_inicio,
      periodo_fim,
      ciclo_codigo,
      estado_publicacao,
      score_exibivel,
      ranking_habilitado
    )
    values (
      v_snapshot_base.professor_id,
      v_snapshot_base.escopo,
      v_snapshot_base.unidade_id,
      v_snapshot_base.competencia,
      v_snapshot_base.trimestre_inicio,
      v_snapshot_base.revisao + 1,
      'provisorio',
      v_snapshot_base.config_id,
      v_snapshot_base.config_versao,
      null,
      0,
      'sem_base',
      false,
      false,
      'revisao encadeada da carteira por disponibilidade',
      'health-score-professor-v3-carteira-disponibilidade-append-only-1',
      v_snapshot_base.id,
      null,
      v_snapshot_base.criado_por,
      v_snapshot_base.periodicidade,
      v_snapshot_base.periodo_inicio,
      v_snapshot_base.periodo_fim,
      v_snapshot_base.ciclo_codigo,
      'sem_base',
      false,
      false
    )
    returning id into v_snapshot_id;

    insert into public.health_score_professor_v3_snapshot_metricas (
      snapshot_id,
      metrica,
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
      detalhes,
      nota,
      peso,
      peso_disponivel,
      contribuicao,
      meta_aplicada
    )
    select
      v_snapshot_id,
      sm.metrica,
      case
        when sm.metrica = 'numero_alunos' then v_numero.valor_bruto
        when sm.metrica = 'media_turma' and v_media.turmas > 0
          then round(
            v_media.ocupacoes / nullif(v_media.turmas, 0),
            2
          )
        else sm.valor_bruto
      end,
      case
        when sm.metrica = 'numero_alunos' then v_numero.numerador
        when sm.metrica = 'media_turma' then v_media.numerador
        else sm.numerador
      end,
      case
        when sm.metrica = 'numero_alunos' then v_numero.denominador
        when sm.metrica = 'media_turma' then v_media.denominador
        else sm.denominador
      end,
      case
        when sm.metrica = 'numero_alunos' then v_numero.amostra
        when sm.metrica = 'media_turma'
          then coalesce(v_media.turmas, 0)::integer
        else sm.amostra
      end,
      case
        when sm.metrica = 'numero_alunos'
          then coalesce(v_numero.estado_base, 'sem_base_disponibilidade')
        when sm.metrica = 'media_turma' then
          case
            when coalesce(v_media.segmentos_pontuaveis, 0) = 0
              or coalesce(v_media.turmas, 0) = 0
              then 'sem_base_sem_turmas'
            when coalesce(v_media.tem_bloqueio, false)
              then 'segmentacao_incompleta'
            else 'ok'
          end
        else sm.estado_base
      end,
      case
        when sm.metrica = 'numero_alunos'
          then coalesce(v_numero.publicavel, false)
        when sm.metrica = 'media_turma'
          then coalesce(v_media.segmentos_pontuaveis, 0) > 0
            and coalesce(v_media.turmas, 0) > 0
            and not coalesce(v_media.tem_bloqueio, false)
            and coalesce(v_media.denominador, 0) > 0
        else sm.publicavel
      end,
      case
        when sm.metrica = 'numero_alunos'
          then coalesce(v_numero.confianca, 'sem_base')
        when sm.metrica = 'media_turma'
          and coalesce(v_media.segmentos_pontuaveis, 0) > 0
          and coalesce(v_media.turmas, 0) > 0
          and not coalesce(v_media.tem_bloqueio, false)
          and coalesce(v_media.denominador, 0) > 0
          then 'alta'
        when sm.metrica = 'media_turma' then 'sem_base'
        else sm.confianca
      end,
      case
        when sm.metrica = 'numero_alunos'
          then coalesce(
            v_numero.fonte,
            'professores_unidades.disponibilidade'
          )
        else sm.fonte
      end,
      case
        when sm.metrica = 'numero_alunos'
          then 'health-score-professor-v3-carteira-disponibilidade-1'
        when sm.metrica = 'media_turma'
          then 'health-score-professor-v3-media-turma-pontuaveis-1'
        else sm.regra_versao
      end,
      case
        when sm.metrica = 'numero_alunos'
          then v_numero.motivo_sem_base
        when sm.metrica = 'media_turma'
          and coalesce(v_media.segmentos_pontuaveis, 0) = 0
          then 'nenhuma atribuicao pontuavel para media/turma'
        when sm.metrica = 'media_turma'
          and coalesce(v_media.turmas, 0) = 0
          then 'professor sem turma regular elegivel no periodo'
        when sm.metrica = 'media_turma'
          and coalesce(v_media.tem_bloqueio, false)
          then 'atribuicao pontuavel ainda possui segmentacao incompleta'
        else sm.motivo_sem_base
      end,
      case
        when sm.metrica = 'numero_alunos'
          then coalesce(v_numero.detalhes, '{}'::jsonb)
            || jsonb_build_object(
              'normalizacao', 'meta_total_disponibilidade_unidade',
              'meta_por_curso_somente_diagnostico', true,
              'snapshot_base_id', v_snapshot_base.id
            )
        when sm.metrica = 'media_turma'
          then coalesce(sm.detalhes, '{}'::jsonb)
            || jsonb_build_object(
              'atribuicoes_nao_pontuaveis_bloqueiam', false,
              'segmentos_pontuaveis',
                coalesce(v_media.segmentos_pontuaveis, 0),
              'normalizacao', 'segmentada_unidade_curso_modalidade',
              'snapshot_base_id', v_snapshot_base.id
            )
        else sm.detalhes
      end,
      case
        when sm.metrica = 'numero_alunos'
          and coalesce(v_numero.estado_base, 'sem_base_disponibilidade')
            not in (
              'em_maturacao',
              'sem_base_disponibilidade',
              'sem_base_zero_carteira',
              'sem_base_politica'
            )
          and v_numero.publicavel
          and v_numero.denominador > 0
          then round(least(
            100::numeric,
            100::numeric * v_numero.valor_bruto
              / nullif(v_numero.denominador, 0)
          ), 2)
        when sm.metrica = 'numero_alunos' then null::numeric
        when sm.metrica = 'media_turma'
          and coalesce(v_media.segmentos_pontuaveis, 0) > 0
          and coalesce(v_media.turmas, 0) > 0
          and not coalesce(v_media.tem_bloqueio, false)
          and coalesce(v_media.denominador, 0) > 0
          then round(least(
            100::numeric,
            100::numeric * v_media.numerador
              / nullif(v_media.denominador, 0)
          ), 2)
        when sm.metrica = 'media_turma' then null::numeric
        else sm.nota
      end,
      sm.peso,
      case
        when sm.metrica = 'numero_alunos'
          then v_numero.publicavel
            and v_numero.denominador > 0
            and v_numero.estado_base = 'ok'
        when sm.metrica = 'media_turma'
          then coalesce(v_media.segmentos_pontuaveis, 0) > 0
            and coalesce(v_media.turmas, 0) > 0
            and not coalesce(v_media.tem_bloqueio, false)
            and coalesce(v_media.denominador, 0) > 0
        else sm.peso_disponivel
      end,
      case
        when sm.metrica = 'numero_alunos'
          and v_numero.publicavel
          and v_numero.denominador > 0
          and v_numero.estado_base = 'ok'
          then round(
            least(
              100::numeric,
              100::numeric * v_numero.valor_bruto
                / nullif(v_numero.denominador, 0)
            ) * sm.peso / 100,
            4
          )
        when sm.metrica = 'numero_alunos' then null::numeric
        when sm.metrica = 'media_turma'
          and coalesce(v_media.segmentos_pontuaveis, 0) > 0
          and coalesce(v_media.turmas, 0) > 0
          and not coalesce(v_media.tem_bloqueio, false)
          and coalesce(v_media.denominador, 0) > 0
          then round(
            least(
              100::numeric,
              100::numeric * v_media.numerador
                / nullif(v_media.denominador, 0)
            ) * sm.peso / 100,
            4
          )
        when sm.metrica = 'media_turma' then null::numeric
        else sm.contribuicao
      end,
      case
        when sm.metrica = 'numero_alunos' then v_numero.denominador
        else sm.meta_aplicada
      end
    from public.health_score_professor_v3_snapshot_metricas sm
    where sm.snapshot_id = v_snapshot_base.id;

    insert into public.health_score_professor_v3_snapshot_metrica_segmentos (
      snapshot_metrica_id,
      config_meta_segmento_id,
      unidade_id,
      curso_id,
      modalidade,
      pessoas_unicas,
      vinculos_ativos,
      turmas_elegiveis,
      ocupacoes_unicas,
      capacidade_maxima,
      meta_aplicada,
      numerador,
      denominador,
      nota,
      estado_base,
      fonte,
      regra_versao,
      detalhes,
      atribuicao_id,
      atribuicao_formal,
      atribuicao_pontuavel,
      pessoas_unicas_total,
      pessoas_fechamentos,
      meses_com_base,
      meses_com_base_consolidado,
      meses_no_periodo,
      capacidade_excedida,
      alertas_capacidade,
      divergencias
    )
    select
      sm_nova.id,
      seg.config_meta_segmento_id,
      seg.unidade_id,
      seg.curso_id,
      seg.modalidade,
      seg.pessoas_unicas,
      seg.vinculos_ativos,
      seg.turmas_elegiveis,
      seg.ocupacoes_unicas,
      seg.capacidade_maxima,
      seg.meta_aplicada,
      seg.numerador,
      seg.denominador,
      seg.nota,
      case
        when seg.atribuicao_pontuavel is not true
          and seg.estado_base in (
            'regra_ausente',
            'segmentacao_incompleta',
            'divergencia_nao_ofertada'
          )
          then 'diagnostico_nao_pontuavel'
        else seg.estado_base
      end,
      seg.fonte,
      seg.regra_versao,
      coalesce(seg.detalhes, '{}'::jsonb)
        || case
          when seg.atribuicao_pontuavel is not true
            then jsonb_build_object(
              'diagnostico_nao_pontuavel', true,
              'nao_bloqueia_agregador', true
            )
          else '{}'::jsonb
        end,
      seg.atribuicao_id,
      seg.atribuicao_formal,
      seg.atribuicao_pontuavel,
      seg.pessoas_unicas_total,
      seg.pessoas_fechamentos,
      seg.meses_com_base,
      seg.meses_com_base_consolidado,
      seg.meses_no_periodo,
      seg.capacidade_excedida,
      seg.alertas_capacidade,
      seg.divergencias
    from public.health_score_professor_v3_snapshot_metrica_segmentos seg
    join public.health_score_professor_v3_snapshot_metricas sm_base
      on sm_base.id = seg.snapshot_metrica_id
    join public.health_score_professor_v3_snapshot_metricas sm_nova
      on sm_nova.snapshot_id = v_snapshot_id
     and sm_nova.metrica = sm_base.metrica
    where sm_base.snapshot_id = v_snapshot_base.id;

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
      sm_nova.id,
      d.unidade_id,
      d.pessoas_unicas_total,
      d.dados_sem_resolucao,
      d.estados_resolucao,
      d.estado_base,
      d.fonte,
      d.regra_versao,
      d.divergencias,
      d.detalhes
    from public.health_score_professor_v3_snapshot_metrica_diagnosticos d
    join public.health_score_professor_v3_snapshot_metricas sm_base
      on sm_base.id = d.snapshot_metrica_id
    join public.health_score_professor_v3_snapshot_metricas sm_nova
      on sm_nova.snapshot_id = v_snapshot_id
     and sm_nova.metrica = sm_base.metrica
    where sm_base.snapshot_id = v_snapshot_base.id;

    select * into v_config
    from public.health_score_professor_v3_config_versoes c
    where c.id = v_snapshot_base.config_id;

    select
      coalesce(sum(m.peso) filter (where m.nota is not null), 0),
      case
        when coalesce(sum(m.peso) filter (where m.nota is not null), 0) > 0
          then round(
            sum(m.nota * m.peso) filter (where m.nota is not null)
              / sum(m.peso) filter (where m.nota is not null),
            2
          )
        else null::numeric
      end,
      coalesce(bool_or(
        m.metrica in ('retencao', 'permanencia')
          and m.nota is not null
      ), false)
    into v_cobertura, v_score, v_tem_fidelizacao
    from public.health_score_professor_v3_snapshot_metricas m
    where m.snapshot_id = v_snapshot_id;

    if v_cobertura < v_config.cobertura_minima
      or (
        v_config.exige_pilar_fidelizacao
        and not v_tem_fidelizacao
      ) then
      v_score := null;
    end if;

    v_classificacao := case
      when v_score is null then 'sem_base'
      when v_score >= v_config.faixa_saudavel_min then 'saudavel'
      when v_score >= v_config.faixa_atencao_min then 'atencao'
      else 'critico'
    end;

    update public.health_score_professor_v3_snapshots s
    set
      score = v_score,
      cobertura = v_cobertura,
      classificacao = v_classificacao,
      estado = case
        when exists (
          select 1
          from public.health_score_professor_v3_snapshot_metricas m
          where m.snapshot_id = v_snapshot_id
            and m.estado_base = 'em_maturacao'
        ) then 'em_maturacao'
        else 'provisorio'
      end,
      publicavel = false,
      publicado = false,
      estado_publicacao = case
        when v_score is null then 'sem_base'
        else 'parcial'
      end,
      score_exibivel = v_score is not null,
      ranking_habilitado = false,
      motivo_bloqueio = case
        when v_score is null
          then 'cobertura ou pilar de fidelizacao insuficiente'
        else 'Health Score parcial; ranking e premiacao dependem do fechamento oficial do ciclo'
      end
    where s.id = v_snapshot_id
      and s.estado <> 'fechado';

    v_count := v_count + 1;
    v_ids := v_ids || jsonb_build_array(v_snapshot_id);
  end loop;

  return v_resultado_base || jsonb_build_object(
    'snapshots_criados', v_count,
    'snapshot_ids', v_ids,
    'snapshots_base_intermediarios',
      v_resultado_base -> 'snapshot_ids',
    'carteira_regra_versao',
      'health-score-professor-v3-carteira-disponibilidade-append-only-1',
    'consumidores_alterados', false
  );
end;
$$;

revoke all on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  )
  from public, anon, authenticated;
grant execute on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  )
  to service_role;

comment on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  ) is
  'Cria revisao append-only da carteira por disponibilidade sobre o snapshot-base; nenhuma metrica existente e atualizada.';

commit;
