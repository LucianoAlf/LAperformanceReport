begin;

-- A leitura aberta da Performance V3 permanece canônica, mas o papel
-- authenticated possui timeout de 8s e a composicao completa pode variar
-- alguns centésimos acima desse limite. A margem é exclusiva desta RPC de
-- leitura; não muda o timeout global, pesos, formulas ou snapshots.
alter function public.get_health_score_professor_v3_performance(date, uuid, text)
  set statement_timeout = '15s';

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is 'Read model V3 canônico por unidade. Margem local de 15s para compor a leitura aberta sem alterar timeout global, pesos, formulas ou snapshots.';

commit;
