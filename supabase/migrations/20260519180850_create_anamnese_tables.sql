-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ==============================================
-- TABELA PRINCIPAL: anamneses
-- Vinculada a alunos.id (nullable para pré-matrícula)
-- ==============================================
CREATE TABLE anamneses (
  id SERIAL PRIMARY KEY,
  aluno_id INTEGER REFERENCES alunos(id) ON DELETE SET NULL,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  tipo_formulario VARCHAR(4) NOT NULL CHECK (tipo_formulario IN ('EMLA', 'LAMK')),
  
  -- Dados de identificação (para quando aluno_id é NULL = pré-matrícula)
  nome_aluno VARCHAR(200) NOT NULL,
  telefone_aluno VARCHAR(20),
  
  -- Controle
  entrevistador VARCHAR(100),
  modo_resposta VARCHAR(20) CHECK (modo_resposta IN ('presencial', 'online')),
  status VARCHAR(20) DEFAULT 'completa' CHECK (status IN ('rascunho', 'completa')),
  vinculo_status VARCHAR(20) DEFAULT 'vinculado' CHECK (vinculo_status IN ('vinculado', 'pendente', 'ignorado')),
  duracao_segundos INTEGER,
  
  -- === DADOS COMPARTILHADOS (EMLA + LAMK) ===
  genero VARCHAR(30),
  possui_instrumento VARCHAR(30) CHECK (possui_instrumento IN ('sim', 'nao', 'planejando')),
  cursos_escolhidos TEXT,
  objetivos JSONB DEFAULT '[]',
  tempo_para_metas VARCHAR(20),
  tempo_disponivel_estudo VARCHAR(20),
  experiencia_anterior JSONB DEFAULT '[]',
  interesse_bandas VARCHAR(10),
  cuidado_medico TEXT,
  medicacao_continua TEXT,
  diagnosticos JSONB DEFAULT '[]',
  necessidade_apoio TEXT,
  
  -- === EXCLUSIVOS EMLA ===
  generos_musicais JSONB DEFAULT '[]',
  instrumentos_toca JSONB DEFAULT '[]',
  nivel_conhecimento_musical VARCHAR(20),
  nivel_habilidade_instrumento VARCHAR(20),
  
  -- === EXCLUSIVOS LAMK ===
  motivo_procura_pais JSONB DEFAULT '[]',
  metas_pais JSONB DEFAULT '[]',
  fonte_exposicao_musical JSONB DEFAULT '[]',
  musicos_na_familia BOOLEAN,
  interesse_instrumento_cantar BOOLEAN,
  exposicao_telas VARCHAR(30),
  comunicacao_crianca VARCHAR(30),
  sono_crianca JSONB DEFAULT '[]',
  estereotipias TEXT,
  situacao_responsaveis VARCHAR(50),
  filiacao VARCHAR(30),
  quem_traz_crianca JSONB DEFAULT '[]',
  
  -- === PERFIL DE TEMPERAMENTO (calculado) ===
  temperamento_primario VARCHAR(20),
  temperamento_secundario VARCHAR(20),
  temperamento_codinome VARCHAR(40),
  temperamento_contagem JSONB,
  perfil_baby BOOLEAN DEFAULT false,
  
  -- === ANOTAÇÕES ===
  observacoes_entrevistador TEXT,
  
  -- === METADATA ===
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER REFERENCES usuarios(id)
);

-- Índices
CREATE INDEX idx_anamneses_aluno_id ON anamneses(aluno_id);
CREATE INDEX idx_anamneses_unidade_id ON anamneses(unidade_id);
CREATE INDEX idx_anamneses_tipo ON anamneses(tipo_formulario);
CREATE INDEX idx_anamneses_temperamento ON anamneses(temperamento_primario);
CREATE INDEX idx_anamneses_vinculo ON anamneses(vinculo_status);
CREATE INDEX idx_anamneses_nome ON anamneses(nome_aluno);

-- ==============================================
-- TABELA DE RESPOSTAS DO PERFIL COMPORTAMENTAL
-- Armazena as 11 respostas individuais para auditoria
-- ==============================================
CREATE TABLE anamnese_respostas_perfil (
  id SERIAL PRIMARY KEY,
  anamnese_id INTEGER NOT NULL REFERENCES anamneses(id) ON DELETE CASCADE,
  pergunta_numero INTEGER NOT NULL CHECK (pergunta_numero BETWEEN 1 AND 11),
  resposta_posicao INTEGER CHECK (resposta_posicao BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_respostas_anamnese_id ON anamnese_respostas_perfil(anamnese_id);

-- ==============================================
-- FLAGS NA TABELA ALUNOS (colunas novas)
-- ==============================================
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS anamnese_preenchida BOOLEAN DEFAULT false;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS anamnese_preenchida_em TIMESTAMPTZ;
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS temperamento_codinome VARCHAR(40);

-- ==============================================
-- RLS
-- ==============================================
ALTER TABLE anamneses ENABLE ROW LEVEL SECURITY;
ALTER TABLE anamnese_respostas_perfil ENABLE ROW LEVEL SECURITY;

-- Policy: usuários veem anamneses da sua unidade OU admin vê tudo
CREATE POLICY "anamneses_por_unidade" ON anamneses
  FOR ALL USING (
    unidade_id IN (
      SELECT u.unidade_id FROM usuarios u 
      WHERE u.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin'
    )
  );

CREATE POLICY "respostas_perfil_via_anamnese" ON anamnese_respostas_perfil
  FOR ALL USING (
    anamnese_id IN (
      SELECT a.id FROM anamneses a 
      WHERE a.unidade_id IN (
        SELECT u.unidade_id FROM usuarios u WHERE u.auth_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin'
      )
    )
  );

-- ==============================================
-- TRIGGER: ao inserir anamnese com aluno_id, 
-- atualiza flags no aluno
-- ==============================================
CREATE OR REPLACE FUNCTION fn_atualizar_aluno_anamnese()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.aluno_id IS NOT NULL AND NEW.status = 'completa' THEN
    UPDATE alunos SET 
      anamnese_preenchida = true,
      anamnese_preenchida_em = NOW(),
      temperamento_codinome = NEW.temperamento_codinome,
      updated_at = NOW()
    WHERE id = NEW.aluno_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_anamnese_atualiza_aluno
AFTER INSERT OR UPDATE ON anamneses
FOR EACH ROW
EXECUTE FUNCTION fn_atualizar_aluno_anamnese();

-- Comentários
COMMENT ON TABLE anamneses IS 'Anamnese do aluno - coleta de perfil pedagógico, saúde, temperamento comportamental. Vinculada a alunos.id (nullable para pré-matrícula).';
COMMENT ON TABLE anamnese_respostas_perfil IS 'Respostas individuais das 11 perguntas de perfil comportamental. Armazena posição escolhida para auditoria e recálculo.';
COMMENT ON COLUMN anamneses.vinculo_status IS 'vinculado = aluno_id preenchido e confirmado. pendente = preenchida antes da matrícula, aguardando vínculo. ignorado = descartada.';
COMMENT ON COLUMN anamneses.nome_aluno IS 'Nome do aluno preenchido no formulário. Usado para match quando aluno_id é NULL (pré-matrícula).';
