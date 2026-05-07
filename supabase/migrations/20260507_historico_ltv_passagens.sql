-- Migration: Histórico LTV — Passagens com soft delete
-- Data: 2026-05-07
-- Contexto: refatora `alunos_historico` para suportar passagens granulares
--   (data_entrada/data_saida) + soft delete (anulado/motivo) + idempotência.
-- Edge function v12 do `processar-matricula-emusys` passa a ser a única fonte
-- de gravação. Trigger fn_alunos_reentrada_historico é simplificada.

-- 1) Colunas novas (todas opcionais — registros antigos ficam com NULL)
ALTER TABLE alunos_historico
  ADD COLUMN IF NOT EXISTS data_entrada DATE,
  ADD COLUMN IF NOT EXISTS data_saida DATE,
  ADD COLUMN IF NOT EXISTS anulado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_anulacao TEXT,
  ADD COLUMN IF NOT EXISTS anulado_por TEXT,
  ADD COLUMN IF NOT EXISTS anulado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_saida TEXT,
  ADD COLUMN IF NOT EXISTS aluno_ids BIGINT[];

-- aluno_ids permite que a edge function v12 registre todas as matriculas que
-- compuseram a passagem (1 principal + N segundo curso). A RPC usa esse array
-- pra evitar duplicar a mesma passagem entre fontes.
CREATE INDEX IF NOT EXISTS idx_alunos_historico_aluno_ids_gin
  ON alunos_historico USING GIN (aluno_ids)
  WHERE anulado = false;

-- 2) Idempotência: webhook reenviado não duplica passagem
--    Bloqueia 2 INSERTs com mesma combinação (aluno_id, data_saida) ativos
CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_historico_aluno_data_saida_uniq
  ON alunos_historico(aluno_id, data_saida)
  WHERE anulado = false AND aluno_id IS NOT NULL AND data_saida IS NOT NULL;

-- 3) Performance: filtro padrão do hook é "anulado = false"
CREATE INDEX IF NOT EXISTS idx_alunos_historico_nao_anulado
  ON alunos_historico(aluno_id) WHERE anulado = false;

-- 4) Simplificar trigger: só zera data_saida na reentrada.
--    Antes ela também fazia INSERT em alunos_historico, mas isso agora
--    é responsabilidade da edge function v12 (handleEvasao).
CREATE OR REPLACE FUNCTION fn_alunos_reentrada_historico()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('inativo', 'evadido') AND NEW.status = 'ativo' THEN
    NEW.data_saida := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN alunos_historico.data_entrada IS 'MIN(data_matricula) das matrículas que compuseram a passagem. NULL para registros antigos pré-v12.';
COMMENT ON COLUMN alunos_historico.data_saida IS 'MAX(data_saida) das matrículas que compuseram a passagem. NULL para registros antigos pré-v12.';
COMMENT ON COLUMN alunos_historico.anulado IS 'Soft delete via ModalPassagensAluno. DELETE físico continua disponível na tabela principal.';
COMMENT ON COLUMN alunos_historico.motivo_saida IS 'Texto livre do motivo informado pelo Emusys (preenchido pela edge function v12).';
COMMENT ON COLUMN alunos_historico.aluno_ids IS 'Array de IDs de alunos (matrículas) que compuseram a passagem. Populado pela edge v12. NULL para registros antigos pré-v12.';
