-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.5A: CRIAR TABELA USUARIOS
-- Controle de acesso por unidade
-- ============================================

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    
    -- Dados básicos
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255),
    
    -- Perfil e acesso
    perfil VARCHAR(50) NOT NULL DEFAULT 'unidade' CHECK (perfil IN ('admin', 'unidade')),
    unidade_id UUID REFERENCES unidades(id),
    cargo VARCHAR(100),
    
    -- Status
    ativo BOOLEAN DEFAULT TRUE,
    ultimo_acesso TIMESTAMP WITH TIME ZONE,
    
    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para updated_at
CREATE TRIGGER update_usuarios_updated_at
    BEFORE UPDATE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Índices
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_unidade ON usuarios(unidade_id);
CREATE INDEX idx_usuarios_perfil ON usuarios(perfil);

-- Comentários
COMMENT ON TABLE usuarios IS 'Usuários do sistema com controle de acesso por unidade';
COMMENT ON COLUMN usuarios.perfil IS 'admin = vê tudo (consolidado + todas unidades), unidade = só a própria unidade';
COMMENT ON COLUMN usuarios.unidade_id IS 'NULL para admin, preenchido para perfil unidade';

-- Inserir usuário admin inicial
INSERT INTO usuarios (nome, email, perfil, cargo) VALUES 
('Administrador', 'admin@lamusic.com.br', 'admin', 'Administrador');
