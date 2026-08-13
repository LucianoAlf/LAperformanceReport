begin;

alter table public.health_score_professor_v3_materializacao_execucoes
  add column if not exists cron_reconciliacao_status text null,
  add column if not exists cron_reconciliacao_erro text null,
  add column if not exists cron_reconciliado_em timestamptz null,
  add column if not exists cron_alerta_request_id bigint null,
  add column if not exists cron_alerta_status text null,
  add column if not exists cron_alerta_erro text null,
  add column if not exists cron_alerta_atualizado_em timestamptz null;

create or replace function public.reconciliar_health_score_professor_v3_alertas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_atualizadas integer;
begin
  update public.health_score_professor_v3_materializacao_execucoes e
     set cron_alerta_status = case
           when r.timed_out then 'timeout'
           when r.error_msg is not null then 'falha'
           when r.status_code between 200 and 299 then 'entregue'
           else 'falha'
         end,
         cron_alerta_erro = case
           when r.timed_out then coalesce(r.error_msg, 'Timeout na entrega do alerta')
           when r.error_msg is not null then r.error_msg
           when r.status_code between 200 and 299 then null
           else format('HTTP %s: %s', r.status_code, left(coalesce(r.content, ''), 1000))
         end,
         cron_alerta_atualizado_em = clock_timestamp()
    from net._http_response r
   where e.cron_alerta_status = 'enfileirado'
     and e.cron_alerta_request_id = r.id
     and (r.timed_out or r.error_msg is not null or r.status_code is not null);

  get diagnostics v_atualizadas = row_count;
  return v_atualizadas;
end;
$function$;

revoke all on function public.reconciliar_health_score_professor_v3_alertas()
  from public, anon, authenticated, service_role;

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
  v_total_unidades integer;
  v_total_minutos integer;
  v_agenda text;
  v_jobname text;
  v_command text;
  v_inicio_minutos constant integer := 390;
  v_intervalo_minutos constant integer := 5;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health-score-professor-v3-cron-escopos', 0)
  );

  select count(*)::integer
    into v_total_unidades
  from public.unidades u
  where u.ativo = true;

  if v_inicio_minutos + (v_total_unidades * v_intervalo_minutos) >= 1440 then
    raise exception 'HEALTH_SCORE_V3_JANELA_CRON_INSUFICIENTE'
      using errcode = '54000',
            detail = format('unidades_ativas=%s', v_total_unidades);
  end if;

  for v_job in
    select j.jobid
    from cron.job j
    where (
      j.jobname = 'materializar-health-score-professor-v3-diario'
      or j.jobname like 'materializar-health-score-professor-v3-diario-%'
      or j.jobname = 'reconciliar-health-score-professor-v3-alertas'
    )
      and (
        j.jobname = 'materializar-health-score-professor-v3-diario'
        or j.username <> current_user
        or (
          j.jobname like 'materializar-health-score-professor-v3-diario-unidade-%'
          and not exists (
            select 1
            from public.unidades u
            where u.ativo = true
              and j.jobname = 'materializar-health-score-professor-v3-diario-unidade-' || u.id::text
          )
        )
        or j.jobname not in (
          'materializar-health-score-professor-v3-diario-consolidado',
          'reconciliar-health-score-professor-v3-alertas'
        ) and j.jobname not like 'materializar-health-score-professor-v3-diario-unidade-%'
        or exists (
          select 1 from cron.job menor
          where menor.jobname = j.jobname
            and menor.username = current_user
            and menor.jobid < j.jobid
        )
      )
    order by j.jobid
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  for v_unidade in
    select
      u.id,
      row_number() over (order by u.id)::integer as ordem
    from public.unidades u
    where u.ativo = true
    order by u.id
  loop
    v_jobname := 'materializar-health-score-professor-v3-diario-unidade-' || v_unidade.id::text;
    v_command := format(
      'select public.executar_health_score_professor_v3_job_escopo(''unidade'', %L::uuid);',
      v_unidade.id::text
    );
    v_total_minutos := v_inicio_minutos
      + ((v_unidade.ordem - 1) * v_intervalo_minutos);
    v_agenda := format(
      '%s %s * * *',
      mod(v_total_minutos, 60),
      v_total_minutos / 60
    );

    select j.jobid into v_job_id
    from cron.job j
    where j.jobname = v_jobname and j.username = current_user
    order by j.jobid limit 1;
    if v_job_id is null then
      v_job_id := cron.schedule(v_jobname, v_agenda, v_command);
    else
      perform cron.alter_job(v_job_id, schedule := v_agenda, command := v_command, active := true);
    end if;
  end loop;

  v_total_minutos := v_inicio_minutos
    + (v_total_unidades * v_intervalo_minutos);
  v_agenda := format(
    '%s %s * * *',
    mod(v_total_minutos, 60),
    v_total_minutos / 60
  );
  v_jobname := 'materializar-health-score-professor-v3-diario-consolidado';
  v_command := 'select public.executar_health_score_professor_v3_job_escopo(''consolidado'', null::uuid);';
  select j.jobid into v_job_id from cron.job j
   where j.jobname = v_jobname and j.username = current_user
   order by j.jobid limit 1;
  if v_job_id is null then
    v_job_id := cron.schedule(v_jobname, v_agenda, v_command);
  else
    perform cron.alter_job(v_job_id, schedule := v_agenda, command := v_command, active := true);
  end if;

  v_total_minutos := v_total_minutos + v_intervalo_minutos;
  v_agenda := format('%s %s * * *', mod(v_total_minutos, 60), v_total_minutos / 60);
  v_jobname := 'reconciliar-health-score-professor-v3-alertas';
  v_command := 'select public.reconciliar_health_score_professor_v3_alertas();';
  select j.jobid into v_job_id from cron.job j
   where j.jobname = v_jobname and j.username = current_user
   order by j.jobid limit 1;
  if v_job_id is null then
    v_job_id := cron.schedule(v_jobname, v_agenda, v_command);
  else
    perform cron.alter_job(v_job_id, schedule := v_agenda, command := v_command, active := true);
  end if;
