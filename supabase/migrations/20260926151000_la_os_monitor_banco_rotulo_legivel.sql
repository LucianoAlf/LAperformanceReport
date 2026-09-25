-- =====================================================================
-- Monitor de desempenho (LAPE-46): rotulo legivel no ranking "o que gastou".
--
-- O texto de pg_stat_statements das chamadas do PostgREST comeca sempre com
-- `WITH pgrst_source AS (...)` -- no ranking, 4 de 6 linhas eram iguais a
-- olho nu. O nome do que foi chamado esta dentro do texto; esta funcao o
-- extrai. Pura (immutable), sem leitura de tabela.
-- =====================================================================

create or replace function monitoramento.banco_rotulo(p_texto text)
returns text
language sql immutable
set search_path = pg_catalog
as $$
  select case
    when p_texto is null then null
    when p_texto ~ 'pgrst_call' then
      'RPC ' || coalesce(substring(p_texto from 'LATERAL \(SELECT "?\w+"?\."?(\w+)"?\('), '?')
    when p_texto ~* '^\s*WITH pgrst_source AS \(\s*SELECT' then
      'API leitura: ' || coalesce(substring(p_texto from 'FROM "?\w+"?\."?(\w+)"?'), '?')
    when p_texto ~* '^\s*WITH pgrst_source AS \(\s*INSERT INTO' then
      'API escrita: ' || coalesce(substring(p_texto from 'INSERT INTO "?\w+"?\."?(\w+)"?'), '?')
    when p_texto ~* '^\s*WITH pgrst_source AS \(\s*UPDATE' then
      'API atualiza: ' || coalesce(substring(p_texto from 'UPDATE "?\w+"?\."?(\w+)"?'), '?')
    when p_texto ~* '^\s*WITH pgrst_source AS \(\s*DELETE' then
      'API apaga: ' || coalesce(substring(p_texto from 'DELETE FROM "?\w+"?\."?(\w+)"?'), '?')
    when p_texto ~ 'realtime\.list_changes' then 'Realtime (escuta de mudancas)'
    when p_texto ~* '^\s*select\s+(\w+\.)?\w+\(' then
      'Funcao ' || substring(p_texto from '(?i)^\s*select\s+(?:\w+\.)?(\w+)\(')
    else left(p_texto, 300)
  end;
$$;

create or replace function monitoramento.banco_consumidores(p_horas integer)
returns table (tipo text, chave text, rotulo text, chamadas bigint, tempo_ms numeric, max_ms numeric,
               leitura_blocos bigint, temp_blocos bigint, falhas bigint, pct_tempo numeric)
language sql stable security definer
set search_path = monitoramento, pg_catalog
as $$
  with janela as (
    select * from monitoramento.banco_consumo c
    where c.coletado_em >= now() - make_interval(hours => least(greatest(coalesce(p_horas, 24), 1), 24 * 30))
  ),
  total as (select nullif(sum(tempo_ms), 0) tot from janela where tipo = 'total'),
  agg as (
    select j.tipo, j.chave, sum(j.chamadas)::bigint chamadas, sum(j.tempo_ms) tempo_ms,
           max(j.max_ms) max_ms, sum(j.leitura_blocos)::bigint leitura_blocos,
           sum(j.temp_blocos)::bigint temp_blocos, sum(j.falhas)::bigint falhas
    from janela j where j.tipo in ('query', 'cron')
    group by 1, 2
  )
  select a.tipo, a.chave,
         case when a.tipo = 'query'
              then coalesce(monitoramento.banco_rotulo(q.texto), 'queryid ' || a.chave)
              else a.chave end,
         a.chamadas, round(a.tempo_ms), round(a.max_ms), a.leitura_blocos, a.temp_blocos, a.falhas,
         case when a.tipo = 'query' then round(100 * a.tempo_ms / (select tot from total), 1) end
  from agg a
  left join monitoramento.banco_query_texto q on a.tipo = 'query' and q.queryid::text = a.chave
  order by a.tempo_ms desc nulls last
  limit 60;
$$;

revoke execute on function monitoramento.banco_rotulo(text) from public, anon, authenticated, service_role;
revoke execute on function monitoramento.banco_consumidores(integer) from public, anon, authenticated, service_role;
