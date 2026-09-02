# Fechamento Mensal Automático — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a competência mensal fechar sozinha no dia 1º, por unidade, e gritar no Telegram quando não fechar.

**Architecture:** pg_cron executa no banco (dia 1º, 09h BRT) uma função orquestradora que, por unidade e em bloco protegido, garante o bloco financeiro no snapshot gerencial, captura os 2 domínios mensais e fecha a competência daquela unidade. Um job separado na VPS la-hq confere 2h depois e alarma pelo `cron-alerta.py`. Executor e alarme falham de forma independente.

**Tech Stack:** PostgreSQL 15 (Supabase, projeto `ouqwbbermlzqqvtqwlul`), pg_cron, PL/pgSQL, Python 3 (script do vigia), Node `node --test` (testes de contrato).

**Spec:** [`docs/superpowers/specs/2026-09-02-fechamento-mensal-automatico-design.md`](../specs/2026-09-02-fechamento-mensal-automatico-design.md)

## Global Constraints

- **Timezone:** BRT (UTC−3). `CURRENT_DATE` no banco é UTC — usar sempre `(now() at time zone 'America/Sao_Paulo')::date` para data de negócio.
- **Toda função nova ou recriada:** conferir `proacl` depois com `select proacl from pg_proc where proname = '<nome>'`. Esperado: `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. **Sem `anon`.** O schema `public` tem `ALTER DEFAULT PRIVILEGES` concedendo EXECUTE a `anon`, então `revoke execute ... from anon` precisa ser **nominal**, não só `from public`.
- **Nunca `CREATE OR REPLACE` com lista de parâmetros diferente** — cria overload novo. Se a assinatura muda, `drop function` da antiga explicitamente no mesmo commit e conferir `select oid::regprocedure from pg_proc where proname='<nome>'` devolvendo uma linha só.
- **Migrations:** `supabase/migrations/YYYYMMDDHHMMSS_<nome>.sql`, aplicadas por `mcp__supabase__apply_migration`. Aplicação em produção exige confirmação do Hugo antes.
- **Nunca validar cron por `cron.job_run_details`** — ele marca `succeeded` só por ter enfileirado o `net.http_post`. Validar sempre pelo efeito.
- **Autor dos commits:** `Luciano <lucianoalf.la@gmail.com>`.
- **Unidades de produção — são exatamente 3, todas ativas** (conferido no banco em 02/09/2026): Barra `368d47f5-2d88-4475-bc14-ba084a9a348e`, Campo Grande `2ec861f6-023f-4d7b-9927-3960ad8c2a92`, Recreio `95553e96-971b-4590-a6eb-0201d013c14d`. Não há unidade de teste com `ativo = true` — o orquestrador pode iterar `where u.ativo = true` sem filtro extra.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260902120000_garantir_bloco_financeiro_gerencial.sql` | Função que injeta o bloco de faturas no snapshot gerencial quando ausente |
| `supabase/migrations/20260902120500_fechar_competencia_mensal_canonica_v2.sql` | Fechamento por unidade, com filtro de escopo |
| `supabase/migrations/20260902121000_fechamento_automatico_dia1.sql` | Troca a guarda de `fechar_competencia_mensal_automatico` para o dia 1º |
| `supabase/migrations/20260902121500_fechamento_mensal_execucoes.sql` | Tabela de placar das execuções |
| `supabase/migrations/20260902122000_fechar_competencia_mensal_dia1.sql` | Orquestrador do dia 1º |
| `supabase/migrations/20260902122500_cron_fechamento_dia1.sql` | Cria o cron (desligado) e desativa o jobid 83 |
| `tests/fechamentoMensalBlocoFinanceiro.test.mjs` | Contrato da Task 1 |
| `tests/fechamentoMensalFecharPorUnidade.test.mjs` | Contrato da Task 2 |
| `tests/fechamentoMensalOrquestrador.test.mjs` | Contrato das Tasks 4 e 5 |
| `fiscal mila/agents/sol/scripts/verifica-fechamento-mensal.py` | Vigia na la-hq |
| `docs/MAPA-SISTEMA.md`, `CLAUDE.md` | Documentação, atualizadas na Task 7 |

---

### Task 1: Bloco financeiro no snapshot gerencial

**Files:**
- Create: `supabase/migrations/20260902120000_garantir_bloco_financeiro_gerencial.sql`
- Test: `tests/fechamentoMensalBlocoFinanceiro.test.mjs`

**Interfaces:**
- Consumes: `get_financeiro_faturas_emusys(uuid, integer, integer) returns jsonb` (já existe)
- Produces: `garantir_bloco_financeiro_gerencial_v1(p_ano integer, p_mes integer, p_unidade_id uuid) returns jsonb`, devolvendo `{ok, acao, snapshot_id, versao, motivo}` onde `acao ∈ ('ja_presente','gravado','fonte_indisponivel','snapshot_ausente')`

**Contexto que o implementador precisa:**

O snapshot `relatorio_gerencial` nasce sem o bloco de faturas, e `get_relatorio_admin_mensal_rico_base_v1` lê os três indicadores financeiros dele:

```sql
v_financeiro := coalesce(
    v_gerencial.payload#>'{financeiro_faturas_emusys,totais}',
    v_gerencial.payload#>'{kpis_gestao,0,financeiro_faturas_emusys}',
    v_gerencial.payload#>'{dados_mes_atual,0,financeiro_faturas_emusys}',
    '{}'::jsonb
);
```

Gravamos na **segunda** forma (`kpis_gestao[0]`), que é a do v2 de agosto já validado em produção.

`get_financeiro_faturas_emusys(unidade, ano, mes)` devolve `{status, tem_dados, totais, integrity, freshness, ...}`. O `totais` tem exatamente as chaves do bloco: `ticket_medio`, `faturamento_previsto`, `mrr_atual`, `valor_aberto_parcelas`, `faturas_parcela_abertas`, entre outras.

Derivados a atualizar em `kpis_gestao[0]`, conferidos contra o v2 de agosto (Recreio):

| campo | fórmula | valor esperado no gabarito |
|---|---|---|
| `faturamento_previsto` | `totais->>'faturamento_previsto'` | 144786.97 |
| `faturamento_realizado` | `totais->>'mrr_atual'` | 143346.97 |
| `inadimplentes` | `totais->>'faturas_parcela_abertas'` | 3 |
| `inadimplencia_valor` | `totais->>'valor_aberto_parcelas'` | 1440 |
| `inadimplencia` e `inadimplencia_pct` | `round(inadimplentes / alunos_pagantes * 100, 2)` | 0.92 (3/325) |

⚠️ `alunos_pagantes` vem do próprio `kpis_gestao[0]`, não recalcular.
⚠️ `ticket_medio` de `kpis_gestao` **não** muda (fica 452.15 no gabarito) — quem muda é o de dentro do bloco.
⚠️ `capturado_em` da nova versão é **copiado** da versão anterior: ele é o corte que a lista do relatório usa.

- [ ] **Step 1: Escrever o teste de contrato que falha**

```javascript
// tests/fechamentoMensalBlocoFinanceiro.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migracao = path.join(
  root,
  'supabase/migrations/20260902120000_garantir_bloco_financeiro_gerencial.sql',
);

test('a migration do bloco financeiro existe', () => {
  assert.ok(fs.existsSync(migracao), 'migration nao encontrada');
});

test('grava o bloco na forma canonica kpis_gestao[0]', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(sql, /kpis_gestao,0,financeiro_faturas_emusys/u);
});

test('preserva capturado_em da versao anterior', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(sql, /capturado_em/u);
  assert.doesNotMatch(
    sql,
    /capturado_em\s*\)?\s*values[^;]*now\(\)/isu,
    'capturado_em nao pode ser now() — e o corte que a lista do relatorio usa',
  );
});

test('e fail-closed quando a fonte financeira nao tem dados', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(sql, /fonte_indisponivel/u);
  assert.match(sql, /tem_dados/u);
});

test('nunca sobrescreve bloco ja existente', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(sql, /ja_presente/u);
});

test('revoga execute de anon nominalmente', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function\s+public\.garantir_bloco_financeiro_gerencial_v1[^;]*from[^;]*anon/isu,
    'ALTER DEFAULT PRIVILEGES concede execute a anon — revoke precisa ser nominal',
  );
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/fechamentoMensalBlocoFinanceiro.test.mjs`
Expected: FAIL — "migration nao encontrada"

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/20260902120000_garantir_bloco_financeiro_gerencial.sql
--
-- O snapshot relatorio_gerencial nasce SEM o bloco de faturas do Emusys, porque
-- get_dados_relatorio_gerencial produz ticket_medio/faturamento_previsto/mrr do
-- cadastro local (fonte: "vivo") e nunca consulta financeiro_faturas_emusys.
-- Sem o bloco, get_relatorio_admin_mensal_rico_base_v1 levanta
-- RELATORIO_ADMIN_MENSAL_INDICADORES_AUSENTES e o relatorio mensal nao abre.
--
-- Retificar NAO resolve: a leitura consome v_gerencial.payload (cru) e nunca
-- consulta fechamento_mensal_retificacoes. Provado em 01/09/2026 -- as 3
-- retificacoes aplicadas ficaram corretas e inertes. O que destravou agosto foi
-- regravar o snapshot como versao 2.

