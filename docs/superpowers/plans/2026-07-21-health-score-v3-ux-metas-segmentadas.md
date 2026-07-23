# Health Score V3 Segmented Goals UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar inequívocos o preenchimento, o estado local e o salvamento das metas segmentadas e das exceções Emusys.

**Architecture:** O estado visual será derivado por funções puras em `healthScoreProfessorV3.ts`. A matriz continuará editando um rascunho local e a RPC existente continuará sendo o único ponto de persistência; a conciliação manterá o payload atual, alterando apenas a linguagem e a apresentação.

**Tech Stack:** React, TypeScript, Supabase RPC, Radix UI, Node test runner.

---

### Task 1: Estados puros da linha

**Files:**
- Modify: `src/lib/healthScoreProfessorV3.ts`
- Test: `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`

- [x] Escrever testes para os cinco estados visuais e para atualização automática de uma meta.
- [x] Executar `node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs` e confirmar a falha inicial.
- [x] Implementar os helpers puros sem alterar serialização ou RPC.
- [x] Reexecutar o teste e confirmar aprovação.

### Task 2: Matriz com situação imediata

**Files:**
- Modify: `src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx`
- Test: `tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs`

- [x] Escrever o contrato visual para os estados e para a ação `Não ofertado nesta unidade`.
- [x] Remover o seletor de estado e habilitar preenchimento direto.
- [x] Atualizar filtros e contadores a partir do estado local efetivo.
- [x] Verificar o teste focado.

### Task 3: Barra explícita de persistência

**Files:**
- Modify: `src/components/App/Professores/HealthScoreV3Config.tsx`
- Test: `tests/healthScoreProfessorV3Frontend.test.mjs`

- [x] Mostrar a quantidade de linhas alteradas e `Salvar alterações` em uma barra fixa.
- [x] Mostrar `Rascunho salvo` quando não houver edição local.
- [x] Manter simulação e ativação bloqueadas até o salvamento.
- [x] Verificar o teste focado.

### Task 4: Conciliação com ações de negócio

**Files:**
- Modify: `src/components/App/Professores/ProfessorCursoModalidadeReconciliacao.tsx`
- Test: `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`

- [x] Substituir rótulos vagos pelos quatro comandos aprovados.
- [x] Remover o botão X sem rótulo e usar `Desfazer escolha`.
- [x] Preservar o payload `manter|revisar|encerrar` esperado pela RPC.
- [x] Verificar o teste focado.

### Task 5: Verificação integrada

**Files:**
- Verify only.

- [x] Executar a suíte completa `tests/*.test.mjs`.
- [x] Executar `npm run build`.
- [x] Validar edição, indicador não salvo e descarte seguro no navegador, sem persistir dados de homologação.
- [x] Conferir `git diff --check` e publicar somente após verificar o remoto.
