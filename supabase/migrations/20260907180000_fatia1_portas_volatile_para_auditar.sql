-- FATIA 1 — as 12 portas viram VOLATILE, senao a auditoria e cega (07/09/2026).
--
-- 🔴 O DEFEITO, medido em producao no mesmo dia em que criei a auditoria.
--
--    A Sol chamou `mcp__sol_portas__caixa_do_dia` (o log do agente prova:
--    "tool mcp__sol_portas__caixa_do_dia completed (0.15s, 430 chars)" as
--    21:14:41 UTC) e respondeu certo — "Caixa da Barra, ainda nao foi aberto".
--    `automacao_log` nao ganhou UMA linha. Na mesma bateria,
--    `mcp__sol_portas__inadimplencia` registrou normalmente.
--
--    A diferenca entre as duas nao esta no codigo delas, esta na VOLATILIDADE:
--    o PostgREST executa funcao `STABLE` em transacao **READ ONLY**. O
--    `insert into automacao_log` que mora dentro de `sol_resolver_escopo_v1`
--    levanta `read_only_sql_transaction`, e o `exception when others then null`
--    — que eu pus para o log jamais derrubar a porta — transforma isso em
--    silencio perfeito. Placar: **9 portas STABLE (mudas), 3 VOLATILE**.
--
-- 🔴 A LICAO, que vale para qualquer helper compartilhado: **acrescentar uma
--    ESCRITA a uma funcao lida por chamadores STABLE a desliga em silencio para
--    todos eles.** Nao ha erro, nao ha linha faltando visivelmente — ha um
--    registro que simplesmente nunca acontece. Foi o `exception when others`
--    que comprou o silencio, e ele estava certo em existir; o que faltava era o
--    contrapeso. Agora ha `raise warning`, que vai para o log do Postgres e nao
--    depende da escrita que acabou de falhar.
--
-- ⚠️ Isto NAO afrouxa a higiene da Fatia 0. La o criterio era o CORPO: quem
--    escreve nao pode ser STABLE. As portas passaram a escrever (auditoria) —
--    entao a classificacao delas mudou junto, que e o criterio funcionando, nao
--    sendo abandonado. `VOLATILE` aqui nao autoriza escrita de negocio: as 12
--    continuam so lendo e so registrando quem perguntou.

do $muda$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname like 'sol_porta_%' and p.provolatile = 's'
  loop
    execute format('alter function %s volatile', r.assinatura);
    n := n + 1;
  end loop;
  raise notice 'portas promovidas de STABLE para VOLATILE: %', n;
end $muda$;

-- ⚠️ O contrapeso do `exception when others`: falha de auditoria para de ser
--    invisivel. Vai para o log do Postgres, que nao depende da escrita que
--    falhou — e o `return` continua intocado, porque log quebrado nunca pode
--    derrubar a porta.
do $aviso$
declare v_def text; n int;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc where proname = 'sol_resolver_escopo_v1'
    and pronamespace = 'public'::regnamespace;

  n := (length(v_def) - length(replace(v_def, '    null;  -- ⚠️ log nunca derruba a porta', ''))) 
       / length('    null;  -- ⚠️ log nunca derruba a porta');
  if n <> 1 then
    raise exception 'ANCORA do swallow: esperava 1, achei %', n;
  end if;

  v_def := replace(v_def,
    '    null;  -- ⚠️ log nunca derruba a porta',
    '    -- ⚠️ log quebrado NUNCA derruba a porta — mas tambem nao pode sumir.'
 || chr(10) || '    --    O `raise warning` vai para o log do Postgres, que independe da'
 || chr(10) || '    --    escrita que acabou de falhar. Foi a falta dele que deixou 9 das 12'
 || chr(10) || '    --    portas sem auditoria por horas, em 07/09.'
 || chr(10) || '    raise warning ''sol_portas: auditoria falhou (%): %'', sqlstate, sqlerrm;');

  execute v_def;
  raise notice 'swallow da auditoria agora avisa no log do Postgres';
end $aviso$;

revoke all on function public.sol_resolver_escopo_v1(text, text) from public, anon;
grant execute on function public.sol_resolver_escopo_v1(text, text)
  to service_role, sol_operacional, sol_tatico, sol_estrategico;

-- ── prova: nenhuma porta pode ficar muda ──────────────────────────────────
do $prova$
declare v_mudas text[]; v_n int;
begin
  select array_agg(p.proname order by p.proname) into v_mudas
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname like 'sol_porta_%' and p.provolatile <> 'v';

  if v_mudas is not null then
    raise exception 'portas ainda STABLE (auditoria cega): %', v_mudas;
  end if;

  select count(*) into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname='public' and p.proname like 'sol_porta_%' and p.provolatile='v';
  if v_n <> 12 then
    raise exception 'esperava 12 portas VOLATILE, achei %', v_n;
  end if;

  raise notice 'prova: as 12 portas sao VOLATILE — a auditoria alcanca todas';
end $prova$;
