\set ON_ERROR_STOP on

begin;

do $verify$
declare
  v_policy_count bigint;
  v_forbidden_columns bigint;
  v_cron_count bigint;
begin
  if to_regclass('public.whatsapp_caixa_webhook_secrets') is null then
    raise exception 'whatsapp_caixa_webhook_secrets ausente';
  end if;

  if to_regclass('public.webhook_debug_log') is null then
    raise exception 'webhook_debug_log ausente';
  end if;

  if to_regclass('public.webhook_diagnosticos_sanitizados') is null then
    raise exception 'webhook_diagnosticos_sanitizados ausente';
  end if;

  if not coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'whatsapp_caixa_webhook_secrets'
  ), false) then
    raise exception 'RLS desabilitada em whatsapp_caixa_webhook_secrets';
  end if;

  if has_table_privilege('authenticated', 'public.whatsapp_caixa_webhook_secrets', 'select')
     or has_table_privilege('anon', 'public.whatsapp_caixa_webhook_secrets', 'select')
     or not has_table_privilege('service_role', 'public.whatsapp_caixa_webhook_secrets', 'select') then
    raise exception 'ACL da tabela de hashes divergiu';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.validar_webhook_caixa_hash(integer,text)',
       'execute'
     )
     or not has_function_privilege(
       'anon',
       'public.validar_webhook_caixa_hash(integer,text)',
       'execute'
     ) then
    raise exception 'ACL do validador booleano divergiu';
  end if;

  if public.validar_webhook_caixa_hash(null, null)
     or public.validar_webhook_caixa_hash(0, repeat('a', 64))
     or public.validar_webhook_caixa_hash(1, 'hash-invalido') then
    raise exception 'input invalido foi aceito pelo validador';
  end if;

  select count(*)
    into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'whatsapp_caixa_webhook_secrets',
      'webhook_debug_log',
      'webhook_diagnosticos_sanitizados'
    );

  if v_policy_count <> 0 then
    raise exception 'tabela backend-only recebeu % policies', v_policy_count;
  end if;

  if has_table_privilege('service_role', 'public.webhook_debug_log', 'insert')
     or has_table_privilege('authenticated', 'public.webhook_debug_log', 'select') then
    raise exception 'webhook_debug_log ainda possui escritor/leitor de aplicacao';
  end if;

  if (select count(*) from public.webhook_debug_log) <> 0 then
    raise exception 'webhook_debug_log nao foi integralmente expurgada';
  end if;

  select count(*)
    into v_forbidden_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'webhook_diagnosticos_sanitizados'
    and (
      (
        column_name <> 'provider_message_id_hash'
        and column_name ~* '(payload|body|message|phone|telefone|nome|url|token|transcri)'
      )
      or data_type in ('json', 'jsonb')
    );

  if v_forbidden_columns <> 0 then
    raise exception 'diagnostico sanitizado possui % colunas livres/sensiveis', v_forbidden_columns;
  end if;

  if has_table_privilege('authenticated', 'public.webhook_diagnosticos_sanitizados', 'select')
     or not has_table_privilege('service_role', 'public.webhook_diagnosticos_sanitizados', 'insert') then
    raise exception 'ACL do diagnostico sanitizado divergiu';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.expurgar_webhook_diagnosticos_sanitizados()',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.expurgar_webhook_diagnosticos_sanitizados()',
       'execute'
     ) then
    raise exception 'ACL da funcao de retencao divergiu';
  end if;

  select count(*)
    into v_cron_count
  from cron.job
  where jobname = 'expurgar-webhook-diagnosticos-sanitizados'
    and command = 'select public.expurgar_webhook_diagnosticos_sanitizados();';

  if v_cron_count <> 1 then
    raise exception 'job de retencao divergiu: % encontrados', v_cron_count;
  end if;
end;
$verify$;

rollback;
