-- =====================================================================
-- Migration: Monitor de desempenho do banco (LA-OS) — LAPE-46
-- Projeto Supabase: LA Performance Report (ouqwbbermlzqqvtqwlul)
-- Data: 2026-09-25
-- Autor: hugo + claude
--
-- RESUMO
-- O banco caiu em 25/09 (17h10–17h27 BRT) depois de 3 dias com Disk IO em 100%
-- e ninguem viu antes: a unica visao era o grafico do painel do Supabase.
-- Aqui ficam as series para o LA-OS desenhar e o historico do que gastou:
--
--   banco_metricas       1 linha/min (CPU, iowait, RAM, swap, IO, conexoes, disco)
--                        gravada pelo coletor da la-hq (check-banco-desempenho.py),
--                        que le o endpoint Prometheus do Supabase -- FORA do banco.
--   banco_consumo        a cada 5 min: top consultas (delta de pg_stat_statements)
--                        e duracao dos crons (cron.job_run_details, incremental).
--   banco_eventos        alertas (entrou/saiu de nivel) e reinicios detectados.
--   banco_metricas_hora  resumo por hora, guardado 400 dias.
--
-- CUSTO (regra rules/desempenho_banco.md):
--   registrar_banco        1 insert/min                              ~ms
--   coletar_consumo        a cada 5 min: le pg_stat_statements (memoria, 614
--                          linhas), cron por faixa de runid (indice), grava ~30
--                          linhas; estado anterior em tabela UNLOGGED (sem WAL).
--                          Texto de consulta so e' lido para queryid NOVO.
--   banco_reter            1x/dia, rollup + delete por indice de tempo.
--   Estimativa total: < 15 s de banco por dia.
--   O coletor PULA coletar_consumo quando o banco esta no vermelho.
--
-- ORDEM DE EXECUCAO
-- 1. Tabelas + indices
-- 2. Escrita (monitor_coletor): registrar_banco, coletar_consumo
-- 3. Leitura (la_os_leitor): banco_atual, banco_serie, banco_pico,
--    banco_consumidores, banco_eventos
-- 4. Retencao + cron diario
-- 5. Grants
--
-- DEPENDE DE
-- schema monitoramento, roles monitor_coletor e la_os_leitor (fiscal mila 002/009)
-- extensoes pg_stat_statements e pg_cron
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------
create table if not exists monitoramento.banco_metricas (
  coletado_em      timestamptz primary key,
  intervalo_s      numeric,
  cpu_pct          numeric,
  iowait_pct       numeric,
  ram_pct          numeric,
  swap_pct         numeric,
  io_util_pct      numeric,     -- % do tempo com o disco ocupado (io_time)
  iops_leitura     numeric,
  iops_escrita     numeric,
  mb_leitura_s     numeric,
  mb_escrita_s     numeric,
  iops_pct_base    numeric,     -- IOPS / baseline do plano (>100 = gastando cota)
  mbs_pct_base     numeric,     -- MB/s / baseline do plano
  disco_dados_pct  numeric,
  disco_raiz_pct   numeric,
  conexoes         integer,
  conexoes_max     integer,
  load1            numeric,
  boot_em          timestamptz,
  nivel            text not null default 'ok',   -- ok | observar | critico
  motivo           text
);
alter table monitoramento.banco_metricas enable row level security;
comment on table monitoramento.banco_metricas is
  'LAPE-46. 1 linha/min do coletor check-banco-desempenho.py (la-hq), a partir do endpoint Prometheus do Supabase. Retencao 30 dias (resumo em banco_metricas_hora).';

create table if not exists monitoramento.banco_metricas_hora (
  hora             timestamptz primary key,
  amostras         integer,
  cpu_pct          numeric, cpu_max numeric,
  iowait_pct       numeric,
  ram_pct          numeric, swap_pct numeric,
  io_util_pct      numeric, io_util_max numeric,
  iops             numeric, iops_max numeric,
  mb_s             numeric,
  conexoes         numeric, conexoes_max integer,
  disco_dados_pct  numeric
);
alter table monitoramento.banco_metricas_hora enable row level security;

