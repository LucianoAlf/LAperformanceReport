-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Dropar e recriar a função com campos do responsável
DROP FUNCTION IF EXISTS public.get_checklist_detail(uuid);

CREATE OR REPLACE FUNCTION public.get_checklist_detail(p_checklist_id uuid)
RETURNS TABLE(
  checklist_id uuid,
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
  colaborador_id integer,
  colaborador_nome character varying,
  colaborador_apelido character varying,
  unidade_id uuid,
  created_at timestamp with time zone,
  responsavel_id integer,
  responsavel_nome character varying,
  responsavel_apelido text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as checklist_id,
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
    c.colaborador_id,
    col.nome as colaborador_nome,
    col.apelido as colaborador_apelido,
    c.unidade_id,
    c.created_at,
    c.responsavel_id,
    resp.nome as responsavel_nome,
    resp.apelido as responsavel_apelido
  FROM farmer_checklists c
  LEFT JOIN colaboradores col ON col.id = c.colaborador_id
  LEFT JOIN usuarios resp ON resp.id = c.responsavel_id
  WHERE c.id = p_checklist_id;
END;
$function$;
