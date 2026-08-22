-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Correcao de seguranca (disclosure 2026-07-07): remover acesso anonimo (anon/public)
-- a tabelas internas. Principio: preservar exatamente o comportamento de usuarios
-- autenticados; apenas tirar o alcance do role anon. Edge functions usam service_role
-- (ignora RLS), entao nao sao afetadas.

-- professores: ja possui politicas duplicadas para authenticated (*_all). Basta remover
-- as versoes public (SELECT/INSERT/UPDATE/DELETE com true) -- as _all cobrem os logados.
DROP POLICY IF EXISTS professores_select_policy ON public.professores;
DROP POLICY IF EXISTS professores_insert ON public.professores;
DROP POLICY IF EXISTS professores_update ON public.professores;
DROP POLICY IF EXISTS professores_delete ON public.professores;

-- usuarios: SELECT public+true -> authenticated+true (INSERT/UPDATE/DELETE ja exigem is_admin/self)
DROP POLICY IF EXISTS usuarios_select_policy ON public.usuarios;
CREATE POLICY usuarios_select_policy ON public.usuarios FOR SELECT TO authenticated USING (true);

-- unidades: duas politicas SELECT public+true redundantes -> uma authenticated+true
DROP POLICY IF EXISTS "Permitir leitura publica unidades" ON public.unidades;
DROP POLICY IF EXISTS unidades_select_policy ON public.unidades;
CREATE POLICY unidades_select_policy ON public.unidades FOR SELECT TO authenticated USING (true);

-- cursos
DROP POLICY IF EXISTS cursos_select_policy ON public.cursos;
CREATE POLICY cursos_select_policy ON public.cursos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cursos_insert ON public.cursos;
CREATE POLICY cursos_insert ON public.cursos FOR INSERT TO authenticated WITH CHECK (true);

-- formas_pagamento
DROP POLICY IF EXISTS formas_pagamento_select ON public.formas_pagamento;
CREATE POLICY formas_pagamento_select ON public.formas_pagamento FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS formas_pagamento_insert ON public.formas_pagamento;
CREATE POLICY formas_pagamento_insert ON public.formas_pagamento FOR INSERT TO authenticated WITH CHECK (true);

-- tipos_matricula
DROP POLICY IF EXISTS tipos_matricula_select ON public.tipos_matricula;
CREATE POLICY tipos_matricula_select ON public.tipos_matricula FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS tipos_matricula_insert ON public.tipos_matricula;
CREATE POLICY tipos_matricula_insert ON public.tipos_matricula FOR INSERT TO authenticated WITH CHECK (true);

-- unidades_cursos
DROP POLICY IF EXISTS select_unidades_cursos ON public.unidades_cursos;
CREATE POLICY select_unidades_cursos ON public.unidades_cursos FOR SELECT TO authenticated USING (true);

-- salas: remover leitura anon; recriar como authenticated+true para preservar o
-- comportamento atual (qualquer logado le todas as salas, alem da politica salas_select por unidade)
DROP POLICY IF EXISTS anon_select_salas ON public.salas;
CREATE POLICY salas_select_authenticated ON public.salas FOR SELECT TO authenticated USING (true);
