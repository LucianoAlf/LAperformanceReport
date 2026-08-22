-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- 1. Adicionar coluna sem NOT NULL ainda
ALTER TABLE fila_relatorios_whatsapp ADD COLUMN data_dia date;

-- 2. Preencher com a data BRT de agendada_para
UPDATE fila_relatorios_whatsapp 
SET data_dia = (agendada_para AT TIME ZONE 'America/Sao_Paulo')::date;

-- 3. Remover duplicatas históricas (mantém o id menor = primeiro inserido por dia/unidade/grupo)
DELETE FROM fila_relatorios_whatsapp
WHERE id NOT IN (
  SELECT MIN(id)
  FROM fila_relatorios_whatsapp
  GROUP BY unidade_id, jid, data_dia
);

-- 4. NOT NULL e índice único
ALTER TABLE fila_relatorios_whatsapp ALTER COLUMN data_dia SET NOT NULL;

CREATE UNIQUE INDEX idx_fila_relatorio_dia 
ON fila_relatorios_whatsapp (unidade_id, jid, data_dia);