create or replace function public.garantir_bloco_financeiro_gerencial_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot record;
  v_financeiro jsonb;
  v_totais jsonb;
  v_gestao jsonb;
  v_payload jsonb;
  v_pagantes numeric;
  v_inadimplentes numeric;
  v_pct numeric;
  v_novo_id uuid;
  v_versao integer;
begin
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_BLOCO_FINANCEIRO_GERENCIAL';
  end if;

  select s.id, s.payload, s.versao, s.capturado_em, s.status
    into v_snapshot
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id
    and s.dominio = 'relatorio_gerencial'
    and s.status in ('aprovado', 'fechado')
  order by s.versao desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false, 'acao', 'snapshot_ausente',
      'motivo', 'nenhum snapshot relatorio_gerencial aprovado/fechado na competencia'
    );
  end if;

  -- Ja presente em qualquer das 3 formas que a leitura aceita.
  if coalesce(
       v_snapshot.payload #> '{financeiro_faturas_emusys,totais}',
       v_snapshot.payload #> '{kpis_gestao,0,financeiro_faturas_emusys}',
       v_snapshot.payload #> '{dados_mes_atual,0,financeiro_faturas_emusys}'
     ) is not null then
    return jsonb_build_object(
      'ok', true, 'acao', 'ja_presente',
      'snapshot_id', v_snapshot.id, 'versao', v_snapshot.versao
    );
  end if;

  v_financeiro := public.get_financeiro_faturas_emusys(p_unidade_id, p_ano, p_mes);

  if coalesce((v_financeiro->>'tem_dados')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false, 'acao', 'fonte_indisponivel',
      'motivo', coalesce(v_financeiro->>'status', 'sem status'),
      'integrity', v_financeiro->'integrity'
    );
  end if;

  v_totais := v_financeiro->'totais';

  if jsonb_typeof(v_snapshot.payload->'kpis_gestao') <> 'array'
     or v_snapshot.payload->'kpis_gestao'->0 is null then
    return jsonb_build_object(
      'ok', false, 'acao', 'snapshot_ausente',
      'motivo', 'payload sem kpis_gestao[0]'
    );
  end if;

  v_gestao := v_snapshot.payload->'kpis_gestao'->0;
  v_pagantes := nullif((v_gestao->>'alunos_pagantes')::numeric, 0);
  v_inadimplentes := coalesce((v_totais->>'faturas_parcela_abertas')::numeric, 0);
  v_pct := case when v_pagantes is null then null
                else round(v_inadimplentes / v_pagantes * 100, 2) end;

  v_gestao := v_gestao
    || jsonb_build_object(
         'financeiro_faturas_emusys', v_totais,
         'faturamento_previsto',  (v_totais->>'faturamento_previsto')::numeric,
         'faturamento_realizado', (v_totais->>'mrr_atual')::numeric,
         'inadimplentes',         v_inadimplentes::integer,
         'inadimplencia_valor',   (v_totais->>'valor_aberto_parcelas')::numeric
       );

  if v_pct is not null then
    v_gestao := v_gestao || jsonb_build_object(
      'inadimplencia', v_pct, 'inadimplencia_pct', v_pct
    );
  end if;

  v_payload := jsonb_set(v_snapshot.payload, '{kpis_gestao,0}', v_gestao, false);

  select coalesce(max(s.versao), 0) + 1 into v_versao
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano and s.mes = p_mes and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id and s.dominio = 'relatorio_gerencial';

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, observacao,
    capturado_em, capturado_por, aprovado_em, aprovado_por
  ) values (
    p_ano, p_mes, 'unidade', p_unidade_id, 'relatorio_gerencial', v_versao,
    'aprovado', 'garantir_bloco_financeiro_gerencial_v1',
    v_payload, public.hash_jsonb_canonico(v_payload),
    format('Bloco financeiro do Emusys embutido na captura (versao anterior: %s)', v_snapshot.versao),
    v_snapshot.capturado_em,  -- corte preservado de proposito
    auth.uid(), now(), auth.uid()
  ) returning id into v_novo_id;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_novo_id, p_ano, p_mes, 'unidade', p_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'relatorio_gerencial', 'versao', v_versao,
      'origem', 'garantir_bloco_financeiro_gerencial_v1',
      'versao_anterior', v_snapshot.versao
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true, 'acao', 'gravado',
    'snapshot_id', v_novo_id, 'versao', v_versao
  );
end;
$$;

revoke all on function public.garantir_bloco_financeiro_gerencial_v1(integer, integer, uuid) from public;
revoke execute on function public.garantir_bloco_financeiro_gerencial_v1(integer, integer, uuid) from anon;
grant execute on function public.garantir_bloco_financeiro_gerencial_v1(integer, integer, uuid) to service_role;

comment on function public.garantir_bloco_financeiro_gerencial_v1(integer, integer, uuid) is
  'Embute financeiro_faturas_emusys.totais em kpis_gestao[0] do snapshot relatorio_gerencial quando ausente, gravando nova versao. Fail-closed se a fonte nao tiver dados. Nunca sobrescreve bloco existente.';
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/fechamentoMensalBlocoFinanceiro.test.mjs`
Expected: PASS (6 testes)

- [ ] **Step 5: Aplicar a migration e validar contra o gabarito de agosto**

Aplicar via `mcp__supabase__apply_migration` (**pedir OK ao Hugo antes** — escreve em produção).

Validação: a função rodada sobre agosto deve devolver `ja_presente` nas 3 unidades, porque o v2 já existe. Para provar que a **lógica** está certa, comparar o que ela produziria com o v2 real:

```sql
-- Gabarito: v2 de agosto do Recreio, feito a mao em 01/09 e validado end-to-end.
with esperado as (
  select payload->'kpis_gestao'->0 as gestao
  from fechamento_mensal_snapshots
  where dominio='relatorio_gerencial' and ano=2026 and mes=8 and versao=2
    and unidade_id='95553e96-971b-4590-a6eb-0201d013c14d'
), calculado as (
  select (get_financeiro_faturas_emusys(
    '95553e96-971b-4590-a6eb-0201d013c14d', 2026, 8)->'totais') as totais
)
select
  (e.gestao->'financeiro_faturas_emusys') = c.totais            as bloco_igual,
  (e.gestao->>'inadimplentes')::numeric
    = (c.totais->>'faturas_parcela_abertas')::numeric           as inadimplentes_igual,
  (e.gestao->>'inadimplencia_valor')::numeric
    = (c.totais->>'valor_aberto_parcelas')::numeric             as valor_igual,
  (e.gestao->>'faturamento_realizado')::numeric
    = (c.totais->>'mrr_atual')::numeric                         as realizado_igual
from esperado e, calculado c;
```

Expected: as 4 colunas `true`.

- [ ] **Step 6: Conferir a ACL**

```sql
select proacl from pg_proc where proname = 'garantir_bloco_financeiro_gerencial_v1';
```

Expected: sem `anon=X`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260902120000_garantir_bloco_financeiro_gerencial.sql tests/fechamentoMensalBlocoFinanceiro.test.mjs
git commit -m "feat(fechamento): embute bloco financeiro do Emusys no snapshot gerencial (LAPE-14)"
```

