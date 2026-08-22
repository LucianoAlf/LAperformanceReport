-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =============================================
-- HABILITAR RLS E CRIAR POLICIES PARA TABELAS UNRESTRICTED
-- =============================================

-- 1. alunos_historico
ALTER TABLE alunos_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alunos_historico_select ON alunos_historico;
CREATE POLICY alunos_historico_select ON alunos_historico FOR SELECT USING (true);
DROP POLICY IF EXISTS alunos_historico_insert ON alunos_historico;
CREATE POLICY alunos_historico_insert ON alunos_historico FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS alunos_historico_update ON alunos_historico;
CREATE POLICY alunos_historico_update ON alunos_historico FOR UPDATE USING (true);
DROP POLICY IF EXISTS alunos_historico_delete ON alunos_historico;
CREATE POLICY alunos_historico_delete ON alunos_historico FOR DELETE USING (true);

-- 2. cursos_matriculados
ALTER TABLE cursos_matriculados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cursos_matriculados_select ON cursos_matriculados;
CREATE POLICY cursos_matriculados_select ON cursos_matriculados FOR SELECT USING (true);
DROP POLICY IF EXISTS cursos_matriculados_insert ON cursos_matriculados;
CREATE POLICY cursos_matriculados_insert ON cursos_matriculados FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS cursos_matriculados_update ON cursos_matriculados;
CREATE POLICY cursos_matriculados_update ON cursos_matriculados FOR UPDATE USING (true);
DROP POLICY IF EXISTS cursos_matriculados_delete ON cursos_matriculados;
CREATE POLICY cursos_matriculados_delete ON cursos_matriculados FOR DELETE USING (true);

-- 3. dados_comerciais
ALTER TABLE dados_comerciais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dados_comerciais_select ON dados_comerciais;
CREATE POLICY dados_comerciais_select ON dados_comerciais FOR SELECT USING (true);
DROP POLICY IF EXISTS dados_comerciais_insert ON dados_comerciais;
CREATE POLICY dados_comerciais_insert ON dados_comerciais FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS dados_comerciais_update ON dados_comerciais;
CREATE POLICY dados_comerciais_update ON dados_comerciais FOR UPDATE USING (true);
DROP POLICY IF EXISTS dados_comerciais_delete ON dados_comerciais;
CREATE POLICY dados_comerciais_delete ON dados_comerciais FOR DELETE USING (true);

-- 4. experimentais_mensal_unidade
ALTER TABLE experimentais_mensal_unidade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS experimentais_mensal_unidade_select ON experimentais_mensal_unidade;
CREATE POLICY experimentais_mensal_unidade_select ON experimentais_mensal_unidade FOR SELECT USING (true);
DROP POLICY IF EXISTS experimentais_mensal_unidade_insert ON experimentais_mensal_unidade;
CREATE POLICY experimentais_mensal_unidade_insert ON experimentais_mensal_unidade FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS experimentais_mensal_unidade_update ON experimentais_mensal_unidade;
CREATE POLICY experimentais_mensal_unidade_update ON experimentais_mensal_unidade FOR UPDATE USING (true);
DROP POLICY IF EXISTS experimentais_mensal_unidade_delete ON experimentais_mensal_unidade;
CREATE POLICY experimentais_mensal_unidade_delete ON experimentais_mensal_unidade FOR DELETE USING (true);

-- 5. experimentais_professor_mensal
ALTER TABLE experimentais_professor_mensal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS experimentais_professor_mensal_select ON experimentais_professor_mensal;
CREATE POLICY experimentais_professor_mensal_select ON experimentais_professor_mensal FOR SELECT USING (true);
DROP POLICY IF EXISTS experimentais_professor_mensal_insert ON experimentais_professor_mensal;
CREATE POLICY experimentais_professor_mensal_insert ON experimentais_professor_mensal FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS experimentais_professor_mensal_update ON experimentais_professor_mensal;
CREATE POLICY experimentais_professor_mensal_update ON experimentais_professor_mensal FOR UPDATE USING (true);
DROP POLICY IF EXISTS experimentais_professor_mensal_delete ON experimentais_professor_mensal;
CREATE POLICY experimentais_professor_mensal_delete ON experimentais_professor_mensal FOR DELETE USING (true);

-- 6. formas_pagamento
ALTER TABLE formas_pagamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS formas_pagamento_select ON formas_pagamento;
CREATE POLICY formas_pagamento_select ON formas_pagamento FOR SELECT USING (true);
DROP POLICY IF EXISTS formas_pagamento_insert ON formas_pagamento;
CREATE POLICY formas_pagamento_insert ON formas_pagamento FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS formas_pagamento_update ON formas_pagamento;
CREATE POLICY formas_pagamento_update ON formas_pagamento FOR UPDATE USING (true);
DROP POLICY IF EXISTS formas_pagamento_delete ON formas_pagamento;
CREATE POLICY formas_pagamento_delete ON formas_pagamento FOR DELETE USING (true);

-- 7. metas_comerciais
ALTER TABLE metas_comerciais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS metas_comerciais_select ON metas_comerciais;
CREATE POLICY metas_comerciais_select ON metas_comerciais FOR SELECT USING (true);
DROP POLICY IF EXISTS metas_comerciais_insert ON metas_comerciais;
CREATE POLICY metas_comerciais_insert ON metas_comerciais FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS metas_comerciais_update ON metas_comerciais;
CREATE POLICY metas_comerciais_update ON metas_comerciais FOR UPDATE USING (true);
DROP POLICY IF EXISTS metas_comerciais_delete ON metas_comerciais;
CREATE POLICY metas_comerciais_delete ON metas_comerciais FOR DELETE USING (true);
