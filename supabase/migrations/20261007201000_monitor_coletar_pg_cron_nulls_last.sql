-- Monitor do banco: execucao SEM horario (falha de "server restarted") nao pode ser a "ultima" (CP7).
--
-- `cron.job_run_details` guarda falhas de inicializacao com `start_time` NULO, e `order by
-- start_time desc` poe NULO PRIMEIRO. Resultado medido em 07/10: o monitor mostrava
-- `reset-sol-stuck-messages` e `sync-financeiro-emusys-fila-worker` como "falhou: server restarted"
-- de forma permanente (runids 647915 e 794502, de semanas atras), enquanto os dois rodavam com
-- sucesso 12 e 60 vezes por hora. A leitura incremental (20261007200000) ja nao alcanca essas linhas
-- velhas, mas uma falha sem horario NOVA repetiria o defeito -- daqui o `nulls last`.

do $migration$
declare
  v_def text;
  a constant text := E'   order by jobid, start_time desc;';
  b constant text := E'   order by jobid, start_time desc nulls last;';
  n int;
begin
  v_def := pg_get_functiondef('monitoramento.coletar_pg_cron()'::regprocedure);
  n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if n <> 1 then
    raise exception 'COLETOR_NULLS: ordenacao encontrada % vezes (esperado 1)', n;
  end if;
  execute replace(v_def, a, b);
end
$migration$;
