-- supabase/migrations/20260902121500_fechamento_mensal_execucoes.sql
--
-- Placar de cada execucao do fechamento automatico. Existe para o vigia da
-- la-hq poder dizer QUAL unidade travou e com QUAL erro -- em 31/08/2026 o
-- cron respondeu "succeeded" e ninguem soube que o mes nao tinha fechado.

create table if not exists public.fechamento_mensal_execucoes (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  origem text not null default 'cron_dia1',
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz,
  unidades_fechadas integer not null default 0,
  unidades_com_erro integer not null default 0,
  detalhes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fechamento_mensal_execucoes_competencia_idx
  on public.fechamento_mensal_execucoes (ano desc, mes desc, iniciado_em desc);

alter table public.fechamento_mensal_execucoes enable row level security;

revoke all on table public.fechamento_mensal_execucoes from public, anon, authenticated;
grant select, insert, update on table public.fechamento_mensal_execucoes to service_role;

create policy fechamento_mensal_execucoes_leitura_admin
  on public.fechamento_mensal_execucoes
  for select
  to authenticated
  using ((select public.is_admin()));

comment on table public.fechamento_mensal_execucoes is
  'Placar do fechamento mensal automatico. Alimenta o vigia da la-hq, que le daqui o motivo da falha por unidade.';
