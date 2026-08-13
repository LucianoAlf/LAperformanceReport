begin;

-- Um snapshot em maturacao ja e uma revisao aberta e precisa receber suas
-- metricas no mesmo INSERT transacional da materializacao. O trigger legado
-- aceitava apenas provisorio e rejeitava exatamente os retratos sem base
-- comparavel produzidos pelo roster V3.
create or replace function public.fn_health_score_professor_v3_bloquear_metrica_fechada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_snapshot_id uuid;
  v_estado text;
begin
  v_snapshot_id := case
    when tg_op = 'DELETE' then old.snapshot_id
    else new.snapshot_id
  end;

  select s.estado
    into v_estado
  from public.health_score_professor_v3_snapshots s
  where s.id = v_snapshot_id;

  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: metricas sao append-only';
  end if;

  if v_estado not in ('provisorio', 'em_maturacao') then
    raise exception 'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: novas metricas exigem snapshot aberto';
  end if;

  return new;
end;
$$;

commit;
