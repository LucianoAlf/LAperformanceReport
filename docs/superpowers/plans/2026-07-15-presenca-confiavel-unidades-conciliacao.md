# Presenca Confiavel por Unidade e Conciliacao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar presenca/falta de junho e julho nas tres unidades e oferecer conciliacao posterior, visivel e auditada para Campo Grande.

**Architecture:** Uma politica temporal versionada enriquece a view semantica sem reescrever `aluno_presenca`. Campo Grande ganha uma fila derivada por aluno/aula, persistindo somente decisoes humanas; a UI agrupa por aula e usa RPCs escopadas por unidade.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, PL/pgSQL RPCs, React 19, TypeScript, Tailwind, Lucide, Node test runner, Vite.

---

### Task 1: Fixar o contrato em testes vermelhos

**Files:**
- Create: `tests/presencaPoliticaConciliacao.test.mjs`
- Create: `tests/conciliacaoPresencasUI.test.mjs`

- [ ] **Step 1: Criar o teste SQL estrutural**

O teste deve exigir a migration `20260715182000_presenca_politica_unidades_conciliacao.sql`, as duas tabelas, a view semantica v1.2, as tres politicas, precedencia de cancelada/justificada, RPCs seguras e ausencia de `UPDATE public.aluno_presenca` fora da RPC de retificacao.

- [ ] **Step 2: Rodar e observar RED**

Run: `node --test tests/presencaPoliticaConciliacao.test.mjs`

Expected: FAIL porque a migration ainda nao existe.

- [ ] **Step 3: Criar o teste de integracao estatica da UI**

O teste deve exigir `ConciliacaoPresencas.tsx`, contador visivel, os RPCs `get_conciliacao_presencas`, `admin_confirmar_presencas_aula` e `admin_revisar_presenca_conciliacao`, e a montagem do componente dentro de `ConciliacaoMatriculas`.

- [ ] **Step 4: Rodar e observar RED**

Run: `node --test tests/conciliacaoPresencasUI.test.mjs`

Expected: FAIL porque o componente ainda nao existe.

### Task 2: Implementar politica, semantica e backend da conciliacao

**Files:**
- Create: `supabase/migrations/20260715182000_presenca_politica_unidades_conciliacao.sql`
- Test: `tests/presencaPoliticaConciliacao.test.mjs`

- [ ] **Step 1: Criar tabelas e politicas de acesso**

Criar `presenca_politicas_confiabilidade` e `aluno_presenca_revisoes_operacionais`, habilitar RLS, revogar `PUBLIC/anon/authenticated` e conceder acesso direto somente a `service_role`.

- [ ] **Step 2: Semear as tres decisoes temporais**

Resolver unidades por nome normalizado e inserir Barra, Recreio e Campo Grande para `2026-06-01..2026-07-31`; somente Campo Grande usa `exige_revisao_operacional=true`.

- [ ] **Step 3: Recriar a view semantica compativel**

Manter todas as colunas existentes na mesma ordem e anexar:

```sql
politica_confiabilidade_id,
fundamento_confianca,
revisao_operacional_exigida,
revisao_operacional_status
```

A precedencia sera: presente, cancelada, justificada, manual/LA Teacher, politica, regra conservadora. Declarar `regra_versao='presenca-semantica-v1.2'`.

- [ ] **Step 4: Criar fila derivada e RPC de leitura**

Criar `vw_aluno_presenca_conciliacao_operacional` no grao aluno/aula e `get_conciliacao_presencas(...)` retornando JSON com `resumo`, `aulas` e alunos agrupados.

- [ ] **Step 5: Criar RPCs de decisao**

`admin_confirmar_presencas_aula` registra confirmacoes idempotentes sem alterar o bruto. `admin_revisar_presenca_conciliacao` confirma ou chama `admin_corrigir_presenca(..., 'presente', motivo)` antes de registrar a revisao como corrigida.

- [ ] **Step 6: Rodar GREEN do backend**

Run: `node --test tests/presencaPoliticaConciliacao.test.mjs tests/presencaSemanticaCanonica.test.mjs tests/presencaSemanticaEvidenciaBruta.test.mjs tests/frequenciaProfessorCanonica.test.mjs`