create table if not exists monitoramento.banco_consumo (
  id               bigint generated always as identity primary key,
  coletado_em      timestamptz not null,
  janela_s         numeric not null,
  tipo             text not null check (tipo in ('query','cron','total')),
  chave            text not null,      -- queryid | jobname | 'total'
  chamadas         bigint,
  tempo_ms         numeric,
  max_ms           numeric,
  leitura_blocos   bigint,             -- shared_blks_read: blocos vindos do disco
  temp_blocos      bigint,             -- temp_blks_written: spill de work_mem
  linhas           bigint,
  falhas           integer
);
create index if not exists banco_consumo_em on monitoramento.banco_consumo (coletado_em);
alter table monitoramento.banco_consumo enable row level security;

create table if not exists monitoramento.banco_query_texto (
  queryid          bigint primary key,
  texto            text,
  visto_em         timestamptz not null default now()
);
alter table monitoramento.banco_query_texto enable row level security;

create table if not exists monitoramento.banco_eventos (
  id               bigint generated always as identity primary key,
  em               timestamptz not null default now(),
  tipo             text not null,      -- alerta | recuperou | reinicio | coletor
  metrica          text,
  nivel            text,
  valor            numeric,
  mensagem         text
);
create index if not exists banco_eventos_em on monitoramento.banco_eventos (em);
alter table monitoramento.banco_eventos enable row level security;

-- Estado do delta: UNLOGGED de proposito (sem WAL). Perder no crash so faz a
-- proxima rodada virar baseline.
create unlogged table if not exists monitoramento.banco_pgss_anterior (
  queryid          bigint not null,
  userid           oid not null,
  dbid             oid not null,
  calls            bigint,
  total_ms         double precision,
  blks_read        bigint,
  temp_written     bigint,
  linhas           bigint,
  primary key (queryid, userid, dbid)
);
alter table monitoramento.banco_pgss_anterior enable row level security;

