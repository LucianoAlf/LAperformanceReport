-- Retencao de `emusys_fatura_source_events` DENTRO da rotina de expurgo que ja existe (CP5).
--
-- MEDIDO (06/10/2026): a tabela tinha 3,7 GB (38% do banco), ~11,4 milhoes de linhas, e crescia
-- 1-2 milhoes por semana desde 10/08 -- uma linha por fatura a cada execucao do sync, gravada por
-- `publish_financeiro_sync_run`. ~94% sao `event_type='confirmed'` ("a fatura continua igual").
-- E a GEMEA de `sync_run_items`: as duas recebiam o mesmo numero de insercoes (1.237.823 desde
-- 28/09), mas a rotina de retencao de 23-25/09 (crons 303 consolidar + 304 expurgar) so cobria
-- `sync_run_items`.
--
-- QUEM LE: ninguem. Conferido de tres formas:
--   * contadores do Postgres desde 28/09 (inclui o fechamento de 01/10): seq_scan = 0 e
--     idx_scan = 0 nos dois indices -- cobre API, edge e conexao direta;
--   * nenhuma view, funcao, edge ou tela le a tabela (so `publish_financeiro_sync_run` ESCREVE);
--   * o Super Folha confirmou pelo proprio codigo (06/10): zero ocorrencias, nao precisa de
--     historico de eventos, e so usa a execucao mais recente de `sync_run_items`.
-- O conteudo do "confirmed" ja esta, compactado, em `sync_run_items_historico` (ilhas de conteudo).
--
-- O QUE FICA (conservador): todo evento que NAO e 'confirmed' (missing_detected / _confirmed /
-- _resolved -- sao as transicoes, o que tem informacao), e todo 'confirmed' de execucao que a
-- rotina AINDA NAO expurgou (inclui as pontas protegidas e as execucoes sem registro de retencao).
-- O QUE SAI: 'confirmed' de execucao ja expurgada de `sync_run_items` (mesmo criterio da rotina).
--
-- PECAS:
--   1) `emusys_fatura_source_events_compactar_v1(p_confirmar)`: limpeza do acumulado, UMA vez.
--      Modo ensaio (padrao) so conta. Modo real: trava a tabela, guarda o que fica, TRUNCATE,
--      reinsere, confere a contagem e cria o indice por `run_id`. TRUNCATE em vez de DELETE:
--      devolve os 3,7 GB ao disco na hora (sem VACUUM FULL) e gera WAL minimo -- DELETE de
--      10 milhoes de linhas geraria GBs de WAL que o Realtime teria de decodificar.
--      A trava append-only (`trg_..._append_only`) e de linha para DELETE/UPDATE; TRUNCATE nao passa
--      por ela. Nenhuma tabela aponta FK para esta.
--   2) `sync_run_items_expurgar_v1` passa a apagar tambem os 'confirmed' de cada execucao que
--      expurga, desligando a trava append-only so dentro da propria transacao (mesmo padrao que ela
--      ja usa em `sync_run_items`). SO LIGA quando o indice por `run_id` existir -- sem ele cada
--      DELETE varreria a tabela inteira.
--   3) Agendamento UNICO 07/10 10:05 UTC (07:05 BRT): o worker financeiro fica parado das 09:00 as
--      10:59 UTC (crons `* 0-8,11-23`), o expurgo diario roda 09:00-09:55 UTC. Nada escreve na tabela
--      nessa janela. O job se desagenda ao terminar.
--
-- Custo/dia: REDUZ. Hoje cada publish mantem 1,4 GB de indice dessa tabela; depois, a tabela fica
-- em ~0,7 mi de linhas e para de crescer.

-- 1) Compactacao do acumulado -------------------------------------------------------------------
create or replace function public.emusys_fatura_source_events_compactar_v1(p_confirmar boolean default false)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
set statement_timeout to '30min'
as $function$
declare
  v_estimado bigint;
  v_manter bigint;
  v_total bigint;
  v_reinseridos bigint;
  v_inicio timestamptz := clock_timestamp();
  v_resultado jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('emusys_fatura_source_events_compactar')) then
    return jsonb_build_object('status', 'outra_compactacao_em_curso');
  end if;

  select c.reltuples::bigint into v_estimado
  from pg_class c where c.oid = 'public.emusys_fatura_source_events'::regclass;
  if coalesce(v_estimado, 0) < 2000000 then
    return jsonb_build_object('status', 'nada_a_fazer', 'linhas_estimadas', v_estimado);
  end if;

  if p_confirmar then
    -- Se algo estiver escrevendo, desiste em vez de enfileirar o sync atras da trava.
    perform set_config('lock_timeout', '30s', true);
    lock table public.emusys_fatura_source_events in access exclusive mode;
  end if;

  drop table if exists _sfe_manter;
  create temporary table _sfe_manter on commit drop as
  select e.*
  from public.emusys_fatura_source_events e
  where e.event_type <> 'confirmed'
     or not exists (
       select 1 from public.sync_run_retencao t
       where t.run_id = e.run_id and t.expurgado_em is not null
     );
  get diagnostics v_manter = row_count;
  select count(*) into v_total from public.emusys_fatura_source_events;

  -- Guarda de proporcao: medido ~0,67 mi a manter de ~11,4 mi. Fora disso, algo mudou -- parar.
  if v_manter <= 0 or v_manter >= v_total or v_manter > 3000000 then
    raise exception 'SFE_COMPACTAR: proporcao inesperada (manter %, total %)', v_manter, v_total;
  end if;

  v_resultado := jsonb_build_object(
    'total', v_total, 'manter', v_manter, 'apagar', v_total - v_manter,
    'segundos', round(extract(epoch from clock_timestamp() - v_inicio)::numeric, 1)
  );

  if not p_confirmar then
    return v_resultado || jsonb_build_object('status', 'ensaio');
  end if;

  truncate table public.emusys_fatura_source_events;
  insert into public.emusys_fatura_source_events select * from _sfe_manter;
  get diagnostics v_reinseridos = row_count;
  if v_reinseridos <> v_manter then
    raise exception 'SFE_COMPACTAR: reinseridas % de %', v_reinseridos, v_manter;
  end if;

  create index if not exists emusys_fatura_source_events_run_idx
    on public.emusys_fatura_source_events (run_id);
  analyze public.emusys_fatura_source_events;

  v_resultado := v_resultado || jsonb_build_object(
    'status', 'compactado',
    'segundos', round(extract(epoch from clock_timestamp() - v_inicio)::numeric, 1)
  );
  insert into public.automacao_log (aluno_nome, evento, acao, status, detalhes)
  values ('(retencao financeira)', 'retencao_financeira', 'compactar_source_events', 'ok', v_resultado);
  return v_resultado;
