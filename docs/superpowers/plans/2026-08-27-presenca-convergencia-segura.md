# Convergência segura da presença canônica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconciliar Git, Supabase, frontend e consumidores de presença sem substituir a correção do Hugo nem abrir uma nova janela de indisponibilidade.

**Architecture:** A execução é dividida em cinco fases independentes e sequenciais. Primeiro o repositório passa a versionar exatamente o backend já publicado; depois o helper de recibo do Hugo ganha persistência durável; em seguida entram as leituras canônicas ainda em sombra; só então o hardening novo é refeito como expansão retrocompatível e o rollout avança por unidade/superfície.

**Tech Stack:** React 18, TypeScript, Vite, Supabase/PostgreSQL, Supabase Edge Functions/Deno, Node test runner, PostgreSQL descartável, Vercel e browser autenticado.

---

## Documento de desenho

Implementar somente de acordo com:

- `docs/superpowers/specs/2026-08-27-presenca-convergencia-segura-design.md`
- `docs/superpowers/plans/2026-08-26-presenca-canonica-ponta-a-ponta.md` apenas como histórico; seus checkboxes não provam publicação na `main`.

## Base e referências imutáveis

- branch de execução: `codex/presenca-convergencia-segura`;
- base revalidada antes da execução: `origin/main@779c360493c6d9a5ae1ad209e763128d6de87f15`;
- correção operacional preservada: `08dca49c`;
- implementação candidata: `b263741c`;
- worktree candidata com WIP: `D:\2026\LA-performance-report\.worktrees\presenca-canonica-raiz`;
- projeto Supabase: `ouqwbbermlzqqvtqwlul`;
- worktree de execução: `D:\2026\LA-performance-report\.worktrees\presenca-convergencia-segura`.

Antes de cada fase, executar `git fetch --prune origin`. Se `origin/main` avançar,
revisar o diff e incorporar a nova base antes de editar arquivos concorrentes.

## Planos de fase

| Ordem | Plano | Resultado independente |
|---|---|---|
| 1 | `2026-08-27-presenca-convergencia-fase-1-paridade.md` | `main` local alinhada; WIP preservado; migrations e Edge já remotos versionados sem mudar runtime frontend |
| 2 | `2026-08-27-presenca-convergencia-fase-2-recibos.md` | fluxo do Hugo preservado com request id durável, multi-intenção e limpeza somente após recibo válido |
| 3 | `2026-08-27-presenca-convergencia-fase-3-consumidores.md` | Agenda, Teacher, agentes e KPIs leem contrato canônico em sombra sem inferir falta |
| 4 | `2026-08-27-presenca-convergencia-fase-4-hardening.md` | novo hardening DB/Edge retrocompatível, com migrations posteriores ao ledger do Hugo |
| 5 | `2026-08-27-presenca-convergencia-fase-5-rollout.md` | publicação, ondas, browser real, monitoração e handoff mensurável |

## Cobertura da especificação

| Risco/aceite | Trava executável |
|---|---|
| conflito com a correção do Hugo | Fases 1–3 partem de `origin/main`, mantêm RPC direta + `p_request_id` e proíbem o transporte candidato |
| Git diferente do Supabase | Fase 1 reconcilia 24 migrations, oito Edge Functions, hashes e `verify_jwt` sem deploy |
| retry/reload duplicar presença | Fase 2 persiste ID por usuário/intenção; Fase 4 descarta uma resposta já commitada e prova retry idempotente |
| estados ambíguos do recibo | Fase 2 distingue concluído, parcial, falhou, não recebido, recebido/processando, resposta inválida e consulta indisponível |
| ausência bruta virar falta | Fase 3 cria migration posterior fail-closed e mantém política temporal somente na projeção versionada |
| colisão de identidade | Fase 3 prova dois cursos, IDs Emusys iguais em unidades distintas e alunos homônimos sem join por nome |
| quebra de cliente antigo | Fase 4 testa DB expandido com LA Report, Edge e LA Teacher antigos antes do cutover |
| vazamento de autorização | Fase 4 testa RLS/ACL/ownership, Fábio service-only e ausência de credencial service-role no browser |
| divergência entre consumidores | Fases 3 e 5 comparam Agenda, Sol, LA Teacher/Fábio, Lia, Mila, relatórios, gráficos e KPIs por período/universo/regra |
| regressão em produção | Fase 5 usa autorizações separadas, cinco ondas, sete dias operacionais, gatilhos objetivos e rollback por flag |