create table if not exists monitoramento.banco_consumo_cursor (
  id               integer primary key default 1 check (id = 1),
  cron_runid_baixo bigint,           -- menor runid que ainda pode terminar
  cron_ate         timestamptz,      -- ultimo end_time contado
  pgss_reset       timestamptz,
  anterior_em      timestamptz
);
alter table monitoramento.banco_consumo_cursor enable row level security;
insert into monitoramento.banco_consumo_cursor (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Escrita
-- ---------------------------------------------------------------------
create or replace function monitoramento.registrar_banco(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = monitoramento, pg_catalog
set statement_timeout = '10s'
as $$
declare
  v_em timestamptz := (p->>'coletado_em')::timestamptz;
  v_inseriu integer;
  v_eventos integer := 0;
begin
  if v_em is null then
    raise exception 'registrar_banco: coletado_em ausente';
  end if;

  insert into monitoramento.banco_metricas (
    coletado_em, intervalo_s, cpu_pct, iowait_pct, ram_pct, swap_pct, io_util_pct,
    iops_leitura, iops_escrita, mb_leitura_s, mb_escrita_s, iops_pct_base, mbs_pct_base,
    disco_dados_pct, disco_raiz_pct, conexoes, conexoes_max, load1, boot_em, nivel, motivo)
  values (
    v_em, (p->>'intervalo_s')::numeric, (p->>'cpu_pct')::numeric, (p->>'iowait_pct')::numeric,
    (p->>'ram_pct')::numeric, (p->>'swap_pct')::numeric, (p->>'io_util_pct')::numeric,
    (p->>'iops_leitura')::numeric, (p->>'iops_escrita')::numeric,
    (p->>'mb_leitura_s')::numeric, (p->>'mb_escrita_s')::numeric,
    (p->>'iops_pct_base')::numeric, (p->>'mbs_pct_base')::numeric,
    (p->>'disco_dados_pct')::numeric, (p->>'disco_raiz_pct')::numeric,
    (p->>'conexoes')::integer, (p->>'conexoes_max')::integer, (p->>'load1')::numeric,
    (p->>'boot_em')::timestamptz, coalesce(p->>'nivel', 'ok'), p->>'motivo')
  on conflict (coletado_em) do nothing;   -- buffer reenviado nao duplica
  get diagnostics v_inseriu = row_count;

  if jsonb_typeof(p->'eventos') = 'array' then
    insert into monitoramento.banco_eventos (em, tipo, metrica, nivel, valor, mensagem)
    select coalesce((e->>'em')::timestamptz, v_em), e->>'tipo', e->>'metrica', e->>'nivel',
           (e->>'valor')::numeric, e->>'mensagem'
    from jsonb_array_elements(p->'eventos') e
    where v_inseriu = 1;                  -- eventos so na primeira entrega da linha
    get diagnostics v_eventos = row_count;
  end if;

  return jsonb_build_object('ok', true, 'inseriu', v_inseriu, 'eventos', v_eventos);
end $$;

create or replace function monitoramento.coletar_consumo(p_top integer default 15)
returns jsonb
language plpgsql security definer
set search_path = monitoramento, public, extensions, pg_catalog
set statement_timeout = '20s'
as $$
declare
  v_agora   timestamptz := clock_timestamp();
  v_cur     monitoramento.banco_consumo_cursor%rowtype;
  v_reset   timestamptz;
  v_janela  numeric;
  v_queries integer := 0;
  v_crons   integer := 0;
  v_textos  integer := 0;
  v_baixo   bigint;
  v_baseline boolean := false;
begin
  if not pg_try_advisory_xact_lock(hashtext('monitoramento.coletar_consumo')) then
    return jsonb_build_object('status', 'outra_coleta_em_curso');
  end if;

  select * into v_cur from monitoramento.banco_consumo_cursor where id = 1 for update;
  select stats_reset into v_reset from pg_stat_statements_info;
  v_janela := extract(epoch from v_agora - v_cur.anterior_em);

  create temporary table _pgss on commit drop as
  select s.queryid, s.userid, s.dbid, s.calls, s.total_exec_time as total_ms,
         s.shared_blks_read as blks_read, s.temp_blks_written as temp_written, s.rows as linhas
  from pg_stat_statements(false) s
  where s.queryid is not null;

  -- Reinicio do banco ou reset das estatisticas: esta rodada so vira baseline.
  if v_cur.anterior_em is null or v_cur.pgss_reset is distinct from v_reset
     or v_janela is null or v_janela <= 0 then
    v_baseline := true;
  else
    with d as (
      select c.queryid,
             sum(c.calls - coalesce(a.calls, 0))               as chamadas,
             sum(c.total_ms - coalesce(a.total_ms, 0))         as tempo_ms,
             sum(c.blks_read - coalesce(a.blks_read, 0))       as leitura,
             sum(c.temp_written - coalesce(a.temp_written, 0)) as temp,
             sum(c.linhas - coalesce(a.linhas, 0))             as linhas
      from _pgss c
      left join monitoramento.banco_pgss_anterior a using (queryid, userid, dbid)
      group by c.queryid
    ),
    validos as (   -- entrada expulsa e readmitida pode dar delta negativo: descarta
      select * from d where chamadas > 0 and tempo_ms >= 0 and leitura >= 0 and temp >= 0
    ),
    escolhidos as (
      select * from (select *, row_number() over (order by tempo_ms desc) rt,
                               row_number() over (order by leitura desc)  rl from validos) x
      where rt <= p_top or rl <= p_top
    ),
    ins as (
      insert into monitoramento.banco_consumo
        (coletado_em, janela_s, tipo, chave, chamadas, tempo_ms, leitura_blocos, temp_blocos, linhas)
      select v_agora, v_janela, 'query', queryid::text, chamadas, round(tempo_ms::numeric, 1),
             leitura, temp, linhas
      from escolhidos
      union all
      select v_agora, v_janela, 'total', 'total', sum(chamadas), round(sum(tempo_ms)::numeric, 1),
             sum(leitura), sum(temp), sum(linhas)
      from validos
      having count(*) > 0
      returning chave
    )
    select count(*) filter (where chave <> 'total') into v_queries from ins;

    -- Texto so para consulta nunca vista (pg_stat_statements(true) le o arquivo).
    if exists (select 1 from monitoramento.banco_consumo b
               where b.coletado_em = v_agora and b.tipo = 'query'
                 and not exists (select 1 from monitoramento.banco_query_texto t
                                 where t.queryid = b.chave::bigint)) then
      insert into monitoramento.banco_query_texto (queryid, texto)
      select distinct on (s.queryid) s.queryid, left(regexp_replace(s.query, '\s+', ' ', 'g'), 2000)
      from pg_stat_statements(true) s
      where s.queryid in (select b.chave::bigint from monitoramento.banco_consumo b
                          where b.coletado_em = v_agora and b.tipo = 'query')
      on conflict (queryid) do nothing;
      get diagnostics v_textos = row_count;
    end if;
  end if;

  truncate monitoramento.banco_pgss_anterior;
  insert into monitoramento.banco_pgss_anterior
  select queryid, userid, dbid, calls, total_ms, blks_read, temp_written, linhas from _pgss;

  -- Crons: faixa de runid (indice da PK), nunca varredura da tabela inteira.
  if v_cur.cron_runid_baixo is null then
    select max(runid) into v_baixo from cron.job_run_details;
  else
    with runs as (
      select d.runid, d.jobid, d.status, d.start_time, d.end_time
      from cron.job_run_details d
      where d.runid >= v_cur.cron_runid_baixo
    ),
    terminados as (
      select * from runs
      where end_time is not null and end_time > coalesce(v_cur.cron_ate, '-infinity') and end_time <= v_agora
    ),
    ins as (
      insert into monitoramento.banco_consumo
        (coletado_em, janela_s, tipo, chave, chamadas, tempo_ms, max_ms, falhas)
      select v_agora, coalesce(v_janela, 0), 'cron', coalesce(j.jobname, 'job ' || t.jobid),
             count(*), round(sum(extract(epoch from t.end_time - t.start_time)) * 1000),
             round(max(extract(epoch from t.end_time - t.start_time)) * 1000),
             count(*) filter (where t.status <> 'succeeded')
      from terminados t left join cron.job j on j.jobid = t.jobid
      group by 3, 4, t.jobid, j.jobname
      returning 1
    )
    select count(*) into v_crons from ins;

    select coalesce(min(d.runid) filter (where d.end_time is null), max(d.runid), v_cur.cron_runid_baixo)
      into v_baixo from cron.job_run_details d where d.runid >= v_cur.cron_runid_baixo;
  end if;

  update monitoramento.banco_consumo_cursor
     set cron_runid_baixo = v_baixo,
         cron_ate = v_agora,
         pgss_reset = v_reset,
         anterior_em = v_agora
   where id = 1;

  return jsonb_build_object('status', case when v_baseline then 'baseline' else 'ok' end,
                            'janela_s', round(coalesce(v_janela, 0)), 'queries', v_queries,
                            'crons', v_crons, 'textos_novos', v_textos);
end $$;

-- ---------------------------------------------------------------------
-- 3. Leitura
-- ---------------------------------------------------------------------
create or replace function monitoramento.banco_atual()
returns table (coletado_em timestamptz, ha_segundos integer, cpu_pct numeric, iowait_pct numeric,
               ram_pct numeric, swap_pct numeric, io_util_pct numeric, iops numeric, mb_s numeric,
               iops_pct_base numeric, mbs_pct_base numeric, disco_dados_pct numeric,
               disco_raiz_pct numeric, conexoes integer, conexoes_max integer, boot_em timestamptz,
               nivel text, motivo text)
language sql stable security definer
set search_path = monitoramento, pg_catalog
as $$
  select m.coletado_em, extract(epoch from now() - m.coletado_em)::integer,
         m.cpu_pct, m.iowait_pct, m.ram_pct, m.swap_pct, m.io_util_pct,
         m.iops_leitura + m.iops_escrita, m.mb_leitura_s + m.mb_escrita_s,
         m.iops_pct_base, m.mbs_pct_base, m.disco_dados_pct, m.disco_raiz_pct,
         m.conexoes, m.conexoes_max, m.boot_em, m.nivel, m.motivo
  from monitoramento.banco_metricas m
  order by m.coletado_em desc
  limit 1;
$$;

-- <= 48h: pontos de 1 min. Acima: media/maximo por hora (30 dias do bruto;
-- alem disso, do resumo).
create or replace function monitoramento.banco_serie(p_horas integer)
returns table (t timestamptz, cpu_pct numeric, cpu_max numeric, iowait_pct numeric, ram_pct numeric,
               swap_pct numeric, io_util_pct numeric, io_util_max numeric, iops numeric,
               iops_max numeric, mb_s numeric, conexoes numeric, conexoes_max integer,
               disco_dados_pct numeric)
language sql stable security definer
set search_path = monitoramento, pg_catalog
as $$
  with lim as (select least(greatest(coalesce(p_horas, 24), 1), 24 * 400) h)
  select m.coletado_em, m.cpu_pct, m.cpu_pct, m.iowait_pct, m.ram_pct, m.swap_pct,
         m.io_util_pct, m.io_util_pct, m.iops_leitura + m.iops_escrita,
         m.iops_leitura + m.iops_escrita, m.mb_leitura_s + m.mb_escrita_s,
         m.conexoes::numeric, m.conexoes, m.disco_dados_pct
  from monitoramento.banco_metricas m, lim
  where lim.h <= 48 and m.coletado_em >= now() - make_interval(hours => lim.h)
  union all
  select date_trunc('hour', m.coletado_em), round(avg(m.cpu_pct), 1), max(m.cpu_pct),
         round(avg(m.iowait_pct), 1), round(avg(m.ram_pct), 1), round(avg(m.swap_pct), 1),
         round(avg(m.io_util_pct), 1), max(m.io_util_pct),
         round(avg(m.iops_leitura + m.iops_escrita), 1), max(m.iops_leitura + m.iops_escrita),
         round(avg(m.mb_leitura_s + m.mb_escrita_s), 2), round(avg(m.conexoes), 1), max(m.conexoes),
         round(avg(m.disco_dados_pct), 1)
  from monitoramento.banco_metricas m, lim
  where lim.h > 48 and m.coletado_em >= now() - make_interval(hours => lim.h)
  group by 1
  union all
  select r.hora, r.cpu_pct, r.cpu_max, r.iowait_pct, r.ram_pct, r.swap_pct, r.io_util_pct,
         r.io_util_max, r.iops, r.iops_max, r.mb_s, r.conexoes, r.conexoes_max, r.disco_dados_pct
  from monitoramento.banco_metricas_hora r, lim
  where lim.h > 48 and r.hora >= now() - make_interval(hours => lim.h)
    and r.hora < (select coalesce(min(coletado_em), now()) from monitoramento.banco_metricas)
  order by 1;
$$;

-- Mapa de calor: dia da semana x hora, em BRT.
create or replace function monitoramento.banco_pico(p_dias integer)
returns table (dia_semana integer, hora integer, amostras bigint, cpu_pct numeric,
               io_util_pct numeric, iops numeric, conexoes_max integer)
language sql stable security definer
set search_path = monitoramento, pg_catalog
as $$
  select extract(isodow from m.coletado_em at time zone 'America/Sao_Paulo')::integer,
         extract(hour  from m.coletado_em at time zone 'America/Sao_Paulo')::integer,
         count(*), round(avg(m.cpu_pct), 1), round(avg(m.io_util_pct), 1),
         round(avg(m.iops_leitura + m.iops_escrita), 1), max(m.conexoes)
  from monitoramento.banco_metricas m
  where m.coletado_em >= now() - make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 30))
  group by 1, 2
  order by 1, 2;
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
         case when a.tipo = 'query' then left(coalesce(q.texto, 'queryid ' || a.chave), 300) else a.chave end,
         a.chamadas, round(a.tempo_ms), round(a.max_ms), a.leitura_blocos, a.temp_blocos, a.falhas,
         case when a.tipo = 'query' then round(100 * a.tempo_ms / (select tot from total), 1) end
  from agg a
  left join monitoramento.banco_query_texto q on a.tipo = 'query' and q.queryid = a.chave::bigint
  order by a.tempo_ms desc nulls last
  limit 60;
