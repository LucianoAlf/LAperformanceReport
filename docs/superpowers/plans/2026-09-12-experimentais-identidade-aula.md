# Identidade de Aula Experimental Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que toda experimental exibida na chamada seja ligada à aula real do Emusys, sem associar uma remarcação a outro horário.

**Architecture:** A aula do Emusys é a identidade física da chamada; o evento de CRM é apenas metadado de agendamento. O banco impede que um ID de evento permaneça como `emusys_aula_id`; a sincronização substitui a referência quando a aula real confirma a mesma unidade, lead, data e horário; e Agenda prefere o vínculo pela aula real, com fallback de horário apenas para registros ainda sem aula.

**Tech Stack:** Supabase/PostgreSQL migrations, Deno Edge Function, TypeScript shared reconciliation, Node test runner, PostgreSQL fixture test.

---

### Task 1: Cobrir a reconciliação de identidade com testes de regressão

**Files:**

- Modify: `tests/syncExperimentaisSnapshotContrato.test.mjs`
- Modify: `tests/agendaPendenciaExperimental.test.mjs`
- Modify: `tests/getAgendaDiaAusenteEmusysPostgres.test.mjs`

- [ ] **Step 1: Escrever o teste que exige substituir a referência divergente pela aula real.**

```js
const resultado = montarPatchReconciliacaoExperimental({
  atual: { emusysAulaId: 104483, /* demais campos */ },
  desejado: { emusysAulaId: 856644, /* demais campos */ },
  atualizadoEm: '2026-09-12T12:00:00.000Z',
});
assert.equal(resultado.patch.emusys_aula_id, 856644);
```

- [ ] **Step 2: Escrever o teste que reprova match por lead+dia+curso quando a hora difere.**

```js
assert.equal(selecionarCandidatoExperimental({
  unidadeId: UNIDADE.id, emusysAulaId: null, emusysLeadId: 8501,
  data: '2026-09-12', horario: '10:00:00', cursoId: 40,
}, [{ id: 1, unidadeId: UNIDADE.id, emusysLeadId: 8501,
  dataAula: '2026-09-12', horarioBanco: '09:00:00', cursoId: 40 }]), null);
```

- [ ] **Step 3: Escrever o teste PostgreSQL da Agenda.**

O fixture deve conter: uma linha antiga com `emusys_aula_id` da aula real mas data antiga; outra do mesmo lead no horário atual sem aula real; e uma aula experimental atual. A chamada deve retornar exatamente um lead, o da aula real, no cartão atual.

- [ ] **Step 4: Rodar os testes e confirmar que falham pela ausência do comportamento.**

Run: `node --test tests/syncExperimentaisSnapshotContrato.test.mjs tests/agendaPendenciaExperimental.test.mjs tests/getAgendaDiaAusenteEmusysPostgres.test.mjs`

Expected: os novos testes falham porque a referência divergente não é substituída, a hora ainda não participa da identidade e a Agenda não prioriza a aula real.

### Task 2: Corrigir a sincronização e impedir nova contaminação do campo de aula

**Files:**

- Modify: `supabase/functions/_shared/experimental-reconciliacao.ts`
- Modify: `supabase/functions/_shared/sync-experimentais-mode.ts`
- Modify: `supabase/functions/debug-webhook-emusys-observador/index.ts`
- Create: `supabase/migrations/<timestamp>_experimental_separa_evento_de_aula_e_hora.sql`

- [ ] **Step 1: Tornar a hora obrigatória quando a reconciliação usa lead/aluno sem ID de aula.**

`camposEstaveisCorrespondem` deve aceitar o candidato somente se data, identidade, curso e horário normalizado coincidirem. O match por `emusysAulaId` continua tendo prioridade e não depende de horário.

- [ ] **Step 2: Fazer a reconciliação aceitar a substituição pela aula real da mesma ocorrência.**

Quando o seletor já provou a mesma ocorrência, `montarPatchReconciliacaoExperimental` deve gravar `emusys_aula_id` quando ele for diferente do valor vindo de `/aulas`, não apenas quando estiver nulo.

- [ ] **Step 3: Parar de enviar o ID do evento como `p_emusys_aula_id`.**

O observador deve chamar `registrar_experimental` sem o parâmetro de aula e, depois do retorno, gravar o ID do evento em `emusys_agendamento_id` do `experimental_id` retornado. O update não altera `emusys_aula_id`.

- [ ] **Step 4: Proteger o banco contra qualquer escritor legado.**

A migration cria um trigger `BEFORE INSERT OR UPDATE OF emusys_aula_id` em `lead_experimentais`: se o número não resolve para uma aula experimental real da mesma unidade, o trigger o move para `emusys_agendamento_id` e deixa `emusys_aula_id` nulo. A migration também substitui `uq_lead_exp_legado` por uma chave que inclui data, horário e curso para não bloquear duas remarcações do mesmo lead no mesmo dia.

