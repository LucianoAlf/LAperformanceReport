-- ============================================================
-- Migration: Auto-detecção de segundo curso e banda
-- Data: 2026-03-31
-- Descrição: Modifica calcular_campos_aluno() para detectar
--   automaticamente segundo curso e matrícula de banda no INSERT.
--   Também corrige registros históricos incorretos.
-- ============================================================

-- 1. Índice composto para performance da query de detecção
CREATE INDEX IF NOT EXISTS idx_alunos_nome_unidade_status
  ON alunos(nome_normalizado, unidade_id, status);

-- 2. Atualizar função calcular_campos_aluno() com auto-detecção
CREATE OR REPLACE FUNCTION calcular_campos_aluno()
RETURNS TRIGGER AS $$
DECLARE
  v_curso_nome TEXT;
  v_is_banda BOOLEAN := false;
  v_has_other_enrollment BOOLEAN := false;
BEGIN
  -- ============================================
  -- Calcular idade e classificação EMLA/LAMK
  -- ============================================
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

  -- ============================================
  -- Calcular tempo de permanência em meses
  -- ============================================
  IF NEW.data_matricula IS NOT NULL THEN
    IF NEW.data_saida IS NOT NULL THEN
      NEW.tempo_permanencia_meses := (
        EXTRACT(YEAR FROM AGE(NEW.data_saida, NEW.data_matricula)) * 12 +
        EXTRACT(MONTH FROM AGE(NEW.data_saida, NEW.data_matricula))
      )::INTEGER;
    ELSE
      NEW.tempo_permanencia_meses := (
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, NEW.data_matricula)) * 12 +
        EXTRACT(MONTH FROM AGE(CURRENT_DATE, NEW.data_matricula))
      )::INTEGER;
    END IF;
  ELSE
    NEW.tempo_permanencia_meses := NULL;
  END IF;

  -- ============================================
  -- Auto-detecção de banda e segundo curso (apenas INSERT)
  -- Só atua se tipo_matricula_id for REGULAR (1) ou NULL.
  -- Não sobrescreve bolsista (3,4) nem banda já marcada (5).
  -- ============================================
  IF TG_OP = 'INSERT' AND COALESCE(NEW.tipo_matricula_id, 1) IN (1, 2) THEN

    -- Detectar se o curso é banda
    IF NEW.curso_id IS NOT NULL THEN
      SELECT nome INTO v_curso_nome
      FROM cursos
      WHERE id = NEW.curso_id;

      v_is_banda := (v_curso_nome ILIKE '%banda%');
    END IF;

    -- Detectar se já existe outro aluno ativo com mesmo nome na mesma unidade
    -- nome_normalizado é GENERATED ALWAYS AS, não disponível no BEFORE trigger
    IF NEW.nome IS NOT NULL AND NEW.unidade_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM alunos
        WHERE nome_normalizado = UPPER(TRIM(NEW.nome))
          AND unidade_id = NEW.unidade_id
          AND status = 'ativo'
          AND id IS DISTINCT FROM NEW.id
      ) INTO v_has_other_enrollment;
    END IF;

    -- Aplicar prioridade: Banda > Segundo Curso > Regular
    IF v_is_banda THEN
      NEW.tipo_matricula_id := 5;  -- BANDA
      IF v_has_other_enrollment THEN
        NEW.is_segundo_curso := true;
      END IF;
    ELSIF v_has_other_enrollment THEN
      NEW.tipo_matricula_id := 2;  -- SEGUNDO_CURSO
      NEW.is_segundo_curso := true;
    END IF;

  END IF;

  -- Atualizar updated_at
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Corrigir registros históricos
-- ============================================

-- Part A: Corrigir matrículas de banda (curso com "banda" no nome)
UPDATE alunos a
SET tipo_matricula_id = 5
FROM cursos c
WHERE a.curso_id = c.id
  AND c.nome ILIKE '%banda%'
  AND a.tipo_matricula_id IN (1, 2)
  AND a.status = 'ativo';

-- Part B: Corrigir segundo curso (mesmo nome + unidade, manter o mais antigo como principal)
WITH ranked AS (
  SELECT
    id,
    nome_normalizado,
    unidade_id,
    ROW_NUMBER() OVER (
      PARTITION BY nome_normalizado, unidade_id
      ORDER BY data_matricula ASC NULLS LAST, id ASC
    ) AS rn
  FROM alunos
  WHERE status = 'ativo'
    AND nome_normalizado IS NOT NULL
)
UPDATE alunos a
SET
  is_segundo_curso = true,
  tipo_matricula_id = CASE
    WHEN a.tipo_matricula_id IN (3, 4, 5) THEN a.tipo_matricula_id
    ELSE 2
  END
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1;
