-- 24/09/2026 — convergencia dos dois caches de get_kpis_alunos_canonicos.
-- O front chama o nome publico por unidade (3x sequencial no consolidado):
-- sem cache custa ~5,4s por chamada; 57014 sob concorrencia. Existia um
-- leitor cacheado separado (get_kpis_alunos_canonicos_cache_v1) que o front
-- nao chama, com chave por-usuario (payload e identico para qualquer
-- chamador — a funcao nao tem auth interno), sem teto e sem single-flight.
--
-- Este wrapper cobre o nome publico (front e edge saem beneficiados sem
-- deploy) e REUSA a infra da outra frente: tabela kpis_alunos_cache
-- (funcao='canonicos', namespace de chave 'publico') e a impressao
-- kpis_alunos_cache_impressao_v1 (pg_stat de 17 tabelas, custo ~zero).
-- TTL de 30min fica como rede para insumo fora da impressao; single-flight
-- por advisory lock evita recomputacao paralela num miss; chave compartilhada
-- (uma computacao serve todos) porque a resposta nao depende do chamador.

alter function public.get_kpis_alunos_canonicos(uuid, integer, integer)
  rename to kpis_alunos_sem_cache_20260924;

create or replace function public.get_kpis_alunos_canonicos(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (extract(year from now() at time zone 'America/Sao_Paulo'))::integer,
  p_mes integer default (extract(month from now() at time zone 'America/Sao_Paulo'))::integer
)
 returns jsonb
 language plpgsql
 VOLATILE
 SECURITY DEFINER
 set search_path to 'public', 'pg_temp'
 set statement_timeout to '95s'
as $function$
declare
  v_key text;
  v_cached jsonb;
begin
  v_key := md5(concat_ws('|',
    'publico',
    coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_ano::text, 'null'),
    coalesce(p_mes::text, 'null'),
    (now() at time zone 'America/Sao_Paulo')::date,
    public.kpis_alunos_cache_impressao_v1()
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

revoke all on function public.get_kpis_alunos_canonicos(uuid, integer, integer) from public, anon;
grant execute on function public.get_kpis_alunos_canonicos(uuid, integer, integer) to authenticated, service_role;
revoke all on function public.kpis_alunos_sem_cache_20260924(uuid, integer, integer) from public, anon, authenticated;

do $pos$
declare
  v_falhas text[] := '{}';
begin
  if not exists (select 1 from pg_proc where proname = 'kpis_alunos_sem_cache_20260924') then
    v_falhas := v_falhas || 'leitor interno renomeado ausente';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'get_kpis_alunos_canonicos'
      and pg_get_function_result(oid) = 'jsonb' and provolatile = 'v'
  ) then
    v_falhas := v_falhas || 'wrapper ausente, nao-jsonb ou nao-VOLATILE';
  end if;
  if has_function_privilege('anon',
      'get_kpis_alunos_canonicos(uuid,integer,integer)', 'EXECUTE') then
    v_falhas := v_falhas || 'wrapper executavel por anon';
  end if;
  if array_length(v_falhas, 1) > 0 then
    raise exception E'POS-CONDICAO cache publico kpis alunos NAO FECHOU:\n  %',
      array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'cache publico kpis_alunos ok';
end $pos$;
