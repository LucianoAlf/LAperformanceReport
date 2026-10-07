-- Para a entrada de EXECUTE para anon em funcao nova.
--
-- Causa: ALTER DEFAULT PRIVILEGES FOR ROLE postgres (e supabase_admin)
-- IN SCHEMA public concede EXECUTE a anon em toda funcao criada daqui pra
-- frente. A anon key vai no bundle do front. Contagem nossa (sem extensao):
-- 150 em 02/09 -> 166 em 14/09 -> 179 em 19/09.
--
-- Isto NAO revoga as 179 ja existentes. So impede a proxima de nascer aberta.
-- Funcao publica de proposito (anamnese por token, etc.) passa a precisar
-- de GRANT EXECUTE ... TO anon explicito.
--
-- Nao mexe em tabelas/sequences (outro defacl, outra frente).

-- O papel que cria as funcoes nossas e o postgres (migrations MCP/CLI).
-- supabase_admin e o default do dashboard; alterar o dele exige superuser
-- e fica para quando houver sessao com esse privilegio.

alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

do $$
declare
  v_postgres text;
begin
  select defaclacl::text into v_postgres
  from pg_default_acl
  where defaclrole = 'postgres'::regrole
    and defaclnamespace = 'public'::regnamespace
    and defaclobjtype = 'f';

  if coalesce(v_postgres, '') like '%anon=X%' then
    raise exception 'DEFAULT_PRIVILEGES_POSTGRES_AINDA_ANON: %', v_postgres;
  end if;
end $$;
