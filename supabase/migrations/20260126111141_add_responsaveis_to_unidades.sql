-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar campos de responsáveis comercial e retenção às unidades
ALTER TABLE unidades 
ADD COLUMN IF NOT EXISTS hunter_nome TEXT,
ADD COLUMN IF NOT EXISTS farmers_nomes TEXT[];

-- Comentários
COMMENT ON COLUMN unidades.hunter_nome IS 'Nome do Hunter (responsável comercial) da unidade';
COMMENT ON COLUMN unidades.farmers_nomes IS 'Array com nomes dos Farmers (equipe de retenção) da unidade';

-- Inserir dados dos Hunters e Farmers conhecidos
UPDATE unidades SET 
  hunter_nome = 'Vitória',
  farmers_nomes = ARRAY['Gabriela', 'Jhonatan']
WHERE nome = 'Campo Grande';

UPDATE unidades SET 
  hunter_nome = 'Clayton',
  farmers_nomes = ARRAY['Fernanda', 'Daiana']
WHERE nome = 'Recreio';

UPDATE unidades SET 
  hunter_nome = 'Kailane',
  farmers_nomes = ARRAY['Eduarda', 'Arthur']
WHERE nome = 'Barra';
