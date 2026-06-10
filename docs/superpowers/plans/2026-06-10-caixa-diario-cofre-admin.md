# Caixa Diario e Caixa-Cofre Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 manual Caixa feature in Administrativo: daily cash opening, cash-safe movements, sales/payment summary, closing conference, and a WhatsApp-ready report per unit/day.

**Architecture:** Add a dedicated `Caixa` tab inside Administrativo backed by two new Supabase tables: one daily header (`caixas_diarios`) and one movement ledger (`caixa_movimentacoes`). The frontend calculates cash-safe balance from ledger rows, previews the approved WhatsApp message, and calls an Edge Function for manual sending to the unit finance group. CSV import, automatic Emusys integration, scheduled sends, and bank reconciliation stay out of Phase 1.

**Tech Stack:** React + TypeScript + Vite, Supabase Postgres/RLS, Supabase Edge Functions, existing WhatsApp provider pattern from `relatorio-admin-whatsapp`, lucide-react icons, existing LA Report design system.

---

## Reference Spec

- Approved design spec: `docs/superpowers/specs/2026-06-10-caixa-diario-cofre-admin-design.md`
- Approved mockup companion: `.superpowers/brainstorm/522-1781062791/content/caixa-admin-v2.html`

## Phase 1 Scope

Build only the manual workflow:

1. User opens daily cash for the selected unit/date.
2. User registers entries and exits manually.
3. App separates physical cash-safe (`cofre`) from daily sales/payment summary (`venda`).
4. User sees the WhatsApp preview before sending.
5. User closes the day with a responsible person and confirmed final balance.
6. User manually sends the report through the LA Report button.

Do not implement in this phase:

- CSV import.
- Automatic Emusys/lojinha integration.
- Scheduled automatic send.
- Bank reconciliation.
- Any KPI/snapshot/data-mensais change.
- Any commercial/leads change.

## File Structure

Create:

- `supabase/migrations/20260610_caixa_diario_cofre_admin.sql`
  - Creates tables, indexes, RLS policies, comments, and grants for Phase 1.
- `src/types/caixa.ts`
  - Shared TypeScript contracts for the Caixa feature.
- `src/lib/caixaFinanceiro.ts`
  - Pure calculation and WhatsApp formatting helpers.
- `src/hooks/useCaixaDiario.ts`
  - Supabase data access and mutations for Caixa.
- `src/components/App/Administrativo/CaixaFinanceiro/CaixaFinanceiroTab.tsx`
  - Main tab layout and orchestration.
- `src/components/App/Administrativo/CaixaFinanceiro/CaixaResumoCards.tsx`
  - Summary cards for initial balance, cash entries, cash exits, final balance, and sales totals.
- `src/components/App/Administrativo/CaixaFinanceiro/CaixaMovimentacoesTable.tsx`
  - Dense movement table.
- `src/components/App/Administrativo/CaixaFinanceiro/CaixaMovimentacaoForm.tsx`
  - Manual movement form.
- `src/components/App/Administrativo/CaixaFinanceiro/CaixaWhatsAppPreview.tsx`
  - WhatsApp preview and send controls.
- `src/components/App/Administrativo/CaixaFinanceiro/index.ts`
  - Barrel export.
- `supabase/functions/caixa-financeiro-whatsapp/index.ts`
  - Manual WhatsApp sending function.

Modify:

- `src/components/App/Administrativo/AdministrativoPage.tsx`
  - Add the new `Caixa` tab.
  - Rename existing `Caixa de Entrada` short label from `Caixa` to `Entrada` to avoid ambiguity.
- `.gitignore`
  - Add `.superpowers/` so brainstorm/mockup server artifacts do not get committed.

## Data Rules

Physical cash-safe balance:

```ts
saldoFinalCalculado = saldoInicialCofre + entradasDinheiroCofre - saidasDinheiroCofre;
```

Only rows with `ambiente = 'cofre'` and `forma_pagamento = 'dinheiro'` affect the physical safe balance.

Sales/payment summary:

- `ambiente = 'venda'`
- Sum by `forma_pagamento`.
- Pix/card/cheque/transferencia appear in the report, but do not affect the cash-safe balance.

WhatsApp message must keep the approved semantic sections:

```text
*FECHAMENTO DE CAIXA DE CAMPO GRANDE*
📆 10/06/2026

💰 *Caixa Cofre Dinheiro - CG*

Saldo inicial: *R$ 775,77*

🟢 *Entrada do dia:*
• R$ 80,00 - venda lojinha - camiseta

🔴 *Saida do dia:*
• R$ 100,00 - Segurança (Pagamento semanal do dia 27/05)
• R$ 100,00 - Segurança (Pagamento semanal 02/06)

🧾 *Vendas / Caixa Diario:*
• Dinheiro: R$ 80,00
• Pix: R$ 100,00
• Cartao: R$ 0,00

✅ *Saldo final caixa dia 10/06/2026:* R$ 655,77

Conferido por: *Gabriela*
_Gerado pelo LA Report_
```

