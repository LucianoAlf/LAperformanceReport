-- Verificacao estrutural do Subprojeto A.
-- Nao depende de usuarios, movimentacoes ou pesquisas nominais.
-- Sempre termina em rollback.

begin;

do $verify_schema$
declare
  v_tabela text;
  v_role text;
  v_publico text;
  v_policy_count integer;
  v_template_count integer;
  v_template_corpo text;
  v_template_renderizado text;
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

  -- Deve existir exatamente um template ativo para direto e responsavel.
  foreach v_publico in array array['direto', 'responsavel'] loop
    select count(*)
      into v_template_count
    from public.pesquisa_evasao_templates t
    where t.publico = v_publico
      and t.ativo = true;

    if v_template_count <> 1 then
      raise exception
        'deve existir exatamente um template ativo para publico %, encontrados %',
        v_publico,
        v_template_count;
    end if;

    select t.corpo
      into strict v_template_corpo
    from public.pesquisa_evasao_templates t
    where t.publico = v_publico
      and t.ativo = true;

    if exists (
      select 1
      from regexp_matches(
        v_template_corpo,
        '\{\{([^{}]+)\}\}',
        'g'
      ) as placeholder(capturas)
      where (placeholder.capturas)[1] not in (
        'aluno_primeiro_nome',
        'responsavel_primeiro_nome',
        'assinatura_nome'
      )
    ) then
      raise exception 'template % contem placeholder nao permitido', v_publico;
    end if;

    if position('{{assinatura_nome}}' in v_template_corpo) = 0
       or position('{{aluno_primeiro_nome}}' in v_template_corpo) = 0
       or (
         v_publico = 'responsavel'
         and position('{{responsavel_primeiro_nome}}' in v_template_corpo) = 0
       ) then
      raise exception 'template % nao contem os placeholders obrigatorios', v_publico;
    end if;

    v_template_renderizado := replace(
      replace(
        replace(
          v_template_corpo,
          '{{aluno_primeiro_nome}}',
          'Aluno'
        ),
        '{{responsavel_primeiro_nome}}',
        'Responsavel'
      ),
      '{{assinatura_nome}}',
      'Operador'
    );

    if position('{{' in v_template_renderizado) > 0
       or position('}}' in v_template_renderizado) > 0 then
      raise exception 'template % deixa placeholder sem renderizar', v_publico;
    end if;
  end loop;

  if not has_table_privilege(
       'service_role',
       'public.pesquisa_evasao_templates',
       'SELECT'
     )
     or has_table_privilege(
       'service_role',
       'public.pesquisa_evasao_templates',
       'INSERT,UPDATE,DELETE'
     )
     or not has_table_privilege(
       'service_role',
       'public.pesquisa_evasao_assinaturas',
       'SELECT'
     )
     or has_table_privilege(
       'service_role',
       'public.pesquisa_evasao_assinaturas',
       'INSERT,UPDATE,DELETE'
     ) then
    raise exception 'ACL de configuracao de templates ou assinaturas incorreta';
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
