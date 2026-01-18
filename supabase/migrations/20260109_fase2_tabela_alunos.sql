-- ============================================================
-- FASE 2: TABELA DE ALUNOS
-- Data: 09/01/2026
-- Descrição: Tabela core do sistema com campos calculados via trigger
-- ============================================================

-- ============================================================
-- 1. TABELA: alunos
-- ============================================================

CREATE TABLE IF NOT EXISTS alunos (
  id SERIAL PRIMARY KEY,
  
  -- Dados básicos
  nome VARCHAR(200) NOT NULL,
  nome_normalizado VARCHAR(200) GENERATED ALWAYS AS (UPPER(TRIM(nome))) STORED,
  data_nascimento DATE,
  
  -- Campos calculados via TRIGGER (não GENERATED para evitar problemas com AGE/EXTRACT)
  idade_atual INTEGER,
  classificacao VARCHAR(4), -- EMLA ou LAMK (calculado pela idade)
  tempo_permanencia_meses INTEGER,
  
  -- Contato
  telefone VARCHAR(20),
  whatsapp VARCHAR(20),
  email VARCHAR(150),
  
  -- Vínculo com escola (UUID para compatibilidade com tabela unidades existente)
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  professor_atual_id INTEGER REFERENCES professores(id),
  curso_id INTEGER REFERENCES cursos(id),
  tipo_matricula_id INTEGER REFERENCES tipos_matricula(id) DEFAULT 1, -- Regular
  
  -- Datas importantes
  data_matricula DATE,
  data_inicio_contrato DATE,
  data_fim_contrato DATE,
  data_saida DATE,
  
  -- Valores
  valor_parcela DECIMAL(10,2),
  valor_passaporte DECIMAL(10,2),
  
  -- Status
  status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN (
    'ativo', 'inativo', 'aviso_previo', 'trancado', 'evadido'
  )),
  
  -- Flags
  is_ex_aluno BOOLEAN DEFAULT false,
  is_segundo_curso BOOLEAN DEFAULT false,
  
  -- Saída (se aplicável)
  tipo_saida_id INTEGER REFERENCES tipos_saida(id),
  motivo_saida_id INTEGER REFERENCES motivos_saida(id),
  
  -- Origem (comercial)
  canal_origem_id INTEGER REFERENCES canais_origem(id),
  forma_pagamento_id INTEGER REFERENCES formas_pagamento(id),
  
  -- Auditoria
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);

-- ============================================================
-- 2. FUNÇÃO PARA CALCULAR CAMPOS AUTOMÁTICOS
-- ============================================================

CREATE OR REPLACE FUNCTION calcular_campos_aluno()
RETURNS TRIGGER AS $$
BEGIN
  -- Calcular idade e classificação EMLA/LAMK
  IF NEW.data_nascimento IS NOT NULL THEN
    NEW.idade_atual := EXTRACT(YEAR FROM AGE(CURRENT_DATE, NEW.data_nascimento))::INTEGER;
    NEW.classificacao := CASE 
      WHEN NEW.idade_atual < 12 THEN 'LAMK' 
      ELSE 'EMLA' 
    END;
  ELSE
    NEW.idade_atual := NULL;
    NEW.classificacao := NULL;
  END IF;
  
  -- Calcular tempo de permanência em meses
  IF NEW.data_matricula IS NOT NULL THEN
    IF NEW.data_saida IS NOT NULL THEN
      -- Aluno que já saiu: calcular até data de saída
      NEW.tempo_permanencia_meses := (
        EXTRACT(YEAR FROM AGE(NEW.data_saida, NEW.data_matricula)) * 12 +
        EXTRACT(MONTH FROM AGE(NEW.data_saida, NEW.data_matricula))
      )::INTEGER;
    ELSE
      -- Aluno ativo: calcular até hoje
      NEW.tempo_permanencia_meses := (
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, NEW.data_matricula)) * 12 +
        EXTRACT(MONTH FROM AGE(CURRENT_DATE, NEW.data_matricula))
      )::INTEGER;
    END IF;
  ELSE
    NEW.tempo_permanencia_meses := NULL;
  END IF;
  
  -- Atualizar updated_at
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. TRIGGERS
-- ============================================================

-- Trigger para INSERT e UPDATE
DROP TRIGGER IF EXISTS trg_alunos_calcular_campos ON alunos;
CREATE TRIGGER trg_alunos_calcular_campos
  BEFORE INSERT OR UPDATE ON alunos
  FOR EACH ROW
  EXECUTE FUNCTION calcular_campos_aluno();

-- ============================================================
-- 4. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_alunos_nome ON alunos(nome_normalizado);
CREATE INDEX IF NOT EXISTS idx_alunos_unidade ON alunos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_alunos_professor ON alunos(professor_atual_id);
CREATE INDEX IF NOT EXISTS idx_alunos_curso ON alunos(curso_id);
CREATE INDEX IF NOT EXISTS idx_alunos_status ON alunos(status);
CREATE INDEX IF NOT EXISTS idx_alunos_classificacao ON alunos(classificacao);
CREATE INDEX IF NOT EXISTS idx_alunos_data_matricula ON alunos(data_matricula);
CREATE INDEX IF NOT EXISTS idx_alunos_data_saida ON alunos(data_saida);

-- Índices compostos para queries frequentes
CREATE INDEX IF NOT EXISTS idx_alunos_unidade_status ON alunos(unidade_id, status);
CREATE INDEX IF NOT EXISTS idx_alunos_unidade_classificacao ON alunos(unidade_id, classificacao);

-- ============================================================
-- 5. VIEWS
-- ============================================================

-- View: Alunos ativos com dados completos
CREATE OR REPLACE VIEW vw_alunos_ativos AS
SELECT 
  a.id,
  a.nome,
  a.classificacao,
  a.idade_atual,
  u.nome as unidade,
  u.codigo as unidade_codigo,
  p.nome as professor,
  c.nome as curso,
  tm.nome as tipo_matricula,
  tm.entra_ticket_medio,
  tm.conta_como_pagante,
  a.valor_parcela,
  a.tempo_permanencia_meses,
  a.data_matricula,
  a.data_fim_contrato,
  a.status
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
LEFT JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
WHERE a.status = 'ativo';

-- View: Contagem por unidade e classificação
CREATE OR REPLACE VIEW vw_contagem_alunos AS
SELECT 
  u.nome as unidade,
  u.codigo as unidade_codigo,
  a.classificacao,
  a.status,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE tm.conta_como_pagante = true) as pagantes,
  ROUND(AVG(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true), 2) as ticket_medio,
  ROUND(AVG(a.tempo_permanencia_meses), 1) as tempo_medio_meses
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
GROUP BY u.nome, u.codigo, a.classificacao, a.status;

-- View: LTV por unidade (apenas alunos que já saíram)
CREATE OR REPLACE VIEW vw_ltv_unidade AS
SELECT 
  u.nome as unidade,
  u.codigo as unidade_codigo,
  COUNT(*) as total_alunos_saidos,
  ROUND(AVG(a.tempo_permanencia_meses), 1) as tempo_medio_meses,
  ROUND(AVG(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true), 2) as ticket_medio,
  ROUND(AVG(a.tempo_permanencia_meses * a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true), 2) as ltv_medio
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
WHERE a.data_saida IS NOT NULL
GROUP BY u.nome, u.codigo;

-- ============================================================
-- FIM DA FASE 2
-- ============================================================
