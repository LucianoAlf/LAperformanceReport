# Convergência de presença — Fase 3: consumidores canônicos em sombra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer Agenda, Conciliação, LA Teacher/Fábio, Sol, Lia, Mila, relatórios e KPIs consumirem o mesmo contrato de presença, sem promover ausência bruta por inferência e sem ativar `canonico_v2`.

**Architecture:** Primeiro uma migration posterior ao ledger corrige o envelope legado de rollback; a projeção canônica continua aplicando somente políticas temporais versionadas. Depois os consumidores de leitura são importados seletivamente de `b263741c`, enquanto os três escritores do Hugo recebem apenas a camada visual e mantêm o recibo direto da Fase 2.

**Tech Stack:** PostgreSQL 17 descartável, Supabase migrations/RPCs, React/TypeScript, Node test runner, Deno, Vite e navegador autenticado.

---

## Regras de domínio bloqueantes

1. O grão é aluno local + unidade + ocorrência/slot completo da aula.
2. `alunos.id` é linha operacional; não representa uma pessoa universal.
3. IDs Emusys só são válidos com `unidade_id`.
4. `aluno_presenca` permanece evidência bruta; a decisão vem da projeção semântica.
5. O envelope legado não transforma `ausente` bruto em falta.
6. A projeção canônica pode classificar a ausência de 01/06/2026 a 31/07/2026
   somente porque consulta `presenca_politicas_confiabilidade`; não repetir essa
   regra por data ou nome de unidade em React, Edge ou nova RPC.
7. `aulas_emusys.professor_presenca = 'ausente'` permanece sinal operacional
   bruto, nunca falta do professor, penalidade ou Health Score.
8. Dados incompletos aparecem como `Em auditoria` ou `Dados desatualizados`,
   nunca como zero ou sucesso.

## Mapa de arquivos

### Criar

- migration gerada pelo CLI com sufixo `presenca_ausencia_bruta_fail_closed.sql`.
- `tests/presencaAusenciaBrutaFailClosedPostgres.test.mjs`.

### Restaurar seletivamente de `b263741c`

- `src/lib/presencaCanonica.ts`
- `src/lib/presencaCanonica.test.ts`
- `src/hooks/useAgendaDia.ts`
- `src/hooks/useAgendaSemana.ts`
- `src/hooks/useSaudeCrons.ts`
- consumidores de Agenda, Conciliação, Sucesso do Aluno e KPIs listados nas tasks.
- oito testes frontend, com três reescritos para preservar o transporte do Hugo.

### Não restaurar

- `src/lib/presencaComando.ts`
- `src/lib/presencaEnvioPendente.ts`
- versões candidatas completas de `ChamadaDia.tsx`,
  `ProfessorPresencaToggle.tsx` e `useChamadaAcoes.ts`.

## Task 1: Criar o teste PostgreSQL da ausência bruta fail-closed

**Files:**
- Create: `tests/presencaAusenciaBrutaFailClosedPostgres.test.mjs`
- Read: `supabase/migrations/20260827030100_presenca_ocorrencia_canonica_v2.sql`
- Read: `supabase/migrations/20260827031700_presenca_rollout_adapters.sql`

- [ ] **Step 1: Escrever a trava estática e o fixture descartável**

Create `tests/presencaAusenciaBrutaFailClosedPostgres.test.mjs` with:

