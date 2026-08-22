-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Autoreply por caixa Meta (substitui o autoreply amarrado a agentes)
ALTER TABLE numeros_meta
  ADD COLUMN IF NOT EXISTS auto_reply_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reply_message text;

COMMENT ON COLUMN numeros_meta.auto_reply_ativo IS 'Se true, responde automaticamente quem escrever nesta caixa (canal de disparo sem atendimento).';
COMMENT ON COLUMN numeros_meta.auto_reply_message IS 'Texto do autoreply. Disparado dentro de 24h (service conversation, sem custo). Debounce de 10min por contato.';

-- Default editável para a caixa de avisos existente
UPDATE numeros_meta
SET auto_reply_message = E'Olá! 👋\n\nEste canal é usado apenas para *envio de avisos* e não é monitorado para atendimento.\n\nPara falar com a gente, chame a sua unidade no WhatsApp:\n\n📍 *Campo Grande* — (21) 96552-9851\n📍 *Recreio* — (21) 3955-1135\n📍 *Barra* — (21) 96957-5619\n\nObrigado! 🎵 LA Music'
WHERE auto_reply_message IS NULL;