Do not print `_Gerado pelo LA Report_` twice.

## Task 1: Preflight Read-Only Checks

**Files:**
- No file changes.

- [ ] **Step 1: Confirm existing auth/RLS shape before migration**

Run in Supabase SQL editor or MCP as SELECT-only:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'usuarios'
  and column_name in ('id', 'auth_user_id', 'perfil', 'unidade_id', 'email', 'nome')
order by ordinal_position;
```

Expected:

- `auth_user_id` exists.
- `perfil` exists and includes `admin`.
- `unidade_id` exists.

- [ ] **Step 2: Confirm unit columns**

Run:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'unidades'
order by ordinal_position;
```

Expected:

- `id` exists.
- A human-readable column exists for unit name, usually `nome`.

- [ ] **Step 3: Confirm current WhatsApp config pattern**

Run:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'whatsapp_caixas'
order by ordinal_position;
```

Expected:

- Table exists.
- Current Edge Functions can still use `whatsapp_caixas`.
- New finance group JIDs will be stored in a separate table so Caixa can route per unit without changing the current report function.

- [ ] **Step 4: Stop if auth columns differ**

If the SELECT results do not match the expected `usuarios.auth_user_id`, `usuarios.perfil`, and `usuarios.unidade_id` shape, do not execute Task 2. Adjust the migration RLS predicates to match the real auth schema first.

## Task 2: Add Caixa Database Structure

**Files:**
- Create: `supabase/migrations/20260610_caixa_diario_cofre_admin.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260610_caixa_diario_cofre_admin.sql` with:

```sql
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
```

- [ ] **Step 2: Run migration only after explicit approval**

Run only after the user explicitly approves database execution:

```powershell
supabase db push
```

Expected:

- `caixas_diarios` exists.
- `caixa_movimentacoes` exists.
- `caixa_financeiro_grupos_whatsapp` exists.
- No changes to `dados_mensais`.

- [ ] **Step 3: Post-migration SELECT-only verification**

Run:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('caixas_diarios', 'caixa_movimentacoes', 'caixa_financeiro_grupos_whatsapp')
order by table_name;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('caixas_diarios', 'caixa_movimentacoes', 'caixa_financeiro_grupos_whatsapp')
order by table_name, ordinal_position;

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('caixas_diarios', 'caixa_movimentacoes', 'caixa_financeiro_grupos_whatsapp')
order by tablename, policyname;
```

Expected:

- All three tables appear.
- All policies appear.
- No data rows are required yet.

## Task 3: Add Shared Types and Calculation Helpers

**Files:**
- Create: `src/types/caixa.ts`
- Create: `src/lib/caixaFinanceiro.ts`

- [ ] **Step 1: Add shared types**

Create `src/types/caixa.ts`:

```ts
export type CaixaStatus = 'aberto' | 'fechado';
export type CaixaAmbiente = 'cofre' | 'venda';
export type CaixaTipoMovimento = 'entrada' | 'saida';
export type CaixaFormaPagamento = 'dinheiro' | 'pix' | 'cartao' | 'cheque' | 'transferencia' | 'outro';
export type CaixaCategoria = 'lojinha' | 'seguranca' | 'troco' | 'retirada' | 'despesa' | 'outro';

export interface CaixaDiario {
  id: string;
  unidade_id: string;
  data_caixa: string;
  status: CaixaStatus;
  saldo_inicial_cofre: number;
  saldo_final_calculado: number;
  saldo_final_conferido: number | null;
  aberto_em: string;
  aberto_por: string | null;
  fechado_em: string | null;
  fechado_por: string | null;
  observacoes: string | null;
  ultimo_envio_whatsapp_em: string | null;
  ultimo_envio_whatsapp_por: string | null;
  ultimo_envio_whatsapp_status: string | null;
  ultimo_envio_whatsapp_erro: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaixaMovimentacao {
  id: string;
  caixa_diario_id: string;
  unidade_id: string;
  data_movimento: string;
  ambiente: CaixaAmbiente;
  tipo: CaixaTipoMovimento;
  forma_pagamento: CaixaFormaPagamento;
  categoria: CaixaCategoria;
  descricao: string;
  valor: number;
  responsavel: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface NovaCaixaMovimentacaoInput {
  ambiente: CaixaAmbiente;
  tipo: CaixaTipoMovimento;
  forma_pagamento: CaixaFormaPagamento;
  categoria: CaixaCategoria;
  descricao: string;
  valor: number;
  responsavel?: string;
}

export interface CaixaResumo {
  saldoInicialCofre: number;
  entradasDinheiroCofre: number;
  saidasDinheiroCofre: number;
  saldoFinalCalculado: number;
  vendasDinheiro: number;
  vendasPix: number;
  vendasCartao: number;
  vendasCheque: number;
  vendasTransferencia: number;
  vendasOutro: number;
  vendasTotal: number;
}
```

