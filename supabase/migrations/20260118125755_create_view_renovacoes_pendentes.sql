-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- View de renovações pendentes por mês
CREATE OR REPLACE VIEW vw_renovacoes_pendentes AS
SELECT 
  a.unidade_id,
  u.nome as unidade_nome,
  DATE_TRUNC('month', a.data_fim_contrato)::date as mes_vencimento,
  COUNT(*) as total_vencendo,
  COUNT(*) FILTER (WHERE r.status = 'realizada') as renovadas,
  COUNT(*) FILTER (WHERE r.status = 'nao_renovada') as nao_renovadas,
  COUNT(*) FILTER (WHERE r.id IS NULL AND a.data_fim_contrato >= CURRENT_DATE) as pendentes,
  COUNT(*) FILTER (WHERE r.id IS NULL AND a.data_fim_contrato < CURRENT_DATE) as atrasadas
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN renovacoes r ON a.id = r.aluno_id
WHERE a.status = 'ativo'
AND a.data_fim_contrato >= CURRENT_DATE - INTERVAL '60 days'
AND a.data_fim_contrato <= CURRENT_DATE + INTERVAL '60 days'
GROUP BY a.unidade_id, u.nome, DATE_TRUNC('month', a.data_fim_contrato)
ORDER BY mes_vencimento;

COMMENT ON VIEW vw_renovacoes_pendentes IS 'Renovações pendentes, atrasadas e realizadas por mês e unidade';
