-- Rollback de 20261008180000_financeiro_cnpj_vinculos.sql
-- Remove tabelas e funcoes do resolvedor de CNPJ + export de baixadas.
-- A chave do vault NAO e removida (vault nao expõe delete via SQL publico;
-- a chave orfa e inofensiva — apagar pelo dashboard se necessario).

drop function if exists public.exportar_financeiro_baixadas_v1(date, timestamptz, uuid, integer);
drop function if exists public.resolver_financeiro_cnpj_v1(text);
drop function if exists public.publicar_financeiro_cnpj_vinculos_v1(jsonb, text);
drop function if exists private.mascarar_cnpj(text);
drop function if exists private.calcular_financeiro_cnpj_hmac(text);
drop table if exists public.financeiro_cnpj_ignorados;
drop table if exists public.financeiro_cnpj_vinculos;
