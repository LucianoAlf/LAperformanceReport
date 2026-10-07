-- Estende o aquecedor com as RPCs pesadas das paginas Agenda,
-- Administrativo, Alunos e Professores (agora com paginas_rpc_cache).
--
-- Custos frios medidos: tempo_permanencia >120s/chave (por isso o teto
-- do aquecedor sobe para 15min — 4 chaves frias podem somar ~10min na
-- primeira passada; quente, cada chamada e um lookup de ms).

create or replace function public.dashboard_aquecer_caches_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '15min'
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

  -- Agenda: dia corrente, consolidado + cada unidade.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_agenda_dia_v2(v_hoje, v_u);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('agenda/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
    end;
  end loop;

  -- KPIs admin (Administrativo + Alunos): consolidado + cada unidade.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_kpis_alunos_admin_operacional(v_u, v_ano, v_mes);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('kpis_admin/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
    end;
  end loop;

  -- Tempo de permanencia / LTV (Alunos): consolidado + cada unidade.
  -- Frio >120s por chave; quente vira lookup de ms no paginas_rpc_cache.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_tempo_permanencia(v_u, null, null);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('tempo_permanencia/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
    end;
  end loop;

  -- KPIs cadastro de professores (aba Cadastro): consolidado + unidades.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_kpis_professores_cadastro_canonicos_v1(v_ano, v_mes, v_u, null, null);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('prof_cadastro/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
    end;
  end loop;

  -- KPIs performance de professores (ja tem cache proprio): idem.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_kpis_professor_periodo_canonico_v3(v_ano, v_mes, v_u, null, null);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('prof_periodo/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
    end;
  end loop;

  -- Inadimplencia canonica (Administrativo / Alunos): consolidado + unidades.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_inadimplencia_canonica(v_u, v_hoje);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('inadimplencia/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
    end;
  end loop;

  -- Faturas Emusys (modal Administrativo / Alunos): consolidado + unidades.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_financeiro_faturas_emusys(v_u, v_ano, v_mes);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('fin_faturas/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
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
  'Aquecedor de caches: faturas, kpis_alunos, dash_prof, comercial 12m, agenda, kpis_admin, tempo_permanencia, prof_cadastro, prof_periodo, inadimplencia, financeiro_faturas_emusys — consolidado + unidades ativas, competencia corrente. Cron a cada 4min; single-flight; teto 15min (tempo_permanencia frio >120s/chave). Contexto de admin emprestado. Atualizado em 2026-09-24 (prod).';

revoke all on function public.dashboard_aquecer_caches_v1() from public, anon, authenticated;
