-- Fixture mínima para validar parsing/execution da migration Sol Caixa V3 em Postgres 16.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

do $$ begin
  create role service_role; exception when duplicate_object then null;
end $$;
do $$ begin
  create role anon; exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated; exception when duplicate_object then null;
end $$;
do $$ begin
  create role sol_acesso_restrito; exception when duplicate_object then null;
end $$;
do $$ begin
  create role sol_caixa_readonly; exception when duplicate_object then null;
end $$;

create table public.unidades (id uuid primary key, nome text);
create table public.caixas_diarios (
  id uuid primary key default gen_random_uuid(), unidade_id uuid not null references public.unidades(id), data_caixa date not null,
  status text not null, saldo_inicial_cofre numeric, saldo_final_calculado numeric, saldo_final_conferido numeric,
  aberto_por text, aberto_em timestamptz default now(), fechado_por text, fechado_em timestamptz, updated_at timestamptz default now(),
  unique (unidade_id,data_caixa)
);
create table public.caixa_movimentacoes (
  id uuid primary key default gen_random_uuid(), caixa_diario_id uuid not null references public.caixas_diarios(id), unidade_id uuid not null references public.unidades(id),
  ambiente text not null, tipo text not null, valor numeric not null, data_movimento date, forma_pagamento text, categoria text, descricao text
);
create table public.sol_caixa_shadow_eventos_v1 (id uuid primary key default gen_random_uuid(), chat_id_hash text, unidade_id uuid, criado_em timestamptz default now());
create table public.sol_caixa_shadow_previews_v1 (
  id uuid primary key default gen_random_uuid(), evento_id uuid not null references public.sol_caixa_shadow_eventos_v1(id), preview_hash text not null,
  unidade_id uuid, operacao text, categoria text, valor_centavos integer, forma text, status text, preview_json jsonb default '{}'::jsonb, criado_em timestamptz default now()
);
create table public.sol_caixa_shadow_approvals_v1 (
  id uuid primary key default gen_random_uuid(), preview_id uuid references public.sol_caixa_shadow_previews_v1(id), approval_event_hash text,
  actor_id_hash text, decision text, decision_json jsonb default '{}'::jsonb, criado_em timestamptz default now()
);
create table public.sol_caixa_v3_approval_consumos_v1 (
  approval_id uuid primary key references public.sol_caixa_shadow_approvals_v1(id), preview_id uuid, unidade_id uuid, operacao text,
  idempotency_key text, payload_hash text, criado_em timestamptz default now()
);
create table public.sol_caixa_lancamento_auditoria (
  id uuid primary key default gen_random_uuid(), ator_numero text, ator_papel text, chat_id text, origem_message_id text, preview_message_id text,
  idempotency_key text, unidade_id uuid, data_caixa date, payload jsonb, resultado text, motivo text, caixa_diario_id uuid
);

create function public.sol_caixa_shadow_registrar(p_payload jsonb) returns jsonb language plpgsql as $$
declare
  v_financial_ops constant text[] := array['entrada','saida','correcao_forma','correcao_movimento','estorno'];
begin
  return jsonb_build_object('ok',true);
end $$;

create function public.sol_faturas_alunos_v1(uuid,integer,integer,text,text,date) returns jsonb language sql as $$ select '{"status":"ok","items":[]}'::jsonb $$;
create function public.sol_caixa_responsavel_aluno(uuid,text) returns jsonb language sql as $$ select jsonb_build_object('ok',true) $$;
create function public.sol_caixa_autorizar_payload_v1(uuid,jsonb,text) returns jsonb language sql as $$ select jsonb_build_object('ok',true,'autorizado',true) $$;
create function public.sol_caixa_resolver_multi_aluno_v1(uuid,jsonb,numeric,date) returns jsonb language sql as $$ select jsonb_build_object('ok',true,'itens','[]'::jsonb) $$;
