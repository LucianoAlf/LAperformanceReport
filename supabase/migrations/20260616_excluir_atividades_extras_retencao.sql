-- ============================================
-- Migration: Excluir atividades extracurriculares das métricas de retenção
-- Contexto: Coral, Power Kids, GarageBand/Percussion Kids e Minha Banda Para Sempre
-- não devem contabilizar em renovação, não renovação, cancelamento/evasão ou churn.
--
-- Segurança: não altera dados. Apenas cria helper idempotente e redefine view.
-- Aplicar somente após aprovação explícita do Alf.
-- ============================================

CREATE OR REPLACE FUNCTION public.is_atividade_extra_curso(p_curso_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.cursos c
     WHERE c.id = p_curso_id
       AND (
         COALESCE(c.is_projeto_banda, false) = true
         OR c.nome ILIKE '%canto coral%'
         OR c.nome ILIKE '%power kids%'
         OR c.nome ILIKE '%minha banda%'
         OR c.nome ILIKE '%garageband%'
         OR c.nome ILIKE '%percussion kids%'
       )
  );
$$;

COMMENT ON FUNCTION public.is_atividade_extra_curso(integer)
IS 'Retorna true para atividades extracurriculares que não entram em KPIs de retenção/churn/renovação: banda/projeto, Canto Coral, Power Kids, Minha Banda, GarageBand/Percussion Kids.';

