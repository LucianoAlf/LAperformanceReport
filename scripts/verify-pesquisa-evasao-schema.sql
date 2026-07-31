-- Verificacao estrutural do Subprojeto A.
-- Nao depende de usuarios, movimentacoes ou pesquisas nominais.
-- Sempre termina em rollback.

begin;

do $verify_schema$
declare
  v_tabela text;
  v_role text;
  v_policy_count integer;
begin
  if to_regprocedure('public.fn_pesquisa_evasao_usuario_interno_ativo()') is null then
    raise exception 'helper de usuario interno ativo ausente';
  end if;

  if to_regprocedure('public.listar_evadidos_para_pesquisa(uuid,integer,integer,character varying)') is null
     or to_regprocedure('public.listar_evadidos_para_pesquisa(uuid,integer,integer,character varying,integer,integer)') is null
     or to_regprocedure('public.stats_pesquisa_evasao(uuid,integer,integer)') is null
     or to_regprocedure('public.pode_enviar_pesquisa_evasao(integer)') is null
     or to_regprocedure('public.listar_evadidos_para_pesquisa_v2(uuid,integer,integer,character varying,integer,integer,text)') is null
     or to_regprocedure('public.listar_pesquisas_evasao_teste_v1(integer)') is null then
    raise exception 'uma ou mais RPCs operacionais estao ausentes';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'pesquisa_evasao_previews'
      and c.column_name = 'assinatura_id'
      and c.is_nullable <> 'YES'
  ) then
    raise exception 'assinatura_id da preview precisa aceitar fallback sem override';
  end if;

  foreach v_tabela in array array[
    'pesquisa_evasao',
    'pesquisa_evasao_mensagens',
    'pesquisa_evasao_transcricoes',
    'pesquisa_evasao_analises'
  ] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_tabela
        and c.relrowsecurity = true
    ) then
      raise exception 'RLS ausente em %', v_tabela;
    end if;

    select count(*)
      into v_policy_count
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = v_tabela
      and p.cmd = 'SELECT'
      and 'authenticated' = any(p.roles)
      and p.qual ilike '%fn_pesquisa_evasao_usuario_interno_ativo%';

    if v_policy_count <> 1 then
      raise exception 'policy interna ativa ausente ou duplicada em %', v_tabela;
    end if;

    if not has_table_privilege('authenticated', format('public.%I', v_tabela), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', v_tabela), 'INSERT')
       or has_table_privilege('authenticated', format('public.%I', v_tabela), 'UPDATE')
       or has_table_privilege('authenticated', format('public.%I', v_tabela), 'DELETE') then
      raise exception 'ACL de authenticated incorreta em %', v_tabela;
    end if;

    foreach v_role in array array[
      'mila_acesso_restrito',
      'sol_acesso_restrito',
      'fabio_agent',
      'lia_acesso_restrito'
    ] loop
      if has_table_privilege(v_role, format('public.%I', v_tabela), 'SELECT,INSERT,UPDATE,DELETE') then
        raise exception 'role % possui acesso direto a %', v_role, v_tabela;
      end if;
    end loop;
  end loop;

  if has_table_privilege('anon', 'public.pesquisa_evasao', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'anon possui acesso direto a pesquisa_evasao';
  end if;

  if has_table_privilege('authenticated', 'public.whatsapp_caixas', 'SELECT')
     or has_column_privilege('authenticated', 'public.whatsapp_caixas', 'uazapi_token', 'SELECT')
     or has_column_privilege('authenticated', 'public.whatsapp_caixas', 'waha_api_key', 'SELECT') then
    raise exception 'authenticated ainda alcanca credenciais de whatsapp_caixas';
  end if;

  if has_function_privilege(
       'anon',
       'public.listar_evadidos_para_pesquisa_v2(uuid,integer,integer,character varying,integer,integer,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.listar_evadidos_para_pesquisa_v2(uuid,integer,integer,character varying,integer,integer,text)',
       'EXECUTE'
     ) then
    raise exception 'ACL da listagem V2 incorreta';
  end if;
end;
$verify_schema$;

rollback;
