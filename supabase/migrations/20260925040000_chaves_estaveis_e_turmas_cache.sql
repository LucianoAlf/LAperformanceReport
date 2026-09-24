-- Chaves estaveis nos caches com fingerprint volatil + cache novo para
-- get_kpis_turmas_canonicos_v2 (gargalo da pagina Alunos).
--
-- Causa raiz (mesma das faturas): o fingerprint ia DENTRO da chave e
-- mede pg_stat/count/max de tabelas que o sync regrava a cada ~3-6min
-- (aulas_emusys, aluno_presenca, emusys_experimentais_raw, alunos...).
-- A chave mudava antes do TTL vencer -> hit rate ~0 -> todo usuario
-- pagava o compute frio. O frescor ja era limitado pelo TTL sancionado;
-- tirar o fingerprint da chave nao piora o contrato, so faz o cache
-- funcionar de fato.
--
--   get_kpis_alunos_canonicos      TTL 30min (fingerprint = n_tup de 17 tab)
--   get_kpis_comercial_canonicos_v2 TTL 30min (n_tup aulas_emusys/presenca)
--   get_conciliacao_experimentais_v2 TTL 30min (idem + experimentais_raw)
--   get_dashboard_professores_resumo_canonico_v1 TTL 5min
--     (count+max(updated_at) de alunos/professores — o sync atualiza alunos)
--
-- get_health_score_..._snapshot_v3 NAO mexe: o fingerprint dele mede a
-- materializacao (muda raramente) — desenho correto, so entra no aquecedor.

-- ── 1) KPIs de alunos (nome publico) ──────────────────────────────────
create or replace function public.get_kpis_alunos_canonicos(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from now() at time zone 'America/Sao_Paulo')::integer,
  p_mes integer default extract(month from now() at time zone 'America/Sao_Paulo')::integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '95s'
as $function$
declare
  v_key text;
  v_cached jsonb;
begin
  -- Chave logica estavel: a impressao pg_stat sai da chave — o sync
  -- regrava as 17 tabelas monitoradas a cada poucos minutos e zerava
  -- o hit rate. O frescor fica limitado pelo TTL de 30min (mesmo
  -- contrato anterior).
  v_key := md5(concat_ws('|',
    'publico',
    coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_ano::text, 'null'),
    coalesce(p_mes::text, 'null'),
    (now() at time zone 'America/Sao_Paulo')::date
  ));

  select c.payload into v_cached
  from public.kpis_alunos_cache c
  where c.cache_key = v_key
    and c.funcao = 'canonicos'
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select c.payload into v_cached
  from public.kpis_alunos_cache c
  where c.cache_key = v_key
    and c.funcao = 'canonicos'
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  v_cached := coalesce(
    public.kpis_alunos_sem_cache_20260924(p_unidade_id, p_ano, p_mes),
    'null'::jsonb
  );

  insert into public.kpis_alunos_cache (cache_key, funcao, payload)
  values (v_key, 'canonicos', v_cached)
  on conflict (cache_key) do update
    set payload = excluded.payload,
        built_at = now();

  return v_cached;
end;
$function$;

-- ── 2) KPIs comerciais ────────────────────────────────────────────────
create or replace function public.get_kpis_comercial_canonicos_v2(
  p_unidade_id uuid, p_ano integer, p_mes integer,
  p_periodo text default 'mensal'::text, p_data date default null::date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '35s'
as $function$
declare
  v_key text;
  v_cached jsonb;
begin
  v_key := md5(concat_ws('|',
    coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_ano::text, 'null'),
    coalesce(p_mes::text, 'null'),
    coalesce(p_periodo, 'null'),
    coalesce(p_data::text, 'null'),
    (now() at time zone 'America/Sao_Paulo')::date
  ));

  select c.payload into v_cached
  from public.kpis_comercial_v2_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select c.payload into v_cached
  from public.kpis_comercial_v2_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  v_cached := coalesce(
    public.kpis_comercial_v2_sem_cache_20260923(
      p_unidade_id, p_ano, p_mes, p_periodo, p_data
    ),
    'null'::jsonb
  );

  insert into public.kpis_comercial_v2_cache (cache_key, payload)
  values (v_key, v_cached)
  on conflict (cache_key) do update
    set payload = excluded.payload,
        built_at = now();

  delete from public.kpis_comercial_v2_cache
  where built_at < now() - interval '1 day';

  return v_cached;
