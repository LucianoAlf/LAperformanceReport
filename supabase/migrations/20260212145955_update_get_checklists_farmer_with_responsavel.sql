-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


DROP FUNCTION IF EXISTS public.get_checklists_farmer(integer, uuid, text);

CREATE OR REPLACE FUNCTION public.get_checklists_farmer(
  p_colaborador_id integer DEFAULT NULL,
  p_unidade_id uuid DEFAULT NULL,
  p_status text DEFAULT 'ativo'
)
RETURNS TABLE(
  id uuid,
  titulo character varying,
  descricao text,
  tipo character varying,
  periodicidade character varying,
  departamento character varying,
  tipo_vinculo character varying,
  filtro_vinculo jsonb,
  data_inicio date,
  data_prazo date,
  prioridade character varying,
  status character varying,
  lembrete_whatsapp boolean,
  alerta_dias_antes integer,
  alerta_hora time without time zone,
  total_items integer,
  items_concluidos integer,
  percentual_progresso numeric,
  total_contatos integer,
  contatos_responderam integer,
  taxa_sucesso numeric,
  canais_resumo jsonb,
  created_at timestamp with time zone,
  colaborador_nome character varying,
  colaborador_apelido character varying,
  responsavel_id integer,
  responsavel_nome character varying,
  responsavel_apelido text
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.titulo,
    c.descricao,
    c.tipo,
    c.periodicidade,
    c.departamento,
    c.tipo_vinculo,
    c.filtro_vinculo,
    c.data_inicio,
    c.data_prazo,
    c.prioridade,
    c.status,
    c.lembrete_whatsapp,
    c.alerta_dias_antes,
    c.alerta_hora,
    COUNT(DISTINCT ci.id)::INTEGER as total_items,
    COUNT(DISTINCT ci.id) FILTER (WHERE ci.concluida = true)::INTEGER as items_concluidos,
    CASE 
      WHEN COUNT(DISTINCT ci.id) > 0 
      THEN ROUND((COUNT(DISTINCT ci.id) FILTER (WHERE ci.concluida = true)::NUMERIC / COUNT(DISTINCT ci.id)) * 100, 0)
      ELSE 0 
    END as percentual_progresso,
    COUNT(DISTINCT cc.id)::INTEGER as total_contatos,
    COUNT(DISTINCT cc.id) FILTER (WHERE cc.status = 'respondeu')::INTEGER as contatos_responderam,
    CASE 
      WHEN COUNT(DISTINCT cc.id) > 0 
      THEN ROUND((COUNT(DISTINCT cc.id) FILTER (WHERE cc.status = 'respondeu')::NUMERIC / COUNT(DISTINCT cc.id)) * 100, 0)
      ELSE 0 
    END as taxa_sucesso,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'canal', sub.canal_contato,
        'total', sub.cnt,
        'responderam', sub.resp,
        'pct', CASE WHEN sub.cnt > 0 THEN ROUND((sub.resp::NUMERIC / sub.cnt) * 100, 0) ELSE 0 END
      ) ORDER BY sub.cnt DESC)
      FROM (
        SELECT cc2.canal_contato, COUNT(*) as cnt, COUNT(*) FILTER (WHERE cc2.status = 'respondeu') as resp
        FROM farmer_checklist_contatos cc2
        WHERE cc2.checklist_id = c.id AND cc2.canal_contato IS NOT NULL
        GROUP BY cc2.canal_contato
      ) sub),
      '[]'::jsonb
    ) as canais_resumo,
    c.created_at,
    col.nome as colaborador_nome,
    col.apelido as colaborador_apelido,
    c.responsavel_id,
    resp.nome as responsavel_nome,
    resp.apelido as responsavel_apelido
  FROM farmer_checklists c
  LEFT JOIN farmer_checklist_items ci ON ci.checklist_id = c.id
  LEFT JOIN farmer_checklist_contatos cc ON cc.checklist_id = c.id
  LEFT JOIN colaboradores col ON col.id = c.colaborador_id
  LEFT JOIN usuarios resp ON resp.id = c.responsavel_id
  WHERE c.ativo = true
    AND (p_status = 'todos' OR c.status = p_status)
    AND (
      p_unidade_id IS NULL 
      OR p_unidade_id::TEXT = 'todos'
      OR c.unidade_id = p_unidade_id
    )
    AND (
      p_colaborador_id IS NULL 
      OR c.colaborador_id = p_colaborador_id
    )
  GROUP BY c.id, c.titulo, c.descricao, c.tipo, c.periodicidade, c.departamento,
           c.tipo_vinculo, c.filtro_vinculo, c.data_inicio, c.data_prazo, 
           c.prioridade, c.status, c.lembrete_whatsapp, c.alerta_dias_antes, c.alerta_hora,
           c.created_at, col.nome, col.apelido, c.responsavel_id, resp.nome, resp.apelido
  ORDER BY 
    CASE c.status WHEN 'ativo' THEN 0 WHEN 'concluido' THEN 1 ELSE 2 END,
    CASE c.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
    c.data_prazo ASC NULLS LAST,
    c.created_at DESC;
END;
$function$;
