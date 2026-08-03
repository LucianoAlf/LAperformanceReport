-- Hotfix: o ciclo deve usar a presença canônica agregada no próprio recorte.
-- A regra anterior desligava todo o pilar quando o início do ciclo era anterior
-- a 03/08/2026, mesmo com numerador e denominador oficiais disponíveis.

alter function public.get_health_score_professor_v3_projecao_viva(date, uuid, text)
  rename to get_hs_prof_v3_projecao_viva_before_presence_cycle_fix_20260803;

create or replace function public.get_health_score_professor_v3_projecao_viva(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  professor_id integer, unidade_id uuid, escopo text, competencia date,
  trimestre_inicio date, periodicidade text, periodo_inicio date, periodo_fim date,
  ciclo_codigo text, estado_publicacao text, score_exibivel boolean,
  ranking_habilitado boolean, config_versao integer, revisao integer, score numeric,
  cobertura numeric, classificacao text, estado text, snapshot_publicavel boolean,
  publicado boolean, motivo_bloqueio text, regra_versao_snapshot text,
  metrica text, valor_bruto numeric, numerador numeric, denominador numeric,
  nota numeric, peso numeric, peso_disponivel boolean, peso_efetivo numeric,
  contribuicao numeric, meta numeric, amostra integer, estado_base text,
  metrica_publicavel boolean, confianca text, fonte text,
  regra_versao_metrica text, motivo_sem_base text, codigo_evidencia text,
  papel text, detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    b.professor_id,
    b.unidade_id,
    b.escopo,
    b.competencia,
    b.trimestre_inicio,
    b.periodicidade,
    b.periodo_inicio,
    b.periodo_fim,
    b.ciclo_codigo,
    b.estado_publicacao,
    b.score_exibivel,
    b.ranking_habilitado,
    b.config_versao,
    b.revisao,
    b.score,
    b.cobertura,
    b.classificacao,
    b.estado,
    b.snapshot_publicavel,
    b.publicado,
    b.motivo_bloqueio,
    b.regra_versao_snapshot,
    b.metrica,
    b.valor_bruto,
    b.numerador,
    b.denominador,
    b.nota,
    b.peso,
    case
      when b.periodicidade = 'ciclo' and b.metrica = 'presenca' then
        b.valor_bruto is not null
        and coalesce(b.amostra, 0) >= 1
        and coalesce(b.estado_base, '') not in (
          'sem_base', 'sem_base_amostra', 'em_auditoria', 'bloqueada',
          'fonte_indisponivel', 'calendario_sem_aulas_elegiveis'
        )
      else b.peso_disponivel
    end as peso_disponivel,
    b.peso_efetivo,
    b.contribuicao,
    b.meta,
    b.amostra,
    b.estado_base,
    b.metrica_publicavel,
    b.confianca,
    b.fonte,
    case
      when b.periodicidade = 'ciclo' and b.metrica = 'presenca'
        then 'health-score-professor-v3-ciclo-presenca-canonica-2'
      else b.regra_versao_metrica
    end as regra_versao_metrica,
    b.motivo_sem_base,
    b.codigo_evidencia,
    b.papel,
    case
      when b.periodicidade = 'ciclo' and b.metrica = 'presenca' then
        jsonb_strip_nulls(
          (coalesce(b.detalhes, '{}'::jsonb) - 'referencia_historica')
          || jsonb_build_object(
            'presenca_ciclo_canonica', true,
            'data_corte', least(current_date, b.periodo_fim)
          )
        )
      else coalesce(b.detalhes, '{}'::jsonb)
    end as detalhes
  from public.get_hs_prof_v3_projecao_viva_before_presence_cycle_fix_20260803(
    p_competencia,
    p_unidade_id,
    p_periodicidade
  ) b;
$function$;

revoke all on function public.get_hs_prof_v3_projecao_viva_before_presence_cycle_fix_20260803(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_hs_prof_v3_projecao_viva_before_presence_cycle_fix_20260803(
  date, uuid, text
) to service_role;

revoke all on function public.get_health_score_professor_v3_projecao_viva(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_projecao_viva(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_projecao_viva(date, uuid, text) is
  'Projeção viva V3; no ciclo, presença canônica do próprio recorte compõe a nota quando possui evidência válida.';