$$;

create or replace function monitoramento.banco_eventos_lista(p_horas integer)
returns table (em timestamptz, tipo text, metrica text, nivel text, valor numeric, mensagem text)
language sql stable security definer
set search_path = monitoramento, pg_catalog
as $$
  select e.em, e.tipo, e.metrica, e.nivel, e.valor, e.mensagem
  from monitoramento.banco_eventos e
  where e.em >= now() - make_interval(hours => least(greatest(coalesce(p_horas, 168), 1), 24 * 365))
  order by e.em desc
  limit 200;
$$;

-- Involucros publicos (padrao la_os_*)
create or replace function public.la_os_registrar_banco(p jsonb) returns jsonb
language sql security definer set search_path = public, pg_catalog
as $$ select monitoramento.registrar_banco(p); $$;

create or replace function public.la_os_banco_coletar_consumo() returns jsonb
language sql security definer set search_path = public, pg_catalog
as $$ select monitoramento.coletar_consumo(15); $$;

create or replace function public.la_os_banco_atual()
returns table (coletado_em timestamptz, ha_segundos integer, cpu_pct numeric, iowait_pct numeric,
               ram_pct numeric, swap_pct numeric, io_util_pct numeric, iops numeric, mb_s numeric,
               iops_pct_base numeric, mbs_pct_base numeric, disco_dados_pct numeric,
               disco_raiz_pct numeric, conexoes integer, conexoes_max integer, boot_em timestamptz,
               nivel text, motivo text)
