begin;

set local statement_timeout = '60s';
set local lock_timeout = '5s';

-- Execute somente depois das migrations 20260730170000, 20260730173000 e
-- 20260730180100 e
-- depois da atribuicao nominal descrita no runbook. Todo dado de prova abaixo
-- existe apenas nesta transacao e e removido pelo ROLLBACK final.

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
      raise exception 'RLS_VERIFY_TABELA_AUSENTE: %', v_tabela;
    end if;

    if not (
      select c.relrowsecurity
      from pg_class c
      where c.oid = to_regclass('public.' || v_tabela)
    ) then
      raise exception 'RLS_VERIFY_RLS_DESLIGADA: %', v_tabela;
    end if;

    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(
        v_role,
        'public.' || v_tabela,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) then
        raise exception 'RLS_VERIFY_ESCRITA_DIRETA: role=% tabela=%',
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
        raise exception 'RLS_VERIFY_AGENTE_DIRETO: role=% tabela=%',
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
    raise exception 'RLS_VERIFY_POLICY_ALL: policy ALL no dominio';
  end if;

  foreach v_tabela in array v_service_only loop
    if has_table_privilege(
      'authenticated',
      'public.' || v_tabela,
      'SELECT'
    ) then
      raise exception 'RLS_VERIFY_SERVICE_ONLY_EXPOSTA: %', v_tabela;
    end if;
  end loop;

  foreach v_assinatura in array v_funcoes loop
    if to_regprocedure(v_assinatura) is null then
      raise exception 'RLS_VERIFY_FUNCAO_AUSENTE: %', v_assinatura;
    end if;

    if has_function_privilege('anon', v_assinatura, 'EXECUTE') then
      raise exception 'RLS_VERIFY_ANON_EXECUTE: %', v_assinatura;
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
      raise exception 'RLS_VERIFY_PUBLIC_EXECUTE: %', v_assinatura;
    end if;

    foreach v_role in array array[
      'mila_acesso_restrito',
      'sol_acesso_restrito',
      'fabio_agent',
      'lia_acesso_restrito'
    ] loop
      if has_function_privilege(v_role, v_assinatura, 'EXECUTE') then
        raise exception 'RLS_VERIFY_AGENTE_EXECUTE: role=% funcao=%',
          v_role, v_assinatura;
      end if;
    end loop;

    if not has_function_privilege('service_role', v_assinatura, 'EXECUTE') then
      raise exception 'RLS_VERIFY_SERVICE_ROLE_SEM_EXECUTE: %', v_assinatura;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'public.criar_pesquisa_evasao(integer,text)',
    'EXECUTE'
  ) then
    raise exception 'RLS_VERIFY_CRIAR_EXPOSTA_A_AUTHENTICATED';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.capturar_telefone_snapshot_movimentacao_retencao()',
    'EXECUTE'
  ) then
    raise exception 'RLS_VERIFY_TRIGGER_SNAPSHOT_EXPOSTO';
  end if;

  if to_regclass('public.whatsapp_caixas') is null then
    raise exception 'RLS_VERIFY_WHATSAPP_CAIXAS_AUSENTE';
  end if;

  if has_column_privilege(
    'authenticated',
    'public.whatsapp_caixas',
    'uazapi_token',
    'SELECT'
  ) then
    raise exception 'RLS_VERIFY_AUTHENTICATED_LE_UAZAPI_TOKEN';
  end if;

  if has_column_privilege(
    'authenticated',
    'public.whatsapp_caixas',
    'waha_api_key',
    'SELECT'
  ) then
    raise exception 'RLS_VERIFY_AUTHENTICATED_LE_WAHA_API_KEY';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.whatsapp_caixas',
    'SELECT'
  ) then
    raise exception 'RLS_VERIFY_SERVICE_ROLE_SEM_WHATSAPP_CAIXAS';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.listar_whatsapp_caixas_seguras(uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'RLS_VERIFY_LISTAGEM_WHATSAPP_SEGURA_INDISPONIVEL';
  end if;
end
$estrutura$;

-- Matriz nominal: identidade por ID/email exatos, nunca por LIKE no nome.
do $matriz_nominal$
declare
  v_perfil_id uuid;
  v_unidades uuid[] := array[
    '368d47f5-2d88-4475-bc14-ba084a9a348e',
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
    '95553e96-971b-4590-a6eb-0201d013c14d'
  ]::uuid[];
  v_permissoes text[] := array[
    'sucesso_aluno.evasao.ver',
    'sucesso_aluno.evasao.enviar',
    'sucesso_aluno.evasao.revisar',
    'sucesso_aluno.evasao.gerir_acoes',
    'sucesso_aluno.evasao.modo_teste'
  ];
begin
  if (
    select count(*)
    from public.usuarios u
    where (u.id, lower(u.email)) in (
      (29, 'jessyca@lamusic.com.br'),
      (30, 'fabi@gmail.com')
    )
      and u.ativo = true
      and u.auth_user_id is not null
  ) <> 2 then
    raise exception 'RLS_VERIFY_IDENTIDADES_TITULARES_INVALIDAS';
  end if;

  if (
    select count(distinct u.auth_user_id)
    from public.usuarios u
    where u.id in (29, 30)
  ) <> 2 then
    raise exception 'RLS_VERIFY_AUTH_USER_ID_NAO_UNICO';
  end if;

  select p.id
  into v_perfil_id
  from public.perfis p
  where p.nome = 'Sucesso do Aluno - Evasao'
    and p.ativo = true;

  if v_perfil_id is null then
    raise exception 'RLS_VERIFY_PERFIL_DEDICADO_AUSENTE';
  end if;

  if (
    select array_agg(pm.codigo order by pm.codigo)
    from public.perfil_permissoes pp
    join public.permissoes pm on pm.id = pp.permissao_id
    where pp.perfil_id = v_perfil_id
  ) is distinct from (
    select array_agg(x order by x)
    from unnest(v_permissoes) x
  ) then
    raise exception 'RLS_VERIFY_PERMISSOES_FORA_DAS_CINCO_APROVADAS';
  end if;

  if exists (
    select 1
    from public.perfil_permissoes pp
    join public.permissoes pm on pm.id = pp.permissao_id
    where pp.perfil_id = v_perfil_id
      and pm.codigo = 'sucesso_aluno.evasao.relatorios'
  ) then
    raise exception 'RLS_VERIFY_RELATORIOS_CONCEDIDO_IMPLICITAMENTE';
  end if;

  if (
    select count(*)
    from public.usuario_perfis up
    where up.usuario_id in (29, 30)
      and up.perfil_id = v_perfil_id
      and up.ativo = true
      and up.unidade_id = any(v_unidades)
  ) <> 6 then
    raise exception 'RLS_VERIFY_ESPERADOS_SEIS_VINCULOS_ATIVOS';
  end if;

  if exists (
    select 1
    from public.usuario_perfis up
    where up.usuario_id in (29, 30)
      and up.perfil_id = v_perfil_id
      and up.ativo = true
      and (
        up.unidade_id is null
        or not (up.unidade_id = any(v_unidades))
      )
  ) then
    raise exception 'RLS_VERIFY_VINCULO_GLOBAL_OU_UNIDADE_INDEVIDA';
  end if;

  if (
    select count(*)
    from public.pesquisa_evasao_assinaturas s
    where s.usuario_id in (29, 30)
      and s.ativo = true
  ) <> 2
     or exists (
       select 1
       from public.pesquisa_evasao_assinaturas s
       where s.usuario_id in (29, 30)
         and s.ativo = true
       group by s.usuario_id
       having count(*) <> 1
     ) then
    raise exception 'RLS_VERIFY_ASSINATURA_ATIVA_NAO_UNICA';
  end if;
end
$matriz_nominal$;

-- Fixtures negativas e positivas. IDs negativos/UUIDs reservados existem
-- somente ate o ROLLBACK.
do $precondicoes_fixture$
begin
  if exists (
    select 1 from public.usuarios where id in (-730, -731, -732)
  ) or exists (
    select 1
    from public.perfis
    where id in (
      '00000000-0000-4000-8000-000000000730'::uuid,
      '00000000-0000-4000-8000-000000000732'::uuid
    )
  ) then
    raise exception 'RLS_VERIFY_FIXTURE_IDS_OCUPADOS';
  end if;
end
$precondicoes_fixture$;

insert into public.usuarios (
  id, auth_user_id, nome, email, perfil, unidade_id, ativo
)
values
  (
    -730,
    '00000000-0000-4000-8000-000000000730',
    'Fixture Evasao Uma Unidade',
    'fixture-evasao-uma-unidade@example.invalid',
    'teste',
    null,
    true
  ),
  (
    -731,
    '00000000-0000-4000-8000-000000000731',
    'Fixture Evasao Sem Permissao',
    'fixture-evasao-sem-permissao@example.invalid',
    'teste',
    null,
    true
  ),
  (
    -732,
    '00000000-0000-4000-8000-000000000732',
    'Fixture Evasao Relatorios Sem Ver',
    'fixture-evasao-relatorios-sem-ver@example.invalid',
    'teste',
    null,
    true
  );

insert into public.perfis (
  id, nome, descricao, nivel, icone, cor, sistema, ativo
)
values
  (
    '00000000-0000-4000-8000-000000000730',
    'Fixture Evasao Uma Unidade',
    'Somente para verificacao transacional',
    1,
    'test',
    '#000000',
    false,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000732',
    'Fixture Evasao Relatorios Sem Ver',
    'Somente para verificacao transacional',
    1,
    'test',
    '#000000',
    false,
    true
  );

insert into public.perfil_permissoes (perfil_id, permissao_id)
select
  '00000000-0000-4000-8000-000000000730'::uuid,
  p.id
from public.permissoes p
where p.codigo in (
  'sucesso_aluno.evasao.ver',
  'sucesso_aluno.evasao.enviar',
  'sucesso_aluno.evasao.revisar',
  'sucesso_aluno.evasao.gerir_acoes',
  'sucesso_aluno.evasao.modo_teste'
);

insert into public.perfil_permissoes (perfil_id, permissao_id)
select
  '00000000-0000-4000-8000-000000000732'::uuid,
  p.id
from public.permissoes p
where p.codigo = 'sucesso_aluno.evasao.relatorios';

insert into public.usuario_perfis (
  usuario_id, perfil_id, unidade_id, ativo
)
values
  (
    -730,
    '00000000-0000-4000-8000-000000000730',
    '368d47f5-2d88-4475-bc14-ba084a9a348e',
    true
  ),
  (
    -732,
    '00000000-0000-4000-8000-000000000732',
    '368d47f5-2d88-4475-bc14-ba084a9a348e',
    true
  );

insert into public.pesquisa_evasao (
  id,
  evasao_id,
  aluno_id,
  unidade_id,
  aluno_nome,
  aluno_telefone,
  tempo_permanencia_meses,
  data_evasao,
  status,
  enviado_por,
  resposta_texto,
  envio_status,
  resposta_status,
  modo_teste,
  telefone_destino_snapshot
)
select
  '00000000-0000-4000-8000-000000007301',
  m.id,
  m.aluno_id,
  m.unidade_id,
  'RLS_MARKER_BARRA',
  '5521900007301',
  0,
  m.data,
  'respondido',
  'fixture',
  'RLS_RESPOSTA_PRIVADA_BARRA',
  'enviado',
  'pronta_para_revisao',
  true,
  '5521900007301'
from public.movimentacoes_admin m
where m.unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
  and m.tipo in ('evasao', 'nao_renovacao')
order by m.id
limit 1;

insert into public.pesquisa_evasao (
  id,
  evasao_id,
  aluno_id,
  unidade_id,
  aluno_nome,
  aluno_telefone,
  tempo_permanencia_meses,
  data_evasao,
  status,
  enviado_por,
  resposta_texto,
  envio_status,
  resposta_status,
  modo_teste,
  telefone_destino_snapshot
)
select
  '00000000-0000-4000-8000-000000007302',
  m.id,
  m.aluno_id,
  m.unidade_id,
  'RLS_MARKER_CAMPO_GRANDE',
  '5521900007302',
  0,
  m.data,
  'respondido',
  'fixture',
  'RLS_RESPOSTA_PRIVADA_CAMPO_GRANDE',
  'enviado',
  'pronta_para_revisao',
  true,
  '5521900007302'
from public.movimentacoes_admin m
where m.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  and m.tipo in ('evasao', 'nao_renovacao')
order by m.id
limit 1;

do $fixtures_criadas$
begin
  if (
    select count(*)
    from public.pesquisa_evasao
    where id in (
      '00000000-0000-4000-8000-000000007301',
      '00000000-0000-4000-8000-000000007302'
    )
  ) <> 2 then
    raise exception 'RLS_VERIFY_MOVIMENTACOES_FIXTURE_AUSENTES';
  end if;
end
$fixtures_criadas$;

select set_config(
  'pesquisa_evasao.fixture_evasao_barra',
  (
    select pe.evasao_id::text
    from public.pesquisa_evasao pe
    where pe.id = '00000000-0000-4000-8000-000000007301'
  ),
  true
);
select set_config(
  'pesquisa_evasao.fixture_evasao_campo_grande',
  (
    select pe.evasao_id::text
    from public.pesquisa_evasao pe
    where pe.id = '00000000-0000-4000-8000-000000007302'
  ),
  true
);

-- Sem permissao: nao le tabela nem RPC mesmo usando p_unidade_id=NULL.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000731',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $sem_permissao$
begin
  if exists (
    select 1
    from public.pesquisa_evasao
    where id in (
      '00000000-0000-4000-8000-000000007301',
      '00000000-0000-4000-8000-000000007302'
    )
  ) then
    raise exception 'RLS_VERIFY_SEM_PERMISSAO_LEU_TABELA';
  end if;

  if exists (
    select 1
    from public.listar_evadidos_para_pesquisa(
      null, 100, 0, null
    )
  ) or exists (
    select 1
    from public.listar_evadidos_para_pesquisa_v2(
      null, 100, 0, null, null, null, null
    )
  ) then
    raise exception 'RLS_VERIFY_SEM_PERMISSAO_LEU_RPC';
  end if;
end
$sem_permissao$;

reset role;

-- Usuario com ver em uma unidade: NULL equivale somente a unidade autorizada.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000730',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $uma_unidade$
declare
  v_barra uuid := '368d47f5-2d88-4475-bc14-ba084a9a348e';
  v_campo_grande uuid := '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
begin
  if (
    select count(*)
    from public.pesquisa_evasao
    where id in (
      '00000000-0000-4000-8000-000000007301',
      '00000000-0000-4000-8000-000000007302'
    )
  ) <> 1
     or not exists (
       select 1
       from public.pesquisa_evasao
       where id = '00000000-0000-4000-8000-000000007301'
         and resposta_texto = 'RLS_RESPOSTA_PRIVADA_BARRA'
     )
     or exists (
       select 1
       from public.pesquisa_evasao
       where id = '00000000-0000-4000-8000-000000007302'
     ) then
    raise exception 'RLS_VERIFY_ISOLAMENTO_TABELA_FALHOU';
  end if;

  if (
    select array_agg(x.evasao_id order by x.evasao_id)
    from public.listar_evadidos_para_pesquisa(
      null, 10000, 0, null
    ) x
  ) is distinct from (
    select array_agg(x.evasao_id order by x.evasao_id)
    from public.listar_evadidos_para_pesquisa(
      v_barra, 10000, 0, null
    ) x
  ) or exists (
    select 1
    from public.listar_evadidos_para_pesquisa(
      v_campo_grande, 10000, 0, null
    )
  ) then
    raise exception 'RLS_VERIFY_OVERLOAD_4_NULL_VAZOU_UNIDADE';
  end if;

  if (
    select array_agg(x.evasao_id order by x.evasao_id)
    from public.listar_evadidos_para_pesquisa(
      null, 10000, 0, null, null, null
    ) x
  ) is distinct from (
    select array_agg(x.evasao_id order by x.evasao_id)
    from public.listar_evadidos_para_pesquisa(
      v_barra, 10000, 0, null, null, null
    ) x
  ) or exists (
    select 1
    from public.listar_evadidos_para_pesquisa(
      v_campo_grande, 10000, 0, null, null, null
    )
  ) then
    raise exception 'RLS_VERIFY_OVERLOAD_6_NULL_VAZOU_UNIDADE';
  end if;

  if (
    select array_agg(x.evasao_id order by x.evasao_id)
    from public.listar_evadidos_para_pesquisa_v2(
      null, 100, 0, null, null, null, null
    ) x
  ) is distinct from (
    select array_agg(x.evasao_id order by x.evasao_id)
    from public.listar_evadidos_para_pesquisa_v2(
      v_barra, 100, 0, null, null, null, null
    ) x
  ) or exists (
    select 1
    from public.listar_evadidos_para_pesquisa_v2(
      v_campo_grande, 100, 0, null, null, null, null
    )
  ) then
    raise exception 'RLS_VERIFY_V2_NULL_VAZOU_UNIDADE';
  end if;

  if (
    select to_jsonb(s)
    from public.stats_pesquisa_evasao(null, null, null) s
  ) is distinct from (
    select to_jsonb(s)
    from public.stats_pesquisa_evasao(v_barra, null, null) s
  ) or (
    select s.total_evadidos
    from public.stats_pesquisa_evasao(v_campo_grande, null, null) s
  ) <> 0 then
    raise exception 'RLS_VERIFY_STATS_NULL_VAZOU_UNIDADE';
  end if;

  if not exists (
    select 1
    from public.listar_pesquisas_evasao_teste_v1(
      current_setting(
        'pesquisa_evasao.fixture_evasao_barra'
      )::integer
    )
  ) or exists (
    select 1
    from public.listar_pesquisas_evasao_teste_v1(
      current_setting(
        'pesquisa_evasao.fixture_evasao_campo_grande'
      )::integer
    )
  ) then
    raise exception 'RLS_VERIFY_HISTORICO_TESTE_VAZOU_UNIDADE';
  end if;
end
$uma_unidade$;

reset role;

-- relatorios sem ver: nenhuma resposta_texto bruta e nenhuma listagem.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000732',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $relatorios_sem_ver$
begin
  if exists (
    select resposta_texto
    from public.pesquisa_evasao
    where id in (
      '00000000-0000-4000-8000-000000007301',
      '00000000-0000-4000-8000-000000007302'
    )
  ) or exists (
    select 1
    from public.listar_evadidos_para_pesquisa_v2(
      null, 100, 0, null, null, null, null
    )
  ) then
    raise exception 'RLS_VERIFY_RELATORIOS_SEM_VER_LEU_TEXTO_BRUTO';
  end if;
end
$relatorios_sem_ver$;

reset role;

-- service_role preserva operacao direta e bypass de RLS.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $service_role_opera$
begin
  if (
    select count(*)
    from public.pesquisa_evasao
    where id in (
      '00000000-0000-4000-8000-000000007301',
      '00000000-0000-4000-8000-000000007302'
    )
  ) <> 2 then
    raise exception 'RLS_VERIFY_SERVICE_ROLE_NAO_OPERA';
  end if;
end
$service_role_opera$;

reset role;

rollback;
