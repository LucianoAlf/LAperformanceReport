-- FATIA 0.2 / 0.3 — os tres papeis da Sol (07/09/2026).
--
-- `sol_operacional` · `sol_tatico` · `sol_estrategico`, um por publico das
-- quatro camadas: atendimento no dia a dia · gerente da unidade · Luciano.
--
-- 🔴 O DESENHO E O DA MARIA, verificado hoje: **a lista esconde, o GRANT
--    recusa**. Duas travas, e a de fora nao substitui a de dentro. Hoje a Sol
--    tem so a trava de dentro (as RPCs resolvem publico por `quem_eh`), e ela
--    e boa — mas e UMA so, e mora dentro da funcao que ela mesma protege.
--
-- ⚠️ O QUE O GRANT EXPRESSA E "QUAIS PORTAS", NAO "QUAIS LINHAS". O recorte por
--    unidade continua dentro das RPCs, via `governanca.quem_eh(telefone)` —
--    o GRANT nao sabe de linha. Sao camadas com perguntas diferentes:
--      GRANT ....... esta porta existe para voce?
--      quem_eh ..... destas linhas, quais sao suas?
--    Confundir as duas e o que faz gente achar que RLS resolve escopo de RPC
--    `SECURITY DEFINER` — e nesta casa ja esta documentado que nao resolve.
--
-- ⚠️ NENHUM DOS TRES LE TABELA. Nem as `sol_*`, nem view. Somente EXECUTE em
--    funcao. E o padrao `sol_caixa_readonly`, que ja existia certo (0 tabelas,
--    15 funcoes) e que a Fatia 0.1 acabou de impor a `sol_acesso_restrito`.
--    Quando a Fatia 1 criar as views `vw_sol_*`, elas entram aqui por GRANT
--    explicito — nunca por default.
--
-- ⚠️ NASCEM SEM LOGIN (`NOLOGIN`). Papel sem senha nao conecta; a ligacao com
--    o MCP e a Fatia 1. Criar com login agora seria abrir porta antes de
--    existir sala.
--
-- ⚠️ Os tres tem `EXECUTE` em `governanca.quem_eh` porque e ela que faz o
--    recorte por dentro — sem isso as portas nao conseguem se defender.

do $papeis$
declare p text; v_criados int := 0;
begin
  foreach p in array array['sol_operacional', 'sol_tatico', 'sol_estrategico'] loop
    if not exists (select 1 from pg_roles where rolname = p) then
      execute format('create role %I nologin', p);
      v_criados := v_criados + 1;
    end if;
    -- nada de default: cada porta e concedida nominalmente abaixo
    execute format('alter default privileges in schema public revoke all on tables from %I', p);
    execute format('alter default privileges in schema public revoke all on functions from %I', p);
    execute format('grant usage on schema public, governanca to %I', p);
    execute format('grant execute on function governanca.quem_eh(text) to %I', p);
  end loop;
  raise notice '0.2: % papel(is) criado(s), 3 configurados sem acesso a tabela', v_criados;
end $papeis$;

-- ── as portas de cada papel ────────────────────────────────────────────────
-- Hoje sao as RPCs que JA existem. A Fatia 1 acrescenta as portas nomeadas do
-- 1o andar a estas mesmas listas — o esqueleto e este.
do $portas$
declare
  -- operacional: o dia a dia do atendimento
  op text[] := array[
    'sol_caixa_resumo_do_dia', 'sol_caixa_inadimplentes', 'sol_faturas_alunos_v1',
    'get_situacao_alunos_v1', 'get_situacao_alunos_resumo_v1',
    'fn_presenca_pendencias_do_dia', 'radar_pendencias_comerciais_v1'];
  -- tatico: o operacional + a leitura da unidade
  tat text[] := array['sol_inadimplencia_v1', 'sol_kpis_alunos_v1', 'get_agenda_dia'];
  -- estrategico: o tatico + a rede
  est text[] := array['get_kpis_consolidados'];
  r record; v_ok int := 0; v_faltou text[] := '{}';
  fn text;
begin
  foreach fn in array (op || tat || est) loop
    if to_regproc('public.' || fn) is null then
      v_faltou := v_faltou || fn;
    end if;
  end loop;
  if array_length(v_faltou, 1) > 0 then
    raise notice 'ATENCAO — nao existem neste banco: %', array_to_string(v_faltou, ', ');
  end if;

  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and p.proname = any (op || tat || est)
  loop
    -- ⚠️ Hierarquico: operacional ⊂ tatico ⊂ estrategico. Quem esta mais alto
    --    enxerga tudo do mais baixo — como `lideranca` ve `comercial` na base
    --    de conhecimento da Mila.
    if r.proname = any (op) then
      execute format('grant execute on function public.%I(%s) to sol_operacional, sol_tatico, sol_estrategico', r.proname, r.args);
    elsif r.proname = any (tat) then
      execute format('grant execute on function public.%I(%s) to sol_tatico, sol_estrategico', r.proname, r.args);
    else
      execute format('grant execute on function public.%I(%s) to sol_estrategico', r.proname, r.args);
    end if;
    v_ok := v_ok + 1;
  end loop;
  raise notice '0.3: % portas concedidas de forma hierarquica', v_ok;
end $portas$;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare p text; v_tab int; v_fn int; v_login bool; linha text := '';
begin
  foreach p in array array['sol_operacional', 'sol_tatico', 'sol_estrategico'] loop
    select count(*) into v_tab from pg_class c
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where c.relkind in ('r', 'v') and has_table_privilege(p, c.oid, 'SELECT');
    -- 🔴 A invariante desta fatia: papel da Sol NAO LE TABELA NEM VIEW.
    if v_tab > 0 then
      raise exception '% enxerga % objetos por SELECT — deveria ser 0 (so funcao)', p, v_tab;
    end if;

    select rolcanlogin into v_login from pg_roles where rolname = p;
    if v_login then
      raise exception '% nasceu com LOGIN — a ligacao com o MCP e a Fatia 1', p;
    end if;

    select count(*) into v_fn from pg_proc f
     where f.pronamespace = 'public'::regnamespace
       and has_function_privilege(p, f.oid, 'EXECUTE')
       and array_to_string(f.proacl, ',') like '%' || p || '=X%';
    linha := linha || format('%s=%s portas · ', p, v_fn);
  end loop;

  -- hierarquia: estrategico >= tatico >= operacional
  raise notice 'papeis provados: % (0 tabelas, 0 views, sem login)', linha;
end $prova$;