```javascript
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const canonical = join(migrationsDir, '20260827030100_presenca_ocorrencia_canonica_v2.sql');
const correctionName = readdirSync(migrationsDir)
  .filter((name) => /_presenca_ausencia_bruta_fail_closed\.sql$/u.test(name))
  .at(-1);
const UNIT = '91000000-0000-0000-0000-000000000001';

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function psql(container, sql) {
  const result = docker([
    'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL 17 descartável não ficou pronto');
}

test('correção não hardcode política e mantém a projeção temporal versionada', () => {
  assert.ok(correctionName, 'migration presenca_ausencia_bruta_fail_closed ausente');
  const correction = readFileSync(join(migrationsDir, correctionName), 'utf8');
  const canonicalSql = readFileSync(canonical, 'utf8');
  assert.equal((correction.match(/when\s+'ausente'\s+then\s+'indeterminado'/giu) ?? []).length, 2);
  assert.doesNotMatch(correction, /Barra|Recreio|Campo Grande|2026-06-01|2026-07-31/iu);
  assert.match(canonicalSql, /presenca_politicas_confiabilidade/iu);
  assert.match(canonicalSql, /ausencia_emusys_resultado\s*=\s*'falta_confirmada'/iu);
});

test('aluno e professor ausentes brutos ficam indeterminados no envelope legado', { timeout: 120_000 }, async (t) => {
  if (!correctionName || docker(['info']).status !== 0) {
    t.skip('Docker ou migration indisponível');
    return;
  }
  const container = `la-presenca-ausencia-${process.pid}`;
  const started = docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine']);
  assert.equal(started.status, 0, started.stderr);
  try {
    await waitForPostgres(container);
    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create type public.agenda_fixture as (
        chave text, professor_id integer, professor_presenca text,
        alunos jsonb, aula_ids integer[]
      );
      create function public.get_agenda_dia(date, uuid default null)
      returns setof public.agenda_fixture language sql stable as $$
        select ('slot-1', 7, 'ausente',
          jsonb_build_array(jsonb_build_object(
            'aluno_id', 101,
            'aula_emusys_id', 10,
            'status_presenca', 'ausente',
            'respondido_por', 'emusys'
          )), array[10])::public.agenda_fixture
      $$;
      create function public.fn_presenca_pendencias_do_dia(uuid, date)
      returns table(motivo text, aluno_id integer) language sql stable as $$
        select 'sem_resposta'::text, 101
      $$;
    `);
    psql(container, readFileSync(join(migrationsDir, correctionName), 'utf8'));
    const result = JSON.parse(psql(container, `
      select public.fn_agenda_dia_legado_envelope_v1('2026-08-27', '${UNIT}');
    `));
    assert.equal(result.ocorrencias[0].resultado_canonico, 'indeterminado');
    assert.equal(result.professores_ocorrencias[0].estado, 'indeterminado');
    const acl = psql(container, `
      select has_function_privilege('public','public.fn_agenda_dia_legado_envelope_v1(date,uuid)','execute');
    `);
    assert.equal(acl, 'f');
  } finally {
    docker(['rm', '-f', container]);
  }
});
```

- [ ] **Step 2: Rodar e confirmar RED**

Run:

```powershell
node --test tests/presencaAusenciaBrutaFailClosedPostgres.test.mjs
```

Expected: first test fails because the corrective migration does not exist.

## Task 2: Gerar e implementar a migration corretiva posterior ao Hugo

**Files:**
- Create via CLI: migration with suffix `presenca_ausencia_bruta_fail_closed.sql`
- Test: `tests/presencaAusenciaBrutaFailClosedPostgres.test.mjs`

- [ ] **Step 1: Descobrir o comando e confirmar o ledger antes de gerar**

Run:

```powershell
npx supabase --version
npx supabase migration --help
npx supabase migration new --help
npx supabase migration list
```

Expected: CLI responds; the remote ledger includes Hugo's
`20260827151832_agenda_chamada_volta_do_fechamento_de_bypass` and its current
tip `20260827180000_repescagem_irmaos_guarda_e_texto`. Stop if a newer remote
version is not represented locally.

- [ ] **Step 2: Gerar o nome pelo CLI e capturar o caminho real**

Run:

```powershell
npx supabase migration new presenca_ausencia_bruta_fail_closed
$migrationFile = (Get-ChildItem 'supabase/migrations/*_presenca_ausencia_bruta_fail_closed.sql' | Sort-Object Name | Select-Object -Last 1).FullName
$migrationVersion = [IO.Path]::GetFileName($migrationFile).Split('_')[0]
if ([Int64]$migrationVersion -le 20260827180000) { throw 'migration nova não ficou posterior ao ledger remoto revalidado' }
$migrationFile
```

Expected: one CLI-generated file whose numeric prefix is greater than
`20260827180000`.

- [ ] **Step 3: Definir novamente somente o envelope legado**

Use `apply_patch` on the exact path printed in Step 2. Copy the complete
`fn_agenda_dia_legado_envelope_v1(date, uuid)` body from
`20260827031700_presenca_rollout_adapters.sql`, preserving signature,
`SECURITY DEFINER`, fixed `search_path`, pending/conflict fields and return
shape. Make exactly these two semantic substitutions:

```sql
-- aluno
when 'ausente' then 'indeterminado'

