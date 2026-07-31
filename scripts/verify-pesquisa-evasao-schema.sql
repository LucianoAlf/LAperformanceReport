begin;

set local statement_timeout = '60s';
set local lock_timeout = '5s';

-- Verificador estrutural para o ensaio DDL descartavel. Consulta somente
-- catalogos e ACLs: nao depende de usuarios, alunos, movimentacoes ou caixas.
do $estrutura$
declare
  v_tabela text;
  v_role text;
  v_assinatura text;
  v_tabelas text[] := array[
    'pesquisa_evasao',
    'pesquisa_evasao_templates',
    'pesquisa_evasao_assinaturas',
    'pesquisa_evasao_previews',
    'pesquisa_evasao_publicos_internos',
    'pesquisa_evasao_mensagens',
    'pesquisa_evasao_transcricoes',
    'pesquisa_evasao_analises'
  ];
  v_service_only text[] := array[
    'pesquisa_evasao_templates',
    'pesquisa_evasao_assinaturas',
    'pesquisa_evasao_previews',
    'pesquisa_evasao_publicos_internos'
  ];
  v_funcoes text[] := array[
    'public.listar_evadidos_para_pesquisa(uuid,integer,integer,character varying)',
    'public.listar_evadidos_para_pesquisa(uuid,integer,integer,character varying,integer,integer)',
    'public.stats_pesquisa_evasao(uuid,integer,integer)',
    'public.criar_pesquisa_evasao(integer,text)',
    'public.pode_enviar_pesquisa_evasao(integer)',
    'public.listar_evadidos_para_pesquisa_v2(uuid,integer,integer,character varying,integer,integer,text)',
    'public.listar_pesquisas_evasao_teste_v1(integer)'
  ];
begin
  foreach v_tabela in array v_tabelas loop
    if to_regclass('public.' || v_tabela) is null then
      raise exception 'SCHEMA_VERIFY_TABELA_AUSENTE: %', v_tabela;
    end if;

    if not (
      select c.relrowsecurity
      from pg_class c
      where c.oid = to_regclass('public.' || v_tabela)
    ) then
      raise exception 'SCHEMA_VERIFY_RLS_DESLIGADA: %', v_tabela;
    end if;

    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(
        v_role,
        'public.' || v_tabela,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) then
        raise exception 'SCHEMA_VERIFY_ESCRITA_DIRETA: role=% tabela=%',
          v_role, v_tabela;
      end if;
    end loop;

    foreach v_role in array array[
      'mila_acesso_restrito',
      'sol_acesso_restrito',
      'fabio_agent',
      'lia_acesso_restrito'
    ] loop
      if has_table_privilege(
        v_role,
        'public.' || v_tabela,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) then
        raise exception 'SCHEMA_VERIFY_AGENTE_DIRETO: role=% tabela=%',
          v_role, v_tabela;
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(v_tabelas)
      and p.cmd = 'ALL'
  ) then
    raise exception 'SCHEMA_VERIFY_POLICY_ALL: policy ALL no dominio';
  end if;

  foreach v_tabela in array v_service_only loop
    if has_table_privilege(
      'authenticated',
      'public.' || v_tabela,
      'SELECT'
    ) then
      raise exception 'SCHEMA_VERIFY_SERVICE_ONLY_EXPOSTA: %', v_tabela;
    end if;
  end loop;

  foreach v_assinatura in array v_funcoes loop
    if to_regprocedure(v_assinatura) is null then
      raise exception 'SCHEMA_VERIFY_FUNCAO_AUSENTE: %', v_assinatura;
    end if;

    if has_function_privilege('anon', v_assinatura, 'EXECUTE') then
      raise exception 'SCHEMA_VERIFY_ANON_EXECUTE: %', v_assinatura;
    end if;

    if exists (
      select 1
      from pg_proc f
      cross join lateral aclexplode(
        coalesce(f.proacl, acldefault('f', f.proowner))
      ) acl
      where f.oid = to_regprocedure(v_assinatura)
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'SCHEMA_VERIFY_PUBLIC_EXECUTE: %', v_assinatura;
    end if;

    foreach v_role in array array[
      'mila_acesso_restrito',
      'sol_acesso_restrito',
      'fabio_agent',
      'lia_acesso_restrito'
    ] loop
      if has_function_privilege(v_role, v_assinatura, 'EXECUTE') then
        raise exception 'SCHEMA_VERIFY_AGENTE_EXECUTE: role=% funcao=%',
          v_role, v_assinatura;
      end if;
    end loop;

    if not has_function_privilege('service_role', v_assinatura, 'EXECUTE') then
      raise exception 'SCHEMA_VERIFY_SERVICE_ROLE_SEM_EXECUTE: %', v_assinatura;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'public.criar_pesquisa_evasao(integer,text)',
    'EXECUTE'
  ) then
    raise exception 'SCHEMA_VERIFY_CRIAR_EXPOSTA_A_AUTHENTICATED';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.capturar_telefone_snapshot_movimentacao_retencao()',
    'EXECUTE'
  ) then
    raise exception 'SCHEMA_VERIFY_TRIGGER_SNAPSHOT_EXPOSTO';
  end if;

  if to_regclass('public.whatsapp_caixas') is null then
    raise exception 'SCHEMA_VERIFY_WHATSAPP_CAIXAS_AUSENTE';
  end if;

  if has_column_privilege(
    'authenticated',
    'public.whatsapp_caixas',
    'uazapi_token',
    'SELECT'
  ) then
    raise exception 'SCHEMA_VERIFY_AUTHENTICATED_LE_UAZAPI_TOKEN';
  end if;

  if has_column_privilege(
    'authenticated',
    'public.whatsapp_caixas',
    'waha_api_key',
    'SELECT'
  ) then
    raise exception 'SCHEMA_VERIFY_AUTHENTICATED_LE_WAHA_API_KEY';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.whatsapp_caixas',
    'SELECT'
  ) then
    raise exception 'SCHEMA_VERIFY_SERVICE_ROLE_SEM_WHATSAPP_CAIXAS';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.listar_whatsapp_caixas_seguras(uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'SCHEMA_VERIFY_LISTAGEM_WHATSAPP_SEGURA_INDISPONIVEL';
  end if;
end
$estrutura$;

rollback;
