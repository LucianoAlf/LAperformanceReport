-- Reconciliador de alertas do Health Score: sai cedo quando nao ha alerta pendente (CP7).
--
-- MEDIDO (07/10/2026): `reconciliar_health_score_professor_v3_alertas` roda a cada 5 min (cron
-- 146) e, com ZERO alertas `enfileirado`, tocava 12.937 blocos (~100 MB) por rodada -- o UPDATE
-- junta com `net._http_response`, tabela interna do pg_net com 3.125 linhas mas 129 MB inchados.
-- Em 9 dias: 2.566 rodadas, 1.840 s de banco, 3,9 milhoes de blocos lidos do disco, picos de 21 s
-- quando a memoria aperta.
--
-- As duas atualizacoes da funcao so agem sobre linhas `cron_alerta_status = 'enfileirado'`; sem
-- nenhuma, o resultado e 0 nos dois casos. A saida antecipada consulta o indice parcial que ja
-- existe para isso (`idx_hs_v3_materializacao_alertas_pendentes`) -- comportamento identico.
--
-- Custo/dia: REDUZ (de ~200 s e ~3,7 milhoes de blocos por dia para quase zero sem pendencia).

do $migration$
declare
  v_def text;
  a constant text := E'begin\n  update public.health_score_professor_v3_materializacao_execucoes e\n     set cron_alerta_status = case';
  b constant text := E'begin\n  -- Sem alerta enfileirado nao ha o que reconciliar (as duas atualizacoes abaixo so\n  -- tocam linhas \'enfileirado\'); evita juntar com net._http_response a cada 5 min.\n  if not exists (\n    select 1 from public.health_score_professor_v3_materializacao_execucoes\n     where cron_alerta_status = \'enfileirado\'\n  ) then\n    return 0;\n  end if;\n\n  update public.health_score_professor_v3_materializacao_execucoes e\n     set cron_alerta_status = case';
  n int;
begin
  v_def := pg_get_functiondef('public.reconciliar_health_score_professor_v3_alertas()'::regprocedure);
  n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if n <> 1 then
    raise exception 'HS_ALERTAS: ancora encontrada % vezes (esperado 1)', n;
  end if;
  execute replace(v_def, a, b);
end
$migration$;
