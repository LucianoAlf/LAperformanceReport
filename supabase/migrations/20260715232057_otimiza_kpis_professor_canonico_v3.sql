-- Evita recalcular a carteira canonica duas vezes na RPC de performance.
-- A v2 ja entrega a carteira por professor/unidade; a camada de saidas precisa
-- acrescentar somente os eventos validos e deixar as taxas para a composicao v3.

CREATE OR REPLACE FUNCTION public.get_saidas_professor_periodo_agregadas_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  professor_id integer,
  unidade_id uuid,
  evasoes_validas integer,
  nao_renovacoes_validas integer,
  saidas_validas_total integer,
  saidas_score_professor integer,
  mrr_perdido_total numeric,
  mrr_perdido_score numeric,
  regra_versao text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH limites AS (
    SELECT
      COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1)) AS inicio,
      COALESCE(
        p_data_fim,
        (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
      ) AS fim
  ),
  base_movimentos AS (
    SELECT
      m.professor_id,
      m.unidade_id,
      m.tipo::text AS tipo,
      COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)::numeric AS mrr_perdido,
      COALESCE(ms.conta_score_professor, false) AS conta_score_professor
    FROM public.movimentacoes_admin m
    CROSS JOIN limites l
    LEFT JOIN public.alunos a ON a.id = m.aluno_id
    LEFT JOIN LATERAL (
      SELECT motivo.id, motivo.conta_score_professor
      FROM public.motivos_saida motivo
      WHERE motivo.ativo = true
        AND (
          motivo.id = m.motivo_saida_id
          OR (
            m.motivo_saida_id IS NULL
            AND m.motivo IS NOT NULL
            AND lower(btrim(motivo.nome)) = lower(btrim(m.motivo))
          )
        )
      ORDER BY
        CASE WHEN motivo.id = m.motivo_saida_id THEN 0 ELSE 1 END,
        motivo.id
      LIMIT 1
    ) ms ON true
    WHERE m.professor_id IS NOT NULL
      AND m.tipo IN ('evasao', 'nao_renovacao')
      AND m.data BETWEEN l.inicio AND l.fim
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
      AND public.is_movimentacao_admin_retencao_valida(m.id)
      AND COALESCE(a.is_segundo_curso, false) = false
  )
  SELECT
    b.professor_id,
    b.unidade_id,
    COUNT(*) FILTER (WHERE b.tipo = 'evasao')::integer AS evasoes_validas,
    COUNT(*) FILTER (WHERE b.tipo = 'nao_renovacao')::integer AS nao_renovacoes_validas,
    COUNT(*)::integer AS saidas_validas_total,
    COUNT(*) FILTER (WHERE b.conta_score_professor)::integer AS saidas_score_professor,
    COALESCE(SUM(b.mrr_perdido), 0)::numeric AS mrr_perdido_total,
    COALESCE(SUM(b.mrr_perdido) FILTER (WHERE b.conta_score_professor), 0)::numeric AS mrr_perdido_score,
    'saidas-professor-v1'::text AS regra_versao
  FROM base_movimentos b
  GROUP BY b.professor_id, b.unidade_id
  ORDER BY b.professor_id, b.unidade_id;
$$;

COMMENT ON FUNCTION public.get_saidas_professor_periodo_agregadas_v1(
  integer, integer, uuid, date, date
) IS 'Agregado interno das saidas validas. Nao recalcula carteira nem fabrica taxas.';

