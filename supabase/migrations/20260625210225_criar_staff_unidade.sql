-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create table if not exists public.staff_unidade (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id) on delete cascade,
  nome text not null,
  cargo text not null,
  foto_url text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.staff_unidade is 'Equipe por unidade para o carrossel de boas-vindas. unidade_id NULL = global (aparece em todas).';

alter table public.staff_unidade enable row level security;

create policy "staff_unidade_select_auth" on public.staff_unidade
  for select to authenticated using (true);
create policy "staff_unidade_all_admin" on public.staff_unidade
  for all to authenticated using (true) with check (true);

insert into public.staff_unidade (unidade_id, nome, cargo, foto_url, ordem) values
('95553e96-971b-4590-a6eb-0201d013c14d','Daiana','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/recreio/daiana.jpeg',1),
('95553e96-971b-4590-a6eb-0201d013c14d','Fernanda','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/recreio/fernanda.jpg',2),
('95553e96-971b-4590-a6eb-0201d013c14d','Clayton','Gerente de Relacionamento','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/recreio/clayton.jpeg',3),
('2ec861f6-023f-4d7b-9927-3960ad8c2a92','Jereh','Gerente de Relacionamento','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/cg/jereh.jpg',1),
('2ec861f6-023f-4d7b-9927-3960ad8c2a92','Jhon','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/cg/jhon.jpg',2),
('2ec861f6-023f-4d7b-9927-3960ad8c2a92','Gabi','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/cg/gabi.jpg',3),
('2ec861f6-023f-4d7b-9927-3960ad8c2a92','Vitória','Comercial','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/cg/vitoria.jpg',4),
('368d47f5-2d88-4475-bc14-ba084a9a348e','Anne Krissya','Gerente de Relacionamento','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/barra/krissya.jpg',1),
('368d47f5-2d88-4475-bc14-ba084a9a348e','Arthur','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/barra/arthur.jpg',2),
('368d47f5-2d88-4475-bc14-ba084a9a348e','Duda','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/barra/duda.jpg',3),
('368d47f5-2d88-4475-bc14-ba084a9a348e','Kailane','Comercial','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/barra/kailane.jpg',4),
(null,'Luciano e Anne','Direção','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/geral/luciano-anne.png',1);
