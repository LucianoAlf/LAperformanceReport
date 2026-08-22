-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Mesmo bug do fn_fabio_pode_notificar: adicionar p_recebe_domingo criou SOBRECARGA nova
-- em vez de substituir. A versao de 8 argumentos ficou viva. Pior aqui: o PostgREST resolve
-- funcao por nome dos parametros no payload — com duas sobrecargas cujos parametros se
-- sobrepoem, uma chamada sem recebe_domingo pode ficar AMBIGUA e o Supabase rejeitar com
-- "could not choose the best candidate function". Removendo a antiga.
drop function if exists public.app_atualizar_preferencia_fabio(text,time,time,smallint[],date,boolean,boolean,text);

select p.proname, pg_get_function_identity_arguments(p.oid) as assinatura
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='app_atualizar_preferencia_fabio';