language sql stable security definer set search_path = public, pg_catalog
as $$ select * from monitoramento.banco_atual(); $$;

create or replace function public.la_os_banco_serie(p_horas integer)
returns table (t timestamptz, cpu_pct numeric, cpu_max numeric, iowait_pct numeric, ram_pct numeric,
               swap_pct numeric, io_util_pct numeric, io_util_max numeric, iops numeric,
               iops_max numeric, mb_s numeric, conexoes numeric, conexoes_max integer,
               disco_dados_pct numeric)
language sql stable security definer set search_path = public, pg_catalog
as $$ select * from monitoramento.banco_serie(p_horas); $$;

create or replace function public.la_os_banco_pico(p_dias integer)
returns table (dia_semana integer, hora integer, amostras bigint, cpu_pct numeric,
               io_util_pct numeric, iops numeric, conexoes_max integer)
language sql stable security definer set search_path = public, pg_catalog
as $$ select * from monitoramento.banco_pico(p_dias); $$;

create or replace function public.la_os_banco_consumidores(p_horas integer)
returns table (tipo text, chave text, rotulo text, chamadas bigint, tempo_ms numeric, max_ms numeric,
               leitura_blocos bigint, temp_blocos bigint, falhas bigint, pct_tempo numeric)
language sql stable security definer set search_path = public, pg_catalog
as $$ select * from monitoramento.banco_consumidores(p_horas); $$;

