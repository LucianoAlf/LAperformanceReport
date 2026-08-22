-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- REVERTER: Os 12 alunos que mudei para aviso_previo devem voltar para ativo
-- Eles são alunos ativos que AVISARAM que vão sair em março
-- O status aviso_previo não deve ser usado assim - deve ser um campo separado

UPDATE alunos SET status = 'ativo', updated_at = NOW()
WHERE id IN (712, 716, 718, 723, 737, 749, 776, 779, 792, 812, 864, 911);
