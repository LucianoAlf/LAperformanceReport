-- 2026-08-12 — Padroniza tipos de feriado e adiciona uf/cidade
--
-- Antes: tipo era 'national' ou 'municipal' (inglês, inconsistente).
-- Agora: 'nacional', 'estadual', 'municipal' (pt-BR, consistente com o resto do sistema).
--
-- Novas colunas:
--   uf: sigla do estado (para feriados estaduais)
--   cidade: nome do município (para feriados municipais)
--
-- Também adiciona o 2º dia de Carnaval (16/02) que o BrasilAPI retorna e a gente não tinha.

-- 1. Converte tipos antigos para o novo padrão
UPDATE feriados SET tipo = 'nacional' WHERE tipo = 'national';
UPDATE feriados SET tipo = 'municipal' WHERE tipo = 'municipal';

-- 2. Adiciona colunas novas
ALTER TABLE feriados ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE feriados ADD COLUMN IF NOT EXISTS cidade text;

-- 3. Atualiza o constraint de tipo (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feriados_tipo_check'
  ) THEN
    ALTER TABLE feriados DROP CONSTRAINT feriados_tipo_check;
  END IF;
END $$;

ALTER TABLE feriados
  ADD CONSTRAINT feriados_tipo_check
  CHECK (tipo IN ('nacional', 'estadual', 'municipal'));

-- 4. Índice para busca por ano + tipo
CREATE INDEX IF NOT EXISTS idx_feriados_ano_tipo ON feriados (EXTRACT(YEAR FROM data), tipo) WHERE ativo = true;

-- 5. Comentários
COMMENT ON COLUMN feriados.tipo IS 'nacional | estadual | municipal';
COMMENT ON COLUMN feriados.uf IS 'Sigla do estado (ex: RJ). Preenchido quando tipo = estadual.';
COMMENT ON COLUMN feriados.cidade IS 'Nome do município. Preenchido quando tipo = municipal.';

-- 6. Insere o 2º dia de Carnaval 2026 (BrasilAPI retorna 16 e 17/02, tínhamos só 17)
-- A constraint é UNIQUE(data), então só insere se a data estiver livre.
INSERT INTO feriados (data, nome, tipo, ativo)
SELECT '2026-02-16', 'Carnaval', 'nacional', true
WHERE NOT EXISTS (SELECT 1 FROM feriados WHERE data = '2026-02-16');

-- 7. Insere São Sebastião 2026 (estadual RJ) que o BrasilAPI retorna e a gente não tinha
INSERT INTO feriados (data, nome, tipo, uf, ativo)
SELECT '2026-01-20', 'São Sebastião', 'estadual', 'RJ', true
WHERE NOT EXISTS (SELECT 1 FROM feriados WHERE data = '2026-01-20');

-- 8. Marca São Jorge como municipal do Rio de Janeiro
UPDATE feriados SET cidade = 'Rio de Janeiro' WHERE nome = 'São Jorge' AND tipo = 'municipal';