## Mapa global de arquivos

### Criar

- `tests/presencaConvergenciaParidade.test.mjs`: trava os 24 arquivos históricos e proíbe os quatro WIPs fora de ordem.
- `docs/audits/2026-08-27-presenca-convergencia-manifest.json`: versões, nomes, hashes locais e hashes do ledger remoto sem PII.
- `tests/presencaReciboPersistencia.test.mjs`: pedido persistente, multi-intenção, reload e payload malformado.
- `tests/presencaAusenciaBrutaFailClosedPostgres.test.mjs`: aluno/professor ausente bruto permanece indeterminado.
- migrations novas geradas pelo CLI na Fase 3 e na Fase 4.
- `docs/audits/2026-08-27-presenca-convergencia-execucao.md`: evidência por checkpoint.

### Modificar sem substituir o Hugo

- `src/lib/presencaRecibo.ts`
- `tests/presencaRecibo.test.mjs`
- `src/components/App/Agenda/Chamada/useChamadaAcoes.ts`
- `src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx`
- `src/components/App/Agenda/Chamada/ChamadaDia.tsx`

### Importar seletivamente de `b263741c`

- 24 migrations `supabase/migrations/20260827030000_*` a `20260827032300_*`;
- fontes das Edge Functions e helpers listadas no plano da Fase 1;
- contratos, auditorias, scripts e testes backend;
- `src/lib/presencaCanonica.ts` e consumidores de leitura somente na Fase 3;
- nunca importar `src/lib/presencaComando.ts` como transporte da Agenda;
- nunca importar os WIPs `20260827143000` a `20260827143300`.

## Regras globais de execução

1. Não usar `git merge` bruto da branch `codex/presenca-canonica-raiz`.
2. Não usar `--include-all`, `migration repair`, force-push ou merge direto em `main`.
3. Não alterar migration histórica já aplicada para “corrigir” produção; toda correção usa migration posterior.
4. Não revogar as assinaturas antigas restauradas por `20260827151832` antes do gate final.
5. Não ativar flags canônicas durante Fases 1–4.
6. Não executar backfill/reparo de roster sem autorização específica e dry-run revisado.
7. Não criar aluno, aula, presença ou falta sintética em produção.
8. Não publicar Edge sem fonte versionada e manifesto de `verify_jwt`.
9. Em conflito textual nos três arquivos do Hugo, começar por `origin/main` e portar comportamento mínimo testado.
10. Em conflito semântico, o fluxo atualmente funcional vence.

## Task 0: Confirmar baseline antes de executar qualquer fase

**Files:**
- Read: `docs/superpowers/specs/2026-08-27-presenca-convergencia-segura-design.md`
- Read: `docs/superpowers/plans/2026-08-27-presenca-convergencia-fase-1-paridade.md`
- Verify: repository and remote state only

- [ ] **Step 1: Atualizar referências sem tocar no worktree**

Run:

```powershell
git fetch --prune origin
git status --short --branch
git log -3 --oneline --decorate origin/main
```

Expected: branch de execução limpa; qualquer avanço de `origin/main` aparece antes de edits.

- [ ] **Step 2: Confirmar ancestry do Hugo**

Run:

```powershell
git merge-base --is-ancestor 08dca49c origin/main
```

Expected: exit code `0`.

- [ ] **Step 3: Rodar baseline integral**

Run:

```powershell
npm test
npm run build
```

Expected: 41/41 Deno, 9/9 pretest Node, 414/414 suite principal e build Vite com exit code `0`. Warnings preexistentes devem ser registrados, não mascarados.

- [ ] **Step 4: Registrar baseline no artefato de execução**

Create `docs/audits/2026-08-27-presenca-convergencia-execucao.md` with:

```markdown
# Execução da convergência segura de presença

## Baseline

- base revalidada da especificação: 779c360493c6d9a5ae1ad209e763128d6de87f15
- Hugo 08dca49c é ancestral: sim
- npm test: 41/41 + 9/9 + 414/414
- npm run build: aprovado
- writes remotos nesta etapa: nenhum
```

