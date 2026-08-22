-- `sol_caixa_inadimplentes` alinhada ao contrato canônico v4. Decisão do Alf, 2026-08-22.
--
-- O PROBLEMA: o gate interno era da era v3 — exigia `collection_scope='confirmed_only'`,
-- `delinquency_rule='d_plus_0'` e `consumer_must_apply_collection_grace=true`. O canônico
-- v4 publica `confirmed_active_d2_3_competencias`, `d_plus_2` e `consumer_must_apply=false`
-- (medido ao vivo em 22/08: CG devolve exatamente isso, com `collection_allowed=true` e
-- `block_reasons=[]`). Resultado: a função SEMPRE saía em erro, mesmo com a carteira
-- liberada — incompatibilidade de contrato, não bloqueio real.
-- ⚠️ O diagnóstico de 21/08 ("bloqueada por source_missing") estava ERRADO: os 21
-- source_missing de CG vão para `reconciliation`, mas não derrubam `collection_allowed`.
--
-- O QUE MUDA:
--   - gate aceita o v4: scope `confirmed_active_d2_3_competencias`, regra `d_plus_2`,
--     `consumer_must_apply_collection_grace=false`, e passa a exigir `schema_version=4`;
--   - o refiltro de carência (`dias_atraso >= p_carencia_dias`) SAI: o contrato v4 manda
--     não reaplicar D+2 no consumidor — o canônico já fez o corte (`consumer_must_apply
--     _collection_grace=false` existe exatamente para isso). `p_carencia_dias` continua
--     na assinatura e na validação de política, para não quebrar consumidor posicional;
--   - rótulos de saída (`canonical_delinquency_rule`, `collection_scope`) refletem o v4.
--
-- ⚠️ Ela continua NÃO sendo a fonte para a Sol consultar carteira em modo sombra — o
-- contrato manda `sol_inadimplencia_v1` (envelope v4 puro). Esta função é do fluxo de
-- CAIXA (resumo por aluno com faixas critico/atencao/normal para conversa de recebimento).

do $mig$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_inadimplentes';

  if position('confirmed_active_d2_3_competencias' in v_def) > 0 then
    raise notice 'gate v4 ja aplicado';
    return;
  end if;

  -- 1) scope do v4
  v_new := replace(v_def,
    $$v_collection_scope <> 'confirmed_only'$$,
    $$v_collection_scope <> 'confirmed_active_d2_3_competencias'$$);

  -- 2) política do v4: d_plus_2 e consumer_must_apply=false
  v_new := replace(v_new,
    $$coalesce(v_canonical #>> '{policy,delinquency_rule}', '') = 'd_plus_0'$$,
    $$coalesce(v_canonical #>> '{policy,delinquency_rule}', '') = 'd_plus_2'$$);
  v_new := replace(v_new,
    $$and coalesce(
      (v_canonical #>> '{operational,consumer_must_apply_collection_grace}')::boolean,
      false
    );$$,
    $$and coalesce(
      (v_canonical #>> '{operational,consumer_must_apply_collection_grace}')::boolean,
      true
    ) is false;$$);

  -- 3) exige schema_version = 4 no gate
  v_new := replace(v_new,
    $$if v_canonical_status not in ('ok', 'partial')$$,
    $$if coalesce((v_canonical ->> 'schema_version')::integer, 0) <> 4
     or v_canonical_status not in ('ok', 'partial')$$);

  -- 4) não reaplicar a carência: o canônico já cortou D+2
  v_new := replace(v_new,
    $$
      and coalesce((item->>'dias_atraso')::integer, 0) >= p_carencia_dias$$,
    '');

  -- 5) rótulos de saída
  v_new := replace(v_new,
    $$'canonical_delinquency_rule', 'd_plus_0',$$,
    $$'canonical_delinquency_rule', 'd_plus_2',$$);
  v_new := replace(v_new,
    $$'collection_scope', 'confirmed_only',$$,
    $$'collection_scope', 'confirmed_active_d2_3_competencias',$$);

  if v_new = v_def
     or position('d_plus_0' in v_new) > 0
     or position('>= p_carencia_dias' in v_new) > 0 then
    raise exception 'replaces incompletos no gate v4 — abortando';
  end if;

  execute v_new;
end $mig$;
