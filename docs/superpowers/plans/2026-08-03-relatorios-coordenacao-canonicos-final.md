# Relatorios da Coordenacao Canonicos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar os cinco relatorios da Coordenacao em um snapshot mensal canonico, auditavel e semanticamente consistente.

**Architecture:** Uma RPC V2 monta o contrato completo a partir das fontes canonicas e o persiste na infraestrutura existente de fechamento mensal. A Edge mensal e os quatro renderizadores instantaneos consomem exatamente esse contrato; apenas a narrativa mensal passa pela IA.

**Tech Stack:** PostgreSQL 17, Supabase RPC/Edge Functions, TypeScript, React, Node test runner.

---

### Task 1: Fixar o contrato por testes

**Files:**
- Modify: `tests/relatorioCoordenacaoCanonico.test.mjs`
- Modify: `tests/relatorioCoordenacaoRankingV3.test.mjs`
- Create: `tests/relatorioCoordenacaoCincoRelatorios.test.mjs`

- [ ] Escrever testes que exijam RPC V2, snapshot fechado e uso do mesmo contrato pelos cinco botoes.
- [ ] Escrever teste do ranking diagnostico com 24 scores e ranking oficial bloqueado.
- [ ] Escrever testes dos graos de carteira e da separacao entre saidas totais e atribuiveis.
- [ ] Executar os testes e confirmar falha pela ausencia do contrato V2.

### Task 2: Criar o produtor e snapshot V2

**Files:**
- Create: `supabase/migrations/20260803110000_relatorios_coordenacao_canonicos_v2.sql`
- Create: `tests/relatorioCoordenacaoCanonicoV2Postgres.test.mjs`

- [ ] Criar `montar_relatorio_coordenacao_payload_v2` com roster, Health V3, carteira, turmas e saidas.
- [ ] Criar `capturar_relatorio_coordenacao_canonico_v2` usando `fechamento_mensal_snapshots` e auditoria.
- [ ] Criar `get_relatorio_coordenacao_canonico_v2`, que falha fechado para historico sem snapshot e monta ao vivo apenas o mes corrente.
- [ ] Provar no PostgreSQL que o hash confere, o snapshot fechado e imutavel e os totais/atribuicoes permanecem separados.

### Task 3: Alinhar os cinco consumidores

**Files:**
- Modify: `src/components/App/Professores/ModalRelatorioCoordenacao.tsx`
- Modify: `src/lib/relatorioCoordenacaoInstantaneo.ts`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`

- [ ] Adicionar tipos e normalizacao do contrato V2.
- [ ] Fazer os quatro relatorios instantaneos consultarem V2 diretamente.
- [ ] Renderizar ranking diagnostico sem ranking/premiacao oficial.
- [ ] Renderizar graos de carteira separadamente.
- [ ] Renderizar presenca do snapshot.
- [ ] Renderizar saidas e MRR total/atribuivel sem mistura.
- [ ] Migrar a Edge mensal para V2 mantendo a IA fora dos calculos.

### Task 4: Validar e publicar

**Files:**
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/HEALTH_SCORE_PROFESSOR_V3.md`

- [ ] Executar testes direcionados, PostgreSQL, build e Deno check.
- [ ] Consultar producao somente leitura e comparar os totais de Recreio julho.
- [ ] Atualizar a branch com `origin/main` e revisar o diff.
- [ ] Commitar, publicar a branch e abrir PR.
- [ ] Revisar checks, integrar na `main` e implantar migration/Edge/frontend.
- [ ] Capturar o snapshot V2 de julho para as tres unidades.
- [ ] Gerar os cinco relatorios em producao e conferir igualdade de competencia, revisao e totais.