---

### Task 2: Fechamento por unidade

**Files:**
- Create: `supabase/migrations/20260902120500_fechar_competencia_mensal_canonica_v2.sql`
- Test: `tests/fechamentoMensalFecharPorUnidade.test.mjs`

**Interfaces:**
- Consumes: `fechar_competencia(uuid, integer, integer, text, text, uuid) returns jsonb` (já existe)
- Produces: `fechar_competencia_mensal_canonica_v2(p_ano integer, p_mes integer, p_motivo text, p_unidade_id uuid, p_lote_id uuid default null) returns jsonb`, devolvendo `{ok, ano, mes, unidade_id, fechamento_lote_id, snapshots_fechados}`

**Contexto:** a v1 é tudo-ou-nada — varre todas as unidades ativas, exige 6 domínios em cada uma e lança `FECHAMENTO_RELATORIO_MENSAL_INCOMPLETO`. Não aceita unidade. A v1 **fica intacta**; a v2 é função nova, com nome novo.

⚠️ O `UPDATE` da v1 é global: `where s.ano = p_ano and s.mes = p_mes and s.status = 'aprovado'`, **sem filtro de escopo**. Existem **11 snapshots de escopo `consolidado`** em 2026 — sem `escopo = 'unidade' and unidade_id = p_unidade_id`, fechar uma unidade carimbaria o consolidado junto.

Os 6 domínios exigidos: `alunos_admin`, `alunos_executivo`, `comercial`, `relatorio_gerencial`, `relatorio_admin_mensal`, `relatorio_comercial_mensal`.

- [ ] **Step 1: Escrever o teste de contrato que falha**

```javascript
// tests/fechamentoMensalFecharPorUnidade.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migracao = path.join(
  root,
  'supabase/migrations/20260902120500_fechar_competencia_mensal_canonica_v2.sql',
);
const sql = () => fs.readFileSync(migracao, 'utf8');

test('a migration existe', () => {
  assert.ok(fs.existsSync(migracao));
});

test('o update de snapshots filtra escopo E unidade', () => {
  const corpo = sql();
  const update = corpo.slice(corpo.search(/update\s+public\.fechamento_mensal_snapshots/iu));
  assert.match(update, /escopo\s*=\s*'unidade'/u,
    'sem filtro de escopo, fechar uma unidade carimba os 11 snapshots consolidados');
  assert.match(update, /unidade_id\s*=\s*p_unidade_id/u);
});

test('exige os 6 dominios da unidade', () => {
  const corpo = sql();
  for (const dominio of [
    'alunos_admin', 'alunos_executivo', 'comercial',
    'relatorio_gerencial', 'relatorio_admin_mensal', 'relatorio_comercial_mensal',
  ]) {
    assert.ok(corpo.includes(dominio), `dominio ausente: ${dominio}`);
  }
});

test('nao altera a v1', () => {
  const corpo = sql();
  assert.doesNotMatch(
    corpo,
    /(create\s+or\s+replace|drop)\s+function\s+public\.fechar_competencia_mensal_canonica_v1/isu,
    'a v1 tem consumidores e deve ficar intacta',
  );
});

test('revoga execute de anon nominalmente', () => {
  assert.match(
    sql(),
    /revoke\s+execute\s+on\s+function\s+public\.fechar_competencia_mensal_canonica_v2[^;]*from[^;]*anon/isu,
  );
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/fechamentoMensalFecharPorUnidade.test.mjs`
Expected: FAIL — "a migration existe"

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/20260902120500_fechar_competencia_mensal_canonica_v2.sql
--
-- fechar_competencia_mensal_canonica_v1 e tudo-ou-nada por construcao: varre
-- todas as unidades ativas e explode se faltar dominio em qualquer uma. Em
-- agosto/2026 isso deixou Barra e Recreio sem relatorio por causa de UM aluno
-- de Campo Grande. Esta v2 fecha uma unidade por vez.
--
-- A v1 fica intacta -- tem consumidores e continua sendo o caminho manual.

create or replace function public.fechar_competencia_mensal_canonica_v2(
  p_ano integer,
  p_mes integer,
  p_motivo text,
  p_unidade_id uuid,
  p_lote_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote_id uuid := coalesce(p_lote_id, gen_random_uuid());
  v_nome text;
  v_faltantes text[];
  v_snapshots_fechados integer := 0;
begin
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_FECHAMENTO_RELATORIO_MENSAL';
  end if;
  if p_ano is null or p_mes not between 1 and 12
     or nullif(btrim(coalesce(p_motivo, '')), '') is null
     or p_unidade_id is null then
    raise exception 'FECHAMENTO_RELATORIO_MENSAL_PARAMETROS_INVALIDOS';
  end if;

  select u.nome into v_nome
  from public.unidades u
  where u.id = p_unidade_id and u.ativo = true;

  if not found then
    raise exception 'FECHAMENTO_RELATORIO_MENSAL_UNIDADE_INVALIDA: %', p_unidade_id;
  end if;

  select array_agg(esperado.dominio order by esperado.dominio)
    into v_faltantes
  from (values
    ('alunos_admin'::text),
    ('alunos_executivo'::text),
    ('comercial'::text),
    ('relatorio_gerencial'::text),
    ('relatorio_admin_mensal'::text),
    ('relatorio_comercial_mensal'::text)
  ) esperado(dominio)
  where not exists (
    select 1
    from public.fechamento_mensal_snapshots s
    where s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.unidade_id = p_unidade_id
      and s.dominio = esperado.dominio
      and s.status in ('aprovado', 'fechado')
  );

  if v_faltantes is not null then
    raise exception 'FECHAMENTO_RELATORIO_MENSAL_INCOMPLETO: unidade %, dominio(s) ausente(s): %',
      v_nome, array_to_string(v_faltantes, ', ');
  end if;

  perform public.fechar_competencia(
    p_unidade_id, p_ano, p_mes,
    'relatorios_mensais_canonicos_v2', p_motivo, v_lote_id
  );

  with atualizados as (
    update public.fechamento_mensal_snapshots s
    set status = 'fechado',
        fechado_em = now(),
        fechado_por = auth.uid(),
        updated_at = now()
    where s.ano = p_ano
      and s.mes = p_mes
      and s.status = 'aprovado'
      and s.escopo = 'unidade'          -- sem isto, os 11 snapshots consolidados
      and s.unidade_id = p_unidade_id   -- de 2026 seriam carimbados junto
    returning s.id, s.escopo, s.dominio, s.versao
  ), auditados as (
    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    )
    select a.id, p_ano, p_mes, a.escopo, p_unidade_id, 'snapshot_fechado',
      jsonb_build_object(
        'dominio', a.dominio, 'versao', a.versao,
        'fechamento_lote_id', v_lote_id, 'motivo', p_motivo,
        'origem', 'fechar_competencia_mensal_canonica_v2'
      ),
      auth.uid()
    from atualizados a
    returning snapshot_id
  )
  select count(*)::integer into v_snapshots_fechados from auditados;

  return jsonb_build_object(
    'ok', true, 'ano', p_ano, 'mes', p_mes,
    'unidade_id', p_unidade_id, 'unidade_nome', v_nome,
    'fechamento_lote_id', v_lote_id,
    'snapshots_fechados', v_snapshots_fechados
  );
end;
$$;

revoke all on function public.fechar_competencia_mensal_canonica_v2(integer, integer, text, uuid, uuid) from public;
revoke execute on function public.fechar_competencia_mensal_canonica_v2(integer, integer, text, uuid, uuid) from anon;
grant execute on function public.fechar_competencia_mensal_canonica_v2(integer, integer, text, uuid, uuid) to service_role;

