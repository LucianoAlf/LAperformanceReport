# Fechamento Mensal Canonico Junho 2026 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preservar Junho/2026 como retrato historico confiavel do LA Report, cobrindo alunos, matriculas, comercial, administrativo, renovacoes, retencao, professores, metas e relatorios, sem deixar writers legados sobrescreverem os numeros canonicos na virada para Julho.

**Architecture:** Primeiro inventariar tabelas/RPCs canonicas existentes para evitar duplicar arquitetura. Depois criar ou reaproveitar uma camada imutavel de fechamento mensal por dominio de relatorio, com preview read-only, gravacao aprovada, hash de payload e auditoria. `dados_mensais` fica apenas como camada de compatibilidade para telas antigas, alimentada a partir do snapshot aprovado, nunca por calculo legado direto.

**Tech Stack:** Supabase/Postgres/PLpgSQL, Supabase Edge Functions Deno, React/Vite/TypeScript, RPCs existentes do LA Report.

---

## Principios De Fechamento

- Junho/2026 nao deve ser recalculado por `snapshot_dados_mensais`, `fechar_dados_mensais` ou `recalcular_dados_mensais` sem guardas novas.
- `dados_mensais` nao comporta o retrato completo de todos os departamentos; ela guarda apenas KPI mensal compacto.
- O retrato oficial precisa ser por dominio: `alunos_admin`, `alunos_executivo`, `comercial`, `retencao`, `renovacoes`, `professores`, `relatorio_admin`, `relatorio_gerencial`, `relatorio_coordenacao`, `metas`.
- Todo fechamento precisa ter preview antes de gravar.
- Toda gravacao precisa ter hash, autor, data/hora e status.
- O front nao deve fazer fallback silencioso para calculo vivo quando o usuario filtrar mes historico fechado.
- Julho pode continuar vivo; Junho fechado precisa voltar sempre o mesmo retrato.
- Nenhuma tabela nova deve ser criada antes do inventario confirmar que nao existe tabela/RPC canonica equivalente.
- Programas com historico proprio entram no fechamento como dominio proprio, nao escondidos dentro de um payload generico.

## Decisoes Canonicas Para Junho

- Alunos ativos/pagantes/trancados administrativos: fonte principal `get_kpis_alunos_admin_operacional`.
- KPIs executivos, ticket medio, faturamento previsto, bolsistas: fonte principal `get_kpis_alunos_canonicos`.
- Comercial: fonte principal `get_kpis_comercial_canonicos_v2`.
- Relatorio administrativo diario: fonte principal `relatorio-admin-whatsapp`/RPCs internas atuais, mas gravada como payload textual e estruturado no fechamento.
- Relatorio gerencial: fonte principal `get_dados_relatorio_gerencial`.
- Relatorio coordenacao/professores: fonte principal `get_dados_relatorio_coordenacao`, views/RPCs de professores atuais e carteiras canonicas.
- Programa Matriculador+ LA: fonte viva `get_programa_matriculador_dados`; destino historico existente `programa_matriculador_historico`, atualmente vazio em producao.
- Programa Fideliza+ LA: fonte viva `get_programa_fideliza_dados`; destino historico existente `programa_fideliza_historico`, atualmente vazio em producao.
- Metas: fontes de configuracao/referencia incluem `metas`, `metas_kpi`, `simulacoes_metas`, `programa_matriculador_config` e `programa_fideliza_config`; fechamento deve capturar resultado contra meta vigente, nao sobrescrever metas.
- Financeiro realizado com juros/multa: nao entra como realizado oficial enquanto o Emusys nao liberar endpoint de faturas. Para Junho, registrar como `financeiro_realizado_disponivel=false` e manter `faturamento_previsto/parcela_canonica`.

## Arquivos

- Create: `supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql`
- Create: `src/lib/fechamentoMensal.ts`
- Create: `src/hooks/useFechamentoMensal.ts`
- Modify: `src/hooks/useKPIsAlunosCanonicos.ts`
- Modify: `src/hooks/useDadosHistoricos.ts`
- Modify: `src/hooks/useDadosMensais.ts`
- Modify: `src/hooks/useKPIsGestao.ts`
- Modify: `src/components\App\Dashboard\DashboardPage.tsx`
- Modify: `src/components\GestaoMensal\TabGestao.tsx`
- Modify: `src/components\App\Administrativo\ModalRelatorio.tsx`
- Modify: `src/components\App\Professores\ModalRelatorioCoordenacao.tsx`
- Modify: `supabase/functions/relatorio-admin-whatsapp/index.ts`
- Modify: `supabase/functions/gemini-relatorio-gerencial/index.ts`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`
- Optional Create: `docs/operacional/fechamento-mensal-junho-2026.md`

---

### Task 0: Inventario Canonico Antes De Criar Arquitetura

**Files:**
- Create: `docs/superpowers/plans/2026-06-30-fechamento-junho-canonico-inventario.txt`
- Create: `docs/superpowers/plans/2026-06-30-fechamento-junho-canonico-classificacao.md`
- Modify: `docs/superpowers/plans/2026-06-30-fechamento-junho-canonico.md`

- [x] **Step 1: Mapear tabelas candidatas de fechamento/historico/metas/programas**

Run via Supabase MCP SQL:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name ilike '%mensal%'
    or table_name ilike '%competencia%'
    or table_name ilike '%snapshot%'
    or table_name ilike '%historico%'
    or table_name ilike '%meta%'
    or table_name ilike '%matriculador%'
    or table_name ilike '%fideliza%'
    or table_name ilike '%relatorio%'
  )
order by table_name;
```

Expected:

```text
Lista completa para decidir se criaremos tabela nova ou reaproveitaremos estrutura existente.
```

- [x] **Step 2: Mapear RPCs candidatas de fechamento e programas**

