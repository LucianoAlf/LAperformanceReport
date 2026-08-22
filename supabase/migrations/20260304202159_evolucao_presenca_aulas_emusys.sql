-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================
-- Evolução do sistema de presença
-- De: 1 registro por aluno/dia (agrupado)
-- Para: 1 registro por aluno/aula (granular)
-- =============================================

-- 1. Nova tabela: metadados completos de cada aula do Emusys
CREATE TABLE aulas_emusys (
  id SERIAL PRIMARY KEY,
  emusys_id INTEGER NOT NULL,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  data_aula DATE NOT NULL,
  data_hora_inicio TIMESTAMPTZ NOT NULL,
  data_hora_fim TIMESTAMPTZ,
  duracao_minutos INTEGER,
  tipo VARCHAR(30),
  categoria VARCHAR(30),
  turma_nome VARCHAR(100),
  curso_emusys_id INTEGER,
  curso_nome VARCHAR(100),
  sala_nome VARCHAR(100),
  professor_nome VARCHAR(200),
  professor_id INTEGER REFERENCES professores(id),
  cancelada BOOLEAN DEFAULT false,
  nr_da_aula INTEGER,
  qtd_alunos INTEGER,
  anotacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(emusys_id, unidade_id)
);

CREATE INDEX idx_aulas_emusys_data ON aulas_emusys(unidade_id, data_aula);
CREATE INDEX idx_aulas_emusys_turma ON aulas_emusys(turma_nome);
CREATE INDEX idx_aulas_emusys_curso ON aulas_emusys(curso_nome);

COMMENT ON TABLE aulas_emusys IS 'Metadados completos de cada aula importada do Emusys (turma, curso, sala, professor, horários)';

-- 2. Alterar aluno_presenca: adicionar referência à aula + campos denormalizados
ALTER TABLE aluno_presenca ADD COLUMN aula_emusys_id INTEGER REFERENCES aulas_emusys(id);
ALTER TABLE aluno_presenca ADD COLUMN curso_nome VARCHAR(100);
ALTER TABLE aluno_presenca ADD COLUMN turma_nome VARCHAR(100);
ALTER TABLE aluno_presenca ADD COLUMN sala_nome VARCHAR(100);

-- 3. Trocar constraint de (aluno_id, data_aula) para suportar múltiplas aulas/dia
ALTER TABLE aluno_presenca DROP CONSTRAINT IF EXISTS aluno_presenca_aluno_id_data_aula_key;

-- Index para novos registros (com aula_emusys_id)
CREATE UNIQUE INDEX idx_presenca_aluno_aula ON aluno_presenca(aluno_id, aula_emusys_id) WHERE aula_emusys_id IS NOT NULL;

-- Index para registros legados (sem aula_emusys_id) — mantém compatibilidade
CREATE UNIQUE INDEX idx_presenca_aluno_data_legacy ON aluno_presenca(aluno_id, data_aula) WHERE aula_emusys_id IS NULL;

-- 4. RLS para aulas_emusys (mesmo padrão de aluno_presenca)
ALTER TABLE aulas_emusys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read aulas_emusys"
  ON aulas_emusys FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage aulas_emusys"
  ON aulas_emusys FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
