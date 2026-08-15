# Pendência de chamada experimental reagendada — plano de implementação

> **Para agentes de implementação:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que um lead experimental já convertido e presente na mesma aula reagendada seja contado novamente como “sem destino”, mantendo leads realmente não convertidos como pendência.

**Architecture:** A RPC de agenda continuará usando `lead_experimentais` para aulas sem roster, mas resolverá a identidade operacional com `coalesce(lead_experimentais.aluno_id, leads.aluno_id)` e eliminará o lead quando essa identidade já estiver presente no roster/presença da mesma chave de aula. O frontend terá uma regra compartilhada para tratar o retorno defensivamente e contará alunos e leads com a mesma semântica no KPI, banner, chamada diária e semanal. Nenhum histórico será apagado ou reescrito.

**Tech Stack:** React + TypeScript, Supabase PostgreSQL migrations/RPCs, Node `node:test`, build Vite.

---

### Task 1: Provar a regra de deduplicação no contrato da Agenda

**Files:**
- Create: `tests/agendaPendenciaExperimental.test.mjs`
- Modify: `src/lib/agenda.ts`
- Modify: `src/components/App/Agenda/Chamada/chamadaUtils.ts`

- [ ] **Step 1: Write the failing tests**

Adicionar casos executáveis para a regra pura:

```js
test('lead convertido com aluno presente não abre pendência duplicada', () => {
  assert.equal(leadExperimentalCobrePendencia({ aluno_id: 2205, status: 'experimental_agendada' }, [
    { aluno_id: 2205 },
  ]), false);
});

test('lead convertido com aluno ainda sem destino deixa a pendência no aluno', () => {
  assert.equal(leadExperimentalCobrePendencia({ aluno_id: 2205, status: 'experimental_agendada' }, [
    { aluno_id: 2205 },
  ]), false);
});

test('lead sem aluno vinculado continua pendente até presença ou falta experimental', () => {
  assert.equal(leadExperimentalCobrePendencia({ aluno_id: null, status: 'experimental_agendada' }, []), true);
  assert.equal(leadExperimentalCobrePendencia({ aluno_id: null, status: 'experimental_realizada' }, []), false);
  assert.equal(leadExperimentalCobrePendencia({ aluno_id: null, status: 'experimental_faltou' }, []), false);
});
```

O primeiro teste reproduz Rafael; o segundo garante que a identidade convertida não seja contada duas vezes mesmo antes da presença ser lançada; os demais preservam a cobrança real de lead não convertido.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/agendaPendenciaExperimental.test.mjs`

Expected: FAIL because `leadExperimentalCobrePendencia` ainda não existe.

- [ ] **Step 3: Implement the minimal shared predicate**

Exportar de `src/lib/agenda.ts` uma função sem dependência de React/Supabase que retorne `false` para status terminal (`experimental_realizada`/`experimental_faltou`) e também para um lead com `aluno_id` que já está representado no roster da aula. Exportar o uso através de `chamadaUtils.ts` sem duplicar a regra.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/agendaPendenciaExperimental.test.mjs`

Expected: PASS with 3 tests and 0 failures.

### Task 2: Corrigir a fonte SQL e cobrir as duas consultas da Agenda

**Files:**
- Create: `supabase/migrations/20260815150000_agenda_dedup_lead_convertido_presenca.sql`
- Modify: `tests/agendaPendenciaExperimental.test.mjs`

- [ ] **Step 1: Extend the failing contract test for the migration**

Verificar que a migration atualiza `get_agenda_dia` e `get_agenda_semana`, expõe `aluno_id` no JSON do lead e usa identidade estável (`coalesce(le.aluno_id, l.aluno_id)`) contra participantes da mesma `chave`, sem comparar por nome e sem `delete`/`update` de histórico.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/agendaPendenciaExperimental.test.mjs`

Expected: FAIL because the migration does not yet exist.

- [ ] **Step 3: Implement the additive migration**

Criar a migration via `supabase migration new agenda_dedup_lead_convertido_presenca`, preservar os dois contratos de retorno e substituir apenas a CTE `experimentais` de cada função. Adicionar uma CTE de participantes formada por `aula_alunos_emusys.aluno_id` e `aluno_presenca.aluno_id` da mesma chave de aula; filtrar somente o lead cuja identidade convertida esteja nessa CTE; manter o lead não convertido. A migração deverá reaplicar grants existentes e falhar fechada se a estrutura esperada da função não for encontrada.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/agendaPendenciaExperimental.test.mjs`