REVOKE ALL ON FUNCTION public.get_saidas_professor_periodo_agregadas_v1(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.get_saidas_professor_periodo_agregadas_v1(
  integer, integer, uuid, date, date
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_kpis_professor_periodo_canonico_v3(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  ano integer,
  mes integer,
  carteira_alunos integer,
  ticket_medio numeric,
  media_presenca numeric,
  taxa_faltas numeric,
  mrr_carteira numeric,
  nps_medio numeric,
  media_alunos_turma numeric,
  experimentais integer,
  experimentais_agendadas integer,
  experimentais_faltas integer,
  matriculas integer,
  matriculas_pos_exp integer,
  matriculas_diretas integer,
  taxa_conversao numeric,
  renovacoes integer,
  nao_renovacoes integer,
  taxa_renovacao numeric,
  evasoes integer,
  mrr_perdido numeric,
  taxa_cancelamento numeric,
  total_turmas integer,
  alunos_via_turmas integer,
  turmas_elegiveis_media integer,
  presenca_publicavel boolean,
  presenca_cobertura numeric,
  presenca_confianca text,
  presenca_eventos_confirmados integer,
  presenca_eventos_incertos integer,
  presenca_regra_versao text,
  evasoes_validas integer,
  nao_renovacoes_validas integer,
  saidas_validas_total integer,
  saidas_score_professor integer,
  mrr_perdido_total numeric,
  mrr_perdido_score numeric,
  taxa_saidas_total numeric,
  taxa_impacto_score numeric,
  taxa_retencao_atribuivel numeric,
  saidas_regra_versao text,
  fator_demanda_ponderado numeric,
  fator_demanda_publicavel boolean,
  fator_demanda_cobertura numeric,
  fator_demanda_fonte text,
  fator_demanda_vinculos integer,
  fator_demanda_pessoas integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT *
    FROM public.get_kpis_professor_periodo_canonico_v2(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    )
  ),
  saidas AS (
    SELECT *
    FROM public.get_saidas_professor_periodo_agregadas_v1(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    )
  ),
  fator AS (
    SELECT *
    FROM public.get_fator_demanda_professor_periodo_canonico_v1(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    )
  )
  SELECT
    b.professor_id,
    b.professor_nome,
    b.unidade_id,
    b.ano,
    b.mes,
    b.carteira_alunos,
    b.ticket_medio,
    b.media_presenca,
    b.taxa_faltas,
    b.mrr_carteira,
    b.nps_medio,
    b.media_alunos_turma,
    b.experimentais,
    b.experimentais_agendadas,
    b.experimentais_faltas,
    b.matriculas,
    b.matriculas_pos_exp,
    b.matriculas_diretas,
    b.taxa_conversao,
    b.renovacoes,
    b.nao_renovacoes,
    b.taxa_renovacao,
    b.evasoes,
    b.mrr_perdido,
    b.taxa_cancelamento,
    b.total_turmas,
    b.alunos_via_turmas,
    b.turmas_elegiveis_media,
    b.presenca_publicavel,
    b.presenca_cobertura,
    b.presenca_confianca,
    b.presenca_eventos_confirmados,
    b.presenca_eventos_incertos,
    b.presenca_regra_versao,
    COALESCE(s.evasoes_validas, 0)::integer,
    COALESCE(s.nao_renovacoes_validas, 0)::integer,
    COALESCE(s.saidas_validas_total, 0)::integer,
    COALESCE(s.saidas_score_professor, 0)::integer,
    COALESCE(s.mrr_perdido_total, 0)::numeric,
    COALESCE(s.mrr_perdido_score, 0)::numeric,
    CASE WHEN b.carteira_alunos > 0
      THEN ROUND(COALESCE(s.saidas_validas_total, 0)::numeric / b.carteira_alunos * 100, 2)
      ELSE 0
    END::numeric,
    CASE WHEN b.carteira_alunos > 0
      THEN ROUND(COALESCE(s.saidas_score_professor, 0)::numeric / b.carteira_alunos * 100, 2)
      ELSE 0
    END::numeric,
    CASE WHEN b.carteira_alunos > 0
      THEN GREATEST(
        0,
        100 - ROUND(COALESCE(s.saidas_score_professor, 0)::numeric / b.carteira_alunos * 100, 2)
      )
      ELSE 0
    END::numeric,
    COALESCE(s.regra_versao, 'saidas-professor-v1')::text,
    CASE WHEN COALESCE(f.fator_demanda_publicavel, false)
      THEN f.fator_demanda_ponderado
      ELSE NULL
    END::numeric,
    COALESCE(f.fator_demanda_publicavel, false),
    COALESCE(f.fator_demanda_cobertura, 0)::numeric,
    COALESCE(f.fator_demanda_fonte, 'sem_base')::text,
    COALESCE(f.fator_demanda_vinculos, 0)::integer,
    COALESCE(f.fator_demanda_pessoas, 0)::integer
  FROM base b
  LEFT JOIN saidas s
    ON s.professor_id = b.professor_id
   AND s.unidade_id = b.unidade_id
  LEFT JOIN fator f
    ON f.professor_id = b.professor_id
   AND f.unidade_id = b.unidade_id
  ORDER BY b.professor_id, b.unidade_id;
$$;

COMMENT ON FUNCTION public.get_kpis_professor_periodo_canonico_v3(
  integer, integer, uuid, date, date
) IS 'KPIs v2 com saidas e fator por competencia, sem recomputacao duplicada da carteira.';

REVOKE ALL ON FUNCTION public.get_kpis_professor_periodo_canonico_v3(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.get_kpis_professor_periodo_canonico_v3(
  integer, integer, uuid, date, date
) TO authenticated, service_role;
