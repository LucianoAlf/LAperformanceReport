-- P11: conciliacao de qualidade de leads para fechamento comercial.
-- Objetivo: listar origem/curso ausentes e permitir correcao auditada via RPC.
-- Nao cria base canonica paralela: a fonte continua sendo public.leads.

CREATE TABLE IF NOT EXISTS public.lead_conciliacao_decisoes (
  id bigserial PRIMARY KEY,
  lead_id integer NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campo text NOT NULL CHECK (campo IN ('canal_origem_id', 'curso_interesse_id')),
  decisao text NOT NULL DEFAULT 'definir_manual'
    CHECK (decisao IN ('definir_manual', 'revisar')),
  valor_anterior jsonb NOT NULL DEFAULT '{}'::jsonb,
  valor_aplicado jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text,
  decidido_por text NOT NULL DEFAULT 'usuario_app',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_conciliacao_decisoes_lead
  ON public.lead_conciliacao_decisoes (lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_conciliacao_decisoes_campo_created
  ON public.lead_conciliacao_decisoes (campo, created_at DESC);

ALTER TABLE public.lead_conciliacao_decisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_conciliacao_decisoes_select_auth
  ON public.lead_conciliacao_decisoes;

CREATE POLICY lead_conciliacao_decisoes_select_auth
  ON public.lead_conciliacao_decisoes
  FOR SELECT
  TO authenticated
  USING (true);

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
    COUNT(*) FILTER (WHERE campo = 'canal_origem_id')::integer AS origem_pendente,
    COUNT(*) FILTER (WHERE campo = 'curso_interesse_id')::integer AS curso_pendente
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
    'curso_pendente', rf.curso_pendente
  ),
  'items',
  i.data
)
FROM resumo_base rb
CROSS JOIN resumo_fila rf
CROSS JOIN items i;
$function$;

CREATE OR REPLACE FUNCTION public.resolver_conciliacao_lead_qualidade(
  p_lead_id integer,
  p_campo text,
  p_valor_id integer,
  p_decidido_por text DEFAULT 'usuario_app',
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_agora timestamptz := now();
  v_valor_anterior jsonb;
  v_valor_aplicado jsonb;
  v_nome_anterior text;
  v_nome_aplicado text;
BEGIN
  IF p_campo NOT IN ('canal_origem_id', 'curso_interesse_id') THEN
    RAISE EXCEPTION 'campo % nao permitido na conciliacao de leads', p_campo;
  END IF;

  SELECT *
    INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead % nao encontrado', p_lead_id;
  END IF;

  IF p_campo = 'canal_origem_id' THEN
    SELECT nome INTO v_nome_aplicado
    FROM public.canais_origem
    WHERE id = p_valor_id
      AND COALESCE(ativo, true) IS TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'canal de origem % nao encontrado ou inativo', p_valor_id;
    END IF;

    SELECT nome INTO v_nome_anterior
    FROM public.canais_origem
    WHERE id = v_lead.canal_origem_id;

    v_valor_anterior := jsonb_build_object(
      'canal_origem_id', v_lead.canal_origem_id,
      'canal_origem', v_nome_anterior
    );
    v_valor_aplicado := jsonb_build_object(
      'canal_origem_id', p_valor_id,
      'canal_origem', v_nome_aplicado
    );

    UPDATE public.leads
    SET canal_origem_id = p_valor_id,
        updated_at = v_agora
    WHERE id = p_lead_id;
  ELSE
    SELECT nome INTO v_nome_aplicado
    FROM public.cursos
    WHERE id = p_valor_id
      AND COALESCE(ativo, true) IS TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'curso % nao encontrado ou inativo', p_valor_id;
    END IF;

    SELECT nome INTO v_nome_anterior
    FROM public.cursos
    WHERE id = v_lead.curso_interesse_id;

    v_valor_anterior := jsonb_build_object(
      'curso_interesse_id', v_lead.curso_interesse_id,
      'curso_interesse', v_nome_anterior
    );
    v_valor_aplicado := jsonb_build_object(
      'curso_interesse_id', p_valor_id,
      'curso_interesse', v_nome_aplicado
    );

    UPDATE public.leads
    SET curso_interesse_id = p_valor_id,
        updated_at = v_agora
    WHERE id = p_lead_id;
  END IF;

  INSERT INTO public.lead_conciliacao_decisoes
    (lead_id, campo, decisao, valor_anterior, valor_aplicado, motivo, decidido_por, metadata)
  VALUES
    (
      p_lead_id,
      p_campo,
      'definir_manual',
      v_valor_anterior,
      v_valor_aplicado,
      COALESCE(NULLIF(trim(p_motivo), ''), 'Conciliacao de qualidade de leads'),
      COALESCE(NULLIF(trim(p_decidido_por), ''), 'usuario_app'),
      jsonb_build_object(
        'origem', 'comercial_conciliacao_leads',
        'unidade_id', v_lead.unidade_id,
        'data_contato', v_lead.data_contato,
        'status', v_lead.status,
        'quantidade', COALESCE(v_lead.quantidade, 1)
      )
    );

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', p_lead_id,
    'campo', p_campo,
    'valor_aplicado', v_valor_aplicado,
    'decisao', 'definir_manual'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_conciliacao_leads_qualidade_v1(uuid, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_conciliacao_lead_qualidade(integer, text, integer, text, text) TO authenticated;

COMMENT ON FUNCTION public.get_conciliacao_leads_qualidade_v1(uuid, integer, integer, text)
  IS 'Lista pendencias de qualidade de leads que afetam relatorios comerciais: origem e curso de interesse ausentes.';

COMMENT ON FUNCTION public.resolver_conciliacao_lead_qualidade(integer, text, integer, text, text)
  IS 'Corrige origem ou curso de interesse de um lead via decisao auditada, sem update direto pela UI.';
