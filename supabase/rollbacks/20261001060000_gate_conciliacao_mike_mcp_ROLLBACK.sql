-- Volta o gate original (só postgres/service_role).
CREATE OR REPLACE FUNCTION public.get_conciliacao_experimentais_v2(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text DEFAULT 'mensal'::text, p_data date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '35s'
AS $function$
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
    public.cache_versao_v1('get_conciliacao_experimentais_v2(uuid,integer,integer,text,date)'),
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

CREATE OR REPLACE FUNCTION public.conciliacao_experimentais_v2_sem_cache_20260923(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text DEFAULT 'mensal'::text, p_data date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_result jsonb;
  v_resumo jsonb;
  v_inicio date;
  v_denominador integer := 0;
  v_conversoes_atual integer := 0;
  v_conversoes_original integer := 0;
  v_duplicidades_estimadas integer := 0;
  v_taxa numeric;
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

  v_result := public.get_conciliacao_experimentais_snapshot_p21_v1(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodo,
    p_data
  );

  v_inicio := case
    when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then coalesce(p_data, make_date(p_ano, p_mes, 1))
    else make_date(p_ano, p_mes, 1)
  end;

  if v_inicio < date '2026-06-01' then
    v_result := jsonb_set(
    v_result,
    '{fonte_taxa_exp_mat,snapshot}',
    to_jsonb('snapshot_ativo_p24'::text),
    true
  );
  return v_result;
  end if;

  v_resumo := coalesce(v_result->'resumo', '{}'::jsonb);
  v_denominador := coalesce(nullif(v_resumo->>'denominador_taxa_exp_mat', '')::integer, 0);
  v_conversoes_atual := coalesce(nullif(v_resumo->>'conversoes_exp_mat_canonicas', '')::integer, 0);
  v_conversoes_original := coalesce(
    nullif(v_resumo->>'conversoes_exp_mat_original_p21', '')::integer,
    v_conversoes_atual
  );
  v_duplicidades_estimadas := v_denominador - v_conversoes_original;

  if v_denominador > 0
     and v_conversoes_original > v_conversoes_atual
     and v_conversoes_original > 0
     and v_conversoes_original < v_denominador
     and v_duplicidades_estimadas between 1 and 5 then
    v_taxa := round(v_conversoes_original::numeric / v_conversoes_original * 100, 1);

    v_resumo := jsonb_set(v_resumo, '{denominador_taxa_exp_mat}', to_jsonb(v_conversoes_original), true);
    v_resumo := jsonb_set(v_resumo, '{experimentais_realizadas_confirmadas}', to_jsonb(v_conversoes_original), true);
    v_resumo := jsonb_set(v_resumo, '{realizadas_status_operacional}', to_jsonb(v_conversoes_original), true);
    v_resumo := jsonb_set(v_resumo, '{raw_realizadas_emusys_comercial}', to_jsonb(v_conversoes_original), true);
    v_resumo := jsonb_set(v_resumo, '{conversoes_exp_mat_canonicas}', to_jsonb(v_conversoes_original), true);
    v_resumo := jsonb_set(v_resumo, '{taxa_exp_mat_canonica}', to_jsonb(v_taxa), true);
    v_resumo := jsonb_set(v_resumo, '{duplicidades_raw_corrigidas_p22}', to_jsonb(v_duplicidades_estimadas), true);
    v_resumo := jsonb_set(v_resumo, '{taxa_exp_mat_status}', to_jsonb('liberada_p22_deduplicacao_raw_convertido'::text), true);

    v_result := jsonb_set(v_result, '{resumo}', v_resumo, true);
    v_result := jsonb_set(v_result, '{fonte_taxa_exp_mat,status}', to_jsonb('p22_deduplicacao_raw_convertido'::text), true);
    v_result := jsonb_set(
      v_result,
      '{fonte_taxa_exp_mat,denominador}',
      to_jsonb('experimentais comerciais deduplicadas quando raw Emusys duplicou evento convertido'::text),
      true
    );
  end if;

  v_result := jsonb_set(
    v_result,
    '{fonte_taxa_exp_mat,snapshot}',
    to_jsonb('snapshot_ativo_p24'::text),
    true
  );
  return v_result;
end;
$function$;