Run via Supabase MCP SQL:

```sql
select n.nspname as schema, p.proname as function_name, pg_get_function_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%dados_mensais%'
    or p.proname ilike '%competencia%'
    or p.proname ilike '%snapshot%'
    or p.proname ilike '%fech%'
    or p.proname ilike '%meta%'
    or p.proname ilike '%matriculador%'
    or p.proname ilike '%fideliza%'
    or p.proname ilike '%relatorio%'
  )
order by p.proname;
```

Expected:

```text
Lista das funcoes existentes, separando canonicas, wrappers e legadas.
```

- [x] **Step 3: Mapear consumidores no codigo**

Run:

```powershell
rg -n "dados_mensais|competencias_mensais|programa_matriculador|fideliza|metas_kpi|simulacoes_metas|get_programa_matriculador_dados|get_dados_relatorio|get_kpis" -S src supabase | Out-File -Encoding utf8 .\docs\superpowers\plans\2026-06-30-fechamento-junho-canonico-inventario.txt
```

Expected:

```text
Arquivo de inventario gerado com consumidores de historico, metas e programas.
```

- [x] **Step 4: Classificar cada fonte**

Classificacao criada em:

```text
docs/superpowers/plans/2026-06-30-fechamento-junho-canonico-classificacao.md
```

Formato usado:

```text
Nome | Tipo | Area | Fonte canonica? | Legado? | Quem consome | Pode escrever Junho? | Acao
```

Classificacao obrigatoria:

```text
dados_mensais | tabela | historico compacto | compatibilidade | sim/parcial | dashboards/hooks antigos | somente via snapshot aprovado | manter como compatibilidade
competencias_mensais | tabela | governanca | sim | nao | hooks de competencia | sim, apenas fechamento | manter
programa_matriculador_historico | tabela | Matriculador+ LA | a confirmar | nao presumir | programa comercial | nao ate auditar | inventariar
programa_fideliza_config/historico | tabela/RPC | Fideliza+ LA | a confirmar | nao presumir | administrativo/retencao | nao ate auditar | inventariar
metas/metas_kpi/simulacoes_metas | tabelas | metas | a confirmar por tela | misto | dashboard/gerencial/IA | nao ate auditar | mapear dono
relatorios_diarios | tabela | relatorios | nao confirmada | possivelmente vazia | a confirmar | nao ate auditar | verificar uso real
```

- [x] **Step 5: Decidir se a tabela nova e necessaria**

Decision rule:

```text
Se ja existir uma tabela canonica que armazena payload mensal por unidade, dominio, status, hash e auditoria, reaproveitar.
Se nao existir, criar fechamento_mensal_snapshots.
```

Resultado da Task 0:

```text
Nao existe hoje uma estrutura preenchida que preserve Junho completo.
dados_mensais existe, mas e compacto e esta incompleto para Junho.
programa_matriculador_historico e programa_fideliza_historico existem, mas estao vazios.
relatorios_diarios existe, mas esta vazio.
competencias_mensais existe, mas Junho ainda nao foi fechado.
Proxima etapa: Task 1 deve gerar baseline/preview read-only antes de qualquer escrita.
```

- [ ] **Step 6: Commit**

```powershell
git add docs/superpowers/plans/2026-06-30-fechamento-junho-canonico-inventario.txt docs/superpowers/plans/2026-06-30-fechamento-junho-canonico-classificacao.md docs/superpowers/plans/2026-06-30-fechamento-junho-canonico.md
git commit -m "docs: add canonical monthly closing inventory"
```

---

### Task 1: Baseline Read-Only Antes De Qualquer Mudanca

**Files:**
- Create: `docs/superpowers/plans/2026-06-30-fechamento-junho-canonico-baseline-readonly.md`
- Modify: `docs/superpowers/plans/2026-06-30-fechamento-junho-canonico.md`

- [x] **Step 1: Confirmar branch e worktree**

Run:

```powershell
git fetch origin
git status --short --branch
git log --oneline --decorate -5
```

Expected:

```text
Branch main visivel, diferencas locais listadas, sem merge conflict.
```

- [x] **Step 2: Confirmar que nao ha cron direto de snapshot**

Run via Supabase MCP SQL:

```sql
select jobid, jobname, schedule, command, active
from cron.job
where command ilike any (array[
  '%dados_mensais%',
  '%snapshot%',
  '%fechar%',
  '%recalcular%',
  '%competencia%'
])
order by jobid;
```

Expected:

```text
Nenhum job direto chamando snapshot/recalculo/fechamento mensal.
```

- [x] **Step 3: Salvar baseline vivo Junho/2026 por unidade**

Run via Supabase MCP SQL:

```sql
select 'admin_operacional' as fonte, *
from public.get_kpis_alunos_admin_operacional(null, 2026, 6);

select 'alunos_canonicos' as fonte, *
from public.get_kpis_alunos_canonicos(null, 2026, 6);

select 'comercial' as fonte, public.get_kpis_comercial_canonicos_v2(null, 2026, 6, 'mensal', null);
```

Expected:

```text
Linhas retornadas para Barra, Campo Grande e Recreio sem erro.
```

- [x] **Step 4: Registrar diferenca entre vivo e dados_mensais**

Run via Supabase MCP SQL:

```sql
select u.nome as unidade, dm.*
from public.dados_mensais dm
join public.unidades u on u.id = dm.unidade_id
where dm.ano = 2026 and dm.mes = 6
order by u.nome;
```

Expected:

```text
Confirmar que dados_mensais de Junho nao e fonte oficial antes da correcao.
```

Resultado registrado em:

```text
docs/superpowers/plans/2026-06-30-fechamento-junho-canonico-baseline-readonly.md
```

Achados que bloqueiam escrita imediata:

