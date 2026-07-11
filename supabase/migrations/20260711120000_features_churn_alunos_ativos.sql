-- Feature engineering do modelo de churn (risco de evasao).
-- Retorna, por aluno ATIVO nao arquivado, as 12 features numericas + 10 categoricas
-- que a edge function calcular-risco-evasao alimenta no modelo Random Forest.
--
-- As formulas espelham EXATAMENTE o notebook de treino
-- (estudo/pesquisas/churn-alunos/notebooks/01_churn_alunos.ipynb, secao 4-5),
-- validado em validate_port.py (Parte B, 0 divergencias). Regras de nulo:
--   taxa_presenca_*   : 0 aulas no periodo -> 0
--   dias_desde_ultima_aula : sem aula -> NULL (edge imputa mediana do treino)
--   dias_desde_renovacao   : nunca renovou/negativo -> NULL (edge imputa -1)
--   nunca_renovou          : 1 se sem renovacao valida, senao 0
--   pct_desconto           : valor_cheio<=0 -> 0
-- Presenca: status 'presente' conta; janelas 60d/30d relativas a CURRENT_DATE.

CREATE OR REPLACE FUNCTION public.features_churn_alunos_ativos()
RETURNS TABLE (
  aluno_id integer,
  unidade_id uuid,
  idade_atual numeric,
  tempo_permanencia_meses numeric,
  valor_parcela numeric,
  pct_desconto numeric,
  numero_renovacoes numeric,
  dias_desde_renovacao numeric,
  nunca_renovou numeric,
  taxa_presenca_geral numeric,
  taxa_presenca_60d numeric,
  taxa_presenca_30d numeric,
  dias_desde_ultima_aula numeric,
  dia_vencimento numeric,
  classificacao text,
  modalidade text,
  tipo_aluno text,
  status_pagamento text,
  tipo_matricula_nome text,
  canal_origem_nome text,
  forma_pagamento_nome text,
  is_segundo_curso text,
  is_aluno_retorno text,
  anamnese_preenchida text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH presenca AS (
    SELECT
      p.aluno_id,
      count(*)                                                                   AS total_aulas,
      count(*) FILTER (WHERE p.status = 'presente')                              AS presencas,
      count(*) FILTER (WHERE p.data_aula >= CURRENT_DATE - 60)                   AS aulas_60d,
      count(*) FILTER (WHERE p.status = 'presente' AND p.data_aula >= CURRENT_DATE - 60) AS presencas_60d,
      count(*) FILTER (WHERE p.data_aula >= CURRENT_DATE - 30)                   AS aulas_30d,
      count(*) FILTER (WHERE p.status = 'presente' AND p.data_aula >= CURRENT_DATE - 30) AS presencas_30d,
      max(p.data_aula)                                                           AS data_ultima_aula
    FROM public.aluno_presenca p
    GROUP BY p.aluno_id
  )
  SELECT
    a.id                                            AS aluno_id,
    a.unidade_id,
    a.idade_atual::numeric,
    a.tempo_permanencia_meses::numeric,
    a.valor_parcela::numeric,
    CASE WHEN a.valor_cheio > 0
         THEN (COALESCE(a.desconto_fixo, 0) + COALESCE(a.desconto_condicional, 0)) / a.valor_cheio
         ELSE 0 END                                 AS pct_desconto,
    a.numero_renovacoes::numeric,
    CASE WHEN a.data_ultima_renovacao IS NOT NULL AND (CURRENT_DATE - a.data_ultima_renovacao) >= 0
         THEN (CURRENT_DATE - a.data_ultima_renovacao)::numeric
         ELSE NULL END                              AS dias_desde_renovacao,
    CASE WHEN a.data_ultima_renovacao IS NULL OR (CURRENT_DATE - a.data_ultima_renovacao) < 0
         THEN 1 ELSE 0 END                          AS nunca_renovou,
    CASE WHEN COALESCE(pr.total_aulas, 0) > 0
         THEN pr.presencas::numeric / pr.total_aulas ELSE 0 END AS taxa_presenca_geral,
    CASE WHEN COALESCE(pr.aulas_60d, 0) > 0
         THEN pr.presencas_60d::numeric / pr.aulas_60d ELSE 0 END AS taxa_presenca_60d,
    CASE WHEN COALESCE(pr.aulas_30d, 0) > 0
         THEN pr.presencas_30d::numeric / pr.aulas_30d ELSE 0 END AS taxa_presenca_30d,
    (CURRENT_DATE - pr.data_ultima_aula)::numeric    AS dias_desde_ultima_aula,
    a.dia_vencimento::numeric,
    a.classificacao::text,
    a.modalidade::text,
    a.tipo_aluno::text,
    a.status_pagamento::text,
    tm.nome::text                                    AS tipo_matricula_nome,
    co.nome::text                                    AS canal_origem_nome,
    fp.nome::text                                    AS forma_pagamento_nome,
    -- booleanos viram 'True'/'False' (mesma string do treino via str(bool) do pandas)
    CASE WHEN a.is_segundo_curso IS NULL THEN NULL
         WHEN a.is_segundo_curso THEN 'True' ELSE 'False' END AS is_segundo_curso,
    CASE WHEN a.is_aluno_retorno THEN 'True' ELSE 'False' END AS is_aluno_retorno,
    CASE WHEN a.anamnese_preenchida THEN 'True' ELSE 'False' END AS anamnese_preenchida
  FROM public.alunos a
  LEFT JOIN presenca pr           ON pr.aluno_id = a.id
  LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN public.canais_origem co   ON co.id = a.canal_origem_id
  LEFT JOIN public.formas_pagamento fp ON fp.id = a.forma_pagamento_id
  WHERE a.status = 'ativo' AND a.arquivado_em IS NULL;
$$;

COMMENT ON FUNCTION public.features_churn_alunos_ativos() IS
  'Features engenheiradas por aluno ativo pro modelo de churn. Consumida pela edge calcular-risco-evasao. Formulas espelham o notebook de treino (churn-alunos).';

REVOKE ALL ON FUNCTION public.features_churn_alunos_ativos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.features_churn_alunos_ativos() TO service_role;
