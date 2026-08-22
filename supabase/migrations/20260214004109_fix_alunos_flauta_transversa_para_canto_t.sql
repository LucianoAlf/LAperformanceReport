-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Correção: 130 alunos importados do Emusys com curso_id=37 (Flauta Transversa)
-- que na verdade são alunos de Canto T (curso_id=6).
-- Causa: script gerar_sql_importacao.js usava IDs sequenciais que não correspondiam
-- aos IDs reais dos cursos no banco de dados.
-- Evidências:
--   1. Nenhum professor em nenhuma unidade leciona Flauta Transversa
--   2. Arthur (ADM Barra) confirmou que alunos de Canto aparecem como Flauta Transversal
--   3. 128/130 alunos têm data_matricula anterior a 2026 (importação original)
--   4. Arthur já corrigiu manualmente alguns para Canto T

UPDATE alunos
SET curso_id = 6  -- Canto T
WHERE curso_id = 37  -- Flauta Transversa
  AND status IN ('ativo', 'trancado', 'inativo', 'cancelado');