-- professor
when 'ausente' then 'indeterminado'
```

End the migration with the same deny-by-default ACL:

```sql
revoke all on function public.fn_agenda_dia_legado_envelope_v1(date, uuid)
  from public, anon, authenticated, service_role;

comment on function public.fn_agenda_dia_legado_envelope_v1(date, uuid) is
  'Envelope de rollback fail-closed: ausência bruta não vira decisão terminal; política temporal vive somente na projeção canônica.';
```

Do not copy the dynamic `pg_get_functiondef` block from migration `031700` and
do not redefine any other adapter.

- [ ] **Step 4: Confirmar GREEN em PostgreSQL real descartável**

Run:

```powershell
node --test tests/presencaAusenciaBrutaFailClosedPostgres.test.mjs
node --test tests/presencaRolloutAdaptersPostgres.test.mjs
```

Expected: both tests pass; the historical policy-aware canonical projection is
still detected and the legacy envelope returns two `indeterminado` values.

- [ ] **Step 5: Commit da correção sem aplicar no remoto**

```powershell
git add -- $migrationFile tests/presencaAusenciaBrutaFailClosedPostgres.test.mjs
git commit -m "fix(presenca): impede ausencia bruta no envelope legado"
```

Expected: local commit only. Do not run `db push` or `apply_migration`.

## Task 3: Restaurar e corrigir o adaptador canônico de UI

**Files:**
- Restore: `src/lib/presencaCanonica.ts`
- Restore: `src/lib/presencaCanonica.test.ts`
- Modify: `src/lib/presencaCanonica.ts`
- Test: `src/lib/presencaCanonica.test.ts`
- Test: `tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs`

- [ ] **Step 1: Restaurar somente os dois arquivos do adaptador**

Run:

```powershell
git restore --source b263741c -- src/lib/presencaCanonica.ts src/lib/presencaCanonica.test.ts
```

- [ ] **Step 2: Adicionar testes para proveniência temporal e versão flexível**

In `src/lib/presencaCanonica.test.ts`, add cases asserting:

```typescript
assertEquals(
  rotuloPresencaFonte('emusys_politica_temporal'),
  'Emusys (política temporal versionada)',
);
assertEquals(
  adaptarPresencaCanonica({
    alunoId: 10,
    aulaEmusysId: 20,
    emusysPresencaBruta: 'ausente',
    envelope: {
      dados_status: 'atualizados',
      sincronizado_em: '2026-08-27T12:00:00Z',
      regra_versao: 'presenca-ocorrencia-canonica-v2.1+politica-2026-06-07',
      rollout_modo: 'sombra',
      ocorrencias: [],
    },
  }).estado,
  'indeterminado',
);
```

The second assertion proves React does not promote raw absence when no
canonical occurrence exists.

Extend the PostgreSQL 17 fixture in
`tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs` and keep these three
identity assertions explicit:

```javascript
assert.equal(byAluno(102).length, 2, 'dois cursos do mesmo aluno permanecem dois slots');
assert.equal(byAluno(110).length, 2, 'mesmo ID Emusys em unidades distintas não colide');
assert.deepEqual(
  [byAluno(120).length, byAluno(121).length],
  [1, 1],
  'dois alunos homônimos permanecem separados por aluno_id',
);
```

For the homonym case, insert two local students with the same display name but
different `aluno_id`; never use the name in a join, partition or deduplication
key.

- [ ] **Step 3: Run RED**

Run:

```powershell
deno test src/lib/presencaCanonica.test.ts
node --test tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs
```

Expected: the Deno test fails because `emusys_politica_temporal` and
`rollout_modo` are absent from the types/labels; the PostgreSQL identity fixture
passes against the already restored canonical migration and remains as a
regression lock.

- [ ] **Step 4: Ajustar os tipos e o rótulo**

In `src/lib/presencaCanonica.ts`:

```typescript
export type PresencaFonte =
  | 'emusys'
  | 'emusys_politica_temporal'
  | 'agenda_secretaria'
  | 'professor_la_teacher'
  | 'fabio_audio'
  | 'manual';