- [ ] **Step 2: Add pure calculation and formatter helper**

Create `src/lib/caixaFinanceiro.ts`:

```ts
import type { CaixaDiario, CaixaMovimentacao, CaixaResumo } from '@/types/caixa';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

function money(value: number): string {
  return brl.format(Number.isFinite(value) ? value : 0);
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatarDataCaixa(dataCaixa: string): string {
  return parseLocalDate(dataCaixa).toLocaleDateString('pt-BR');
}

export function calcularResumoCaixa(caixa: Pick<CaixaDiario, 'saldo_inicial_cofre'> | null, movimentos: CaixaMovimentacao[]): CaixaResumo {
  const saldoInicialCofre = caixa?.saldo_inicial_cofre ?? 0;

  const entradasDinheiroCofre = movimentos
    .filter((m) => m.ambiente === 'cofre' && m.tipo === 'entrada' && m.forma_pagamento === 'dinheiro')
    .reduce((total, m) => total + Number(m.valor || 0), 0);

  const saidasDinheiroCofre = movimentos
    .filter((m) => m.ambiente === 'cofre' && m.tipo === 'saida' && m.forma_pagamento === 'dinheiro')
    .reduce((total, m) => total + Number(m.valor || 0), 0);

  const vendasPorForma = (forma: CaixaMovimentacao['forma_pagamento']) =>
    movimentos
      .filter((m) => m.ambiente === 'venda' && m.tipo === 'entrada' && m.forma_pagamento === forma)
      .reduce((total, m) => total + Number(m.valor || 0), 0);

  const vendasDinheiro = vendasPorForma('dinheiro');
  const vendasPix = vendasPorForma('pix');
  const vendasCartao = vendasPorForma('cartao');
  const vendasCheque = vendasPorForma('cheque');
  const vendasTransferencia = vendasPorForma('transferencia');
  const vendasOutro = vendasPorForma('outro');

  return {
    saldoInicialCofre,
    entradasDinheiroCofre,
    saidasDinheiroCofre,
    saldoFinalCalculado: saldoInicialCofre + entradasDinheiroCofre - saidasDinheiroCofre,
    vendasDinheiro,
    vendasPix,
    vendasCartao,
    vendasCheque,
    vendasTransferencia,
    vendasOutro,
    vendasTotal: vendasDinheiro + vendasPix + vendasCartao + vendasCheque + vendasTransferencia + vendasOutro,
  };
}

function linhasMovimentos(movimentos: CaixaMovimentacao[], tipo: 'entrada' | 'saida'): string {
  const linhas = movimentos
    .filter((m) => m.ambiente === 'cofre' && m.tipo === tipo && m.forma_pagamento === 'dinheiro')
    .map((m) => `• ${money(Number(m.valor))} - ${m.descricao}`);

  return linhas.length > 0 ? linhas.join('\n') : '• R$ 0,00 -';
}

export function formatarRelatorioCaixaWhatsApp(params: {
  caixa: CaixaDiario;
  movimentos: CaixaMovimentacao[];
  unidadeNome: string;
  unidadeCodigo: string;
  conferidoPor: string;
}): string {
  const { caixa, movimentos, unidadeNome, unidadeCodigo, conferidoPor } = params;
  const resumo = calcularResumoCaixa(caixa, movimentos);
  const data = formatarDataCaixa(caixa.data_caixa);

  return [
    `*FECHAMENTO DE CAIXA DE ${unidadeNome.toUpperCase()}*`,
    `📆 ${data}`,
    '',
    `💰 *Caixa Cofre Dinheiro - ${unidadeCodigo}*`,
    '',
    `Saldo inicial: *${money(resumo.saldoInicialCofre)}*`,
    '',
    '🟢 *Entrada do dia:*',
    linhasMovimentos(movimentos, 'entrada'),
    '',
    '🔴 *Saida do dia:*',
    linhasMovimentos(movimentos, 'saida'),
    '',
    '🧾 *Vendas / Caixa Diario:*',
    `• Dinheiro: ${money(resumo.vendasDinheiro)}`,
    `• Pix: ${money(resumo.vendasPix)}`,
    `• Cartao: ${money(resumo.vendasCartao)}`,
    `• Cheque: ${money(resumo.vendasCheque)}`,
    `• Transferencia: ${money(resumo.vendasTransferencia)}`,
    '',
    `✅ *Saldo final caixa dia ${data}:* ${money(resumo.saldoFinalCalculado)}`,
    '',
    `Conferido por: *${conferidoPor}*`,
    '_Gerado pelo LA Report_',
  ].join('\n');
}
```

