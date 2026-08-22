-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- S3: a pergunta "quanto entrou hoje?" NÃO pode passar pelo LLM (testei: ele respondeu
-- R$ 0,00 num dia com R$ 5.700 lançados). Fonte única, determinística, read-only.
create or replace function public.sol_caixa_resumo_do_dia(p_unidade_id uuid, p_data date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
declare
  v_dia date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  v_cx record; v_uni text;
begin
  select nome into v_uni from public.unidades where id = p_unidade_id;
  if v_uni is null then return jsonb_build_object('ok', false, 'motivo','unidade_invalida'); end if;

  select c.id, c.status, c.saldo_inicial_cofre, c.saldo_final_calculado, c.saldo_final_conferido,
         c.aberto_por, c.fechado_por
    into v_cx
  from public.caixas_diarios c
  where c.unidade_id = p_unidade_id and c.data_caixa = v_dia;

  if v_cx.id is null then
    return jsonb_build_object('ok', true, 'unidade', v_uni, 'data', to_char(v_dia,'DD/MM/YYYY'),
      'caixa', 'nao_aberto', 'total_entradas', 0, 'qtd', 0, 'por_forma', '{}'::jsonb, 'lancamentos', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'ok', true,
    'unidade', v_uni,
    'data', to_char(v_dia,'DD/MM/YYYY'),
    'caixa', v_cx.status,
    'aberto_por', v_cx.aberto_por,
    'fechado_por', v_cx.fechado_por,
    'saldo_inicial_cofre', v_cx.saldo_inicial_cofre,
    'saldo_final', coalesce(v_cx.saldo_final_conferido, v_cx.saldo_final_calculado),
    'total_entradas', coalesce((select sum(m.valor) from public.caixa_movimentacoes m
                                 where m.caixa_diario_id = v_cx.id and m.tipo='entrada'), 0),
    'qtd', (select count(*) from public.caixa_movimentacoes m
             where m.caixa_diario_id = v_cx.id and m.tipo='entrada'),
    'por_forma', coalesce((select jsonb_object_agg(f, v) from (
        select coalesce(m.forma_pagamento,'outro') f, sum(m.valor) v
        from public.caixa_movimentacoes m
        where m.caixa_diario_id = v_cx.id and m.tipo='entrada'
        group by 1) t), '{}'::jsonb),
    'lancamentos', coalesce((select jsonb_agg(x order by x->>'hora') from (
        select jsonb_build_object(
          'hora', to_char(m.created_at at time zone 'America/Sao_Paulo','HH24:MI'),
          'valor', m.valor, 'forma', m.forma_pagamento, 'categoria', m.categoria,
          'descricao', m.descricao, 'responsavel', m.responsavel) x
        from public.caixa_movimentacoes m
        where m.caixa_diario_id = v_cx.id and m.tipo='entrada') t), '[]'::jsonb));
end $function$;
revoke all on function public.sol_caixa_resumo_do_dia(uuid, date) from public, anon, authenticated;
grant execute on function public.sol_caixa_resumo_do_dia(uuid, date) to service_role;
