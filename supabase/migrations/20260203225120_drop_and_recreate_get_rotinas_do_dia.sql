-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Drop e recriar função get_rotinas_do_dia com nome do responsável
DROP FUNCTION IF EXISTS public.get_rotinas_do_dia(integer, date);

CREATE OR REPLACE FUNCTION public.get_rotinas_do_dia(
  p_colaborador_id integer, 
  p_data date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  rotina_id uuid, 
  descricao character varying, 
  frequencia character varying, 
  prioridade character varying, 
  concluida boolean, 
  execucao_id uuid,
  responsavel_nome character varying,
  responsavel_apelido character varying
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as rotina_id,
    r.descricao,
    r.frequencia,
    r.prioridade,
    COALESCE(e.concluida, false) as concluida,
    e.id as execucao_id,
    c.nome as responsavel_nome,
    c.apelido as responsavel_apelido
  FROM farmer_rotinas r
  LEFT JOIN farmer_rotinas_execucao e ON e.rotina_id = r.id AND e.data_execucao = p_data
  LEFT JOIN colaboradores c ON c.id = r.colaborador_id
  WHERE r.colaborador_id = p_colaborador_id
    AND r.ativo = true
    AND (
      -- Diário: sempre aparece
      r.frequencia = 'diario'
      OR
      -- Semanal: aparece no dia da semana configurado (1=seg, 7=dom)
      (r.frequencia = 'semanal' AND EXTRACT(ISODOW FROM p_data)::INTEGER = ANY(r.dias_semana))
      OR
      -- Mensal: aparece no dia do mês configurado
      (r.frequencia = 'mensal' AND EXTRACT(DAY FROM p_data)::INTEGER = r.dia_mes)
    )
  ORDER BY 
    CASE r.prioridade WHEN 'alta' THEN 0 ELSE 1 END,
    r.descricao;
END;
$function$;
