# Health Score Professor V3 - Mês Vivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fazer a competência atual do Health Score V3 nascer com dados canônicos vivos, sem apagar a carteira pedagógica no primeiro dia do mês e sem alterar snapshots históricos ou fechados.

**Architecture:** Os RPCs V3 existentes continuam sendo o único contrato dos consumidores. Para competências históricas, eles preservam a revisão materializada escolhida hoje. Para a competência corrente ainda não oficial, uma projeção `stable`, calculada no PostgreSQL pelas mesmas métricas, configuração e motor de nota do V3, devolve o estado `em_andamento`. Métricas sem eventos do mês podem exibir a última referência histórica de forma explicitamente rotulada, mas essa referência não pontua. O frontend apenas apresenta valor, origem temporal e estado; não recalcula o score.

**Tech Stack:** PostgreSQL 17/Supabase RPC, React 19/TypeScript, Node test runner, Vite e smoke test em navegador.

---

## Task 1: Congelar o contrato do mês vivo em testes RED

**Files:**
- Create: `tests/healthScoreProfessorV3MesVivo.test.mjs`
- Modify: `tests/healthScoreProfessorV3Performance.test.mjs`

1. Exigir que a projeção seja usada somente na competência corrente e nunca substitua snapshot oficial.
2. Exigir `estado_publicacao = em_andamento`, ranking desligado e cálculo pelo motor canônico no servidor.
3. Exigir referência anterior identificada por competência e fora da nota.
4. Exigir UI com estados separados `Em andamento`, `Parcial` e `Oficial`, sem o rótulo genérico `provisorio`.
5. Rodar os testes e confirmar RED antes da implementação.

## Task 2: Implementar a projeção canônica corrente

**Files:**
- Create: `supabase/migrations/20260802223000_health_score_v3_mes_vivo.sql`

1. Criar uma função interna de projeção viva com o mesmo shape dos RPCs existentes.
2. Usar `get_health_score_professor_v3_metricas_periodo`, configuração ativa aplicável e `calcular_health_score_professor_v3_nota_diagnostica`.
3. Manter `numero_alunos` diagnóstico; respeitar amostra mínima de conversão; normalizar pesos apenas sobre pilares atuais válidos.
4. Anexar referência histórica somente quando não houver valor atual, com `referencia_temporaria = true`, sem peso e sem contribuição.
5. Alterar os RPCs de lista e modal para preferirem oficial, preservarem histórico e projetarem apenas o mês atual aberto.
6. Reaplicar ACL explícita para `authenticated` e `service_role`.

## Task 3: Ajustar a apresentação e a resiliência

**Files:**
- Modify: `src/lib/healthScoreProfessorV3Performance.ts`
- Modify: `src/components/App/Professores/TabPerformanceProfessores.tsx`
- Modify: `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx`

1. Adicionar `em_andamento` ao contrato e separar classificação do estado de publicação.
2. Manter o badge numérico compacto e mostrar o estado em texto separado.
3. Trocar `provisorio` por motivos concretos: amostra, base anterior ou aguardando primeiras aulas.
4. No modal, mostrar a competência da referência e deixar claro que ela não compõe a nota corrente.
5. Tornar cursos e histórico carregamentos auxiliares tolerantes a falha sem derrubar a tabela.

## Task 4: Documentar e verificar

**Files:**
- Modify: `docs/HEALTH_SCORE_PROFESSOR_V3.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`

1. Documentar o estado `em_andamento`, referência temporal e imutabilidade histórica.
2. Rodar testes direcionados, fixture PostgreSQL, `npm run build` e `git diff --check`.
3. Aplicar a migration, validar agosto e julho no PostgreSQL real e confirmar as ACLs.
4. Validar tabela e modal no navegador autenticado.

## Task 5: Publicar sem interferir em outros trabalhos

1. Atualizar a branch isolada com `origin/main` e revisar somente o diff deste escopo.
2. Commitar, fazer push, abrir PR e aguardar os checks.
3. Mesclar a PR aprovada pelo conjunto de testes e confirmar o deploy da `main`.
4. Fazer smoke final no domínio estável e registrar riscos residuais concretos.