export interface PresencaEnvelopeAdaptavel {
  dados_status: 'atualizados' | 'dados_desatualizados' | 'roster_em_revisao';
  sincronizado_em: string | null;
  regra_versao: string;
  rollout_modo?: 'legado' | 'sombra' | 'canonico_v2';
  ocorrencias: PresencaOcorrenciaAgenda[];
}
```

Add `emusys_politica_temporal: 'Emusys (política temporal versionada)'` to
`ROTULOS_FONTE` and return this exact source from `normalizarFonte`.

- [ ] **Step 5: Run GREEN and commit**

```powershell
deno test src/lib/presencaCanonica.test.ts
node --test tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs
git add -- src/lib/presencaCanonica.ts src/lib/presencaCanonica.test.ts tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs
git commit -m "feat(presenca): adiciona adaptador visual canonico"
```

## Task 4: Integrar Agenda e Conciliação sem tocar no transporte

**Files:**
- Restore: `src/hooks/useAgendaDia.ts`
- Restore: `src/hooks/useAgendaSemana.ts`
- Restore: `src/components/App/Agenda/AgendaCard.tsx`
- Restore: `src/components/App/Agenda/AgendaDrawer.tsx`
- Restore: `src/components/App/Agenda/AgendaPage.tsx`
- Restore: `src/components/App/Agenda/AgendaTimeline.tsx`
- Restore: `src/components/App/Agenda/Chamada/AlertaPendencias.tsx`
- Restore: `src/components/App/Agenda/Chamada/ChamadaAlunoCard.tsx`
- Restore: `src/components/App/Agenda/Chamada/ChamadaAulaBloco.tsx`
- Restore: `src/components/App/Agenda/Chamada/ChamadaDrawer.tsx`
- Restore: `src/components/App/Agenda/Chamada/ChamadaLista.tsx`
- Restore: `src/components/App/Agenda/Chamada/ChamadaSemana.tsx`
- Restore: `src/components/App/Agenda/Chamada/ChamadaView.tsx`
- Restore: `src/components/App/Alunos/ConciliacaoPresencas.tsx`
- Modify manually: `src/components/App/Agenda/Chamada/ChamadaDia.tsx`
- Modify manually: `src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx`
- Preserve: `src/components/App/Agenda/Chamada/useChamadaAcoes.ts`

- [ ] **Step 1: Restaurar somente os leitores sem conflito de escrita**

Run:

```powershell
git restore --source b263741c -- `
  src/hooks/useAgendaDia.ts `
  src/hooks/useAgendaSemana.ts `
  src/components/App/Agenda/AgendaCard.tsx `
  src/components/App/Agenda/AgendaDrawer.tsx `
  src/components/App/Agenda/AgendaPage.tsx `
  src/components/App/Agenda/AgendaTimeline.tsx `
  src/components/App/Agenda/Chamada/AlertaPendencias.tsx `
  src/components/App/Agenda/Chamada/ChamadaAlunoCard.tsx `
  src/components/App/Agenda/Chamada/ChamadaAulaBloco.tsx `
  src/components/App/Agenda/Chamada/ChamadaDrawer.tsx `
  src/components/App/Agenda/Chamada/ChamadaLista.tsx `
  src/components/App/Agenda/Chamada/ChamadaSemana.tsx `
  src/components/App/Agenda/Chamada/ChamadaView.tsx `
  src/components/App/Alunos/ConciliacaoPresencas.tsx
```

Expected: no `presencaComando` or `presencaEnvioPendente` file appears.

- [ ] **Step 2: Restaurar os cinco testes de leitura**

Run:

```powershell
git restore --source b263741c -- `
  tests/presencaConsumidoresCanonicosV2.test.mjs `
  tests/presencaKpisFrontendCanonicosV2.test.mjs `
  tests/presencaPendenciasAgendaFrontend.test.mjs `
  tests/presencaRosterConciliacaoFrontend.test.mjs `
  tests/presencaCheckpoint63PublicacaoFrontend.test.mjs
```

- [ ] **Step 3: Criar as três travas compatíveis com o Hugo**

Restore these files from `b263741c`, then replace their transport assertions:

```powershell
git restore --source b263741c -- `
  tests/presencaCheckpoint6InterfacesCanonicas.test.mjs `
  tests/presencaComandoAgendaFrontend.test.mjs `
  tests/presencaProfessorComandoFrontend.test.mjs
