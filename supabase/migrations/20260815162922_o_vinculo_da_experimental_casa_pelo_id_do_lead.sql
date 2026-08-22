-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.fn_reconciliar_experimental_por_lead(
  p_dias_atras integer default 2,
  p_dias_frente integer default 7,
  p_limite integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_lead record;
  v_par_id integer;
  v_qtd_par integer;
  v_processados integer := 0;
  v_vinculados integer := 0;
  v_ambiguos integer := 0;
  v_sem_par integer := 0;
  v_ja_vinculado integer := 0;
  v_ocupada integer := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for v_lead in
    select le.id, le.unidade_id, le.data_experimental, le.emusys_lead_id
      from public.lead_experimentais le
     where le.emusys_lead_id is not null
       and le.data_experimental between v_hoje - p_dias_atras and v_hoje + p_dias_frente
       and not exists (
         select 1 from public.lead_experimental_aulas v
          where v.lead_experimental_id = le.id
            and v.substituido_em is null
       )
     order by le.data_experimental desc, le.id
     limit p_limite
  loop
    v_processados := v_processados + 1;

    select count(*), min(ae.id) into v_qtd_par, v_par_id
      from public.aulas_emusys ae
      join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id
     where ae.categoria = 'experimental'
       and not coalesce(ae.cancelada, false)
       and ae.unidade_id = v_lead.unidade_id
       and r.emusys_lead_id = v_lead.emusys_lead_id
       and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::date
           = v_lead.data_experimental;

    if v_qtd_par = 0 then
      v_sem_par := v_sem_par + 1;
    elsif v_qtd_par > 1 then
      v_ambiguos := v_ambiguos + 1;
    else
      begin
        insert into public.lead_experimental_aulas
          (lead_experimental_id, aula_local_id, estado, casado_por, vinculado_em, vinculado_por)
        values
          (v_lead.id, v_par_id, 'vinculado', 'emusys_lead_id', now(), 'reconciliador_lead');
        v_vinculados := v_vinculados + 1;
      exception
        when unique_violation then
          v_ocupada := v_ocupada + 1;
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processados', v_processados,
    'vinculados', v_vinculados,
    'sem_par', v_sem_par,
    'ambiguos', v_ambiguos,
    'aula_ocupada', v_ocupada,
    'ja_vinculado', v_ja_vinculado
  );
end
$function$;

comment on function public.fn_reconciliar_experimental_por_lead(integer, integer, integer) is
  'Cria vínculo de aula experimental casando (emusys_lead_id, data) — o id que o próprio Emusys manda e o sync já grava em aula_alunos_emusys. Só cria o que não existe; máquina de estados segue em fn_reconciliar_experimental_aulas. Janela parametrizada serve ao cron e à varredura do passado.';
