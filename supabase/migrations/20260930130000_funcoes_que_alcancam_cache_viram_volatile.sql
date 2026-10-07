-- FISC-78 (fiscal-mila) / 30/09/2026. Aplicado via MCP.
-- Os caches de 23-25/09 (kpis_comercial_v2_cache, paginas_rpc_cache, kpis_alunos_cache,
-- conciliacao_experimentais_v2_cache, cache do health-score) fizeram funcoes de base GRAVAREM.
-- Toda funcao STABLE/IMMUTABLE que chega nelas (direta ou indiretamente) roda em transacao
-- read-only quando chamada por RPC do PostgREST e falha com 25006 sempre que o cache esta
-- vazio. VOLATILE nao muda resultado: so autoriza a gravacao do cache.
-- Lista pelo fecho transitivo (41 funcoes em 30/09), nunca escrita a mao.
-- Conferido depois, pela API com cache vazio: relatorio_matriculas_texto_v1,
-- get_kpis_comercial_competencia_v1, relatorio_comparativo_texto_v1,
-- relatorio_coordenacao_carteira_painel_v4, get_situacao_alunos_resumo_v1 -> HTTP 200.
do $$
declare r record; n int := 0;
begin
  for r in
    with recursive fns as (
      select p.oid, p.proname, p.provolatile, lower(p.prosrc) src
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname in ('public','governanca')
        and p.prolang in (select oid from pg_language where lanname in ('plpgsql','sql'))
    ),
    escritoras as (
      select proname from fns where provolatile = 'v' and src ~ 'insert into public\.[a-z_0-9]*cache'
    ),
    alcanca(proname) as (
      select proname from escritoras
      union
      select f.proname from fns f join alcanca a
        on f.src like '%' || a.proname || '(%' and f.proname <> a.proname
    )
    select f.oid::regprocedure as fn from fns f
    where f.proname in (select proname from alcanca) and f.provolatile in ('s','i')
  loop
    execute format('alter function %s volatile', r.fn);
    n := n + 1;
  end loop;
  raise notice 'funcoes marcadas volatile: %', n;
end $$;