```

The rewritten tests must assert:

```javascript
assert.match(agenda, /get_agenda_dia_v2/u);
assert.match(chamada, /app_registrar_chamada_agenda[\s\S]*p_request_id/u);
assert.match(professor, /app_marcar_presenca_professor_aula[\s\S]*p_request_id/u);
assert.match(professor, /app_registrar_presenca_professor_dia[\s\S]*p_request_id/u);
assert.match(professor, /app_remover_presenca_professor_dia[\s\S]*p_request_id/u);
for (const source of [chamada, professor, dia]) {
  assert.match(source, /interpretarEEncerrarPedido/u);
  assert.doesNotMatch(source, /presencaComando|criarEAplicarComandoPresenca|app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1/u);
}
```

Keep the existing assertions for source, freshness, rule version, receipt and
`Em auditoria` states.

- [ ] **Step 4: Run RED before the manual conflict port**

Run:

```powershell
node --test tests/presencaPendenciasAgendaFrontend.test.mjs tests/presencaRosterConciliacaoFrontend.test.mjs tests/presencaCheckpoint6InterfacesCanonicas.test.mjs tests/presencaComandoAgendaFrontend.test.mjs tests/presencaProfessorComandoFrontend.test.mjs
```

Expected: read-hook assertions pass; `ChamadaDia` and professor visual metadata
assertions fail.

- [ ] **Step 5: Portar somente a apresentação nos dois arquivos do Hugo**

Starting from the Fase 2 versions of `ChamadaDia.tsx` and
`ProfessorPresencaToggle.tsx`:

- add `presenca: PresencaEnvelopeAgenda` to props;
- use `adaptarPresencaCanonica`, `adaptarPresencaProfessorCanonica` and
  `resumirAulaPresencaCanonica` for display and completeness;
- disable write controls when `presenca.dados_status !== 'atualizados'`;
- render source, decision time and receipt status;
- render `Em auditoria` for `indeterminado`/`roster_em_revisao` and
  `Dados desatualizados` for stale data;
- preserve every direct RPC, `p_request_id`, `user.id`,
  `requestIdDoPedido` and `interpretarEEncerrarPedido` from Fase 2;
- do not add `useRef` request maps or imports from the two forbidden helpers.

Do not modify `useChamadaAcoes.ts` in this task.

- [ ] **Step 6: Run GREEN and commit Agenda/Conciliação**

```powershell
node --test tests/presencaPendenciasAgendaFrontend.test.mjs tests/presencaRosterConciliacaoFrontend.test.mjs tests/presencaCheckpoint6InterfacesCanonicas.test.mjs tests/presencaComandoAgendaFrontend.test.mjs tests/presencaProfessorComandoFrontend.test.mjs
git add -- src/hooks/useAgendaDia.ts src/hooks/useAgendaSemana.ts src/components/App/Agenda src/components/App/Alunos/ConciliacaoPresencas.tsx tests/presencaPendenciasAgendaFrontend.test.mjs tests/presencaRosterConciliacaoFrontend.test.mjs tests/presencaCheckpoint6InterfacesCanonicas.test.mjs tests/presencaComandoAgendaFrontend.test.mjs tests/presencaProfessorComandoFrontend.test.mjs
git commit -m "feat(presenca): conecta agenda e conciliacao ao contrato canonico"
```

## Task 5: Verificar LA Teacher/Fábio e agentes no contrato escopado

**Files:**
- Verify: `D:\la-teacher\src`
- Test: `tests/presencaConsumidoresCanonicosV2.test.mjs`
- Test: `tests/presencaLaTeacherCanonicaV2Postgres.test.mjs`
- Test: `tests/presencaAgentesCanonicos.test.mjs`
- Test: `tests/presencaAgentesAnaliticosContrato.test.mjs`
- Test: `tests/liaPresencaCanonicaDispatcher.test.mjs`

- [ ] **Step 1: Provar que LA Teacher usa RPC escopada e não tabela crua**

Run:

```powershell
rg -n "app_minha_agenda_sessao|app_minha_agenda_mes|app_minha_carteira" "D:\la-teacher\src"
$raw = rg -n "from\(['\"](?:aluno_presenca|aula_alunos_emusys|vw_fabio_aulas_contexto)['\"]\)" "D:\la-teacher\src"
if ($LASTEXITCODE -eq 0) { $raw; throw 'leitura crua encontrada no LA Teacher' }
if ($LASTEXITCODE -ne 1) { throw 'rg falhou no checkout LA Teacher' }
```

Expected: at least one scoped `app_minha_agenda_*` call and no raw table/view
read. If the checkout path is absent, stop this gate; do not infer compliance.

- [ ] **Step 2: Rodar os contratos backend já restaurados na Fase 1**

Run:

```powershell
node --test tests/presencaLaTeacherCanonicaV2Postgres.test.mjs tests/presencaAgentesCanonicos.test.mjs tests/presencaAgentesAnaliticosContrato.test.mjs tests/liaPresencaCanonicaDispatcher.test.mjs tests/presencaConsumidoresCanonicosV2.test.mjs
```

Expected: LA Teacher/Fábio remains backwards compatible in `sombra`; Sol, Lia,
Mila, Fábio and BI expose period, universe, source, freshness and rule without a
raw-table fallback.

- [ ] **Step 3: Confirmar cobertura, sem inventar histórico**

Generate the read-only SQL with the audit script restored in Fase 1:

```powershell
$env:AUDIT_PRINT_SQL = '1'
node scripts/auditar-presenca-canonica.mjs
Remove-Item Env:AUDIT_PRINT_SQL
```

Execute the printed `WITH/SELECT` through the authorized read-only SQL tool,
then feed the aggregated JSON rows back through `AUDIT_ROWS_STDIN=1`. Expected:
coverage counts are separated for Fábio, Mila and each agent. Empty coverage
remains empty/null; no student names are printed.

## Task 6: Restaurar visualizações de Sucesso, saúde e KPIs

**Files:**
- Restore: `src/components/App/Administrativo/PainelFarmer/hooks/useSucessoAlunoAlertas.ts`
- Restore: `src/components/App/Automacoes/TabSaudeCrons.tsx`
- Restore: `src/components/App/Professores/ModalDetalhesPresenca.tsx`
- Restore: `src/components/App/SucessoCliente/FaltasMesSection.tsx`
- Restore: `src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx`
- Restore: `src/components/App/SucessoCliente/PresencaTab.tsx`
- Restore: `src/components/App/SucessoCliente/hooks/useFaltasPeriodo.ts`
- Restore: `src/components/GestaoMensal/TabProfessoresNew.tsx`
- Restore: `src/hooks/useSaudeCrons.ts`
- Restore: `src/lib/professoresKpisCanonicos.ts`
- Restore: `tests/presencaSyncSaudeOperacional.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Restaurar o grupo de leitura numérica**