Expected: PASS with all frontend and SQL contract assertions.

### Task 3: Alinhar contadores e pendências das visões da Agenda

**Files:**
- Modify: `src/hooks/useAgendaDia.ts`
- Modify: `src/components/App/Agenda/AgendaPage.tsx`
- Modify: `src/components/App/Agenda/Chamada/AlertaPendencias.tsx`
- Modify: `src/components/App/Agenda/Chamada/chamadaUtils.ts`
- Modify: `src/components/App/Agenda/Chamada/ChamadaSemana.tsx`

- [ ] **Step 1: Add the regression assertions for all consumers**

Asserts must confirm that the lead payload has `aluno_id`, that `AlertaPendencias`, the top “Sem destino” KPI, and the weekly pending counter use the shared predicate, and that a terminal/converted lead is not appended as an extra pending item.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/agendaPendenciaExperimental.test.mjs`

Expected: FAIL on the current independent lead loops/counter implementation.

- [ ] **Step 3: Implement the minimal consumer alignment**

Adicionar `aluno_id: number | null` a `LeadExperimentalAgenda`; usar a predicate comum no banner e no KPI; contar leads pendentes na visão semanal; e fazer `chamadaCompleta` reconhecer uma aula composta apenas por leads. Leads convertidos presentes no roster serão ocultados pela RPC e também ignorados defensivamente pelo frontend; leads sem vínculo continuam visíveis e cobrados.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/agendaPendenciaExperimental.test.mjs`

Expected: PASS with 0 failures.

### Task 4: Verificação integrada, publicação e prova do caso real

**Files:**
- Verify: `tests/agendaPendenciaExperimental.test.mjs`
- Verify: `supabase/migrations/20260815150000_agenda_dedup_lead_convertido_presenca.sql`

- [ ] **Step 1: Run the full focused regression and project tests**

Run: `node --test tests/agendaPendenciaExperimental.test.mjs`; `npm test`; `npm run build`.

Expected: every command exits 0; registrar contagens reais, sem substituir falhas preexistentes por sucesso genérico.

- [ ] **Step 2: Apply and inspect the production migration**

Aplicar no projeto Supabase `ouqwbbermlzqqvtqwlul`, executar advisors de segurança/performance, e consultar as definições/resultados das duas RPCs. Não executar backfill nem alterar `lead_experimentais`, `aluno_presenca` ou histórico humano.

- [ ] **Step 3: Run read-only production smoke queries**

Consultar Recreio em 12/08/2026 e Barra em 14/08/2026; comprovar que Rafael não aparece em `experimental_leads` quando a aula contém `aluno_id=2205` com `status_presenca=presente`, que leads não convertidos continuam no retorno e que nenhum novo registro de presença foi criado.

- [ ] **Step 4: Verify the deployed UI in a real browser**

Abrir `/app/agenda`, selecionar Recreio e 12/08/2026, confirmar `Sem destino = 0`, ausência do banner âmbar e permanência de Rafael como `Presente`; validar também após recarga completa e sem erros no console. Confirmar uma aula experimental realmente pendente para não regressar a cobrança de leads não convertidos.

- [ ] **Step 5: Record branch/commit/deployment evidence**

Informar worktree, branch, commit, migration aplicada, resultado dos testes/build, smoke queries e cobertura residual. Não fazer push/merge sem autorização explícita.

---

## Self-review

- A causa observada no Rafael é coberta por identidade `aluno_id`, não por nome.
- A solução preserva a pendência de lead sem aluno convertido.
- Dia, semana, KPI e banner usam a mesma noção de participante.
- A migration é aditiva e não altera ou apaga dados históricos.
- Os testes exigem o ciclo RED → GREEN antes da implementação e a verificação final inclui banco, build e navegador.
