# Pendências de presença por trancamento e reagendamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir pendências indevidas de alunos trancados e reconciliar com segurança a aula do dia anterior removida por uma alteração de grade no Emusys.

**Architecture:** Uma função SQL interna decide a elegibilidade de cada par aluno/aula a partir da jornada de matrícula específica da unidade e do curso. A função do relatório diário e a view chamam o mesmo predicado. A reconciliação de grade mantém soft-cancelamento por slot, preserva marcações humanas e passa a aceitar somente a janela de ontem até o futuro configurado.

**Tech Stack:** PostgreSQL/Supabase migrations, SQL `SECURITY DEFINER`, Supabase Edge Function em Deno/TypeScript, Node.js built-in test runner e PostgreSQL 17 em Docker.

---

## Estrutura de arquivos

- `supabase/migrations/20260815124415_corrige_pendencias_presenca_trancamento_reagendamento.sql`: cria o predicado de trancamento, atualiza relatório/view, amplia a constraint e substitui a RPC de reconciliação.
- `supabase/functions/reconciliar-grade-aluno/index.ts`: amplia a foto buscada para começar no dia anterior.
- `tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs`: fixture PostgreSQL que exerce os quatro cenários e o contrato da edge.
- `package.json`: inclui a regressão no comando padrão `npm test`.
- `docs/superpowers/specs/2026-08-15-presenca-pendencias-trancamento-reagendamento-design.md`: decisão de negócio, identidade dos dados e limites da correção.

### Task 1: Escrever a regressão executável

**Files:**
- Create: `tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs`
- Test: `tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs`

- [ ] **Step 1: Criar uma fixture PostgreSQL mínima, com as tabelas e funções dependidas pela migration.**

```js
const fixtureSchema = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;
  create role sol_acesso_restrito;
  create role mila_acesso_restrito;
  create role fabio_agent;
  create role lia_acesso_restrito;
  create table public.unidades (id uuid primary key, nome text not null);
  create table public.alunos (id integer primary key, nome text not null);
  create table public.aluno_jornada_matricula_disciplina (
    unidade_id uuid not null, aluno_id integer not null,
    emusys_matricula_disciplina_id bigint not null,
    curso_nome_emusys text, status_matricula text not null,
    trancamento_data_inicial date, trancamento_data_final date
  );
`;
```

- [ ] **Step 2: Inserir quatro alunos/aulas com data relativa a ontem.**

```sql
-- trancamento anterior, trancamento posterior, outro curso e slot removido
insert into public.aluno_jornada_matricula_disciplina values
  ('11111111-1111-1111-1111-111111111111', 11, 501, 'Musicalização para Bebês T', 'trancada', current_date - 10, current_date + 5),
  ('22222222-2222-2222-2222-222222222222', 12, 601, 'Canto T', 'trancada', current_date - 20, current_date + 2),
  ('11111111-1111-1111-1111-111111111111', 13, 701, 'Bateria T', 'trancada', current_date, current_date + 10),
  ('11111111-1111-1111-1111-111111111111', 14, 801, 'Bateria T', 'trancada', current_date - 10, current_date + 10);
