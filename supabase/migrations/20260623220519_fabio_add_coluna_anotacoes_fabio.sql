-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Coluna onde o Fábio grava o registro de aula por áudio.
-- Separada de 'anotacoes' (território do sync Emusys) para evitar sobrescrita.
ALTER TABLE public.aulas_emusys
  ADD COLUMN IF NOT EXISTS anotacoes_fabio text;

COMMENT ON COLUMN public.aulas_emusys.anotacoes_fabio IS
  'Registro de aula gravado pelo agente Fábio (via áudio do professor). NUNCA é tocado pela sincronização do Emusys (que só escreve em anotacoes). Gravado exclusivamente via a função registrar_aula_fabio().';
