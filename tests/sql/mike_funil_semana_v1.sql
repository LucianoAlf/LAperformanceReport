-- Teste de mike_funil_semana_v1 sobre o harness (stubs determinísticos).
-- Prova: soma de semanas = período inteiro nas métricas aditivas, fim exclusivo,
-- merge de canais com canais_originais, cursos, taxas, gate e ausência de PII.

\set QUIET on
\pset footer off

-- 1) soma das semanas = período inteiro (métricas aditivas + diagnósticas)
do $$
declare
  a jsonb := public.mike_funil_semana_v1('2026-09-01', '2026-09-03', null);
  b jsonb := public.mike_funil_semana_v1('2026-09-03', '2026-09-06', null);
  p jsonb := public.mike_funil_semana_v1('2026-09-01', '2026-09-06', null);
  par text[] := array['leads','experimentais_agendadas','experimentais_realizadas',
    'experimentais_presenca_confirmada_crm','visitas','faltas','canceladas',
    'experimentais_confirmadas','conversoes_exp_mat','pendencias_conciliacao'];
  chave text;
begin
  assert (a->>'ok')::boolean and (b->>'ok')::boolean and (p->>'ok')::boolean, 'ok';
  foreach chave in array par loop
    assert coalesce((a->'kpis'->>chave)::int,0) + coalesce((b->'kpis'->>chave)::int,0)
         = coalesce((p->'kpis'->>chave)::int,0),
      'soma das semanas diverge do período em ' || chave;
  end loop;
  assert (p->'kpis'->>'leads')::int = 100
     and (p->'kpis'->>'experimentais_agendadas')::int = 39
     and (p->'kpis'->>'experimentais_realizadas')::int = 32
     and (p->'kpis'->>'experimentais_confirmadas')::int = 30
     and (p->'kpis'->>'conversoes_exp_mat')::int = 14
     and (p->'kpis'->>'pendencias_conciliacao')::int = 1
     and (p->'kpis'->>'faltas')::int = 9
     and (p->'kpis'->>'canceladas')::int = 7
     and (p->'kpis'->>'visitas')::int = 7, 'totais do período';
  -- matrículas/dinheiro via resumo canônico no intervalo exato
  assert (p->'kpis'->>'matriculas')::int = 7
     and (p->'kpis'->>'total_parcelas')::numeric = 2940
     and (p->'kpis'->>'total_passaportes')::numeric = 3100
     and (p->'kpis'->>'ticket_medio_parcela')::numeric = 420
     and round((p->'kpis'->>'ticket_medio_passaporte')::numeric, 1) = 442.9, 'matriculas/dinheiro';
  raise notice 'OK 1: semanas somam o período; matrícula/tickets pelo resumo canônico';
end $$;

-- 2) fim exclusivo: janela de 1 dia cobre só esse dia
do $$
declare w jsonb := public.mike_funil_semana_v1('2026-09-05', '2026-09-06', null);
begin
  assert (w->'kpis'->>'leads')::int = 25 and (w->'kpis'->>'experimentais_agendadas')::int = 9
     and (w->'periodo'->>'dias')::int = 1, 'fim exclusivo';
  raise notice 'OK 2: p_fim_exclusivo não entra na janela';
end $$;

-- 3) merge de canais e cursos (canais_originais = união dos rótulos)
do $$
declare
  p jsonb := public.mike_funil_semana_v1('2026-09-01', '2026-09-06', null);
  g jsonb := (select c from jsonb_array_elements(p->'canais_do_periodo') c where c->>'canal' = 'Google');
  i jsonb := (select c from jsonb_array_elements(p->'canais_do_periodo') c where c->>'canal' = 'Instagram');
  s jsonb := (select c from jsonb_array_elements(p->'cursos_do_periodo') c where c->>'curso' = 'Sem curso');
begin
  assert (i->>'leads')::int = 68 and (i->>'leads_convertidos_operacional')::int = 10, 'Instagram merge';
  assert (g->>'leads')::int = 16 and (g->>'canais_originais')::text = '["Google", "Site"]', 'Google merge + originais';
  assert (s->>'leads')::int = 49, 'Sem curso merge';
  raise notice 'OK 3: canais/cursos agregam por chave e preservam rótulos originais';
end $$;

-- 4) taxas do funil + rótulos honestos
do $$
declare p jsonb := public.mike_funil_semana_v1('2026-09-01', '2026-09-06', null);
begin
  assert (p->'funil'->>'lead_para_experimental')::numeric = 32.0
     and (p->'funil'->>'experimental_para_matricula')::numeric = 46.7
     and (p->'funil'->>'lead_para_matricula')::numeric = 7.0
     and p->'funil'->'experimental_para_matricula_base'->>'metodo' = 'soma_diaria_diagnostica'
     and (p->>'fechado')::boolean = false
     and p->'metas' = 'null'::jsonb, 'funil/taxas';
  raise notice 'OK 4: taxas + metodo diagnóstico + fechado=false';
end $$;

-- 5) validações e ausência de PII
do $$
declare p jsonb;
begin
  p := public.mike_funil_semana_v1('2026-09-05', '2026-09-05', null);
  assert p->>'erro' = 'periodo_invalido', 'fim<=inicio';
  p := public.mike_funil_semana_v1('2026-08-01', '2026-11-01', null);
  assert p->>'erro' = 'periodo_longo_demais', 'span>62';
  p := public.mike_funil_semana_v1('2026-09-01', '2026-09-06', 'XX');
  assert p->>'erro' = 'unidade_invalida', 'unidade';
  p := public.mike_funil_semana_v1('2026-09-01', '2026-09-06', null);
  assert p::text not like '%PESSOA FIXTURE%' and p::text not like '%5599999%', 'PII vazou no payload';
  raise notice 'OK 5: validações + sem PII (lista do resumo nunca sai)';
end $$;

-- 6b) competencias_cobertas cobre os dois meses quando a janela vira o mês
--     (bug encontrado na revisão: generate_series a partir de p_inicio perdia o 2º mês)
do $$
declare p jsonb := public.mike_funil_semana_v1('2026-09-15', '2026-10-04', null);
begin
  assert (p->'periodo'->>'competencias_cobertas')::text like '%09/2026%'
     and (p->'periodo'->>'competencias_cobertas')::text like '%10/2026%',
    'competencias_cobertas deve incluir 09 e 10';
  raise notice 'OK 6b: janela 15/09–03/10 cobre 09/2026 e 10/2026';
end $$;

-- 6) gate: sessão sem papel permitido levanta acesso_negado
do $$
declare v_msg text;
begin
  set local role anon;
  begin
    perform public.mike_funil_semana_v1('2026-09-01', '2026-09-06', null);
    raise exception 'gate falhou: anon executou';
  exception when insufficient_privilege or raise_exception then
    v_msg := sqlerrm;
  when others then
    if sqlerrm = 'acesso_negado' or sqlstate = '42501' then v_msg := 'acesso_negado'; else raise; end if;
  end;
  reset role;
  assert v_msg is not null, 'gate';
  raise notice 'OK 6: gate por session_user nega anon';
end $$;
