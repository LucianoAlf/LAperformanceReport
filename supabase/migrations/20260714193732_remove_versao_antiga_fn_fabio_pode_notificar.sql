-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- BUG PEGO NA HORA: mudar a ordem dos parametros faz o Postgres criar uma SOBRECARGA nova,
-- nao substituir. A versao antiga (2 args, sem categoria) ficou viva, com a logica velha —
-- ou seja, o bypass de governanca que acabei de construir podia ser contornado so chamando
-- a assinatura errada. Removendo a duplicata pra so existir UM fn_fabio_pode_notificar.
drop function if exists public.fn_fabio_pode_notificar(integer, timestamptz);

-- confirma que so sobrou a versao nova
select count(*) as versoes_restantes
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='fn_fabio_pode_notificar';
