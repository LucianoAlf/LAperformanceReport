# Reconciliação completa da grade Emusys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a Agenda convergir com uma fotografia completa do Emusys sem apagar presença humana ou histórico.

**Architecture:** Um helper puro agrupa a fotografia do Emusys por aula e participante. Uma RPC privada decide, de forma transacional e com prévia, se uma aula deve ser cancelada logicamente ou se somente um vínculo de aluno deve ser removido. Os syncs futuro e de metadados invocam a mesma RPC depois de concluírem a paginação e os upserts.

**Tech Stack:** Deno Edge Functions, Supabase PostgreSQL/PLpgSQL, Node test runner, PostgreSQL 17 em Docker.

---

### Task 1: Criar a especificação de fotografia agrupada

**Files:**
- Create: `supabase/functions/_shared/reconciliacao-grade-snapshot.ts`
- Test: `tests/reconciliacaoGradeSnapshotContrato.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```js
assert.match(helper, /export function montarSnapshotGradeEmusys/);
assert.match(helper, /criarAlunoChave/);
assert.match(helper, /sort\(\)/);
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `node --test tests/reconciliacaoGradeSnapshotContrato.test.mjs`

Expected: falha porque o helper ainda não existe.

- [ ] **Step 3: Implementar o helper mínimo**

```ts
export function montarSnapshotGradeEmusys(aulas, normalizarNome) {
  // agrupa por emusys_id e reúne aluno_chaves sem duplicatas
}
```

O helper deve ignorar IDs inválidos, aceitar aulas sem roster e ordenar aulas e
chaves para resultado idempotente.

- [ ] **Step 4: Rodar o teste novamente**

Run: `node --test tests/reconciliacaoGradeSnapshotContrato.test.mjs`

Expected: PASS.

### Task 2: Criar a RPC de prévia e reconciliação segura

**Files:**
- Create: migration gerada por `supabase migration new reconciliacao_grade_snapshot_completo`
- Modify: `tests/reconciliacaoGradeSnapshotPostgres.test.mjs`

- [ ] **Step 1: Escrever fixture PostgreSQL com quatro casos**

```sql
-- aula ausente sem presença humana, vínculo ausente, vínculo com presença humana,
-- e aluno sem identidade local resolvida.
```

- [ ] **Step 2: Executar o fixture e confirmar a falha**

Run: `node --test tests/reconciliacaoGradeSnapshotPostgres.test.mjs`

Expected: falha porque a RPC ainda não existe.

- [ ] **Step 3: Implementar a migration aditiva**

```sql
create or replace function public.reconciliar_grade_snapshot_emusys_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_snapshot jsonb,
  p_dry_run boolean default true
) returns jsonb;
```

Ela valida o array completo, limita a escrita a hoje/futuro, preserva marcação
humana e retorna as ações classificadas. No modo aplicado, cancela aula ausente
com `sync_ausente_emusys` ou remove somente o vínculo seguro.

- [ ] **Step 4: Garantir ACL e assinatura única**

```sql
revoke all on function public.reconciliar_grade_snapshot_emusys_v1(...) from public, anon;
grant execute on function public.reconciliar_grade_snapshot_emusys_v1(...) to service_role;
```

- [ ] **Step 5: Rodar fixture, ACL e idempotência**

Run: `node --test tests/reconciliacaoGradeSnapshotPostgres.test.mjs`

Expected: PASS com prévia sem escrita, aplicação segura e segunda aplicação sem alterações.

### Task 3: Conectar os dois sincronizadores à mesma decisão

**Files:**
- Modify: `supabase/functions/sync-grade-futura-emusys/index.ts`
- Modify: `supabase/functions/sync-presenca-emusys/index.ts`
- Test: `tests/reconciliacaoGradeSnapshotContrato.test.mjs`

- [ ] **Step 1: Estender o teste de contrato**

```js
assert.match(syncGrade, /reconciliar_grade_snapshot_emusys_v1/);
assert.match(syncPresenca, /reconciliar_grade_snapshot_emusys_v1/);
assert.doesNotMatch(syncPresenca, /\.delete\(\)[\s\S]{0,160}aula_emusys_id/);
```

- [ ] **Step 2: Confirmar a falha**

Run: `node --test tests/reconciliacaoGradeSnapshotContrato.test.mjs`

Expected: FAIL antes da integração.

- [ ] **Step 3: Substituir a regra direta da grade futura**

Depois de fetch paginado e upsert, montar a fotografia e chamar a RPC em modo
aplicado. A função não deve mais executar `update aulas_emusys` diretamente a
partir de uma lista local de IDs.

- [ ] **Step 4: Integrar o modo `metadados`**

Depois de upsert e roster da fotografia completa, chamar a mesma RPC de hoje
até o fim da janela. Remover a limpeza direta de roster e delegar à RPC, que
conhece a trava de presença humana.

- [ ] **Step 5: Rodar os testes de contrato**

Run: `node --test tests/reconciliacaoGradeSnapshotContrato.test.mjs tests/syncPresencaAutomacaoLog.test.mjs`

Expected: PASS.

### Task 4: Manter documentação canônica alinhada

**Files:**
- Modify: `docs/REGRAS-DE-NEGOCIO.md`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`
- Create: `docs/superpowers/specs/2026-08-15-reconciliacao-grade-snapshot-emusys-design.md`

- [ ] **Step 1: Atualizar fonte, janela e proteção humana**

Documentar que a Agenda só considera a fotografia completa, que o modo
metadados também reconcilia o dia corrente e que presença humana bloqueia
remoção automática.

- [ ] **Step 2: Verificar referências**

Run: `rg -n "reconciliar_grade_snapshot_emusys_v1|fotografia completa|presença humana" docs`

Expected: regra, mapa de sistema, métricas e integração mencionam o mesmo nome e a mesma segurança.

### Task 5: Verificar, revisar e preparar a prévia de Campo Grande

**Files:**
- Test: `tests/reconciliacaoGradeSnapshotContrato.test.mjs`
- Test: `tests/reconciliacaoGradeSnapshotPostgres.test.mjs`

- [ ] **Step 1: Rodar a suíte direcionada**

Run: `node --test tests/reconciliacaoGradeSnapshotContrato.test.mjs tests/reconciliacaoGradeSnapshotPostgres.test.mjs tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs tests/aulaOperacionalPostgres.test.mjs tests/syncPresencaAutomacaoLog.test.mjs`

Expected: PASS.

- [ ] **Step 2: Rodar validação ampla e build**

Run: `npm test && npm run build`

Expected: suíte e build passam; qualquer falha preexistente é separada da alteração.

- [ ] **Step 3: Executar somente a prévia remota de Campo Grande**

Run: chamada interna em `dry_run=true` com a fotografia atualizada.

Expected: lista auditável, sem DML, confirmando quais vínculos e aulas seriam tratados; Moisés não aparece como falso positivo.

- [ ] **Step 4: Parar para aprovação da escrita**

Apresentar ao usuário as contagens reais, as ações protegidas por presença humana e o hash/horário da fotografia antes de migration, deploy ou reparo em produção.