```

- [ ] **Step 3: Fazer a asserção que ainda falha antes da implementação.**

```js
assert.deepEqual(pendencias.stdout.trim().split(/\r?\n/u), ['13', '14']);
assert.deepEqual(view.stdout.trim().split(/\r?\n/u), ['13', '14']);
assert.equal(cancelamentoOntem.stdout.trim(), 'sync_ausente_emusys|t');
assert.equal(marcacaoHumana.stdout.trim(), 'f|agenda_secretaria');
```

- [ ] **Step 4: Executar a regressão e confirmar falha pela ausência da nova migration.**

Run: `node --test tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs`

Expected: FAIL porque a função `fn_presenca_pendencia_elegivel` e a constraint que aceita `sync_ausente_emusys` ainda não existem.

- [ ] **Step 5: Registrar o estado TDD.**

Run: `git status --short`

Expected: o novo teste aparece como não rastreado e nenhuma definição de produção foi editada.

### Task 2: Implementar o predicado de trancamento nos dois consumidores

**Files:**
- Modify: `supabase/migrations/20260815124415_corrige_pendencias_presenca_trancamento_reagendamento.sql`
- Test: `tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs`

- [ ] **Step 1: Criar o predicado restrito à jornada da mesma unidade e disciplina.**

```sql
create or replace function public.fn_presenca_pendencia_elegivel(
  p_unidade_id uuid, p_aluno_id integer, p_data_aula date,
  p_matricula_disciplina_id bigint, p_curso_nome text
) returns boolean
language sql stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select not exists (
    select 1
      from public.aluno_jornada_matricula_disciplina j
     where j.unidade_id = p_unidade_id
       and j.aluno_id = p_aluno_id
       and j.status_matricula = 'trancada'
       and j.trancamento_data_inicial <= p_data_aula
       and (j.trancamento_data_final is null or j.trancamento_data_final >= p_data_aula)
       and (
         (coalesce(p_matricula_disciplina_id, 0) > 0
          and j.emusys_matricula_disciplina_id = p_matricula_disciplina_id)
         or (coalesce(p_matricula_disciplina_id, 0) = 0
             and nullif(btrim(coalesce(p_curso_nome, '')), '') is not null
             and lower(btrim(j.curso_nome_emusys)) = lower(btrim(p_curso_nome)))
       )
  );
$function$;
```

- [ ] **Step 2: Revogar o acesso padrão e conceder somente aos consumidores existentes.**

```sql
revoke all on function public.fn_presenca_pendencia_elegivel(uuid, integer, date, bigint, text)
  from public, anon, authenticated;
grant execute on function public.fn_presenca_pendencia_elegivel(uuid, integer, date, bigint, text)
  to service_role, sol_acesso_restrito, mila_acesso_restrito, fabio_agent, lia_acesso_restrito;
```

- [ ] **Step 3: Incluir `ae.matricula_disciplina_id` no CTE `pares` e filtrar pela função antes de calcular sem resposta/divergência.**

```sql
and public.fn_presenca_pendencia_elegivel(
  ae.unidade_id, r.aluno_id, ae.data_aula,
  ae.matricula_disciplina_id, ae.curso_nome
)
```

- [ ] **Step 4: Aplicar o mesmo predicado à `vw_presenca_pendencia`.**

```sql
and public.fn_presenca_pendencia_elegivel(
  ae.unidade_id, r.aluno_id, ae.data_aula,
  ae.matricula_disciplina_id, ae.curso_nome
)
```

- [ ] **Step 5: Executar o teste de regressão e confirmar passagem dos três casos de trancamento.**

Run: `node --test tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs`

Expected: PASS; os alunos trancados antes da aula não aparecem, o trancamento posterior e o outro curso aparecem.

### Task 3: Corrigir a reconciliação do webhook sem tocar em decisão humana

**Files:**
- Modify: `supabase/migrations/20260815124415_corrige_pendencias_presenca_trancamento_reagendamento.sql`
- Modify: `supabase/functions/reconciliar-grade-aluno/index.ts`
- Test: `tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs`

- [ ] **Step 1: Ampliar a constraint para a origem de soft-cancel já emitida pela RPC.**

```sql
alter table public.aulas_emusys
  drop constraint if exists aulas_emusys_cancelada_origem_check;
alter table public.aulas_emusys
  add constraint aulas_emusys_cancelada_origem_check
  check (cancelada_origem is null or cancelada_origem in (
    'emusys', 'agenda_secretaria', 'sync_ausente_emusys'
  ));
```

- [ ] **Step 2: Substituir a guarda temporal da RPC por uma janela limitada a ontem.**

```sql
if p_data_inicio < ((now() at time zone 'America/Sao_Paulo')::date - 1) then
  return jsonb_build_object(
    'status','abortado',
    'motivo','p_data_inicio anterior a ontem — janela limitada de reconciliacao',
    'aplicadas',0
  );
