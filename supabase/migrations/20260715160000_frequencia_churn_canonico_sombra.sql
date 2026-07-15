-- Frequencia e features de churn em sombra.
-- Nenhum consumidor de producao e alterado nesta migration.

CREATE OR REPLACE VIEW public.vw_aluno_frequencia_canonica_v1
WITH (security_invoker = true) AS
WITH linhas_identificadas AS (
  SELECT
    i.unidade_id,
    i.pessoa_chave,
    i.aluno_id_canonico,
    i.aluno_ids_locais,
    i.identidade_fonte,
    i.identidade_confianca,
    p.aula_emusys_id,
    p.data_aula,
    p.horario_aula,
    p.professor_id,
    p.curso_nome,
    p.resultado_pedagogico,
    p.possui_conflito,
    p.considera_frequencia_denominador,
    CASE
      WHEN p.aula_emusys_id IS NOT NULL
        THEN 'aula:' || p.aula_emusys_id::text
      ELSE concat_ws(
        ':',
        'fallback',
        p.data_aula::text,
        p.horario_aula::text,
        COALESCE(p.professor_id::text, 'sem-professor'),
        COALESCE(lower(btrim(p.curso_nome)), 'sem-curso')
      )
    END AS evento_chave
  FROM public.vw_aluno_identidade_unidade_canonica i
  CROSS JOIN LATERAL unnest(i.aluno_ids_locais) AS aluno_local_id
  JOIN public.vw_aluno_presenca_semantica_v1 p
    ON p.aluno_id = aluno_local_id
   AND p.unidade_id = i.unidade_id
  WHERE p.data_aula <= CURRENT_DATE
),
eventos_agregados AS (
  SELECT
    l.unidade_id,
    l.pessoa_chave,
    l.aluno_id_canonico,
    l.aluno_ids_locais,
    l.identidade_fonte,
    l.identidade_confianca,
    l.evento_chave,
    MIN(l.data_aula) AS data_aula,
    BOOL_OR(l.resultado_pedagogico = 'presente') AS tem_presenca,
    BOOL_OR(l.resultado_pedagogico = 'falta_confirmada') AS tem_falta_confirmada,
    BOOL_OR(l.resultado_pedagogico = 'falta_provavel') AS tem_falta_provavel,
    BOOL_OR(l.resultado_pedagogico = 'indeterminado') AS tem_indeterminado,
    BOOL_OR(l.resultado_pedagogico = 'aula_cancelada') AS tem_cancelamento,
    BOOL_OR(l.resultado_pedagogico = 'aula_justificada') AS tem_justificativa_evento,
    BOOL_OR(l.possui_conflito) AS conflito_na_origem,
    BOOL_OR(l.considera_frequencia_denominador) AS possui_resultado_confirmado
  FROM linhas_identificadas l
  GROUP BY
    l.unidade_id,
    l.pessoa_chave,
    l.aluno_id_canonico,
    l.aluno_ids_locais,
    l.identidade_fonte,
    l.identidade_confianca,
    l.evento_chave
),
eventos_classificados AS (
  SELECT
    e.*,
    CASE
      WHEN e.tem_cancelamento THEN 'aula_cancelada'
      WHEN e.tem_justificativa_evento THEN 'aula_justificada'
      WHEN e.tem_presenca THEN 'presente'
      WHEN e.tem_falta_confirmada THEN 'falta_confirmada'
      WHEN e.tem_falta_provavel THEN 'falta_provavel'
      ELSE 'indeterminado'
    END AS resultado_evento,
    (
      e.conflito_na_origem
      OR (e.tem_presenca AND (
        e.tem_falta_confirmada
        OR e.tem_falta_provavel
        OR e.tem_cancelamento
        OR e.tem_justificativa_evento
      ))
      OR (e.tem_falta_confirmada AND (
        e.tem_cancelamento OR e.tem_justificativa_evento
      ))
    ) AS possui_conflito_evento
  FROM eventos_agregados e
),
agregada AS (
  SELECT
    e.unidade_id,
    e.pessoa_chave,
    e.aluno_id_canonico,
    e.aluno_ids_locais,
    e.identidade_fonte,
    e.identidade_confianca,
    COUNT(*)::integer AS total_eventos_evidencia,
    COUNT(*) FILTER (
      WHERE e.resultado_evento IN ('presente', 'falta_confirmada')
    )::integer AS eventos_resultado_confirmado,
    COUNT(*) FILTER (WHERE e.resultado_evento = 'presente')::integer
      AS presencas_confirmadas,
    COUNT(*) FILTER (WHERE e.resultado_evento = 'falta_confirmada')::integer
      AS faltas_confirmadas,
    COUNT(*) FILTER (WHERE e.resultado_evento = 'falta_provavel')::integer
      AS faltas_provaveis,
    COUNT(*) FILTER (WHERE e.resultado_evento = 'indeterminado')::integer
      AS chamadas_indeterminadas,
    COUNT(*) FILTER (
      WHERE e.resultado_evento IN ('aula_cancelada', 'aula_justificada')
    )::integer AS eventos_excluidos,
    COUNT(*) FILTER (WHERE e.possui_conflito_evento)::integer AS conflitos,
    MAX(e.data_aula) FILTER (
      WHERE e.resultado_evento IN ('presente', 'falta_confirmada')
    ) AS data_ultima_aula_confirmada,

    COUNT(*) FILTER (
      WHERE e.data_aula >= CURRENT_DATE - 60
        AND e.resultado_evento IN ('presente', 'falta_confirmada')
    )::integer AS eventos_confirmados_60d,
    COUNT(*) FILTER (
      WHERE e.data_aula >= CURRENT_DATE - 60
        AND e.resultado_evento = 'presente'
    )::integer AS presencas_confirmadas_60d,
    COUNT(*) FILTER (
      WHERE e.data_aula >= CURRENT_DATE - 30
        AND e.resultado_evento IN ('presente', 'falta_confirmada')
    )::integer AS eventos_confirmados_30d,
    COUNT(*) FILTER (
      WHERE e.data_aula >= CURRENT_DATE - 30
        AND e.resultado_evento = 'presente'
    )::integer AS presencas_confirmadas_30d,

    COUNT(*) FILTER (
      WHERE e.data_aula >= CURRENT_DATE - 60
        AND e.resultado_evento IN ('falta_provavel', 'indeterminado')
    )::integer AS eventos_incertos_60d,
    COUNT(*) FILTER (
      WHERE e.data_aula >= CURRENT_DATE - 30
        AND e.resultado_evento IN ('falta_provavel', 'indeterminado')
    )::integer AS eventos_incertos_30d
  FROM eventos_classificados e
  GROUP BY
    e.unidade_id,
    e.pessoa_chave,
    e.aluno_id_canonico,
    e.aluno_ids_locais,
    e.identidade_fonte,
    e.identidade_confianca
)
SELECT
  a.*,
  CASE
    WHEN a.eventos_resultado_confirmado > 0 THEN ROUND(
      a.presencas_confirmadas::numeric / a.eventos_resultado_confirmado,
      6
    )
    ELSE NULL::numeric
  END AS taxa_presenca_geral,
  CASE
    WHEN a.eventos_confirmados_60d > 0 THEN ROUND(
      a.presencas_confirmadas_60d::numeric / a.eventos_confirmados_60d,
      6
    )
    ELSE NULL::numeric
  END AS taxa_presenca_60d,
  CASE
    WHEN a.eventos_confirmados_30d > 0 THEN ROUND(
      a.presencas_confirmadas_30d::numeric / a.eventos_confirmados_30d,
      6
    )
    ELSE NULL::numeric
  END AS taxa_presenca_30d,
  CASE
    WHEN (
      a.eventos_resultado_confirmado
      + a.faltas_provaveis
      + a.chamadas_indeterminadas
    ) > 0 THEN ROUND(
      a.eventos_resultado_confirmado::numeric
      / (
        a.eventos_resultado_confirmado
        + a.faltas_provaveis
        + a.chamadas_indeterminadas
      ),
      6
    )
    ELSE 0::numeric
  END AS cobertura_resultado_confirmado,
  CASE
    WHEN a.identidade_confianca = 'baixa' OR a.conflitos > 0 THEN 'baixa'
    WHEN a.eventos_resultado_confirmado = 0 THEN 'sem_base'
    WHEN a.faltas_provaveis + a.chamadas_indeterminadas = 0
      AND a.eventos_resultado_confirmado >= 4 THEN 'alta'
    WHEN a.eventos_resultado_confirmado >= 4
      AND a.eventos_resultado_confirmado::numeric
        / NULLIF(
          a.eventos_resultado_confirmado
          + a.faltas_provaveis
          + a.chamadas_indeterminadas,
          0
        ) >= 0.8 THEN 'media'
    ELSE 'baixa'
  END AS confianca_presenca,
  'frequencia-canonica-v1'::text AS regra_versao
