-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================
-- FASE 1: CRIAÇÃO DE TABELAS MESTRAS (Normalização)
-- Data: 09/01/2026
-- ============================================================

-- 1. FUNÇÃO AUXILIAR
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. TABELA: professores
CREATE TABLE IF NOT EXISTS professores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  nome_normalizado VARCHAR(100) GENERATED ALWAYS AS (UPPER(TRIM(nome))) STORED,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_professores_nome_normalizado UNIQUE (nome_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_professores_nome ON professores(nome_normalizado);
CREATE INDEX IF NOT EXISTS idx_professores_ativo ON professores(ativo);

DROP TRIGGER IF EXISTS trg_professores_updated_at ON professores;
CREATE TRIGGER trg_professores_updated_at
  BEFORE UPDATE ON professores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 3. TABELA: cursos
CREATE TABLE IF NOT EXISTS cursos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  nome_normalizado VARCHAR(100) GENERATED ALWAYS AS (UPPER(TRIM(nome))) STORED,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_cursos_nome_normalizado UNIQUE (nome_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_cursos_ativo ON cursos(ativo);

DROP TRIGGER IF EXISTS trg_cursos_updated_at ON cursos;
CREATE TRIGGER trg_cursos_updated_at
  BEFORE UPDATE ON cursos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. TABELA: canais_origem
CREATE TABLE IF NOT EXISTS canais_origem (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(50) NOT NULL,
  nome_normalizado VARCHAR(50) GENERATED ALWAYS AS (UPPER(TRIM(nome))) STORED,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_canais_nome_normalizado UNIQUE (nome_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_canais_ativo ON canais_origem(ativo);

-- 5. TABELA: motivos_saida
CREATE TABLE IF NOT EXISTS motivos_saida (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  nome_normalizado VARCHAR(100) GENERATED ALWAYS AS (UPPER(TRIM(nome))) STORED,
  categoria VARCHAR(30) CHECK (categoria IN (
    'financeiro', 'tempo', 'mudanca', 'saude', 
    'desistencia', 'estudos', 'inadimplencia', 'outro'
  )),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_motivos_nome_normalizado UNIQUE (nome_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_motivos_categoria ON motivos_saida(categoria);
CREATE INDEX IF NOT EXISTS idx_motivos_ativo ON motivos_saida(ativo);

-- 6. TABELA: formas_pagamento
CREATE TABLE IF NOT EXISTS formas_pagamento (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(50) NOT NULL,
  sigla VARCHAR(10),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_formas_nome UNIQUE (nome)
);

CREATE INDEX IF NOT EXISTS idx_formas_ativo ON formas_pagamento(ativo);

-- 7. TABELA: tipos_matricula
CREATE TABLE IF NOT EXISTS tipos_matricula (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(50) NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  entra_ticket_medio BOOLEAN NOT NULL,
  conta_como_pagante BOOLEAN NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_tipos_matricula_codigo UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_tipos_matricula_ativo ON tipos_matricula(ativo);

-- 8. TABELA: tipos_saida
CREATE TABLE IF NOT EXISTS tipos_saida (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(50) NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_tipos_saida_codigo UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_tipos_saida_ativo ON tipos_saida(ativo);