comment on function public.fechar_competencia_mensal_canonica_v2(integer, integer, text, uuid, uuid) is
  'Fecha a competencia mensal de UMA unidade. Diferente da v1 (tudo-ou-nada), permite que unidade travada nao segure as outras. Filtra escopo=unidade no UPDATE para nao carimbar snapshots consolidados.';
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/fechamentoMensalFecharPorUnidade.test.mjs`
Expected: PASS (5 testes)

- [ ] **Step 5: Aplicar e conferir ACL + unicidade da assinatura**

Aplicar via MCP (**OK do Hugo antes**), depois:

```sql
select oid::regprocedure, proacl
from pg_proc where proname like 'fechar_competencia_mensal_canonica%';
```

Expected: 2 linhas (v1 e v2), nenhuma com `anon`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260902120500_fechar_competencia_mensal_canonica_v2.sql tests/fechamentoMensalFecharPorUnidade.test.mjs
git commit -m "feat(fechamento): fechamento mensal por unidade, sem travar as demais (LAPE-14)"
```

---

### Task 3: Captura dos 7 domínios passa para o dia 1º

**Files:**
- Create: `supabase/migrations/20260902121000_fechamento_automatico_dia1.sql`

**Interfaces:**
- Produces: `fechar_competencia_mensal_automatico()` com guarda nova — executa no **dia 1º** e usa a competência do **mês anterior**

**Contexto:** hoje ela roda às 22h BRT do último dia, com o mês ainda por correr — matrícula ou evasão lançada nesse intervalo fica de fora. A guarda atual é:

```sql
v_ultimo_dia := (date_trunc('month', v_hoje_brt) + interval '1 month - 1 day')::date;
if v_hoje_brt <> v_ultimo_dia then return ... 'ignorado' ...
```

⚠️ Essa função também chama `atualizar_dados_mensais_por_snapshot` e `capturar_carteira_professores_mensal`. Com o mês encerrado de verdade, os números de `dados_mensais` podem mudar — é o efeito desejado, e é conferido na Task 7.

⚠️ O corpo anterior vai **comentado no cabeçalho** da migration, para o rollback ser copiar e colar.

- [ ] **Step 1: Conferir que o corpo em produção ainda é o esperado**

```sql
select md5(prosrc) from pg_proc where proname = 'fechar_competencia_mensal_automatico';
```

Expected: o corpo deve continuar sendo o transcrito no cabeçalho da migration do Step 2 (capturado em 02/09/2026). Se divergir, outra sessão mexeu na função — **parar e comparar** antes de sobrescrever.

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/20260902121000_fechamento_automatico_dia1.sql
--
-- A captura dos 7 dominios rodava as 22h BRT do ultimo dia do mes -- com 2 horas
-- ainda por correr. Movimentacao lancada nesse intervalo ficava de fora do
-- snapshot. Passa a rodar no dia 1o, sobre a competencia do mes anterior.
--
-- ROLLBACK: corpo anterior (guarda de ultimo dia do mes), capturado em 02/09/2026.
/*
declare
  v_hoje_brt date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ultimo_dia date;
  v_ano integer;
  v_mes integer;
  v_ja_existe integer;
  v_snapshot jsonb;
  v_compat jsonb;
begin
  v_ultimo_dia := (date_trunc('month', v_hoje_brt) + interval '1 month - 1 day')::date;

  if v_hoje_brt <> v_ultimo_dia then
    return jsonb_build_object(
      'ok', true,
      'ignorado', true,
      'motivo', 'execucao permitida apenas no ultimo dia do mes (BRT)',
      'hoje_brt', v_hoje_brt,
      'ultimo_dia_brt', v_ultimo_dia
    );
  end if;

  v_ano := extract(year from v_hoje_brt)::integer;
  v_mes := extract(month from v_hoje_brt)::integer;

  select count(*) into v_ja_existe
  from public.fechamento_mensal_snapshots s
  where s.ano = v_ano
    and s.mes = v_mes
    and s.status in ('aprovado', 'fechado');

  if v_ja_existe > 0 then
    return jsonb_build_object(
      'ok', true,
      'ja_fechado', true,
      'ano', v_ano,
      'mes', v_mes,
      'linhas_existentes', v_ja_existe
    );
  end if;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_snapshot := public.gravar_snapshot_fechamento_mensal(
    v_ano,
    v_mes,
    null,
    format('fechamento automatico %s/%s - cron ultimo dia 22h BRT', v_mes, v_ano),
    true
  );

  v_compat := public.atualizar_dados_mensais_por_snapshot(v_ano, v_mes, null, false);

  -- Carteira do professor (agregado + detalhe): capturada na MESMA
  -- execucao do fechamento geral, para nunca divergir por timing.
  -- Envolvida em bloco protegido: falha aqui vira aviso, nao derruba
  -- o fechamento de Comercial/Alunos/Gerencial ja concluido acima.
  begin
    perform public.capturar_carteira_professores_mensal(make_date(v_ano, v_mes, 1));
  exception when others then
    raise warning 'Falha ao capturar carteira de professores em %/%: %', v_mes, v_ano, sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'ano', v_ano,
    'mes', v_mes,
    'executado_em_brt', now() at time zone 'America/Sao_Paulo',
    'snapshots_gravados', v_snapshot->'snapshot_count',
    'dados_mensais_linhas', v_compat->'linhas_atualizadas'
  );
end;
*/

create or replace function public.fechar_competencia_mensal_automatico()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje_brt date := (now() at time zone 'America/Sao_Paulo')::date;
  v_competencia date;
  v_ano integer;
  v_mes integer;
  v_ja_existe integer;
  v_snapshot jsonb;
  v_compat jsonb;
begin
  if extract(day from v_hoje_brt)::integer <> 1 then
    return jsonb_build_object(
      'ok', true, 'ignorado', true,
      'motivo', 'execucao permitida apenas no dia 1o do mes (BRT)',
      'hoje_brt', v_hoje_brt
    );
  end if;

  v_competencia := (date_trunc('month', v_hoje_brt) - interval '1 month')::date;
  v_ano := extract(year from v_competencia)::integer;
  v_mes := extract(month from v_competencia)::integer;

  select count(*) into v_ja_existe
  from public.fechamento_mensal_snapshots s
  where s.ano = v_ano and s.mes = v_mes
    and s.status in ('aprovado', 'fechado');

  if v_ja_existe > 0 then
    return jsonb_build_object(
      'ok', true, 'ja_fechado', true,
      'ano', v_ano, 'mes', v_mes, 'linhas_existentes', v_ja_existe
    );
  end if;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_snapshot := public.gravar_snapshot_fechamento_mensal(
    v_ano, v_mes, null,
    format('fechamento automatico %s/%s - cron dia 1o 09h BRT', v_mes, v_ano),
    true
  );

  v_compat := public.atualizar_dados_mensais_por_snapshot(v_ano, v_mes, null, false);

  begin
    perform public.capturar_carteira_professores_mensal(make_date(v_ano, v_mes, 1));
  exception when others then
    raise warning 'Falha ao capturar carteira de professores em %/%: %', v_mes, v_ano, sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true, 'ano', v_ano, 'mes', v_mes,
    'executado_em_brt', now() at time zone 'America/Sao_Paulo',
    'snapshots_gravados', v_snapshot->'snapshot_count',
    'dados_mensais_linhas', v_compat->'linhas_atualizadas'
  );
end;
$$;

revoke all on function public.fechar_competencia_mensal_automatico() from public;
revoke execute on function public.fechar_competencia_mensal_automatico() from anon;
grant execute on function public.fechar_competencia_mensal_automatico() to service_role;
```

- [ ] **Step 3: Provar a guarda nova sem escrever nada**

Como hoje não é dia 1º, a função deve responder `ignorado`:

```sql
select public.fechar_competencia_mensal_automatico();
```

Expected: `{"ok": true, "ignorado": true, "motivo": "execucao permitida apenas no dia 1o do mes (BRT)", ...}`

⚠️ Se hoje **for** dia 1º, **não rodar este passo** — ela escreveria. Nesse caso, provar a guarda com a data simulada em transação abortada:

```sql
begin;
select extract(day from ((now() at time zone 'America/Sao_Paulo')::date))::integer as dia_hoje;
rollback;
```

- [ ] **Step 4: Conferir a ACL**

```sql
select proacl from pg_proc where proname = 'fechar_competencia_mensal_automatico';
```

Expected: sem `anon`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260902121000_fechamento_automatico_dia1.sql
git commit -m "fix(fechamento): captura dos 7 dominios passa das 22h do dia 31 para o dia 1o (LAPE-14)"
```

