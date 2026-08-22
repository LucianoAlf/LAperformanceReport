-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ============================================
-- 1. Função de normalização de telefone
-- ============================================
CREATE OR REPLACE FUNCTION normalize_telefone(tel TEXT) RETURNS TEXT AS $$
DECLARE digits TEXT;
BEGIN
  IF tel IS NULL OR TRIM(tel) = '' THEN RETURN NULL; END IF;
  digits := regexp_replace(tel, '\D', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;
  IF length(digits) IN (10, 11) THEN
    digits := '55' || digits;
  END IF;
  RETURN digits;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 2. Normalizar todos os telefones existentes
-- ============================================
UPDATE leads 
SET telefone = normalize_telefone(telefone)
WHERE telefone IS NOT NULL AND telefone != ''
  AND telefone IS DISTINCT FROM normalize_telefone(telefone);

-- ============================================
-- 3. Resolver duplicatas (manter o mais avançado no pipeline)
-- ============================================
WITH duplicates AS (
  SELECT id, telefone, unidade_id, etapa_pipeline_id, updated_at, status,
    ROW_NUMBER() OVER (
      PARTITION BY telefone, unidade_id 
      ORDER BY 
        -- Prioriza status mais avançado
        CASE status
          WHEN 'convertido' THEN 5
          WHEN 'experimental_realizada' THEN 4
          WHEN 'experimental_agendada' THEN 3
          WHEN 'em_contato' THEN 2
          WHEN 'novo' THEN 1
          ELSE 0
        END DESC,
        -- Depois pelo pipeline mais avançado
        COALESCE(etapa_pipeline_id, 0) DESC,
        -- Depois pelo mais recentemente atualizado
        updated_at DESC NULLS LAST,
        -- Desempate pelo id mais recente
        id DESC
    ) as rn
  FROM leads
  WHERE telefone IS NOT NULL
),
to_archive AS (
  SELECT id FROM duplicates WHERE rn > 1
)
UPDATE leads SET 
  arquivado = true,
  observacoes = COALESCE(observacoes, '') || ' [Arquivado auto: duplicata telefone+unidade]',
  updated_at = NOW()
WHERE id IN (SELECT id FROM to_archive);

-- ============================================
-- 4. Trigger para normalizar automaticamente
-- ============================================
CREATE OR REPLACE FUNCTION trigger_normalize_telefone() RETURNS TRIGGER AS $$
BEGIN
  NEW.telefone := normalize_telefone(NEW.telefone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_normalize_telefone_leads ON leads;
CREATE TRIGGER tr_normalize_telefone_leads
  BEFORE INSERT OR UPDATE OF telefone ON leads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_normalize_telefone();

-- ============================================
-- 5. UNIQUE index parcial (telefone + unidade_id)
-- ============================================
CREATE UNIQUE INDEX idx_leads_telefone_unidade_unique
  ON leads (telefone, unidade_id)
  WHERE telefone IS NOT NULL AND arquivado = false;
