-- 23/09/2026 — Dashboard: get_kpis_alunos_canonicos e' a leitura mais pesada
-- da pagina inicial (consolidado 30-55s sob carga; 57014 nos 8s do papel
-- authenticated). Mesmo padrao de 20260924180000/20260924190000: o nome
-- publico vira wrapper VOLATILE com cache jsonb e o original vai para
-- *_sem_cache_20260923.
--
-- Fingerprint: count + max(updated_at/created_at) das fontes reais da cadeia
-- (alunos, movimentacoes_admin, alunos_historico, emusys_matriculas_estado_atual
-- via vw_alunos_estado_operacional_v131, fechamento_mensal_snapshots,
-- unidades, tipos_matricula, cursos) — todas < 15k linhas, custo ~ms.
-- A chave inclui a data corrente (America/Sao_Paulo): o resultado depende do
-- dia-corte do mes vigente, entao cache nunca atravessa meia-noite.
--
-- Single-flight: advisory lock por chave apos o miss — uma rajada de chamadas
-- frias simultaneas computa 1x; as demais esperam o lock e releem o cache.

alter function public.get_kpis_alunos_canonicos(uuid, integer, integer)
  rename to kpis_alunos_sem_cache_20260923;

create table if not exists public.kpis_alunos_canonicos_cache (
  cache_key text primary key,
  payload jsonb not null,
  built_at timestamptz not null default now()
);

comment on table public.kpis_alunos_canonicos_cache is
  'Cache de get_kpis_alunos_canonicos (jsonb). Chave = md5(unidade+ano+mes+dia+fingerprint das fontes). TTL 30min. Lido/escrito apenas via SECURITY DEFINER.';

revoke all on table public.kpis_alunos_canonicos_cache from public, anon, authenticated;

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
  v_fingerprint text;
  v_key text;
  v_cached jsonb;
begin
  select concat_ws(':',
      (select count(*) from public.alunos),
      (select coalesce(max(updated_at)::text, 'vazio') from public.alunos),
      (select count(*) from public.movimentacoes_admin),
      (select coalesce(max(created_at)::text, 'vazio') from public.movimentacoes_admin),
      (select coalesce(max(updated_at)::text, 'vazio') from public.movimentacoes_admin),
      (select count(*) from public.alunos_historico),
      (select coalesce(max(updated_at)::text, 'vazio') from public.alunos_historico),
      (select count(*) from public.emusys_matriculas_estado_atual),
      (select coalesce(max(updated_at)::text, 'vazio') from public.emusys_matriculas_estado_atual),
      (select count(*) from public.fechamento_mensal_snapshots),
      (select coalesce(max(updated_at)::text, 'vazio') from public.fechamento_mensal_snapshots),
      (select count(*) from public.unidades),
      (select count(*) from public.tipos_matricula),
      (select count(*) from public.cursos),
      (select coalesce(max(updated_at)::text, 'vazio') from public.cursos)
    ) into v_fingerprint;

  v_key := md5(concat_ws('|',
    coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_ano::text, 'null'),
    coalesce(p_mes::text, 'null'),
    (now() at time zone 'America/Sao_Paulo')::date,
    v_fingerprint
  ));

  select c.payload into v_cached
  from public.kpis_alunos_canonicos_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  -- Single-flight: quem chega junto num miss espera o primeiro gravar.
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select c.payload into v_cached
  from public.kpis_alunos_canonicos_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  -- Leitor pode devolver NULL (sem dados): jsonb 'null' preserva o contrato.
  v_cached := coalesce(
    public.kpis_alunos_sem_cache_20260923(p_unidade_id, p_ano, p_mes),
    'null'::jsonb
  );

  insert into public.kpis_alunos_canonicos_cache (cache_key, payload)
  values (v_key, v_cached)
  on conflict (cache_key) do update
    set payload = excluded.payload,
        built_at = now();

  delete from public.kpis_alunos_canonicos_cache
  where built_at < now() - interval '1 day';

  return v_cached;
end;
$function$;

-- Mesma fronteira de acesso do original (authenticated + service_role).
revoke all on function public.get_kpis_alunos_canonicos(uuid, integer, integer) from public, anon;
grant execute on function public.get_kpis_alunos_canonicos(uuid, integer, integer) to authenticated, service_role;
revoke all on function public.kpis_alunos_sem_cache_20260923(uuid, integer, integer) from public, anon, authenticated;

do $pos$
declare
  v_falhas text[] := '{}';
begin
  if not exists (select 1 from pg_proc where proname = 'kpis_alunos_sem_cache_20260923') then
    v_falhas := v_falhas || 'leitor interno renomeado ausente';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'get_kpis_alunos_canonicos'
      and pg_get_function_result(oid) = 'jsonb'
  ) then
    v_falhas := v_falhas || 'wrapper ausente ou nao retorna jsonb';
  end if;
  if exists (
    select 1 from pg_proc
    where proname = 'get_kpis_alunos_canonicos'
      and provolatile <> 'v'
  ) then
    v_falhas := v_falhas || 'wrapper precisa ser VOLATILE (escreve cache)';
  end if;
  if has_function_privilege('anon',
      'get_kpis_alunos_canonicos(uuid,integer,integer)', 'EXECUTE') then
    v_falhas := v_falhas || 'wrapper executavel por anon';
  end if;
  if not has_function_privilege('authenticated',
      'get_kpis_alunos_canonicos(uuid,integer,integer)', 'EXECUTE') then
    v_falhas := v_falhas || 'wrapper sem grant para authenticated';
  end if;
  if has_table_privilege('anon', 'public.kpis_alunos_canonicos_cache', 'SELECT') then
    v_falhas := v_falhas || 'cache legivel por anon';
  end if;
  if array_length(v_falhas, 1) > 0 then
    raise exception E'POS-CONDICAO cache kpis alunos NAO FECHOU:\n  %',
      array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'kpis_alunos_canonicos_cache ok';
end $pos$;