```text
Fonte administrativa e fonte executiva concordam em ativos/pagantes, mas divergem em matriculas/banda para Campo Grande e Recreio.
Fonte executiva retorna tempo_permanencia/ltv_medio como 0.
dados_mensais de Junho esta incompleto/antigo e nao tem Barra.
```

- [ ] **Step 5: Commit**

No commit for Task 1 because it is read-only.

---

### Task 2: Definir/Reaproveitar Destinos Imutaveis De Fechamento

**Files:**
- Modify/Create only if justified after Task 1: `supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql`

- [ ] **Step 0: Confirmar necessidade antes de criar tabela nova**

Use a classificacao da Task 0 e o baseline da Task 1.

Expected:

```text
Reaproveitar `dados_mensais` para KPIs compactos.
Reaproveitar `programa_matriculador_historico` para Matriculador+.
Reaproveitar `programa_fideliza_historico` para Fideliza+.
Criar `fechamento_mensal_snapshots` somente se faltar retrato completo/auditavel para relatorios, listas, hashes e dominios que nao cabem nas tabelas existentes.
```

- [ ] **Step 1: Se necessario, escrever migration com tabelas de snapshot e auditoria**

Add this SQL to `supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql`:

```sql
create extension if not exists pgcrypto;

create table if not exists public.fechamento_mensal_snapshots (
  id uuid primary key default gen_random_uuid(),
  ano integer not null check (ano between 2020 and 2100),
  mes integer not null check (mes between 1 and 12),
  unidade_id uuid not null references public.unidades(id),
  dominio text not null check (dominio in (
    'alunos_admin',
    'alunos_executivo',
    'comercial',
    'retencao',
    'renovacoes',
    'professores',
    'relatorio_admin',
    'relatorio_gerencial',
    'relatorio_coordenacao',
    'metas',
    'programa_matriculador',
    'programa_fideliza',
    'compatibilidade_dados_mensais'
  )),
  versao integer not null default 1 check (versao > 0),
  status text not null default 'preview' check (status in ('preview', 'aprovado', 'fechado', 'retificado')),
  fonte text not null,
  payload jsonb not null,
  payload_hash text not null,
  financeiro_realizado_disponivel boolean not null default false,
  observacao text,
  capturado_em timestamptz not null default now(),
  capturado_por uuid,
  aprovado_em timestamptz,
  aprovado_por uuid,
  fechado_em timestamptz,
  fechado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ano, mes, unidade_id, dominio, versao)
);

create index if not exists idx_fechamento_mensal_snapshots_lookup
  on public.fechamento_mensal_snapshots (ano, mes, unidade_id, dominio, status);

create table if not exists public.fechamento_mensal_auditoria (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid references public.fechamento_mensal_snapshots(id),
  ano integer not null,
  mes integer not null,
  unidade_id uuid,
  acao text not null check (acao in (
    'preview_gerado',
    'snapshot_gravado',
    'snapshot_aprovado',
    'snapshot_fechado',
    'compatibilidade_dados_mensais_atualizada',
    'writer_legado_bloqueado',
    'retificacao_solicitada'
  )),
  detalhes jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

alter table public.fechamento_mensal_snapshots enable row level security;
alter table public.fechamento_mensal_auditoria enable row level security;

drop policy if exists fechamento_mensal_snapshots_select_auth on public.fechamento_mensal_snapshots;
create policy fechamento_mensal_snapshots_select_auth
on public.fechamento_mensal_snapshots
for select
to authenticated
using (true);

drop policy if exists fechamento_mensal_auditoria_select_auth on public.fechamento_mensal_auditoria;
create policy fechamento_mensal_auditoria_select_auth
on public.fechamento_mensal_auditoria
for select
to authenticated
using (true);

comment on table public.fechamento_mensal_snapshots is
  'Snapshot mensal imutavel por dominio do LA Report. Fonte oficial para competencias fechadas.';

comment on table public.fechamento_mensal_auditoria is
  'Auditoria das acoes de preview, aprovacao, fechamento e compatibilidade mensal.';
```

- [ ] **Step 2: Rodar lint visual da migration**

Run:

```powershell
Get-Content .\supabase\migrations\20260630_p09_fechamento_mensal_canonico.sql | Select-String -Pattern "TODO|TBD|NAO_APLICAR"
```

Expected:

```text
No output.
```

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql
git commit -m "feat: add canonical monthly closing snapshot tables"
```

---

### Task 3: Criar RPC De Preview Read-Only

**Files:**
- Modify: `supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql`

- [ ] **Step 1: Adicionar funcao de hash canonico**

Append:

```sql
create or replace function public.hash_jsonb_canonico(p_payload jsonb)
returns text
language sql
stable
as $$
  select encode(digest(coalesce(p_payload, '{}'::jsonb)::text, 'sha256'), 'hex');
$$;

