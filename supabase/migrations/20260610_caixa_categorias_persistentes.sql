-- Caixa Diario / Categorias persistentes
-- Projeto: LA Performance Report
-- Data: 2026-06-10
--
-- Objetivo:
-- - Tirar categorias do caixa da lista fixa do frontend.
-- - Permitir criar categorias operacionais pela UI.
-- - Incluir Passaporte como categoria padrao.
--
-- Nao altera dados_mensais, KPIs, snapshots, views ou relatorios de alunos.
-- Nao altera lancamentos existentes de caixa.

create table if not exists public.caixa_categorias (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  ambiente text not null default 'ambos'
    check (ambiente in ('cofre', 'venda', 'ambos')),
  ativo boolean not null default true,
  ordem integer not null default 1000,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caixa_categorias_slug_formato check (slug ~ '^[a-z0-9_-]+$'),
  constraint caixa_categorias_nome_minimo check (length(trim(nome)) >= 2)
);

create index if not exists idx_caixa_categorias_ativo_ordem
  on public.caixa_categorias (ativo, ordem, nome);

drop trigger if exists tr_caixa_categorias_updated_at on public.caixa_categorias;
create trigger tr_caixa_categorias_updated_at
before update on public.caixa_categorias
for each row execute function public.set_updated_at_caixa();

insert into public.caixa_categorias (slug, nome, ambiente, ativo, ordem, criado_por)
values
  ('lojinha', 'Lojinha', 'ambos', true, 10, 'migration'),
  ('passaporte', 'Passaporte', 'ambos', true, 20, 'migration'),
  ('seguranca', 'Seguranca', 'cofre', true, 30, 'migration'),
  ('troco', 'Troco', 'cofre', true, 40, 'migration'),
  ('retirada', 'Retirada', 'cofre', true, 50, 'migration'),
  ('despesa', 'Despesa', 'ambos', true, 60, 'migration'),
  ('outro', 'Outro', 'ambos', true, 999, 'migration')
on conflict (slug) do update
set
  nome = excluded.nome,
  ambiente = excluded.ambiente,
  ativo = true,
  ordem = excluded.ordem;

alter table public.caixa_movimentacoes
  drop constraint if exists caixa_movimentacoes_categoria_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'caixa_movimentacoes_categoria_slug_check'
      and conrelid = 'public.caixa_movimentacoes'::regclass
  ) then
    alter table public.caixa_movimentacoes
      add constraint caixa_movimentacoes_categoria_slug_check
      check (categoria ~ '^[a-z0-9_-]+$' and length(trim(categoria)) >= 2);
  end if;
end;
$$;

alter table public.caixa_categorias enable row level security;

drop policy if exists caixa_categorias_select on public.caixa_categorias;
create policy caixa_categorias_select on public.caixa_categorias
for select using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
  )
);

drop policy if exists caixa_categorias_insert on public.caixa_categorias;
create policy caixa_categorias_insert on public.caixa_categorias
for insert with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
  )
);

drop policy if exists caixa_categorias_update on public.caixa_categorias;
create policy caixa_categorias_update on public.caixa_categorias
for update using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
  )
);

grant select, insert, update on public.caixa_categorias to authenticated, service_role;

comment on table public.caixa_categorias is
  'Categorias operacionais do caixa diario. Substitui lista fixa do frontend e permite novas categorias pela UI.';

comment on column public.caixa_categorias.ambiente is
  'cofre = apenas caixa-cofre; venda = apenas vendas/caixa diario; ambos = disponivel nos dois ambientes.';

comment on column public.caixa_movimentacoes.categoria is
  'Slug da categoria operacional. Validada por formato; exibicao e cadastro ficam em caixa_categorias para preservar historico mesmo se uma categoria for desativada.';
