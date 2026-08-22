-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ============================================================
-- MÓDULO CAMPANHAS WHATSAPP + AGENTES IA
-- Sprint 1 — Fundação
-- ============================================================

-- 1. numeros_meta
create table if not exists public.numeros_meta (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id) on delete set null,
  nome text not null,
  phone_number_id text not null,
  waba_id text not null,
  access_token text not null,
  app_secret text,
  verify_token text,
  limite_diario int default 1000,
  limite_por_segundo int default 80,
  custo_por_categoria jsonb default '{"marketing": 0.50, "utility": 0.15, "authentication": 0.25}'::jsonb,
  orcamento_mensal numeric(10,2),
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. templates_meta
create table if not exists public.templates_meta (
  id uuid primary key default gen_random_uuid(),
  numero_meta_id uuid references public.numeros_meta(id) on delete cascade,
  nome text not null,
  idioma text default 'pt_BR',
  categoria text,
  status text,
  componentes jsonb default '[]'::jsonb,
  meta_template_id text,
  body_text text,
  header_type text,
  has_buttons boolean default false,
  media_url text,
  media_type text,
  variaveis jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(meta_template_id, numero_meta_id)
);

-- 3. campanhas
create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id) on delete set null,
  criado_por uuid references auth.users(id) on delete set null,
  nome text not null,
  template_id uuid references public.templates_meta(id) on delete set null,
  numero_meta_id uuid references public.numeros_meta(id) on delete set null,
  status text default 'rascunho',
  total_contatos int default 0,
  enviados int default 0,
  entregues int default 0,
  lidos int default 0,
  respondidos int default 0,
  falhas int default 0,
  custo_estimado numeric(10,2) default 0,
  custo_real numeric(10,2) default 0,
  mapeamento_variaveis jsonb default '{}'::jsonb,
  media_url_custom text,
  iniciada_em timestamptz,
  concluida_em timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. campanha_contatos
create table if not exists public.campanha_contatos (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid references public.campanhas(id) on delete cascade,
  telefone text not null,
  status text default 'pendente',
  variaveis jsonb default '{}'::jsonb,
  erro text,
  meta_message_id text,
  enviado_em timestamptz,
  created_at timestamptz default now()
);

-- 5. agentes
create table if not exists public.agentes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id) on delete set null,
  nome text not null,
  descricao text,
  system_prompt text not null default '',
  modelo text default 'gpt-4o-mini',
  provider text default 'openai',
  temperature numeric default 0.7,
  max_tokens int default 1024,
  tools jsonb default '[]'::jsonb,
  mensagem_boas_vindas text,
  mensagem_fallback text,
  horario_funcionamento jsonb default '{}'::jsonb,
  is_active boolean default true,
  status text default 'active',
  numero_meta_id uuid references public.numeros_meta(id) on delete set null,
  anti_spam jsonb default '{"min_interval_ms": 3000, "max_messages_per_minute": 20}'::jsonb,
  modo_teste boolean default false,
  telefone_teste text,
  auto_reply_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. agente_conversas
