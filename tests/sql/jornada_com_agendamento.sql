-- Teste da definição canônica de leads_com_agendamento (migration 20261002040000).
-- Janela 25/09–01/10 = [2026-09-25, 2026-10-02) — a mesma do relatório semanal do Mike.

\set QUIET on
\pset footer off

-- 1) critério canônico: agendada_para OU linha de experimental (união das evidências)
do $$
declare r jsonb := public.mike_jornada_resumo_v1('2026-09-25', '2026-10-02', null, null);
begin
  assert (r->>'ok')::boolean, 'ok';
  assert (r->'totais'->>'leads')::int = 6, 'leads da janela (L7 entrou 24/09, fora)';
  -- canônico: L1 (ambos) + L2 (só data) + L3 (só linha) = 3
  assert (r->'totais'->>'leads_com_agendamento')::int = 3, 'com_agendamento canônico = 3 (antigo daria 2)';
  assert (r->'totais'->>'leads_com_experimental_realizada')::int = 1, 'realizadas';
  assert (r->'totais'->>'leads_convertidos')::int = 1, 'convertidos';
  raise notice 'OK 1: união conta 3; critério anterior contaria só 2';
end $$;

-- 2) documentação: definicoes descreve a régua e como_ler repete o contrato
do $$
declare
  r jsonb := public.mike_jornada_resumo_v1('2026-09-25', '2026-10-02', null, null);
  def text := r->'definicoes'->>'leads_com_agendamento';
begin
  assert def is not null and def like '%data_experimental%' and def like '%lead_experimentais%',
    'definicoes.leads_com_agendamento descreve as duas evidências';
  assert exists (select 1 from jsonb_array_elements_text(r->'como_ler') c where c like '%exclusivo%'),
    'como_ler documenta fim exclusivo';
  assert exists (select 1 from jsonb_array_elements_text(r->'como_ler') c where c like '%leads_com_agendamento%'),
    'como_ler aponta a definição';
  raise notice 'OK 2: definicoes + como_ler documentam o critério';
end $$;

-- 3) p_fim exclusivo: fim=10-01 exclui o lead L6 (entrou 01/10)
do $$
declare r jsonb := public.mike_jornada_resumo_v1('2026-09-25', '2026-10-01', null, null);
begin
  assert (r->'totais'->>'leads')::int = 5, 'fim exclusivo tira L6';
  raise notice 'OK 3: p_fim exclusivo';
end $$;

-- 4) escopo e gate
do $$
declare
  r jsonb;
  v_msg text;
begin
  r := public.mike_jornada_resumo_v1('2026-09-25', '2026-10-02', 'REC', null);
  assert (r->'totais'->>'leads')::int = 2, 'unidade REC filtra';
  r := public.mike_jornada_resumo_v1('2026-09-25', '2026-10-02', null, 'google');
  assert (r->'totais'->>'leads')::int = 2 and (r->'totais'->>'leads_com_agendamento')::int = 2, 'canal google filtra';
  set local role anon;
  begin
    perform public.mike_jornada_resumo_v1('2026-09-25', '2026-10-02', null, null);
    raise exception 'gate falhou: anon executou';
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  -- dois bloqueios válidos: 'acesso_negado' do corpo ou 'permission denied' do revoke
  assert v_msg = 'acesso_negado' or v_msg like 'permission denied%' or v_msg like 'permiss%negada%', 'gate: ' || coalesce(v_msg,'null');
  raise notice 'OK 4: filtros de unidade/canal + gate negam anon';
end $$;

-- 5) sem PII no payload (fixture tem nomes e telefones)
do $$
declare r jsonb := public.mike_jornada_resumo_v1('2026-09-25', '2026-10-02', null, null);
begin
  assert r::text not like '%"L1"%' and r::text not like '%5501%' and r::text not like '%a0000000%',
    'PII/ids não saem no payload';
  raise notice 'OK 5: payload agregado, sem nomes/telefones/ids';
end $$;
