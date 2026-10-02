-- Validação da migration 20261002020000_canal_grupo_site_no_google.sql
-- Rodar em banco descartável DEPOIS do harness + migration. Nunca no banco vivo.
-- Fixture: 7 leads em set/2026 = 3 Google + 2 Site + 1 Instagram + 1 sem canal.

begin;

-- 1) coluna existe e Site tem grupo Google
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='canais_origem' and column_name='canal_grupo')
  then raise exception 'coluna canal_grupo ausente'; end if;
  if (select canal_grupo from public.canais_origem where nome='Site') <> 'Google'
  then raise exception 'Site nao agrupa em Google'; end if;
  if (select canal_grupo from public.canais_origem where nome='Instagram') <> 'Instagram'
  then raise exception 'Instagram nao ficou como grupo proprio'; end if;
end $$;

-- 2) origem_canal agrupada: Google=5 (3+2), Instagram=1, Sem canal=1; total=7
do $$
declare v jsonb; c record; tot int;
begin
  v := public.kpis_comercial_v2_sem_cache_20260923('00000000-0000-0000-0000-0000000000aa', 2026, 9, 'mensal', null)->'origem_canal';

  if exists (select 1 from jsonb_array_elements(v) x where x->>'canal' = 'Site')
  then raise exception 'canal Site ainda aparece separado: %', v; end if;

  select * into c from jsonb_array_elements(v) x where x->>'canal' = 'Google' limit 1;
  if (c->>'leads')::int <> 5 then raise exception 'Google devia ter 5 leads (3+2), veio %', c->>'leads'; end if;
  if not ((c->'canais_originais') @> '["Google","Site"]'::jsonb)
  then raise exception 'canais_originais sem Google+Site: %', c->'canais_originais'; end if;

  select sum((x->>'leads')::int) into tot from jsonb_array_elements(v) x;
  if tot <> 7 then raise exception 'total de leads mudou: %', tot; end if;
end $$;

-- 3) upsert_lead: 'SITE' puro vira Google; bruto fica no log
do $$
declare r json; lid int; g int;
begin
  select id into g from public.canais_origem where nome='Google';
  r := public.upsert_lead('Novo Site', null, null, '00000000-0000-0000-0000-0000000000aa', 'Violão', 'SITE', 99001, 'emusys', false, date '2026-09-20', null);
  lid := (r->>'lead_id')::int;
  if (select canal_origem_id from public.leads where id = lid) <> g
  then raise exception 'SITE puro nao virou Google'; end if;
  if (select detalhes->>'canal' from public.leads_automacao_log where lead_id = lid) <> 'Google'
     or (select detalhes->>'canal_bruto' from public.leads_automacao_log where lead_id = lid) <> 'SITE'
  then raise exception 'canal_bruto nao preservou o rótulo SITE'; end if;
end $$;

-- 4) mike_funil_v2: texto já fala do agrupamento (não pede mais para somar)
do $$
begin
  if pg_get_functiondef('public.mike_funil_v2(integer,integer,text)'::regprocedure) not like '%canal_grupo%'
  then raise exception 'mike_funil_v2 sem referencia ao canal_grupo'; end if;
end $$;

rollback;
