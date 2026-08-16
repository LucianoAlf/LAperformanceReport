-- Alinha a cobrança operacional à regra aprovada: somente alunos ativos.
-- Trancados e evadidos permanecem no histórico/reconciliação, fora da lista
-- principal de cobrança. Também repara vínculos locais determinísticos quando
-- o Emusys entrega matrícula e aluno, mas a linha local só tem a matrícula.

do $$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef('public.get_inadimplencia_canonica(uuid,date)'::regprocedure)
    into v_definition;

  if v_definition is null then
    raise exception 'funcao canonica de inadimplencia nao encontrada';
  end if;

  if strpos(v_definition, 'active_or_locked') > 0 then
    v_before := v_definition;

    v_definition := regexp_replace(
      v_definition,
      $re$(?s)and\s*\(\s*estado\.entra_financeiro_ativo\s+is\s+true\s+or\s+estado\.eh_trancamento_atual\s+is\s+true\s*\)$re$,
      $rep$and estado.entra_financeiro_ativo is true$rep$,
      'g'
    );
    v_definition := regexp_replace(
      v_definition,
      $re$estado\.status_emusys\s+in\s*\(\s*'ativa'\s*,\s*'trancada'\s*\)$re$,
      $rep$estado.status_emusys = 'ativa'$rep$,
      'g'
    );
    v_definition := regexp_replace(
      v_definition,
      $re$estado\.status_operacional\s+in\s*\(\s*'ativo'\s*,\s*'trancado'\s*\)$re$,
      $rep$estado.status_operacional = 'ativo'$rep$,
      'g'
    );
    v_definition := replace(
      v_definition,
      'current_student_role(active_or_locked; non_archived; raw_precedes_data_saida; fallback_requires_data_saida_null)',
      'current_student_role(active_only; non_archived; raw_precedes_data_saida; fallback_requires_data_saida_null)'
    );

    if v_definition = v_before
       or strpos(v_definition, 'active_or_locked') > 0
       or strpos(v_definition, 'eh_trancamento_atual is true') > 0 then
      raise exception 'patch de escopo financeiro nao encontrou todos os trechos esperados';
    end if;

    execute v_definition;
  elsif strpos(v_definition, 'active_only') = 0 then
    raise exception 'politica financeira canonica desconhecida';
  end if;
end
$$;

with latest_runs as (
  select distinct on (competencia)
    id,
    competencia
  from public.sync_runs
  where run_type = 'live'
    and status = 'succeeded'
    and snapshot_complete is true
    and unidades_concluidas = 3
    and competencia between date '2026-06-01' and date '2026-08-01'
  order by competencia, completed_at desc nulls last, created_at desc
),
source_candidates as (
  select
    sri.unidade_id,
    btrim(sri.emusys_matricula_id::text) as emusys_matricula_id,
    min(btrim(sri.emusys_student_id::text)) as emusys_student_id
  from latest_runs lr
  join public.sync_run_items sri on sri.run_id = lr.id
  where sri.status = 'aberta'
    and sri.source_missing is false
    and nullif(btrim(sri.emusys_matricula_id::text), '') is not null
    and nullif(btrim(sri.emusys_student_id::text), '') is not null
  group by sri.unidade_id, btrim(sri.emusys_matricula_id::text)
  having count(distinct btrim(sri.emusys_student_id::text)) = 1
),
eligible_repairs as (
  select distinct on (a.id)
    a.id,
    sc.emusys_student_id
  from public.alunos a
  join source_candidates sc
    on sc.unidade_id = a.unidade_id
   and sc.emusys_matricula_id = btrim(a.emusys_matricula_id)
  join public.vw_alunos_estado_operacional_v131 estado
    on estado.aluno_id = a.id
  where estado.status_operacional = 'ativo'
    and a.arquivado_em is null
    and nullif(btrim(a.emusys_student_id), '') is null
  order by a.id, sc.emusys_student_id
)
update public.alunos a
set
  emusys_student_id = er.emusys_student_id,
  updated_at = now(),
  updated_by = 'migration:20260816213000'
from eligible_repairs er
where a.id = er.id;

comment on function public.get_inadimplencia_canonica(uuid, date) is
  'Contrato v3: verdade financeira D+0, carencia operacional D+2, gate de frescor, somente alunos ativos e quarentena isolada.';
