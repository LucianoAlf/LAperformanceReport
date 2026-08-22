-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- REVERT do drop de anon_select em inventario/loja: um backend le essas tabelas
-- via anon key (card de Inventario no WhatsApp) e quebrou ("Sem unidades").
-- Restaura o estado anterior. Fix correto (trocar anon -> role/service_role do consumidor) fica pendente.
CREATE POLICY "anon_select_inventario" ON public.inventario FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_inventario_manutencoes" ON public.inventario_manutencoes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_inventario_movimentacoes" ON public.inventario_movimentacoes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_loja_categorias" ON public.loja_categorias FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_loja_estoque" ON public.loja_estoque FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_loja_produtos" ON public.loja_produtos FOR SELECT TO anon USING (true);
