-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


DROP FUNCTION IF EXISTS get_checklist_detail(uuid);

CREATE OR REPLACE FUNCTION get_checklist_detail(p_checklist_id uuid)
RETURNS TABLE(
  checklist_id uuid,
  titulo varchar,
  descricao text,
  tipo varchar,
  periodicidade varchar,
  departamento varchar,
  tipo_vinculo varchar,
  filtro_vinculo jsonb,
  data_inicio date,
  data_prazo date,
  prioridade varchar,
  status varchar,
  lembrete_whatsapp boolean,
  alerta_dias_antes integer,
  alerta_hora time,
  colaborador_id integer,
  colaborador_nome varchar,
  colaborador_apelido varchar,
  unidade_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    c.created_at
  FROM farmer_checklists c
  LEFT JOIN colaboradores col ON col.id = c.colaborador_id
  WHERE c.id = p_checklist_id;
END;
$$;