Run:

```powershell
git restore --source b263741c -- `
  src/components/App/Administrativo/PainelFarmer/hooks/useSucessoAlunoAlertas.ts `
  src/components/App/Automacoes/TabSaudeCrons.tsx `
  src/components/App/Professores/ModalDetalhesPresenca.tsx `
  src/components/App/SucessoCliente/FaltasMesSection.tsx `
  src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx `
  src/components/App/SucessoCliente/PresencaTab.tsx `
  src/components/App/SucessoCliente/hooks/useFaltasPeriodo.ts `
  src/components/GestaoMensal/TabProfessoresNew.tsx `
  src/hooks/useSaudeCrons.ts `
  src/lib/professoresKpisCanonicos.ts `
  tests/presencaSyncSaudeOperacional.test.mjs
```

- [ ] **Step 2: Adicionar o script canônico isolado**

Add this exact `package.json` script, preserving the Fase 1 script:

```json
"test:presenca-canonica": "deno test src/lib/presencaCanonica.test.ts tests/presencaAgentesAnaliticosCanonicos.test.ts && node --test tests/liaPresencaCanonicaDispatcher.test.mjs tests/presencaAgentesAnaliticosContrato.test.mjs tests/presencaAgentesCanonicos.test.mjs tests/presencaCheckpoint63PublicacaoFrontend.test.mjs tests/presencaCheckpoint6InterfacesCanonicas.test.mjs tests/presencaComandoAgendaFrontend.test.mjs tests/presencaConsumidoresCanonicosV2.test.mjs tests/presencaInterfacesConsultaV2Postgres.test.mjs tests/presencaKpisCanonicosV2.test.mjs tests/presencaKpisCanonicosV2Postgres.test.mjs tests/presencaKpisCanonicosV2ProducersPostgres.test.mjs tests/presencaKpisFrontendCanonicosV2.test.mjs tests/presencaLaTeacherCanonicaV2Postgres.test.mjs tests/presencaMigrationReleaseOrder.test.mjs tests/presencaPendenciasAgendaFrontend.test.mjs tests/presencaPreviaReparoScript.test.mjs tests/presencaProfessorComandoFrontend.test.mjs tests/presencaRolloutAdaptersPostgres.test.mjs tests/presencaRolloutConfigPostgres.test.mjs tests/presencaRolloutDetalhesPostgres.test.mjs tests/presencaRolloutFabioPeriodoPostgres.test.mjs tests/presencaRolloutKpisPostgres.test.mjs tests/presencaRosterConciliacaoFrontend.test.mjs tests/presencaSegurancaFuncoesInternasPostgres.test.mjs tests/presencaShadowComparacaoPostgres.test.mjs tests/presencaSyncSaudeOperacional.test.mjs tests/presencaAusenciaBrutaFailClosedPostgres.test.mjs"
```

- [ ] **Step 3: Provar equação, universo e nulos fail-closed**

Run:

```powershell
npm run test:presenca-canonica
```

Expected: tests prove period, universe, numerator, denominator, source,
freshness, rule and publication state; incomplete data never becomes numeric
zero.

- [ ] **Step 4: Commit do grupo de visualizações**

```powershell
git add -- src/components/App/Administrativo/PainelFarmer/hooks/useSucessoAlunoAlertas.ts src/components/App/Automacoes/TabSaudeCrons.tsx src/components/App/Professores/ModalDetalhesPresenca.tsx src/components/App/SucessoCliente src/components/GestaoMensal/TabProfessoresNew.tsx src/hooks/useSaudeCrons.ts src/lib/professoresKpisCanonicos.ts tests package.json
git commit -m "feat(presenca): conecta agentes e indicadores ao contrato canonico"
```

## Task 7: Fechar o gate de consumidores ainda em sombra

**Files:**
- Modify: `docs/audits/2026-08-27-presenca-convergencia-execucao.md`

- [ ] **Step 1: Provar que o transporte concorrente não entrou**

Run:

```powershell
if (Test-Path 'src/lib/presencaComando.ts') { throw 'presencaComando.ts não pode existir' }
if (Test-Path 'src/lib/presencaEnvioPendente.ts') { throw 'presencaEnvioPendente.ts não pode existir' }
$hits = rg -n "app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1|criarEAplicarComandoPresenca" src
if ($LASTEXITCODE -eq 0) { $hits; throw 'transporte candidato entrou no runtime' }
if ($LASTEXITCODE -ne 1) { throw 'rg falhou' }
```

- [ ] **Step 2: Rodar toda a verificação local**

Run:

```powershell
npm run test:presenca-backend
npm run test:presenca-canonica
npm test
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Confirmar flags remotas sem alterar**

