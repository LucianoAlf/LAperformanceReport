-- Aquecedor de caches da dashboard: mantém as RPCs quentes para que o
-- usuario nunca pague o caminho frio.
--
-- Motivo: as RPCs pesadas (faturas ~7-12s, kpis alunos ~5s/unidade,
-- resumo de professores ~10-40s frio) ja tem cache, mas o primeiro
-- usuario depois da expiracao/invalidacao ainda espera o compute. O cron
-- chama esta funcao a cada 4min — menor que o menor TTL (dash_prof, 5min)
-- — e os hits custam ms; so os misses reais computam.
--
-- A funcao empresta o contexto JWT de um admin ativo (set_config local)
-- para que os guards de auth internos e o escopo de unidades resolvam
-- como no caminho real do front. Chaves cobertas: consolidado + cada
-- unidade ativa, competencia corrente, e os 12 meses do ano para o par
-- comercial (a pagina dispara 12+12 chamadas).

create or replace function public.dashboard_aquecer_caches_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '240s'
as $function$
declare
  v_claims text;
  v_ano int := extract(year from now() at time zone 'America/Sao_Paulo')::int;
  v_mes int := extract(month from now() at time zone 'America/Sao_Paulo')::int;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_unidades uuid[];
  v_u uuid;
  v_m int;
  v_ok int := 0;
  v_erro int := 0;
  v_erros text[] := '{}';
begin
  -- Reentrancia: se um aquecimento ja esta rodando, esta execucao sai.
  if not pg_try_advisory_xact_lock(hashtext('dashboard_aquecer_caches_v1')) then
    return jsonb_build_object('status', 'pulado_lock');
  end if;

  -- Contexto de um admin ativo: resolve escopo consolidado como o front.
  select json_build_object('sub', u.auth_user_id::text, 'role', 'authenticated')::text
    into v_claims
  from public.usuarios u
  where u.perfil = 'admin' and u.ativo is true
  order by u.id
  limit 1;

  if v_claims is null then
    return jsonb_build_object('status', 'sem_admin_ativo');
  end if;
  perform set_config('request.jwt.claims', v_claims, true);

  select coalesce(array_agg(u.id order by u.id), '{}')
    into v_unidades
  from public.unidades u
  where u.ativo is true;

  -- Faturas: consolidado + cada unidade (parametros default do front).
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_faturas_alunos_financeiro_v1(v_u, v_ano, v_mes, 'janela_3', 'todas', v_hoje);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('faturas/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
    end;
  end loop;

  -- KPIs de alunos: consolidado + cada unidade.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_kpis_alunos_canonicos(v_u, v_ano, v_mes);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('kpis_alunos/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
    end;
  end loop;

  -- Resumo de professores: consolidado + cada unidade.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_dashboard_professores_resumo_canonico_v1(
        p_ano => v_ano, p_mes => v_mes, p_unidade_id => v_u,
        p_data_inicio => null, p_data_fim => null);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('dash_prof/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
    end;
  end loop;

  -- Comercial: a pagina dispara 12 meses x 2 RPCs no consolidado.
  for v_m in 1..12 loop
    begin
      perform public.get_kpis_comercial_canonicos_v2(null::uuid, v_ano, v_m, 'mensal', null);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('comercial/' || v_m || ': ' || sqlerrm);
    end;
    begin
      perform public.get_conciliacao_experimentais_v2(null::uuid, v_ano, v_m, 'mensal', null);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('conciliacao/' || v_m || ': ' || sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'status', 'ok',
    'aquecidas', v_ok,
    'erros', v_erro,
    'detalhe_erros', to_jsonb(v_erros)
  );
end;
$function$;

comment on function public.dashboard_aquecer_caches_v1() is
  'Aquecedor de caches da dashboard: cobre faturas, kpis_alunos, dash_prof e par comercial (12 meses) com contexto de admin emprestado. Cron a cada 4min < menor TTL (5min). Single-flight por advisory lock. Criado em 2026-09-24 (prod).';

revoke all on function public.dashboard_aquecer_caches_v1() from public, anon, authenticated;

-- Cron: a cada 4min, abaixo do menor TTL de cache (5min do dash_prof).
select cron.unschedule('dashboard-aquecer-caches')
where exists (select 1 from cron.job where jobname = 'dashboard-aquecer-caches');

select cron.schedule(
  'dashboard-aquecer-caches',
  '*/4 * * * *',
  $$select public.dashboard_aquecer_caches_v1()$$
);
