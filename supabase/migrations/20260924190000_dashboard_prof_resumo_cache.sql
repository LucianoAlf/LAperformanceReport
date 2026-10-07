-- 24/09/2026 — Dashboard travando: get_dashboard_professores_resumo_canonico_v1
-- ~5s por chamada e morria em 57014 (statement timeout) quando a instancia
-- respirava junto com os crons. O resumo muda devagar (webhooks de
-- movimentacao a cada poucos minutos); cache de 5 min com fingerprint leve
-- (count + max(created_at) de movimentacoes_admin, count + max(updated_at)
-- de alunos/professores) invalida quando chega dado novo.
--
-- A autorizacao e' resolvida NO WRAPPER antes de servir cache — cache nunca
-- pula autenticacao/escopo. O leitor original e' renomeado e o nome publico
-- vira o wrapper VOLATILE.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'dash_prof_resumo_row') then
    create type public.dash_prof_resumo_row as (
      carteira_alunos integer,
      alunos_via_turmas integer,
      turmas_elegiveis_media integer,
      renovacoes integer,
      nao_renovacoes integer
    );
  end if;
end $$;

alter function public.get_dashboard_professores_resumo_canonico_v1(integer, integer, uuid, date, date)
  rename to dash_prof_resumo_sem_cache_20260924;

create table if not exists public.dash_prof_resumo_cache (
  cache_key text primary key,
  payload jsonb not null,
  built_at timestamptz not null default now()
);

comment on table public.dash_prof_resumo_cache is
  'Cache do resumo de professores do dashboard (5 colunas). TTL 5 min + fingerprint leve. Lido/escrito apenas via SECURITY DEFINER.';

revoke all on table public.dash_prof_resumo_cache from public, anon, authenticated;
revoke all on type public.dash_prof_resumo_row from public, anon, authenticated;

create or replace function public.get_dashboard_professores_resumo_canonico_v1(p_ano integer, p_mes integer, p_unidade_id uuid DEFAULT NULL::uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date)
 returns setof public.dash_prof_resumo_row
 language plpgsql
 VOLATILE
 SECURITY DEFINER
 set search_path to 'public', 'pg_temp'
 set plan_cache_mode to 'force_custom_plan'
as $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_unidade_efetiva uuid;
  v_inicio date := coalesce(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date;
  v_fingerprint text;
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

  -- Fingerprint leve: mudancas operacionais relevantes (renovacao/nao
  -- renovacao, aluno/professor novo) quebram o cache sozinhas.
  select concat_ws(':',
      (select count(*) from public.movimentacoes_admin),
      (select coalesce(max(created_at)::text, 'vazio') from public.movimentacoes_admin),
      (select count(*) from public.alunos),
      (select coalesce(max(updated_at)::text, 'vazio') from public.alunos),
      (select count(*) from public.professores),
      (select coalesce(max(updated_at)::text, 'vazio') from public.professores),
      (select count(*) from public.professores_unidades)
    ) into v_fingerprint;

  v_key := md5(concat_ws('|',
    p_ano, p_mes,
    coalesce(v_unidade_efetiva::text, 'consolidado'),
    v_inicio, v_fim, v_fingerprint
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

revoke all on function public.get_dashboard_professores_resumo_canonico_v1(integer, integer, uuid, date, date) from public, anon;
grant execute on function public.get_dashboard_professores_resumo_canonico_v1(integer, integer, uuid, date, date) to authenticated, service_role;
revoke all on function public.dash_prof_resumo_sem_cache_20260924(integer, integer, uuid, date, date) from public, anon, authenticated;

do $pos$
declare
  v_falhas text[] := '{}';
begin
  if not exists (select 1 from pg_proc where proname = 'dash_prof_resumo_sem_cache_20260924') then
    v_falhas := v_falhas || 'leitor interno ausente';
  end if;
  if exists (
    select 1 from pg_proc
    where proname = 'get_dashboard_professores_resumo_canonico_v1'
      and provolatile <> 'v'
  ) then
    v_falhas := v_falhas || 'wrapper precisa ser VOLATILE';
  end if;
  if has_function_privilege('anon',
      'get_dashboard_professores_resumo_canonico_v1(integer,integer,uuid,date,date)', 'EXECUTE') then
    v_falhas := v_falhas || 'wrapper executavel por anon';
  end if;
  if has_table_privilege('anon', 'public.dash_prof_resumo_cache', 'SELECT') then
    v_falhas := v_falhas || 'cache legivel por anon';
  end if;
  if array_length(v_falhas, 1) > 0 then
    raise exception E'POS-CONDICAO cache dash prof NAO FECHOU:\n  %',
      array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'dash_prof_resumo_cache ok';
end $pos$;