create or replace function public.la_os_banco_eventos(p_horas integer)
returns table (em timestamptz, tipo text, metrica text, nivel text, valor numeric, mensagem text)
language sql stable security definer set search_path = public, pg_catalog
as $$ select * from monitoramento.banco_eventos_lista(p_horas); $$;

-- ---------------------------------------------------------------------
-- 4. Retencao: bruto 30 dias, resumo por hora 400 dias, eventos 1 ano.
-- ---------------------------------------------------------------------
create or replace function monitoramento.banco_reter()
returns jsonb
language plpgsql security definer
set search_path = monitoramento, pg_catalog
set statement_timeout = '60s'
as $$
declare v_hora integer; v_met integer; v_cons integer; v_ev integer; v_res integer;
begin
  insert into monitoramento.banco_metricas_hora
  select date_trunc('hour', coletado_em), count(*),
         round(avg(cpu_pct), 1), max(cpu_pct), round(avg(iowait_pct), 1),
         round(avg(ram_pct), 1), round(avg(swap_pct), 1),
         round(avg(io_util_pct), 1), max(io_util_pct),
         round(avg(iops_leitura + iops_escrita), 1), max(iops_leitura + iops_escrita),
         round(avg(mb_leitura_s + mb_escrita_s), 2), round(avg(conexoes), 1), max(conexoes),
         round(avg(disco_dados_pct), 1)
  from monitoramento.banco_metricas
  where coletado_em < date_trunc('hour', now())
  group by 1
  on conflict (hora) do update set
    amostras = excluded.amostras, cpu_pct = excluded.cpu_pct, cpu_max = excluded.cpu_max,
    iowait_pct = excluded.iowait_pct, ram_pct = excluded.ram_pct, swap_pct = excluded.swap_pct,
    io_util_pct = excluded.io_util_pct, io_util_max = excluded.io_util_max, iops = excluded.iops,
    iops_max = excluded.iops_max, mb_s = excluded.mb_s, conexoes = excluded.conexoes,
    conexoes_max = excluded.conexoes_max, disco_dados_pct = excluded.disco_dados_pct
  where monitoramento.banco_metricas_hora.hora >= now() - interval '2 days';
  get diagnostics v_hora = row_count;

  delete from monitoramento.banco_metricas where coletado_em < now() - interval '30 days';
  get diagnostics v_met = row_count;
  delete from monitoramento.banco_consumo where coletado_em < now() - interval '30 days';
  get diagnostics v_cons = row_count;
  delete from monitoramento.banco_eventos where em < now() - interval '365 days';
  get diagnostics v_ev = row_count;
  delete from monitoramento.banco_metricas_hora where hora < now() - interval '400 days';
  get diagnostics v_res = row_count;

  return jsonb_build_object('horas', v_hora, 'metricas_apagadas', v_met, 'consumo_apagado', v_cons,
                            'eventos_apagados', v_ev, 'resumo_apagado', v_res);
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'la-os-banco-reter') then
    perform cron.unschedule('la-os-banco-reter');
  end if;
  -- 05h35 UTC = 02h35 BRT: fora do pico e longe do expurgo (09h UTC).
  perform cron.schedule('la-os-banco-reter', '35 5 * * *', 'select monitoramento.banco_reter()');
