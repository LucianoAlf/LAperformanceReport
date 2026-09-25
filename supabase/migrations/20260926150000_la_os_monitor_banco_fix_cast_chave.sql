-- =====================================================================
-- Fix do monitor de desempenho (LAPE-46): cast de `chave` para bigint.
--
-- `banco_consumo.chave` guarda queryid (numerico) E nome de cron (texto).
-- Filtrar `tipo = 'query'` na mesma condicao NAO garante que o cast rode so
-- nas linhas de consulta -- o Postgres pode avaliar `chave::bigint` antes.
-- Deu 22P02 ("financeiro-sync-atual-15m") em la_os_banco_consumidores logo
-- no 1o teste. A comparacao passa a ser por TEXTO (`queryid::text = chave`),
-- sem cast nenhum na coluna mista. Mesmo risco corrigido em coletar_consumo.
-- =====================================================================

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
         case when a.tipo = 'query' then left(coalesce(q.texto, 'queryid ' || a.chave), 300) else a.chave end,
         a.chamadas, round(a.tempo_ms), round(a.max_ms), a.leitura_blocos, a.temp_blocos, a.falhas,
         case when a.tipo = 'query' then round(100 * a.tempo_ms / (select tot from total), 1) end
  from agg a
  left join monitoramento.banco_query_texto q on a.tipo = 'query' and q.queryid::text = a.chave
  order by a.tempo_ms desc nulls last
  limit 60;
$$;

do $$
declare v_def text; v_novo text;
begin
  v_def := pg_get_functiondef('monitoramento.coletar_consumo(integer)'::regprocedure);
  v_novo := replace(v_def,
    'where t.queryid = b.chave::bigint)) then',
    'where t.queryid::text = b.chave)) then');
  v_novo := replace(v_novo,
    'where s.queryid in (select b.chave::bigint from monitoramento.banco_consumo b
                          where b.coletado_em = v_agora and b.tipo = ''query'')',
    'where s.queryid::text in (select b.chave from monitoramento.banco_consumo b
                          where b.coletado_em = v_agora and b.tipo = ''query'')');
  if v_novo = v_def or position('chave::bigint' in v_novo) > 0 then
    raise exception 'fix de coletar_consumo nao casou (ancoras); nada aplicado';
  end if;
  execute v_novo;
end $$;

revoke execute on function monitoramento.banco_consumidores(integer) from public, anon, authenticated, service_role;
revoke execute on function monitoramento.coletar_consumo(integer) from public, anon, authenticated, service_role;
