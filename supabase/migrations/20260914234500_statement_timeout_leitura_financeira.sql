-- Teto de tempo proprio para a leitura financeira canonica.
--
-- POR QUE: o papel `authenticator` impoe statement_timeout = 8s e toda sessao do
-- PostgREST o herda (defaults do Supabase: anon 3s, authenticated 8s, service_role e
-- postgres sem teto proprio). A leitura financeira do Consolidado custa ~2,5-3,0s em
-- repouso, mas medida em producao pelo proprio app (pg_stat_statements, janela de 1,9h
-- em 14/09) deu media 4.928 ms e MAXIMO 7.335 ms -- o pior caso passava a 665 ms do
-- teto. Qualquer concorrencia empurra acima de 8s: o cron financeiro roda 5
-- competencias de ~28s cada (23:11 -> 23:15 em 14/09, a janela exata do relato), a RPC
-- morre com 57014 e a tela faz fail-closed exibindo
-- "Falha na leitura financeira - cobranca bloqueada". Aconteceu em 14/09 as 21h e de
-- novo as 23h.
--
-- ⚠️ Isto NAO baratea a leitura -- troca "banner de erro" por "a tela demora mais".
-- O custo intrinseco segue aberto como frente propria: 88% dele esta em
-- get_inadimplencia_canonica, e NAO ha trabalho duplicado (medido: v3_base 2,14s ->
-- v4_base 2,18s -> topo 2,20s, a aritmetica fecha).
--
-- ⚠️ Por FUNCAO, nunca no papel: os 8s do `authenticator` sao guard-rail contra query
-- de usuario descontrolada e continuam valendo para todo o resto. Mesmo padrao do fix
-- de 28/08 (publish_financeiro_sync_run, migration 20260828210500).
--
-- ⚠️ Somente as 4 funcoes que `authenticated` consegue EXECUTE, ou seja, as portas de
-- entrada reais. As internas (_base, _contrato_tipo_, v3/v4_base) nao sao alcancaveis de
-- fora e herdam o teto de quem as chamou.
--
-- 🔴 COMO VALIDAR ISTO -- e como NAO validar. Provar pelo SQL editor com
--    `set local statement_timeout = '1s'` num statement anterior da mesma transacao da
--    FALSO NEGATIVO: o teto ja foi armado e o ALTER FUNCTION parece inocuo (dentro da
--    funcao current_setting devolve '30s' e a query morre assim mesmo). Nao e assim que
--    o PostgREST opera. A prova valida e por HTTP, no caminho real. Medido em 14/09,
--    duas funcoes que dormem 12s chamadas com a anon key (teto do anon = 3s):
--      sem teto proprio -> HTTP 500, 3s,  {"code":"57014"}
--      com teto proprio -> HTTP 200, 12s, respondeu normalmente
--    Bate com a doc oficial (supabase.com/docs/guides/database/postgres/timeouts,
--    secao "Function level": "This works with the Database REST API").

alter function public.get_faturas_alunos_financeiro_v1(uuid, integer, integer, text, text, date)
  set statement_timeout = '30s';

alter function public.get_faturas_alunos_financeiro_v1_contrato_20260817(uuid, integer, integer, text, text, date)
  set statement_timeout = '30s';

alter function public.get_faturas_alunos_financeiro_v1_canonica_20260817(uuid, integer, integer, text, text, date)
  set statement_timeout = '30s';

alter function public.get_inadimplencia_canonica(uuid, date)
  set statement_timeout = '30s';

-- Guarda: se alguma das 4 nao ficou com o teto, a migration falha em vez de passar calada.
do $$
declare faltando text;
begin
  select string_agg(p.proname, ', ') into faltando
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'get_faturas_alunos_financeiro_v1',
      'get_faturas_alunos_financeiro_v1_contrato_20260817',
      'get_faturas_alunos_financeiro_v1_canonica_20260817',
      'get_inadimplencia_canonica')
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) as c
      where c = 'statement_timeout=30s'
    );
  if faltando is not null then
    raise exception 'statement_timeout nao aplicado em: %', faltando;
  end if;
end $$;
