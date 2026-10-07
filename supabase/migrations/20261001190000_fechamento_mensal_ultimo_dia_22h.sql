-- supabase/migrations/20261001190000_fechamento_mensal_ultimo_dia_22h.sql
--
-- Fechamento mensal automatico (cron 189) volta para as 22h BRT do ULTIMO dia do mes
-- (decisao do Hugo, 01/10/2026, depois do pedido do Arthur/Barra): no dia 1o entram no
-- sistema matriculas e mudancas de status que a equipe le como "do mes passado" (ex.: 2
-- matriculas da Barra lancadas no Emusys em 01/10 12h27), e o relatorio do mes precisa
-- estar pronto antes disso. Era 04:20 BRT do dia 1o desde 20261001170000.
--
-- pg_cron nao tem "ultimo dia do mes"; 01:00 UTC do dia 1o = 22:00 BRT do ultimo dia.
--
-- As duas funcoes calculavam a competencia como "mes anterior a hoje BRT" e
-- fechar_competencia_mensal_automatico recusava fora do dia 1o. Agora:
--   hoje BRT e o ultimo dia do mes -> competencia = mes corrente (caminho do cron)
--   hoje BRT e dia 1o              -> competencia = mes anterior (rerun manual de resgate)
--   qualquer outro dia             -> ignorado (inalterado)
-- No ultimo dia o mes ainda e o corrente: a canonica le 'vivo' com corte = hoje, como o
-- cron antigo 83 fazia. A flag app.fechamento_competencia_viva continua sendo setada (inocua).

do $$
declare
  d text;
  n int;
  v_ancora text;
  v_novo text;
begin
  -- (1) fechar_competencia_mensal_automatico
  d := pg_get_functiondef('public.fechar_competencia_mensal_automatico()'::regprocedure);

  v_ancora := '  if extract(day from v_hoje_brt)::integer <> 1 then' || chr(10)
    || '    return jsonb_build_object(' || chr(10)
    || '      ''ok'', true, ''ignorado'', true,' || chr(10)
    || '      ''motivo'', ''execucao permitida apenas no dia 1o do mes (BRT)'',' || chr(10)
    || '      ''hoje_brt'', v_hoje_brt' || chr(10)
    || '    );' || chr(10)
    || '  end if;' || chr(10)
    || chr(10)
    || '  v_competencia := (date_trunc(''month'', v_hoje_brt) - interval ''1 month'')::date;';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'automatico: ancora da guarda esperava 1 ocorrencia, achou %', n; end if;
  v_novo := '  if extract(day from v_hoje_brt + 1)::integer = 1 then' || chr(10)
    || '    v_competencia := date_trunc(''month'', v_hoje_brt)::date;' || chr(10)
    || '  elsif extract(day from v_hoje_brt)::integer = 1 then' || chr(10)
    || '    v_competencia := (date_trunc(''month'', v_hoje_brt) - interval ''1 month'')::date;' || chr(10)
    || '  else' || chr(10)
    || '    return jsonb_build_object(' || chr(10)
    || '      ''ok'', true, ''ignorado'', true,' || chr(10)
    || '      ''motivo'', ''execucao permitida apenas no ultimo dia do mes ou no dia 1o (BRT)'',' || chr(10)
    || '      ''hoje_brt'', v_hoje_brt' || chr(10)
    || '    );' || chr(10)
    || '  end if;';
  d := replace(d, v_ancora, v_novo);

  v_ancora := 'cron dia 1o 09h BRT';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'automatico: ancora do motivo esperava 1 ocorrencia, achou %', n; end if;
  d := replace(d, v_ancora, 'cron ultimo dia 22h BRT');
  execute d;

  -- (2) fechar_competencia_mensal_dia1_v1
  d := pg_get_functiondef('public.fechar_competencia_mensal_dia1_v1()'::regprocedure);

  v_ancora := '  v_competencia := (date_trunc(''month'', v_hoje_brt) - interval ''1 month'')::date;';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'dia1_v1: ancora da competencia esperava 1 ocorrencia, achou %', n; end if;
  d := replace(d, v_ancora,
       '  -- ultimo dia do mes (cron 22h BRT) fecha o mes corrente; dia 1o (rerun manual) fecha o anterior' || chr(10)
    || '  v_competencia := case' || chr(10)
    || '    when extract(day from v_hoje_brt + 1)::integer = 1 then date_trunc(''month'', v_hoje_brt)::date' || chr(10)
    || '    else (date_trunc(''month'', v_hoje_brt) - interval ''1 month'')::date' || chr(10)
    || '  end;');

  v_ancora := 'cron dia 1o 09h BRT';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'dia1_v1: ancora do motivo esperava 1 ocorrencia, achou %', n; end if;
  d := replace(d, v_ancora, 'cron ultimo dia 22h BRT');
  execute d;
end $$;

-- (3) cron 189: 01:00 UTC do dia 1o = 22:00 BRT do ultimo dia
do $$
declare
  v_nome text;
begin
  select jobname into v_nome from cron.job where jobid = 189;
  if v_nome is distinct from 'fechamento-mensal-dia1' then
    raise exception 'jobid 189 nao e fechamento-mensal-dia1 (achei %)', v_nome;
  end if;
  perform cron.alter_job(189, schedule => '0 1 1 * *');
end $$;
