# Relatório de Coordenação: Amostra e Capacidade Honestas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o relatório canônico da Coordenação para distinguir amostra experimental observada de conversão que pontuou no snapshot e para não apresentar capacidade apenas estimada como sobrecarga comprovada.

**Architecture:** Uma migration append-only redefine os produtores canônicos sem alterar o snapshot fechado de julho. A Edge Function apenas traduz os novos campos e sinais para linguagem operacional, mantendo regras determinísticas e proibindo que capacidade estimada isolada gere treinamento ou diagnóstico de sobrecarga.

**Tech Stack:** PostgreSQL/Supabase RPC, Deno Edge Functions, Node test runner, PostgreSQL fixture, TypeScript.

---

### Task 1: Fixar o contrato com testes vermelhos

**Files:**
- Modify: `tests/healthScoreProfessorV3SinaisCapacidade.test.mjs`
- Modify: `tests/healthScoreProfessorV3SinaisCapacidadePostgres.test.mjs`
- Modify: `tests/relatorioCoordenacaoCanonico.test.mjs`
- Modify: `tests/relatorioCoordenacaoCanonicoPostgres.test.mjs`

- [ ] **Step 1: Escrever testes do sinal de capacidade**

Adicionar casos que exijam `concentracao_operacional` de severidade alta somente quando `capacidade_fisica = true`, e `capacidade_estimada_conferir` de severidade média quando a fonte for `estimada_segmento`.

- [ ] **Step 2: Escrever testes do resumo experimental**

Adicionar fixture em que `amostra = 3` e `peso_efetivo = 0`, exigindo `professores_com_amostra_minima = 1` e `professores_com_conversao_pontuando = 0`.

- [ ] **Step 3: Escrever testes da linguagem pública**

Exigir as linhas `Professores com amostra mínima observada` e `Conversão compondo a nota histórica`, além do rótulo `Capacidade estimada — conferir cadastro` e da regra explícita que impede recomendação de treinamento baseada apenas nessa estimativa.

- [ ] **Step 4: Executar os testes e confirmar o RED**

Run: `node --test tests/healthScoreProfessorV3SinaisCapacidade.test.mjs tests/healthScoreProfessorV3SinaisCapacidadePostgres.test.mjs tests/relatorioCoordenacaoCanonico.test.mjs tests/relatorioCoordenacaoCanonicoPostgres.test.mjs`

Expected: FAIL nos novos contratos, antes da migration e da Edge corrigidas.

### Task 2: Corrigir os produtores canônicos sem reabrir julho

**Files:**
- Create: `supabase/migrations/20260803013000_relatorio_coordenacao_amostra_capacidade_honesta.sql`

- [ ] **Step 1: Redefinir os sinais de capacidade**

Copiar a definição vigente de `get_health_score_professor_v3_sinais` e alterar apenas a classificação: evidência física excedida mantém `concentracao_operacional/alto`; fallback estimado produz `capacidade_estimada_conferir/medio`; estimativa isolada não gera `possivel_sobrecarga`.

- [ ] **Step 2: Redefinir o resumo experimental**

Copiar a definição vigente de `get_relatorio_coordenacao_canonico_v1` e contar separadamente professores cuja amostra alcança a meta configurada e professores cujo `peso_efetivo` de conversão foi maior que zero no snapshot.

- [ ] **Step 3: Executar os testes PostgreSQL**

Run: `node --test tests/healthScoreProfessorV3SinaisCapacidadePostgres.test.mjs tests/relatorioCoordenacaoCanonicoPostgres.test.mjs`

Expected: PASS.

### Task 3: Ajustar a apresentação e a IA normalizadora

**Files:**
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`
- Modify: `tests/relatorioCoordenacaoCanonico.test.mjs`

- [ ] **Step 1: Renderizar os dois conceitos sem ambiguidade**

Substituir a linha antiga de amostra suficiente pelas duas linhas explícitas do contrato e adicionar fallback compatível para payloads anteriores.

- [ ] **Step 2: Neutralizar capacidade estimada**

Adicionar o rótulo operacional, explicar que falta vínculo físico de turma/sala e instruir a IA a não concluir sobrecarga nem recomendar treinamento a partir desse sinal isolado.

- [ ] **Step 3: Executar testes e checagem TypeScript**

Run: `node --test tests/healthScoreProfessorV3SinaisCapacidade.test.mjs tests/relatorioCoordenacaoCanonico.test.mjs`

Run: `deno check supabase/functions/gemini-relatorio-coordenacao/index.ts`

Expected: PASS.

### Task 4: Verificar, publicar e auditar produção

**Files:**
- No source file changes expected.

- [ ] **Step 1: Rodar regressão direcionada e build**

Run: `node --test tests/healthScoreProfessorV3SinaisCapacidade.test.mjs tests/healthScoreProfessorV3SinaisCapacidadePostgres.test.mjs tests/relatorioCoordenacaoCanonico.test.mjs tests/relatorioCoordenacaoCanonicoPostgres.test.mjs`

Run: `npm run build`

Expected: PASS.

- [ ] **Step 2: Aplicar migration e publicar a Edge**

Aplicar somente a nova migration e publicar somente `gemini-relatorio-coordenacao`, preservando o snapshot fechado de julho.

- [ ] **Step 3: Auditar produção em modo leitura**

Confirmar para Recreio/julho: 11 professores com amostra mínima observada; 0 com conversão pontuando no snapshot histórico; sinais baseados apenas em estimativa aparecem como conferência cadastral média; nenhum deles aparece como concentração alta.

- [ ] **Step 4: Commit, revisão independente, push, PR e merge**

Adicionar apenas os arquivos deste plano, obter revisão independente, abrir PR, aguardar checks verdes, mesclar e confirmar o deploy da `main`.