- [ ] **Step 3: Add unit test for calculations if test runner is available**

Check package scripts:

```powershell
npm pkg get scripts
```

If a unit test script exists, add `src/lib/caixaFinanceiro.test.ts`:

```ts
import { calcularResumoCaixa, formatarRelatorioCaixaWhatsApp } from './caixaFinanceiro';
import type { CaixaDiario, CaixaMovimentacao } from '@/types/caixa';

const caixa = {
  id: 'caixa-1',
  unidade_id: 'u1',
  data_caixa: '2026-06-10',
  status: 'aberto',
  saldo_inicial_cofre: 775.77,
  saldo_final_calculado: 0,
  saldo_final_conferido: null,
  aberto_em: '2026-06-10T09:00:00Z',
  aberto_por: 'Gabriela',
  fechado_em: null,
  fechado_por: null,
  observacoes: null,
  ultimo_envio_whatsapp_em: null,
  ultimo_envio_whatsapp_por: null,
  ultimo_envio_whatsapp_status: null,
  ultimo_envio_whatsapp_erro: null,
  created_at: '2026-06-10T09:00:00Z',
  updated_at: '2026-06-10T09:00:00Z',
} satisfies CaixaDiario;

const movimentos = [
  movimento('entrada', 'cofre', 'dinheiro', 80, 'venda lojinha - camiseta'),
  movimento('saida', 'cofre', 'dinheiro', 100, 'Segurança semanal'),
  movimento('saida', 'cofre', 'dinheiro', 100, 'Segurança semanal 02/06'),
  movimento('entrada', 'venda', 'pix', 100, 'Venda lojinha - palheta/cabo'),
] satisfies CaixaMovimentacao[];

function movimento(
  tipo: CaixaMovimentacao['tipo'],
  ambiente: CaixaMovimentacao['ambiente'],
  forma: CaixaMovimentacao['forma_pagamento'],
  valor: number,
  descricao: string,
): CaixaMovimentacao {
  return {
    id: `${tipo}-${ambiente}-${forma}-${valor}`,
    caixa_diario_id: 'caixa-1',
    unidade_id: 'u1',
    data_movimento: '2026-06-10',
    ambiente,
    tipo,
    forma_pagamento: forma,
    categoria: 'lojinha',
    descricao,
    valor,
    responsavel: null,
    criado_por: null,
    created_at: '2026-06-10T09:00:00Z',
    updated_at: '2026-06-10T09:00:00Z',
  };
}

it('calcula saldo fisico apenas com dinheiro do cofre', () => {
  const resumo = calcularResumoCaixa(caixa, movimentos);
  expect(resumo.saldoFinalCalculado).toBe(655.77);
  expect(resumo.vendasPix).toBe(100);
});

it('formata relatorio whatsapp aprovado', () => {
  const texto = formatarRelatorioCaixaWhatsApp({
    caixa,
    movimentos,
    unidadeNome: 'Campo Grande',
    unidadeCodigo: 'CG',
    conferidoPor: 'Gabriela',
  });

  expect(texto).toContain('*FECHAMENTO DE CAIXA DE CAMPO GRANDE*');
  expect(texto).toContain('💰 *Caixa Cofre Dinheiro - CG*');
  expect(texto).toContain('✅ *Saldo final caixa dia 10/06/2026:* R$ 655,77');
  expect(texto.match(/Gerado pelo LA Report/g)?.length).toBe(1);
});
```

Run the detected test command. Expected: tests pass.

## Task 4: Add Caixa Hook

**Files:**
- Create: `src/hooks/useCaixaDiario.ts`

- [ ] **Step 1: Create hook with explicit operations**

