-- FATIA 0.4 e 0.5 — higiene do alicerce da Sol (07/09/2026).
--
-- 0.4 — As RPCs de LEITURA declaradas VOLATILE. Sao 18, medidas no inventario
--       de hoje: `sol_inadimplencia_v1`, `sol_kpis_alunos_v1`,
--       `sol_faturas_alunos_v1`, `sol_caixa_inadimplentes` e outras que so
--       leem. VOLATILE nao e defeito funcional, mas custa em dois lugares:
--       o planner nao pode cachear nem inlinear a chamada, e quem le o
--       catalogo nao consegue distinguir o que grava do que nao grava — que e
--       exatamente a pergunta do Alf hoje ("essas RPCs sao de leitura ou de
--       escrita?"). Marcar `STABLE` responde essa pergunta no proprio banco.
--
-- ⚠️ SO marca a funcao que comprovadamente NAO ESCREVE, verificando o corpo
--    com `pg_get_functiondef` no momento da migration. Marcar STABLE uma
--    funcao que grava e pior que nao marcar: o planner passa a poder chamar
--    menos vezes do que o codigo pede, e a escrita some de forma imprevisivel.
--
-- 0.5 — As tres tabelas de auditoria VAZIAS (`sol_caixa_operacoes_auditoria_v1`,
--       `sol_caixa_v3_caixa_operacoes_v1`, `whatsapp_caixas_credenciais_auditoria`).
--       Foram criadas e nunca escritas. Operacao de caixa — abrir, fechar,
--       reabrir, estornar — nao tem trilha hoje; so o LANCAMENTO tem
--       (`sol_caixa_lancamento_auditoria`, 343 linhas, viva).
--
-- 🔴 Isto importa por precedente desta casa: em 31/08 dois lancamentos
--    confirmados pela Sol sumiram minutos depois do "Lancei ✅" e NAO HAVIA
--    COMO SABER QUEM APAGOU — a mesma armadilha da Catarina Petrolongo. A
--    resposta ali foi trigger de auditoria em `caixa_movimentacoes`. Aqui e o
--    mesmo remedio para a operacao do caixa em si.

-- ── 0.4: marcar como STABLE o que so le ─────────────────────────────────────
do $higiene$
declare r record; v_n int := 0; v_pulou int := 0; v_def text;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and p.proname like 'sol!_%' escape '!'
      and p.provolatile = 'v'
    order by p.proname
  loop
    v_def := pg_get_functiondef(r.oid);
    -- ⚠️ A prova de que nao escreve e o CORPO, nao o nome. Nome como
    --    `sol_caixa_validar_*` parece leitura e pode gravar log.
    if v_def ~* '(insert\s+into|update\s+\w|delete\s+from|create\s+temp|nextval|perform\s+set_config)' then
      v_pulou := v_pulou + 1;
      continue;
    end if;
    execute format('alter function public.%I(%s) stable', r.proname, r.args);
    v_n := v_n + 1;
  end loop;
  raise notice '0.4: % funcoes marcadas STABLE · % puladas por escreverem', v_n, v_pulou;
end $higiene$;

-- ── 0.5: a trilha das operacoes de caixa ───────────────────────────────────
-- ⚠️ Reusa `fn_audit_log`/`audit_log`, que ja e o padrao desta casa (o mesmo
--    trigger que foi posto em `caixa_movimentacoes` em 31/08). Nao inventa
--    tabela nova: a pergunta "quem mexeu nisto" tem de ter UMA resposta.
do $trilha$
declare r record; v_n int := 0;
begin
  if to_regproc('public.fn_audit_log') is null then
    raise notice '0.5: fn_audit_log nao existe neste banco — trilha nao aplicada';
    return;
  end if;
  for r in select unnest(array['caixas_diarios', 'caixa_reaberturas_log']) t
  loop
    if to_regclass('public.' || r.t) is null then continue; end if;
    if exists (select 1 from pg_trigger g
                where g.tgrelid = ('public.' || r.t)::regclass
                  and g.tgname = 'trg_audit_' || r.t) then
      continue;
    end if;
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function public.fn_audit_log()',
      'trg_audit_' || r.t, r.t);
    v_n := v_n + 1;
  end loop;
  raise notice '0.5: trilha ligada em % tabela(s) de operacao de caixa', v_n;
end $trilha$;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v_vol int; v_stable int; v_trig int; v_escreve_stable int;
begin
  select count(*) filter (where provolatile='v'), count(*) filter (where provolatile='s')
    into v_vol, v_stable
  from pg_proc where pronamespace='public'::regnamespace and prokind='f'
    and proname like 'sol!_%' escape '!';

  -- 🔴 O erro que importa: funcao que ESCREVE marcada como STABLE.
  select count(*) into v_escreve_stable
  from pg_proc p
  where p.pronamespace='public'::regnamespace and p.prokind='f'
    and p.proname like 'sol!_%' escape '!' and p.provolatile='s'
    and pg_get_functiondef(p.oid) ~* '(insert\s+into|update\s+\w|delete\s+from)';
  if v_escreve_stable > 0 then
    raise exception '% funcoes que ESCREVEM ficaram marcadas STABLE — reverter', v_escreve_stable;
  end if;

  select count(*) into v_trig from pg_trigger
   where tgname like 'trg_audit_caixa%' or tgname = 'trg_audit_caixas_diarios';

  raise notice 'higiene provada: sol_* com % stable e % volatile · 0 escritoras marcadas stable · % triggers de auditoria',
    v_stable, v_vol, v_trig;
end $prova$;
