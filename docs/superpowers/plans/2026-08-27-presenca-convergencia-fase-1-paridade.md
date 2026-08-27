# Convergência de presença — Fase 1: paridade de fonte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar a `main` local e versionar na branch segura o backend de presença que já existe no Supabase, sem alterar runtime frontend nem executar writes remotos.

**Architecture:** A fase preserva primeiro o WIP antigo em branch própria, atualiza a `main` somente por fast-forward e restaura seletivamente migrations, Edge source, contratos e testes a partir de `b263741c`. Um manifesto trava separadamente os bytes locais e os hashes dos statements remotos.

**Tech Stack:** Git worktrees, Node test runner, Deno, Supabase CLI/MCP, PostgreSQL migration ledger e Vite.

---

## Task 1: Preservar o WIP sem misturá-lo à convergência

**Files:**
- Preserve worktree: `D:\2026\LA-performance-report\.worktrees\presenca-canonica-raiz`
- Preserve branch: `codex/presenca-hardening-wip-preservado`
- Do not modify: `codex/presenca-convergencia-segura`

- [ ] **Step 1: Confirmar o conjunto WIP esperado**

Run:

```powershell
git -C "D:\2026\LA-performance-report\.worktrees\presenca-canonica-raiz" status --short
```

Expected: exactly nine modified files and four untracked migrations `20260827143000`–`20260827143300`. Stop if another file appears.

- [ ] **Step 2: Criar a branch de preservação**

Run:

```powershell
git -C "D:\2026\LA-performance-report\.worktrees\presenca-canonica-raiz" switch -c codex/presenca-hardening-wip-preservado
```

Expected: new local branch at `b263741c`; no file content changed.

- [ ] **Step 3: Commitar somente os 13 arquivos conhecidos**

Run:

```powershell
git -C "D:\2026\LA-performance-report\.worktrees\presenca-canonica-raiz" add -- `
  supabase/functions/_shared/presenca-sync-run.ts `
  supabase/functions/_shared/reconciliacao-grade-snapshot.ts `
  supabase/functions/sync-grade-futura-emusys/index.ts `
  supabase/functions/sync-presenca-emusys/index.ts `
  tests/presencaMigrationReleaseOrder.test.mjs `
  tests/presencaProfessorComandoAuditoriaPostgres.test.mjs `
  tests/presencaRosterOperacionalPostgres.test.mjs `
  tests/presencaSyncOrquestracao.test.mjs `
  tests/reconciliacaoGradeSnapshotContrato.test.mjs `
  supabase/migrations/20260827143000_presenca_roster_identidade_local_fail_closed.sql `
  supabase/migrations/20260827143100_presenca_comando_portas_reservadas_fail_closed.sql `
  supabase/migrations/20260827143200_presenca_slot_escrita_fail_closed.sql `
  supabase/migrations/20260827143300_la_teacher_legado_adaptador_canonico.sql
git -C "D:\2026\LA-performance-report\.worktrees\presenca-canonica-raiz" commit -m "wip(presenca): preserva hardening anterior a convergencia"
```

Expected: one local WIP commit. Do not push this branch and do not merge it.

- [ ] **Step 4: Provar que o worktree ficou limpo**

Run:

```powershell
git -C "D:\2026\LA-performance-report\.worktrees\presenca-canonica-raiz" status --short --branch
```

Expected: clean branch `codex/presenca-hardening-wip-preservado`.

## Task 2: Atualizar a main local por fast-forward preservando documentos do usuário

**Files:**
- Preserve: `D:\2026\LA-performance-report\docs\handoffs\2026-08-17-contrato-canonico-faturas-sol-claude.md`
- Preserve: `D:\2026\LA-performance-report\docs\handoffs\2026-08-27-relatorio-completo-sol-caixa.md`
- Update ref only: `D:\2026\LA-performance-report` branch `main`

- [ ] **Step 1: Capturar hashes e status antes do fast-forward**

Run:

```powershell
git -C "D:\2026\LA-performance-report" status --short --branch
Get-FileHash -Algorithm SHA256 -LiteralPath "D:\2026\LA-performance-report\docs\handoffs\2026-08-17-contrato-canonico-faturas-sol-claude.md"
Get-FileHash -Algorithm SHA256 -LiteralPath "D:\2026\LA-performance-report\docs\handoffs\2026-08-27-relatorio-completo-sol-caixa.md"
```

Expected: only the two known document changes; retain the two printed hashes for Step 4.

- [ ] **Step 2: Confirmar que incoming não toca esses caminhos**

Run:

```powershell
git -C "D:\2026\LA-performance-report" diff --name-only main..origin/main -- `
  docs/handoffs/2026-08-17-contrato-canonico-faturas-sol-claude.md `
  docs/handoffs/2026-08-27-relatorio-completo-sol-caixa.md
