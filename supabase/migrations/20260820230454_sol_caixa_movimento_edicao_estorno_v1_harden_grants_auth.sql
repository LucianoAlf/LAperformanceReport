-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create or replace function public.sol_caixa_autorizar_payload_v1(p_unidade uuid, p_payload jsonb, p_operacao text default 'preview')
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_chave text := public.sol_tel_chave(v_num);
  v_grupo text := coalesce(nullif(p_payload->>'grupo_jid',''), nullif(p_payload->>'chat_id',''));
  v_grupo_ok jsonb;
  v_policy boolean := false;
  v_actor record;
begin
  if p_unidade is null then
    return jsonb_build_object('ok', false, 'autorizado', false, 'motivo', 'unidade_obrigatoria');
  end if;

  select coalesce(autoriza_qualquer_membro, false)
    into v_policy
  from public.sol_caixa_unidade_policy
  where unidade_id = p_unidade;

  if v_grupo is not null and v_grupo like '%@g.us' then
    v_grupo_ok := public.sol_caixa_grupo_operacao_ok(p_unidade, v_grupo, p_operacao);
    if coalesce((v_grupo_ok->>'autorizado')::boolean, false) then
      return v_grupo_ok || jsonb_build_object('origem_autorizacao', 'grupo_financeiro_oficial');
    end if;
  end if;

  -- Fallback nominal explícito. Não usa sol_caixa_ator_operacao_ok aqui porque
  -- essa função também reflete a política ampla de grupo; nas RPCs mutantes novas,
  -- a política ampla só vale quando o grupo oficial veio no payload.
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
        'policy_any_group_member', v_policy,
        'origem_autorizacao', 'matriz_explicita'
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'autorizado', false,
    'motivo', case
      when coalesce(v_policy, false) and (v_grupo is null or v_grupo not like '%@g.us') then 'grupo_oficial_obrigatorio_para_policy_any_member'
      when v_grupo_ok is not null then coalesce(v_grupo_ok->>'motivo', 'grupo_nao_autorizado')
      when v_chave is null then 'sem_telefone'
      else 'nao_autorizado'
    end,
    'operacao', p_operacao,
    'policy_any_group_member', v_policy
  );
end;
$$;

revoke all on function public.sol_caixa_recalcular_cofre(uuid) from public, anon, authenticated;
revoke all on function public.sol_caixa_autorizar_payload_v1(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.sol_caixa_buscar_movimentos_v1(jsonb) from public, anon, authenticated;
revoke all on function public.sol_caixa_corrigir_movimento_v1(jsonb) from public, anon, authenticated;
revoke all on function public.sol_caixa_estornar_movimento_v1(jsonb) from public, anon, authenticated;

grant execute on function public.sol_caixa_buscar_movimentos_v1(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_corrigir_movimento_v1(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_estornar_movimento_v1(jsonb) to sol_acesso_restrito;