---

### Task 4: Tabela de placar e orquestrador do dia 1º

**Files:**
- Create: `supabase/migrations/20260902121500_fechamento_mensal_execucoes.sql`
- Create: `supabase/migrations/20260902122000_fechar_competencia_mensal_dia1.sql`
- Test: `tests/fechamentoMensalOrquestrador.test.mjs`

**Interfaces:**
- Consumes: `fechar_competencia_mensal_automatico()` (Task 3), `garantir_bloco_financeiro_gerencial_v1(integer, integer, uuid)` (Task 1), `capturar_relatorios_mensais_canonicos_v1(integer, integer, uuid)` (existe), `fechar_competencia_mensal_canonica_v2(integer, integer, text, uuid, uuid)` (Task 2)
- Produces: tabela `fechamento_mensal_execucoes` e `fechar_competencia_mensal_dia1_v1() returns jsonb` com `{ok, ano, mes, execucao_id, unidades_fechadas, unidades_com_erro, detalhes[]}`

**Contexto:** cada unidade roda dentro de `begin ... exception when others`, que em PL/pgSQL abre uma subtransação — **falha numa unidade não desfaz as outras**.

⚠️ `statement_timeout` do papel `authenticator` é 8s e vale até para `service_role`; o fechamento levou 58s em agosto. A função precisa de `SET statement_timeout` própria, no mesmo padrão de `publish_financeiro_sync_run` (migration `20260828210500`).

⚠️ Idempotência já vem das dependências: `capturar_relatorios_mensais_canonicos_v1` faz `continue` quando os 2 domínios existem, e a v2 só promove `status='aprovado'`. Não criar trava nova.

- [ ] **Step 1: Escrever o teste de contrato que falha**

```javascript
// tests/fechamentoMensalOrquestrador.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migracoes = path.join(root, 'supabase/migrations');
const tabela = path.join(migracoes, '20260902121500_fechamento_mensal_execucoes.sql');
const orquestrador = path.join(migracoes, '20260902122000_fechar_competencia_mensal_dia1.sql');

test('as migrations existem', () => {
  assert.ok(fs.existsSync(tabela), 'migration da tabela de placar ausente');
  assert.ok(fs.existsSync(orquestrador), 'migration do orquestrador ausente');
});

test('cada unidade roda em bloco protegido', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(sql, /exception\s+when\s+others/iu,
    'sem bloco protegido, uma unidade travada aborta a transacao inteira');
  assert.match(sql, /sqlerrm/iu, 'o erro precisa ser capturado para virar alarme legivel');
  assert.match(sql, /sqlstate/iu);
});

test('libera o statement_timeout da funcao', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(sql, /statement_timeout/u,
    'o papel authenticator corta em 8s e o fechamento leva ~60s');
});

test('respeita a ordem: bloco financeiro antes da captura mensal', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  const posBloco = sql.indexOf('garantir_bloco_financeiro_gerencial_v1');
  const posCaptura = sql.indexOf('capturar_relatorios_mensais_canonicos_v1');
  assert.ok(posBloco > -1 && posCaptura > -1, 'ambas as chamadas devem existir');
  assert.ok(
    posBloco < posCaptura,
    'montar_relatorio_admin_mensal_payload_v1 le o gerencial por versao desc — '
      + 'o bloco tem de existir antes da captura',
  );
});

test('usa a v2 (por unidade), nao a v1 tudo-ou-nada', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(sql, /fechar_competencia_mensal_canonica_v2/u);
});

test('a competencia alvo e o mes anterior', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(sql, /interval\s+'1 month'/u);
  assert.match(sql, /America\/Sao_Paulo/u, 'data de negocio precisa ser BRT, nao UTC');
});

test('revoga execute de anon nominalmente', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function\s+public\.fechar_competencia_mensal_dia1_v1[^;]*from[^;]*anon/isu,
  );
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/fechamentoMensalOrquestrador.test.mjs`
Expected: FAIL — "migration da tabela de placar ausente"

- [ ] **Step 3: Escrever a migration da tabela**

```sql
-- supabase/migrations/20260902121500_fechamento_mensal_execucoes.sql
--
-- Placar de cada execucao do fechamento automatico. Existe para o vigia da
-- la-hq poder dizer QUAL unidade travou e com QUAL erro -- em 31/08/2026 o
-- cron respondeu "succeeded" e ninguem soube que o mes nao tinha fechado.

create table if not exists public.fechamento_mensal_execucoes (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  origem text not null default 'cron_dia1',
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz,
  unidades_fechadas integer not null default 0,
  unidades_com_erro integer not null default 0,
  detalhes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fechamento_mensal_execucoes_competencia_idx
  on public.fechamento_mensal_execucoes (ano desc, mes desc, iniciado_em desc);

alter table public.fechamento_mensal_execucoes enable row level security;

revoke all on table public.fechamento_mensal_execucoes from public, anon, authenticated;
grant select, insert, update on table public.fechamento_mensal_execucoes to service_role;

create policy fechamento_mensal_execucoes_leitura_admin
  on public.fechamento_mensal_execucoes
  for select
  to authenticated
  using ((select public.is_admin()));

comment on table public.fechamento_mensal_execucoes is
  'Placar do fechamento mensal automatico. Alimenta o vigia da la-hq, que le daqui o motivo da falha por unidade.';
```

- [ ] **Step 4: Escrever a migration do orquestrador**

