begin;

create or replace function public.executar_health_score_professor_v3_job_escopo(
  text,
  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_escopo text := lower(btrim(coalesce($1, '')));
  v_unidade_id uuid := $2;
  v_resultado jsonb;
  v_secret text;
begin
  if v_escopo not in ('unidade', 'consolidado')
    or (v_escopo = 'unidade' and v_unidade_id is null)
    or (v_escopo = 'consolidado' and v_unidade_id is not null) then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_INCOMPATIVEL'
      using errcode = '22023';
  end if;

  v_resultado := public.executar_health_score_professor_v3_escopo_diario(
    date_trunc('month', current_date)::date,
    'mensal',
    v_escopo,
    v_unidade_id
  );

  if v_resultado->>'status' = 'erro' then
    select s.decrypted_secret
      into v_secret
    from vault.decrypted_secrets s
    where s.name = 'lia_alertas_service_role_key'
    limit 1;

    if nullif(btrim(v_secret), '') is not null then
      perform net.http_post(
        url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/projeto-alertas-whatsapp',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_secret,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'action', 'health_score_professor_v3_falha',
          'execution_id', v_resultado->>'execution_id',
          'escopo', v_escopo,
          'unidade_id', v_unidade_id,
          'resultado', v_resultado
        ),
        timeout_milliseconds := 55000
      );
    end if;
  end if;

  return v_resultado;
end;
$function$;

revoke all on function public.executar_health_score_professor_v3_job_escopo(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.executar_health_score_professor_v3_job_escopo(text, uuid)
  to service_role;

create or replace function public.configurar_health_score_professor_v3_cron_escopos()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job record;
  v_unidade record;
  v_job_id bigint;
  v_total_minutos integer;
  v_agenda text;
begin
  for v_job in
    select j.jobid
    from cron.job j
    where j.jobname = 'materializar-health-score-professor-v3-diario'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  for v_job in
    select j.jobid
    from cron.job j
    where j.jobname like 'materializar-health-score-professor-v3-diario-%'
      and j.jobname <> 'materializar-health-score-professor-v3-diario-consolidado'
      and not exists (
        select 1
        from public.unidades u
        where u.ativo = true
          and j.jobname = 'materializar-health-score-professor-v3-diario-unidade-' || u.id::text
      )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  v_job_id := cron.schedule(
    'materializar-health-score-professor-v3-diario-consolidado',
    '30 6 * * *',
    'select public.executar_health_score_professor_v3_job_escopo(''consolidado'', null::uuid);'
  );
  perform cron.alter_job(v_job_id, active := true);

  for v_unidade in
    select
      u.id,
      row_number() over (order by u.id)::integer as ordem
    from public.unidades u
    where u.ativo = true
    order by u.id
  loop
    v_total_minutos := 390 + (v_unidade.ordem * 10);
    v_agenda := format(
      '%s %s * * *',
      mod(v_total_minutos, 60),
      mod(v_total_minutos / 60, 24)
    );

    v_job_id := cron.schedule(
      'materializar-health-score-professor-v3-diario-unidade-' || v_unidade.id::text,
      v_agenda,
      format(
        'select public.executar_health_score_professor_v3_job_escopo(''unidade'', %L::uuid);',
        v_unidade.id::text
      )
    );
    perform cron.alter_job(v_job_id, active := true);
  end loop;
end;
$function$;

revoke all on function public.configurar_health_score_professor_v3_cron_escopos()
  from public, anon, authenticated, service_role;

select public.configurar_health_score_professor_v3_cron_escopos();

comment on function public.executar_health_score_professor_v3_job_escopo(text, uuid) is
  'Executa um unico escopo mensal aberto e envia alerta autenticado somente quando o executor retorna erro.';

comment on function public.configurar_health_score_professor_v3_cron_escopos() is
  'Substitui o cron monolitico por jobs diarios UTC isolados, deterministas e idempotentes para unidades ativas e consolidado.';

commit;