Create `src/hooks/useCaixaDiario.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calcularResumoCaixa } from '@/lib/caixaFinanceiro';
import type { CaixaDiario, CaixaMovimentacao, NovaCaixaMovimentacaoInput } from '@/types/caixa';

interface UseCaixaDiarioParams {
  unidadeId?: string | null;
  dataCaixa: string;
}

export function useCaixaDiario({ unidadeId, dataCaixa }: UseCaixaDiarioParams) {
  const [caixa, setCaixa] = useState<CaixaDiario | null>(null);
  const [movimentos, setMovimentos] = useState<CaixaMovimentacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!unidadeId) {
      setCaixa(null);
      setMovimentos([]);
      return;
    }

    setLoading(true);
    setError(null);

    const { data: caixaData, error: caixaError } = await supabase
      .from('caixas_diarios')
      .select('*')
      .eq('unidade_id', unidadeId)
      .eq('data_caixa', dataCaixa)
      .maybeSingle();

    if (caixaError) {
      setError(caixaError.message);
      setLoading(false);
      return;
    }

    setCaixa(caixaData as CaixaDiario | null);

    if (!caixaData) {
      setMovimentos([]);
      setLoading(false);
      return;
    }

    const { data: movimentosData, error: movimentosError } = await supabase
      .from('caixa_movimentacoes')
      .select('*')
      .eq('caixa_diario_id', caixaData.id)
      .order('created_at', { ascending: true });

    if (movimentosError) {
      setError(movimentosError.message);
      setLoading(false);
      return;
    }

    setMovimentos((movimentosData ?? []) as CaixaMovimentacao[]);
    setLoading(false);
  }, [dataCaixa, unidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrirCaixa = useCallback(async (saldoInicial: number, abertoPor: string) => {
    if (!unidadeId) throw new Error('Selecione uma unidade para abrir o caixa.');

    setSaving(true);
    const { data, error: insertError } = await supabase
      .from('caixas_diarios')
      .insert({
        unidade_id: unidadeId,
        data_caixa: dataCaixa,
        saldo_inicial_cofre: saldoInicial,
        saldo_final_calculado: saldoInicial,
        aberto_por: abertoPor || null,
      })
      .select('*')
      .single();

    setSaving(false);
    if (insertError) throw insertError;
    setCaixa(data as CaixaDiario);
    setMovimentos([]);
    return data as CaixaDiario;
  }, [dataCaixa, unidadeId]);

  const adicionarMovimento = useCallback(async (input: NovaCaixaMovimentacaoInput) => {
    if (!caixa || !unidadeId) throw new Error('Abra o caixa antes de lançar movimentações.');
    if (caixa.status === 'fechado') throw new Error('Caixa fechado não aceita novos lançamentos.');

    setSaving(true);
    const { data, error: insertError } = await supabase
      .from('caixa_movimentacoes')
      .insert({
        caixa_diario_id: caixa.id,
        unidade_id: unidadeId,
        data_movimento: dataCaixa,
        ...input,
        responsavel: input.responsavel || null,
      })
      .select('*')
      .single();

    setSaving(false);
    if (insertError) throw insertError;

    const nextMovimentos = [...movimentos, data as CaixaMovimentacao];
    setMovimentos(nextMovimentos);

    const resumo = calcularResumoCaixa(caixa, nextMovimentos);
    await supabase
      .from('caixas_diarios')
      .update({ saldo_final_calculado: resumo.saldoFinalCalculado })
      .eq('id', caixa.id);

    setCaixa({ ...caixa, saldo_final_calculado: resumo.saldoFinalCalculado });
    return data as CaixaMovimentacao;
  }, [caixa, dataCaixa, movimentos, unidadeId]);

  const excluirMovimento = useCallback(async (movimentoId: string) => {
    if (!caixa) throw new Error('Caixa não carregado.');
    if (caixa.status === 'fechado') throw new Error('Caixa fechado não permite exclusão.');

    setSaving(true);
    const { error: deleteError } = await supabase
      .from('caixa_movimentacoes')
      .delete()
      .eq('id', movimentoId);

    setSaving(false);
    if (deleteError) throw deleteError;

    const nextMovimentos = movimentos.filter((m) => m.id !== movimentoId);
    setMovimentos(nextMovimentos);

    const resumo = calcularResumoCaixa(caixa, nextMovimentos);
    await supabase
      .from('caixas_diarios')
      .update({ saldo_final_calculado: resumo.saldoFinalCalculado })
      .eq('id', caixa.id);

    setCaixa({ ...caixa, saldo_final_calculado: resumo.saldoFinalCalculado });
  }, [caixa, movimentos]);

  const fecharCaixa = useCallback(async (saldoFinalConferido: number, fechadoPor: string, observacoes?: string) => {
    if (!caixa) throw new Error('Caixa não carregado.');

    const resumo = calcularResumoCaixa(caixa, movimentos);
    setSaving(true);
    const { data, error: updateError } = await supabase
      .from('caixas_diarios')
      .update({
        status: 'fechado',
        saldo_final_calculado: resumo.saldoFinalCalculado,
        saldo_final_conferido: saldoFinalConferido,
        fechado_por: fechadoPor,
        fechado_em: new Date().toISOString(),
        observacoes: observacoes || null,
      })
      .eq('id', caixa.id)
      .select('*')
      .single();

    setSaving(false);
    if (updateError) throw updateError;
    setCaixa(data as CaixaDiario);
    return data as CaixaDiario;
  }, [caixa, movimentos]);

  return {
    caixa,
    movimentos,
    resumo: useMemo(() => calcularResumoCaixa(caixa, movimentos), [caixa, movimentos]),
    loading,
    saving,
    error,
    carregar,
    abrirCaixa,
    adicionarMovimento,
    excluirMovimento,
    fecharCaixa,
  };
}
```

