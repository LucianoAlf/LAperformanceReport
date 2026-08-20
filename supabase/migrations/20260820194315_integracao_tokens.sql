-- ============================================================================
-- integracao_tokens — tokens de escopo mínimo para integrações que chamam
-- edges por URL (sem header).
--
-- RLS habilitada e ZERO policies de propósito: nem `authenticated` nem `anon`
-- leem esta tabela. Só `service_role` (que ignora RLS) — ou seja, só a própria
-- edge. Mesmo padrão de `emusys_disciplinas_catalogo`.
--
-- Existe para NÃO reusar SYNC_ADMIN_TOKEN em URL colada no n8n: aquele token dá
-- acesso às edges administrativas de sync e ficaria no histórico de execuções
-- do workflow. Rotacionar = um UPDATE aqui, sem redeploy da edge.
--
-- Primeiro consumidor: edge `base-conhecimento` (nó bd_conhecimento da Mila).
-- Spec: docs/superpowers/specs/2026-08-20-base-conhecimento-la-report-design.md
-- ============================================================================

create table if not exists public.integracao_tokens (
  nome text primary key,
  token text not null,
  descricao text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.integracao_tokens is
  'Tokens de escopo mínimo para integrações que chamam edges por URL. RLS sem policy: só service_role acessa. Rotacionar = UPDATE, sem redeploy.';

alter table public.integracao_tokens enable row level security;

revoke all on table public.integracao_tokens from anon, authenticated;

drop trigger if exists trg_integracao_tokens_updated_at on public.integracao_tokens;
create trigger trg_integracao_tokens_updated_at
  before update on public.integracao_tokens
  for each row execute function public.update_updated_at_column();

-- Token gerado no banco: nunca fica em texto no repositório.
insert into public.integracao_tokens (nome, token, descricao)
values (
  'base_conhecimento',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'Lido pela edge base-conhecimento. Usado pelo nó bd_conhecimento dos agentes SDR Mila (n8n). Escopo: só leitura da base de conhecimento.'
)
on conflict (nome) do nothing;