Execute read-only SQL against `ouqwbbermlzqqvtqwlul`:

```sql
select modo, count(*)
from public.presenca_rollout_config
group by modo
order by modo;
```

Expected: `sombra = 21`, `canonico_v2 = 0`, no other row.

- [ ] **Step 4: Verificar browser em sombra**

In authenticated production-equivalent preview, inspect Barra, Recreio and
Campo Grande in Agenda, Conciliação, Sucesso do Aluno and professor details.
Verify DOM text for source/freshness/rule, console, network payload and reload.
Do not perform a production attendance write.

Expected: legacy operational result remains, while uncertainty is explicit;
no raw absence is rendered as a new terminal decision.

- [ ] **Step 5: Registrar evidência e commit**

Append:

```markdown
## Fase 3 — consumidores em sombra

- migration corretiva criada e testada localmente: sim; aplicada no remoto: não
- ausência bruta no envelope legado: indeterminado
- política temporal canônica preservada: sim, via tabela versionada
- Agenda e Conciliação: contrato v2 em sombra
- LA Teacher/Fábio e agentes: contratos escopados verificados
- KPIs e gráficos: período, universo, equação, fonte, frescor e regra exibidos
- flags remotas: 21 sombra, 0 canonico_v2
- suíte integral, build e browser: aprovados
- writes remotos nesta fase: nenhum
```

Then run:

```powershell
git add -- docs/audits/2026-08-27-presenca-convergencia-execucao.md
git commit -m "docs(presenca): fecha gate dos consumidores em sombra"
git status --short --branch
```

Expected: clean branch. Stop before applying the migration or deploying code.
