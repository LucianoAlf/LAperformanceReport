-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

select setval('public.formas_pagamento_id_seq', (select max(id) from formas_pagamento));
insert into formas_pagamento (nome, sigla, ativo) values ('Cartão de Crédito', 'CRED', true);