end;
$function$;

revoke all on function public.configurar_health_score_professor_v3_cron_escopos()
  from public, anon, authenticated, service_role;

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
  v_alerta_status text := 'nao_aplicavel';
  v_alerta_erro text;
  v_alerta_request_id bigint;
  v_reconciliacao_status text := 'nao_aplicavel';
  v_reconciliacao_erro text;
  v_execution_id text;
begin
  perform public.reconciliar_health_score_professor_v3_alertas();

  if v_escopo not in ('unidade', 'consolidado')
    or (v_escopo = 'unidade' and v_unidade_id is null)
    or (v_escopo = 'consolidado' and v_unidade_id is not null) then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_INCOMPATIVEL'
      using errcode = '22023';
  end if;

  if v_escopo = 'consolidado' then
    begin
      perform public.configurar_health_score_professor_v3_cron_escopos();
      v_reconciliacao_status := 'ok';
    exception
      when others then
        v_reconciliacao_status := 'falha';
        v_reconciliacao_erro := sqlerrm;
    end;
  end if;

  v_resultado := public.executar_health_score_professor_v3_escopo_diario(
    date_trunc('month', current_date)::date,
    'mensal',
    v_escopo,
    v_unidade_id
  );

  v_execution_id := nullif(v_resultado->>'execution_id', '');
  if v_execution_id is not null then
    update public.health_score_professor_v3_materializacao_execucoes e
       set cron_reconciliacao_status = v_reconciliacao_status,
           cron_reconciliacao_erro = v_reconciliacao_erro,
           cron_reconciliado_em = clock_timestamp()
     where e.id::text = v_execution_id;

    if not found and v_reconciliacao_status = 'falha' then
      raise exception 'HEALTH_SCORE_V3_RECONCILIACAO_NAO_PERSISTIDA'
        using errcode = 'P0001',
              detail = format('execution_id=%s; erro=%s', v_execution_id, v_reconciliacao_erro);
    end if;
  elsif v_reconciliacao_status = 'falha' then
    raise exception 'HEALTH_SCORE_V3_RECONCILIACAO_SEM_EXECUTION_ID'
      using errcode = 'P0001', detail = v_reconciliacao_erro;
  end if;

  if v_resultado->>'status' = 'erro' then
    begin
      select s.decrypted_secret
        into v_secret
      from vault.decrypted_secrets s
      where s.name = 'lia_alertas_service_role_key'
      limit 1;

      if nullif(btrim(v_secret), '') is null then
        v_alerta_status := 'nao_configurado';
        v_alerta_erro := 'segredo lia_alertas_service_role_key nao configurado';
      else
        select net.http_post(
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
        ) into v_alerta_request_id;
        v_alerta_status := 'enfileirado';
      end if;
    exception
      when others then
        v_alerta_status := 'falha';
        v_alerta_erro := sqlerrm;
    end;
  end if;

  if v_execution_id is not null then
    update public.health_score_professor_v3_materializacao_execucoes e
       set cron_alerta_request_id = v_alerta_request_id,
           cron_alerta_status = v_alerta_status,
           cron_alerta_erro = v_alerta_erro,
           cron_alerta_atualizado_em = clock_timestamp()
     where e.id::text = v_execution_id;
  end if;

  return coalesce(v_resultado, '{}'::jsonb) || jsonb_build_object(
    'alerta_status', v_alerta_status,
    'alerta_erro', v_alerta_erro,
    'alerta_request_id', v_alerta_request_id,
    'reconciliacao_status', v_reconciliacao_status,
    'reconciliacao_erro', v_reconciliacao_erro
  );
end;
$function$;

revoke all on function public.executar_health_score_professor_v3_job_escopo(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.executar_health_score_professor_v3_job_escopo(text, uuid)
  to service_role;

revoke all on function public.executar_health_score_professor_v3_cron_diario()
  from public, anon, authenticated, service_role;

select public.configurar_health_score_professor_v3_cron_escopos();

comment on function public.executar_health_score_professor_v3_job_escopo(text, uuid) is
  'Entrypoint operacional unico: reconcilia o catalogo no consolidado, executa um escopo mensal e isola falhas do alerta.';

comment on function public.configurar_health_score_professor_v3_cron_escopos() is
  'Reconcilia diferencialmente sob advisory lock o catalogo diario, preservando jobids canonicos e usando somente APIs do pg_cron.';

comment on function public.reconciliar_health_score_professor_v3_alertas() is
  'Consolida respostas assincronas do pg_net para alertas enfileirados pelo cron Health Score V3.';

commit;