If `origin/main` advanced in Step 1, add its full measured hash on a separate
line and record the reviewed incoming commits. Do not add student names,
payloads or credentials.

- [ ] **Step 5: Commit do baseline documental**

```powershell
git add -- docs/audits/2026-08-27-presenca-convergencia-execucao.md
git commit -m "docs(presenca): registra baseline da convergencia segura"
```

## Task 1: Executar a Fase 1 e parar no gate de paridade

**Files:**
- Follow exactly: `docs/superpowers/plans/2026-08-27-presenca-convergencia-fase-1-paridade.md`

- [ ] **Step 1: Executar todas as tasks da Fase 1**

Expected: WIP preservado, `main` local em fast-forward, 24 migrations e fontes Edge versionadas, nenhum arquivo `src/` de runtime alterado.

- [ ] **Step 2: Auditar o gate**

Run:

```powershell
git diff --exit-code origin/main...HEAD -- src index.html vite.config.ts package-lock.json
npm run test:presenca-backend
npm test
npm run build
```

Expected: primeiro comando sem diff; todas as suítes e build aprovados.

- [ ] **Step 3: Parar se o remoto não casar com o manifesto**

Do not normalize away a mismatch. Record exact version/function and return to review.

## Task 2: Executar a Fase 2 e preservar o protocolo do Hugo

**Files:**
- Follow exactly: `docs/superpowers/plans/2026-08-27-presenca-convergencia-fase-2-recibos.md`

- [ ] **Step 1: Executar TDD e commits da Fase 2**

Expected: direct RPCs `app_* + p_request_id` remain; no runtime import of `presencaComando.ts`; malformed response does not clear request id.

- [ ] **Step 2: Auditar o gate**

Run:

```powershell
node --test tests/presencaRecibo.test.mjs tests/presencaReciboPersistencia.test.mjs
rg -n "app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1" src/components/App/Agenda src/lib
npm test
npm run build
```

Expected: tests pass; `rg` returns no runtime consumer; suite and build pass.

## Task 3: Executar a Fase 3 sem ativar consumidores

**Files:**
- Follow exactly: `docs/superpowers/plans/2026-08-27-presenca-convergencia-fase-3-consumidores.md`

- [ ] **Step 1: Executar TDD e commits da Fase 3**

Expected: raw absence maps to `indeterminado`; runtime readers use the canonical adapter only behind governed modes.

- [ ] **Step 2: Auditar o gate**

Run:

```powershell
npm run test:presenca-canonica
npm test
npm run build
```

Expected: all pass; remote flags still 21 `sombra`, 0 `canonico_v2`.

## Task 4: Executar a Fase 4 em banco descartável primeiro

**Files:**
- Follow exactly: `docs/superpowers/plans/2026-08-27-presenca-convergencia-fase-4-hardening.md`

- [ ] **Step 1: Executar TDD e commits da Fase 4**

Expected: migration names generated by CLI are newer than the latest remote ledger; Edge antiga + DB expandido and Edge nova + DB expandido both pass.

- [ ] **Step 2: Stop before remote writes**

Do not apply migrations or deploy Edge from this task. Produce dry-run, advisor and rollback evidence for explicit authorization.

## Task 5: Executar a Fase 5 por autorizações separadas

**Files:**
- Follow exactly: `docs/superpowers/plans/2026-08-27-presenca-convergencia-fase-5-rollout.md`

- [ ] **Step 1: Publicar source parity and code only through reviewed PRs**

Expected: branch pushed, PR reviewed, checks green, no direct merge.

- [ ] **Step 2: Apply each operational gate only with its authorization**

Expected: migration, Edge deploy, consumer activation and roster repair remain separate decisions.

- [ ] **Step 3: Complete only after stability evidence**

Expected: three units, all surfaces, seven operational days per required wave, zero unexplained divergence and complete handoff.

## Final verification

Run:

```powershell
git status --short --branch
git log --oneline --decorate -12
npm test
npm run build
```

Then verify in the authenticated production browser:

1. Agenda → Chamada renders after reload;
2. DOM shows source/freshness without false terminal absence;
3. console has no new application error;
4. normal authorized attendance action produces one terminal receipt;
5. database command has author, requested/applied counts and no duplicate event.

Do not claim completion from HTTP 200, Vercel `Ready`, migration presence or tests alone.
