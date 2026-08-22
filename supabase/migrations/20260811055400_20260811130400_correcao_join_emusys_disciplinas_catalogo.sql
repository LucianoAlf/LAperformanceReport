-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 2026-08-11 — Correcao: get_agenda_dia voltou a fazer join direto em
-- emusys_disciplinas_catalogo, que tem RLS sem policy e sem grant para
-- authenticated. A migration 20260811130100 recriou a funcao com drop+create
-- e desfez a correcao da 20260803170725, que trocava o join para a view
-- vw_disciplinas_modalidade (security_invoker=false).
-- Mesma cirurgia: replace no corpo deployado.

do $mig$
declare
  v_def text;
  v_ancora text;
begin
  select pg_get_functiondef('public.get_agenda_dia(date, uuid)'::regprocedure) into v_def;

  v_ancora := 'left join emusys_disciplinas_catalogo dc';
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'ancora do join nao bateu exatamente 1x';
  end if;

  execute replace(v_def, v_ancora, 'left join vw_disciplinas_modalidade dc');
end $mig$;
