-- 24/09/2026 — LAPE-43, etapa que faltava: o expurgo.
-- sync_run_items acumulou 8,5 mi de linhas (~8 GB) de staging: cada run grava um
-- retrato completo das faturas e a leitura viva so usa o ULTIMO run completo por
-- competencia (predicado coberto por sync_runs_ultimo_completo_idx). O historico
-- permanente ja existe em sync_run_items_historico (ilhas imutaveis, conteudo
-- verificavel por sync_run_items_historico_conferir_v1) e sync_run_retencao marca
-- cada run consolidado — mas nada podava os itens crus depois de consolidados.
--
-- Esta migration cria sync_run_items_expurgar_v1 (delecao em lote por run, com
-- tres travas) e dois crons diarios que mantem a esteira viva depois do catch-up
-- one-shot sync-run-items-carga-historico (que se desagenda ao terminar):
--   04:20 UTC consolida os runs do dia (cap 500; steady-state e ~218 runs/dia)
--   06:40 UTC expurga ate 1 mi de itens ja consolidados ha mais de 12h
--
-- Travas do expurgo:
--   1) so run presente em sync_run_retencao (conteudo ja copiado p/ historico);
--   2) consolidado ha mais de p_idade_minima (janela p/ conferir/suspeitar);
--   3) nunca a ponta: exclui o ultimo run live-completo E o ultimo succeeded de
--      cada competencia — get_faturas_alunos_financeiro_* leem itens da ponta e
--      publish_financeiro_sync_run usa a ponta succeeded como baseline do diff.
--
-- O trigger trg_sync_run_items_append_only bloqueia DELETE de proposito (staging
-- imutavel); o expurgo e o unico caminho autorizado e abre excecao desabilitando
-- o trigger dentro da propria transacao (session_replication_role exige
-- superuser, que o postgres do Supabase nao tem). O ALTER pede ACCESS EXCLUSIVE
-- so pelo instante do catalogo, com lock_timeout curto: se a tabela estiver
-- ocupada o lote desiste em vez de enfileirar lock atras de leitor.
-- Nao ha FKs apontando para sync_run_items e nenhuma outra tabela e tocada aqui.

create or replace function public.sync_run_items_expurgar_v1(
  p_max_itens integer default 500000,
  p_idade_minima interval default '12 hours'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_run        record;
  v_runs       integer := 0;
  v_itens      bigint  := 0;
  v_removidos  integer;
begin
  -- Um expurgo por vez: a 2a chamada desiste em vez de correr atras da 1a.
  if not pg_try_advisory_xact_lock(hashtext('sync_run_items_expurgar')) then
    return jsonb_build_object('status', 'outro_expurgo_em_curso', 'runs', 0, 'itens', 0);
  end if;

  -- Bypass unico e controlado do append-only. Vale so nesta transacao; se o
  -- lock nao vier em 10s o lote inteiro desiste (melhor pular a rodada que
  -- segurar fila de lock na tabela mais quente do pipeline).
  perform set_config('lock_timeout', '10s', true);
  execute 'alter table public.sync_run_items disable trigger trg_sync_run_items_append_only';

  for v_run in
    select t.run_id, t.competencia, t.completed_at
    from public.sync_run_retencao t
    join public.sync_runs r on r.id = t.run_id
    where t.expurgado_em is null
      and t.consolidado_em is not null
      and t.consolidado_em < now() - p_idade_minima
      and r.status = 'succeeded'
      -- ponta de leitura das telas financeiras
      and r.id <> all (
        select ponta_leitura.id from (
          select distinct on (sr.competencia) sr.id, sr.competencia
          from public.sync_runs sr
          where sr.run_type = 'live'
            and sr.status = 'succeeded'
            and sr.snapshot_complete is true
            and sr.unidades_concluidas = 3
            and sr.completed_at is not null
          order by sr.competencia, sr.completed_at desc, sr.id desc
        ) ponta_leitura
      )
      -- ponta de baseline do diff de ausentes no publish
      and r.id <> all (
        select ponta_baseline.id from (
          select distinct on (sr.competencia) sr.id, sr.competencia
          from public.sync_runs sr
          where sr.status = 'succeeded'
            and sr.completed_at is not null
          order by sr.competencia, sr.completed_at desc, sr.id desc
        ) ponta_baseline
      )
    order by t.completed_at, t.run_id
  loop
    delete from public.sync_run_items
     where run_id = v_run.run_id;
    get diagnostics v_removidos = row_count;

    update public.sync_run_retencao
       set itens_expurgados = v_removidos,
           expurgado_em = now()
     where run_id = v_run.run_id;

    v_runs  := v_runs + 1;
    v_itens := v_itens + v_removidos;
    exit when v_itens >= greatest(p_max_itens, 1);
  end loop;

  -- Religa antes de devolver: se o chamador estiver numa transacao maior, o
  -- append-only nao pode ficar desligado para os statements seguintes.
  execute 'alter table public.sync_run_items enable trigger trg_sync_run_items_append_only';

  return jsonb_build_object('status', 'ok', 'runs', v_runs, 'itens', v_itens);
end;
$func$;

-- Mesmo perfil das irmas (consolidar/conferir/publish): so postgres e service_role.
revoke all on function public.sync_run_items_expurgar_v1(integer, interval)
  from public, anon, authenticated;
grant execute on function public.sync_run_items_expurgar_v1(integer, interval)
  to service_role;

-- Manutencao diaria. Nomes distintos do one-shot sync-run-items-carga-historico
-- (que se desagenda por nome ao terminar — nome igual aqui morreria junto).
select cron.unschedule(jobid) from cron.job
 where jobname in ('sync-run-items-consolidar-diario', 'sync-run-items-expurgo-diario');

select cron.schedule(
  'sync-run-items-consolidar-diario',
  '20 4 * * *',
  $$set statement_timeout = 0; set client_min_messages = warning;
    select public.sync_run_items_consolidar_historico_v1(500);$$
);

select cron.schedule(
  'sync-run-items-expurgo-diario',
  '40 6 * * *',
  $$set statement_timeout = 0; set client_min_messages = warning;
    select public.sync_run_items_expurgar_v1(1000000, '12 hours');$$
);

do $pos$
declare
  v_falhas text[] := '{}';
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_run_items_expurgar_v1'
      and p.prosecdef
  ) then
    v_falhas := v_falhas || 'funcao sync_run_items_expurgar_v1 ausente ou sem definer';
  end if;
  if (select count(*) from cron.job
      where jobname in ('sync-run-items-consolidar-diario', 'sync-run-items-expurgo-diario')
        and active) <> 2 then
    v_falhas := v_falhas || 'crons diarios de retencao ausentes ou inativos';
  end if;
  if array_length(v_falhas, 1) > 0 then
    raise exception E'POS-CONDICAO expurgo sync_run_items NAO FECHOU:\n  %',
      array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'expurgo sync_run_items ok';
end $pos$;