end;
$function$;

-- ── 3) Conciliacao de experimentais ───────────────────────────────────
create or replace function public.get_conciliacao_experimentais_v2(
  p_unidade_id uuid, p_ano integer, p_mes integer,
  p_periodo text default 'mensal'::text, p_data date default null::date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '35s'
as $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_key text;
  v_cached jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    select u.id, u.perfil, u.unidade_id
      into v_usuario_id, v_perfil, v_unidade_usuario
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.ativo, true)
    limit 1;

    if v_usuario_id is null then
      raise exception 'Acesso negado: usuario sem cadastro ativo'
        using errcode = '42501';
    end if;

    if v_perfil = 'admin' then
      if not public.usuario_tem_permissao(
        v_usuario_id,
        'comercial.ver',
        p_unidade_id
      ) then
        raise exception 'Acesso negado: sem permissao para o comercial'
          using errcode = '42501';
      end if;
    elsif v_perfil = 'unidade' then
      if p_unidade_id is null
         or v_unidade_usuario is null
         or p_unidade_id <> v_unidade_usuario then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
    else
      if p_unidade_id is null
         or v_unidade_usuario is null
         or p_unidade_id <> v_unidade_usuario
         or not public.usuario_tem_permissao(
           v_usuario_id,
           'comercial.ver',
           v_unidade_usuario
         ) then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
    end if;
  end if;

  v_key := md5(concat_ws('|',
    coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_ano::text, 'null'),
    coalesce(p_mes::text, 'null'),
    coalesce(p_periodo, 'null'),
    coalesce(p_data::text, 'null'),
    (now() at time zone 'America/Sao_Paulo')::date
  ));

  select c.payload into v_cached
  from public.conciliacao_experimentais_v2_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select c.payload into v_cached
  from public.conciliacao_experimentais_v2_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  v_cached := coalesce(
    public.conciliacao_experimentais_v2_sem_cache_20260923(
      p_unidade_id, p_ano, p_mes, p_periodo, p_data
    ),
    'null'::jsonb
  );

  insert into public.conciliacao_experimentais_v2_cache (cache_key, payload)
  values (v_key, v_cached)
  on conflict (cache_key) do update
    set payload = excluded.payload,
        built_at = now();

  delete from public.conciliacao_experimentais_v2_cache
  where built_at < now() - interval '1 day';

  return v_cached;
end;
$function$;

