-- Rollback de 20261002030000_mike_funil_semana_v1.sql
-- Remove a função nova; nada mais é tocado (nenhuma tabela/dado criado por ela).

drop function if exists public.mike_funil_semana_v1(date, date, text);
