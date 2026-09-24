-- Fingerprint do health-score deixava de ser "poucos ms": count(*) e
-- max(criado_em) fazem seqscan nas tabelas de snapshot (sem indice em
-- criado_em) — medido ~54s por chamada, ate em cache hit, e estourava
-- o statement_timeout de 90s em horario de pico (o que derrubou o
-- aquecedor inteiro).
--
-- Troca por leitura instantanea de catalogo: n_tup_* do pg_stat +
-- reltuples do pg_class. As tabelas de snapshot/metricas so mudam
-- quando uma materializacao nova grava — exatamente o evento que o
-- fingerprint quer capturar. Mesma semantica, custo ~0.

create or replace function public.get_health_score_professor_v3_performance_snapshot_v3(
  p_competencia date, p_unidade_id uuid, p_periodicidade text
)
returns setof hsf_v3_reader_row
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '90s'
as $function$
declare
  v_fingerprint text;
  v_key text;
  v_cached jsonb;
  v_linhas jsonb;
begin
  -- Fingerprint instantaneo (catalogo): qualquer materializacao nova
  -- escreve nas duas tabelas e move n_tup/reltuples. As tabelas nao sao
  -- tocadas pelo sync — chave estavel entre materializacoes.
  select concat_ws(':',
      (select s.n_tup_ins + s.n_tup_upd + s.n_tup_del
         from pg_stat_user_tables s
        where s.schemaname = 'public'
          and s.relname = 'health_score_professor_v3_snapshots'),
      (select c.reltuples::bigint
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'health_score_professor_v3_snapshots'),
      (select s.n_tup_ins + s.n_tup_upd + s.n_tup_del
         from pg_stat_user_tables s
        where s.schemaname = 'public'
          and s.relname = 'health_score_professor_v3_snapshot_metricas'),
      (select c.reltuples::bigint
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'health_score_professor_v3_snapshot_metricas')
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
