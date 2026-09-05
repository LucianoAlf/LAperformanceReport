# Contrato manual no Emusys - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atualizar o ciclo de contrato do LA Report para a nova semântica de `contrato_atual.contrato_assinado`, reconciliar novamente as três unidades no mesmo dia e liberar documentalmente o TOM.

**Architecture:** O payload e a persistência permanecem inalterados. A Edge ganha um bypass explícito `force=1`, aceito apenas com o segredo de `x-sync-token`; as RPCs passam a classificar `false` como `nao_assinado`; e o front volta a apresentar essa pendência em âmbar. Um canário operacional fixa as oito matrículas medidas e valida o estado persistido depois da reconciliação.

**Tech Stack:** Supabase Edge Functions/Deno, PostgreSQL migrations/RPC, React/TypeScript, Node test runner.

---

### Task 1: Force autenticado da reconciliação

**Files:**
- Modify: `tests/contratoAssinadoSyncContract.test.mjs`
- Modify: `supabase/functions/sync-contratos-assinatura-emusys/index.ts`

- [ ] Escrever testes que exijam `force=1`, `x-sync-token` correto e preservação de `skipped_fresh` sem force.
- [ ] Rodar `node --test tests/contratoAssinadoSyncContract.test.mjs` e confirmar falha pela ausência do bypass.
- [ ] Implementar a leitura de `force` uma única vez; rejeitar force sem o token administrativo mesmo quando houver bearer; ignorar frescor somente quando force estiver autorizado.
- [ ] Confirmar que a execução forçada percorre o mesmo insert `running` e a mesma conclusão `succeeded`/`failed` da execução normal.
- [ ] Rodar novamente o teste e o `deno check` da Edge.

### Task 2: Semântica canônica nas RPCs e no front

**Files:**
- Modify: `tests/contratoAssinadoAdapter.test.mjs`
- Modify: `tests/contratoAssinadoFichaFrontend.test.mjs`
- Modify: `tests/contratoAssinadoMigration.test.mjs`
- Modify: `tests/contratoAssinadoRpcPostgres.test.mjs`
- Modify: `src/lib/contratoAssinatura.ts`
- Modify: `src/components/App/Alunos/ContratoAssinaturaBadge.tsx`
- Create via `supabase migration new`: `supabase/migrations/<timestamp>_contrato_assinado_manual_eletronico.sql`

- [ ] Alterar primeiro os testes para os cinco estados `assinado`, `nao_assinado`, `sem_contrato`, `nao_verificado`, `dispensado`.
- [ ] Exigir nos testes `Contrato assinado`, `Não assinado`, descrição sem atribuir culpa e classes âmbar.
- [ ] Rodar os quatro testes e confirmar RED.
- [ ] Atualizar tipo, adaptador e ícone sem criar edição manual na ficha.
- [ ] Criar migration aditiva que preserve assinaturas, segurança, ACLs e corpos das RPCs, mudando somente os dois ramos de `false` para `nao_assinado`.
- [ ] Rodar fixtures PostgreSQL e confirmar a regra por pessoa com múltiplas matrículas.

### Task 3: Canário das oito matrículas e documentação

**Files:**
- Create: `scripts/verificar-regressao-contratos-emusys.mjs`
- Create: `tests/contratoAssinadoEmusysRegressao.test.mjs`
- Modify: `docs/operacao/contrato-assinado-tom.md`
- Modify: `docs/superpowers/specs/2026-09-04-contrato-assinado-design.md`

- [ ] Fixar Recreio e as matrículas `32, 78, 169, 328, 394, 409, 167, 416`, todas esperadas como `true`.
- [ ] Fazer o canário somente leitura e não registrar nomes/tokens; falhar se alguma matrícula estiver ausente ou diferente de `true`.
- [ ] Testar a avaliação do canário com oito positivas e com uma regressão falsa.
- [ ] Reescrever o runbook com a medição de 05/09/2026, o limite do estado intermediário e a frase explícita de liberação do TOM.
- [ ] Atualizar a especificação histórica para não contradizer o contrato operacional vigente.

### Task 4: Publicação e prova em produção

**Files:**
- Deploy: `supabase/functions/sync-contratos-assinatura-emusys/index.ts`
- Apply: `supabase/migrations/<timestamp>_contrato_assinado_manual_eletronico.sql`

- [ ] Rodar a suíte de contrato, Deno check e build antes de qualquer publicação.
- [ ] Aplicar a migration e conferir definição/ACL das duas RPCs no banco remoto.
- [ ] Publicar a Edge mantendo `verify_jwt=true`.
- [ ] Invocar `?force=1` com `x-sync-token` nas três unidades, sem expor o segredo.
- [ ] Conferir três execuções `succeeded`, contagens atuais, frescor e as oito matrículas em `true`; conferir Giovanna/1558 ainda `false` como limite conhecido.
- [ ] Rodar a suíte completa relevante, build final, commit, push, PR e merge na `main`.
- [ ] Não alterar `CONTRATO_NA_PAUTA` no TOM neste repositório.
