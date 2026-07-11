# Nao Renovacao Emusys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter automaticamente uma renovacao pendente em nao renovacao quando a mesma matricula estiver finalizada no Emusys, oferecendo a mesma decisao manual na pagina Administrativa.

**Architecture:** A regra de elegibilidade fica em um helper puro e a mutacao fica em uma RPC atomica. A UI e o sync chamam a mesma RPC, evitando regras divergentes entre operacao manual e automatica.

**Tech Stack:** React, TypeScript, Supabase Postgres/RPC, Supabase Edge Functions (Deno), Node test runner.

---

### Task 1: Contratos de regressao

**Files:**
- Create: `tests/naoRenovacaoEmusys.test.mjs`

- [x] Escrever testes que exijam: helper de elegibilidade, RPC atomica, acao manual na UI e chamada da RPC pelo sync.
- [x] Rodar `node --test tests/naoRenovacaoEmusys.test.mjs` e confirmar falha pela ausencia da implementacao.

### Task 2: RPC canonica

**Files:**
- Create: `supabase/migrations/20260711143000_nao_renovacao_emusys_canonica.sql`

- [x] Criar `converter_renovacao_pendente_em_nao_renovacao` com validacao, lock, idempotencia e atualizacao do aluno.
- [x] Conceder execucao somente aos perfis necessarios e adicionar comentarios de regra de negocio.
- [x] Rodar novamente o teste de contrato.

### Task 3: Regra automatica no sync

**Files:**
- Create: `supabase/functions/_shared/nao-renovacao-canonica.ts`
- Modify: `supabase/functions/sync-matriculas-emusys/index.ts`

- [x] Implementar helper puro que exige status Emusys `finalizada` e renovacao pendente da mesma matricula.
- [x] Carregar as renovacoes pendentes indexadas por unidade e matricula Emusys.
- [x] Chamar a RPC antes de produzir a divergencia generica de status.
- [x] Registrar conversoes e falhas no resumo do sync sem interromper o lote.
- [x] Rodar teste Node e validar o bundle no deploy da Edge Function.

### Task 4: Acao manual na pagina Administrativa

**Files:**
- Modify: `src/components/App/Administrativo/TabelaRenovacoes.tsx`
- Modify: `src/components/App/Administrativo/ModalRenovacao.tsx`
- Modify: `src/components/App/Administrativo/ModalNaoRenovacao.tsx`
- Modify: `src/components/App/Administrativo/AdministrativoPage.tsx`

- [x] Adicionar acao explicita `Nao renovou` nas linhas pendentes e no modal de edicao.
- [x] Abrir `ModalNaoRenovacao` preenchido com o registro pendente.
- [x] Salvar pela RPC canonica e recarregar as listas.
- [x] Rodar teste de contrato e build.

### Task 5: Banco remoto, deploy e verificacao

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-nao-renovacao-emusys.md`

- [x] Aplicar as migrations versionadas no Supabase.
- [x] Executar smoke com rollback para conversao e idempotencia.
- [x] Fazer deploy de `sync-matriculas-emusys`.
- [x] Rodar o sync nas tres unidades e confirmar conversoes/erros.
- [x] Rodar testes relevantes, build e `git diff --check`.
