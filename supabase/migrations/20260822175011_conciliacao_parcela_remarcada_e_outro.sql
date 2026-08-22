-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Conciliacao financeira: dois rotulos novos de decisao.
-- Decisao do Hugo, 2026-08-22. Ver arquivo versionado
-- supabase/migrations/20260822153000_conciliacao_parcela_remarcada_e_outro.sql
-- para o racional completo (caso Daniel Victor / Barra, matricula 803).

alter table public.financeiro_fatura_reconciliacao_decisoes
  drop constraint if exists financeiro_fatura_reconciliacao_decisoes_tipo_decisao_check;

alter table public.financeiro_fatura_reconciliacao_decisoes
  add constraint financeiro_fatura_reconciliacao_decisoes_tipo_decisao_check
  check (tipo_decisao = any (array[
    'pagamento_confirmado'::text,
    'renovacao'::text,
    'trancamento'::text,
    'ultima_parcela_aviso_previo'::text,
    'conferido_sem_cobranca'::text,
    'forma_pagamento_manual'::text,
    'parcela_remarcada'::text,
    'outro'::text
  ]));

do $mig$
declare
  v_def text;
  v_new text;
  v_antigo text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'resolver_reconciliacao_fatura';

  if position('parcela_remarcada' in v_def) > 0 then
    raise notice 'resolver_reconciliacao_fatura ja aceita os rotulos novos';
  else
    v_antigo := '    ''conferido_sem_cobranca'',' || E'\n'
             || '    ''forma_pagamento_manual''' || E'\n'
             || '  ) then';

    if position(v_antigo in v_def) = 0 then
      raise exception 'ancora do enum de tipo_decisao nao encontrada';
    end if;

    v_novo := '    ''conferido_sem_cobranca'',' || E'\n'
           || '    ''forma_pagamento_manual'',' || E'\n'
           || '    ''parcela_remarcada'',' || E'\n'
           || '    ''outro''' || E'\n'
           || '  ) then';

    v_new := replace(v_def, v_antigo, v_novo);
    if v_new = v_def then
      raise exception 'replace do enum nao surtiu efeito';
    end if;
    execute v_new;
  end if;
end $mig$;

do $mig$
declare
  v_def text;
  v_new text;
  v_antigo text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_faturas_alunos_financeiro_v1_contrato_tipo_20260817';

  if position('parcela_remarcada' in v_def) > 0 then
    raise notice 'filtro de motivos ja conhece os rotulos novos';
    return;
  end if;

  v_antigo := '        or ''conferido_sem_cobranca'' = any(v_decisoes)' || E'\n'
           || '      ))';

  if position(v_antigo in v_def) = 0 then
    raise exception 'ancora do filtro de motivos nao encontrada';
  end if;

  v_novo := '        or ''conferido_sem_cobranca'' = any(v_decisoes)' || E'\n'
         || '        or ''parcela_remarcada'' = any(v_decisoes)' || E'\n'
         || '        or ''outro'' = any(v_decisoes)' || E'\n'
         || '      ))';

  v_new := replace(v_def, v_antigo, v_novo);
  if v_new = v_def then
    raise exception 'replace do filtro de motivos nao surtiu efeito';
  end if;
  execute v_new;
end $mig$;
