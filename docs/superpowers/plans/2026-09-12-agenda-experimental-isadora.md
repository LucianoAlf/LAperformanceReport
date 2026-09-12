# Correção da chamada de aula experimental na Agenda — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a aula experimental da Isadora Florenzano Carvalho aparecer na chamada do professor no Recreio e impedir que o mesmo evento terminal seja cobrado como pendência de turma regular.

**Architecture:** A Agenda diária/semanal continuará usando `aulas_emusys` como ocorrência e `lead_experimentais` como cartão experimental. A associação de um lead será feita pelo `emusys_aula_id` quando disponível, com data, horário, unidade e professor como contexto; a deduplicação só poderá considerar o roster da própria aula experimental, nunca um roster regular agrupado no mesmo horário. A pendência canônica excluirá apenas a duplicata regular quando houver o mesmo aluno, professor, horário e uma experimental terminal (`experimental_realizada` ou `experimental_faltou`).

**Tech Stack:** PostgreSQL/Supabase migrations, SQL SECURITY DEFINER/INVOKER já publicado, Node.js `node:test`, fixture de produção somente leitura, Vite build e Git/Vercel conforme o contrato do repositório.

---

### Task 1: Registrar a regressão antes da correção

**Files:**
- Modify: `tests/agendaPendenciaExperimental.test.mjs`
- Test: `tests/agendaPendenciaExperimental.test.mjs`

- [ ] **Step 1: Escrever o teste vermelho**

Adicionar um teste que leia a migration de correção e exija os contratos observáveis abaixo:

```js
const fixMigrationPath =
  'supabase/migrations/20260912123606_agenda_experimental_aula_canonica.sql';

test('experimental com aula Emusys propria nao e deduplicada pelo roster regular do mesmo horario', () => {
  const sql = read(fixMigrationPath);

  assert.match(sql, /nullif\(le\.emusys_aula_id,\s*0\)[\s\S]*le\.emusys_aula_id\s*=\s*b\.emusys_id/iu);
  assert.match(sql, /aa_exp\.aula_emusys_id\s*=\s*b\.id[\s\S]*aa_exp\.ativo_operacional/iu);
  assert.match(sql, /experimental_realizada/iu);
  assert.match(sql, /experimental_faltou/iu);
  assert.match(sql, /lead_experimentais/iu);
  assert.doesNotMatch(sql, /update\s+public\.(?:aluno_presenca|aula_alunos_emusys|alunos)/iu);
});
```

- [ ] **Step 2: Rodar somente o teste e confirmar RED**

Executar:

```powershell
node --test tests/agendaPendenciaExperimental.test.mjs
```

Esperado: falha porque `20260912123606_agenda_experimental_aula_canonica.sql` ainda não existe. Essa falha comprova que o teste cobre a correção nova.

### Task 2: Publicar a regra aditiva do banco

**Files:**
- Create: `supabase/migrations/20260912123606_agenda_experimental_aula_canonica.sql`

- [ ] **Step 1: Criar a migration versionada**

Usar `supabase migration new agenda_experimental_aula_canonica` e preencher a migration com um bloco `DO` que:

1. Para `public.get_agenda_dia(date, uuid)` e `public.get_agenda_semana(date, uuid)`, exige o fragmento atual da CTE `experimentais`.
2. Adiciona ao join, quando houver, `nullif(le.emusys_aula_id, 0) is null or le.emusys_aula_id = b.emusys_id`, mantendo data, horário, unidade e atribuição de professor.
3. Troca a deduplicação pelo CTE `participantes` por uma verificação na própria aula `b.id`, preservando apenas roster operacional ou evidência bruta da própria aula experimental. O roster regular do mesmo `chave` não pode ocultar o cartão experimental.
4. Para `public.fn_presenca_pendencias_do_dia_v2(uuid, date)`, acrescenta ao conjunto de candidatos regulares:

