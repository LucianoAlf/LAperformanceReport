-- Subprojeto B / B3: fila interna e consolidação temporal das respostas.
-- Não ativa multipartes_v2 e não altera pesquisas legado_v1.

create table if not exists public.pesquisa_evasao_processamento (
  pesquisa_id uuid primary key references public.pesquisa_evasao(id) on delete cascade,
  executar_apos timestamptz not null,
  motivo text not null,
  tentativas integer not null default 0 check (tentativas >= 0),
  locked_at timestamptz,
  locked_by uuid,
  ultimo_erro text,
  updated_at timestamptz not null default now()
);

comment on table public.pesquisa_evasao_processamento is
  'Fila service-only para consolidar rajadas de respostas da pesquisa de evasão.';

alter table public.pesquisa_evasao_processamento enable row level security;
revoke all on table public.pesquisa_evasao_processamento
  from public, anon, authenticated;
grant select, insert, update, delete on table public.pesquisa_evasao_processamento
  to service_role;

create or replace function public.fn_agendar_processamento_pesquisa_evasao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.pesquisa_id is null
     or new.resolution_status <> 'resolvida'
     or new.substantividade = 'opt_out' then
    return new;
  end if;
  if not exists (
    select 1
    from public.pesquisa_evasao pesquisa
    where pesquisa.id = new.pesquisa_id
      and pesquisa.resposta_ingestao_versao = 'multipartes_v2'
  ) then
    return new;
  end if;

  insert into public.pesquisa_evasao_processamento (
    pesquisa_id,
    executar_apos,
    motivo,
    locked_at,
    locked_by,
    updated_at
  ) values (
    new.pesquisa_id,
    now() + interval '60 seconds',
    'nova_mensagem',
    null,
    null,
    now()
  )
  on conflict (pesquisa_id) do update
  set executar_apos = excluded.executar_apos,
      motivo = excluded.motivo,
      locked_at = null,
      locked_by = null,
      ultimo_erro = null,
      updated_at = now();

  return new;
end;
$function$;

drop trigger if exists trg_agendar_processamento_pesquisa_evasao
  on public.pesquisa_evasao_mensagens;
create trigger trg_agendar_processamento_pesquisa_evasao
after insert on public.pesquisa_evasao_mensagens
for each row execute function public.fn_agendar_processamento_pesquisa_evasao();

create or replace function public.fn_reagendar_transcricao_pesquisa_evasao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pesquisa_id uuid;
begin
  if new.status not in ('concluida', 'falhou')
     or new.status is not distinct from old.status then
    return new;
  end if;

  select mensagem.pesquisa_id
  into v_pesquisa_id
  from public.pesquisa_evasao_mensagens mensagem
  where mensagem.id = new.mensagem_id;

  if v_pesquisa_id is null then
    return new;
  end if;

  insert into public.pesquisa_evasao_processamento (
    pesquisa_id,
    executar_apos,
    motivo,
    locked_at,
    locked_by,
    updated_at
  ) values (
    v_pesquisa_id,
    now(),
    'transcricao_finalizada',
    null,
    null,
    now()
  )
  on conflict (pesquisa_id) do update
  set executar_apos = least(
        public.pesquisa_evasao_processamento.executar_apos,
        excluded.executar_apos
      ),
      motivo = excluded.motivo,
      locked_at = null,
      locked_by = null,
      ultimo_erro = null,
      updated_at = now();

  return new;
end;
$function$;

drop trigger if exists trg_reagendar_transcricao_pesquisa_evasao
  on public.pesquisa_evasao_transcricoes;
create trigger trg_reagendar_transcricao_pesquisa_evasao
after update of status on public.pesquisa_evasao_transcricoes
for each row execute function public.fn_reagendar_transcricao_pesquisa_evasao();

create or replace function public.claim_pesquisas_evasao_processamento(
  p_worker_id uuid,
  p_limite integer default 25
)
returns table (pesquisa_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'acesso_negado';
  end if;
  if p_worker_id is null or p_limite < 1 or p_limite > 50 then
    raise exception 'parametros_invalidos';
  end if;

  return query
  with candidatas as (
    select fila.pesquisa_id
    from public.pesquisa_evasao_processamento fila
    where fila.executar_apos <= now()
      and (
        fila.locked_at is null
        or fila.locked_at < now() - interval '5 minutes'
      )
    order by fila.executar_apos, fila.pesquisa_id
    for update skip locked
    limit p_limite
  )
  update public.pesquisa_evasao_processamento fila
  set locked_at = now(),
      locked_by = p_worker_id,
      tentativas = fila.tentativas + 1,
      updated_at = now()
  from candidatas
  where fila.pesquisa_id = candidatas.pesquisa_id
  returning fila.pesquisa_id;
end;
$function$;

revoke all on function public.claim_pesquisas_evasao_processamento(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_pesquisas_evasao_processamento(uuid, integer)
  to service_role;

do $block$
declare
  v_job_name constant text := 'processar-conversa-evasao-cada-minuto';
  v_token_existe boolean;
begin
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'sync_presenca_edge_token'
      and nullif(btrim(decrypted_secret), '') is not null
  ) into v_token_existe;

  if not v_token_existe then
    raise notice 'Cron de consolidação não criado: secret sync_presenca_edge_token ausente no Vault.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = v_job_name) then
    perform cron.unschedule(v_job_name);
  end if;

  perform cron.schedule(
    v_job_name,
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/processar-conversa-evasao',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-sync-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'sync_presenca_edge_token'
            limit 1
          )
        ),
        body := '{"limite":25}'::jsonb,
        timeout_milliseconds := 50000
      );
    $cron$
  );
end;
$block$;
