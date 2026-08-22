-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Mila: fecha os SELECT/ALL abertos (mantem service_role); inclui roles dos agentes
DROP POLICY IF EXISTS "conversa_estado_all" ON public.conversa_estado_whatsapp;
CREATE POLICY "conversa_estado_all" ON public.conversa_estado_whatsapp FOR ALL TO authenticated, sol_acesso_restrito, mila_acesso_restrito USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mila_buffer_select_all" ON public.mila_message_buffer;
CREATE POLICY "mila_buffer_select_all" ON public.mila_message_buffer FOR SELECT TO authenticated, sol_acesso_restrito, mila_acesso_restrito USING (true);

-- BI config/templates: fecha SELECT anon (lidos pela Sol + tela admin)
DROP POLICY IF EXISTS "bi_config_select" ON public.bi_agent_config_lamusic;
CREATE POLICY "bi_config_select" ON public.bi_agent_config_lamusic FOR SELECT TO authenticated, sol_acesso_restrito, mila_acesso_restrito USING (true);

DROP POLICY IF EXISTS "bi_templates_select" ON public.bi_query_templates_lamusic;
CREATE POLICY "bi_templates_select" ON public.bi_query_templates_lamusic FOR SELECT TO authenticated, sol_acesso_restrito, mila_acesso_restrito USING (true);

-- motivos_trancamento SELECT: fecha por consistencia
DROP POLICY IF EXISTS "Motivos trancamento são públicos para leitura" ON public.motivos_trancamento;
CREATE POLICY "motivos_trancamento_select" ON public.motivos_trancamento FOR SELECT TO authenticated, sol_acesso_restrito, mila_acesso_restrito USING (true);

-- Lojinha/Inventario: dropa as policies anon_select soltas (app usa as policies authenticated existentes)
DROP POLICY IF EXISTS "anon_select_loja_categorias" ON public.loja_categorias;
DROP POLICY IF EXISTS "anon_select_loja_estoque" ON public.loja_estoque;
DROP POLICY IF EXISTS "anon_select_loja_produtos" ON public.loja_produtos;
DROP POLICY IF EXISTS "anon_select_inventario" ON public.inventario;
DROP POLICY IF EXISTS "anon_select_inventario_manutencoes" ON public.inventario_manutencoes;
DROP POLICY IF EXISTS "anon_select_inventario_movimentacoes" ON public.inventario_movimentacoes;
