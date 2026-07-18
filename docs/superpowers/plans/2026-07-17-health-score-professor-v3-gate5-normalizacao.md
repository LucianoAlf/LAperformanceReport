# Health Score Professor V3 Gate 5 Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a normalizacao do Gate 5 para separar peso, meta, valor real e nota, mantendo quatro metas calibraveis e dois pilares explicitamente sem meta.

**Architecture:** Uma migration aditiva atualiza somente a configuracao V1 em rascunho e substitui a RPC de ativacao. O motor existente ja calcula `valor/meta*100` quando `normalizacao=meta_versionada`, portanto a mudanca remove `percentual_direta` dos parametros sem tocar nas seis RPCs canonicas nem em consumidores produtivos.

**Tech Stack:** PostgreSQL/Supabase migrations, PL/pgSQL, Node test runner.

---

### Task 1: Fixar o contrato da configuracao

**Files:**
- Create: `supabase/migrations/20260717180000_health_score_v3_normalizacao_meta.sql`
- Modify: `tests/healthScoreProfessorV3Snapshots.test.mjs`

- [x] **Step 1: Escrever teste RED**

Exigir `normalizacao=meta_versionada` nos seis pilares, metas aprovadas 1,44 e
33, quatro estados pendentes explicitos e ausencia de meta provisoria.

- [x] **Step 2: Rodar o teste RED**

Run: `node --test tests/healthScoreProfessorV3Snapshots.test.mjs`
Expected: FAIL porque a migration aditiva ainda nao existe.

- [x] **Step 3: Criar migration aditiva**

Atualizar somente a versao 1 enquanto `status='rascunho'`. Registrar em
`parametros` `meta_status`, `meta_justificativa` e `normalizacao`.

- [x] **Step 4: Endurecer a ativacao**

Substituir `ativar_health_score_professor_v3_config` para exigir meta aprovada
em media/turma, numero de alunos, conversao e permanencia, e exigir meta nula
com estado explicito em retencao e presenca.

- [x] **Step 5: Rodar testes dirigidos**

Run: `node --test tests/healthScoreProfessorV3Snapshots.test.mjs tests/healthScoreProfessorV3Metricas.test.mjs`
Expected: PASS.

### Task 2: Aplicar e verificar sem fechar o Gate 5

**Files:**
- Modify: `docs/auditorias/2026-07-17-health-score-professor-v3-calibracao.md`
- Modify: `docs/auditorias/2026-07-17-health-score-professor-v3-gate-5.md`

- [x] **Step 1: Aplicar migration remota**

Aplicar somente no projeto `ouqwbbermlzqqvtqwlul` e confirmar que a versao 1
continua `rascunho`, com zero snapshots.

- [x] **Step 2: Executar smoke de ativacao**

A ativacao deve falhar enquanto conversao e permanencia estiverem pendentes.

- [x] **Step 3: Rodar verificacao completa**

Run: suite Node completa, `npm run build`, advisors e `git diff --check`.

- [x] **Step 4: Registrar diagnosticos e bloquear valores parciais**

Documentar conversao Q3 parcial sem homologar. A proposta de permanencia 8,68
foi retraida apos a auditoria de cobertura: enquanto a origem nao cobrir o
inicio integral do historico, valor oficial e meta permanecem nulos. Nao ativar
a configuracao nem iniciar Gate 6 sem fonte historica complementar e nova
homologacao explicita.
