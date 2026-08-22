-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 3: Habilitar RLS nas novas tabelas
-- =====================================================

-- Habilitar RLS
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfil_permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_acesso ENABLE ROW LEVEL SECURITY;

-- Políticas para PERFIS (todos podem ler, só admin pode modificar)
CREATE POLICY "Perfis: leitura pública" ON perfis
  FOR SELECT USING (true);

CREATE POLICY "Perfis: admin pode tudo" ON perfis
  FOR ALL USING (is_admin());

-- Políticas para PERMISSOES (todos podem ler, só admin pode modificar)
CREATE POLICY "Permissoes: leitura pública" ON permissoes
  FOR SELECT USING (true);

CREATE POLICY "Permissoes: admin pode tudo" ON permissoes
  FOR ALL USING (is_admin());

-- Políticas para PERFIL_PERMISSOES (todos podem ler, só admin pode modificar)
CREATE POLICY "Perfil_permissoes: leitura pública" ON perfil_permissoes
  FOR SELECT USING (true);

CREATE POLICY "Perfil_permissoes: admin pode tudo" ON perfil_permissoes
  FOR ALL USING (is_admin());

-- Políticas para USUARIO_PERFIS (usuário vê os próprios, admin vê todos)
CREATE POLICY "Usuario_perfis: usuário vê próprios" ON usuario_perfis
  FOR SELECT USING (
    usuario_id IN (
      SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
    )
    OR is_admin()
  );

CREATE POLICY "Usuario_perfis: admin pode tudo" ON usuario_perfis
  FOR ALL USING (is_admin());

-- Políticas para AUDITORIA_ACESSO (só admin pode ver e inserir)
CREATE POLICY "Auditoria: admin pode ver" ON auditoria_acesso
  FOR SELECT USING (is_admin());

CREATE POLICY "Auditoria: sistema pode inserir" ON auditoria_acesso
  FOR INSERT WITH CHECK (true);
