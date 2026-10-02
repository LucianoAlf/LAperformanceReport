begin;
drop function if exists public.mike_padroes_marketing_v1(integer);
drop function if exists public.mike_professores_conversao_v1(integer,integer,integer,text,integer);
drop function if exists public.mike_ads_funil_campanha_v1(date,date,text,text);
drop function if exists public.mike_jornada_resumo_v1(date,date,text,text);
commit;
