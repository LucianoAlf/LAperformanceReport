-- P0 Caixa Diario / Caixa-Cofre Administrativo - Fase 1 manual
-- Projeto: LA Performance Report
-- Data: 2026-06-10
--
-- Este arquivo altera schema e cria estrutura operacional nova.
-- Nao altera dados_mensais, KPIs, snapshots, views ou relatorios existentes.
-- Nao importa CSV.
-- Nao automatiza Emusys/lojinha.

create table if not exists public.caixas_diarios (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  data_caixa date not null,
  status text not null default 'aberto'
    check (status in ('aberto', 'fechado')),
  saldo_inicial_cofre numeric(12,2) not null default 0,
  saldo_final_calculado numeric(12,2) not null default 0,
  saldo_final_conferido numeric(12,2),
  aberto_em timestamptz not null default now(),
  aberto_por text,
  fechado_em timestamptz,
  fechado_por text,
  observacoes text,
  ultimo_envio_whatsapp_em timestamptz,
  ultimo_envio_whatsapp_por text,
  ultimo_envio_whatsapp_status text,
  ultimo_envio_whatsapp_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caixas_diarios_unidade_data_unique unique (unidade_id, data_caixa),
  constraint caixas_diarios_fechamento_consistente check (
    (status = 'aberto' and fechado_em is null)
    or
    (status = 'fechado' and fechado_em is not null and fechado_por is not null and saldo_final_conferido is not null)
  )
);

create table if not exists public.caixa_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  caixa_diario_id uuid not null references public.caixas_diarios(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id),
  data_movimento date not null,
  ambiente text not null
    check (ambiente in ('cofre', 'venda')),
  tipo text not null
    check (tipo in ('entrada', 'saida')),
  forma_pagamento text not null
    check (forma_pagamento in ('dinheiro', 'pix', 'cartao', 'cheque', 'transferencia', 'outro')),
  categoria text not null default 'outro'
    check (categoria in ('lojinha', 'seguranca', 'troco', 'retirada', 'despesa', 'outro')),
  descricao text not null,
  valor numeric(12,2) not null check (valor > 0),
  responsavel text,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caixa_movimentacoes_descricao_minima check (length(trim(descricao)) >= 3)
);

create table if not exists public.caixa_financeiro_grupos_whatsapp (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  nome_grupo text not null,
  grupo_jid text not null,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caixa_financeiro_grupos_unidade_unique unique (unidade_id)
);

create index if not exists idx_caixas_diarios_unidade_data
  on public.caixas_diarios (unidade_id, data_caixa desc);

create index if not exists idx_caixa_movimentacoes_caixa
  on public.caixa_movimentacoes (caixa_diario_id, created_at);

create index if not exists idx_caixa_movimentacoes_unidade_data
  on public.caixa_movimentacoes (unidade_id, data_movimento desc);

create index if not exists idx_caixa_financeiro_grupos_unidade_ativo
  on public.caixa_financeiro_grupos_whatsapp (unidade_id, ativo);

create or replace function public.set_updated_at_caixa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_caixas_diarios_updated_at on public.caixas_diarios;
create trigger tr_caixas_diarios_updated_at
before update on public.caixas_diarios
for each row execute function public.set_updated_at_caixa();

drop trigger if exists tr_caixa_movimentacoes_updated_at on public.caixa_movimentacoes;
create trigger tr_caixa_movimentacoes_updated_at
before update on public.caixa_movimentacoes
for each row execute function public.set_updated_at_caixa();

drop trigger if exists tr_caixa_financeiro_grupos_updated_at on public.caixa_financeiro_grupos_whatsapp;
create trigger tr_caixa_financeiro_grupos_updated_at
before update on public.caixa_financeiro_grupos_whatsapp
for each row execute function public.set_updated_at_caixa();

alter table public.caixas_diarios enable row level security;
alter table public.caixa_movimentacoes enable row level security;
alter table public.caixa_financeiro_grupos_whatsapp enable row level security;

drop policy if exists caixas_diarios_select on public.caixas_diarios;
create policy caixas_diarios_select on public.caixas_diarios
for select using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixas_diarios.unidade_id)
  )
);

drop policy if exists caixas_diarios_insert on public.caixas_diarios;
create policy caixas_diarios_insert on public.caixas_diarios
for insert with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixas_diarios.unidade_id)
  )
);

drop policy if exists caixas_diarios_update on public.caixas_diarios;
create policy caixas_diarios_update on public.caixas_diarios
for update using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixas_diarios.unidade_id)
  )
) with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixas_diarios.unidade_id)
  )
);

drop policy if exists caixa_movimentacoes_select on public.caixa_movimentacoes;
create policy caixa_movimentacoes_select on public.caixa_movimentacoes
for select using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixa_movimentacoes.unidade_id)
  )
);

drop policy if exists caixa_movimentacoes_insert on public.caixa_movimentacoes;
create policy caixa_movimentacoes_insert on public.caixa_movimentacoes
for insert with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixa_movimentacoes.unidade_id)
  )
);

drop policy if exists caixa_movimentacoes_update on public.caixa_movimentacoes;
create policy caixa_movimentacoes_update on public.caixa_movimentacoes
for update using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixa_movimentacoes.unidade_id)
  )
) with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixa_movimentacoes.unidade_id)
  )
);

drop policy if exists caixa_movimentacoes_delete on public.caixa_movimentacoes;
create policy caixa_movimentacoes_delete on public.caixa_movimentacoes
for delete using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixa_movimentacoes.unidade_id)
  )
);

drop policy if exists caixa_grupos_select on public.caixa_financeiro_grupos_whatsapp;
create policy caixa_grupos_select on public.caixa_financeiro_grupos_whatsapp
for select using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixa_financeiro_grupos_whatsapp.unidade_id)
  )
);

drop policy if exists caixa_grupos_admin_all on public.caixa_financeiro_grupos_whatsapp;
create policy caixa_grupos_admin_all on public.caixa_financeiro_grupos_whatsapp
for all using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.perfil = 'admin'
  )
) with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.perfil = 'admin'
  )
);

grant select, insert, update on public.caixas_diarios to authenticated, service_role;
grant select, insert, update, delete on public.caixa_movimentacoes to authenticated, service_role;
grant select on public.caixa_financeiro_grupos_whatsapp to authenticated;
grant select, insert, update, delete on public.caixa_financeiro_grupos_whatsapp to service_role;

comment on table public.caixas_diarios is
  'Cabecalho do fechamento de caixa diario por unidade. Fase 1 manual.';
comment on table public.caixa_movimentacoes is
  'Lancamentos manuais do caixa diario/cofre. Ambiente cofre afeta saldo fisico em dinheiro; ambiente venda alimenta resumo.';
comment on table public.caixa_financeiro_grupos_whatsapp is
  'JIDs dos grupos financeiros por unidade para envio manual do fechamento de caixa.';
comment on column public.caixa_movimentacoes.ambiente is
  'cofre = dinheiro fisico no caixa-cofre; venda = resumo de vendas/recebimentos do dia.';
comment on column public.caixa_movimentacoes.forma_pagamento is
  'Apenas dinheiro em ambiente cofre altera saldo fisico do caixa-cofre.';
