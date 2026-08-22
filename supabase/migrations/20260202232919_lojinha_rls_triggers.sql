-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_variacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_vendas_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_carteira ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_carteira_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_responsaveis_reposicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_optin_novidades ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura para usuários autenticados
CREATE POLICY "Leitura colaboradores" ON colaboradores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura categorias" ON loja_categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura produtos" ON loja_produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura variacoes" ON loja_variacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura estoque" ON loja_estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura mov_estoque" ON loja_movimentacoes_estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura vendas" ON loja_vendas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura vendas_itens" ON loja_vendas_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura carteira" ON loja_carteira FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura carteira_mov" ON loja_carteira_movimentacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura configuracoes" ON loja_configuracoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura responsaveis" ON loja_responsaveis_reposicao FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura optin" ON loja_optin_novidades FOR SELECT TO authenticated USING (true);

-- Políticas de escrita para usuários autenticados
CREATE POLICY "Escrita colaboradores" ON colaboradores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita categorias" ON loja_categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita produtos" ON loja_produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita variacoes" ON loja_variacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita estoque" ON loja_estoque FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita mov_estoque" ON loja_movimentacoes_estoque FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita vendas" ON loja_vendas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita vendas_itens" ON loja_vendas_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita carteira" ON loja_carteira FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita carteira_mov" ON loja_carteira_movimentacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita configuracoes" ON loja_configuracoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita responsaveis" ON loja_responsaveis_reposicao FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita optin" ON loja_optin_novidades FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- TRIGGER: Atualizar updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_colaboradores_updated_at BEFORE UPDATE ON colaboradores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loja_produtos_updated_at BEFORE UPDATE ON loja_produtos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loja_estoque_updated_at BEFORE UPDATE ON loja_estoque FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loja_carteira_updated_at BEFORE UPDATE ON loja_carteira FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loja_configuracoes_updated_at BEFORE UPDATE ON loja_configuracoes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
