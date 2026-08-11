begin;

-- A tabela de estado continua sendo a fonte canônica, mas o relatório precisa
-- saber se a última fotografia realmente terminou. O pg_cron só confirma que
-- enfileirou o HTTP; por isso o status da execução é persistido pela própria
-- Edge Function.
create table if not exists public.emusys_matriculas_sync_execucoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  escopo text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  linhas_recebidas integer not null default 0,
  linhas_ativas integer not null default 0,
  linhas_trancadas integer not null default 0,
  linhas_inativadas integer not null default 0,
  erro text,
  metadados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint emusys_matriculas_sync_execucoes_escopo_chk
    check (escopo in ('operacional', 'completo')),
  constraint emusys_matriculas_sync_execucoes_status_chk
    check (status in ('running', 'succeeded', 'failed')),
  constraint emusys_matriculas_sync_execucoes_totais_chk
    check (
      linhas_recebidas >= 0
      and linhas_ativas >= 0
      and linhas_trancadas >= 0
      and linhas_inativadas >= 0
    )
);

create index if not exists idx_emusys_matriculas_sync_execucoes_ultima
  on public.emusys_matriculas_sync_execucoes (unidade_id, escopo, status, completed_at desc);

alter table public.emusys_matriculas_sync_execucoes enable row level security;

drop policy if exists service_role_all_emusys_matriculas_sync_execucoes
  on public.emusys_matriculas_sync_execucoes;
create policy service_role_all_emusys_matriculas_sync_execucoes
  on public.emusys_matriculas_sync_execucoes
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.emusys_matriculas_sync_execucoes
  from public, anon, authenticated;
grant select, insert, update on table public.emusys_matriculas_sync_execucoes
  to service_role;

comment on table public.emusys_matriculas_sync_execucoes is
  'Manifesto auditavel das fotografias Emusys. Somente execucao operacional concluida e fresca pode alimentar KPIs vivos.';

-- O cron antigo marcava sucesso apenas ao enfileirar a requisição e fazia a
-- varredura completa de mais de 2.500 contratos. A varredura ultrapassava o
-- idle timeout de 150s e deixava a fotografia anterior publicada. A rotina
-- diária passa a pedir somente ativa + trancada; a reconciliação completa
-- continua disponível manualmente com escopo=completo.
select cron.unschedule('sync-matriculas-cg');
select cron.unschedule('sync-matriculas-recreio');
select cron.unschedule('sync-matriculas-barra');

select cron.schedule(
  'sync-matriculas-cg',
  '0 2 * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-matriculas-emusys?u=cg&escopo=operacional',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'supabase_anon_key' limit 1
      ),
      'x-sync-token', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

select cron.schedule(
  'sync-matriculas-recreio',
  '20 2 * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-matriculas-emusys?u=recreio&escopo=operacional',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'supabase_anon_key' limit 1
      ),
      'x-sync-token', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

select cron.schedule(
  'sync-matriculas-barra',
  '40 2 * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-matriculas-emusys?u=barra&escopo=operacional',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'supabase_anon_key' limit 1
      ),
      'x-sync-token', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

commit;