end;
$function$;

revoke all on function public.emusys_fatura_source_events_compactar_v1(boolean) from public, anon, authenticated;

-- 2) Rotina diaria passa a cobrir a tabela gemea ------------------------------------------------
do $migration$
declare
  v_def text;
  a_decl constant text := E'  v_removidos  integer;\n';
  b_decl constant text := E'  v_removidos  integer;\n  -- 06/10/2026 (CP5): eventos ''confirmed'' da gemea emusys_fatura_source_events. So com o\n  -- indice por run_id (criado pela compactacao); sem ele cada DELETE varreria a tabela inteira.\n  v_eventos    bigint  := 0;\n  v_ev         integer;\n  v_eventos_ok boolean := to_regclass(''public.emusys_fatura_source_events_run_idx'') is not null;\n';
  a_off constant text := E'  execute ''alter table public.sync_run_items disable trigger trg_sync_run_items_append_only'';\n';
  b_off constant text := E'  execute ''alter table public.sync_run_items disable trigger trg_sync_run_items_append_only'';\n  if v_eventos_ok then\n    execute ''alter table public.emusys_fatura_source_events disable trigger trg_emusys_fatura_source_events_append_only'';\n  end if;\n';
  a_del constant text := E'    get diagnostics v_removidos = row_count;\n';
  b_del constant text := E'    get diagnostics v_removidos = row_count;\n\n    if v_eventos_ok then\n      delete from public.emusys_fatura_source_events\n       where run_id = v_run.run_id\n         and event_type = ''confirmed'';\n      get diagnostics v_ev = row_count;\n      v_eventos := v_eventos + v_ev;\n    end if;\n';
  a_on constant text := E'  execute ''alter table public.sync_run_items enable trigger trg_sync_run_items_append_only'';\n';
  b_on constant text := E'  execute ''alter table public.sync_run_items enable trigger trg_sync_run_items_append_only'';\n  if v_eventos_ok then\n    execute ''alter table public.emusys_fatura_source_events enable trigger trg_emusys_fatura_source_events_append_only'';\n  end if;\n';
  a_ret constant text := E'  return jsonb_build_object(''status'', ''ok'', ''runs'', v_runs, ''itens'', v_itens);';
  b_ret constant text := E'  return jsonb_build_object(''status'', ''ok'', ''runs'', v_runs, ''itens'', v_itens, ''eventos'', v_eventos);';
  v_n int;
begin
  v_def := pg_get_functiondef('public.sync_run_items_expurgar_v1(integer,interval)'::regprocedure);
  foreach v_n in array array[
    (length(v_def) - length(replace(v_def, a_decl, ''))) / length(a_decl),
    (length(v_def) - length(replace(v_def, a_off, ''))) / length(a_off),
    (length(v_def) - length(replace(v_def, a_del, ''))) / length(a_del),
    (length(v_def) - length(replace(v_def, a_on, ''))) / length(a_on),
    (length(v_def) - length(replace(v_def, a_ret, ''))) / length(a_ret)
  ] loop
    if v_n <> 1 then
      raise exception 'EXPURGO_EVENTOS: ancora encontrada % vezes (esperado 1)', v_n;
    end if;
  end loop;

  v_def := replace(v_def, a_decl, b_decl);
  v_def := replace(v_def, a_off, b_off);
  v_def := replace(v_def, a_del, b_del);
  v_def := replace(v_def, a_on, b_on);
  v_def := replace(v_def, a_ret, b_ret);
  execute v_def;

  v_def := pg_get_functiondef('public.sync_run_items_expurgar_v1(integer,interval)'::regprocedure);
  if v_def not like '%v_eventos_ok%' or v_def not like '%''eventos'', v_eventos%' then
    raise exception 'EXPURGO_EVENTOS: alteracao nao ficou na funcao';
  end if;
end
$migration$;

-- 3) Agendamento unico da compactacao -----------------------------------------------------------
do $agenda$
begin
  if exists (select 1 from cron.job where jobname = 'compactar-source-events-uma-vez') then
    perform cron.unschedule('compactar-source-events-uma-vez');
  end if;
  perform cron.schedule(
    'compactar-source-events-uma-vez',
    '5 10 7 10 *',
    $cmd$set statement_timeout = 0; select public.emusys_fatura_source_events_compactar_v1(true); select cron.unschedule('compactar-source-events-uma-vez');$cmd$
  );
end
$agenda$;
