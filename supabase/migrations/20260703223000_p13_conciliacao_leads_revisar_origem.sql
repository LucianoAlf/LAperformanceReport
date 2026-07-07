-- P13: permite revisar origem de lead ja preenchida na conciliacao comercial.
-- Mantem a fonte canonica em public.leads e reaproveita a RPC auditada de correcao.

CREATE OR REPLACE FUNCTION public.get_conciliacao_leads_qualidade_v1(
  p_unidade_id uuid DEFAULT NULL,
  p_ano integer DEFAULT EXTRACT(YEAR FROM now())::integer,
  p_mes integer DEFAULT EXTRACT(MONTH FROM now())::integer,
  p_tipo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH periodo AS (
  SELECT
    make_date(p_ano, p_mes, 1) AS data_inicio,
    (make_date(p_ano, p_mes, 1) + interval '1 month')::date AS data_fim
),
base AS (
  SELECT
    l.id,
    l.unidade_id,
    u.nome AS unidade_nome,
    u.codigo AS unidade_codigo,
    l.nome,
    l.telefone,
    l.email,
    l.data_contato,
    l.status,
    COALESCE(l.quantidade, 1) AS quantidade,
    l.canal_origem_id,
    co.nome AS canal_origem_nome,
    l.curso_interesse_id,
    c.nome AS curso_interesse_nome,
    l.observacoes,
    l.created_at,
    l.updated_at
  FROM public.leads l
  JOIN periodo p ON l.data_contato >= p.data_inicio AND l.data_contato < p.data_fim
  LEFT JOIN public.unidades u ON u.id = l.unidade_id
  LEFT JOIN public.canais_origem co ON co.id = l.canal_origem_id
  LEFT JOIN public.cursos c ON c.id = l.curso_interesse_id
  WHERE (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
),
pendencias AS (
  SELECT
    b.*,
    'origem_pendente'::text AS tipo,
    'canal_origem_id'::text AS campo,
    'Origem pendente'::text AS tipo_label,
    'Escolher canal de origem para o relatorio comercial.'::text AS descricao
  FROM base b
  WHERE b.canal_origem_id IS NULL

  UNION ALL

  SELECT
    b.*,
    'curso_pendente'::text AS tipo,
    'curso_interesse_id'::text AS campo,
    'Curso pendente'::text AS tipo_label,
    'Escolher curso de interesse para o relatorio comercial.'::text AS descricao
  FROM base b
  WHERE b.curso_interesse_id IS NULL

  UNION ALL

  SELECT
    b.*,
    'origem_revisao'::text AS tipo,
    'canal_origem_id'::text AS campo,
    'Revisar origem'::text AS tipo_label,
    'Conferir e ajustar canal de origem quando a equipe identificar divergencia.'::text AS descricao
  FROM base b
  WHERE b.canal_origem_id IS NOT NULL
    AND p_tipo in ('origem_revisao', 'revisar_origem')
),
filtradas AS (
  SELECT *
  FROM pendencias p
  WHERE p_tipo IS NULL
     OR p_tipo = ''
     OR p_tipo = 'todos'
     OR p_tipo = p.tipo
     OR p_tipo = p.campo
),
resumo_base AS (
  SELECT
    COALESCE(SUM(quantidade), 0)::integer AS leads_total,
    COUNT(*)::integer AS linhas_leads,
    COUNT(*) FILTER (WHERE canal_origem_id IS NULL)::integer AS leads_sem_origem,
    COUNT(*) FILTER (WHERE curso_interesse_id IS NULL)::integer AS leads_sem_curso,
    COALESCE(SUM(quantidade) FILTER (WHERE canal_origem_id IS NULL), 0)::integer AS impacto_sem_origem,
    COALESCE(SUM(quantidade) FILTER (WHERE curso_interesse_id IS NULL), 0)::integer AS impacto_sem_curso
  FROM base
),
resumo_fila AS (
  SELECT
    COUNT(*)::integer AS tarefas_total,
    COUNT(DISTINCT id)::integer AS leads_com_pendencia,
    COUNT(*) FILTER (WHERE campo = 'canal_origem_id' AND tipo = 'origem_pendente')::integer AS origem_pendente,
    COUNT(*) FILTER (WHERE campo = 'curso_interesse_id')::integer AS curso_pendente,
    COUNT(*) FILTER (WHERE tipo = 'origem_revisao')::integer AS origem_revisao
  FROM filtradas
),
items AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'lead_id', id,
        'unidade_id', unidade_id,
        'unidade_nome', unidade_nome,
        'unidade_codigo', unidade_codigo,
        'nome', nome,
        'telefone', telefone,
        'email', email,
        'data_contato', data_contato,
        'status', status,
        'quantidade', quantidade,
        'tipo', tipo,
        'campo', campo,
        'tipo_label', tipo_label,
        'descricao', descricao,
        'canal_origem_id', canal_origem_id,
        'canal_origem_nome', canal_origem_nome,
        'curso_interesse_id', curso_interesse_id,
        'curso_interesse_nome', curso_interesse_nome,
        'observacoes', observacoes,
        'updated_at', updated_at
      )
      ORDER BY data_contato DESC, nome ASC NULLS LAST, campo ASC
    ),
    '[]'::jsonb
  ) AS data
  FROM filtradas
)
SELECT jsonb_build_object(
  'resumo',
  jsonb_build_object(
    'leads_total', rb.leads_total,
    'linhas_leads', rb.linhas_leads,
    'leads_sem_origem', rb.leads_sem_origem,
    'leads_sem_curso', rb.leads_sem_curso,
    'impacto_sem_origem', rb.impacto_sem_origem,
    'impacto_sem_curso', rb.impacto_sem_curso,
    'tarefas_total', rf.tarefas_total,
    'leads_com_pendencia', rf.leads_com_pendencia,
    'origem_pendente', rf.origem_pendente,
    'curso_pendente', rf.curso_pendente,
    'origem_revisao', rf.origem_revisao
  ),
  'items',
  i.data
)
FROM resumo_base rb
CROSS JOIN resumo_fila rf
CROSS JOIN items i;
$function$;

GRANT EXECUTE ON FUNCTION public.get_conciliacao_leads_qualidade_v1(uuid, integer, integer, text) TO authenticated;

COMMENT ON FUNCTION public.get_conciliacao_leads_qualidade_v1(uuid, integer, integer, text)
  IS 'Lista pendencias de qualidade de leads e, sob filtro explicito, permite revisar origem ja preenchida que afeta relatorios comerciais.';