end $$;

insert into monitoramento.cron_catalogo (host, fonte, identificador, dono, nome, descricao)
select 'supabase-lareport', 'pg_cron', 'la-os-banco-reter', 'la-os', 'Retencao do monitor do banco',
       'Rollup por hora + apaga bruto >30d, consumo >30d, eventos >365d, resumo >400d (LAPE-46).'
where not exists (select 1 from monitoramento.cron_catalogo where identificador = 'la-os-banco-reter');

-- ---------------------------------------------------------------------
-- 5. Grants. ALTER DEFAULT PRIVILEGES de public concede EXECUTE a anon,
--    authenticated e service_role: revoke explicito dos tres.
-- ---------------------------------------------------------------------
revoke all on monitoramento.banco_metricas, monitoramento.banco_metricas_hora,
  monitoramento.banco_consumo, monitoramento.banco_query_texto, monitoramento.banco_eventos,
  monitoramento.banco_pgss_anterior, monitoramento.banco_consumo_cursor
  from public, anon, authenticated;

revoke execute on function monitoramento.registrar_banco(jsonb)        from public, anon, authenticated, service_role;
revoke execute on function monitoramento.coletar_consumo(integer)      from public, anon, authenticated, service_role;
revoke execute on function monitoramento.banco_atual()                 from public, anon, authenticated, service_role;
revoke execute on function monitoramento.banco_serie(integer)          from public, anon, authenticated, service_role;
revoke execute on function monitoramento.banco_pico(integer)           from public, anon, authenticated, service_role;
revoke execute on function monitoramento.banco_consumidores(integer)   from public, anon, authenticated, service_role;
revoke execute on function monitoramento.banco_eventos_lista(integer)  from public, anon, authenticated, service_role;
revoke execute on function monitoramento.banco_reter()                 from public, anon, authenticated, service_role;

revoke all on function public.la_os_registrar_banco(jsonb)         from public, anon, authenticated, service_role;
revoke all on function public.la_os_banco_coletar_consumo()        from public, anon, authenticated, service_role;
revoke all on function public.la_os_banco_atual()                  from public, anon, authenticated, service_role;
revoke all on function public.la_os_banco_serie(integer)           from public, anon, authenticated, service_role;
revoke all on function public.la_os_banco_pico(integer)            from public, anon, authenticated, service_role;
revoke all on function public.la_os_banco_consumidores(integer)    from public, anon, authenticated, service_role;
revoke all on function public.la_os_banco_eventos(integer)         from public, anon, authenticated, service_role;

grant execute on function public.la_os_registrar_banco(jsonb)      to monitor_coletor;
grant execute on function public.la_os_banco_coletar_consumo()     to monitor_coletor;
grant execute on function public.la_os_banco_atual()               to la_os_leitor;
grant execute on function public.la_os_banco_serie(integer)        to la_os_leitor;
grant execute on function public.la_os_banco_pico(integer)         to la_os_leitor;
grant execute on function public.la_os_banco_consumidores(integer) to la_os_leitor;
grant execute on function public.la_os_banco_eventos(integer)      to la_os_leitor;

-- ---------------------------------------------------------------------
-- REVERTER
-- select cron.unschedule('la-os-banco-reter');
-- drop function public.la_os_registrar_banco(jsonb), public.la_os_banco_coletar_consumo(),
--   public.la_os_banco_atual(), public.la_os_banco_serie(integer), public.la_os_banco_pico(integer),
--   public.la_os_banco_consumidores(integer), public.la_os_banco_eventos(integer);
-- drop function monitoramento.registrar_banco(jsonb), monitoramento.coletar_consumo(integer),
--   monitoramento.banco_atual(), monitoramento.banco_serie(integer), monitoramento.banco_pico(integer),
--   monitoramento.banco_consumidores(integer), monitoramento.banco_eventos_lista(integer),
--   monitoramento.banco_reter();
-- drop table monitoramento.banco_metricas, monitoramento.banco_metricas_hora,
--   monitoramento.banco_consumo, monitoramento.banco_query_texto, monitoramento.banco_eventos,
--   monitoramento.banco_pgss_anterior, monitoramento.banco_consumo_cursor;
-- =====================================================================