Expected: PASS.

### Task 3: Implementar a fila visivel em Alunos > Conciliacao

**Files:**
- Create: `src/components/App/Alunos/ConciliacaoPresencas.tsx`
- Modify: `src/components/App/Alunos/ConciliacaoMatriculas.tsx`
- Test: `tests/conciliacaoPresencasUI.test.mjs`

- [ ] **Step 1: Criar tipos e carregamento**

O componente recebe `unidadeId`, carrega junho/julho via `get_conciliacao_presencas` e mantem estados de loading, erro, competencia, busca e grupos expandidos.

- [ ] **Step 2: Construir o contador de alta visibilidade**

Exibir uma faixa no topo com icone `ClipboardCheck`, titulo `Presencas a confirmar`, numero de alunos pendentes e numero de aulas, com maior destaque quando Campo Grande estiver selecionada.

- [ ] **Step 3: Construir a lista agrupada por aula**

Cada grupo mostra data, hora, professor, turma/curso, quantidade pendente, acao `Confirmar chamada` e expansao dos alunos. Cada aluno possui `Corrigir para presente` com motivo obrigatorio.

- [ ] **Step 4: Integrar sem acoplar aos atributos cadastrais**

Montar `<ConciliacaoPresencas unidadeId={unidadeId} />` logo apos o cabecalho de `ConciliacaoMatriculas`; o componente mantem estado e recarga proprios.

- [ ] **Step 5: Rodar GREEN da UI**

Run: `node --test tests/conciliacaoPresencasUI.test.mjs`

Expected: PASS.

### Task 4: Atualizar o contrato canonico e verificar regressao local

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-contrato-canonico-dados-pedagogicos-design.md`
- Modify: `.agents/skills/operar-dominio-aluno-la/SKILL.md`

- [ ] **Step 1: Documentar a excecao atestada**

Registrar que ausencia Emusys pode ser promovida somente por politica versionada, temporal, escopada por unidade e com evidencia de decisao; isso nao altera a regra geral fora do periodo.

- [ ] **Step 2: Rodar todos os testes Node**

Run: `node --test tests/*.test.mjs`

Expected: todos PASS.

- [ ] **Step 3: Rodar build**

Run: `npm run build`

Expected: exit 0.

### Task 5: Aplicar e validar no Supabase remoto

**Files:**
- Apply: `supabase/migrations/20260715182000_presenca_politica_unidades_conciliacao.sql`

- [ ] **Step 1: Confirmar projeto e baseline**

Confirmar ref `ouqwbbermlzqqvtqwlul` e registrar contagens por unidade/classificacao antes da migration.

- [ ] **Step 2: Aplicar migration versionada**

Usar Supabase `apply_migration`, nunca SQL DDL avulso.

- [ ] **Step 3: Validar invariantes**

Conferir politicas, grants, RLS, `regra_versao`, datas fora do recorte, justificadas/canceladas, totais promovidos, fila somente de Campo Grande e idempotencia das decisoes em transacao com rollback quando aplicavel.

- [ ] **Step 4: Validar consumidores canonicos**

Executar `get_kpis_professor_periodo_canonico_v2` para professores ouro das tres unidades e confirmar que bloqueios remanescentes decorrem apenas de base minima/conflito, nao de ausencia Emusys inconclusiva no recorte.

### Task 6: Validar visualmente e concluir

**Files:**
- No new files expected.

- [ ] **Step 1: Iniciar app local**

Run: `npm run dev -- --host 127.0.0.1`

Expected: URL local acessivel.

- [ ] **Step 2: Testar com sessao autenticada**

Abrir Professores/Performance em junho e julho nas tres unidades, depois `Alunos > Conciliacao` em Campo Grande. Validar contador, agrupamento, responsividade e ausencia de erros no console.

- [ ] **Step 3: Conferir diff e estado do repositorio**

Run: `git diff --check` e `git status --short`.

- [ ] **Step 4: Commit final**

```bash
git add tests supabase/migrations src/components/App/Alunos docs/superpowers/specs .agents/skills/operar-dominio-aluno-la/SKILL.md
git commit -m "feat: libera presenca canonica com conciliacao"
```
