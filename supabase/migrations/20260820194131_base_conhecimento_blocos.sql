-- ============================================================================
-- Base de Conhecimento da LA Music — blocos editáveis pela equipe
--
-- Contexto: a tool `bd_conhecimento` dos agentes SDR Mila (n8n) aponta para um
-- artigo do Help Center do Chatwoot que devolve HTTP 404 desde que o portal
-- `la-music` foi deletado. A Mila argumenta diferenciais e benefícios sem fonte.
--
-- Esta migration cria a base do lado do LA Report:
--   1. tabela `base_conhecimento_blocos` (global + exceção por unidade)
--   2. carga inicial a partir de `mila_config.base_conhecimento` (Campo Grande)
--   3. RPC `get_base_conhecimento` — ÚNICA fonte de montagem do texto
--
-- 🔒 NADA é apagado: `mila_config.base_conhecimento` é apenas LIDO. A coluna
--    continua intacta no banco e o mesmo texto segue versionado em
--    `20260218_mila_agente_seed_cg.sql`.
--
-- Spec: docs/superpowers/specs/2026-08-20-base-conhecimento-la-report-design.md
-- ============================================================================

-- ── 1. Tabela ───────────────────────────────────────────────────────────────

create table if not exists public.base_conhecimento_blocos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  conteudo text not null,
  -- NULL = bloco global (vale para todas as unidades)
  unidade_id uuid null references public.unidades(id) on delete cascade,
  ordem integer not null default 0,
  ativo boolean not null default true,
  -- auth.uid() de quem salvou. Sem FK de propósito: `usuarios.id` é integer e o
  -- uuid do auth vive em `usuarios.auth_user_id`, que não tem UNIQUE.
  atualizado_por uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint base_conhecimento_blocos_titulo_nao_vazio check (length(trim(titulo)) > 0),
  constraint base_conhecimento_blocos_conteudo_nao_vazio check (length(trim(conteudo)) > 0)
);

comment on table public.base_conhecimento_blocos is
  'Base de conhecimento da LA Music, em blocos. Consumida pelos agentes SDR Mila '
  '(via RPC get_base_conhecimento + edge base-conhecimento) e pela equipe, na '
  'subaba Conhecimento em Pré-Atendimento > Configurações.';

comment on column public.base_conhecimento_blocos.unidade_id is
  'NULL = bloco global (todas as unidades). Preenchido = exclusivo daquela unidade.';

comment on column public.base_conhecimento_blocos.ativo is
  'Bloco inativo não é entregue à Mila nem aparece no "Ver como a Mila vê".';

-- Predicado exato da RPC
create index if not exists idx_base_conhecimento_blocos_leitura
  on public.base_conhecimento_blocos (ativo, unidade_id, ordem);

-- updated_at automático (função já usada por 12 tabelas do projeto)
drop trigger if exists trg_base_conhecimento_blocos_updated_at
  on public.base_conhecimento_blocos;
create trigger trg_base_conhecimento_blocos_updated_at
  before update on public.base_conhecimento_blocos
  for each row execute function public.update_updated_at_column();

-- ── 2. RLS ──────────────────────────────────────────────────────────────────
-- Mesmo padrão de `crm_templates_whatsapp`
-- (20260630141000_seguranca_rls_grupo_b_enable_policies.sql): conteúdo
-- institucional, não dado sensível por unidade.

alter table public.base_conhecimento_blocos enable row level security;

drop policy if exists rls_base_conhecimento_blocos_roles_internos
  on public.base_conhecimento_blocos;
create policy rls_base_conhecimento_blocos_roles_internos
  on public.base_conhecimento_blocos
  for all
  to authenticated, mila_acesso_restrito, sol_acesso_restrito
  using (true)
  with check (true);

-- ── 3. Carga inicial ────────────────────────────────────────────────────────
-- Lê o texto de `mila_config.base_conhecimento`, quebra pelos `## ` que ele já
-- tem e grava como blocos GLOBAIS. Idempotente: não roda se a tabela já tem
-- linha. NENHUM update/delete em `mila_config`.

do $$
declare
  v_inseridos integer;
begin
  if exists (select 1 from public.base_conhecimento_blocos) then
    raise notice 'base_conhecimento_blocos já populada — carga inicial ignorada';
    return;
  end if;

  with fonte as (
    select base_conhecimento as txt
    from public.mila_config
    where base_conhecimento is not null
      and length(trim(base_conhecimento)) > 0
    order by id
    limit 1
  ),
  partes as (
    -- ord = 1 é o cabeçalho "# Base de Conhecimento LA Music", descartado
    select t.p, t.ord
    from fonte, regexp_split_to_table(fonte.txt, E'\n## ') with ordinality as t(p, ord)
    where t.ord > 1
  )
  insert into public.base_conhecimento_blocos (titulo, conteudo, unidade_id, ordem, ativo)
  select
    rtrim(trim(split_part(p, E'\n', 1)), ':'),
    -- btrim com o conjunto explícito: `trim(x)` no Postgres remove só ESPAÇOS,
    -- deixando o \n final de cada bloco e uma linha em branco extra no texto.
    btrim(substring(p from position(E'\n' in p) + 1), E' \n\r\t'),
    null,               -- global
    (ord - 1) * 10,     -- 10, 20, 30, 40 — deixa espaço para intercalar depois
    true
  from partes
  where position(E'\n' in p) > 0;

  get diagnostics v_inseridos = row_count;
  raise notice 'base_conhecimento_blocos: % blocos migrados de mila_config', v_inseridos;
end $$;

-- ── 4. RPC de montagem ──────────────────────────────────────────────────────
-- ÚNICA fonte de montagem do texto: a edge `base-conhecimento` e o botão
-- "Ver como a Mila vê" chamam esta mesma função. Se a concatenação fosse
-- reimplementada no front, o preview poderia divergir do que a Mila recebe.

create or replace function public.get_base_conhecimento(p_unidade_id uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    '# Base de Conhecimento LA Music' ||
    coalesce(
      string_agg(
        E'\n\n## ' || b.titulo || E'\n' || b.conteudo,
        '' order by b.ordem, b.titulo
      ),
      ''
    )
  from public.base_conhecimento_blocos b
  where b.ativo
    and (b.unidade_id is null or b.unidade_id = p_unidade_id);
$$;

comment on function public.get_base_conhecimento(uuid) is
  'Monta o texto da base de conhecimento (blocos globais + os da unidade), em '
  'markdown. Fonte única: usada pela edge `base-conhecimento` (Mila) e pelo '
  'botão "Ver como a Mila vê" da subaba Conhecimento. Sem unidade, devolve só '
  'os blocos globais.';

-- ⚠️ ALTER DEFAULT PRIVILEGES neste schema concede EXECUTE a `anon` em função
--    nova, e `revoke from public` NÃO basta. A anon key é pública (vai no
--    bundle do front) — deixar `anon` executando abriria a base para a internet.
--    Já pegou get_agenda_dia, get_kpis_alunos_canonicos_base_v131 e a de
--    retificação (3×). Conferir `proacl` depois de qualquer DROP+CREATE.
revoke all on function public.get_base_conhecimento(uuid) from public;
revoke all on function public.get_base_conhecimento(uuid) from anon;
grant execute on function public.get_base_conhecimento(uuid) to authenticated, service_role;
