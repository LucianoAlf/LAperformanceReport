-- Rodar em banco descartável depois da migration. Nunca no banco vivo como teste mutável.
begin;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure assinatura,p.prosecdef,p.provolatile,p.proconfig,p.proacl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'mike_jornada_resumo_v1','mike_ads_funil_campanha_v1','mike_professores_conversao_v1','mike_padroes_marketing_v1'
    )
  loop
    if not r.prosecdef then raise exception '% precisa ser SECURITY DEFINER',r.assinatura; end if;
    if not ('search_path=pg_catalog, public'=any(r.proconfig)) then raise exception '% sem search_path fixo',r.assinatura; end if;
    if has_function_privilege('anon',r.assinatura,'EXECUTE') or has_function_privilege('authenticated',r.assinatura,'EXECUTE') then
      raise exception '% exposta a papel de usuário',r.assinatura;
    end if;
    if not has_function_privilege('mike_mcp',r.assinatura,'EXECUTE') then raise exception '% negada ao mike_mcp',r.assinatura; end if;
  end loop;
end $$;

set session authorization mike_mcp;
select public.mike_jornada_resumo_v1(date '2026-09-01',date '2026-10-01',null,null);
select public.mike_ads_funil_campanha_v1(date '2026-09-01',date '2026-10-01',null,null);
select public.mike_professores_conversao_v1(2026,9,9,null,5);
select public.mike_padroes_marketing_v1(20);
reset session authorization;

do $$
declare payload text;
begin
  payload := public.mike_jornada_resumo_v1(date '2026-09-01',date '2026-10-01',null,null)::text;
  if payload ~* E'"(telefone|email|lead_id|aluno_id|nome)"\\s*:' then raise exception 'possível PII no contrato jornada'; end if;
end $$;

rollback;