- [ ] **Step 2: Run TypeScript build after hook**

Run:

```powershell
npm run build
```

Expected:

- Build completes.
- Existing warnings are acceptable only if they match prior Vite/Recharts chunk warnings.

## Task 5: Add Caixa UI Components

**Files:**
- Create: `src/components/App/Administrativo/CaixaFinanceiro/CaixaResumoCards.tsx`
- Create: `src/components/App/Administrativo/CaixaFinanceiro/CaixaMovimentacoesTable.tsx`
- Create: `src/components/App/Administrativo/CaixaFinanceiro/CaixaMovimentacaoForm.tsx`
- Create: `src/components/App/Administrativo/CaixaFinanceiro/CaixaWhatsAppPreview.tsx`
- Create: `src/components/App/Administrativo/CaixaFinanceiro/CaixaFinanceiroTab.tsx`
- Create: `src/components/App/Administrativo/CaixaFinanceiro/index.ts`

- [ ] **Step 1: Implement summary cards**

Create `CaixaResumoCards.tsx` with five compact cards:

- Saldo inicial cofre.
- Entradas dinheiro.
- Saidas dinheiro.
- Saldo final previsto.
- Vendas do dia.

Use existing card density from Administrativo. Use icons from `lucide-react`: `Wallet`, `ArrowDownCircle`, `ArrowUpCircle`, `CheckCircle2`, `Receipt`.

- [ ] **Step 2: Implement movement table**

Create `CaixaMovimentacoesTable.tsx` with columns:

- Tipo.
- Ambiente.
- Descrição.
- Forma.
- Categoria.
- Valor.
- Responsável.
- Ações.

Rows should use green for entry, red for exit, restrained badges, and no nested cards.

- [ ] **Step 3: Implement movement form**

Create `CaixaMovimentacaoForm.tsx` with:

- segmented/select for `ambiente`: `cofre`, `venda`;
- segmented/select for `tipo`: `entrada`, `saida`;
- select for `forma_pagamento`;
- select for `categoria`;
- numeric money input for `valor`;
- text input for `descricao`;
- text input for `responsavel`;
- submit button with icon.

Validation before submit:

```ts
if (valor <= 0) return 'Informe um valor maior que zero.';
if (descricao.trim().length < 3) return 'Descreva o motivo da movimentação.';
if (ambiente === 'cofre' && forma_pagamento !== 'dinheiro') {
  return 'Caixa-cofre físico deve usar forma dinheiro.';
}
```

- [ ] **Step 4: Implement WhatsApp preview**

Create `CaixaWhatsAppPreview.tsx` using `formatarRelatorioCaixaWhatsApp`. Include:

- preview in monospace block;
- copy button;
- dry-run/send button;
- disabled state when no `caixa` exists;
- warning when finance group JID is not configured.

- [ ] **Step 5: Implement main tab**

Create `CaixaFinanceiroTab.tsx` to:

- receive `unidadeId`, `unidadeNome`, `unidadeCodigo`, and `dataCaixa`;
- call `useCaixaDiario`;
- show opening form if no daily caixa exists;
- show cards, form, table, close controls, and preview after caixa exists;
- prevent editing if `caixa.status === 'fechado'`;
- show `Aberto` or `Fechado` badge.

- [ ] **Step 6: Add barrel export**

Create `index.ts`:

```ts
export { CaixaFinanceiroTab } from './CaixaFinanceiroTab';
```

- [ ] **Step 7: Build after UI components**

Run:

```powershell
npm run build
```

Expected:

- Build completes.

## Task 6: Wire Caixa Tab Into Administrativo

**Files:**
- Modify: `src/components/App/Administrativo/AdministrativoPage.tsx`

- [ ] **Step 1: Import new tab**

Add:

```ts
import { CaixaFinanceiroTab } from './CaixaFinanceiro';
```

- [ ] **Step 2: Extend main tab type**

Change the main tab union from:

```ts
'lancamentos' | 'fideliza' | 'lojinha' | 'farmer' | 'caixa_entrada'
```

to:

```ts
'lancamentos' | 'fideliza' | 'lojinha' | 'farmer' | 'caixa_financeiro' | 'caixa_entrada'
```

