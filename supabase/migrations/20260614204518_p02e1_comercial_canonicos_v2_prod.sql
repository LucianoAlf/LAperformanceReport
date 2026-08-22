-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================================
-- LA Music Report - P0.2E Comercial/Funil v2
-- STATUS: FINAL PARA REVISAO - NAO EXECUTAR SEM APROVACAO EXPLICITA
-- Data: 2026-06-14
--
-- Producao alvo: ouqwbbermlzqqvtqwlul
-- Staging validado: nzwqjepncrtufpykjita
-- Typo historico bloqueado: nzwqjepncrttufpykjita
--
-- Regra operacional:
--   Antes de executar qualquer DDL, confirmar que o canal SQL/MCP/Dashboard
--   aponta para producao ouqwbbermlzqqvtqwlul. Nao executar em outro
--   project_ref.
--
-- Objetivo:
--   Criar uma RPC v2 paralela para KPIs comerciais canonicos, sem ler
--   dados_comerciais/origem_leads como verdade.
--
-- Nao faz:
--   DROP, DML, backfill, dados_mensais, desativacao de triggers ou migracao
--   de consumidores.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_kpis_comercial_canonicos_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text DEFAULT 'mensal',
  p_data date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH periodo AS (
  SELECT
    CASE WHEN lower(coalesce(p_periodo, 'mensal')) = 'diario' THEN 'diario' ELSE 'mensal' END AS tipo,
    p_ano AS ano,
    p_mes AS mes,
    CASE
      WHEN lower(coalesce(p_periodo, 'mensal')) = 'diario'
      THEN coalesce(p_data, make_date(p_ano, p_mes, 1))
      ELSE make_date(p_ano, p_mes, 1)
    END AS inicio,
    CASE
      WHEN lower(coalesce(p_periodo, 'mensal')) = 'diario'
      THEN coalesce(p_data, make_date(p_ano, p_mes, 1)) + interval '1 day'
      ELSE make_date(p_ano, p_mes, 1) + interval '1 month'
    END AS fim_exclusivo,
    p_data AS data_referencia
),
unidades_alvo AS (
  SELECT u.id AS unidade_id, u.nome AS unidade_nome
  FROM public.unidades u
  WHERE u.ativo = true
    AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
),
leads_base AS (
  SELECT
    l.unidade_id,
    sum(coalesce(l.quantidade, 1))::int AS leads_entrantes,
    count(*)::int AS linhas_leads
  FROM public.leads l
  CROSS JOIN periodo p
  WHERE l.data_contato >= p.inicio::date
    AND l.data_contato < p.fim_exclusivo::date
    AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
  GROUP BY l.unidade_id
),
exp_eventos AS (
  SELECT
    le.*,
    l.aluno_id AS lead_aluno_id,
    coalesce(le.aluno_id, l.aluno_id) AS aluno_id_resolvido,
    EXISTS (
      SELECT 1
      FROM public.aluno_presenca ap
      JOIN public.aulas_emusys ae ON ae.id = ap.aula_emusys_id
      WHERE ap.status = 'presente'
        AND ap.aluno_id = coalesce(le.aluno_id, l.aluno_id)
        AND ap.unidade_id = le.unidade_id
        AND ap.data_aula = le.data_experimental
        AND ae.categoria = 'experimental'
        AND coalesce(ae.cancelada, false) = false
    ) AS presenca_individual_confirmada
  FROM public.lead_experimentais le
  LEFT JOIN public.leads l ON l.id = le.lead_id
  WHERE (p_unidade_id IS NULL OR le.unidade_id = p_unidade_id)
),
exp_agendadas AS (
  SELECT
    ee.unidade_id,
    count(*)::int AS experimentais_agendadas_periodo
  FROM exp_eventos ee
  CROSS JOIN periodo p
  WHERE ee.created_at >= p.inicio
    AND ee.created_at < p.fim_exclusivo
    AND coalesce(ee.status, '') NOT IN ('cancelada', 'cancelado', 'experimental_cancelada')
  GROUP BY ee.unidade_id
),
exp_realizadas AS (
  SELECT
    ee.unidade_id,
    count(*) FILTER (WHERE ee.presenca_individual_confirmada)::int AS experimentais_realizadas_presenca_confirmada,
    count(*) FILTER (WHERE ee.status IN ('experimental_realizada', 'convertido'))::int AS experimentais_realizadas_status_operacional,
    count(*) FILTER (
      WHERE ee.status IN ('experimental_realizada', 'convertido')
        AND NOT ee.presenca_individual_confirmada
    )::int AS experimentais_realizadas_status_operacional_sem_presenca,
    count(*) FILTER (WHERE ee.status IN ('experimental_faltou', 'faltou'))::int AS experimentais_no_show,
    count(*) FILTER (WHERE ee.status IN ('cancelada', 'cancelado', 'experimental_cancelada'))::int AS experimentais_canceladas
  FROM exp_eventos ee
  CROSS JOIN periodo p
  WHERE ee.data_experimental >= p.inicio::date
    AND ee.data_experimental < p.fim_exclusivo::date
  GROUP BY ee.unidade_id
),
visitas_base AS (
  SELECT
    v.unidade_id,
    count(*)::int AS visitas
  FROM public.visitas v
  CROSS JOIN periodo p
  WHERE v.data >= p.inicio::date
    AND v.data < p.fim_exclusivo::date
    AND coalesce(v.status, '') NOT IN ('cancelada', 'cancelado')
    AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
  GROUP BY v.unidade_id
),
matriculas_base AS (
  SELECT
    a.unidade_id,
    a.id AS aluno_id,
    coalesce(a.valor_passaporte, 0) AS valor_passaporte,
    (
      coalesce(a.is_segundo_curso, false) = false
      AND coalesce(a.is_ex_aluno, false) = false
      AND coalesce(a.is_aluno_retorno, false) = false
      AND coalesce(a.valor_passaporte, 0) > 0
      AND coalesce(a.tipo_aluno, 'pagante') NOT IN ('bolsista_integral', 'bolsista_parcial', 'nao_pagante')
      AND coalesce(c.is_projeto_banda, false) = false
      AND lower(coalesce(c.nome, '')) NOT LIKE '%banda%'
      AND lower(coalesce(c.nome, '')) NOT LIKE '%projeto%'
      AND lower(coalesce(c.nome, '')) NOT LIKE '%coral%'
      AND coalesce(tm.codigo, '') NOT IN ('SEGUNDO_CURSO', 'BANDA', 'BOLSISTA_INT', 'BOLSISTA_PARC')
      AND coalesce(tm.conta_como_pagante, true) = true
    ) AS is_matricula_comercial_principal,
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.aluno_id = a.id
         OR l.id = a.lead_origem_id
    ) AS tem_lead_vinculado
  FROM public.alunos a
  CROSS JOIN periodo p
  LEFT JOIN public.cursos c ON c.id = a.curso_id
  LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.data_matricula >= p.inicio::date
    AND a.data_matricula < p.fim_exclusivo::date
    AND a.arquivado_em IS NULL
    AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
),
matriculas_agg AS (
  SELECT
    unidade_id,
    count(*)::int AS matriculas_academicas,
    count(*) FILTER (WHERE is_matricula_comercial_principal)::int AS matriculas_comerciais_principais,
    count(*) FILTER (WHERE is_matricula_comercial_principal AND tem_lead_vinculado)::int AS conversoes_de_lead,
    count(*) FILTER (WHERE is_matricula_comercial_principal AND NOT tem_lead_vinculado)::int AS matriculas_sem_lead_vinculado,
    coalesce(sum(valor_passaporte) FILTER (WHERE is_matricula_comercial_principal), 0)::numeric AS passaportes_total
  FROM matriculas_base
  GROUP BY unidade_id
),
base AS (
  SELECT
    ua.unidade_id,
    ua.unidade_nome,
    coalesce(lb.leads_entrantes, 0)::int AS leads_entrantes,
    coalesce(lb.linhas_leads, 0)::int AS linhas_leads,
    coalesce(ea.experimentais_agendadas_periodo, 0)::int AS experimentais_agendadas_periodo,
    coalesce(er.experimentais_realizadas_presenca_confirmada, 0)::int AS experimentais_realizadas_presenca_confirmada,
    coalesce(er.experimentais_realizadas_status_operacional, 0)::int AS experimentais_realizadas_status_operacional,
    coalesce(er.experimentais_realizadas_status_operacional_sem_presenca, 0)::int AS experimentais_realizadas_status_operacional_sem_presenca,
    coalesce(er.experimentais_no_show, 0)::int AS experimentais_no_show,
    coalesce(er.experimentais_canceladas, 0)::int AS experimentais_canceladas,
    coalesce(vb.visitas, 0)::int AS visitas,
    coalesce(ma.matriculas_academicas, 0)::int AS matriculas_academicas,
    coalesce(ma.matriculas_comerciais_principais, 0)::int AS matriculas_comerciais_principais,
    coalesce(ma.conversoes_de_lead, 0)::int AS conversoes_de_lead,
    coalesce(ma.matriculas_sem_lead_vinculado, 0)::int AS matriculas_sem_lead_vinculado,
    coalesce(ma.passaportes_total, 0)::numeric AS passaportes_total
  FROM unidades_alvo ua
  LEFT JOIN leads_base lb ON lb.unidade_id = ua.unidade_id
  LEFT JOIN exp_agendadas ea ON ea.unidade_id = ua.unidade_id
  LEFT JOIN exp_realizadas er ON er.unidade_id = ua.unidade_id
  LEFT JOIN visitas_base vb ON vb.unidade_id = ua.unidade_id
  LEFT JOIN matriculas_agg ma ON ma.unidade_id = ua.unidade_id
),
consolidado AS (
  SELECT
    NULL::uuid AS unidade_id,
    'Consolidado'::text AS unidade_nome,
    sum(leads_entrantes)::int AS leads_entrantes,
    sum(linhas_leads)::int AS linhas_leads,
    sum(experimentais_agendadas_periodo)::int AS experimentais_agendadas_periodo,
    sum(experimentais_realizadas_presenca_confirmada)::int AS experimentais_realizadas_presenca_confirmada,
    sum(experimentais_realizadas_status_operacional)::int AS experimentais_realizadas_status_operacional,
    sum(experimentais_realizadas_status_operacional_sem_presenca)::int AS experimentais_realizadas_status_operacional_sem_presenca,
    sum(experimentais_no_show)::int AS experimentais_no_show,
    sum(experimentais_canceladas)::int AS experimentais_canceladas,
    sum(visitas)::int AS visitas,
    sum(matriculas_academicas)::int AS matriculas_academicas,
    sum(matriculas_comerciais_principais)::int AS matriculas_comerciais_principais,
    sum(conversoes_de_lead)::int AS conversoes_de_lead,
    sum(matriculas_sem_lead_vinculado)::int AS matriculas_sem_lead_vinculado,
    sum(passaportes_total)::numeric AS passaportes_total
  FROM base
),
resumo AS (
  SELECT * FROM base WHERE p_unidade_id IS NOT NULL
  UNION ALL
  SELECT * FROM consolidado WHERE p_unidade_id IS NULL
),
origem_canal AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'canal', canal,
             'leads', leads,
             'matriculas_comerciais_principais', matriculas_comerciais_principais,
             'leads_convertidos_operacional', leads_convertidos_operacional
           )
           ORDER BY leads DESC, matriculas_comerciais_principais DESC, canal
         ) AS payload
  FROM (
    SELECT
      coalesce(co.nome, 'Sem canal') AS canal,
      sum(coalesce(l.quantidade, 1))::int AS leads,
      count(*) FILTER (WHERE l.converteu = true OR l.status IN ('convertido', 'matriculado') OR l.aluno_id IS NOT NULL)::int AS leads_convertidos_operacional,
      0::int AS matriculas_comerciais_principais
    FROM public.leads l
    CROSS JOIN periodo p
    LEFT JOIN public.canais_origem co ON co.id = l.canal_origem_id
    WHERE l.data_contato >= p.inicio::date
      AND l.data_contato < p.fim_exclusivo::date
      AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
    GROUP BY coalesce(co.nome, 'Sem canal')
    ORDER BY 2 DESC, 1
    LIMIT 15
  ) x
),
cursos_mais_procurados AS (
  SELECT jsonb_agg(
           jsonb_build_object('curso', curso, 'leads', leads, 'matriculas_comerciais_principais', matriculas_comerciais_principais)
           ORDER BY leads DESC, matriculas_comerciais_principais DESC, curso
         ) AS payload
  FROM (
    SELECT coalesce(c.nome, 'Sem curso') AS curso,
           sum(coalesce(l.quantidade, 1))::int AS leads,
           0::int AS matriculas_comerciais_principais
    FROM public.leads l
    CROSS JOIN periodo p
    LEFT JOIN public.cursos c ON c.id = l.curso_interesse_id
    WHERE l.data_contato >= p.inicio::date
      AND l.data_contato < p.fim_exclusivo::date
      AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
    GROUP BY coalesce(c.nome, 'Sem curso')
    ORDER BY 2 DESC, 1
    LIMIT 15
  ) x
)
SELECT jsonb_build_object(
  'fonte', 'comercial_v2_transacional',
  'versao', 'p02e1-producao-final',
  'ambiente_esperado', 'producao',
  'legado_apenas_diagnostico', true,
  'periodo', jsonb_build_object(
    'tipo', (SELECT tipo FROM periodo),
    'ano', p_ano,
    'mes', p_mes,
    'data_referencia', (SELECT data_referencia FROM periodo),
    'inicio', (SELECT inicio FROM periodo),
    'fim_exclusivo', (SELECT fim_exclusivo FROM periodo)
  ),
  'escopo', jsonb_build_object(
    'unidade_id', (SELECT unidade_id FROM resumo LIMIT 1),
    'unidade_nome', (SELECT unidade_nome FROM resumo LIMIT 1),
    'consolidado', p_unidade_id IS NULL
  ),
  'kpis', (
    SELECT jsonb_build_object(
      'leads_entrantes', leads_entrantes,
      'linhas_leads', linhas_leads,
      'experimentais_agendadas_periodo', experimentais_agendadas_periodo,
      'experimentais_realizadas_presenca_confirmada', experimentais_realizadas_presenca_confirmada,
      'experimentais_realizadas_status_operacional', experimentais_realizadas_status_operacional,
      'experimentais_realizadas_status_operacional_sem_presenca', experimentais_realizadas_status_operacional_sem_presenca,
      'experimentais_no_show', experimentais_no_show,
      'experimentais_canceladas', experimentais_canceladas,
      'visitas', visitas,
      'matriculas_academicas', matriculas_academicas,
      'matriculas_comerciais_principais', matriculas_comerciais_principais,
      'conversoes_de_lead', conversoes_de_lead,
      'matriculas_sem_lead_vinculado', matriculas_sem_lead_vinculado,
      'passaportes_total', passaportes_total,
      'ticket_medio_passaporte', CASE WHEN matriculas_comerciais_principais > 0 THEN round(passaportes_total / matriculas_comerciais_principais, 2) ELSE 0 END,
      'taxa_lead_matricula', CASE WHEN leads_entrantes > 0 THEN round(conversoes_de_lead::numeric / leads_entrantes * 100, 2) ELSE 0 END,
      'taxa_exp_para_matricula_presenca_confirmada_diagnostica', CASE WHEN experimentais_realizadas_presenca_confirmada > 0 THEN round(conversoes_de_lead::numeric / experimentais_realizadas_presenca_confirmada * 100, 2) ELSE NULL END
    )
    FROM resumo
    LIMIT 1
  ),
  'origem_canal', coalesce((SELECT payload FROM origem_canal), '[]'::jsonb),
  'cursos_mais_procurados', coalesce((SELECT payload FROM cursos_mais_procurados), '[]'::jsonb),
  'gaps', (
    SELECT jsonb_build_object(
      'experimental_status_realizada_sem_presenca', experimentais_realizadas_status_operacional_sem_presenca,
      'matriculas_sem_lead_vinculado', matriculas_sem_lead_vinculado,
      'alertas', CASE
        WHEN experimentais_realizadas_status_operacional_sem_presenca > 0 THEN jsonb_build_array('Ha experimentais com status realizada/convertido sem presenca individual confirmada.')
        ELSE '[]'::jsonb
      END
    )
    FROM resumo
    LIMIT 1
  ),
  'por_unidade', CASE
    WHEN p_unidade_id IS NULL THEN (
      SELECT jsonb_agg(
        jsonb_build_object(
          'unidade_id', unidade_id,
          'unidade_nome', unidade_nome,
          'leads_entrantes', leads_entrantes,
          'experimentais_realizadas_presenca_confirmada', experimentais_realizadas_presenca_confirmada,
          'experimentais_realizadas_status_operacional', experimentais_realizadas_status_operacional,
          'matriculas_comerciais_principais', matriculas_comerciais_principais,
          'conversoes_de_lead', conversoes_de_lead,
          'experimentais_realizadas_status_operacional_sem_presenca', experimentais_realizadas_status_operacional_sem_presenca
        )
        ORDER BY unidade_nome
      )
      FROM base
    )
    ELSE NULL
  END
)
FROM periodo;
$$;

COMMENT ON FUNCTION public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date)
IS 'P0.2E.1 producao: fonte comercial canonica v2 transacional. Nao usa dados_comerciais/origem_leads como verdade.';

GRANT EXECUTE ON FUNCTION public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date)
TO authenticated, service_role;