```sql
-- supabase/migrations/20260902122000_fechar_competencia_mensal_dia1.sql
--
-- Orquestrador do fechamento mensal, dia 1o as 09h BRT.
--
-- Ordem obrigatoria por unidade:
--   0. captura dos 7 dominios (fechar_competencia_mensal_automatico, uma vez)
--   1. frescor da fonte financeira
--   2. bloco financeiro no snapshot gerencial   <- ANTES da captura mensal,
--   3. captura dos 2 dominios mensais              porque montar_..._payload_v1
--   4. fechamento da unidade                       le o gerencial por versao desc
--
-- Cada unidade roda em bloco protegido: em agosto/2026 um aluno de Campo Grande
-- deixou Barra e Recreio sem relatorio.

create or replace function public.fechar_competencia_mensal_dia1_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'   -- authenticator corta em 8s; o fechamento leva ~60s
as $$
declare
  v_hoje_brt date := (now() at time zone 'America/Sao_Paulo')::date;
  v_competencia date;
  v_ano integer;
  v_mes integer;
  v_execucao_id uuid;
  v_lote_id uuid := gen_random_uuid();
  v_unidade record;
  v_financeiro jsonb;
  v_bloco jsonb;
  v_detalhes jsonb := '[]'::jsonb;
  v_ok integer := 0;
  v_erro integer := 0;
  v_motivo text;
begin
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_FECHAMENTO_DIA1';
  end if;

  v_competencia := (date_trunc('month', v_hoje_brt) - interval '1 month')::date;
  v_ano := extract(year from v_competencia)::integer;
  v_mes := extract(month from v_competencia)::integer;
  v_motivo := format('fechamento automatico %s/%s - cron dia 1o 09h BRT', v_mes, v_ano);

  insert into public.fechamento_mensal_execucoes (ano, mes, origem)
  values (v_ano, v_mes, 'cron_dia1')
  returning id into v_execucao_id;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Passo 0: captura dos 7 dominios. Idempotente (responde ja_fechado).
  begin
    perform public.fechar_competencia_mensal_automatico();
  exception when others then
    v_detalhes := v_detalhes || jsonb_build_array(jsonb_build_object(
      'etapa', 'captura_7_dominios', 'ok', false,
      'sqlstate', sqlstate, 'erro', sqlerrm
    ));
  end;

  for v_unidade in
    select u.id, u.nome from public.unidades u where u.ativo = true order by u.nome
  loop
    begin
      -- 1. fonte financeira precisa estar disponivel
      v_financeiro := public.get_financeiro_faturas_emusys(v_unidade.id, v_ano, v_mes);
      if coalesce((v_financeiro->>'tem_dados')::boolean, false) is not true then
        raise exception 'FONTE_FINANCEIRA_INDISPONIVEL: status %', coalesce(v_financeiro->>'status', 'desconhecido');
      end if;

      -- 2. bloco financeiro no gerencial (antes da captura mensal)
      v_bloco := public.garantir_bloco_financeiro_gerencial_v1(v_ano, v_mes, v_unidade.id);
      if coalesce((v_bloco->>'ok')::boolean, false) is not true then
        raise exception 'BLOCO_FINANCEIRO_NAO_GARANTIDO: % (%)',
          coalesce(v_bloco->>'acao', 'sem acao'), coalesce(v_bloco->>'motivo', 'sem motivo');
      end if;

      -- 3. captura dos 2 dominios mensais
      perform public.capturar_relatorios_mensais_canonicos_v1(v_ano, v_mes, v_unidade.id);

      -- 4. fechamento da unidade
      perform public.fechar_competencia_mensal_canonica_v2(
        v_ano, v_mes, v_motivo, v_unidade.id, v_lote_id
      );

      v_ok := v_ok + 1;
      v_detalhes := v_detalhes || jsonb_build_array(jsonb_build_object(
        'unidade_id', v_unidade.id, 'unidade', v_unidade.nome,
        'ok', true, 'bloco_financeiro', v_bloco->>'acao'
      ));
    exception when others then
      v_erro := v_erro + 1;
      v_detalhes := v_detalhes || jsonb_build_array(jsonb_build_object(
        'unidade_id', v_unidade.id, 'unidade', v_unidade.nome,
        'ok', false, 'sqlstate', sqlstate, 'erro', sqlerrm
      ));
    end;
  end loop;

  update public.fechamento_mensal_execucoes
  set concluido_em = now(),
      unidades_fechadas = v_ok,
      unidades_com_erro = v_erro,
      detalhes = v_detalhes
  where id = v_execucao_id;

  return jsonb_build_object(
    'ok', v_erro = 0, 'ano', v_ano, 'mes', v_mes,
    'execucao_id', v_execucao_id, 'fechamento_lote_id', v_lote_id,
    'unidades_fechadas', v_ok, 'unidades_com_erro', v_erro,
    'detalhes', v_detalhes
  );
end;
$$;

revoke all on function public.fechar_competencia_mensal_dia1_v1() from public;
revoke execute on function public.fechar_competencia_mensal_dia1_v1() from anon;
grant execute on function public.fechar_competencia_mensal_dia1_v1() to service_role;

comment on function public.fechar_competencia_mensal_dia1_v1() is
  'Fechamento mensal automatico do dia 1o. Por unidade, em bloco protegido: valida fonte financeira, garante bloco financeiro no gerencial, captura os 2 dominios mensais e fecha. Grava placar em fechamento_mensal_execucoes.';
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `node --test tests/fechamentoMensalOrquestrador.test.mjs`
Expected: PASS (7 testes)

- [ ] **Step 6: Aplicar as duas migrations e conferir**

Aplicar via MCP (**OK do Hugo antes**), depois:

```sql
select proacl from pg_proc where proname = 'fechar_competencia_mensal_dia1_v1';
select proconfig from pg_proc where proname = 'fechar_competencia_mensal_dia1_v1';
```

Expected: sem `anon`; `proconfig` contendo `statement_timeout=300s`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260902121500_fechamento_mensal_execucoes.sql supabase/migrations/20260902122000_fechar_competencia_mensal_dia1.sql tests/fechamentoMensalOrquestrador.test.mjs
git commit -m "feat(fechamento): orquestrador do dia 1o com placar por unidade (LAPE-14)"
```

---

### Task 5: Cron novo (desligado) e desativação do jobid 83

**Files:**
- Create: `supabase/migrations/20260902122500_cron_fechamento_dia1.sql`

**Interfaces:**
- Consumes: `fechar_competencia_mensal_dia1_v1()` (Task 4)
- Produces: cron `fechamento-mensal-dia1`, schedule `0 12 1 * *` (09:00 BRT), **`active = false`**

**Contexto:** o cron nasce desligado. Só é ligado na Task 7, depois do ensaio de setembro e com OK explícito do Hugo — mesmo padrão da repescagem da evasão.

⚠️ Não deletar o jobid 83, só desativar: rollback vira uma linha.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260902122500_cron_fechamento_dia1.sql
--
-- Cron do fechamento mensal, dia 1o as 12:00 UTC = 09:00 BRT.
-- NASCE DESLIGADO: so e ligado apos o ensaio de setembro e OK do Hugo.
--
-- O jobid 83 (22h do ultimo dia) e DESATIVADO, nao deletado -- o orquestrador
-- chama fechar_competencia_mensal_automatico() como passo 0, entao manter os
-- dois ativos duplicaria a captura.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'fechamento-mensal-dia1';

  if v_jobid is null then
    perform cron.schedule(
      'fechamento-mensal-dia1',
      '0 12 1 * *',
      'select public.fechar_competencia_mensal_dia1_v1();'
    );
    select jobid into v_jobid from cron.job where jobname = 'fechamento-mensal-dia1';
  end if;

  perform cron.alter_job(v_jobid, active => false);
end;
$$;

-- Desativa o cron das 22h do ultimo dia (jobid 83).
do $$
declare
  v_antigo bigint;
begin
  select jobid into v_antigo from cron.job where jobname = 'fechamento-mensal-automatico';
  if v_antigo is not null then
    perform cron.alter_job(v_antigo, active => false);
  end if;
end;
$$;
```

- [ ] **Step 2: Aplicar e conferir o estado dos dois crons**

Aplicar via MCP (**OK do Hugo antes**), depois:

```sql
select jobid, jobname, schedule, active, command
from cron.job
where jobname in ('fechamento-mensal-dia1', 'fechamento-mensal-automatico')
order by jobname;
```

Expected: as duas linhas com `active = false`.

- [ ] **Step 3: Acrescentar a asserção do cron ao teste do orquestrador**

```javascript
// acrescentar em tests/fechamentoMensalOrquestrador.test.mjs
const cron = path.join(migracoes, '20260902122500_cron_fechamento_dia1.sql');

test('o cron nasce desligado', () => {
  const sql = fs.readFileSync(cron, 'utf8');
  assert.match(sql, /active\s*=>\s*false/u,
    'cron de escrita mensal nao pode nascer ligado antes do ensaio');
  assert.match(sql, /'0 12 1 \* \*'/u, 'schedule deve ser 12:00 UTC = 09:00 BRT do dia 1o');
});

test('desativa o cron antigo das 22h em vez de deletar', () => {
  const sql = fs.readFileSync(cron, 'utf8');
  assert.match(sql, /fechamento-mensal-automatico/u);
  assert.doesNotMatch(sql, /cron\.unschedule/u, 'desativar, nao deletar — rollback de uma linha');
});
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/fechamentoMensalOrquestrador.test.mjs`
Expected: PASS (9 testes)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260902122500_cron_fechamento_dia1.sql tests/fechamentoMensalOrquestrador.test.mjs
git commit -m "feat(fechamento): cron do dia 1o (desligado) e desativa o das 22h (LAPE-14)"
```

---

### Task 6: Vigia na la-hq

**Files:**
- Create: `fiscal mila/agents/sol/scripts/verifica-fechamento-mensal.py`
- Modify: crontab do user `sol` na VPS la-hq

**Interfaces:**
- Consumes: tabela `fechamento_mensal_execucoes` e `fechamento_mensal_snapshots` via PostgREST
- Produces: exit code 0 (fechado) ou 1 (pendente); no caso 0, posta a linha mensal de sucesso no Telegram

**Contexto:** o `cron-alerta.py` **não posta nada em caso de sucesso** — é a regra de ruído dele, e 29 jobs dependem disso. Não alterar o wrapper. O aviso mensal de sucesso é enviado pelo próprio script, uma vez.

Canal: `chat_id` `-1003443031930` (grupo SOL Core), `message_thread_id` `727` (tópico Logs), token `TELEGRAM_BOT_TOKEN` em `/home/sol/.openclaw/gateway.systemd.env`.

⚠️ O wrapper vai **dentro** do `flock`, nunca antes — `flock -n` sai com 1 quando o lock está ocupado, que é normal, e viraria alarme falso.
⚠️ O lock vai em `/home/sol/.openclaw/workspace/locks/`, **nunca em `/tmp`** (incidente de 27/08, modo 755).

