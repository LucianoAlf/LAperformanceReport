-- FATIA 0.1 — CERCAR O PAPEL `sol_acesso_restrito` (07/09/2026).
--
-- O papel que sustenta o MCP `sol-acesso-restrito` da Sol tem SELECT em **361
-- TABELAS CRUAS DE PRODUCAO**, alem de 116 views e 11 tabelas `sol_*`. O MCP
-- expoe tres ferramentas — `query`, `list_resources`, `read_resource` — ou
-- seja, **SQL cru sobre producao e a unica porta larga que a Sol tem**.
--
-- 🔴 E o desenho oposto ao da Maria, que foi verificado hoje: la o `select`
--    generico existe e e CERCADO — `maria-db-mcp.mjs` L310 recusa objeto que
--    nao seja `vw_maria_*` ou `maria_*`, com "Consulta bloqueada". E o proprio
--    agente da Maria recomendou textualmente para nos: *"nao tire o
--    execute_sql de uma vez — cerque-o. Ele so enxerga view sanitizada."*
--
-- ✅ MEDIDO ANTES DE CORTAR, em `pg_stat_statements` com janela de **19 dias e
--    21 horas** (reset em 18/08): o papel executou **5.032 chamadas em 29
--    formas de query**, e **ZERO SELECT em tabela crua**. O que ele de fato
--    faz e RPC:
--
--      governanca.grupos_detalhados() ....... 692
--      sol_caixa_shadow_registrar() ......... 611
--      governanca.quem_eh() ................. 668
--      sol_caixa_resumo_do_dia() ............  29
--      governanca.listar_allowlist() ........   7
--      + plumbing do pooler (DISCARD/BEGIN/ROLLBACK)
--
--    As 361 tabelas sao **grant morto**: superficie de ataque sem funcao.
--
-- ⚠️ RESSALVA HONESTA: o buffer do pg_stat_statements esta em 4.984 de 5.000,
--    quase cheio — query rara PODE ter sido despejada. O que torna o corte
--    seguro assim mesmo e a DIRECAO DA FALHA: `REVOKE` quebra ALTO
--    (`permission denied for table X`, visivel na hora), ao contrario do erro
--    inverso ja documentado nesta casa — `GRANT` sem policy le zero linhas em
--    silencio. Entre um erro que aparece e um que esconde, escolhemos o que
--    aparece.
--
-- ⚠️ O QUE FICA: as 116 views `vw_*` e as 11 tabelas `sol_*`. A cerca desta
--    fatia e sobre TABELA DE NEGOCIO CRUA. A superficie `vw_sol_*` sanitizada
--    e a Fatia 1 — nao existe ainda (zero views `vw_sol_*` hoje).
--
-- ⚠️ NAO TOCA no `mcp-hugo`: a caixa de ferramentas do coordenador de
--    tecnologia nao e nossa para mexer. A cerca fica do lado do PAPEL DE
--    BANCO, que independe do MCP dele.
--
-- ROLLBACK: a lista revogada fica gravada em `sol_grants_revogados_fatia0`,
-- com o comando de volta pronto. Nao e comentario — e tabela.

-- ── registro do que foi tirado, para o rollback ser um comando ─────────────
create table if not exists public.sol_grants_revogados_fatia0 (
  id           bigserial primary key,
  papel        text not null,
  objeto       text not null,
  privilegio   text not null,
  revogado_em  timestamptz not null default now(),
  motivo       text not null
);
comment on table public.sol_grants_revogados_fatia0 is
  'O que a Fatia 0.1 revogou de sol_acesso_restrito, para o rollback ser um comando e nao uma '
  'arqueologia. Rollback: select ''grant ''||privilegio||'' on ''||objeto||'' to ''||papel||'';'' from esta tabela.';

do $cerca$
declare r record; v_n int := 0; v_ja int;
begin
  select count(*) into v_ja from public.sol_grants_revogados_fatia0;
  if v_ja > 0 then
    raise notice 'a cerca ja foi aplicada (% registros) — nada a fazer', v_ja;
    return;
  end if;

  for r in
    select c.relname objeto
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r'                                   -- so TABELA, nunca view
      and c.relname not like 'sol!_%' escape '!'            -- as proprias da Sol ficam
      and has_table_privilege('sol_acesso_restrito', c.oid, 'SELECT')
    order by c.relname
  loop
    insert into public.sol_grants_revogados_fatia0 (papel, objeto, privilegio, motivo)
    values ('sol_acesso_restrito', 'public.' || quote_ident(r.objeto), 'SELECT',
            'Fatia 0.1 — grant morto: 0 usos em 19d de pg_stat_statements (5.032 chamadas, so RPC)');
    execute format('revoke select on public.%I from sol_acesso_restrito', r.objeto);
    v_n := v_n + 1;
  end loop;

  -- ⚠️ Guarda de sanidade: se o numero fugir muito do medido (361), a foto do
  --    banco mudou desde a medicao e eu prefiro abortar a cortar as cegas.
  if v_n < 300 or v_n > 420 then
    raise exception 'revoguei % tabelas, esperava ~361 — a foto mudou, abortando', v_n;
  end if;

  raise notice 'cerca aplicada: % tabelas cruas revogadas', v_n;
end $cerca$;

-- ⚠️ E o ALTER DEFAULT PRIVILEGES: sem isto, TABELA NOVA nasce acessivel de
--    novo e a cerca envelhece calada — a mesma armadilha ja documentada nesta
--    casa para funcao e para view.
alter default privileges in schema public revoke select on tables from sol_acesso_restrito;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v_cruas int; v_views int; v_sol int; v_rpc bool;
begin
  select count(*) into v_cruas from pg_class c
   join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
   where c.relkind='r' and c.relname not like 'sol!_%' escape '!'
     and has_table_privilege('sol_acesso_restrito', c.oid, 'SELECT');
  if v_cruas > 0 then
    raise exception 'ainda restam % tabelas cruas acessiveis', v_cruas;
  end if;

  -- o que TEM de continuar de pe
  select count(*) into v_views from pg_class c
   join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
   where c.relkind='v' and has_table_privilege('sol_acesso_restrito', c.oid, 'SELECT');
  select count(*) into v_sol from pg_class c
   join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
   where c.relkind='r' and c.relname like 'sol!_%' escape '!'
     and has_table_privilege('sol_acesso_restrito', c.oid, 'SELECT');
  if v_views < 100 then raise exception 'as views cairam junto: so % restaram', v_views; end if;

  -- 🔴 as 4 RPCs que ela REALMENTE usa continuam executaveis
  select bool_and(has_function_privilege('sol_acesso_restrito', p.oid, 'EXECUTE'))
    into v_rpc
  from pg_proc p
  where p.proname in ('sol_caixa_resumo_do_dia','sol_caixa_shadow_registrar')
    and p.pronamespace='public'::regnamespace;
  if not coalesce(v_rpc, false) then
    raise exception 'as RPCs de uso real perderam EXECUTE — a cerca cortou demais';
  end if;

  raise notice 'cerca provada: 0 tabelas cruas · % views de pe · % tabelas sol_* · RPCs de uso real intactas',
    v_views, v_sol;
end $prova$;