CREATE OR REPLACE VIEW public.vw_kpis_retencao_mensal AS
WITH movimentacoes_retencao AS (
  SELECT m.*,
         COALESCE(m.curso_id, a.curso_id) AS curso_retencao_id
    FROM public.movimentacoes_admin m
    LEFT JOIN public.alunos a ON a.id = m.aluno_id
   WHERE NOT public.is_atividade_extra_curso(COALESCE(m.curso_id, a.curso_id))
),
evasoes_dedup AS (
  SELECT DISTINCT ON (lower(TRIM(BOTH FROM m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data))
         m.id,
         m.aluno_id,
         m.aluno_nome,
         m.unidade_id,
         m.data AS data_evasao,
         m.tipo,
         m.tipo_evasao,
         COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior) AS valor_parcela
    FROM movimentacoes_retencao m
   WHERE m.tipo::text = ANY (ARRAY['evasao'::text, 'nao_renovacao'::text])
   ORDER BY lower(TRIM(BOTH FROM m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data), m.aluno_id DESC NULLS LAST, m.data DESC
),
evasoes_mes AS (
  SELECT e.unidade_id,
         EXTRACT(year FROM e.data_evasao)::integer AS ano,
         EXTRACT(month FROM e.data_evasao)::integer AS mes,
         count(*) AS total_evasoes,
         count(*) FILTER (WHERE e.tipo::text = 'evasao'::text) AS evasoes_interrompidas,
         count(*) FILTER (WHERE e.tipo_evasao::text = 'transferencia'::text) AS transferencias,
         count(*) FILTER (WHERE e.tipo::text = 'nao_renovacao'::text) AS nao_renovacoes_evasao,
         sum(e.valor_parcela) AS mrr_perdido
    FROM evasoes_dedup e
   GROUP BY e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao)
),
avisos_previos_mes AS (
  SELECT m.unidade_id,
         EXTRACT(year FROM m.data)::integer AS ano,
         EXTRACT(month FROM m.data)::integer AS mes,
         count(*) AS avisos_previos
    FROM movimentacoes_retencao m
   WHERE m.tipo::text = 'aviso_previo'::text
   GROUP BY m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data)
),
renovacoes_mes AS (
  SELECT m.unidade_id,
         EXTRACT(year FROM m.data)::integer AS ano,
         EXTRACT(month FROM m.data)::integer AS mes,
         count(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes_realizadas,
         count(*) FILTER (WHERE m.tipo = 'nao_renovacao') AS nao_renovacoes_renovacao,
         count(*) FILTER (WHERE m.tipo IN ('renovacao', 'nao_renovacao')) AS renovacoes_previstas,
         0::bigint AS renovacoes_pendentes,
         0::bigint AS renovacoes_atrasadas
    FROM movimentacoes_retencao m
   WHERE m.tipo::text = 'renovacao'::text OR m.tipo::text = 'nao_renovacao'::text
   GROUP BY m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data)
),
periodos AS (
  SELECT DISTINCT unidade_id, ano, mes FROM evasoes_mes
  UNION
  SELECT DISTINCT unidade_id, ano, mes FROM avisos_previos_mes
  UNION
  SELECT DISTINCT unidade_id, ano, mes FROM renovacoes_mes
),
total_alunos AS (
  SELECT a.unidade_id,
         count(*) FILTER (
           WHERE tm.conta_como_pagante = true
             AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
             AND NOT public.is_atividade_extra_curso(a.curso_id)
         ) AS total_pagantes
    FROM public.alunos a
    LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
   WHERE a.status::text = ANY (ARRAY['ativo'::text, 'trancado'::text])
   GROUP BY a.unidade_id
)
SELECT u.id AS unidade_id,
       u.nome AS unidade_nome,
       p.ano,
       p.mes,
       COALESCE(em.total_evasoes, 0::bigint)::integer AS total_evasoes,
       COALESCE(em.evasoes_interrompidas, 0::bigint)::integer AS evasoes_interrompidas,
       COALESCE(apm.avisos_previos, 0::bigint)::integer AS avisos_previos,
       COALESCE(em.transferencias, 0::bigint)::integer AS transferencias,
       CASE WHEN COALESCE(ta.total_pagantes, 0::bigint) > 0
            THEN ((COALESCE(em.total_evasoes, 0::bigint) - COALESCE(em.transferencias, 0::bigint))::numeric / ta.total_pagantes::numeric * 100::numeric)::numeric(5,2)
            ELSE 0::numeric END AS taxa_evasao,
       COALESCE(em.mrr_perdido, 0::numeric)::numeric(12,2) AS mrr_perdido,
       COALESCE(rm.renovacoes_previstas, 0::bigint)::integer AS renovacoes_previstas,
       COALESCE(rm.renovacoes_realizadas, 0::bigint)::integer AS renovacoes_realizadas,
       GREATEST(COALESCE(em.nao_renovacoes_evasao, 0::bigint), COALESCE(rm.nao_renovacoes_renovacao, 0::bigint))::integer AS nao_renovacoes,
       COALESCE(rm.renovacoes_pendentes, 0::bigint)::integer AS renovacoes_pendentes,
       COALESCE(rm.renovacoes_atrasadas, 0::bigint)::integer AS renovacoes_atrasadas,
       CASE WHEN COALESCE(rm.renovacoes_previstas, 0::bigint) > 0
            THEN (rm.renovacoes_realizadas::numeric / rm.renovacoes_previstas::numeric * 100::numeric)::numeric(5,2)
            ELSE 0::numeric END AS taxa_renovacao,
       CASE WHEN COALESCE(rm.renovacoes_previstas, 0::bigint) > 0
            THEN (COALESCE(rm.nao_renovacoes_renovacao, 0::bigint)::numeric / rm.renovacoes_previstas::numeric * 100::numeric)::numeric(5,2)
            ELSE 0::numeric END AS taxa_nao_renovacao
  FROM public.unidades u
  JOIN periodos p ON p.unidade_id = u.id
  LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = p.ano AND em.mes = p.mes
  LEFT JOIN avisos_previos_mes apm ON apm.unidade_id = u.id AND apm.ano = p.ano AND apm.mes = p.mes
  LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = p.ano AND rm.mes = p.mes
  LEFT JOIN total_alunos ta ON ta.unidade_id = u.id
 WHERE u.ativo = true;