FROM agregada a;

COMMENT ON VIEW public.vw_aluno_frequencia_canonica_v1 IS
  'Frequencia por pessoa/unidade. Deduplica eventos entre linhas locais, usa somente presente/falta confirmada no denominador e publica a incerteza do legado Emusys.';

REVOKE ALL ON TABLE public.vw_aluno_frequencia_canonica_v1
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_aluno_frequencia_canonica_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.features_churn_alunos_ativos_v2_sombra()
RETURNS TABLE (
  pessoa_chave text,
  aluno_id integer,
  aluno_ids_locais integer[],
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
  anamnese_preenchida text,
  presenca_denominador_geral integer,
  presenca_denominador_60d integer,
  presenca_denominador_30d integer,
  presenca_eventos_incertos_60d integer,
  presenca_eventos_incertos_30d integer,
  cobertura_resultado_confirmado numeric,
  confianca_presenca text,
  identidade_confianca text,
  modelo_pronto boolean,
  regra_versao text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.pessoa_chave,
    a.id AS aluno_id,
    i.aluno_ids_locais,
    a.unidade_id,
    a.idade_atual::numeric,
    a.tempo_permanencia_meses::numeric,
    a.valor_parcela::numeric,
    CASE
      WHEN a.valor_cheio > 0 THEN
        (COALESCE(a.desconto_fixo, 0) + COALESCE(a.desconto_condicional, 0))
          / a.valor_cheio
      ELSE 0
    END AS pct_desconto,
    a.numero_renovacoes::numeric,
    CASE
      WHEN a.data_ultima_renovacao IS NOT NULL
        AND CURRENT_DATE - a.data_ultima_renovacao >= 0
        THEN (CURRENT_DATE - a.data_ultima_renovacao)::numeric
      ELSE NULL
    END AS dias_desde_renovacao,
    CASE
      WHEN a.data_ultima_renovacao IS NULL
        OR CURRENT_DATE - a.data_ultima_renovacao < 0 THEN 1
      ELSE 0
    END AS nunca_renovou,
    f.taxa_presenca_geral,
    f.taxa_presenca_60d,
    f.taxa_presenca_30d,
    (CURRENT_DATE - f.data_ultima_aula_confirmada)::numeric AS dias_desde_ultima_aula,
    a.dia_vencimento::numeric,
    a.classificacao::text,
    a.modalidade::text,
    a.tipo_aluno::text,
    a.status_pagamento::text,
    tm.nome::text AS tipo_matricula_nome,
    co.nome::text AS canal_origem_nome,
    fp.nome::text AS forma_pagamento_nome,
    CASE
      WHEN a.is_segundo_curso IS NULL THEN NULL
      WHEN a.is_segundo_curso THEN 'True'
      ELSE 'False'
    END AS is_segundo_curso,
    CASE WHEN a.is_aluno_retorno THEN 'True' ELSE 'False' END AS is_aluno_retorno,
    CASE WHEN a.anamnese_preenchida THEN 'True' ELSE 'False' END AS anamnese_preenchida,
    COALESCE(f.eventos_resultado_confirmado, 0) AS presenca_denominador_geral,
    COALESCE(f.eventos_confirmados_60d, 0) AS presenca_denominador_60d,
    COALESCE(f.eventos_confirmados_30d, 0) AS presenca_denominador_30d,
    COALESCE(f.eventos_incertos_60d, 0) AS presenca_eventos_incertos_60d,
    COALESCE(f.eventos_incertos_30d, 0) AS presenca_eventos_incertos_30d,
    COALESCE(f.cobertura_resultado_confirmado, 0) AS cobertura_resultado_confirmado,
    COALESCE(f.confianca_presenca, 'sem_base') AS confianca_presenca,
    i.identidade_confianca,
    false AS modelo_pronto,
    'churn-features-v2-sombra;frequencia-canonica-v1'::text AS regra_versao
  FROM public.vw_aluno_identidade_unidade_canonica i
  JOIN public.alunos a ON a.id = i.aluno_id_canonico
  LEFT JOIN public.vw_aluno_frequencia_canonica_v1 f
    ON f.unidade_id = i.unidade_id
   AND f.pessoa_chave = i.pessoa_chave
  LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN public.canais_origem co ON co.id = a.canal_origem_id
  LEFT JOIN public.formas_pagamento fp ON fp.id = a.forma_pagamento_id
  WHERE a.status = 'ativo'
    AND a.arquivado_em IS NULL;
$$;

COMMENT ON FUNCTION public.features_churn_alunos_ativos_v2_sombra() IS
  'Features por pessoa com frequencia confirmada e cobertura explicita. Sombra: exige retreino/calibracao antes de alimentar qualquer modelo.';

REVOKE ALL ON FUNCTION public.features_churn_alunos_ativos_v2_sombra()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.features_churn_alunos_ativos_v2_sombra()
  TO service_role;