-- ── 4) Resumo de professores da dashboard ─────────────────────────────
create or replace function public.get_dashboard_professores_resumo_canonico_v1(
  p_ano integer, p_mes integer,
  p_unidade_id uuid default null::uuid,
  p_data_inicio date default null::date,
  p_data_fim date default null::date
)
returns setof dash_prof_resumo_row
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set plan_cache_mode to 'force_custom_plan'
set statement_timeout to '90s'
as $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_unidade_efetiva uuid;
  v_inicio date := coalesce(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date;
  v_key text;
  v_cached jsonb;
  v_linhas jsonb;
begin
  if p_mes < 1 or p_mes > 12 then
    raise exception 'Mes invalido: %', p_mes using errcode = '22023';
  end if;

  v_fim := coalesce(p_data_fim, (v_inicio + interval '1 month - 1 day')::date);

  if v_fim < v_inicio then
    raise exception 'Periodo invalido: data final anterior a inicial'
      using errcode = '22023';
  end if;

  -- Autorizacao ANTES do cache: mesma regra do leitor original.
  if auth.role() = 'service_role' then
    v_unidade_efetiva := p_unidade_id;
  else
    select u.id, u.perfil, u.unidade_id
      into v_usuario_id, v_perfil, v_unidade_usuario
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.ativo = true
    limit 1;

    if v_usuario_id is null then
      raise exception 'Acesso negado: usuario sem cadastro ativo'
        using errcode = '42501';
    end if;

    if v_perfil = 'admin' then
      if not public.usuario_tem_permissao(v_usuario_id, 'professores.ver', p_unidade_id) then
        raise exception 'Acesso negado: sem permissao para professores'
          using errcode = '42501';
      end if;
      v_unidade_efetiva := p_unidade_id;
    elsif v_perfil = 'unidade' then
      if v_unidade_usuario is null
         or (p_unidade_id is not null and p_unidade_id <> v_unidade_usuario) then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
      v_unidade_efetiva := v_unidade_usuario;
    else
      if v_unidade_usuario is null
         or (p_unidade_id is not null and p_unidade_id <> v_unidade_usuario)
         or not public.usuario_tem_permissao(v_usuario_id, 'professores.ver', v_unidade_usuario) then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
      v_unidade_efetiva := v_unidade_usuario;
    end if;
  end if;

  v_key := md5(concat_ws('|',
    p_ano, p_mes,
    coalesce(v_unidade_efetiva::text, 'consolidado'),
    v_inicio, v_fim
  ));

  select c.payload into v_cached
  from public.dash_prof_resumo_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '5 minutes';
  if v_cached is not null then
    return query
      select r.* from jsonb_populate_recordset(null::public.dash_prof_resumo_row, v_cached) r;
    return;
  end if;

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
    into v_linhas
  from public.dash_prof_resumo_sem_cache_20260924(
    p_ano, p_mes,
    -- O leitor interno refaz a autorizacao; passamos a unidade EFETIVA ja
    -- resolvida para o caso de usuario-de-unidade pedir null.
    case when auth.role() = 'service_role' or v_perfil = 'admin'
      then v_unidade_efetiva else v_unidade_usuario end,
    v_inicio, v_fim
  ) l;

  insert into public.dash_prof_resumo_cache (cache_key, payload)
  values (v_key, v_linhas)
  on conflict (cache_key) do update
    set payload = excluded.payload,
        built_at = now();

  delete from public.dash_prof_resumo_cache
  where built_at < now() - interval '1 day';

  return query
    select r.* from jsonb_populate_recordset(null::public.dash_prof_resumo_row, v_linhas) r;
end;
$function$;

-- ── 5) KPIs de turmas (pagina Alunos) — ~2,8-5,4s frio ────────────────
-- A funcao filtra por usuario internamente (perfil unidade/outros sao
-- presos a propria unidade): escopo de unidades entra na chave, mesmo
-- padrao das outras wrappers — cache compartilhado sem vazar escopo.
alter function public.get_kpis_turmas_canonicos_v2(integer, integer, uuid, date, date)
  rename to kpis_turmas_canonicos_v2_sem_cache_20260925;

