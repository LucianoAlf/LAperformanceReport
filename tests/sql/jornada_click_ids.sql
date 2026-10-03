-- Teste da cobertura de click-ids (migration 20261002050000), empilhada sobre a
-- migration 20261002040000 (mesma função — aplicar B antes de C no banco de ensaio).
-- Requer jornada_click_ids_harness.sql (fixture com gclid/ctwa).

\set QUIET on
\pset footer off

-- 0) ACL da view intacta (o migration não emite revoke/grant nela)
\ir jornada_click_ids_acl.sql

-- 1) view ganhou as flags booleanas (e só elas — o valor não vira coluna)
do $$
declare
  n_flags int;
  n_val int;
begin
  select count(*) filter (where tem_gclid), count(*) filter (where tem_meta_ctwa_clid)
    into n_flags, n_val from public.vw_jornada_lead_v1;
  assert n_flags = 3 and n_val = 2, 'flags da view'; -- gclid: L1,L3,L7 | ctwa: L2,L3
  assert not exists (select 1 from information_schema.columns
    where table_name='vw_jornada_lead_v1' and column_name in ('gclid','meta_ctwa_clid')),
    'valor do click-id não pode virar coluna da view';
  raise notice 'OK 1: view expõe tem_gclid/tem_meta_ctwa_clid, nunca os valores';
end $$;

-- 2) resumo agrega presença e pct dentro de cobertura.click_ids
do $$
declare
  r jsonb := public.mike_jornada_resumo_v1('2026-09-25', '2026-10-02', null, null);
  c jsonb := r->'cobertura'->'click_ids';
begin
  assert (r->>'ok')::boolean, 'ok';
  assert (r->'totais'->>'leads')::int = 6, 'leads da janela';
  assert (c->>'leads_com_gclid')::int = 2
     and (c->>'leads_com_meta_ctwa_clid')::int = 2
     and (c->>'leads_com_algum_click_id')::int = 3, 'contagens de presença';
  assert (c->>'gclid_pct')::numeric = 33.3
     and (c->>'meta_ctwa_clid_pct')::numeric = 33.3
     and (c->>'algum_click_id_pct')::numeric = 50.0, 'percentuais';
  raise notice 'OK 2: cobertura.click_ids = 2 gclid / 2 ctwa / 3 algum (33,3/33,3/50,0%%)';
end $$;

-- 3) os VALORES nunca saem: payload inteiro varrido
do $$
declare r jsonb := public.mike_jornada_resumo_v1('2026-09-25', '2026-10-02', null, null);
begin
  assert r::text not like '%GCLID-SEGREDO%' and r::text not like '%CTWA-SEGREDO%'
     and r::text not like '%GCLID-FORA%' and r::text not like '%5511%',
    'valor de click-id ou telefone vazou no payload';
  raise notice 'OK 3: nenhum valor de click-id no payload';
end $$;

-- 4) regressão: critério de agendamento do PR anterior segue valendo
do $$
declare r jsonb := public.mike_jornada_resumo_v1('2026-09-25', '2026-10-02', null, null);
begin
  assert (r->'totais'->>'leads_com_agendamento')::int = 3, 'união mantida (L1 campo+linha, L2 campo, L3 linha cancelada)';
  raise notice 'OK 4: empilhado — leads_com_agendamento canônico segue 3';
end $$;

-- 5) gate: anon não executa
do $$
declare v_msg text;
begin
  set local role anon;
  begin
    perform public.mike_jornada_resumo_v1('2026-09-25', '2026-10-02', null, null);
    raise exception 'gate falhou: anon executou';
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  assert v_msg = 'acesso_negado' or v_msg like 'permission denied%' or v_msg like 'permiss%negada%', 'gate: ' || coalesce(v_msg,'null');
  raise notice 'OK 5: gate nega anon';
end $$;
