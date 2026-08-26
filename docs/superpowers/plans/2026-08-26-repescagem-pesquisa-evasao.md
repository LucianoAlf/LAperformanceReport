# Repescagem da Pesquisa de Evasão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a equipe de Sucesso do Aluno reenvie a pesquisa de evasão (2º toque, texto próprio) para quem não respondeu, com envio enfileirado e lento para não queimar o número da caixa Lia.

**Architecture:** Uma tabela de fila (`pesquisa_evasao_envios_fila`, uma linha por toque) alimentada por uma RPC de enfileiramento que sorteia os horários; um worker (edge nova, cron de 1 minuto) que toma uma linha por vez com claim atômico e envia pelo provider já existente; a aba de follow-up ganha botão e badge de estado lendo a tabela direto pelo PostgREST.

**Tech Stack:** PostgreSQL (Supabase, projeto `ouqwbbermlzqqvtqwlul`), Deno edge functions, React 19 + TypeScript, `node --test` para testes de contrato/frontend e Postgres 17 em Docker para testes de comportamento SQL.

**Spec:** `docs/superpowers/specs/2026-08-26-repescagem-pesquisa-evasao-design.md`

## Global Constraints

- **Timezone de negócio é BRT (`America/Sao_Paulo`).** `CURRENT_DATE`/`now()` no banco são UTC — toda comparação de janela de horário usa `now() at time zone 'America/Sao_Paulo'`.
- **Nenhuma mensagem sai para número real durante a implementação.** O cron entra desligado; o primeiro envio real depende de OK explícito do Hugo, com um caso só.
- **1 disparo de cron vira 2 a 4 execuções da edge neste projeto.** Todo worker toma a vez de forma atômica (`UPDATE ... RETURNING`), nunca `SELECT` para checar e depois escrever.
- **Deploy de edge via MCP reseta `verify_jwt` para `true`.** Sempre passar `verify_jwt` explícito conferido contra `supabase/config.toml` e verificar o retorno do cron depois.
- **Recriar função reabre EXECUTE para `anon`** (há `ALTER DEFAULT PRIVILEGES` no schema `public`). Toda função criada/recriada leva `revoke execute ... from public, anon, authenticated` nominal, e a ACL é conferida em `pg_proc.proacl` ao final.
- **RLS de tabela nova é validada com `set local role authenticated`** e JWT real dos três perfis (admin, usuária de unidade, usuária sem vínculo). Validar como `service_role` não vale — ele ignora RLS.
- **Chamada de função em policy vai dentro de `(select ...)`** para virar InitPlan (`(select is_admin())`, `(select get_user_unidade_ids())`).
- **Régua fixa em 2 toques.** `toque = 1` é reservado ao envio original (não usado agora); a repescagem é `toque = 2`.
- **Estados da fila:** `pendente` · `enviando` · `enviada` · `falhou` · `cancelada`.
- **Lease vencido nunca reenvia:** vira `falhou` com `ultimo_erro = 'LEASE_EXPIRADO: enviou sem confirmacao'`.
- **Ritmo:** intervalo aleatório de **90 a 240 s**, janela **09:00–19:00 BRT**, **dias úteis**, teto de **30 por dia**.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<ts>_pesquisa_evasao_envios_fila.sql` | Tabela, índices de unicidade, RLS, grants |
| `supabase/migrations/<ts>_pesquisa_evasao_template_repescagem.sql` | Dois templates `evasao_repescagem` (direto e responsavel) |
| `supabase/migrations/<ts>_pesquisa_evasao_enfileirar_repescagem.sql` | `proximo_horario_envio_repescagem` + `enfileirar_repescagem_evasao` |
| `supabase/migrations/<ts>_pesquisa_evasao_fila_worker_rpcs.sql` | `claim` / `concluir` / `falhar` / `cancelar` |
| `supabase/migrations/<ts>_cron_repescagem_evasao_desligado.sql` | Cron de 1 min criado **inativo** |
| `supabase/functions/_shared/pesquisa-evasao-provider.ts` | Provider movido da edge (fonte única do envio) |
| `supabase/functions/processar-fila-repescagem-evasao/index.ts` | Worker: claim → revalida → envia → registra |
| `supabase/functions/processar-fila-repescagem-evasao/contract.ts` | Auth interna e decisão pura de envio/cancelamento |
| `src/components/App/SucessoCliente/hooks/useRepescagemEvasao.ts` | Estado da fila por pesquisa + enfileirar + cancelar |
| `src/components/App/SucessoCliente/FilaFollowupEvasao.tsx` | Botões, badges e confirmação de lote |
| `src/components/App/SucessoCliente/pesquisaEvasao.types.ts` | Tipos da fila |
| `tests/repescagemEvasaoFilaSchema.test.mjs` | Contrato da migration (regex) |
| `tests/repescagemEvasaoFilaPostgres.test.mjs` | Comportamento real em Postgres 17 |
| `tests/repescagemEvasaoWorkerContract.test.mjs` | Decisão pura do worker |
| `tests/repescagemEvasaoFrontend.test.mjs` | Contrato do hook e da tela |

---

### Task 1: Tabela da fila, unicidade e RLS

**Files:**
- Create: `supabase/migrations/20260827090000_pesquisa_evasao_envios_fila.sql`
- Test: `tests/repescagemEvasaoFilaSchema.test.mjs`

**Interfaces:**
- Consumes: `public.pesquisa_evasao(id)`, `public.pesquisa_evasao_templates(id)`, `public.usuarios(id)`, `public.unidades(id)`, funções `is_admin()` e `get_user_unidade_ids()`
- Produces: tabela `public.pesquisa_evasao_envios_fila` com as colunas `id, pesquisa_id, unidade_id, toque, template_id, template_versao, status, agendada_para, enfileirada_por_usuario_id, enfileirada_em, worker_id, lease_expires_at, tentativas, max_tentativas, ultimo_erro, provider_message_id, enviada_em, criado_em, atualizado_em`

- [ ] **Step 1: Escrever o teste de contrato (falha)**

```javascript
// tests/repescagemEvasaoFilaSchema.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260827090000_pesquisa_evasao_envios_fila.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('fila de repescagem tem estados e colunas de lease', () => {
  assert.ok(existsSync(migrationUrl), 'migration da fila deve existir');
  const source = sql();
  assert.match(source, /create table public\.pesquisa_evasao_envios_fila/i);
  assert.match(source, /pendente[\s\S]*enviando[\s\S]*enviada[\s\S]*falhou[\s\S]*cancelada/i);
  assert.match(source, /lease_expires_at/i);
  assert.match(source, /worker_id/i);
  assert.match(source, /toque\s+integer/i);
});

test('unicidade impede toque repetido e dois envios vivos', () => {
  const source = sql();
  assert.match(source, /unique\s*\(\s*pesquisa_id\s*,\s*toque\s*\)/i);
  assert.match(
    source,
    /create unique index[\s\S]+pesquisa_evasao_envios_fila_vivo_uidx[\s\S]+where[\s\S]+'pendente'[\s\S]+'enviando'/i,
  );
});