- [ ] **Step 1: Escrever o script**

```python
#!/usr/bin/env python3
"""Vigia do fechamento mensal: confere se a competencia anterior fechou.

Sai com 0 quando os 2 dominios mensais estao 'fechado' nas 3 unidades ativas, e
com 1 quando falta alguma -- o cron-alerta.py transforma o exit 1 em mensagem
no topico Logs, com o trecho impresso aqui.

Existe porque em 31/08/2026 o cron respondeu "succeeded", os 2 dominios que a
tela consome nao foram capturados, e a primeira noticia disso foi a reclamacao
de um ADM no dia seguinte a tarde.

O aviso de SUCESSO e postado por este script (1x por mes): o cron-alerta.py so
fala quando ha falha, e "nenhuma mensagem" seria indistinguivel de "o job morreu
e nem chegou a rodar" -- que foi o caso de 27/08/2026.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BRT = timezone(timedelta(hours=-3))
ENV_FILE = Path('/home/sol/.openclaw/gateway.systemd.env')
CHAT_ID = '-1003443031930'
THREAD_ID = '727'
DOMINIOS = ('relatorio_admin_mensal', 'relatorio_comercial_mensal')
MESES = ('janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho',
         'agosto', 'setembro', 'outubro', 'novembro', 'dezembro')


def ler_env(chave):
    try:
        for linha in ENV_FILE.read_text(errors='ignore').splitlines():
            linha = linha.strip()
            if linha.startswith(f'{chave}='):
                return linha.split('=', 1)[1].strip().strip('"').strip("'")
    except OSError as exc:
        print(f'aviso: nao consegui ler {ENV_FILE}: {exc}', file=sys.stderr)
    return None


def competencia_alvo():
    hoje = datetime.now(BRT).date()
    primeiro = hoje.replace(day=1)
    anterior = primeiro - timedelta(days=1)
    return anterior.year, anterior.month


def consultar(caminho):
    url = f"{os.environ['SUPABASE_URL'].rstrip('/')}/rest/v1/{caminho}"
    chave = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    req = urllib.request.Request(url, headers={
        'apikey': chave,
        'Authorization': f'Bearer {chave}',
        'Accept': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def enviar_telegram(texto):
    token = ler_env('TELEGRAM_BOT_TOKEN')
    if not token:
        print('aviso: TELEGRAM_BOT_TOKEN ausente, sucesso nao publicado', file=sys.stderr)
        return
    dados = urllib.parse.urlencode({
        'chat_id': CHAT_ID,
        'message_thread_id': THREAD_ID,
        'text': texto[:3000],
        'disable_web_page_preview': 'true',
    }).encode()
    try:
        urllib.request.urlopen(
            urllib.request.Request(
                f'https://api.telegram.org/bot{token}/sendMessage', data=dados),
            timeout=20).read()
    except (urllib.error.URLError, OSError) as exc:
        # Falha no aviso nao muda o veredito: o mes fechou de qualquer forma.
        print(f'aviso: falha ao publicar sucesso no Telegram: {exc}', file=sys.stderr)


def main():
    ano, mes = competencia_alvo()
    rotulo = f'{MESES[mes - 1]}/{ano}'

    unidades = consultar('unidades?select=id,nome&ativo=eq.true&order=nome')
    fechados = consultar(
        f'fechamento_mensal_snapshots?select=unidade_id,dominio,status'
        f'&ano=eq.{ano}&mes=eq.{mes}&escopo=eq.unidade'
        f'&dominio=in.({",".join(DOMINIOS)})&status=eq.fechado'
    )

    tem = {(linha['unidade_id'], linha['dominio']) for linha in fechados}
    pendentes = [
        (u['nome'], d) for u in unidades for d in DOMINIOS
        if (u['id'], d) not in tem
    ]

    if not pendentes:
        print(f'{rotulo} fechado — {len(unidades)} unidades')
        enviar_telegram(
            f'✅ fechamento mensal — {rotulo} fechado\n'
            f'{len(unidades)} unidades · {datetime.now(BRT).strftime("%d/%m %H:%M")} BRT'
        )
        return 0

    print(f'{rotulo}: {len(pendentes)} pendencia(s) de fechamento')
    for nome, dominio in pendentes:
        print(f'  - {nome}: {dominio} nao esta fechado')

    execucoes = consultar(
        f'fechamento_mensal_execucoes?select=iniciado_em,unidades_fechadas,'
        f'unidades_com_erro,detalhes&ano=eq.{ano}&mes=eq.{mes}'
        f'&order=iniciado_em.desc&limit=1'
    )
    if execucoes:
        ultima = execucoes[0]
        print(f"\nultima execucao: {ultima['iniciado_em']} — "
              f"{ultima['unidades_fechadas']} ok, {ultima['unidades_com_erro']} com erro")
        for item in ultima.get('detalhes') or []:
            if item.get('ok') is False:
                print(f"  {item.get('unidade', item.get('etapa', '?'))}: "
                      f"{item.get('erro', 'sem mensagem')}")
    else:
        print('\nnenhuma execucao registrada — o cron do dia 1o pode nao ter rodado')

    return 1


if __name__ == '__main__':
    sys.exit(main())
```

- [ ] **Step 2: Provar o caminho de pendência sem tocar em produção**

Rodar localmente contra a competência de **junho/2026**, que sabidamente nunca foi fechada:

```bash
cd "fiscal mila/agents/sol/scripts"
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 - <<'PY'
import verifica_fechamento_mensal as v
print(v.competencia_alvo())
PY
```

Como `competencia_alvo()` sempre devolve o mês anterior, testar junho exige rodar a consulta à mão. Expected: a query de junho devolve **zero** linhas `fechado` nos 2 domínios, provando que o caminho de pendência imprime as 6 combinações.

- [ ] **Step 3: Instalar na la-hq**

```bash
scp "fiscal mila/agents/sol/scripts/verifica-fechamento-mensal.py" \
  sol@la-hq:/home/sol/.openclaw/workspace/scripts/
ssh sol@la-hq 'chmod +x /home/sol/.openclaw/workspace/scripts/verifica-fechamento-mensal.py \
  && mkdir -p /home/sol/.openclaw/workspace/locks'
```

- [ ] **Step 4: Rodar na la-hq em modo observação**

```bash
ssh sol@la-hq '/home/sol/.openclaw/workspace/scripts/verifica-fechamento-mensal.py; echo "exit=$?"'
```

Expected hoje (02/09, agosto já fechado à mão): `agosto/2026 fechado — 3 unidades`, `exit=0`, e **uma** mensagem ✅ no tópico Logs.

⚠️ Avisar o Hugo antes deste passo — ele publica no grupo.

- [ ] **Step 5: Acrescentar a linha no crontab**

```bash
ssh sol@la-hq "crontab -l > /tmp/cron.bak && cat >> /tmp/cron.bak <<'EOF'
0 14 1 * * /usr/bin/flock -n /home/sol/.openclaw/workspace/locks/fechamento-mensal.lock /home/sol/.openclaw/workspace/scripts/cron-alerta.py fechamento-mensal /home/sol/.openclaw/workspace/scripts/verifica-fechamento-mensal.py >> /home/sol/.openclaw/workspace/logs/fechamento-mensal.log 2>&1
EOF
crontab /tmp/cron.bak && crontab -l | tail -3"
```

- [ ] **Step 6: Commit**

```bash
cd "fiscal mila"
git add agents/sol/scripts/verifica-fechamento-mensal.py
git commit -m "feat(sol): vigia do fechamento mensal com alarme no topico Logs (LAPE-14)"
```

---

### Task 7: Ensaio de setembro, ligação e documentação

**Files:**
- Modify: `CLAUDE.md`, `docs/MAPA-SISTEMA.md`
- Create: `daily-notes/2026-09-02.md` (ou append, se já existir)

**Contexto:** o cron nasceu desligado na Task 5. Aqui ele é exercitado à mão sobre setembro e só então ligado.

