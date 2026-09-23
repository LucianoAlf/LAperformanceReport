-- 24/09/2026 — Dashboard travando na entrada: o leitor de health score v3
-- (get_health_score_professor_v3_performance_snapshot_v3) media ~11,6s com
-- picos de 38s e estourava em 500 quando os crons de snapshot saturavam a
-- instancia. A leitura e' funcao pura das tabelas *_v3_snapshots (reescritas
-- pelos cron jobs de materializacao), entao cache por fingerprint invalida
-- sozinho: snapshot materializado novo => fingerprint muda => chave nova.
--
-- RETURNS TABLE nao nomeia tipo composto (prorettype = record), entao o
-- contrato vira um tipo explicito com as mesmas colunas do leitor original.
-- O leitor e' renomeado e o v3 publico vira wrapper VOLATILE cacheado.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'hsf_v3_reader_row') then
    create type public.hsf_v3_reader_row as (
      professor_id integer,
      unidade_id uuid,
      escopo text,
      competencia date,
      trimestre_inicio date,
      periodicidade text,
      periodo_inicio date,
      periodo_fim date,
      ciclo_codigo text,
      estado_publicacao text,
      score_exibivel boolean,
      ranking_habilitado boolean,
      config_versao integer,
      revisao integer,
      score numeric,
      cobertura numeric,
      classificacao text,
      estado text,
      snapshot_publicavel boolean,
      publicado boolean,
      motivo_bloqueio text,
      regra_versao_snapshot text,
      metrica text,
      valor_bruto numeric,
      numerador numeric,
      denominador numeric,
      nota numeric,
      peso numeric,
      peso_disponivel boolean,
      peso_efetivo numeric,
      contribuicao numeric,
      meta numeric,
      amostra integer,
      estado_base text,
      metrica_publicavel boolean,
      confianca text,
      fonte text,
      regra_versao_metrica text,
      motivo_sem_base text,
      codigo_evidencia text,
      papel text,
      detalhes jsonb,
      score_observado numeric,
      score_comparavel numeric,
      pilares_validos integer,
      pilares_esperados integer,
      comparabilidade_estado text,
      comparabilidade_motivo text,
      competencia_referencia date,
      score_referencia numeric,
      classificacao_referencia text,
      data_corte date,
      config_id uuid,
      regra_fingerprint text,
      peso_pontuavel_total numeric,
      peso_disponivel_total numeric,
      cobertura_normalizada numeric,
      cobertura_minima_aplicada numeric,
      comparabilidade_motivos jsonb,
      retrato_calculado_em timestamp with time zone,
      retrato_execucao_id uuid,
      retrato_estado text,
      retrato_defasagem_minutos numeric
    );
  end if;
end $$;

alter function public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text)
  rename to hs_prof_v3_reader_sem_cache_20260924;

create table if not exists public.health_score_v3_reader_cache (
  cache_key text primary key,
  payload jsonb not null,
  built_at timestamptz not null default now()
);

comment on table public.health_score_v3_reader_cache is
  'Cache do leitor de health score v3. Chave = md5(params + count/max(id) das tabelas de snapshot). Lido/escrito apenas via SECURITY DEFINER.';

revoke all on table public.health_score_v3_reader_cache from public, anon, authenticated;

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

-- Mesma fronteira de acesso do leitor original.
revoke all on function public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text) to authenticated, service_role;
revoke all on function public.hs_prof_v3_reader_sem_cache_20260924(date, uuid, text) from public, anon, authenticated;
revoke all on type public.hsf_v3_reader_row from public, anon, authenticated;

do $pos$
declare
  v_falhas text[] := '{}';
begin
  if not exists (select 1 from pg_proc where proname = 'hs_prof_v3_reader_sem_cache_20260924') then
    v_falhas := v_falhas || 'leitor interno renomeado ausente';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'get_health_score_professor_v3_performance_snapshot_v3'
  ) then
    v_falhas := v_falhas || 'wrapper v3 ausente';
  end if;
  if exists (
    select 1 from pg_proc
    where proname = 'get_health_score_professor_v3_performance_snapshot_v3'
      and provolatile <> 'v'
  ) then
    v_falhas := v_falhas || 'wrapper v3 precisa ser VOLATILE (escreve cache)';
  end if;
  if has_function_privilege('anon',
      'get_health_score_professor_v3_performance_snapshot_v3(date,uuid,text)', 'EXECUTE') then
    v_falhas := v_falhas || 'wrapper v3 executavel por anon';
  end if;
  if has_table_privilege('anon', 'public.health_score_v3_reader_cache', 'SELECT') then
    v_falhas := v_falhas || 'cache legivel por anon';
  end if;
  if array_length(v_falhas, 1) > 0 then
    raise exception E'POS-CONDICAO cache health v3 NAO FECHOU:\n  %',
      array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'health_score_v3_reader_cache ok';
end $pos$;