```sql
and not exists (
  select 1
  from public.lead_experimentais le
  left join public.leads le_lead on le_lead.id = le.lead_id
  where le.unidade_id = ae.unidade_id
    and le.data_experimental = ae.data_aula
    and le.horario_experimental = (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time
    and le.professor_experimental_id = ae.professor_id
    and lower(btrim(le.status::text)) in ('experimental_realizada', 'experimental_faltou')
    and coalesce(le.aluno_id, le_lead.aluno_id) = r.aluno_id
    and (
      nullif(le.emusys_aula_id, 0) is null
      or exists (
        select 1
        from public.aulas_emusys ae_exp
        where ae_exp.emusys_id = le.emusys_aula_id
          and ae_exp.unidade_id = ae.unidade_id
          and ae_exp.data_aula = ae.data_aula
          and coalesce(ae_exp.categoria, 'normal') = 'experimental'
          and ae_exp.professor_id = ae.professor_id
          and ae_exp.data_hora_inicio = ae.data_hora_inicio
          and ae_exp.data_hora_fim = ae.data_hora_fim
      )
    )
)
```

O bloco deve substituir as funções por `pg_get_functiondef`, recusar silenciosamente uma versão inesperada e preservar grants, assinaturas e histórico. Não haverá `UPDATE`, `DELETE`, backfill ou mudança em `aluno_presenca`.

- [ ] **Step 2: Rodar o teste vermelho novamente após a migration**

Executar:

```powershell
node --test tests/agendaPendenciaExperimental.test.mjs
```

Esperado: PASS no novo teste e nos testes existentes da Agenda.

### Task 3: Verificar o caso real sem alterar histórico

**Files:**
- No production data files; use SQL read-only after migration.

- [ ] **Step 1: Aplicar a migration pelo canal versionado do Supabase**

Aplicar a mesma SQL com `mcp__supabase_la_report__apply_migration`, usando o nome `agenda_experimental_aula_canonica`. O retorno deve confirmar a aplicação sem alteração de linhas de presença.

- [ ] **Step 2: Reconsultar a Agenda e as pendências do Recreio**

Executar:

```sql
select public.get_agenda_dia_v2(
  date '2026-09-11',
  '95553e96-971b-4590-a6eb-0201d013c14d'::uuid
);

select public.fn_presenca_pendencias_do_dia_v2(
  '95553e96-971b-4590-a6eb-0201d013c14d'::uuid,
  date '2026-09-11'
);
```

Validar no resultado real: a aula de Canto das 18:00 do Erick contém Isadora em `experimental_leads`, a lista regular mantém somente o aluno regular, e `pendencias` não contém Isadora. Também verificar que não houve `conflitos` nem alteração nas linhas de `aluno_presenca`.

- [ ] **Step 3: Verificar idempotência e contratos de segurança**

Reexecutar a migration em PostgreSQL de teste, consultar `pg_get_function_result`, grants de `authenticated`/`service_role` e executar os testes Postgres da Agenda/presença.

### Task 4: Validar, versionar e publicar

**Files:**
- Modify: only files produced by Tasks 1–2 and the implementation plan.

- [ ] **Step 1: Rodar a suíte direcionada e o build**

Executar:

```powershell
node --test tests/agendaPendenciaExperimental.test.mjs tests/getAgendaDiaAusenteEmusysPostgres.test.mjs tests/presencaPendenciasCanonicasV2Postgres.test.mjs
npm run build
```

Esperado: exit code 0 em cada comando; se Docker estiver indisponível, registrar explicitamente o teste pulado e compensar com a consulta real pós-migration.

- [ ] **Step 2: Revalidar a publicação pelo navegador**

Abrir a Agenda do Recreio em 11/09/2026, confirmar o cartão experimental da Isadora dentro da chamada do Erick e confirmar que o banner não mostra a pendência regular duplicada.

- [ ] **Step 3: Versionar e enviar a correção**

Conferir `git diff`, remover somente o script temporário desta auditoria, executar `git status --short --branch`, fazer commit com mensagem `fix: exibir experimental na chamada canonica`, `git push` da branch atual e publicar o artefato necessário. Registrar hash, branch, resultado do push, migration aplicada e verificações pós-publicação.

---

**Self-review:** O plano cobre a origem do desaparecimento (deduplicação por slot), a consequência visível (cartão experimental ausente), o ruído do relatório (pendência regular indevida), a preservação do histórico e a validação em banco, testes, build e navegador. Não altera cadastro, presença, financeiro ou dados de outras unidades.
