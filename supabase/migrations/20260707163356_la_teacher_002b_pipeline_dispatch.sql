-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.fn_fabio_chama_edge(p_audio_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_url text; v_token text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'fabio_edge_url' limit 1;
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'fabio_edge_token' limit 1;
  if v_url is null or v_token is null then
    raise notice 'Vault sem fabio_edge_url/fabio_edge_token — pipeline não disparado';
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer '||v_token),
    body    := jsonb_build_object('audio_id', p_audio_id));
end $$;

create or replace function public.trg_fabio_fila_dispara()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_fabio_chama_edge(new.id);
  return new;
end $$;

drop trigger if exists trg_fabio_fila_novo on public.fabio_fila_audios;
create trigger trg_fabio_fila_novo
  after insert on public.fabio_fila_audios
  for each row when (new.status = 'pendente')
  execute function public.trg_fabio_fila_dispara();

create or replace function public.fn_fabio_retry_fila()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in
    select id from public.fabio_fila_audios
    where status in ('pendente','erro') and tentativas < 5
      and atualizado_em < now() - interval '3 minutes'
    limit 10
  loop
    update public.fabio_fila_audios
       set tentativas = tentativas + 1, atualizado_em = now()
     where id = r.id;
    perform public.fn_fabio_chama_edge(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

do $$ begin
  perform cron.schedule('fabio-retry-fila', '*/5 * * * *',
                        $cron$ select public.fn_fabio_retry_fila(); $cron$);
exception when others then
  raise notice 'cron fabio-retry-fila: % (talvez já exista)', sqlerrm;
end $$;