- [ ] **Step 5: Rodar os testes da Task 1 até ficarem verdes.**

Run: `node --test tests/syncExperimentaisSnapshotContrato.test.mjs tests/agendaPendenciaExperimental.test.mjs tests/getAgendaDiaAusenteEmusysPostgres.test.mjs`

Expected: todos passam; os testes novos demonstram a troca para a aula real e a recusa de cruzamento entre 09:00 e 10:00.

### Task 3: Corrigir a leitura da Agenda e o reconciliador do banco

**Files:**

- Modify: `supabase/migrations/<timestamp>_experimental_separa_evento_de_aula_e_hora.sql`

- [ ] **Step 1: Atualizar `get_agenda_dia` e `get_agenda_semana`.**

A condição de experimental deve aceitar primeiro uma referência à aula real, validada pela mesma unidade e pelo lead/aluno da lista da aula. O fallback por data+hora fica restrito a linhas sem `emusys_aula_id`. Quando uma linha exata já existe para a mesma pessoa e aula, a linha de fallback não pode duplicar o cartão.

- [ ] **Step 2: Atualizar os dois reconciliadores por lead.**

`fn_experimental_recebe_id_da_aula` e `fn_reconciliar_experimental_por_lead` devem comparar hora BRT junto com unidade, lead e data. Nenhum deles pode ligar uma aula de 10:00 a uma linha de 09:00.

- [ ] **Step 3: Reconciliar apenas os registros cuja aula exata é única e livre.**

A migration promove as referências futuras/atuais que têm uma única aula real por unidade+lead+data+hora. Se já houver uma linha com a mesma aula real, ela não cria associação concorrente; a Agenda já usa a referência física existente. Linhas sem par exato ou com mais de um par não mudam de status.

- [ ] **Step 4: Rodar os testes de banco e os testes de contrato.**

Run: `node --test tests/syncExperimentaisSnapshotContrato.test.mjs tests/agendaPendenciaExperimental.test.mjs tests/getAgendaDiaAusenteEmusysPostgres.test.mjs`

Expected: todos passam sem pular o fixture PostgreSQL quando Docker estiver disponível.

### Task 4: Validar em produção sem alterar presenças já registradas

**Files:**

- Modify: `supabase/migrations/<timestamp>_experimental_separa_evento_de_aula_e_hora.sql`
- Modify: `supabase/functions/debug-webhook-emusys-observador/index.ts`

- [ ] **Step 1: Aplicar a migration versionada e publicar a Edge Function.**

Antes de aplicar, conferir signature, grants e RLS. Depois, validar que `get_agenda_dia` retorna os três cartões corretos da manhã no Recreio, sem duplicar o cartão de Lucas e sem ligar Inácio 09:00 à aula das 10:00.

- [ ] **Step 2: Abrir a Agenda de produção após recarregar.**

Verificar no navegador: Lucas às 09:00 e Leticia às 10:00 aparecem como experimentais e possuem botões de presença; a aula regular no mesmo horário não ganha duplicata.

- [ ] **Step 3: Executar a suíte e o build completos.**

Run: `node --test tests/syncExperimentaisSnapshotContrato.test.mjs tests/agendaPendenciaExperimental.test.mjs tests/getAgendaDiaAusenteEmusysPostgres.test.mjs && npm run build`

Expected: exit code 0 para testes e build.

- [ ] **Step 4: Versionar somente os arquivos desta correção.**

```bash
git add supabase/migrations/<timestamp>_experimental_separa_evento_de_aula_e_hora.sql \
  supabase/functions/_shared/experimental-reconciliacao.ts \
  supabase/functions/_shared/sync-experimentais-mode.ts \
  supabase/functions/debug-webhook-emusys-observador/index.ts \
  tests/syncExperimentaisSnapshotContrato.test.mjs \
  tests/agendaPendenciaExperimental.test.mjs \
  tests/getAgendaDiaAusenteEmusysPostgres.test.mjs \
  docs/superpowers/plans/2026-09-12-experimentais-identidade-aula.md
git commit -m "fix: preservar identidade real das experimentais"
git push
```

## Self-review

- [ ] A origem do ID do evento não escreve mais no campo de aula.
- [ ] A hora entra em toda ligação por lead sem ID de aula.
- [ ] A Agenda usa a aula real antes do fallback de horário e não duplica a pessoa.
- [ ] Nenhuma linha ambígua tem status alterado automaticamente.
- [ ] Os casos de Lucas 09:00, Leticia 09:00 e Leticia 10:00 foram conferidos no banco e no navegador após recarga.
