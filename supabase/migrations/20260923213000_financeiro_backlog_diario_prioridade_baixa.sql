-- Reprocessamento de meses antigos (backlog) volta a ficar SEMPRE por último, e roda 1x/dia.
--
-- Medido em 23/09/2026:
--   * `financeiro-sync-backlog-2h` (jobid 285) rodava 11x/dia e rebaixava o mês INTEIRO
--     (~1.040 faturas x 3 unidades) de cada competência com fatura aberta, para acompanhar
--     50 faturas abertas de dez/25-jun/26. 725 runs e 735 mil linhas em `sync_run_items`
--     em 7 dias -- a maior fonte do crescimento da tabela (LAPE-43).
--   * O desenho de 20260817082919 dava prioridade 300 ao backlog ("fica sempre por ultimo"),
--     mas a versao viva de `enqueue_financeiro_sync_backlog` passava 100 fixo. Como
--     `claim_financeiro_sync_job` ordena por (priority, competencia), no empate a competencia
--     MAIS ANTIGA vence: marco/2026 falhou 6x seguidas por 57014 e setembro esperou atras.
--
-- Efeito: dívida antiga paga hoje aparece quitada no dia seguinte (antes: ate 2h).
-- Mes atual (15 min) e os dois anteriores (1h) nao mudam. As competencias futuras
-- (+1..+3 meses), que so o backlog enfileira, passam a atualizar 1x/dia.
-- Rollback: cron.alter_job(285, schedule => '11 0,2,4,6,8,12,14,16,18,20,22 * * *') e
-- trocar 300 por 100 na chamada final de enqueue_financeiro_sync_backlog.

do $migra$
declare
  v_def text;
  v_novo text;
  v_ocorrencias int;
  v_jobid bigint;
begin
  v_def := pg_get_functiondef('public.enqueue_financeiro_sync_backlog(text,text)'::regprocedure);

  select count(*) into v_ocorrencias
  from regexp_matches(v_def, 'p_requested_by,\s*100\s*\)', 'g');
  if v_ocorrencias <> 1 then
    raise exception 'BACKLOG_PRIORIDADE_ANCORA: esperava 1 ocorrencia de "p_requested_by, 100)", achou %', v_ocorrencias;
  end if;

  v_novo := regexp_replace(v_def, 'p_requested_by,\s*100\s*\)', E'p_requested_by,\n    300\n  )');
  execute v_novo;

  select jobid into v_jobid from cron.job where jobname = 'financeiro-sync-backlog-2h';
  if v_jobid is null then
    raise exception 'BACKLOG_CRON_AUSENTE: job financeiro-sync-backlog-2h nao encontrado';
  end if;
  -- O nome do job fica "-2h" por legado (renomear exigiria recriar o comando com segredos).
  perform cron.alter_job(v_jobid, schedule => '11 7 * * *');
end;
$migra$;

do $verify$
declare
  v_def text := pg_get_functiondef('public.enqueue_financeiro_sync_backlog(text,text)'::regprocedure);
begin
  if v_def !~ 'p_requested_by,\s*300\s*\)' then
    raise exception 'BACKLOG_VERIFY: prioridade 300 nao aplicada';
  end if;
  if (select schedule from cron.job where jobname = 'financeiro-sync-backlog-2h') <> '11 7 * * *' then
    raise exception 'BACKLOG_VERIFY: agenda nao alterada';
  end if;
  if has_function_privilege('anon', 'public.enqueue_financeiro_sync_backlog(text,text)', 'execute') then
    raise exception 'BACKLOG_VERIFY: anon com EXECUTE';
  end if;
end;
$verify$;