revoke all on function public.hash_jsonb_canonico(jsonb) from public, anon;
grant execute on function public.hash_jsonb_canonico(jsonb) to authenticated, service_role;
```

- [ ] **Step 2: Adicionar RPC de preview**

Append:

```sql
create or replace function public.gerar_preview_fechamento_mensal(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidade record;
  v_item jsonb;
  v_result jsonb := '[]'::jsonb;
  v_admin jsonb;
  v_executivo jsonb;
  v_comercial jsonb;
  v_gerencial jsonb;
  v_coordenacao jsonb;
begin
  if p_ano is null or p_mes is null or p_mes < 1 or p_mes > 12 then
    raise exception 'Competencia invalida: ano %, mes %', p_ano, p_mes;
  end if;

  for v_unidade in
    select id, nome
    from public.unidades
    where ativo = true
      and (p_unidade_id is null or id = p_unidade_id)
    order by nome
  loop
    select to_jsonb(k)
    into v_admin
    from public.get_kpis_alunos_admin_operacional(v_unidade.id, p_ano, p_mes) k
    limit 1;

    select to_jsonb(k)
    into v_executivo
    from public.get_kpis_alunos_canonicos(v_unidade.id, p_ano, p_mes) k
    limit 1;

    v_comercial := public.get_kpis_comercial_canonicos_v2(v_unidade.id, p_ano, p_mes, 'mensal', null);

    v_gerencial := public.get_dados_relatorio_gerencial(v_unidade.id, p_ano, p_mes);

    v_coordenacao := public.get_dados_relatorio_coordenacao(v_unidade.id, p_ano, p_mes);

    v_item := jsonb_build_object(
      'unidade_id', v_unidade.id,
      'unidade_nome', v_unidade.nome,
      'ano', p_ano,
      'mes', p_mes,
      'dominios', jsonb_build_object(
        'alunos_admin', jsonb_build_object(
          'fonte', 'get_kpis_alunos_admin_operacional',
          'payload', coalesce(v_admin, '{}'::jsonb),
          'hash', public.hash_jsonb_canonico(coalesce(v_admin, '{}'::jsonb))
        ),
        'alunos_executivo', jsonb_build_object(
          'fonte', 'get_kpis_alunos_canonicos',
          'payload', coalesce(v_executivo, '{}'::jsonb),
          'hash', public.hash_jsonb_canonico(coalesce(v_executivo, '{}'::jsonb))
        ),
        'comercial', jsonb_build_object(
          'fonte', 'get_kpis_comercial_canonicos_v2',
          'payload', coalesce(v_comercial, '{}'::jsonb),
          'hash', public.hash_jsonb_canonico(coalesce(v_comercial, '{}'::jsonb))
        ),
        'relatorio_gerencial', jsonb_build_object(
          'fonte', 'get_dados_relatorio_gerencial',
          'payload', coalesce(v_gerencial, '{}'::jsonb),
          'hash', public.hash_jsonb_canonico(coalesce(v_gerencial, '{}'::jsonb))
        ),
        'relatorio_coordenacao', jsonb_build_object(
          'fonte', 'get_dados_relatorio_coordenacao',
          'payload', coalesce(v_coordenacao, '{}'::jsonb),
          'hash', public.hash_jsonb_canonico(coalesce(v_coordenacao, '{}'::jsonb))
        )
      )
    );

    v_result := v_result || jsonb_build_array(v_item);
  end loop;

  return jsonb_build_object(
    'ano', p_ano,
    'mes', p_mes,
    'gerado_em', now(),
    'financeiro_realizado_disponivel', false,
    'observacao_financeira', 'Sem endpoint de faturas Emusys; valores de Junho usam parcela canonica/faturamento previsto.',
    'unidades', v_result
  );
end;
$$;

revoke all on function public.gerar_preview_fechamento_mensal(integer, integer, uuid) from public, anon;
grant execute on function public.gerar_preview_fechamento_mensal(integer, integer, uuid) to authenticated, service_role;
```

- [ ] **Step 3: Verificar preview sem escrever snapshot**

Run via MCP after applying migration:

```sql
select public.gerar_preview_fechamento_mensal(2026, 6, null);
```

Expected:

```text
JSON com tres unidades e dominios alunos_admin, alunos_executivo, comercial, relatorio_gerencial e relatorio_coordenacao.
```

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql
git commit -m "feat: add read-only monthly closing preview"
```

---

### Task 4: Criar RPC De Gravacao Aprovada Do Snapshot

**Files:**
- Modify: `supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql`

- [ ] **Step 1: Adicionar RPC que grava somente a partir do preview atual**

Append:

```sql
create or replace function public.gravar_snapshot_fechamento_mensal(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview jsonb;
  v_unidade jsonb;
  v_dominio_key text;
  v_dominio jsonb;
  v_unidade_id uuid;
  v_inserted integer := 0;
  v_snapshot_id uuid;
begin
  if p_ano = extract(year from current_date)::integer
     and p_mes = extract(month from current_date)::integer then
    raise exception 'Use esta funcao apenas no ritual de fechamento aprovado. Para mes corrente, gere preview e aprove manualmente antes.';
  end if;

  v_preview := public.gerar_preview_fechamento_mensal(p_ano, p_mes, p_unidade_id);

  for v_unidade in select * from jsonb_array_elements(v_preview -> 'unidades')
  loop
    v_unidade_id := (v_unidade ->> 'unidade_id')::uuid;

    for v_dominio_key, v_dominio in
      select key, value
      from jsonb_each(v_unidade -> 'dominios')
    loop
      insert into public.fechamento_mensal_snapshots (
        ano,
        mes,
        unidade_id,
        dominio,
        versao,
        status,
        fonte,
        payload,
        payload_hash,
        financeiro_realizado_disponivel,
        observacao,
        capturado_por,
        aprovado_em,
        aprovado_por
      )
      values (
        p_ano,
        p_mes,
        v_unidade_id,
        v_dominio_key,
        1,
        'aprovado',
        v_dominio ->> 'fonte',
        coalesce(v_dominio -> 'payload', '{}'::jsonb),
        v_dominio ->> 'hash',
        coalesce((v_preview ->> 'financeiro_realizado_disponivel')::boolean, false),
        p_observacao,
        auth.uid(),
        now(),
        auth.uid()
      )
      on conflict (ano, mes, unidade_id, dominio, versao)
      do update set
        status = excluded.status,
        fonte = excluded.fonte,
        payload = excluded.payload,
        payload_hash = excluded.payload_hash,
        financeiro_realizado_disponivel = excluded.financeiro_realizado_disponivel,
        observacao = excluded.observacao,
        aprovado_em = now(),
        aprovado_por = auth.uid(),
        updated_at = now()
      returning id into v_snapshot_id;

      insert into public.fechamento_mensal_auditoria (
        snapshot_id,
        ano,
        mes,
        unidade_id,
        acao,
        detalhes,
        actor_id
      )
      values (
        v_snapshot_id,
        p_ano,
        p_mes,
        v_unidade_id,
        'snapshot_gravado',
        jsonb_build_object('dominio', v_dominio_key, 'hash', v_dominio ->> 'hash'),
        auth.uid()
      );

      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'ano', p_ano,
    'mes', p_mes,
    'snapshots_gravados', v_inserted
  );
end;
$$;

revoke all on function public.gravar_snapshot_fechamento_mensal(integer, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.gravar_snapshot_fechamento_mensal(integer, integer, uuid, text) to service_role;
```

- [ ] **Step 2: Confirmar que authenticated nao executa gravacao**

Run via MCP:

```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'gravar_snapshot_fechamento_mensal'
order by grantee;
```

Expected:

```text
Apenas service_role com EXECUTE.
```

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql
git commit -m "feat: add approved monthly snapshot writer"
```

---

### Task 5: Compatibilidade Controlada Com dados_mensais

**Files:**
- Modify: `supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql`

- [ ] **Step 1: Adicionar RPC de compatibilidade**

Append:

```sql
create or replace function public.atualizar_dados_mensais_por_snapshot(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap record;
  v_payload jsonb;
  v_count integer := 0;
begin
  for v_snap in
    select s.*
    from public.fechamento_mensal_snapshots s
    where s.ano = p_ano
      and s.mes = p_mes
      and s.dominio = 'alunos_executivo'
      and s.status in ('aprovado', 'fechado')
      and (p_unidade_id is null or s.unidade_id = p_unidade_id)
  loop
    v_payload := v_snap.payload;

    insert into public.dados_mensais (
      unidade_id,
      ano,
      mes,
      alunos_ativos,
      alunos_pagantes,
      novas_matriculas,
      evasoes,
      churn_rate,
      ticket_medio,
      taxa_renovacao,
      faturamento_estimado,
      matriculas_banda,
      matriculas_2_curso,
      bolsistas_integrais,
      bolsistas_parciais,
      updated_at
    )
    values (
      v_snap.unidade_id,
      p_ano,
      p_mes,
      coalesce((v_payload ->> 'alunos_ativos')::integer, 0),
      coalesce((v_payload ->> 'alunos_pagantes')::integer, 0),
      coalesce((v_payload ->> 'novas_matriculas')::integer, 0),
      coalesce((v_payload ->> 'evasoes')::integer, 0),
      coalesce((v_payload ->> 'churn_rate')::numeric, 0),
      coalesce((v_payload ->> 'ticket_medio')::numeric, 0),
      coalesce((v_payload ->> 'taxa_renovacao')::numeric, 0),
      coalesce((v_payload ->> 'faturamento_estimado')::numeric, 0),
      coalesce((v_payload ->> 'matriculas_banda')::integer, 0),
      coalesce((v_payload ->> 'matriculas_2_curso')::integer, 0),
      coalesce((v_payload ->> 'bolsistas_integrais')::integer, 0),
      coalesce((v_payload ->> 'bolsistas_parciais')::integer, 0),
      now()
    )
    on conflict (unidade_id, ano, mes)
    do update set
      alunos_ativos = excluded.alunos_ativos,
      alunos_pagantes = excluded.alunos_pagantes,
      novas_matriculas = excluded.novas_matriculas,
      evasoes = excluded.evasoes,
      churn_rate = excluded.churn_rate,
      ticket_medio = excluded.ticket_medio,
      taxa_renovacao = excluded.taxa_renovacao,
      faturamento_estimado = excluded.faturamento_estimado,
      matriculas_banda = excluded.matriculas_banda,
      matriculas_2_curso = excluded.matriculas_2_curso,
      bolsistas_integrais = excluded.bolsistas_integrais,
      bolsistas_parciais = excluded.bolsistas_parciais,
      updated_at = now();

    insert into public.fechamento_mensal_auditoria (
      snapshot_id,
      ano,
      mes,
      unidade_id,
      acao,
      detalhes,
      actor_id
    )
    values (
      v_snap.id,
      p_ano,
      p_mes,
      v_snap.unidade_id,
      'compatibilidade_dados_mensais_atualizada',
      jsonb_build_object('dominio', 'alunos_executivo'),
      auth.uid()
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'linhas_atualizadas', v_count);
end;
$$;

revoke all on function public.atualizar_dados_mensais_por_snapshot(integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.atualizar_dados_mensais_por_snapshot(integer, integer, uuid) to service_role;
```

- [ ] **Step 2: Rodar comparativo antes/depois em ambiente controlado**

Run via MCP before calling the RPC:

```sql
select u.nome, dm.*
from public.dados_mensais dm
join public.unidades u on u.id = dm.unidade_id
where dm.ano = 2026 and dm.mes = 6
order by u.nome;
```

Expected:

```text
Guardar output no chat antes de atualizar compatibilidade.
```

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql
git commit -m "feat: add monthly snapshot compatibility updater"
```

---

### Task 6: Bloquear Writers Legados Perigosos

**Files:**
- Modify: `supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql`

- [ ] **Step 1: Remover execucao publica/autenticada dos writers legados**

Append:

```sql
do $$
begin
  if to_regprocedure('public.snapshot_dados_mensais(integer, integer)') is not null then
    revoke execute on function public.snapshot_dados_mensais(integer, integer) from public, anon, authenticated;
    grant execute on function public.snapshot_dados_mensais(integer, integer) to service_role;
  end if;

  if to_regprocedure('public.fechar_dados_mensais(integer, integer)') is not null then
    revoke execute on function public.fechar_dados_mensais(integer, integer) from public, anon, authenticated;
    grant execute on function public.fechar_dados_mensais(integer, integer) to service_role;
  end if;

  if to_regprocedure('public.recalcular_dados_mensais(integer, integer, uuid)') is not null then
    revoke execute on function public.recalcular_dados_mensais(integer, integer, uuid) from public, anon, authenticated;
    grant execute on function public.recalcular_dados_mensais(integer, integer, uuid) to service_role;
  end if;

  if to_regprocedure('public.upsert_dados_mensais(character varying, integer, integer, integer, integer, integer, numeric, numeric, numeric, integer, numeric, numeric)') is not null then
    revoke execute on function public.upsert_dados_mensais(character varying, integer, integer, integer, integer, integer, numeric, numeric, numeric, integer, numeric, numeric) from public, anon, authenticated;
    grant execute on function public.upsert_dados_mensais(character varying, integer, integer, integer, integer, integer, numeric, numeric, numeric, integer, numeric, numeric) to service_role;
  end if;
end $$;
```

- [ ] **Step 2: Verificar permissoes**

Run via MCP:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'snapshot_dados_mensais',
    'fechar_dados_mensais',
    'recalcular_dados_mensais',
    'upsert_dados_mensais'
  )
order by routine_name, grantee;
```

Expected:

```text
Nenhum anon/authenticated com EXECUTE nesses writers.
```

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260630_p09_fechamento_mensal_canonico.sql
git commit -m "chore: restrict legacy monthly writers"
```

---

### Task 7: Criar Cliente TypeScript Para Fechamento

**Files:**
- Create: `src/lib/fechamentoMensal.ts`

- [ ] **Step 1: Criar tipos e helpers**

Create `src/lib/fechamentoMensal.ts`:

```ts
import { supabase } from './supabase';

export type FechamentoDominio =
  | 'alunos_admin'
  | 'alunos_executivo'
  | 'comercial'
  | 'retencao'
  | 'renovacoes'
  | 'professores'
  | 'relatorio_admin'
  | 'relatorio_gerencial'
  | 'relatorio_coordenacao'
  | 'metas'
  | 'compatibilidade_dados_mensais';

export interface FechamentoSnapshot {
  id: string;
  ano: number;
  mes: number;
  unidade_id: string;
  dominio: FechamentoDominio;
  versao: number;
  status: 'preview' | 'aprovado' | 'fechado' | 'retificado';
  fonte: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  financeiro_realizado_disponivel: boolean;
  capturado_em: string;
  aprovado_em: string | null;
  fechado_em: string | null;
}

export async function listarSnapshotsFechamento(params: {
  ano: number;
  mes: number;
  unidadeId?: string | null;
  dominio?: FechamentoDominio | null;
}) {
  let query = supabase
    .from('fechamento_mensal_snapshots')
    .select('*')
    .eq('ano', params.ano)
    .eq('mes', params.mes)
    .in('status', ['aprovado', 'fechado'])
    .order('versao', { ascending: false });

  if (params.unidadeId) query = query.eq('unidade_id', params.unidadeId);
  if (params.dominio) query = query.eq('dominio', params.dominio);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FechamentoSnapshot[];
}

export async function buscarSnapshotFechamento(params: {
  ano: number;
  mes: number;
  unidadeId: string;
  dominio: FechamentoDominio;
}) {
  const rows = await listarSnapshotsFechamento({
    ano: params.ano,
    mes: params.mes,
    unidadeId: params.unidadeId,
    dominio: params.dominio,
  });

  return rows[0] ?? null;
}

export async function gerarPreviewFechamento(params: {
  ano: number;
  mes: number;
  unidadeId?: string | null;
}) {
  const { data, error } = await supabase.rpc('gerar_preview_fechamento_mensal', {
    p_ano: params.ano,
    p_mes: params.mes,
    p_unidade_id: params.unidadeId ?? null,
  });

  if (error) throw error;
  return data as Record<string, unknown>;
}
```

- [ ] **Step 2: Build**

Run:

```powershell
npm run build
```

Expected:

```text
Build completes without TypeScript errors.
```

- [ ] **Step 3: Commit**

```powershell
git add src/lib/fechamentoMensal.ts
git commit -m "feat: add monthly closing client helpers"
```

---

### Task 8: Ler Snapshot Em Filtros Historicos

**Files:**
- Modify: `src/hooks/useKPIsAlunosCanonicos.ts`
- Modify: `src/hooks/useDadosHistoricos.ts`
- Modify: `src/hooks/useDadosMensais.ts`
- Modify: `src/hooks/useKPIsGestao.ts`

- [ ] **Step 1: Em `useKPIsAlunosCanonicos`, consultar snapshot antes de `dados_mensais` para mes historico**

Implementation rule:

```ts
// Se competencia historica tem fechamento aprovado/fechado, usar snapshot.
// Se nao tem snapshot, usar dados_mensais apenas como compatibilidade.
// Se nao tem nenhum dos dois, retornar indisponivel. Nao calcular vivo silenciosamente.
```

- [ ] **Step 2: Em hooks historicos, preferir `fechamento_mensal_snapshots` dominio `alunos_executivo`**

Use:

```ts
import { buscarSnapshotFechamento } from '../lib/fechamentoMensal';
```

Expected behavior:

```text
Filtro Junho/2026 apos fechamento retorna payload do snapshot.
Filtro Julho/2026 enquanto aberto continua vivo.
Filtro Maio/2026 continua dados_mensais ate decidirmos backfill historico.
```

- [ ] **Step 3: Build**

Run:

```powershell
npm run build
```

Expected:

```text
Build OK.
```

- [ ] **Step 4: Commit**

```powershell
git add src/hooks/useKPIsAlunosCanonicos.ts src/hooks/useDadosHistoricos.ts src/hooks/useDadosMensais.ts src/hooks/useKPIsGestao.ts
git commit -m "feat: prefer monthly snapshots for closed historical filters"
```

---

### Task 9: Relatorios Historicos Devem Usar Snapshot

**Files:**
- Modify: `supabase/functions/relatorio-admin-whatsapp/index.ts`
- Modify: `supabase/functions/gemini-relatorio-gerencial/index.ts`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`
- Modify: `src/components\App\Administrativo\ModalRelatorio.tsx`
- Modify: `src/components\App\Professores\ModalRelatorioCoordenacao.tsx`

- [ ] **Step 1: Adicionar parametro `usar_snapshot_historico` nas chamadas de relatorio**

TypeScript request shape:

```ts
{
  unidade_id: string,
  ano: number,
  mes: number,
  usar_snapshot_historico: true
}
```

- [ ] **Step 2: Edge functions consultam snapshot quando o periodo nao e corrente**

Pseudo-implementation in each Edge:

```ts
const isCurrentMonth =
  ano === new Date().getFullYear() &&
  mes === new Date().getMonth() + 1;

if (!isCurrentMonth && usar_snapshot_historico) {
  const { data: snapshots, error } = await supabase
    .from('fechamento_mensal_snapshots')
    .select('*')
    .eq('ano', ano)
    .eq('mes', mes)
    .eq('unidade_id', unidade_id)
    .in('status', ['aprovado', 'fechado']);

  if (error) throw error;
  // montar relatorio a partir do dominio correspondente
}
```

- [ ] **Step 3: Sem snapshot, mostrar erro claro**

Error text:

```text
Competencia historica sem snapshot aprovado. Gere o fechamento mensal antes de emitir este relatorio.
```

- [ ] **Step 4: Build**

Run:

```powershell
npm run build
```

Expected:

```text
Build OK.
```

- [ ] **Step 5: Commit**

```powershell
git add supabase/functions/relatorio-admin-whatsapp/index.ts supabase/functions/gemini-relatorio-gerencial/index.ts supabase/functions/gemini-relatorio-coordenacao/index.ts src/components/App/Administrativo/ModalRelatorio.tsx src/components/App/Professores/ModalRelatorioCoordenacao.tsx
git commit -m "feat: use monthly snapshots for historical reports"
```

---

### Task 10: UI De Preview E Conferencia Do Fechamento

**Files:**
- Create: `src/hooks/useFechamentoMensal.ts`
- Modify: `src/components\GestaoMensal\TabGestao.tsx`

- [ ] **Step 1: Criar hook de preview**

Create `src/hooks/useFechamentoMensal.ts`:

```ts
import { useCallback, useState } from 'react';
import { gerarPreviewFechamento } from '../lib/fechamentoMensal';

export function useFechamentoMensal() {
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gerarPreview = useCallback(async (ano: number, mes: number, unidadeId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await gerarPreviewFechamento({ ano, mes, unidadeId });
      setPreview(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar preview de fechamento';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { preview, loading, error, gerarPreview };
}
```

- [ ] **Step 2: Em `TabGestao`, adicionar bloco de preview restrito**

Label:

```text
Preview de fechamento mensal
```

Description:

```text
Gera uma leitura read-only do retrato do mes antes de gravar snapshot. Nao altera dados.
```

- [ ] **Step 3: Botao de gravacao nao entra para equipe**

Rule:

```text
UI da equipe pode gerar preview e visualizar. Gravacao/aprovacao final fica fora do front comum e passa por service_role/MCP.
```

- [ ] **Step 4: Build**

Run:

```powershell
npm run build
```

Expected:

```text
Build OK.
```

- [ ] **Step 5: Commit**

```powershell
git add src/hooks/useFechamentoMensal.ts src/components/GestaoMensal/TabGestao.tsx
git commit -m "feat: add monthly closing preview UI"
```

---

### Task 11: Ritual Operacional De Fechamento Junho/2026

**Files:**
- Optional Create: `docs/operacional/fechamento-mensal-junho-2026.md`

- [ ] **Step 1: Gerar preview final em 30/06 depois do ultimo sync**

Run via MCP:

```sql
select public.gerar_preview_fechamento_mensal(2026, 6, null);
```

Expected:

```text
Preview com 3 unidades e hashes por dominio.
```

- [ ] **Step 2: Conferir numeros criticos com relatorios validados**

Checklist:

```text
Recreio admin operacional:
- Ativos 334
- Pagantes 323
- Matriculas ativas 417
- Banda 58
- 2o curso 25
- Novos 17

Barra admin operacional:
- Ativos 237
- Pagantes 235
- Matriculas ativas 263
- Banda 12
- 2o curso 14
- Novos 12
- Transferencias recebidas no mes 1

Campo Grande:
- Conferir contra CSV Emusys e lista validada manualmente antes de gravar.
```

- [ ] **Step 3: Gravar snapshot aprovado depois da validacao humana**

Run via MCP with service role:

```sql
select public.gravar_snapshot_fechamento_mensal(
  2026,
  6,
  null,
  'Fechamento Junho/2026 aprovado apos validacao operacional LA Report e Emusys.'
);
```

Expected:

```text
snapshots_gravados > 0.
```

- [ ] **Step 4: Atualizar dados_mensais de compatibilidade**

Run via MCP:

```sql
select public.atualizar_dados_mensais_por_snapshot(2026, 6, null);
```

Expected:

```text
linhas_atualizadas = 3.
```

- [ ] **Step 5: Validar que dados_mensais nao ficou zerado**

Run via MCP:

```sql
select u.nome, dm.alunos_ativos, dm.alunos_pagantes, dm.ticket_medio, dm.faturamento_estimado, dm.matriculas_banda, dm.matriculas_2_curso
from public.dados_mensais dm
join public.unidades u on u.id = dm.unidade_id
where dm.ano = 2026 and dm.mes = 6
order by u.nome;
```

Expected:

```text
Tres unidades, ticket_medio > 0, faturamento_estimado > 0, alunos_pagantes > 0.
```

- [ ] **Step 6: Em 01/07, fechar competencia formal**

Run only after date is July:

```sql
select public.fechar_competencia(
  2026,
  6,
  null,
  'Fechamento Junho/2026 com snapshot canonico aprovado.'
);
```

Expected:

```text
Competencias Junho/2026 fechadas para as tres unidades.
```

- [ ] **Step 7: Commit documentation**

```powershell
git add docs/operacional/fechamento-mensal-junho-2026.md
git commit -m "docs: add June 2026 monthly closing runbook"
```

---

### Task 12: Verificacao Final Em UI E Relatorios

**Files:**
- No new files.

- [ ] **Step 1: Build final**

Run:

```powershell
npm run build
```

Expected:

```text
Build OK.
```

- [ ] **Step 2: Abrir app local**

Run:

```powershell
npm run dev
```

Expected:

```text
Vite serving localhost URL.
```

- [ ] **Step 3: Validar filtros**

Manual checks:

```text
Dashboard:
- Jun/2026 retorna snapshot aprovado.
- Jul/2026 retorna dados vivos.
- Trimestre incluindo Jun/2026 usa Jun snapshot + meses vivos/fechados corretos.

Analytics:
- Comercial Jun/2026 nao volta para bloqueado se conciliacao estava liberada.
- Matriculas novas Barra/Recreio/Campo Grande batem com relatorios validados.

Administrativo:
- Recreio Jun/2026: 334 ativos, 323 pagantes, 417 matriculas, 58 banda, 25 2o curso.
- Barra Jun/2026: 237 ativos, 235 pagantes, 263 matriculas, 12 banda, 14 2o curso.
- Campo Grande Jun/2026: conferir contra CSV/auditoria final.

Professores:
- Retencao/evasoes nao aparecem zeradas artificialmente.
- Exp -> Mat nao usa diagnostico legado como KPI oficial.
```

- [ ] **Step 4: Gerar relatorios historicos de Junho**

Manual checks:

```text
Relatorio administrativo Junho por unidade.
Relatorio comercial Junho por unidade.
Relatorio gerencial Junho.
Relatorio coordenacao/professores Junho.
```

Expected:

```text
Todos usam Junho fechado; nenhum recalc vivo silencioso.
```

- [ ] **Step 5: Commit**

```powershell
git status --short
git add .
git commit -m "test: verify June monthly closing flow"
```

---

## Decisoes Operacionais Alinhadas

1. Corte oficial de Junho:
   - horario alvo: 30/06/2026 por volta de 22h BRT;
   - antes de gravar, confirmar cron/sync Emusys ativo e horario do ultimo sync;
   - depois do corte, nao rodar sync manual que altere Junho sem retificacao.

2. Fechamento das tres unidades:
   - objetivo: gerar resultado das tres unidades agora;
   - recomendacao tecnica: preview pode ser por unidade, mas aprovacao oficial deve ser all-or-nothing para o fechamento consolidado;
   - se uma unidade falhar na validacao, nao fechar consolidado como final. Corrigir/validar a unidade e rodar novamente.

3. Financeiro:
   - enquanto nao existir endpoint de faturas Emusys, Junho usa faturamento previsto por parcela canonica;
   - nao tentar inferir juros/multa ou valor pago real por calculo interno.

4. Campo Grande e CSV Emusys:
   - objetivo do CSV nao e substituir a fonte canonica;
   - objetivo e evidencia externa de alta confianca para validar Campo Grande antes do freeze, porque e a unidade com maior volume e maior risco operacional;
   - se a RPC canonica e o CSV baterem, gravar snapshot. Se nao baterem, parar e investigar antes de congelar Junho.

5. `dados_mensais`:
   - decisao tecnica recomendada: manter como compatibilidade historica para telas antigas;
   - fonte oficial do fechamento passa a ser snapshot aprovado;
   - `dados_mensais` so deve receber Junho a partir do snapshot aprovado, nunca de recalculo legado.

## Ordem Recomendada De Execucao

1. Task 0: inventario canonico obrigatorio.
2. Task 1: baseline read-only.
3. Task 2 a 6: banco seguro, sem popular Junho ainda, somente se o inventario justificar tabela nova.
4. Task 7 a 10: leitura e UI de preview.
5. Task 11: ritual de fechamento Junho/2026 com aprovacao humana.
6. Task 12: verificacao final e commit/push.

## Riscos Controlados

- Risco: writer legado sobrescrever Junho.
  - Controle: revoke de execucao publica/autenticada e compatibilidade apenas via snapshot.
- Risco: `dados_mensais` nao comportar relatorios completos.
  - Controle: snapshot por dominio em JSONB, com `dados_mensais` apenas para compatibilidade.
- Risco: relatorio historico recalcular vivo em Julho.
  - Controle: historico fechado exige snapshot; sem snapshot mostra erro claro.
- Risco: financeiro realizado com juros/multa ficar incorreto.
  - Controle: marcar explicitamente que Junho usa faturamento previsto ate endpoint de faturas existir.
- Risco: regressao em Maio/Abril.
  - Controle: escopo inicial apenas Junho/2026; meses antigos ficam intactos.

## Criterio De Pronto

- Junho/2026 tem snapshots aprovados por unidade e dominio.
- `dados_mensais` Junho contem valores de compatibilidade nao zerados e derivados do snapshot.
- Relatorios de Junho continuam iguais ao voltar no filtro depois de 01/07.
- Writers legados nao ficam acessiveis para usuarios autenticados comuns.
- Build passa.
- Commit e push feitos depois de `git fetch origin` e rebase/merge seguro, sem sobrescrever trabalho do Hugo.