end if;
```

- [ ] **Step 3: Manter na RPC as guardas existentes de slot vivo, outro aluno e marcação humana.**

```sql
when v.slot_parcialmente_vivo then 'mantido_slot_vivo'
when v.tem_outro_aluno        then 'mantido_outro_aluno'
when v.tem_marcacao_humana    then 'mantido_marcacao_humana'
else 'cancelar'
```

- [ ] **Step 4: Fazer a edge buscar do dia anterior em diante e passar a mesma janela à RPC.**

```ts
const hoje = hojeBRT();
const dataInicio = somarDias(hoje, -1);
const dataFim = somarDias(hoje, dias);
```

- [ ] **Step 5: Executar a regressão e confirmar soft-cancel auditável e preservação humana.**

Run: `node --test tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs`

Expected: PASS; o slot de ontem sem resposta recebe `sync_ausente_emusys`, e o slot com `agenda_secretaria` continua não cancelado.

### Task 4: Verificação completa e publicação controlada

**Files:**
- Modify: `supabase/migrations/20260815124415_corrige_pendencias_presenca_trancamento_reagendamento.sql`
- Modify: `supabase/functions/reconciliar-grade-aluno/index.ts`
- Test: `tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs`

- [ ] **Step 1: Executar os testes específicos, toda a suíte e o build.**

Run: `node --test tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs && npm test && npm run build`

Expected: todos os testes e o build terminam com código 0.

- [ ] **Step 2: Inspecionar o diff e o estado da migration antes do rollout.**

Run: `git diff --check && git diff -- supabase/migrations/20260815124415_corrige_pendencias_presenca_trancamento_reagendamento.sql supabase/functions/reconciliar-grade-aluno/index.ts tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs`

Expected: somente a nova regra, a janela de ontem, o teste e a documentação aparecem.

- [ ] **Step 3: Aplicar a migration via ferramenta de migrations e publicar somente a edge `reconciliar-grade-aluno`, mantendo `verify_jwt=false` já existente por autenticação própria de webhook.**

```text
apply_migration(project_id='ouqwbbermlzqqvtqwlul', name='corrige_pendencias_presenca_trancamento_reagendamento', query=conteúdo de supabase/migrations/20260815124415_corrige_pendencias_presenca_trancamento_reagendamento.sql)
deploy_edge_function(project_id='ouqwbbermlzqqvtqwlul', name='reconciliar-grade-aluno', verify_jwt=false, files=conteúdo de supabase/functions/reconciliar-grade-aluno/index.ts)
```

- [ ] **Step 4: Confirmar sem escrever dados de produção que Elisa, Fabiana e Isis não retornam mais nas duas superfícies de 14/08/2026.**

```sql
select * from public.fn_presenca_pendencias_do_dia('2ec861f6-023f-4d7b-9927-3960ad8c2a92', date '2026-08-14');
select aluno_nome from public.vw_presenca_pendencia
 where data_aula = date '2026-08-14'
   and aluno_nome in ('Elisa Marques Blunk', 'Fabiana Mendonça Puime Paiva', 'Isis Petrucio Abrantes');
```

- [ ] **Step 5: Confirmar a constraint, a janela de ontem e as permissões da nova função.**

```sql
select pg_get_constraintdef(oid) from pg_constraint
 where conname = 'aulas_emusys_cancelada_origem_check';
select has_function_privilege('anon', 'public.fn_presenca_pendencia_elegivel(uuid,integer,date,bigint,text)', 'execute'),
       has_function_privilege('service_role', 'public.fn_presenca_pendencia_elegivel(uuid,integer,date,bigint,text)', 'execute');
```

- [ ] **Step 6: Fazer o commit local de entrega, sem push ou merge automático.**

Run: `git add docs/superpowers/specs/2026-08-15-presenca-pendencias-trancamento-reagendamento-design.md docs/superpowers/plans/2026-08-15-presenca-pendencias-trancamento-reagendamento.md supabase/migrations/20260815124415_corrige_pendencias_presenca_trancamento_reagendamento.sql supabase/functions/reconciliar-grade-aluno/index.ts tests/presencaPendenciasTrancamentoReagendamentoPostgres.test.mjs && git commit -m "fix: corrige pendencias de presenca por trancamento"`

Expected: um commit local na branch `fix/presenca-pendencias-trancamento`; nenhum push, merge, relatório histórico ou decisão humana é alterado.