create table if not exists public.agente_conversas (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid references public.agentes(id) on delete cascade,
  unidade_id uuid references public.unidades(id) on delete set null,
  telefone text not null,
  bot_ativo boolean default true,
  pausado_por uuid references auth.users(id) on delete set null,
  pausado_em timestamptz,
  retomado_em timestamptz,
  session_data jsonb default '{}'::jsonb,
  ultima_mensagem_em timestamptz,
  total_mensagens int default 0,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 7. agente_fila_mensagens
create table if not exists public.agente_fila_mensagens (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid references public.agentes(id) on delete cascade,
  unidade_id uuid references public.unidades(id) on delete set null,
  telefone text not null,
  mensagens_acumuladas jsonb default '[]'::jsonb,
  processar_apos timestamptz,
  processando boolean default false,
  created_at timestamptz default now(),
  unique(agente_id, telefone)
);

-- 8. conversas_campanha
create table if not exists public.conversas_campanha (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id) on delete set null,
  numero_meta_id uuid references public.numeros_meta(id) on delete set null,
  telefone text not null,
  nome_contato text,
  ultima_mensagem_em timestamptz,
  nao_lidas int default 0,
  status text default 'open',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 9. mensagens_campanha
create table if not exists public.mensagens_campanha (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid references public.conversas_campanha(id) on delete cascade,
  campanha_id uuid references public.campanhas(id) on delete set null,
  unidade_id uuid references public.unidades(id) on delete set null,
  telefone text not null,
  direcao text not null,
  tipo text default 'text',
  texto text,
  media_url text,
  media_mime text,
  media_filename text,
  sticker_id text,
  reaction_emoji text,
  reaction_message_id text,
  meta_message_id text,
  wa_id text,
  status text default 'pending',
  status_atualizado_em timestamptz,
  enviado_por_agente uuid references public.agentes(id) on delete set null,
  custo_billable boolean,
  custo_categoria text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
create index if not exists idx_campanha_contatos_campanha on public.campanha_contatos(campanha_id);
create index if not exists idx_campanha_contatos_status on public.campanha_contatos(status);
create index if not exists idx_agente_conversas_tel on public.agente_conversas(agente_id, telefone);
create index if not exists idx_agente_fila_processar on public.agente_fila_mensagens(processar_apos) where processando = false;
create index if not exists idx_conversas_camp_tel on public.conversas_campanha(numero_meta_id, telefone);
create index if not exists idx_mensagens_camp_meta on public.mensagens_campanha(meta_message_id);
create index if not exists idx_mensagens_camp_conv on public.mensagens_campanha(conversa_id, created_at);

-- ============================================================
-- RLS
-- ============================================================
alter table public.numeros_meta enable row level security;
alter table public.templates_meta enable row level security;
alter table public.campanhas enable row level security;
alter table public.campanha_contatos enable row level security;
alter table public.agentes enable row level security;
alter table public.agente_conversas enable row level security;
alter table public.agente_fila_mensagens enable row level security;
alter table public.conversas_campanha enable row level security;
alter table public.mensagens_campanha enable row level security;

-- Helper: verifica se o usuário logado é admin
create or replace function public.is_admin_usuario()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.usuarios
    where auth_user_id = auth.uid() and perfil = 'admin'
  );
$$;

-- Helper: unidade_id do usuário logado
create or replace function public.get_unidade_usuario()
returns uuid language sql security definer as $$
  select unidade_id from public.usuarios
  where auth_user_id = auth.uid()
  limit 1;
$$;

-- numeros_meta
create policy "numeros_meta_select" on public.numeros_meta for select to authenticated
  using (unidade_id is null or unidade_id = public.get_unidade_usuario() or public.is_admin_usuario());

create policy "numeros_meta_insert" on public.numeros_meta for insert to authenticated
  with check (public.is_admin_usuario());

create policy "numeros_meta_update" on public.numeros_meta for update to authenticated
  using (public.is_admin_usuario());

create policy "numeros_meta_delete" on public.numeros_meta for delete to authenticated
  using (public.is_admin_usuario());

-- templates_meta
create policy "templates_meta_select" on public.templates_meta for select to authenticated using (true);
create policy "templates_meta_insert" on public.templates_meta for insert to authenticated with check (true);
create policy "templates_meta_update" on public.templates_meta for update to authenticated using (true);

-- campanhas
create policy "campanhas_select" on public.campanhas for select to authenticated
  using (unidade_id is null or unidade_id = public.get_unidade_usuario() or public.is_admin_usuario());

create policy "campanhas_insert" on public.campanhas for insert to authenticated with check (true);
create policy "campanhas_update" on public.campanhas for update to authenticated using (true);

-- campanha_contatos
create policy "campanha_contatos_all" on public.campanha_contatos for all to authenticated using (true) with check (true);

-- agentes
create policy "agentes_select" on public.agentes for select to authenticated using (true);
create policy "agentes_insert" on public.agentes for insert to authenticated with check (public.is_admin_usuario());
create policy "agentes_update" on public.agentes for update to authenticated using (public.is_admin_usuario());
create policy "agentes_delete" on public.agentes for delete to authenticated using (public.is_admin_usuario());

-- agente_conversas
create policy "agente_conversas_all" on public.agente_conversas for all to authenticated using (true) with check (true);

-- agente_fila_mensagens
create policy "agente_fila_all" on public.agente_fila_mensagens for all to authenticated using (true) with check (true);

-- conversas_campanha
create policy "conversas_campanha_all" on public.conversas_campanha for all to authenticated using (true) with check (true);

-- mensagens_campanha
create policy "mensagens_campanha_all" on public.mensagens_campanha for all to authenticated using (true) with check (true);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create trigger set_updated_at_numeros_meta before update on public.numeros_meta for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_templates_meta before update on public.templates_meta for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_campanhas before update on public.campanhas for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_agentes before update on public.agentes for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_agente_conversas before update on public.agente_conversas for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_conversas_campanha before update on public.conversas_campanha for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;
