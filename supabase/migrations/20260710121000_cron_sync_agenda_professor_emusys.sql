-- Pre-carrega sete dias de aulas/roster sem materializar presenca.
-- O token publico da Edge fica no Vault, nunca no texto do job ou no repositorio.

do $do$
declare
  v_indice integer;
  v_horarios text[] := array['10 9 * * *', '20 9 * * *', '30 9 * * *'];
  v_job_name text;
  v_command text;
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'sync_presenca_edge_token'
  ) then
    raise notice 'Cron da agenda nao criado: secret sync_presenca_edge_token ausente no Vault.';
    return;
  end if;

  for v_indice in 0..2 loop
    v_job_name := format('sync-agenda-professor-emusys-u%s', v_indice);

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
          'modo', 'agenda',
          'dias_futuros', 7,
          'unidade_index', %s
        )
      );
    $cron$, v_indice);

    perform cron.schedule(v_job_name, v_horarios[v_indice + 1], v_command);
  end loop;
end;
$do$;
