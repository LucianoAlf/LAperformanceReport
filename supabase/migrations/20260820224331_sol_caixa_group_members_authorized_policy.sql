-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- Decisao Alf 2026-08-20: nos grupos financeiros oficiais, todo membro do grupo
-- e operador autorizado do dominio Caixa. A fronteira operacional e o grupo
-- financeiro ativo + RPC especifica do Caixa; nao ha liberacao de tabela crua.

update public.sol_caixa_unidade_policy p
set autoriza_qualquer_membro = true,
    atualizado_em = now()
from public.unidades u
where u.id = p.unidade_id
  and u.nome in ('Barra', 'Campo Grande', 'Recreio');

create or replace function public.sol_caixa_ator_operacao_ok(
  p_unidade uuid,
  p_num text,
  p_operacao text default 'preview'::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_chave text := public.sol_tel_chave(p_num);
  v_actor record;
  v_policy boolean;
begin
  if p_unidade is null then
    return jsonb_build_object('ok', true, 'autorizado', false, 'motivo', 'sem_unidade');
  end if;

  select coalesce(autoriza_qualquer_membro, false)
    into v_policy
  from public.sol_caixa_unidade_policy
  where unidade_id = p_unidade;

  -- A lista explicita continua existindo como carimbo/auditoria e fallback.
  if v_chave is not null then
    select a.*
      into v_actor
    from public.sol_caixa_autorizados a
    where a.unidade_id = p_unidade
      and public.sol_tel_chave(a.numero) = v_chave
      and a.ativo
      and (p_operacao = any(a.operacoes) or 'todas' = any(a.operacoes))
    order by a.atualizado_em desc
    limit 1;

    if v_actor.id is not null then
      return jsonb_build_object(
        'ok', true,
        'autorizado', true,
        'motivo', 'matriz_explicita',
        'nome', v_actor.nome,
        'papel', v_actor.papel,
        'unidade_id', v_actor.unidade_id,
        'operacao', p_operacao,
        'policy_any_group_member', coalesce(v_policy, false),
        'escopo', 'caixa_whatsapp_grupo_financeiro'
      );
    end if;
  end if;

  -- Decisao de negocio: se a mensagem ja veio do grupo financeiro oficial da
  -- unidade, qualquer membro do grupo pode operar o Caixa por RPC/ferramenta.
  -- A verificacao do grupo acontece no bridge/runner antes de chamar esta RPC.
  if coalesce(v_policy, false) then
    return jsonb_build_object(
      'ok', true,
      'autorizado', true,
      'motivo', 'grupo_financeiro_autorizado_por_politica_unidade',
      'unidade_id', p_unidade,
      'operacao', p_operacao,
      'policy_any_group_member', true,
      'requires_group_context', true,
      'escopo', 'caixa_whatsapp_grupo_financeiro'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'autorizado', false,
    'motivo', case when v_chave is null then 'sem_telefone' else 'nao_autorizado_na_matriz' end,
    'policy_any_group_member', false,
    'operacao', p_operacao
  );
end;
$$;

create or replace function public.sol_caixa_grupo_operacao_ok(
  p_unidade uuid,
  p_grupo_jid text,
  p_operacao text default 'preview'::text
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  with grp as (
    select g.unidade_id, g.nome_grupo, g.ativo
    from public.caixa_financeiro_grupos_whatsapp g
    where g.unidade_id = p_unidade
      and g.grupo_jid = p_grupo_jid
      and g.ativo
    limit 1
  ), pol as (
    select coalesce(p.autoriza_qualquer_membro, false) as any_member
    from public.sol_caixa_unidade_policy p
    where p.unidade_id = p_unidade
  )
  select jsonb_build_object(
    'ok', true,
    'autorizado', exists (select 1 from grp) and coalesce((select any_member from pol), false),
    'motivo', case
      when not exists (select 1 from grp) then 'grupo_financeiro_nao_mapeado_ou_inativo'
      when not coalesce((select any_member from pol), false) then 'policy_unidade_nao_autoriza_qualquer_membro'
      else 'grupo_financeiro_oficial_autoriza_membros'
    end,
    'unidade_id', p_unidade,
    'nome_grupo', (select nome_grupo from grp),
    'operacao', p_operacao,
    'escopo', 'caixa_whatsapp_grupo_financeiro'
  );
$$;

create or replace function public.sol_caixa_readonly_preflight_v3()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  with target_role as (
    select coalesce(nullif(current_setting('role', true), ''), current_user) as role_name
  ), direct_checks as (
    select jsonb_build_object(
      'caixa_movimentacoes_select', has_table_privilege((select role_name from target_role), 'public.caixa_movimentacoes', 'SELECT'),
      'emusys_faturas_select', has_table_privilege((select role_name from target_role), 'public.emusys_faturas', 'SELECT'),
      'sol_caixa_autorizados_select', has_table_privilege((select role_name from target_role), 'public.sol_caixa_autorizados', 'SELECT'),
      'vw_whatsapp_caixas_departamento_select', has_table_privilege((select role_name from target_role), 'public.vw_whatsapp_caixas_departamento', 'SELECT')
    ) as j
  ), matrix_by_unit as (
    select jsonb_build_object(
      'unidade_id', u.id,
      'unidade_nome', u.nome,
      'authorized_explicit_active', count(a.*) filter (where a.ativo),
      'any_group_member_authorized', coalesce(p.autoriza_qualquer_membro, false)
    ) as unit_obj,
    count(a.*) filter (where a.ativo) as authorized_active,
    coalesce(p.autoriza_qualquer_membro, false)::int as any_member_flag
    from public.unidades u
    left join public.sol_caixa_unidade_policy p on p.unidade_id = u.id
    left join public.sol_caixa_autorizados a on a.unidade_id = u.id
    where u.nome in ('Barra','Campo Grande','Recreio')
    group by u.id, u.nome, p.autoriza_qualquer_membro
  ), matrix as (
    select jsonb_build_object(
      'policy', 'grupo_financeiro_oficial_autoriza_membros_caixa',
      'total_explicit_active', coalesce(sum(authorized_active), 0),
      'units_with_any_group_member_authorized', coalesce(sum(any_member_flag), 0),
      'by_unit', coalesce(jsonb_agg(unit_obj order by unit_obj->>'unidade_nome'), '[]'::jsonb)
    ) as j
    from matrix_by_unit
  )
  select jsonb_build_object(
    'function', 'sol_caixa_readonly_preflight_v3',
    'business_decision', 'membro_de_grupo_financeiro_oficial_pode_operar_caixa_por_rpc_especifica',
    'function_current_user', current_user,
    'function_session_user', session_user,
    'role_setting', current_setting('role', true),
    'target_role', (select role_name from target_role),
    'direct_select_privileges', (select j from direct_checks),
    'financial_groups', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where g.ativo),
        'items', coalesce(jsonb_agg(jsonb_build_object(
          'grupo_jid_md5', md5(g.grupo_jid),
          'unidade_id', g.unidade_id,
          'nome_grupo', g.nome_grupo,
          'ativo', g.ativo
        ) order by g.nome_grupo), '[]'::jsonb)
      )
      from public.caixa_financeiro_grupos_whatsapp g
    ),
    'authorization_matrix', (select j from matrix),
    'mutation_privileges', jsonb_build_object(
      'can_execute_lancar_recebimento', has_function_privilege((select role_name from target_role), 'public.sol_caixa_lancar_recebimento(jsonb)', 'EXECUTE'),
      'can_execute_lancar_saida', has_function_privilege((select role_name from target_role), 'public.sol_caixa_lancar_saida(jsonb)', 'EXECUTE'),
      'can_execute_ingestao', has_function_privilege((select role_name from target_role), 'public.sol_caixa_ingestao_registrar(jsonb)', 'EXECUTE')
    ),
    'guardrails', jsonb_build_object(
      'raw_table_access', false,
      'domain', 'caixa',
      'requires_official_financial_group_context', true,
      'write_only_via_specific_rpc', true
    ),
    'generated_at_utc', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;

grant execute on function public.sol_caixa_grupo_operacao_ok(uuid, text, text) to sol_acesso_restrito;
grant execute on function public.sol_caixa_readonly_preflight_v3() to sol_acesso_restrito;
-- sol_caixa_ator_operacao_ok ja existia; reforca grant para o runtime restrito.
grant execute on function public.sol_caixa_ator_operacao_ok(uuid, text, text) to sol_acesso_restrito;