create function public.get_kpis_turmas_canonicos_v2(
  p_ano integer, p_mes integer,
  p_unidade_id uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table(professor_id integer, unidade_id uuid, ano integer, mes integer,
              ocupacoes_elegiveis integer, turmas_elegiveis integer,
              media_alunos_turma numeric, turmas_um_aluno integer,
              percentual_turmas_um_aluno numeric, competencia_status text,
              fonte text, regra_versao text)
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
declare
  v_key text;
  v_cached jsonb;
begin
  -- Guarda minima: bloqueia so PostgREST-anon. O guard fino (perfil,
  -- permissao, unidade efetiva) mora no leitor interno e o escopo ja
  -- entra na chave.
  if session_user::text in ('anon', 'authenticated')
     and coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'papel nao autorizado' using errcode = '42501';
  end if;

  v_key := md5(concat_ws('|',
    p_ano, p_mes, coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_data_inicio::text, '-'), coalesce(p_data_fim::text, '-'),
    public.paginas_rpc_cache_escopo_v1()
  ));

  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'kpis_turmas' and c.cache_key = v_key
    and c.built_at > now() - interval '15 minutes';
  if v_cached is not null then
    return query select * from jsonb_to_recordset(v_cached)
      as t(professor_id integer, unidade_id uuid, ano integer, mes integer,
           ocupacoes_elegiveis integer, turmas_elegiveis integer,
           media_alunos_turma numeric, turmas_um_aluno integer,
           percentual_turmas_um_aluno numeric, competencia_status text,
           fonte text, regra_versao text);
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('paginas|kpis_turmas|' || v_key));
  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'kpis_turmas' and c.cache_key = v_key
    and c.built_at > now() - interval '15 minutes';
  if v_cached is not null then
    return query select * from jsonb_to_recordset(v_cached)
      as t(professor_id integer, unidade_id uuid, ano integer, mes integer,
           ocupacoes_elegiveis integer, turmas_elegiveis integer,
           media_alunos_turma numeric, turmas_um_aluno integer,
           percentual_turmas_um_aluno numeric, competencia_status text,
           fonte text, regra_versao text);
    return;
  end if;

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_cached
  from public.kpis_turmas_canonicos_v2_sem_cache_20260925(
    p_ano, p_mes, p_unidade_id, p_data_inicio, p_data_fim) r;

  insert into public.paginas_rpc_cache (funcao, cache_key, payload)
  values ('kpis_turmas', v_key, v_cached)
  on conflict (funcao, cache_key) do update
    set payload = excluded.payload, built_at = now();

  return query select * from jsonb_to_recordset(v_cached)
    as t(professor_id integer, unidade_id uuid, ano integer, mes integer,
         ocupacoes_elegiveis integer, turmas_elegiveis integer,
         media_alunos_turma numeric, turmas_um_aluno integer,
         percentual_turmas_um_aluno numeric, competencia_status text,
         fonte text, regra_versao text);
end;
$function$;

-- Grants: mesmo publico da original (authenticated + service_role).
revoke all on function public.get_kpis_turmas_canonicos_v2(integer, integer, uuid, date, date)
  from public, anon;
grant execute on function public.get_kpis_turmas_canonicos_v2(integer, integer, uuid, date, date)
  to authenticated, service_role;
revoke all on function public.kpis_turmas_canonicos_v2_sem_cache_20260925(integer, integer, uuid, date, date)
  from public, anon, authenticated;

-- ── 6) Aquecedor: adiciona kpis_turmas + health-score ─────────────────
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
  v_comp date := make_date(extract(year from now() at time zone 'America/Sao_Paulo')::int,
                           extract(month from now() at time zone 'America/Sao_Paulo')::int, 1);
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

  -- Health-score de professores (cache proprio, fingerprint correto):
  -- competencia corrente, periodicidade mensal, consolidado + unidades.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_health_score_professor_v3_performance_snapshot_v3(
        v_comp, v_u, 'mensal');
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('health_score/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
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

  -- KPIs de turmas (Alunos): consolidado + cada unidade.
  foreach v_u in array (array_prepend(null::uuid, v_unidades)) loop
    begin
      perform public.get_kpis_turmas_canonicos_v2(v_ano, v_mes, v_u, null, null);
      v_ok := v_ok + 1;
    exception when others then
      v_erro := v_erro + 1;
      v_erros := v_erros || ('kpis_turmas/' || coalesce(v_u::text, 'consolidado') || ': ' || sqlerrm);
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
  'Aquecedor de caches: faturas, kpis_alunos, dash_prof, health_score, comercial 12m, agenda, kpis_admin, kpis_turmas, tempo_permanencia, prof_cadastro, prof_periodo, inadimplencia, financeiro_faturas_emusys — consolidado + unidades ativas, competencia corrente. Cron a cada 4min; single-flight; teto 15min. Contexto de admin emprestado. Atualizado em 2026-09-25 (prod).';

revoke all on function public.dashboard_aquecer_caches_v1() from public, anon, authenticated;