- [ ] **Step 3: Add tab definition**

Add a new tab before `Caixa de Entrada`:

```tsx
{
  id: 'caixa_financeiro',
  label: 'Caixa',
  shortLabel: 'Caixa',
  icon: Wallet,
}
```

Change existing `Caixa de Entrada` short label:

```tsx
shortLabel: 'Entrada'
```

- [ ] **Step 4: Render tab content**

Add branch:

```tsx
{mainTab === 'caixa_financeiro' && (
  <CaixaFinanceiroTab
    unidadeId={unidade}
    unidadeNome={nomeUnidadeSelecionada}
    unidadeCodigo={codigoUnidadeSelecionada}
    dataCaixa={dataSelecionadaISO}
  />
)}
```

Use existing page variables for selected unit/date. If the file currently has a formatted month but not an ISO date, create:

```ts
const dataSelecionadaISO = useMemo(() => {
  const today = new Date();
  const target = new Date(anoSelecionado, mesSelecionado - 1, today.getDate());
  return target.toISOString().slice(0, 10);
}, [anoSelecionado, mesSelecionado]);
```

For Phase 1, the date must default to today when the selected month is current. If the user selects a historical month, show a message inside the Caixa tab: "Caixa diario usa data operacional do dia. Selecione o mes atual para lançar fechamento."

- [ ] **Step 5: Keep report button scoped**

Do not reuse the existing `Gerar Relatório WhatsApp` button from `lancamentos`. The Caixa tab has its own preview/send controls.

- [ ] **Step 6: Build**

Run:

```powershell
npm run build
```

Expected:

- Build completes.
- Existing tab names still render.

## Task 7: Add Manual WhatsApp Edge Function

**Files:**
- Create: `supabase/functions/caixa-financeiro-whatsapp/index.ts`

- [ ] **Step 1: Create Edge Function**

Create `supabase/functions/caixa-financeiro-whatsapp/index.ts`. It must:

- Accept `caixa_diario_id`.
- Accept `modo: 'dry_run' | 'send'`.
- Accept optional `numero_teste`.
- Fetch caixa, movements, unit, and finance group JID.
- Format using the same message shape as frontend.
- In `dry_run`, return `{ ok: true, texto }`.
- In `send`, send to `numero_teste` when provided; otherwise send to configured group JID.
- Update `caixas_diarios.ultimo_envio_whatsapp_*` after send.

Use the same WhatsApp credential/provider pattern already present in `supabase/functions/relatorio-admin-whatsapp/index.ts`.

- [ ] **Step 2: Check function locally**

Run:

```powershell
deno check supabase/functions/caixa-financeiro-whatsapp/index.ts
```

Expected:

- Type check passes.

- [ ] **Step 3: Deploy only after explicit approval**

Run only after user approval:

```powershell
supabase functions deploy caixa-financeiro-whatsapp
```

Expected:

- Function deploys to the active Supabase project.
- Confirm active project before deploy is `ouqwbbermlzqqvtqwlul`.

## Task 8: Add Git Hygiene for Mockups

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Ignore brainstorm runtime artifacts**

Add:

```gitignore
.superpowers/
```

- [ ] **Step 2: Confirm mockups are ignored**

Run:

```powershell
git status -sb
```

Expected:

- `.superpowers/` does not appear as untracked.
- The approved spec and implementation plan remain tracked candidates under `docs/superpowers`.

## Task 9: Visual QA in Simple Browser

**Files:**
- No code changes unless QA finds a defect.

- [ ] **Step 1: Start app**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

Expected:

- Vite prints a local URL.

- [ ] **Step 2: Open app in Simple Browser**

Navigate Simple Browser to the Vite local URL.

Expected:

- App loads.
- User is logged in or can use the existing session.

- [ ] **Step 3: Validate Campo Grande manual scenario**

Use selected unit Campo Grande and current date:

1. Open `Administrativo > Caixa`.
2. Open daily caixa with saldo inicial `775,77`.
3. Add entrada cofre dinheiro `80,00`, descrição `venda lojinha - camiseta`.
4. Add saída cofre dinheiro `100,00`, descrição `Segurança (Pagamento semanal do dia 27/05)`.
5. Add saída cofre dinheiro `100,00`, descrição `Segurança (Pagamento semanal 02/06)`.
6. Add venda pix `100,00`, descrição `Venda lojinha - palheta/cabo`.

Expected:

- Saldo inicial: `R$ 775,77`.
- Entradas dinheiro cofre: `R$ 80,00`.
- Saídas dinheiro cofre: `R$ 200,00`.
- Saldo final previsto: `R$ 655,77`.
- Vendas Pix: `R$ 100,00`.
- Pix sale does not alter saldo final do cofre.