```

Expected: empty output. Stop if either path appears.

- [ ] **Step 3: Executar somente fast-forward**

Run:

```powershell
git -C "D:\2026\LA-performance-report" merge --ff-only origin/main
```

Expected: fast-forward; no merge commit.

- [ ] **Step 4: Verificar ponteiro e hashes depois**

Run:

```powershell
git -C "D:\2026\LA-performance-report" rev-parse HEAD
git -C "D:\2026\LA-performance-report" rev-parse origin/main
Get-FileHash -Algorithm SHA256 -LiteralPath "D:\2026\LA-performance-report\docs\handoffs\2026-08-17-contrato-canonico-faturas-sol-claude.md"
Get-FileHash -Algorithm SHA256 -LiteralPath "D:\2026\LA-performance-report\docs\handoffs\2026-08-27-relatorio-completo-sol-caixa.md"
```

Expected: the two commit hashes are identical and both document hashes equal Step 1.

## Task 3: Criar a trava de paridade das migrations

**Files:**
- Create: `tests/presencaConvergenciaParidade.test.mjs`
- Create: `docs/audits/2026-08-27-presenca-convergencia-manifest.json`
- Restore later: `supabase/migrations/20260827030000_*` through `20260827032300_*`

- [ ] **Step 1: Escrever o teste que exige manifesto e arquivos exatos**

Create `tests/presencaConvergenciaParidade.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const manifestPath = path.join(root, 'docs', 'audits', '2026-08-27-presenca-convergencia-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function md5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

test('as 24 migrations de presença já aplicadas estão versionadas sem drift local', () => {
  assert.equal(manifest.migrations.length, 24);
  for (const item of manifest.migrations) {
    const file = path.join(root, 'supabase', 'migrations', `${item.version}_${item.name}.sql`);
    assert.equal(fs.existsSync(file), true, `migration ausente: ${item.version}_${item.name}.sql`);
    assert.equal(md5(file), item.local_file_md5, `migration local divergiu: ${item.version}`);
    assert.match(item.remote_statements_md5, /^[0-9a-f]{32}$/);
    assert.ok(item.statement_count > 0);
  }
});

test('a recuperação do Hugo permanece e migrations WIP fora de ordem não entram', () => {
  assert.equal(
    fs.existsSync(path.join(root, 'supabase', 'migrations', '20260827151832_agenda_chamada_volta_do_fechamento_de_bypass.sql')),
    true,
  );
  for (const version of ['20260827143000', '20260827143100', '20260827143200', '20260827143300']) {
    const found = fs.readdirSync(path.join(root, 'supabase', 'migrations')).some((name) => name.startsWith(version));
    assert.equal(found, false, `migration WIP fora de ordem entrou: ${version}`);
  }
});
```

- [ ] **Step 2: Criar o manifesto sem PII**

Create `docs/audits/2026-08-27-presenca-convergencia-manifest.json`:

```json
{
  "project_ref": "ouqwbbermlzqqvtqwlul",
  "captured_at": "2026-08-27",
  "migrations": [
    {"version":"20260827030000","name":"presenca_funcoes_vivas_baseline","statement_count":8,"local_file_md5":"69839d1566921ef82f446858851c6709","remote_statements_md5":"3d3bbd0d4264c5832ba7677689e8b2e1"},
    {"version":"20260827030100","name":"presenca_ocorrencia_canonica_v2","statement_count":8,"local_file_md5":"41eba8456db1c09515578c3d0dd9483a","remote_statements_md5":"2bb10a6c9d0eee37904769a769a7cc63"},
    {"version":"20260827030200","name":"presenca_sync_cobertura_idempotente","statement_count":30,"local_file_md5":"60e5bb3c78435805aaaa27d88f83b1c1","remote_statements_md5":"8ac99e8199c0bc876333f2b72d6db8e6"},
    {"version":"20260827030300","name":"presenca_sync_crons_operacional_e_backlog","statement_count":12,"local_file_md5":"10a0619f4f4d5ee7d81347b14fbbc8a6","remote_statements_md5":"d071df3b9319a145615d892499dfbe98"},
    {"version":"20260827030400","name":"presenca_sync_saude_operacional","statement_count":4,"local_file_md5":"29ef46a340c2716dc75db6904d150d23","remote_statements_md5":"73fafdc0b489e1061ec56264ffebb9a3"},
    {"version":"20260827030500","name":"presenca_roster_operacional","statement_count":21,"local_file_md5":"b371273aca677dfe262077d9d3a0ffaf","remote_statements_md5":"9b34780e130cfdd819658f5189774a35"},
    {"version":"20260827030600","name":"presenca_comando_auditoria","statement_count":27,"local_file_md5":"9b279a1cce4c6dcc4e87474794beb604","remote_statements_md5":"1d6982d5f763f31860d46e36fdbe0e84"},
    {"version":"20260827030700","name":"presenca_comando_porta_professor","statement_count":7,"local_file_md5":"a7789a27a9bc836c8cd9958320da451d","remote_statements_md5":"9619a24b0405d5124b9cb6982036bcd0"},
    {"version":"20260827030800","name":"presenca_comando_portas_fabio","statement_count":9,"local_file_md5":"a0cfca6711588cddd227d68694d75a33","remote_statements_md5":"ac8c52cf17db45e1567a2580401f8441"},
    {"version":"20260827030900","name":"presenca_comando_overloads_compatibilidade","statement_count":23,"local_file_md5":"54a1abcb48581ea2677dc310d5d03bfe","remote_statements_md5":"585a9bb95278c8cc24e798422287353f"},
    {"version":"20260827031000","name":"presenca_pendencias_canonicas_v2","statement_count":31,"local_file_md5":"492683cbd2a3a79a38e82d3e2db05051","remote_statements_md5":"358d33f70172e50bfeefb281e2e1ec59"},
    {"version":"20260827031100","name":"la_teacher_presenca_canonica_v2","statement_count":6,"local_file_md5":"da206546751f6ed2067e5653b2ec028c","remote_statements_md5":"57f8bc10f473ebdad128b8e288a24f86"},
    {"version":"20260827031200","name":"presenca_contexto_agentes_v1","statement_count":8,"local_file_md5":"d8008b76c783282898c270fa48ac57e3","remote_statements_md5":"f811ec08fa666a4864bd641be1c83ef4"},
    {"version":"20260827031300","name":"presenca_consumidores_numericos_v2","statement_count":36,"local_file_md5":"c91f5f8f9b8fed439a0edb6d3882e39e","remote_statements_md5":"939314b10e79858e1927f80b30502d31"},
    {"version":"20260827031400","name":"presenca_interfaces_consulta_v2","statement_count":6,"local_file_md5":"5ae3135dc19c640f639f9f4be2246c6e","remote_statements_md5":"b181348d6712d69b64f684c4e210932a"},
    {"version":"20260827031500","name":"presenca_shadow_comparacao_v2","statement_count":8,"local_file_md5":"82e417e4fb73775636702e569c71be4f","remote_statements_md5":"26da7e0ba96fa29d5d65424328bc8359"},
    {"version":"20260827031600","name":"presenca_rollout_config","statement_count":22,"local_file_md5":"927441cb4309d9ed487e184bf007cb3b","remote_statements_md5":"bb70270365603f7f3d2ce909f0127e4e"},
    {"version":"20260827031700","name":"presenca_rollout_adapters","statement_count":25,"local_file_md5":"bd61bbffe11dcb7baf9c37487e87dcc6","remote_statements_md5":"a1e6cb9ea5da9bd0bcfba85a2f73c624"},
    {"version":"20260827031800","name":"presenca_rollout_kpis","statement_count":26,"local_file_md5":"2cb01d956e59081afd36cd5a061894ea","remote_statements_md5":"d95a52246b6a0fb20db1ff36cda57298"},
    {"version":"20260827031900","name":"presenca_hardening_funcoes_internas","statement_count":12,"local_file_md5":"d217cc65ae53ef6c536bc82618c5bc3d","remote_statements_md5":"d1d32355fb4da10018dcc211b680fa99"},
    {"version":"20260827032000","name":"presenca_rollout_detalhes","statement_count":8,"local_file_md5":"9420f3356dd94b4f0d80f1bbcd69ad16","remote_statements_md5":"164b916448e6e155f7f7a8ec245f7ff2"},
    {"version":"20260827032100","name":"presenca_rollout_fabio_periodo","statement_count":8,"local_file_md5":"ab4e0f865cde208690315cae977ef9a7","remote_statements_md5":"7edb82fa9f990e2a9be4302af8d1cdf4"},
    {"version":"20260827032200","name":"presenca_sync_saude_tipo_nome_hotfix","statement_count":4,"local_file_md5":"0636ab48f1a9cf4ee7650e8a878fa030","remote_statements_md5":"416758cd584987764cb629a7f2478d4c"},
    {"version":"20260827032300","name":"presenca_relatorio_rollout_proveniencia_hotfix","statement_count":12,"local_file_md5":"681e038fc08d43e678e6b8b4e58c85d8","remote_statements_md5":"ad8c8c1832f058d9f4f7041fd6ee6293"}
  ]
}
```

- [ ] **Step 3: Rodar o teste e confirmar RED**

Run:

```powershell
node --test tests/presencaConvergenciaParidade.test.mjs
```

Expected: FAIL on the first missing migration `20260827030000_*`.

- [ ] **Step 4: Restaurar somente as 24 migrations publicadas**

Run:

```powershell
git restore --source b263741c -- ':(glob)supabase/migrations/2026082703*.sql'
```

Expected: 24 added files, versions `030000` through `032300`; no `143000`–`143300`.

- [ ] **Step 5: Rodar o teste e confirmar GREEN**

Run:

```powershell
node --test tests/presencaConvergenciaParidade.test.mjs
```

Expected: 2/2 pass.

- [ ] **Step 6: Comparar o ledger remoto ao manifesto**

Execute read-only SQL against project `ouqwbbermlzqqvtqwlul`:

```sql
select
  version,
  name,
  cardinality(statements) as statement_count,
  md5(array_to_string(statements, '')) as remote_statements_md5
from supabase_migrations.schema_migrations
where version between '20260827030000' and '20260827032300'
order by version;
```

Expected: exactly 24 rows and every value equals the manifest. Stop on any mismatch.

- [ ] **Step 7: Commit das migrations e da trava**

```powershell
git add -- tests/presencaConvergenciaParidade.test.mjs docs/audits/2026-08-27-presenca-convergencia-manifest.json ':(glob)supabase/migrations/2026082703*.sql'
git commit -m "chore(presenca): versiona migrations ja publicadas"
```

## Task 4: Restaurar a fonte exata das Edge Functions já publicadas

**Files:**
- Restore: `supabase/functions/_shared/presenca-sync-run.ts`
- Restore: `supabase/functions/_shared/previsualizacao-reconciliacao-grade.test.ts`
- Restore: `supabase/functions/_shared/previsualizacao-reconciliacao-grade.ts`
- Restore: `supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts`
- Restore: `supabase/functions/_shared/reconciliacao-grade-snapshot.ts`
- Restore: `supabase/functions/bi-agent-lamusic/schema.ts`
- Restore: `supabase/functions/bi-agent-lamusic/sql-validator.ts`
- Restore: `supabase/functions/bi-agent-lamusic/tools.ts`
- Restore: `supabase/functions/gerar-plano-aluno/index.ts`
- Restore: `supabase/functions/gerar-relatorio-aluno/index.ts`
- Restore: `supabase/functions/processar-alertas-lia/dispatcher.ts`
- Restore: `supabase/functions/processar-alertas-lia/index.ts`
- Restore: `supabase/functions/relatorio-admin-whatsapp/index.ts`
- Restore: `supabase/functions/sync-grade-futura-emusys/index.ts`
- Restore: `supabase/functions/sync-presenca-emusys/index.ts`

- [ ] **Step 1: Escrever a trava estática antes da restauração**

Add to `tests/presencaConvergenciaParidade.test.mjs`:

```javascript
test('as fontes Edge publicadas estão versionadas e o WIP não vazou', () => {
  const required = [
    'supabase/functions/_shared/presenca-sync-run.ts',
    'supabase/functions/_shared/previsualizacao-reconciliacao-grade.ts',
    'supabase/functions/_shared/reconciliacao-grade-snapshot.ts',
    'supabase/functions/bi-agent-lamusic/schema.ts',
    'supabase/functions/bi-agent-lamusic/sql-validator.ts',
    'supabase/functions/bi-agent-lamusic/tools.ts',
    'supabase/functions/gerar-plano-aluno/index.ts',
    'supabase/functions/gerar-relatorio-aluno/index.ts',
    'supabase/functions/processar-alertas-lia/dispatcher.ts',
    'supabase/functions/processar-alertas-lia/index.ts',
    'supabase/functions/relatorio-admin-whatsapp/index.ts',
    'supabase/functions/sync-grade-futura-emusys/index.ts',
    'supabase/functions/sync-presenca-emusys/index.ts'
  ];
  for (const file of required) assert.equal(fs.existsSync(path.join(root, file)), true, `fonte ausente: ${file}`);
  const sync = fs.readFileSync(path.join(root, 'supabase/functions/sync-presenca-emusys/index.ts'), 'utf8');
  assert.doesNotMatch(sync, /reconciliar_grade_snapshot_emusys_v2/);
});
```

- [ ] **Step 2: Rodar e confirmar RED**

Run:

```powershell
node --test tests/presencaConvergenciaParidade.test.mjs
```

Expected: FAIL on `presenca-sync-run.ts` or `dispatcher.ts` absent.

- [ ] **Step 3: Restaurar exatamente os 15 arquivos**

Run:

```powershell
git restore --source b263741c -- `
  supabase/functions/_shared/presenca-sync-run.ts `
  supabase/functions/_shared/previsualizacao-reconciliacao-grade.test.ts `
  supabase/functions/_shared/previsualizacao-reconciliacao-grade.ts `
  supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts `
  supabase/functions/_shared/reconciliacao-grade-snapshot.ts `
  supabase/functions/bi-agent-lamusic/schema.ts `
  supabase/functions/bi-agent-lamusic/sql-validator.ts `
  supabase/functions/bi-agent-lamusic/tools.ts `
  supabase/functions/gerar-plano-aluno/index.ts `
  supabase/functions/gerar-relatorio-aluno/index.ts `
  supabase/functions/processar-alertas-lia/dispatcher.ts `
  supabase/functions/processar-alertas-lia/index.ts `
  supabase/functions/relatorio-admin-whatsapp/index.ts `
  supabase/functions/sync-grade-futura-emusys/index.ts `
  supabase/functions/sync-presenca-emusys/index.ts
```

- [ ] **Step 4: Rodar a trava e checks Deno**

Run:

```powershell
node --test tests/presencaConvergenciaParidade.test.mjs
deno test supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts supabase/functions/_shared/previsualizacao-reconciliacao-grade.test.ts
deno check --node-modules-dir=auto supabase/functions/sync-presenca-emusys/index.ts
deno check --node-modules-dir=auto supabase/functions/sync-grade-futura-emusys/index.ts
```

Expected: all pass.

- [ ] **Step 5: Comparar funções remotas sem deploy**

List and retrieve these remote functions with Supabase read-only tooling:

```text
sync-presenca-emusys
sync-grade-futura-emusys
previsualizar-reconciliacao-grade-emusys
relatorio-admin-whatsapp
processar-alertas-lia
bi-agent-lamusic
gerar-plano-aluno
gerar-relatorio-aluno
```

Expected live manifest:

| Function | Version | verify_jwt | Remote SHA-256 |
|---|---:|---|---|
| `sync-presenca-emusys` | 102 | false | `578dd5232f3d0e927158f5e9ca16bcaaa7ed592916e4768d4c495b2c1dad7736` |
| `sync-grade-futura-emusys` | 34 | true | `643081aafae9a08a28bbd2a776888ff921c6eeec47272ebed5ccf7e726c08037` |
| `previsualizar-reconciliacao-grade-emusys` | 5 | false | `3957da9fd890b10e4a984409933edf20e4edff06bff3d18ed8bb4d80fefeb20f` |
| `relatorio-admin-whatsapp` | 112 | false | `97463bd2783d77804133e6aacadeac8ba223788538c6ea1dde8ba452cf8950dd` |
| `processar-alertas-lia` | 13 | true | `9c687575abdbc2b3965ccb4ec660061d9ee104a2a2425b14b438ce3cf6ffad5e` |
| `bi-agent-lamusic` | 49 | false | `045baedb9c45d8d9fa87cda16eedde70d7c727b560b8c8e92c99891f4bce0d7d` |
| `gerar-plano-aluno` | 39 | false | `ca6c8ce819bebc3003c3a14b678b0b777e53b5779e13404ab55d4bee5ba9d44f` |
| `gerar-relatorio-aluno` | 40 | false | `7b6d794afae81ff57dbe523f77f38e2314e4bae2566e1886c5fab7ee2a3d9c22` |

Compare version, JWT setting, remote bundle SHA and dependencies to the
restored tree. Stop on drift. Do not call deploy.

- [ ] **Step 6: Commit da fonte Edge**

```powershell
git add -- `
  supabase/functions/_shared/presenca-sync-run.ts `
  supabase/functions/_shared/previsualizacao-reconciliacao-grade.test.ts `
  supabase/functions/_shared/previsualizacao-reconciliacao-grade.ts `
  supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts `
  supabase/functions/_shared/reconciliacao-grade-snapshot.ts `
  supabase/functions/bi-agent-lamusic/schema.ts `
  supabase/functions/bi-agent-lamusic/sql-validator.ts `
  supabase/functions/bi-agent-lamusic/tools.ts `
  supabase/functions/gerar-plano-aluno/index.ts `
  supabase/functions/gerar-relatorio-aluno/index.ts `
  supabase/functions/processar-alertas-lia/dispatcher.ts `
  supabase/functions/processar-alertas-lia/index.ts `
  supabase/functions/relatorio-admin-whatsapp/index.ts `
  supabase/functions/sync-grade-futura-emusys/index.ts `
  supabase/functions/sync-presenca-emusys/index.ts `
  tests/presencaConvergenciaParidade.test.mjs
git commit -m "chore(presenca): restaura fonte edge ja publicada"
```

## Task 5: Restaurar documentação, scripts e testes backend

**Files:**
- Restore: 15 files under `docs/` listed by the command below
- Restore: `scripts/auditar-presenca-canonica.mjs`
- Restore: `scripts/previsualizar-reparo-presenca-v2.mjs`
- Restore: backend-only presence tests listed below
- Modify: `package.json`

- [ ] **Step 1: Restaurar contratos e evidências**

Run:

```powershell
git restore --source b263741c -- `
  docs/MAPA-INTEGRACAO-EMUSYS.md `
  docs/MAPA-SISTEMA.md `
  docs/METRICAS.md `
  docs/REGRAS-DE-NEGOCIO.md `
  docs/auditorias/artefatos/2026-08-26-presenca-baseline/README.md `
  docs/audits/2026-08-26-presenca-edge-release-preflight.md `
  docs/audits/2026-08-26-presenca-migration-release-dry-run.md `
  docs/audits/2026-08-26-presenca-preflight-producao.md `
  docs/audits/2026-08-26-presenca-shadow-30d.md `
  docs/audits/2026-08-27-presenca-migrations-producao.md `
  docs/contracts/presenca-canonica-v2.md `
  docs/contracts/presenca-consumidores.md `
  docs/contracts/presenca-rollout-v1.md `
  docs/runbooks/presenca-canonica.md `
  docs/superpowers/plans/2026-08-26-presenca-canonica-ponta-a-ponta.md `
  scripts/auditar-presenca-canonica.mjs `
  scripts/previsualizar-reparo-presenca-v2.mjs
```

- [ ] **Step 2: Restaurar somente os testes que não exigem runtime frontend candidato**

Run:

```powershell
git restore --source b263741c -- `
  tests/auditarPresencaCanonica.test.mjs `
  tests/liaPresencaCanonicaDispatcher.test.mjs `
  tests/presencaAgentesAnaliticosCanonicos.test.ts `
  tests/presencaAgentesAnaliticosContrato.test.mjs `
  tests/presencaAgentesCanonicos.test.mjs `
  tests/presencaComandoAuditoriaPostgres.test.mjs `
  tests/presencaComandoFabioContrato.test.mjs `
  tests/presencaInterfacesConsultaV2Postgres.test.mjs `
  tests/presencaKpisCanonicosV2.test.mjs `
  tests/presencaKpisCanonicosV2Postgres.test.mjs `
  tests/presencaKpisCanonicosV2ProducersPostgres.test.mjs `
  tests/presencaLaTeacherCanonicaV2Postgres.test.mjs `
  tests/presencaMigrationReleaseOrder.test.mjs `
  tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs `
  tests/presencaPendenciasCanonicasV2Postgres.test.mjs `
  tests/presencaPreviaReparoScript.test.mjs `
  tests/presencaProfessorComandoAuditoriaPostgres.test.mjs `
  tests/presencaRelatorioFrescorPostgres.test.mjs `
  tests/presencaRolloutAdaptersPostgres.test.mjs `
  tests/presencaRolloutConfigPostgres.test.mjs `
  tests/presencaRolloutDetalhesPostgres.test.mjs `
  tests/presencaRolloutFabioPeriodoPostgres.test.mjs `
  tests/presencaRolloutKpisPostgres.test.mjs `
  tests/presencaRosterOperacionalPostgres.test.mjs `
  tests/presencaSegurancaFuncoesInternasPostgres.test.mjs `
  tests/presencaShadowComparacaoPostgres.test.mjs `
  tests/presencaSyncCoberturaPostgres.test.mjs `
  tests/presencaSyncCronContrato.test.mjs `
  tests/presencaSyncOrquestracao.test.mjs `
  tests/reconciliacaoGradeSnapshotContrato.test.mjs
```

> `tests/presencaSyncSaudeOperacional.test.mjs` foi adiado para a Fase 3, Task 6: ele lê `useSaudeCrons` e `TabSaudeCrons`, portanto não é backend-only.

- [ ] **Step 3: Adicionar um script backend isolado**

Modify `package.json` scripts by adding exactly:

```json
"test:presenca-backend": "deno test tests/presencaAgentesAnaliticosCanonicos.test.ts && node --test tests/auditarPresencaCanonica.test.mjs tests/liaPresencaCanonicaDispatcher.test.mjs tests/presencaAgentesAnaliticosContrato.test.mjs tests/presencaAgentesCanonicos.test.mjs tests/presencaComandoAuditoriaPostgres.test.mjs tests/presencaComandoFabioContrato.test.mjs tests/presencaInterfacesConsultaV2Postgres.test.mjs tests/presencaKpisCanonicosV2.test.mjs tests/presencaKpisCanonicosV2Postgres.test.mjs tests/presencaKpisCanonicosV2ProducersPostgres.test.mjs tests/presencaLaTeacherCanonicaV2Postgres.test.mjs tests/presencaMigrationReleaseOrder.test.mjs tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs tests/presencaPendenciasCanonicasV2Postgres.test.mjs tests/presencaPreviaReparoScript.test.mjs tests/presencaProfessorComandoAuditoriaPostgres.test.mjs tests/presencaRelatorioFrescorPostgres.test.mjs tests/presencaRolloutAdaptersPostgres.test.mjs tests/presencaRolloutConfigPostgres.test.mjs tests/presencaRolloutDetalhesPostgres.test.mjs tests/presencaRolloutFabioPeriodoPostgres.test.mjs tests/presencaRolloutKpisPostgres.test.mjs tests/presencaRosterOperacionalPostgres.test.mjs tests/presencaSegurancaFuncoesInternasPostgres.test.mjs tests/presencaShadowComparacaoPostgres.test.mjs tests/presencaSyncCoberturaPostgres.test.mjs tests/presencaSyncCronContrato.test.mjs tests/presencaSyncOrquestracao.test.mjs tests/reconciliacaoGradeSnapshotContrato.test.mjs"
```

- [ ] **Step 4: Rodar testes focados**

Run:

```powershell
npm run test:presenca-backend
node --test tests/presencaConvergenciaParidade.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Provar ausência de mudança no runtime Vite**

Run:

```powershell
git diff --exit-code origin/main...HEAD -- src index.html vite.config.ts package-lock.json
npm run build
```

Expected: first command has no output and exit `0`; build passes.

- [ ] **Step 6: Rodar suíte integral**

Run:

```powershell
npm test
```

Expected: baseline remains green.

- [ ] **Step 7: Commit da documentação e testes**

```powershell
git add -- docs scripts tests package.json
git commit -m "docs(presenca): reconcilia contratos e testes do backend publicado"
```

## Task 6: Fechar o gate da Fase 1

**Files:**
- Modify: `docs/audits/2026-08-27-presenca-convergencia-execucao.md`

- [ ] **Step 1: Atualizar evidência com resultados medidos**

Record:

```markdown
## Fase 1 — paridade

- main local em fast-forward com origin/main: sim
- documentos locais preservados por SHA-256: sim
- WIP isolado e não publicado: sim
- migrations versionadas: 24/24
- ledger remoto: 24/24 versões, nomes, contagens e hashes conferidos
- Edge sources: 8/8 funções conferidas; deploy executado: não
- runtime Vite alterado: não
- testes backend: aprovado
- suíte integral e build: aprovados
- writes remotos: nenhum
```

- [ ] **Step 2: Verificação final da branch**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -8
git diff --stat origin/main...HEAD
```

Expected: clean worktree; only spec/plans, migrations, Supabase functions, backend tests/scripts/docs and package script differ.

- [ ] **Step 3: Commit do gate**

```powershell
git add -- docs/audits/2026-08-27-presenca-convergencia-execucao.md
git commit -m "docs(presenca): fecha gate de paridade sem alterar runtime"
```

- [ ] **Step 4: Stop for review**

Do not begin Fase 2 until this diff and the live manifest have been reviewed.
