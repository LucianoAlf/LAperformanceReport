-- Atualiza metadados operacionais das aulas a cada 15 minutos.
-- Cada unidade usa uma faixa de minutos diferente para evitar concorrencia na API Emusys.

do $do$
declare
  v_indice integer;
  v_horarios text[] := array[
    '0,15,30,45 * * * *',
    '5,20,35,50 * * * *',
    '10,25,40,55 * * * *'
  ];
  v_job_name text;
  v_command text;
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'sync_presenca_edge_token'
  ) then
    raise notice 'Cron de metadados nao criado: secret sync_presenca_edge_token ausente no Vault.';
    return;
  end if;

  for v_indice in 0..2 loop
    v_job_name := format('sync-metadados-aulas-15m-u%s', v_indice);

    if exists (select 1 from cron.job where jobname = v_job_name) then
      perform cron.unschedule(v_job_name);
    end if;

    v_command := format($cron$
      select net.http_post(
        url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-presenca-emusys',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'sync_presenca_edge_token'
            limit 1
          ),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'modo', 'metadados',
          'dias', 2,
          'dias_futuros', 35,
          'unidade_index', %s
        ),
        timeout_milliseconds := 180000
      );
    $cron$, v_indice);

    perform cron.schedule(v_job_name, v_horarios[v_indice + 1], v_command);
  end loop;
end;
$do$;
