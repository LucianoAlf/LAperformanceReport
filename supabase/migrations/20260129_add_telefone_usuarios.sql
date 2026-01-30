-- =============================================
-- Migração: Adicionar campo telefone em usuarios
-- Data: 2026-01-29
-- Necessário para envio de notificações WhatsApp
-- =============================================

-- Adicionar coluna telefone na tabela usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);

-- Comentário explicativo
COMMENT ON COLUMN usuarios.telefone IS 'Número de telefone para notificações WhatsApp (formato: 5521999999999)';
