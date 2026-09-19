# Financeiro Emusys Frescor e Fila Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o espelho revalidar dias encerrados, persistir e reagendar HTTP 429 e recuperar julho–setembro antes do backfill de faturas.

**Architecture:** A Edge Function passa a receber trabalhos curtos de uma fila PostgreSQL serial. A lógica pura calcula janelas fechadas e classifica HTTP; a migration cria queue/RPCs, coordena o mutex com a fila de faturas e instala os horários recorrentes e extraordinários.

**Tech Stack:** Deno/TypeScript, Supabase Edge Functions, PostgreSQL, `pg_cron`, `pg_net`, Node test runner.

---

### Task 1: Contratos de data e HTTP

**Files:**
- Modify: `supabase/functions/_shared/financeiroEmusys.ts`
- Modify: `supabase/functions/_shared/financeiroEmusys.test.ts`
- Create: `supabase/functions/_shared/financeiroEmusysHttp.ts`
- Create: `supabase/functions/_shared/financeiroEmusysHttp.test.ts`

- [ ] Escrever testes que esperam `janelaRotinaDiaria('2026-09-20') === {inicio:'2026-09-10', fim:'2026-09-19'}`, janela semanal `2026-08-01..2026-09-19`, blocos máximos de dez dias e rejeição de hoje.
- [ ] Escrever testes que esperam `EMUSYS_HTTP_429` para 429, `EMUSYS_HTTP_5XX` para 500–599 e preservação de `Retry-After`, sem qualquer função de sleep exponencial.
- [ ] Rodar `deno test supabase/functions/_shared/financeiroEmusys.test.ts supabase/functions/_shared/financeiroEmusysHttp.test.ts` e confirmar falha inicial.
- [ ] Implementar funções puras de janela/blocos e `EmusysFinanceiroHttpError`.
- [ ] Repetir o comando e obter todos os testes verdes.

### Task 2: Fila PostgreSQL e agenda

**Files:**
- Create: `supabase/migrations/20260919160000_financeiro_emusys_frescor_fila.sql`
- Create: `tests/financeiroEmusysFilaContrato.test.mjs`
- Modify: `package.json`

- [ ] Escrever teste de contrato para `sync_financeiro_emusys_queue`, estados, índice de um único running, claim com `FOR UPDATE SKIP LOCKED`, lease, mutex compartilhado, retry fixo de 30 minutos e `max_retries=3`.
- [ ] Cobrir no teste os crons: diários 09:05/09:15/09:25 UTC, worker, semanal domingo 04:00 UTC, pausa das faturas em 05/09/10 UTC, recovery 01:00 e 03:05 UTC de 20/09 e backfill de faturas 03:30 UTC.
- [ ] Rodar `node --test tests/financeiroEmusysFilaContrato.test.mjs` e confirmar falha inicial.
- [ ] Criar tabela/RPCs com RLS e grants somente para `service_role`; o enqueue rejeita `data_final >= hoje BRT`, o claim inicial mais três retries e os dois claims usam o mesmo advisory xact lock.
- [ ] Invalidar status prematuros do dia corrente com `status='erro'`, `concluido_em=null` e `DIA_CORRENTE_NAO_ENCERRADO`, sem alterar colunas das tabelas existentes.
- [ ] Reagendar os produtores de faturas e instalar jobs auto-removíveis; o backfill usa `enqueue_and_work` para `2026-01-01` até `2026-05-01`.
- [ ] Repetir o teste de contrato e obter verde.

### Task 3: Worker de lançamentos

**Files:**
- Modify: `supabase/functions/sync-financeiro-emusys/index.ts`
- Create: `tests/financeiroEmusysWorkerContrato.test.mjs`

- [ ] Escrever teste de contrato exigindo modos `enqueue_daily`, `enqueue_weekly`, `enqueue_range` e `worker`, uso das RPCs da fila, propagação imediata de 429 e ausência dos recuos 10/20/40/80/120 segundos.
- [ ] Rodar o teste e confirmar falha inicial.
- [ ] Trocar o fetch por uma tentativa por página; 429 e 5xx viram erros tipados.
- [ ] Fazer todo job revarrer os dias recebidos, atualizar `concluido_em` em sucesso, interromper no primeiro erro e preservar `catalogos_erro` quando catálogos não rodarem.
- [ ] No worker, completar, reagendar +30 minutos ou falhar a fila; antes de responder, persistir o erro no resumo.
- [ ] Manter o modo direto compatível, sempre limitado a ontem, e usar a fila para todos os novos crons.
- [ ] Repetir testes Deno e Node até ficarem verdes.

### Task 4: Coordenação com faturas

**Files:**
- Modify: `supabase/functions/sync-faturas-emusys/index.ts`
- Modify: `tests/financeiroEmusysFilaContrato.test.mjs`

- [ ] Escrever teste para impedir `pagas_no_mes` e claim de faturas enquanto houver job ativo em `sync_financeiro_emusys_queue`.
- [ ] Implementar consulta fail-safe da fila nova; ausência da tabela durante o rollout significa “sem bloqueio”, outros erros falham fechados.
- [ ] Adicionar prioridade explícita ao trigger `backfill_super_folha_dre_2026`.
- [ ] Rodar os testes focados das duas filas.

### Task 5: Verificação e publicação

**Files:**
- Modify: `docs/superpowers/plans/2026-09-19-financeiro-emusys-frescor-fila.md` somente para marcar o executado.

- [ ] Rodar testes Deno, contratos Node, `deno check` das duas Edges, `git diff --check` e build do projeto.
- [ ] Fazer commit e push da branch; criar PR com problema, comportamento final e validações.
- [ ] Publicar primeiro as duas Edges com `verify_jwt=true`, aplicar a migration e confirmar versões/migration/crons no projeto `ouqwbbermlzqqvtqwlul`.
- [ ] Confirmar que 19/09 ficou inválido até a passada pós-virada, que as filas estão sem corrida e que os jobs de 20/09 estão instalados.
- [ ] Depois da execução noturna, consultar 14–19/09 antes × depois e a cobertura Jan–Mai de `emusys_faturas`; registrar qualquer 429 e seus retries sem atribuir conclusão antes da evidência.
