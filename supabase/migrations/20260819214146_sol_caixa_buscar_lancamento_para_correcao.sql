-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create or replace function public.sol_caixa_buscar_lancamento_para_correcao(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidade uuid;
  v_valor numeric;
  v_categoria text;
  v_forma text;
  v_count int;
  v_row public.caixa_movimentacoes%rowtype;
  v_inicio date;
begin
  v_unidade := nullif(p_payload->>'unidade_id', '')::uuid;
  v_valor := nullif(p_payload->>'valor', '')::numeric;
  v_categoria := nullif(p_payload->>'categoria', '');
  v_forma := nullif(p_payload->>'forma_atual', '');
  v_inicio := ((now() at time zone 'America/Sao_Paulo')::date - 1);

  if v_unidade is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_obrigatoria');
  end if;
  if v_valor is null or v_valor <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'valor_obrigatorio');
  end if;

  with candidatos as (
    select *
    from public.caixa_movimentacoes cm
    where cm.unidade_id = v_unidade
      and cm.tipo = 'entrada'
      and cm.criado_por like 'sol-agente:%'
      and cm.data_movimento >= v_inicio
      and abs(cm.valor - v_valor) < 0.01
      and (v_categoria is null or cm.categoria = v_categoria)
      and (v_forma is null or cm.forma_pagamento = v_forma)
    order by cm.created_at desc
    limit 3
  )
  select count(*) into v_count from candidatos;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado');
  end if;
  if v_count > 1 then
    return jsonb_build_object('ok', false, 'motivo', 'ambiguo', 'candidatos', v_count);
  end if;

  select * into v_row
  from public.caixa_movimentacoes cm
  where cm.unidade_id = v_unidade
    and cm.tipo = 'entrada'
    and cm.criado_por like 'sol-agente:%'
    and cm.data_movimento >= v_inicio
    and abs(cm.valor - v_valor) < 0.01
    and (v_categoria is null or cm.categoria = v_categoria)
    and (v_forma is null or cm.forma_pagamento = v_forma)
  order by cm.created_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'movimentacao_id', v_row.id,
    'unidade_id', v_row.unidade_id,
    'valor', v_row.valor,
    'categoria', v_row.categoria,
    'forma', v_row.forma_pagamento,
    'cartao_modalidade', v_row.cartao_modalidade,
    'descricao', v_row.descricao
  );
end;
$$;

revoke all on function public.sol_caixa_buscar_lancamento_para_correcao(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_buscar_lancamento_para_correcao(jsonb) to service_role;