⚠️ Lição de 01/09: **o ensaio tem de cobrir a leitura, não só a captura.** O dry-run daquele dia validou `montar_relatorio_*_payload_v1` (passou) e não `get_relatorio_admin_mensal_rico_v1`, que era onde estava o problema.

- [ ] **Step 1: Ensaio em seco do orquestrador**

⚠️ Setembro só termina em 30/09 — o ensaio real do fluxo completo é em 01/10. O que dá para provar agora é a **idempotência sobre agosto**, que já está fechado:

```sql
select public.fechar_competencia_mensal_dia1_v1();
```

Expected: como hoje é 02/09, a competência alvo é **agosto**, e todas as unidades devem responder `bloco_financeiro: ja_presente` com `unidades_fechadas = 3`, `unidades_com_erro = 0` — sem criar versão nova de snapshot.

- [ ] **Step 2: Provar que nada foi reescrito**

```sql
select dominio, max(versao) as versao_max, count(*) as linhas
from fechamento_mensal_snapshots
where ano = 2026 and mes = 8 and escopo = 'unidade'
group by dominio order by dominio;
```

Expected: idêntico ao estado anterior — `relatorio_gerencial` com `versao_max = 2` e 6 linhas; nenhuma versão 3.

- [ ] **Step 3: Provar a leitura nas 3 unidades**

```sql
select u.nome,
       (public.get_relatorio_admin_mensal_rico_v1(u.id, 2026, 8) is not null) as abre
from unidades u where u.ativo = true order by u.nome;
```

Expected: `abre = true` nas 3.

- [ ] **Step 4: Rodar a suíte de testes do projeto**

Run: `npm test`
Expected: PASS. ⚠️ Se algum teste de fechamento/financeiro quebrar, é regressão desta frente — investigar antes de seguir.

- [ ] **Step 5: Ligar o cron (exige OK explícito do Hugo)**

```sql
select cron.alter_job(
  (select jobid from cron.job where jobname = 'fechamento-mensal-dia1'),
  active => true
);
select jobid, jobname, schedule, active from cron.job where jobname = 'fechamento-mensal-dia1';
```

Expected: `active = true`.

- [ ] **Step 6: Atualizar a documentação**

Em `CLAUDE.md`, na seção de integrações, acrescentar o parágrafo do fechamento automático: os 3 componentes, o horário, por que o alarme e o executor são peças separadas, e a armadilha do `UPDATE` sem filtro de escopo.

Em `docs/MAPA-SISTEMA.md`, registrar as funções novas e a tabela `fechamento_mensal_execucoes` na página Administrativo.

Em `daily-notes/2026-09-02.md`, registrar o que foi feito, com a cronologia de agosto como motivação.

- [ ] **Step 7: Commit e PR**

```bash
git add CLAUDE.md docs/MAPA-SISTEMA.md daily-notes/2026-09-02.md
git commit -m "docs(fechamento): registra o fechamento mensal automatico e o vigia (LAPE-14)"
git push -u origin feat/fechamento-mensal-automatico
gh pr create --title "Fechamento mensal automatico com alarme de falha (LAPE-14)" --body "$(cat <<'EOF'
Fecha a competencia mensal sozinha no dia 1o, por unidade, e alarma no Telegram
quando nao fecha.

## Por que

O fechamento dos 2 dominios que a tela consome (`relatorio_admin_mensal` e
`relatorio_comercial_mensal`) era 100% manual, e a ausencia dele era silenciosa:
agosto/2026 so fechou em 01/09 porque um ADM reclamou, julho foi manual, junho
nunca fechou. O cron das 22h respondia `succeeded` sem ter feito o que importa.

## O que muda

- `garantir_bloco_financeiro_gerencial_v1` embute o bloco de faturas do Emusys no
  snapshot gerencial na captura. Sem ele, `get_relatorio_admin_mensal_rico_base_v1`
  levanta `INDICADORES_AUSENTES` todo mes -- retificar nao resolve, porque a leitura
  consome o payload cru.
- `fechar_competencia_mensal_canonica_v2` fecha UMA unidade. A v1 e tudo-ou-nada e
  deixou Barra e Recreio sem relatorio por causa de um aluno de CG.
- `fechar_competencia_mensal_dia1_v1` orquestra, com cada unidade em bloco protegido,
  e grava placar em `fechamento_mensal_execucoes`.
- A captura dos 7 dominios sai das 22h do dia 31 (mes ainda por correr) para o dia 1o.
- Vigia na la-hq confere 2h depois e alarma pelo `cron-alerta.py`.

## Riscos tratados

- `statement_timeout` de 8s do papel `authenticator` (o fechamento leva ~60s): funcao
  com `SET statement_timeout = '300s'`.
- `UPDATE` sem filtro de escopo carimbaria os 11 snapshots consolidados de 2026.
- Cron nasce DESLIGADO; ligado so apos ensaio e OK explicito.

Spec: `docs/superpowers/specs/2026-09-02-fechamento-mensal-automatico-design.md`
Plano: `docs/superpowers/plans/2026-09-02-fechamento-mensal-automatico.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

⚠️ **Frente encerrada = merge feito.** Não deixar o PR aberto: o banco fica corrigido e a `main` com o código antigo, e um deploy a partir dela reverte a correção sem ninguém perceber (aconteceu em 08/08 com o PR #75).

- [ ] **Step 8: Registrar a pendência de observação**

Mover a LAPE-14 para `review` no Lume com nota `👁️ OBSERVAR`, contendo:

- **Sinal de sucesso (01/10):** `fechamento_mensal_execucoes` com `unidades_com_erro = 0` e uma mensagem ✅ no tópico Logs.
- **Sinal de fracasso:** ausência de linha em `fechamento_mensal_execucoes` para 2026/09 (o cron não rodou), ou `unidades_com_erro > 0`.
- **Query pronta:**

```sql
select ano, mes, iniciado_em at time zone 'America/Sao_Paulo' as iniciado_brt,
       unidades_fechadas, unidades_com_erro, detalhes
from fechamento_mensal_execucoes
where ano = 2026 and mes = 9
order by iniciado_em desc;
```

- **Conclusão só depois de 01/10** — uma execução real. A comparação de `dados_mensais` (efeito de mover a captura das 22h para o dia 1º) só pode ser medida nesse mesmo ciclo.

---

## Self-Review

**Cobertura da spec:**

| Seção da spec | Task |
|---|---|
| Componente 1 — bloco financeiro na captura | Task 1 |
| Componente 2 — orquestrador do dia 1º | Task 4 |
| `fechar_competencia_mensal_canonica_v2` | Task 2 |
| Item 4 — mover captura das 22h | Tasks 3 e 5 |
| Componente 3 — vigia na la-hq | Task 6 |
| Riscos: `statement_timeout` | Task 4, Step 6 |
| Riscos: ACL de `anon` | Tasks 1, 2, 3, 4 (steps de conferência) |
| Riscos: idempotência sob execução múltipla | Task 7, Steps 1-2 |
| Testes 1-5 da spec | Task 7, Steps 1-4 (1, 3), Tasks 1-5 (contratos), Task 6 Step 4 (alarme) |
| Rollback | Task 3 Step 1 (corpo anterior), Task 5 (desativar, não deletar) |

**Lacuna consciente:** o teste 2 da spec ("reprodução do caso de agosto — unidade travada") não tem passo próprio, porque exigiria sujar dado de produção para forçar a trava. Fica coberto de forma natural no primeiro mês em que uma unidade travar de verdade, com o placar registrando o `sqlerrm`. Se o Hugo quiser prova antecipada, o caminho é um Postgres em Docker com o padrão de `tests/financeiroSyncQueuePostgres.test.mjs`, o que custa aplicar todas as migrations e não cabe nesta entrega.

**Consistência de tipos:** `garantir_bloco_financeiro_gerencial_v1(integer, integer, uuid)` é chamada na Task 4 com `(v_ano, v_mes, v_unidade.id)` ✓. `fechar_competencia_mensal_canonica_v2(integer, integer, text, uuid, uuid)` é chamada com `(v_ano, v_mes, v_motivo, v_unidade.id, v_lote_id)` ✓. `capturar_relatorios_mensais_canonicos_v1(integer, integer, uuid)` mantém a assinatura existente ✓.
