-- 24/09/2026 — fix da 20260924180000: id das tabelas de snapshot e' uuid
-- (max(uuid) nao existe). Fingerprint passa a usar count + max(criado_em).

create or replace function public.get_health_score_professor_v3_performance_snapshot_v3(p_competencia date, p_unidade_id uuid, p_periodicidade text)
 returns setof public.hsf_v3_reader_row
 language plpgsql
 VOLATILE
 SECURITY DEFINER
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fingerprint text;
  v_key text;
  v_cached jsonb;
  v_linhas jsonb;
begin
  -- Fingerprint: qualquer materializacao nova muda count ou max(criado_em)
  -- (id e' uuid — nao ordena). Custo: poucos ms.
  select concat_ws(':',
      (select count(*) from public.health_score_professor_v3_snapshots),
      (select coalesce(max(criado_em)::text, 'vazio') from public.health_score_professor_v3_snapshots),
      (select count(*) from public.health_score_professor_v3_snapshot_metricas)
    ) into v_fingerprint;

  v_key := md5(concat_ws('|',
    coalesce(p_competencia::text, 'null'),
    coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_periodicidade, 'null'),
    v_fingerprint
  ));

  select c.payload into v_cached
  from public.health_score_v3_reader_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return query
      select r.* from jsonb_populate_recordset(null::public.hsf_v3_reader_row, v_cached) r;
    return;
  end if;

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
    into v_linhas
  from public.hs_prof_v3_reader_sem_cache_20260924(
    p_competencia, p_unidade_id, p_periodicidade
  ) l;

  insert into public.health_score_v3_reader_cache (cache_key, payload)
  values (v_key, v_linhas)
  on conflict (cache_key) do update
    set payload = excluded.payload,
        built_at = now();

  delete from public.health_score_v3_reader_cache
  where built_at < now() - interval '1 day';

  return query
    select r.* from jsonb_populate_recordset(null::public.hsf_v3_reader_row, v_linhas) r;
end;
$function$;

revoke all on function public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text) to authenticated, service_role;

do $$
begin
  if pg_get_functiondef('public.get_health_score_professor_v3_performance_snapshot_v3(date,uuid,text)'::regprocedure)
     not like '%max(criado_em)%' then
    raise exception 'fingerprint antigo ainda no corpo';
  end if;
  raise notice 'fix fingerprint health v3 ok';
end $$;
