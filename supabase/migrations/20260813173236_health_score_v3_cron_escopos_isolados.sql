begin;

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
    where j.jobname = 'materializar-health-score-professor-v3-diario'
       or j.jobname like 'materializar-health-score-professor-v3-diario-%'
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
    v_total_minutos := v_inicio_minutos
      + ((v_unidade.ordem - 1) * v_intervalo_minutos);
    v_agenda := format(
      '%s %s * * *',
      mod(v_total_minutos, 60),
      v_total_minutos / 60
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

  v_total_minutos := v_inicio_minutos
    + (v_total_unidades * v_intervalo_minutos);
  v_agenda := format(
    '%s %s * * *',
    mod(v_total_minutos, 60),
    v_total_minutos / 60
  );
  v_job_id := cron.schedule(
    'materializar-health-score-professor-v3-diario-consolidado',
    v_agenda,
    'select public.executar_health_score_professor_v3_job_escopo(''consolidado'', null::uuid);'
  );
  perform cron.alter_job(v_job_id, active := true);
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
  v_reconciliacao_status text := 'nao_aplicavel';
  v_reconciliacao_erro text;
begin
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
        v_alerta_status := 'enviado';
      end if;
    exception
      when others then
        v_alerta_status := 'falha';
        v_alerta_erro := sqlerrm;
    end;
  end if;

  return coalesce(v_resultado, '{}'::jsonb) || jsonb_build_object(
    'alerta_status', v_alerta_status,
    'alerta_erro', v_alerta_erro,
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
  'Recria sob advisory lock o catalogo diario exato de unidades ativas e consolidado, usando somente APIs do pg_cron.';

commit;