- [ ] **Step 4: Validate WhatsApp preview**

Expected preview contains:

```text
*FECHAMENTO DE CAIXA DE CAMPO GRANDE*
📆
💰 *Caixa Cofre Dinheiro - CG*
🟢 *Entrada do dia:*
🔴 *Saida do dia:*
🧾 *Vendas / Caixa Diario:*
✅ *Saldo final caixa dia
Conferido por:
_Gerado pelo LA Report_
```

Expected:

- `_Gerado pelo LA Report_` appears once.
- Sections are visually readable.

- [ ] **Step 5: Validate closed state**

Close the caixa with:

- `saldo_final_conferido = 655.77`
- `fechado_por = Gabriela`

Expected:

- Status badge changes to `Fechado`.
- Add/delete movement controls are disabled.
- Preview remains visible.

## Task 10: Post-Implementation Database QA

**Files:**
- No file changes.

- [ ] **Step 1: Verify no KPI/snapshot changes**

Run SELECT-only:

```sql
select count(*) as competencias_maio_fechadas
from public.competencias_mensais
where ano = 2026 and mes = 5 and status = 'fechado';

select count(*) as dados_mensais_alterados_hoje
from public.audit_log
where tabela = 'dados_mensais'
  and created_at::date = current_date;
```

Expected:

- No unexpected `dados_mensais` audit activity caused by Caixa work.

- [ ] **Step 2: Verify Caixa rows**

Run:

```sql
select c.id, u.nome as unidade, c.data_caixa, c.status, c.saldo_inicial_cofre,
       c.saldo_final_calculado, c.saldo_final_conferido, c.fechado_por
from public.caixas_diarios c
join public.unidades u on u.id = c.unidade_id
order by c.created_at desc
limit 10;

select ambiente, tipo, forma_pagamento, categoria, descricao, valor
from public.caixa_movimentacoes
order by created_at desc
limit 20;
```

Expected:

- Rows match the manual QA scenario.

## Task 11: Commit and Push

**Files:**
- All files touched by this plan.

- [ ] **Step 1: Check remote first**

Run:

```powershell
git fetch origin
git status -sb
git log --oneline --decorate --max-count=5
```

Expected:

- Branch is either up to date or can fast-forward cleanly.

- [ ] **Step 2: Pull if remote moved**

Run:

```powershell
git pull --ff-only
```

Expected:

- Fast-forward or already up to date.

- [ ] **Step 3: Build one last time**

Run:

```powershell
npm run build
```

Expected:

- Build passes.

- [ ] **Step 4: Commit**

Run:

```powershell
git add .gitignore docs/superpowers/plans/2026-06-10-caixa-diario-cofre-admin.md docs/superpowers/specs/2026-06-10-caixa-diario-cofre-admin-design.md supabase/migrations/20260610_caixa_diario_cofre_admin.sql src/types/caixa.ts src/lib/caixaFinanceiro.ts src/hooks/useCaixaDiario.ts src/components/App/Administrativo/AdministrativoPage.tsx src/components/App/Administrativo/CaixaFinanceiro supabase/functions/caixa-financeiro-whatsapp
git commit -m "feat: add manual caixa diario workflow"
```

Expected:

- Commit succeeds.

- [ ] **Step 5: Push**

Run:

```powershell
git push origin main
```

Expected:

- Push succeeds.

## Rollback Plan

Preferred rollback if UI causes trouble after deployment:

1. Hide the `Caixa` tab in `AdministrativoPage.tsx`.
2. Keep tables intact to avoid losing any entered operational cash records.
3. Redeploy frontend.

Database rollback only before real operational use:

```sql
drop table if exists public.caixa_movimentacoes cascade;
drop table if exists public.caixas_diarios cascade;
drop table if exists public.caixa_financeiro_grupos_whatsapp cascade;
drop function if exists public.set_updated_at_caixa() cascade;
```

After any real caixa record is entered, do not drop tables without exporting records and getting explicit approval.

## Self-Review

Spec coverage:

- Manual daily cash opening: Task 4 and Task 5.
- Cash-safe entries/exits: Task 2, Task 3, Task 5.
- Sales/payment summary: Task 3 and Task 5.
- WhatsApp preview/manual send: Task 3, Task 5, Task 7.
- Per-unit finance group JID: Task 2 and Task 7.
- No CSV import: stated out of scope and not included in tasks.
- No automatic send: stated out of scope and not included in tasks.
- Visual validation with Simple Browser: Task 9.

Deprecation impact:

- This feature adds new operational tables only.
- It does not deprecate existing financeiro/lojinha/report objects.
- Deprecation discussion remains separate after Caixa is validated in production.
