-- O read model do Health Score V3 deve publicar a mesma equipe ativa usada
-- pela tela de Professores e pelo contrato V2 da Coordenacao. As metricas
-- historicas preservam identidades mescladas/inativas para auditoria, mas elas
-- nao podem reaparecer como membros da equipe atual nem contaminar os cinco
-- relatorios operacionais.

create or replace function public.get_health_score_professor_v3_performance(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text
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
  papel text, detalhes jsonb,
  score_observado numeric, score_comparavel numeric,
  pilares_validos integer, pilares_esperados integer,
  comparabilidade_estado text, comparabilidade_motivo text,
  competencia_referencia date, score_referencia numeric,
  classificacao_referencia text,
  data_corte date, config_id uuid, regra_fingerprint text,
  peso_pontuavel_total numeric, peso_disponivel_total numeric,
  cobertura_normalizada numeric, cobertura_minima_aplicada numeric,
  comparabilidade_motivos jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    b.professor_id, b.unidade_id, b.escopo, b.competencia,
    b.trimestre_inicio, b.periodicidade, b.periodo_inicio, b.periodo_fim,
    b.ciclo_codigo, b.estado_publicacao, b.score_exibivel,
    b.ranking_habilitado, b.config_versao, b.revisao, b.score,
    b.cobertura, b.classificacao, b.estado, b.snapshot_publicavel,
    b.publicado, b.motivo_bloqueio, b.regra_versao_snapshot,
    b.metrica, b.valor_bruto, b.numerador, b.denominador,
    b.nota, b.peso, b.peso_disponivel, b.peso_efetivo,
    b.contribuicao, b.meta, b.amostra, b.estado_base,
    b.metrica_publicavel, b.confianca, b.fonte,
    b.regra_versao_metrica, b.motivo_sem_base, b.codigo_evidencia,
    b.papel,
    case
      when b.metrica in ('media_turma', 'numero_alunos') then
        (
          coalesce(b.detalhes, '{}'::jsonb)
          - 'segmentos_resumo'
          - 'divergencias'
          - 'alertas_capacidade'
        ) || jsonb_build_object(
          'segmentos_capacidade_excedida', b.detalhes -> 'segmentos_capacidade_excedida',
          'dados_sem_resolucao', b.detalhes -> 'dados_sem_resolucao',
          'estados_resolucao', b.detalhes -> 'estados_resolucao',
          'codigo_evidencia', coalesce(
            b.detalhes -> 'codigo_evidencia',
            to_jsonb(b.codigo_evidencia)
          )
        )
      else coalesce(b.detalhes, '{}'::jsonb)
    end as detalhes,
    b.score_observado, b.score_comparavel,
    b.pilares_validos, b.pilares_esperados,
    b.comparabilidade_estado, b.comparabilidade_motivo,
    b.competencia_referencia, b.score_referencia,
    b.classificacao_referencia,
    b.data_corte, b.config_id, b.regra_fingerprint,
    b.peso_pontuavel_total, b.peso_disponivel_total,
    b.cobertura_normalizada, b.cobertura_minima_aplicada,
    b.comparabilidade_motivos
  from public.get_hs_prof_v3_performance_payload_base_20260803(
    p_competencia, p_unidade_id, p_periodicidade
  ) b
  join public.professores p
    on p.id = b.professor_id
   and p.ativo = true
  where exists (
    select 1
    from public.professores_unidades pu
    where pu.professor_id = b.professor_id
      and pu.emusys_ativo = true
      and coalesce(pu.validacao_status, 'validado') <> 'ignorado'
      and (p_unidade_id is null or pu.unidade_id = p_unidade_id)
  );
$function$;

revoke all on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is
  'Read model V3 compacto limitado ao roster canonico ativo: professor globalmente ativo e vinculo Emusys ativo, validado e pertencente ao escopo solicitado.';
