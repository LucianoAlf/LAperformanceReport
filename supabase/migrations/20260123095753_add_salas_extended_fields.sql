-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar novos campos à tabela salas
ALTER TABLE salas 
ADD COLUMN IF NOT EXISTS tipo_sala VARCHAR(100),
ADD COLUMN IF NOT EXISTS buffer_operacional INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS recursos TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS sala_coringa BOOLEAN DEFAULT false;

-- Comentários para documentação
COMMENT ON COLUMN salas.tipo_sala IS 'Tipo da sala: Piano/Teclado, Bateria/Percussão, Cordas, etc.';
COMMENT ON COLUMN salas.buffer_operacional IS 'Tempo mínimo em minutos entre aulas nesta sala';
COMMENT ON COLUMN salas.recursos IS 'Lista de recursos disponíveis na sala (Piano de Cauda, Ar Condicionado, etc.)';
COMMENT ON COLUMN salas.sala_coringa IS 'Se true, a sala pode ser usada para múltiplos tipos de aula';
