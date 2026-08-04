# Hotfix da Base Financeira do Relatorio Administrativo Mensal

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restaurar MRR e ticket medio do relatorio administrativo mensal a base contratual ativa fechada, mantendo o valor efetivamente pago como indicador separado.

**Architecture:** A leitura rica continua preservando o snapshot administrativo fechado e sua cadeia de hashes. Um wrapper SQL append-only substitui apenas `indicadores_financeiros` pelos totais canonicos de `kpis_alunos_canonicos.totais` do snapshot gerencial referenciado, valida pagantes e a identidade `MRR / pagantes = ticket`, e expoe `faturamento_realizado` separadamente. Os renderizadores somente apresentam esses campos, sem recalculo financeiro no frontend ou na Edge Function.

**Tech Stack:** PostgreSQL/Supabase migrations, Deno TypeScript Edge Functions, Node test runner, Docker PostgreSQL 17, Vite.

---

### Task 1: Fixar a regressao em testes

**Files:**
- Create: `tests/relatorioAdminMensalFinanceiroBaseAtivaPostgres.test.mjs`
- Modify: `supabase/functions/_shared/relatorios-mensais-canonicos.test.ts`
- Modify: `tests/relatorioGerencialCanonico.test.mjs`

1. Criar fixture para Barra, Recreio e Campo Grande com valores divergentes entre recebimentos e base ativa.
2. Exigir que a RPC retorne os totais da base ativa e preserve o realizado separadamente.
3. Exigir nos textos as semanticas explicitas de MRR contratual e faturamento realizado.
4. Executar os testes e confirmar a falha antes da implementacao.

### Task 2: Retificar a RPC sem alterar snapshots fechados

**Files:**
- Create: `supabase/migrations/20260804213000_relatorio_admin_mensal_financeiro_base_ativa.sql`

1. Versionar a RPC publica atual como base interna `v3`.
2. Revalidar o snapshot gerencial exato referenciado pelo fechamento administrativo.
3. Ler `payload.kpis_alunos_canonicos.totais` e validar campos obrigatorios.
4. Validar pagantes e a identidade entre MRR e ticket.
5. Substituir somente `payload.indicadores_financeiros`, incluindo `faturamento_realizado`.
6. Preservar ACL e imutabilidade dos snapshots.

### Task 3: Tornar a semantica visivel nos relatorios

**Files:**
- Modify: `supabase/functions/_shared/relatorios-mensais-canonicos.ts`
- Modify: `supabase/functions/gemini-relatorio-gerencial/index.ts`

1. Rotular MRR como base contratual paga e em aberto.
2. Exibir faturamento realizado como valor pago separado.
3. Manter previsto, LTV e permanencia para compatibilidade operacional.

### Task 4: Verificar e publicar

1. Rodar testes SQL/TypeScript focados e a suite relacionada.
2. Rodar build de producao.
3. Reconciliar a branch com `origin/main` sem incorporar arquivos alheios.
4. Publicar migration e Edge Functions consumidoras.
5. Validar em producao as tres unidades e confirmar Campo Grande em julho: 393 pagantes, MRR R$ 154.939,58, ticket R$ 394,25 e realizado R$ 149.495,58.