test('tabela nasce fechada e so abre select escopado para authenticated', () => {
  const source = sql();
  assert.match(source, /enable row level security/i);
  assert.match(source, /revoke all on table public\.pesquisa_evasao_envios_fila\s+from public, anon, authenticated/i);
  assert.match(source, /grant select on table public\.pesquisa_evasao_envios_fila to authenticated/i);
  // chamada de funcao dentro de (select ...) vira InitPlan
  assert.match(source, /\(\s*select public\.is_admin\(\)\s*\)/i);
  assert.match(source, /\(\s*select public\.get_user_unidade_ids\(\)\s*\)/i);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/repescagemEvasaoFilaSchema.test.mjs`
Expected: FAIL — "migration da fila deve existir"

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/20260827090000_pesquisa_evasao_envios_fila.sql
-- Fila de envio dos toques da pesquisa de evasao.
-- Uma linha por TOQUE (1 = envio original, reservado; 2 = repescagem), para
-- que acrescentar um 3o toque seja dado, nao migration.

create table public.pesquisa_evasao_envios_fila (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisa_evasao(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id),
  toque integer not null check (toque between 1 and 9),
  template_id uuid not null references public.pesquisa_evasao_templates(id),
  template_versao integer not null,
  status text not null default 'pendente'
    check (status in ('pendente','enviando','enviada','falhou','cancelada')),
  agendada_para timestamptz not null,
  enfileirada_por_usuario_id integer references public.usuarios(id),
  enfileirada_em timestamptz not null default now(),
  worker_id uuid,
  lease_expires_at timestamptz,
  tentativas integer not null default 0,
  max_tentativas integer not null default 3,
  ultimo_erro text,
  provider_message_id text,
  enviada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (pesquisa_id, toque)
);

-- Nunca dois envios vivos para a mesma pessoa ao mesmo tempo, mesmo com regua
-- de N toques.
create unique index pesquisa_evasao_envios_fila_vivo_uidx
  on public.pesquisa_evasao_envios_fila (pesquisa_id)
  where status in ('pendente','enviando');

create index pesquisa_evasao_envios_fila_proxima_idx
  on public.pesquisa_evasao_envios_fila (agendada_para)
  where status = 'pendente';

create index pesquisa_evasao_envios_fila_unidade_idx
  on public.pesquisa_evasao_envios_fila (unidade_id);

alter table public.pesquisa_evasao_envios_fila enable row level security;

-- ALTER DEFAULT PRIVILEGES concede tudo a authenticated em relacao nova;
-- revogar antes de conceder o que de fato deve existir.
revoke all on table public.pesquisa_evasao_envios_fila from public, anon, authenticated;
grant select on table public.pesquisa_evasao_envios_fila to authenticated;
grant all on table public.pesquisa_evasao_envios_fila to service_role;

create policy pesquisa_evasao_envios_fila_leitura_escopada
  on public.pesquisa_evasao_envios_fila
  for select
  to authenticated
  using (
    (select public.is_admin())
    or unidade_id in (select public.get_user_unidade_ids())
  );

create or replace function public.fn_pesquisa_evasao_envios_fila_touch()
returns trigger
language plpgsql
as $function$
begin
  new.atualizado_em := now();
  return new;
end;
$function$;

create trigger trg_pesquisa_evasao_envios_fila_touch
  before update on public.pesquisa_evasao_envios_fila
  for each row execute function public.fn_pesquisa_evasao_envios_fila_touch();

comment on table public.pesquisa_evasao_envios_fila is
  'Fila de envio dos toques da pesquisa de evasao. Grao: um toque por pesquisa. Escrita apenas por service_role e pelas RPCs SECURITY DEFINER.';
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/repescagemEvasaoFilaSchema.test.mjs`
Expected: PASS (3 testes)

- [ ] **Step 5: Aplicar a migration e conferir a ACL real**

Aplicar via MCP Supabase (`apply_migration`). Depois rodar:

```sql
select relacl::text from pg_class where relname = 'pesquisa_evasao_envios_fila';
```

Esperado: `authenticated=r` e `service_role=arwdDxt`. Se aparecer `authenticated=arwdDxt`, o `revoke` não pegou — corrigir antes de seguir.

- [ ] **Step 6: Validar RLS nos três perfis**

Para cada perfil, dentro de uma transação com rollback:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<auth_user_id_real>","role":"authenticated"}';
select count(*) from public.pesquisa_evasao_envios_fila;
rollback;
```

Esperado: admin vê todas; usuária de unidade vê só a dela; usuária sem vínculo vê 0. **Nenhuma das três pode receber `permission denied`** — foi esse erro que derrubou a Agenda para 100% dos usuários em 02/08.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260827090000_pesquisa_evasao_envios_fila.sql tests/repescagemEvasaoFilaSchema.test.mjs
git commit -m "feat(repescagem-evasao): fila de envio com unicidade por toque e RLS escopada"
```

---

### Task 2: Templates da repescagem

**Files:**
- Create: `supabase/migrations/20260827091000_pesquisa_evasao_template_repescagem.sql`
- Modify: `tests/repescagemEvasaoFilaSchema.test.mjs` (acrescenta um teste)

**Interfaces:**
- Consumes: `public.pesquisa_evasao_templates(chave, versao, publico, corpo, ativo)`
- Produces: duas linhas com `chave = 'evasao_repescagem'`, `versao = 1`, `publico in ('direto','responsavel')`, `ativo = true`

- [ ] **Step 1: Escrever o teste (falha)**

```javascript
// acrescentar em tests/repescagemEvasaoFilaSchema.test.mjs
const templateUrl = new URL(
  '../supabase/migrations/20260827091000_pesquisa_evasao_template_repescagem.sql',
  import.meta.url,
);

test('templates de repescagem existem nos dois publicos e nao citam o aluno', () => {
  assert.ok(existsSync(templateUrl), 'migration do template deve existir');
  const source = readFileSync(templateUrl, 'utf8');

  assert.match(source, /'evasao_repescagem'/);
  assert.match(source, /'direto'/);
  assert.match(source, /'responsavel'/);
  assert.match(source, /\{\{aluno_primeiro_nome\}\}/);
  assert.match(source, /\{\{responsavel_primeiro_nome\}\}/);
  assert.match(source, /\{\{assinatura_com_artigo\}\}/);
  // o texto aprovado nao menciona o aluno na versao do responsavel
  assert.doesNotMatch(source, /\{\{aluno_com_preposicao\}\}/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/repescagemEvasaoFilaSchema.test.mjs`
Expected: FAIL — "migration do template deve existir"

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/20260827091000_pesquisa_evasao_template_repescagem.sql
-- Texto do 2o toque, aprovado pelo Hugo em 26/08/2026.
-- Reconhece que ja houve uma mensagem e pede menos: a pesquisa original pede um
-- relato, a repescagem aceita uma frase.

insert into public.pesquisa_evasao_templates (chave, versao, publico, corpo, ativo)
values
  (
    'evasao_repescagem', 1, 'direto',
    'Oi, {{aluno_primeiro_nome}}! Aqui é {{assinatura_com_artigo}} de novo, do Sucesso do Aluno da LA Music 🎵

Sei que te escrevi outro dia e você deve estar corrido e não quero incomodar 🥹. Sua opinião sobre a experiência aqui ajuda a gente de verdade a melhorar para os outros alunos.

Se puder, me responde em uma linha só o que você mudaria. Pode ser por áudio também, do jeito que for mais fácil 🙏',
    true
  ),
  (
    'evasao_repescagem', 1, 'responsavel',
    'Oi, {{responsavel_primeiro_nome}}! Aqui é {{assinatura_com_artigo}} de novo, do Sucesso do Aluno da LA Music 🎵

Sei que te escrevi outro dia e você deve estar corrido e não quero incomodar 🥹. Sua opinião sobre a experiência aqui ajuda a gente de verdade a melhorar para os outros alunos.

Se puder, me responde em uma linha só o que você mudaria. Pode ser por áudio também, do jeito que for mais fácil 🙏',
    true
  );
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/repescagemEvasaoFilaSchema.test.mjs`
Expected: PASS (4 testes)

- [ ] **Step 5: Aplicar e conferir**

Aplicar via MCP. Depois:

```sql
select chave, publico, versao, ativo from public.pesquisa_evasao_templates
where chave = 'evasao_repescagem';
```

Esperado: 2 linhas, ambas `ativo = true`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260827091000_pesquisa_evasao_template_repescagem.sql tests/repescagemEvasaoFilaSchema.test.mjs
git commit -m "feat(repescagem-evasao): templates do segundo toque (direto e responsavel)"
```

---

### Task 3: RPC de enfileiramento — sorteio de horário e guardas

**Files:**
- Create: `supabase/migrations/20260827092000_pesquisa_evasao_enfileirar_repescagem.sql`
- Create: `tests/repescagemEvasaoFilaPostgres.test.mjs`

**Interfaces:**
- Consumes: tabela da Task 1, templates da Task 2
- Produces:
  - `public.proximo_horario_envio_repescagem(p_base timestamptz) returns timestamptz` — empurra para dentro da janela útil
  - `public.enfileirar_repescagem_evasao(p_pesquisa_ids uuid[]) returns jsonb` — `{ enfileiradas: [...], recusadas: [{pesquisa_id, motivo}] }`

- [ ] **Step 1: Escrever os testes de comportamento (falham)**

Seguir o formato de `tests/financeiroSyncQueuePostgres.test.mjs` (Postgres 17 em Docker, migrations aplicadas em ordem). Casos:

```javascript
// tests/repescagemEvasaoFilaPostgres.test.mjs — casos obrigatórios
test('sorteio respeita janela 9h-19h BRT e pula fim de semana', ...);
//   base sabado 10:00 BRT  -> resultado cai na segunda >= 09:00
//   base terca 19:30 BRT   -> resultado cai na quarta >= 09:00
//   base terca 08:00 BRT   -> resultado cai na terca  >= 09:00

test('intervalo entre duas linhas do mesmo lote fica entre 90 e 240 segundos', ...);

test('teto de 30 por dia empurra o excedente para o dia util seguinte', ...);
//   enfileirar 35 -> 30 no primeiro dia, 5 no seguinte

test('recusa opt-out, envio incerto, ja respondida, menos de 3 dias e toque repetido', ...);

test('recusa quando o mesmo telefone ja respondeu por outro aluno', ...);
//   duas pesquisas com o mesmo telefone; a do irmao com resposta_status='revisada'
//   -> a outra e recusada com motivo 'telefone_ja_respondeu'

test('enfileirar duas vezes o mesmo id nao cria segunda linha', ...);
//   segunda chamada devolve recusa 'ja_enfileirada', tabela segue com 1 linha
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/repescagemEvasaoFilaPostgres.test.mjs`
Expected: FAIL — função `enfileirar_repescagem_evasao` não existe

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/20260827092000_pesquisa_evasao_enfileirar_repescagem.sql

-- Empurra um instante para dentro da janela util (09:00-19:00 BRT, dia util).
create or replace function public.proximo_horario_envio_repescagem(
  p_base timestamptz
)
returns timestamptz
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_local timestamp;
  v_dia date;
begin
  v_local := p_base at time zone 'America/Sao_Paulo';

  loop
    v_dia := v_local::date;

    if extract(isodow from v_dia) >= 6 then
      v_local := (v_dia + 1)::timestamp + time '09:00';
      continue;
    end if;

    if v_local::time < time '09:00' then
      v_local := v_dia::timestamp + time '09:00';
    elsif v_local::time > time '19:00' then
      v_local := (v_dia + 1)::timestamp + time '09:00';
      continue;
    end if;

    exit;
  end loop;

  return v_local at time zone 'America/Sao_Paulo';
end;
$function$;

create or replace function public.enfileirar_repescagem_evasao(
  p_pesquisa_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_usuario_id integer;
  v_id uuid;
  v_p record;
  v_motivo text;
  v_cursor timestamptz;
  v_dia date;
  v_no_dia integer;
  v_template record;
  v_publico text;
  v_enfileiradas jsonb := '[]'::jsonb;
  v_recusadas jsonb := '[]'::jsonb;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'REPESCAGEM_FORBIDDEN: usuario interno ativo obrigatorio'
      using errcode = '42501';
  end if;

  select u.id into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
  limit 1;

  v_cursor := public.proximo_horario_envio_repescagem(now() + interval '45 seconds');

  foreach v_id in array coalesce(p_pesquisa_ids, array[]::uuid[])
  loop
    v_motivo := null;

    select p.*, regexp_replace(coalesce(p.telefone_destino_snapshot,''), '\D', '', 'g') as tel_digitos
      into v_p
      from public.pesquisa_evasao p
     where p.id = v_id and p.modo_teste = false;

    if not found then
      v_motivo := 'pesquisa_inexistente';
    elsif v_p.opt_out_em is not null
       or v_p.resposta_status = 'recusada_opt_out' then
      v_motivo := 'opt_out';
    -- Regra pela POSITIVA: a CHECK admite nao_enviado/enviando/falhou, e
    -- nenhum desses pode virar repescagem.
    elsif v_p.envio_status not in ('enviado','entregue','lido') then
      v_motivo := 'primeiro_toque_nao_confirmado';
    elsif v_p.resposta_status <> 'sem_resposta' then
      v_motivo := 'ja_respondeu';
    elsif v_p.enviado_em is null
       or v_p.enviado_em > now() - interval '3 days' then
      v_motivo := 'muito_cedo';
    elsif exists (
      select 1 from public.pesquisa_evasao_envios_fila f
       where f.pesquisa_id = v_id and f.toque = 2
    ) then
      v_motivo := 'ja_enfileirada';
    elsif v_p.tel_digitos <> '' and exists (
      -- Caso real: o mesmo telefone atende dois irmaos. A mae respondeu uma vez,
      -- fechou a pesquisa de um e a do outro seguiu "sem resposta". Cobrar de
      -- novo quem acabou de responder e o pior desfecho possivel.
      select 1 from public.pesquisa_evasao outra
       where outra.id <> v_id
         and outra.modo_teste = false
         and right(regexp_replace(coalesce(outra.telefone_destino_snapshot,''), '\D', '', 'g'), 8)
             = right(v_p.tel_digitos, 8)
         and outra.resposta_status <> 'sem_resposta'
    ) then
      v_motivo := 'telefone_ja_respondeu';
    end if;

    if v_motivo is not null then
      v_recusadas := v_recusadas || jsonb_build_object('pesquisa_id', v_id, 'motivo', v_motivo);
      continue;
    end if;

    -- O publico do 2o toque e o MESMO do 1o: quem falou continua falando com
    -- quem recebeu. Nao recalcular por idade (duplicaria a regra de
    -- resolverPublicoPesquisa e depende de data_nascimento, que pode faltar) e
    -- nunca deduzir por telefone (o telefone do responsavel tambem e o do aluno
    -- em varios cadastros). Medido em 26/08: 37 de 37 pesquisas tem template_id.
    select t.publico into v_publico
      from public.pesquisa_evasao_templates t
     where t.id = v_p.template_id;

    if v_publico is null then
      v_recusadas := v_recusadas || jsonb_build_object('pesquisa_id', v_id, 'motivo', 'publico_indeterminado');
      continue;
    end if;

    select t.id, t.versao into v_template
      from public.pesquisa_evasao_templates t
     where t.chave = 'evasao_repescagem' and t.publico = v_publico and t.ativo
     order by t.versao desc
     limit 1;

    if not found then
      v_recusadas := v_recusadas || jsonb_build_object('pesquisa_id', v_id, 'motivo', 'template_ausente');
      continue;
    end if;

    -- Teto diario: 30 linhas por dia de agenda.
    loop
      v_dia := (v_cursor at time zone 'America/Sao_Paulo')::date;
      select count(*) into v_no_dia
        from public.pesquisa_evasao_envios_fila f
       where f.status in ('pendente','enviando')
         and (f.agendada_para at time zone 'America/Sao_Paulo')::date = v_dia;
      exit when v_no_dia < 30;
      v_cursor := public.proximo_horario_envio_repescagem(
        (v_dia + 1)::timestamp + time '09:00' at time zone 'America/Sao_Paulo'
      );
    end loop;

    insert into public.pesquisa_evasao_envios_fila (
      pesquisa_id, unidade_id, toque, template_id, template_versao,
      status, agendada_para, enfileirada_por_usuario_id
    ) values (
      v_id, v_p.unidade_id, 2, v_template.id, v_template.versao,
      'pendente', v_cursor, v_usuario_id
    );

    v_enfileiradas := v_enfileiradas || jsonb_build_object(
      'pesquisa_id', v_id, 'agendada_para', v_cursor
    );

    -- Intervalo aleatorio entre 90 e 240 segundos.
    v_cursor := public.proximo_horario_envio_repescagem(
      v_cursor + make_interval(secs => 90 + floor(random() * 151)::int)
    );
  end loop;

  return jsonb_build_object(
    'enfileiradas', v_enfileiradas,
    'recusadas', v_recusadas
  );
end;
$function$;

revoke all on function public.proximo_horario_envio_repescagem(timestamptz)
  from public, anon, authenticated;
revoke all on function public.enfileirar_repescagem_evasao(uuid[])
  from public, anon, authenticated;
grant execute on function public.enfileirar_repescagem_evasao(uuid[]) to authenticated, service_role;
grant execute on function public.proximo_horario_envio_repescagem(timestamptz) to service_role;
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `node --test tests/repescagemEvasaoFilaPostgres.test.mjs`
Expected: PASS

- [ ] **Step 5: Aplicar e conferir a ACL**

```sql
select proname, proacl::text from pg_proc
where proname in ('enfileirar_repescagem_evasao','proximo_horario_envio_repescagem');
```

Esperado: **sem `anon`** em nenhuma das duas.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260827092000_pesquisa_evasao_enfileirar_repescagem.sql tests/repescagemEvasaoFilaPostgres.test.mjs
git commit -m "feat(repescagem-evasao): enfileiramento com sorteio de horario e guardas"
```

---

### Task 4: RPCs do worker — claim atômico, conclusão, falha e cancelamento

**Files:**
- Create: `supabase/migrations/20260827093000_pesquisa_evasao_fila_worker_rpcs.sql`
- Modify: `tests/repescagemEvasaoFilaPostgres.test.mjs`

**Interfaces:**
- Consumes: tabela da Task 1
- Produces:
  - `claim_repescagem_evasao_job(p_worker_id uuid, p_lease_seconds integer default 120) returns jsonb` — `null` quando não há linha; senão `{id, pesquisa_id, toque, template_id, template_versao}`
  - `concluir_repescagem_evasao_job(p_id uuid, p_worker_id uuid, p_provider_message_id text) returns void`
  - `falhar_repescagem_evasao_job(p_id uuid, p_worker_id uuid, p_erro text, p_terminal boolean) returns void`
  - `cancelar_repescagem_evasao(p_pesquisa_id uuid, p_motivo text) returns void` — `authenticated`, só linha `pendente`

- [ ] **Step 1: Escrever os testes (falham)**

```javascript
// acrescentar em tests/repescagemEvasaoFilaPostgres.test.mjs
test('dois workers concorrentes nao pegam a mesma linha', ...);
//   duas chamadas de claim na mesma janela -> ids diferentes, nunca o mesmo

test('claim so pega linha vencida e em ordem de agendamento', ...);
//   linha com agendada_para no futuro nao e retornada

test('lease vencido vira falhou e NUNCA volta para pendente', ...);
//   status 'enviando' com lease_expires_at no passado -> proximo claim marca
//   'falhou' com ultimo_erro LEASE_EXPIRADO; a linha nao e reenviada

test('concluir grava provider_message_id e enviada_em', ...);
test('falhar nao terminal devolve para pendente ate max_tentativas', ...);
test('falhar terminal fecha em falhou', ...);
test('cancelar so age em linha pendente', ...);
//   linha 'enviando' -> excecao REPESCAGEM_CANCELAMENTO_INVALIDO
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/repescagemEvasaoFilaPostgres.test.mjs`
Expected: FAIL — `claim_repescagem_evasao_job` não existe

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/20260827093000_pesquisa_evasao_fila_worker_rpcs.sql

create or replace function public.claim_repescagem_evasao_job(
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_job public.pesquisa_evasao_envios_fila%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'REPESCAGEM_FORBIDDEN: service_role obrigatoria' using errcode = '42501';
  end if;
  if p_worker_id is null then
    raise exception 'REPESCAGEM_WORKER_INVALIDO';
  end if;

  -- Lease vencido NAO volta para pendente. Diferente da fila financeira, aqui o
  -- efeito colateral de repetir e uma mensagem duplicada para um ex-aluno.
  -- Entre mandar duas vezes e nao mandar, o sistema nao manda.
  update public.pesquisa_evasao_envios_fila
     set status = 'falhou',
         ultimo_erro = 'LEASE_EXPIRADO: enviou sem confirmacao',
         worker_id = null,
         lease_expires_at = null
   where status = 'enviando'
     and lease_expires_at <= now();

  update public.pesquisa_evasao_envios_fila f
     set status = 'enviando',
         worker_id = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         tentativas = f.tentativas + 1
   where f.id = (
     select c.id
       from public.pesquisa_evasao_envios_fila c
      where c.status = 'pendente'
        and c.agendada_para <= now()
      order by c.agendada_para
      for update skip locked
      limit 1
   )
  returning f.* into v_job;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_job.id,
    'pesquisa_id', v_job.pesquisa_id,
    'toque', v_job.toque,
    'template_id', v_job.template_id,
    'template_versao', v_job.template_versao
  );
end;
$function$;

create or replace function public.concluir_repescagem_evasao_job(
  p_id uuid,
  p_worker_id uuid,
  p_provider_message_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'REPESCAGEM_FORBIDDEN: service_role obrigatoria' using errcode = '42501';
  end if;

  update public.pesquisa_evasao_envios_fila
     set status = 'enviada',
         provider_message_id = nullif(btrim(coalesce(p_provider_message_id, '')), ''),
         enviada_em = now(),
         worker_id = null,
         lease_expires_at = null
   where id = p_id and worker_id = p_worker_id and status = 'enviando';

  if not found then
    raise exception 'REPESCAGEM_CONCLUSAO_INVALIDA: job nao esta com este worker';
  end if;
end;
$function$;

create or replace function public.falhar_repescagem_evasao_job(
  p_id uuid,
  p_worker_id uuid,
  p_erro text,
  p_terminal boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_tentativas integer;
  v_max integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'REPESCAGEM_FORBIDDEN: service_role obrigatoria' using errcode = '42501';
  end if;

  select tentativas, max_tentativas into v_tentativas, v_max
    from public.pesquisa_evasao_envios_fila
   where id = p_id and worker_id = p_worker_id and status = 'enviando';

  if not found then
    raise exception 'REPESCAGEM_FALHA_INVALIDA: job nao esta com este worker';
  end if;

  update public.pesquisa_evasao_envios_fila
     set status = case
           when p_terminal or v_tentativas >= v_max then 'falhou'
           else 'pendente'
         end,
         -- backoff simples: 5 min por tentativa
         agendada_para = case
           when p_terminal or v_tentativas >= v_max then agendada_para
           else public.proximo_horario_envio_repescagem(
                  now() + make_interval(mins => 5 * v_tentativas))
         end,
         ultimo_erro = left(coalesce(p_erro, 'erro desconhecido'), 500),
         worker_id = null,
         lease_expires_at = null
   where id = p_id;
end;
$function$;

create or replace function public.cancelar_repescagem_evasao(
  p_pesquisa_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'REPESCAGEM_FORBIDDEN: usuario interno ativo obrigatorio'
      using errcode = '42501';
  end if;

  update public.pesquisa_evasao_envios_fila
     set status = 'cancelada',
         ultimo_erro = nullif(btrim(coalesce(p_motivo, '')), '')
   where pesquisa_id = p_pesquisa_id
     and toque = 2
     and status = 'pendente';

  if not found then
    raise exception 'REPESCAGEM_CANCELAMENTO_INVALIDO: so linha pendente pode ser cancelada';
  end if;
end;
$function$;

revoke all on function public.claim_repescagem_evasao_job(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.concluir_repescagem_evasao_job(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.falhar_repescagem_evasao_job(uuid, uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.cancelar_repescagem_evasao(uuid, text)
  from public, anon, authenticated;

grant execute on function public.claim_repescagem_evasao_job(uuid, integer) to service_role;
grant execute on function public.concluir_repescagem_evasao_job(uuid, uuid, text) to service_role;
grant execute on function public.falhar_repescagem_evasao_job(uuid, uuid, text, boolean) to service_role;
grant execute on function public.cancelar_repescagem_evasao(uuid, text) to authenticated, service_role;
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `node --test tests/repescagemEvasaoFilaPostgres.test.mjs`
Expected: PASS

- [ ] **Step 5: Aplicar e conferir ACL das quatro funções**

```sql
select proname, proacl::text from pg_proc
where proname like '%repescagem_evasao%';
```

Esperado: nenhuma com `anon`; só `cancelar_repescagem_evasao` tem `authenticated`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260827093000_pesquisa_evasao_fila_worker_rpcs.sql tests/repescagemEvasaoFilaPostgres.test.mjs
git commit -m "feat(repescagem-evasao): claim atomico, conclusao, falha e cancelamento"
```

---

### Task 5: Mover o provider para `_shared` (refactor sem mudança de comportamento)

**Files:**
- Create: `supabase/functions/_shared/pesquisa-evasao-provider.ts` (conteúdo movido)
- Delete: `supabase/functions/enviar-pesquisa-evasao/provider.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/index.ts` (import), `supabase/functions/enviar-pesquisa-evasao/provider.test.ts` (import)

**Interfaces:**
- Produces: `enviarMensagemComCredenciaisExatas(input: EnvioProviderInput, adapters: EnvioProviderAdapters)`, `classificarRespostaProvider`, `extrairProviderMessageId`, `sanitizarErroProvider`, `ErroConfiguracaoProvider` — todos com as **mesmas assinaturas de hoje**, agora importáveis pelo worker

**Por que mover:** o worker precisa da mesma regra de envio. Duplicar a regra em dois lugares foi a causa-raiz das duplicatas de renovação neste sistema. O repo não tem precedente de import cruzado entre pastas de edge — o padrão é `_shared/`.

- [ ] **Step 1: Rodar os testes atuais do provider e anotar o resultado (baseline verde)**

Run: `deno test supabase/functions/enviar-pesquisa-evasao/provider.test.ts`
Expected: PASS — anotar quantos testes passam; o número deve ser idêntico ao final.

- [ ] **Step 2: Mover o arquivo sem editar o conteúdo**

```bash
git mv supabase/functions/enviar-pesquisa-evasao/provider.ts \
       supabase/functions/_shared/pesquisa-evasao-provider.ts
```

- [ ] **Step 3: Corrigir os imports**

Em `supabase/functions/enviar-pesquisa-evasao/index.ts` e `provider.test.ts`, trocar:

```typescript
} from "./provider.ts";
```

por:

```typescript
} from "../_shared/pesquisa-evasao-provider.ts";
```

- [ ] **Step 4: Rodar os testes e conferir o mesmo resultado**

Run: `deno test supabase/functions/enviar-pesquisa-evasao/provider.test.ts`
Expected: PASS com o mesmo número de testes do Step 1. Zero mudança de comportamento.

- [ ] **Step 5: Redeploy da edge existente com `verify_jwt` explícito**

`supabase/config.toml` declara `verify_jwt = true` para `enviar-pesquisa-evasao`. Deploy via MCP **reseta esse valor** se não for passado. Deployar passando `verify_jwt: true` e, em seguida, confirmar na tela que o fluxo manual (prévia → confirmar) continua respondendo — sem enviar mensagem: parar na prévia.

- [ ] **Step 6: Commit**

```bash
git add -A supabase/functions
git commit -m "refactor(pesquisa-evasao): move provider para _shared sem mudar comportamento"
```

---

### Task 6: Worker — edge `processar-fila-repescagem-evasao`

**Files:**
- Create: `supabase/functions/processar-fila-repescagem-evasao/index.ts`
- Create: `supabase/functions/processar-fila-repescagem-evasao/contract.ts`
- Create: `tests/repescagemEvasaoWorkerContract.test.mjs`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `claim_repescagem_evasao_job`, `concluir_repescagem_evasao_job`, `falhar_repescagem_evasao_job` (Task 4); `enviarMensagemComCredenciaisExatas` (Task 5); `renderizarMensagem` e `tratamentoGramatical.ts` de `enviar-pesquisa-evasao/`
- Produces: `decidirEnvioRepescagem(estado): { acao: 'enviar' | 'cancelar', motivo?: string }` — função pura, testável sem rede

- [ ] **Step 1: Escrever o teste da decisão pura (falha)**

```javascript
// tests/repescagemEvasaoWorkerContract.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { decidirEnvioRepescagem } from '../supabase/functions/processar-fila-repescagem-evasao/contract.ts';

const base = {
  respostaStatus: 'sem_resposta',
  envioStatus: 'enviado',
  optOutEm: null,
  jaExisteSaidaDoToque: false,
};

test('envia quando nada mudou desde o enfileiramento', () => {
  assert.deepEqual(decidirEnvioRepescagem(base), { acao: 'enviar' });
});

test('cancela quem respondeu durante a espera na fila', () => {
  assert.deepEqual(
    decidirEnvioRepescagem({ ...base, respostaStatus: 'coletando' }),
    { acao: 'cancelar', motivo: 'respondeu_durante_a_espera' },
  );
});

test('cancela apos opt-out', () => {
  assert.deepEqual(
    decidirEnvioRepescagem({ ...base, optOutEm: '2026-08-26T12:00:00Z' }),
    { acao: 'cancelar', motivo: 'opt_out' },
  );
});

test('cancela se ja existe mensagem de saida deste toque', () => {
  assert.deepEqual(
    decidirEnvioRepescagem({ ...base, jaExisteSaidaDoToque: true }),
    { acao: 'cancelar', motivo: 'ja_enviada' },
  );
});
```

> Nota para o executor: os testes `.mjs` do repo importam `.ts` de edge em vários casos; se o runtime reclamar do import, seguir o padrão de `tests/emusysCadastroCanonico.test.mjs`, que é o exemplo vigente de teste `node --test` sobre módulo de edge.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/repescagemEvasaoWorkerContract.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Escrever o contract.ts**

```typescript
// supabase/functions/processar-fila-repescagem-evasao/contract.ts

export interface EstadoAntesDoEnvio {
  respostaStatus: string;
  envioStatus: string;
  optOutEm: string | null;
  jaExisteSaidaDoToque: boolean;
}

export type DecisaoEnvio =
  | { acao: "enviar" }
  | { acao: "cancelar"; motivo: string };

/**
 * Revalida na hora do disparo o que a RPC validou no enfileiramento. A linha
 * pode ter esperado horas na fila, e nesse meio tempo a pessoa pode ter
 * respondido ou pedido para nao receber mais.
 */
export function decidirEnvioRepescagem(estado: EstadoAntesDoEnvio): DecisaoEnvio {
  if (estado.optOutEm !== null) {
    return { acao: "cancelar", motivo: "opt_out" };
  }
  if (estado.jaExisteSaidaDoToque) {
    return { acao: "cancelar", motivo: "ja_enviada" };
  }
  if (estado.respostaStatus !== "sem_resposta") {
    return { acao: "cancelar", motivo: "respondeu_durante_a_espera" };
  }
  if (!["enviado", "entregue", "lido"].includes(estado.envioStatus)) {
    return { acao: "cancelar", motivo: "primeiro_toque_nao_confirmado" };
  }
  return { acao: "enviar" };
}

/** Comparacao do token do cron, mesmo padrao de processar-conversa-evasao. */
export function autenticarWorkerInterno(
  recebido: string | null,
  esperado: string,
): boolean {
  if (!esperado) return false;
  const a = new TextEncoder().encode(recebido ?? "");
  const b = new TextEncoder().encode(esperado);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/repescagemEvasaoWorkerContract.test.mjs`
Expected: PASS (4 testes)

- [ ] **Step 5: Escrever o index.ts do worker**

Sequência obrigatória por rodada — **uma linha por invocação**, porque o mesmo cron dispara a edge 2 a 4 vezes:

```typescript
// supabase/functions/processar-fila-repescagem-evasao/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autenticarWorkerInterno,
  decidirEnvioRepescagem,
} from "./contract.ts";
import {
  classificarRespostaProvider,
  enviarMensagemComCredenciaisExatas,
  extrairProviderMessageId,
  sanitizarErroProvider,
} from "../_shared/pesquisa-evasao-provider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("SYNC_PRESENCA_EDGE_TOKEN")?.trim() || "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "metodo_nao_permitido" }, 405);
  if (!autenticarWorkerInterno(req.headers.get("x-sync-token"), WORKER_TOKEN)) {
    return json({ error: "nao_autorizado" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const workerId = crypto.randomUUID();

  // 1. Toma UMA linha. As demais execucoes do mesmo disparo recebem null aqui.
  const { data: job, error: erroClaim } = await supabase.rpc(
    "claim_repescagem_evasao_job",
    { p_worker_id: workerId, p_lease_seconds: 120 },
  );
  if (erroClaim) return json({ error: "claim_indisponivel" }, 503);
  if (!job) return json({ ok: true, processado: 0 });

  // 2. Le o estado atual da pesquisa e revalida.
  const { data: pesquisa, error: erroPesquisa } = await supabase
    .from("pesquisa_evasao")
    .select(
      "id, aluno_nome, aluno_telefone, telefone_destino_snapshot, caixa_id, " +
        "resposta_status, envio_status, opt_out_em, assinatura_nome_snapshot",
    )
    .eq("id", job.pesquisa_id)
    .maybeSingle();

  if (erroPesquisa || !pesquisa) {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: "pesquisa_nao_encontrada",
      p_terminal: true,
    });
    return json({ ok: true, processado: 0, motivo: "pesquisa_nao_encontrada" });
  }

  const { count: saidasDoToque } = await supabase
    .from("pesquisa_evasao_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("pesquisa_id", job.pesquisa_id)
    .eq("direcao", "saida");

  const decisao = decidirEnvioRepescagem({
    respostaStatus: String(pesquisa.resposta_status),
    envioStatus: String(pesquisa.envio_status),
    optOutEm: pesquisa.opt_out_em ?? null,
    jaExisteSaidaDoToque: (saidasDoToque ?? 0) > 0,
  });

  // 3. Cancelar encerra a rodada sem enviar nada.
  if (decisao.acao === "cancelar") {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: decisao.motivo,
      p_terminal: true,
    });
    return json({ ok: true, processado: 0, motivo: decisao.motivo });
  }

  // 4. Renderiza o template do toque pelo publico do destino.
  const { data: template } = await supabase
    .from("pesquisa_evasao_templates")
    .select("corpo, publico")
    .eq("id", job.template_id)
    .maybeSingle();

  const telefoneDestino = String(pesquisa.telefone_destino_snapshot ?? "");
  const soDigitos = (valor: string) => valor.replace(/\D/g, "");

  // O publico ja foi decidido no 1o toque e viaja no template escolhido pela
  // RPC de enfileiramento (`job.template_id`). O worker nao recalcula publico:
  // nem por idade (regra de resolverPublicoPesquisa, que exige data_nascimento),
  // nem por telefone (o numero do responsavel costuma ser o do aluno).
  const publico = String(template?.publico ?? "");

  // A assinatura e a MESMA do 1o toque: o texto diz "aqui e a Fulana de novo".
  const assinatura = String(pesquisa.assinatura_nome_snapshot ?? "");
  if (!template?.corpo || !assinatura || !telefoneDestino) {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: "dados_insuficientes_para_render",
      p_terminal: true,
    });
    return json({ ok: true, processado: 0, motivo: "dados_insuficientes" });
  }

  let mensagem: string;
  try {
    mensagem = renderizarMensagem({
      template: String(template.corpo),
      valores: {
        aluno_primeiro_nome: primeiroNome(String(pesquisa.aluno_nome)),
        responsavel_primeiro_nome: primeiroNome(String(pesquisa.aluno_nome)),
        assinatura_nome: assinatura,
        assinatura_com_artigo: assinaturaComArtigo(assinatura),
        aluno_com_preposicao: alunoComPreposicao(
          primeiroNome(String(pesquisa.aluno_nome)),
        ),
      },
    });
  } catch (erro) {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: erro instanceof Error ? erro.message : "render_falhou",
      p_terminal: true,
    });
    return json({ ok: true, processado: 0, motivo: "render_falhou" });
  }

  // 5. Envia pelo provider unico.
  let resultado;
  try {
    resultado = await enviarMensagemComCredenciaisExatas(
      {
        caixaId: Number(pesquisa.caixa_id),
        telefone: telefoneDestino,
        mensagem,
      },
      {
        buscarCaixaExata: (caixaId: number) =>
          supabase
            .from("whatsapp_caixas")
            .select(
              "id, provedor, uazapi_url, uazapi_token, waha_url, waha_session, waha_api_key",
            )
            .eq("id", caixaId)
            .eq("ativo", true),
      },
    );
  } catch (erro) {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: erro instanceof Error ? erro.message : "provider_indisponivel",
      p_terminal: false,
    });
    return json({ ok: true, processado: 0, motivo: "provider_indisponivel" });
  }

  const classificacao = classificarRespostaProvider(
    resultado.statusHttp,
    resultado.payload,
  );

  // "incerto" e TERMINAL: nao se sabe se chegou, e repetir e o unico erro
  // que nao da para desfazer com um ex-aluno.
  if (classificacao !== "enviado") {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: sanitizarErroProvider(resultado.statusHttp),
      p_terminal: classificacao === "incerto",
    });
    return json({ ok: true, processado: 0, motivo: classificacao });
  }

  const providerMessageId = extrairProviderMessageId(resultado.payload);

  // 6. Registra a saida e fecha a linha.
  await supabase.from("pesquisa_evasao_mensagens").insert({
    pesquisa_id: job.pesquisa_id,
    caixa_id: Number(pesquisa.caixa_id),
    direcao: "saida",
    tipo: "texto",
    texto: mensagem,
    telefone_normalizado: soDigitos(telefoneDestino),
    provider_message_id: providerMessageId,
    resolution_status: "resolvida",
  });

  await supabase.rpc("concluir_repescagem_evasao_job", {
    p_id: job.id,
    p_worker_id: workerId,
    p_provider_message_id: providerMessageId,
  });

  return json({ ok: true, processado: 1, publico });
});
```

Imports adicionais no topo do arquivo:

```typescript
import { renderizarMensagem } from "../enviar-pesquisa-evasao/contract.ts";
import {
  alunoComPreposicao,
  assinaturaComArtigo,
} from "../enviar-pesquisa-evasao/tratamentoGramatical.ts";
```

E a cópia local de `primeiroNome` (a de `enviar-pesquisa-evasao/index.ts:179` não é exportada):

```typescript
function primeiroNome(nome: string): string {
  return String(nome ?? "").trim().split(/\s+/)[0] ?? "";
}
```

> ⚠️ **`renderizarMensagem` lança se qualquer placeholder do corpo vier vazio** — por
> isso os cinco valores são passados sempre, mesmo que o template aprovado só use
> dois deles. E a assinatura vem de `assinatura_nome_snapshot`, **não** de quem
> clicou: o texto diz "aqui é a Fulana **de novo**", então precisa ser a mesma
> pessoa que assinou o 1º toque.
>
> ⚠️ Se `renderizarMensagem` e `tratamentoGramatical.ts` não puderem ser
> importados de outra pasta de função no deploy, mover os dois para `_shared/`
> pelo mesmo procedimento da Task 5 — nunca copiar o corpo das funções.

- [ ] **Step 6: Declarar a edge no config.toml**

```toml
[functions.processar-fila-repescagem-evasao]
# pg_cron não possui JWT de service_role neste projeto; autenticação interna
# ocorre no código por x-sync-token antes de ler body ou criar o cliente.
verify_jwt = false
```

- [ ] **Step 7: Deploy com `verify_jwt: false` explícito e teste com fila vazia**

Deploy via MCP passando `verify_jwt: false`. Chamar a edge com o token correto e a fila vazia.
Expected: `{"ok":true,"processado":0}`. Chamar sem token: `401`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/processar-fila-repescagem-evasao supabase/config.toml tests/repescagemEvasaoWorkerContract.test.mjs
git commit -m "feat(repescagem-evasao): worker com claim atomico e revalidacao antes do disparo"
```

---

### Task 7: Cron de 1 minuto, criado desligado

**Files:**
- Create: `supabase/migrations/20260827094000_cron_repescagem_evasao_desligado.sql`

**Interfaces:**
- Consumes: edge da Task 6
- Produces: job `processar-fila-repescagem-evasao` em `cron.job`, `active = false`

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260827094000_cron_repescagem_evasao_desligado.sql
-- Cron nasce DESLIGADO. Ligar so apos o envio de validacao com um caso unico,
-- com OK explicito do Hugo.

select cron.schedule(
  'processar-fila-repescagem-evasao',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/processar-fila-repescagem-evasao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_presenca_edge_token' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

-- O default de timeout do pg_net e 5s e ja causou falha silenciosa neste
-- projeto; por isso timeout_milliseconds acima e explicito.

update cron.job set active = false where jobname = 'processar-fila-repescagem-evasao';
```

- [ ] **Step 2: Aplicar e conferir que está desligado**

```sql
select jobname, schedule, active from cron.job
where jobname = 'processar-fila-repescagem-evasao';
```

Expected: `active = false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260827094000_cron_repescagem_evasao_desligado.sql
git commit -m "chore(repescagem-evasao): cron de 1 minuto criado desligado"
```

---

### Task 8: Tela — botões, badges e cancelamento

**Files:**
- Create: `src/components/App/SucessoCliente/hooks/useRepescagemEvasao.ts`
- Modify: `src/components/App/SucessoCliente/FilaFollowupEvasao.tsx`
- Modify: `src/components/App/SucessoCliente/pesquisaEvasao.types.ts`
- Create: `tests/repescagemEvasaoFrontend.test.mjs`

**Interfaces:**
- Consumes: `enfileirar_repescagem_evasao(p_pesquisa_ids)`, `cancelar_repescagem_evasao(p_pesquisa_id, p_motivo)`, leitura direta de `pesquisa_evasao_envios_fila` via PostgREST
- Produces: `useRepescagemEvasao({ pesquisaIds })` → `{ estadoPorPesquisa, enfileirar, cancelar, recarregar, loading }`

**Decisão registrada:** a tela lê a fila **direto pela tabela** (`supabase.from('pesquisa_evasao_envios_fila').select(...).in('pesquisa_id', ids)`), sem tocar em `listar_followups_pesquisa_evasao_v1`. Acrescentar coluna ao `RETURNS TABLE` daquela RPC exigiria `DROP` + `CREATE` — e recriar função neste projeto reabre EXECUTE para `anon`. Não vale o risco por um badge.

- [ ] **Step 1: Escrever o teste de contrato do frontend (falha)**

```javascript
// tests/repescagemEvasaoFrontend.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hook = readFileSync(
  new URL('../src/components/App/SucessoCliente/hooks/useRepescagemEvasao.ts', import.meta.url),
  'utf8',
);
const tela = readFileSync(
  new URL('../src/components/App/SucessoCliente/FilaFollowupEvasao.tsx', import.meta.url),
  'utf8',
);

test('hook usa as RPCs canonicas e le a fila direto da tabela', () => {
  assert.match(hook, /rpc\(\s*'enfileirar_repescagem_evasao'/);
  assert.match(hook, /rpc\(\s*'cancelar_repescagem_evasao'/);
  assert.match(hook, /from\(\s*'pesquisa_evasao_envios_fila'\s*\)/);
});

test('hook nao reimplementa elegibilidade no cliente', () => {
  // a decisao de quem pode ser repescado e do banco; o cliente so exibe o motivo
  assert.doesNotMatch(hook, /recusada_opt_out|resposta_status\s*!==/);
});

test('tela oferece repescar, repescar todos e cancelar', () => {
  assert.match(tela, /Repescar/);
  assert.match(tela, /useRepescagemEvasao/);
  assert.match(tela, /cancelar/i);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/repescagemEvasaoFrontend.test.mjs`
Expected: FAIL — arquivo do hook não existe

- [ ] **Step 3: Escrever o hook**

```typescript
// src/components/App/SucessoCliente/hooks/useRepescagemEvasao.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RepescagemEstado } from '../pesquisaEvasao.types';

export function useRepescagemEvasao(pesquisaIds: string[]) {
  const [estadoPorPesquisa, setEstado] = useState<Record<string, RepescagemEstado>>({});
  const [loading, setLoading] = useState(false);
  const chave = useMemo(() => pesquisaIds.join(','), [pesquisaIds]);

  const recarregar = useCallback(async () => {
    if (pesquisaIds.length === 0) { setEstado({}); return; }
    setLoading(true);
    const { data } = await supabase
      .from('pesquisa_evasao_envios_fila')
      .select('pesquisa_id, status, agendada_para, enviada_em, ultimo_erro')
      .eq('toque', 2)
      .in('pesquisa_id', pesquisaIds);
    const mapa: Record<string, RepescagemEstado> = {};
    for (const linha of data ?? []) mapa[linha.pesquisa_id] = linha as RepescagemEstado;
    setEstado(mapa);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const enfileirar = useCallback(async (ids: string[]) => {
    const { data, error } = await supabase.rpc('enfileirar_repescagem_evasao', {
      p_pesquisa_ids: ids,
    });
    if (error) throw error;
    await recarregar();
    return data as { enfileiradas: unknown[]; recusadas: { pesquisa_id: string; motivo: string }[] };
  }, [recarregar]);

  const cancelar = useCallback(async (pesquisaId: string) => {
    const { error } = await supabase.rpc('cancelar_repescagem_evasao', {
      p_pesquisa_id: pesquisaId,
      p_motivo: 'cancelado na tela',
    });
    if (error) throw error;
    await recarregar();
  }, [recarregar]);

  return { estadoPorPesquisa, enfileirar, cancelar, recarregar, loading };
}
```

- [ ] **Step 4: Acrescentar o tipo**

```typescript
// src/components/App/SucessoCliente/pesquisaEvasao.types.ts
export interface RepescagemEstado {
  pesquisa_id: string;
  status: 'pendente' | 'enviando' | 'enviada' | 'falhou' | 'cancelada';
  agendada_para: string;
  enviada_em: string | null;
  ultimo_erro: string | null;
}

export const MOTIVOS_RECUSA_REPESCAGEM: Record<string, string> = {
  opt_out: 'pediu para não receber mais',
  primeiro_toque_nao_confirmado: 'o 1º envio não teve confirmação',
  ja_respondeu: 'já respondeu',
  muito_cedo: 'menos de 3 dias desde o 1º envio',
  ja_enfileirada: 'já está na fila',
  telefone_ja_respondeu: 'já respondeu por outro aluno',
  template_ausente: 'template de repescagem não encontrado',
  pesquisa_inexistente: 'pesquisa não encontrada',
};
```

- [ ] **Step 5: Ligar na tela**

Em `FilaFollowupEvasao.tsx`: chamar `useRepescagemEvasao(itens.map((i) => i.pesquisa_id))`; acrescentar o botão **Repescar** ao lado de "Marcar realizado / Dispensar / Ir para a conversa"; acrescentar **Repescar todos (N)** no cabeçalho, com confirmação mostrando enfileiradas e recusadas (usando `MOTIVOS_RECUSA_REPESCAGEM`); e renderizar o badge por linha:

| status | badge |
|---|---|
| `pendente` | `na fila · sai HH:MM` (formatar `agendada_para` em BRT) |
| `enviando` | `enviando` |
| `enviada` | `repescada DD/MM` |
| `falhou` | `falhou · <ultimo_erro>` |
| `cancelada` | `cancelada` |

O botão **Cancelar** aparece somente quando `status === 'pendente'`.

- [ ] **Step 6: Rodar os testes e o build**

Run: `node --test tests/repescagemEvasaoFrontend.test.mjs && npx tsc --noEmit`
Expected: PASS e build sem erro de tipo

- [ ] **Step 7: Commit**

```bash
git add src/components/App/SucessoCliente tests/repescagemEvasaoFrontend.test.mjs
git commit -m "feat(repescagem-evasao): botoes, badges de fila e cancelamento na aba de follow-up"
```

---

### Task 9: Documentação e registro

**Files:**
- Modify: `docs/MAPA-SISTEMA.md`, `CLAUDE.md`, `daily-notes/2026-08-27.md`
- Modify: `package.json` (incluir os 4 testes novos no script `test`)

- [ ] **Step 1: Incluir os testes no script `test` do package.json**

Acrescentar ao final da lista do script `"test"`:

```
tests/repescagemEvasaoFilaSchema.test.mjs tests/repescagemEvasaoFilaPostgres.test.mjs tests/repescagemEvasaoWorkerContract.test.mjs tests/repescagemEvasaoFrontend.test.mjs
```

- [ ] **Step 2: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, sem regressão nos testes existentes

- [ ] **Step 3: Atualizar `docs/MAPA-SISTEMA.md`**

Na entrada de Sucesso do Aluno → Acompanhamento, registrar: tabela `pesquisa_evasao_envios_fila`, RPCs `enfileirar_repescagem_evasao` / `claim_repescagem_evasao_job` / `concluir_...` / `falhar_...` / `cancelar_repescagem_evasao`, edge `processar-fila-repescagem-evasao`, cron homônimo.

- [ ] **Step 4: Atualizar `CLAUDE.md`**

Acrescentar um parágrafo na seção de integrações cobrindo, com os ⚠️ do spec: régua de 2 toques; lease vencido vira `falhou` e nunca reenvia; guarda de telefone compartilhado (caso dos irmãos); `pesquisa_evasao_mensagens.direcao='saida'` passa a ser usada; o cron nasce desligado.

- [ ] **Step 5: Registrar em `daily-notes/`**

Arquivo do dia da execução, seção própria: o que entrou, o que ficou pendente (envio de validação com um caso e a decisão de ligar o cron) e os números de partida para comparação futura (31 sem resposta, 11% de taxa de resposta).

- [ ] **Step 6: Commit**

```bash
git add docs CLAUDE.md daily-notes package.json
git commit -m "docs(repescagem-evasao): mapa, contrato e registro do dia"
```

---

## Rollout (fora das tasks — exige presença do Hugo)

1. Confirmar com Hugo e Fabi o texto já aprovado (Task 2).
2. Enfileirar **um caso único**, escolhido junto com o Hugo.
3. Ligar o cron: `select cron.alter_job((select jobid from cron.job where jobname='processar-fila-repescagem-evasao'), active => true);`
4. Acompanhar a linha até `enviada`, conferir a mensagem no WhatsApp e o registro em `pesquisa_evasao_mensagens` com `direcao='saida'`.
5. Só então liberar para a Jessyca.
6. Medir contra pelo menos 20 casos antes de concluir qualquer coisa sobre eficácia.

## Verificações finais

- `select proacl from pg_proc where proname like '%repescagem%'` — nenhuma com `anon`
- `select relacl from pg_class where relname='pesquisa_evasao_envios_fila'` — `authenticated=r`
- leitura da tabela pelos três perfis com `set local role authenticated`
- `select count(*) from pesquisa_evasao_envios_fila where status='enviada'` — deve ser 0 até o rollout
