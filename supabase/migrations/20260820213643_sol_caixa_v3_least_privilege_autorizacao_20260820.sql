-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

begin;

revoke select on table
  public.alunos,
  public.caixa_categorias,
  public.caixa_financeiro_grupos_whatsapp,
  public.caixa_movimentacoes,
  public.caixa_reaberturas_log,
  public.caixas_diarios,
  public.colaboradores,
  public.emusys_faturas,
  public.sol_caixa_abertura_pendente,
  public.sol_caixa_autorizados,
  public.sol_caixa_ingestao_recebimentos,
  public.sol_caixa_lancamento_auditoria,
  public.sol_caixa_unidade_policy,
  public.sol_permissoes,
  public.unidades,
  public.usuarios,
  public.vw_whatsapp_caixas_departamento
from sol_caixa_readonly;

grant usage on schema public to sol_caixa_readonly;
grant execute on function public.sol_caixa_readonly_preflight_v1() to sol_caixa_readonly;
grant execute on function public.sol_caixa_resumo_do_dia(uuid, date) to sol_caixa_readonly;
grant execute on function public.sol_caixa_quem_e(text, uuid) to sol_caixa_readonly;
grant execute on function public.sol_caixa_ator_ok(uuid, text) to sol_caixa_readonly;
revoke execute on function public.sol_caixa_lancar_recebimento(jsonb) from sol_caixa_readonly;
revoke execute on function public.sol_caixa_lancar_saida(jsonb) from sol_caixa_readonly;
revoke execute on function public.sol_caixa_ingestao_registrar(jsonb) from sol_caixa_readonly;

alter table public.sol_caixa_autorizados
  add column if not exists operacoes text[] not null default array['preview','aprovar_preview','corrigir_preview','consulta_caixa']::text[],
  add column if not exists origem text not null default 'manual',
  add column if not exists atualizado_em timestamptz not null default now();

with eligible as (
  select nome, telefone, departamento, nivel, unidade_id
  from governanca.agente_usuarios
  where ativo is true
    and telefone is not null
    and departamento in ('administrativo','financeiro','diretoria','comercial')
), expanded as (
  select
    u.id as unidade_id,
    e.telefone as numero,
    e.nome,
    concat(e.departamento, ':', e.nivel) as papel,
    array['preview','aprovar_preview','corrigir_preview','consulta_caixa']::text[] as operacoes
  from eligible e
  join public.unidades u on e.unidade_id = u.id
  union all
  select
    u.id as unidade_id,
    e.telefone as numero,
    e.nome,
    concat(e.departamento, ':', e.nivel, ':multiunidade') as papel,
    array['preview','aprovar_preview','corrigir_preview','consulta_caixa']::text[] as operacoes
  from eligible e
  cross join public.unidades u
  where e.unidade_id is null
    and e.departamento in ('financeiro','diretoria')
)
insert into public.sol_caixa_autorizados (unidade_id, numero, nome, papel, ativo, operacoes, origem, atualizado_em)
select unidade_id, numero, nome, papel, true, operacoes, 'governanca.agente_usuarios', now()
from expanded
on conflict (unidade_id, numero) do update
set nome = excluded.nome,
    papel = excluded.papel,
    ativo = true,
    operacoes = excluded.operacoes,
    origem = excluded.origem,
    atualizado_em = now();

insert into public.sol_caixa_unidade_policy (unidade_id, autoriza_qualquer_membro, atualizado_em)
select id, false, now()
from public.unidades
where nome in ('Barra','Campo Grande','Recreio')
on conflict (unidade_id) do update
set autoriza_qualquer_membro = false,
    atualizado_em = now();

create or replace function public.sol_caixa_ator_operacao_ok(
  p_unidade uuid,
  p_num text,
  p_operacao text default 'preview'
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_chave text := public.sol_tel_chave(p_num);
  v_actor record;
  v_policy boolean;
begin
  if p_unidade is null then
    return jsonb_build_object('ok', true, 'autorizado', false, 'motivo', 'sem_unidade');
  end if;
  if v_chave is null then
    return jsonb_build_object('ok', true, 'autorizado', false, 'motivo', 'sem_telefone');
  end if;
  select coalesce(autoriza_qualquer_membro, false)
    into v_policy
  from public.sol_caixa_unidade_policy
  where unidade_id = p_unidade;
  select a.*
    into v_actor
  from public.sol_caixa_autorizados a
  where a.unidade_id = p_unidade
    and public.sol_tel_chave(a.numero) = v_chave
    and a.ativo
    and (p_operacao = any(a.operacoes) or 'todas' = any(a.operacoes))
  order by a.atualizado_em desc
  limit 1;
  if v_actor.id is null then
    return jsonb_build_object(
      'ok', true,
      'autorizado', false,
      'motivo', case when v_policy then 'sem_match_explicitamente_mas_policy_legada_aberta' else 'nao_autorizado_na_matriz' end,
      'legacy_any_member_policy', coalesce(v_policy, false),
      'operacao', p_operacao
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'autorizado', true,
    'motivo', 'matriz_explicita',
    'nome', v_actor.nome,
    'papel', v_actor.papel,
    'unidade_id', v_actor.unidade_id,
    'operacao', p_operacao,
    'legacy_any_member_policy', coalesce(v_policy, false)
  );
end;
$$;

revoke all on function public.sol_caixa_ator_operacao_ok(uuid, text, text) from public;
grant execute on function public.sol_caixa_ator_operacao_ok(uuid, text, text) to sol_caixa_readonly;
grant execute on function public.sol_caixa_ator_operacao_ok(uuid, text, text) to sol_acesso_restrito;

create or replace function public.sol_caixa_readonly_preflight_v2()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
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
      'authorized_active', count(a.*) filter (where a.ativo),
      'legacy_any_member_policy', coalesce(p.autoriza_qualquer_membro, false)
    ) as unit_obj,
    count(a.*) filter (where a.ativo) as authorized_active
    from public.unidades u
    left join public.sol_caixa_unidade_policy p on p.unidade_id = u.id
    left join public.sol_caixa_autorizados a on a.unidade_id = u.id
    where u.nome in ('Barra','Campo Grande','Recreio')
    group by u.id, u.nome, p.autoriza_qualquer_membro
  ), matrix as (
    select jsonb_build_object(
      'total_active', coalesce(sum(authorized_active), 0),
      'by_unit', coalesce(jsonb_agg(unit_obj order by unit_obj->>'unidade_nome'), '[]'::jsonb)
    ) as j
    from matrix_by_unit
  )
  select jsonb_build_object(
    'function', 'sol_caixa_readonly_preflight_v2',
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
    'generated_at_utc', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;

revoke all on function public.sol_caixa_readonly_preflight_v2() from public;
grant execute on function public.sol_caixa_readonly_preflight_v2() to sol_caixa_readonly;
grant execute on function public.sol_caixa_readonly_preflight_v2() to sol_acesso_restrito;

commit;
