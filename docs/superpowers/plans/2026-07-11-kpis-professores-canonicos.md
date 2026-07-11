# KPIs Canonicos de Professores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer tela, modal, rankings e relatorios da coordenacao consumirem a mesma regra mensal de carteira, turmas e media de alunos por turma.

**Architecture:** Criar uma RPC canonica por competencia que separa carga total de turmas elegiveis para a media. O relatorio da coordenacao reutiliza a RPC e substitui os blocos derivados do legado. O frontend deixa de recalcular carteira/turmas em consultas ad hoc.

**Tech Stack:** PostgreSQL/Supabase, React, TypeScript, Node test runner, Vite.

---

### Task 1: Contrato e testes de regressao

**Files:**
- Create: `tests/professoresKpisCanonicos.test.mjs`
- Modify: `scripts/test-relatorio-coordenacao-instantaneo.mjs`

- [ ] Escrever teste estrutural que exija RPC canonica, separacao entre `total_turmas` e `turmas_elegiveis_media`, filtro `is_projeto_banda` e uso da RPC pelo relatorio.
- [ ] Escrever teste do normalizador/relatorio para preservar o denominador elegivel.
- [ ] Executar os testes e confirmar falha pela ausencia da implementacao.

### Task 2: Camada canonica mensal no banco

**Files:**
- Create: `supabase/migrations/20260711194341_kpis_professores_canonicos.sql`

- [ ] Criar `get_kpis_professor_periodo_canonico` com competencia e unidade explicitas.
- [ ] Calcular carteira e turmas no ultimo dia da competencia.
- [ ] Contar uma ocupacao por aluno e turma regular, excluindo `is_projeto_banda` apenas da media.
- [ ] Preservar os demais KPIs historicos do contrato atual.
- [ ] Substituir os blocos derivados de `get_dados_relatorio_coordenacao` pelos dados canonicos.
- [ ] Aplicar a migration e validar Daiana, Ramon e Akeem com consultas somente leitura.

### Task 3: Consumidores do frontend

**Files:**
- Modify: `src/components/App/Professores/TabPerformanceProfessores.tsx`
- Modify: `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx`
- Modify: `src/lib/relatorioCoordenacaoInstantaneo.ts`
- Modify: `src/components/App/Professores/types.ts`

- [ ] Trocar a lista para a RPC canonica e carregar `turmas_elegiveis_media`.
- [ ] Exibir tooltip auditavel: ocupacoes elegiveis / turmas elegiveis.
- [ ] Fazer o modal usar os KPIs recebidos e reiniciar a competencia ao abrir/trocar professor.
- [ ] Fazer os relatorios instantaneos preservarem o denominador elegivel e o Health Score fornecido.

### Task 4: Relatorio com IA

**Files:**
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`

- [ ] Fazer a Edge Function confiar no Health Score canonico quando fornecido.
- [ ] Atualizar o fallback para os pesos atuais e preservar valores zero.
- [ ] Publicar a Edge Function sem alterar o contrato HTTP.

### Task 5: Verificacao integral

**Files:**
- Test: `tests/professoresKpisCanonicos.test.mjs`
- Test: `scripts/test-relatorio-coordenacao-instantaneo.mjs`

- [ ] Executar os testes novos e a suite relacionada.
- [ ] Executar `npm run build`.
- [ ] Comparar por SQL tela/relatorio nas tres unidades para junho/2026.
- [ ] Abrir a pagina Professores e validar competencia, modal e relatorio visualmente.
- [ ] Revisar `git diff` garantindo que os arquivos pendentes de Administrativo nao foram alterados por esta tarefa.
