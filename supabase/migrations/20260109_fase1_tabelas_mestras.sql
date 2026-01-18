-- ============================================================
-- FASE 1: CRIAÇÃO DE TABELAS MESTRAS (Normalização)
-- Data: 09/01/2026
-- Descrição: Criar tabelas de cadastros base para o Sistema de Gestão LA Music
-- ============================================================

-- ============================================================
-- 1. FUNÇÃO AUXILIAR (se não existir)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. TABELA: professores (43 registros)
-- ============================================================

CREATE TABLE IF NOT EXISTS professores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  nome_normalizado VARCHAR(100) GENERATED ALWAYS AS (UPPER(TRIM(nome))) STORED,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_professores_nome_normalizado UNIQUE (nome_normalizado)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_professores_nome ON professores(nome_normalizado);
CREATE INDEX IF NOT EXISTS idx_professores_ativo ON professores(ativo);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS trg_professores_updated_at ON professores;
CREATE TRIGGER trg_professores_updated_at
  BEFORE UPDATE ON professores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. TABELA: cursos (16 registros)
-- ============================================================

CREATE TABLE IF NOT EXISTS cursos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  nome_normalizado VARCHAR(100) GENERATED ALWAYS AS (UPPER(TRIM(nome))) STORED,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_cursos_nome_normalizado UNIQUE (nome_normalizado)
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_cursos_ativo ON cursos(ativo);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS trg_cursos_updated_at ON cursos;
CREATE TRIGGER trg_cursos_updated_at
  BEFORE UPDATE ON cursos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. TABELA: canais_origem (9 registros)
-- ============================================================

CREATE TABLE IF NOT EXISTS canais_origem (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(50) NOT NULL,
  nome_normalizado VARCHAR(50) GENERATED ALWAYS AS (UPPER(TRIM(nome))) STORED,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_canais_nome_normalizado UNIQUE (nome_normalizado)
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_canais_ativo ON canais_origem(ativo);

-- ============================================================
-- 5. TABELA: motivos_saida (12 registros)
-- ============================================================

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

-- Índice
CREATE INDEX IF NOT EXISTS idx_motivos_categoria ON motivos_saida(categoria);
CREATE INDEX IF NOT EXISTS idx_motivos_ativo ON motivos_saida(ativo);

-- ============================================================
-- 6. TABELA: formas_pagamento (5 registros)
-- ============================================================

CREATE TABLE IF NOT EXISTS formas_pagamento (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(50) NOT NULL,
  sigla VARCHAR(10),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_formas_nome UNIQUE (nome)
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_formas_ativo ON formas_pagamento(ativo);

-- ============================================================
-- 7. TABELA: tipos_matricula (5 registros)
-- ============================================================

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

-- Índice
CREATE INDEX IF NOT EXISTS idx_tipos_matricula_ativo ON tipos_matricula(ativo);

-- ============================================================
-- 8. TABELA: tipos_saida (3 registros)
-- ============================================================

CREATE TABLE IF NOT EXISTS tipos_saida (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(50) NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_tipos_saida_codigo UNIQUE (codigo)
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_tipos_saida_ativo ON tipos_saida(ativo);

-- ============================================================
-- FIM DA CRIAÇÃO DE ESTRUTURA
-- ============================================================
