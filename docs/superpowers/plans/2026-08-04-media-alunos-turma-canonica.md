# Media de Alunos por Turma Canonica Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fazer Gestao de Alunos, Dashboard, Analytics e Professores publicarem a mesma Media de Alunos por Turma para a mesma unidade e competencia, com numerador e denominador auditaveis.

**Architecture:** Expor uma RPC neutra e versionada do dominio de turmas sobre a regra homologada de ocupacoes da carteira canonica. Um cliente TypeScript unico consulta, normaliza, consolida e indexa o contrato. Os consumidores deixam de recalcular localmente ou inferir a competencia pelo relogio; a view operacional continua apenas para listas e diagnosticos vivos.

**Tech Stack:** PostgreSQL/Supabase RPC, TypeScript, React, Node test runner, Vite.

---

### Task 1: Fixar o contrato em testes que falham

**Files:**
- Create: `tests/turmasKpisCanonicos.test.mjs`
- Modify: `tests/professoresKpisAppCanonicos.test.mjs`
- Test: `tests/turmasKpisCanonicos.test.mjs`

- [ ] **Step 1: Escrever o teste estatico da RPC neutra**

Validar que a nova migration define `get_kpis_turmas_canonicos_v1`, recebe unidade/ano/mes/intervalo, encapsula `get_carteira_professor_periodo_canonica`, retorna `ocupacoes_elegiveis`, `turmas_elegiveis`, `media_alunos_turma`, fonte e versao, e concede execucao somente a `authenticated` e `service_role`.

- [ ] **Step 2: Escrever os testes do helper frontend**

Cobrir normalizacao numerica, consolidacao por `soma(ocupacoes) / soma(turmas)`, indice por professor+unidade e deduplicacao de chamadas concorrentes identicas.

- [ ] **Step 3: Fixar os quatro consumidores**

Atualizar `professoresKpisAppCanonicos.test.mjs` para exigir o helper neutro em Alunos, Dashboard, Analytics e Professores; proibir o calculo de KPI pela `vw_turmas_implicitas`, `new Date()` como competencia do cadastro e media simples de medias.

- [ ] **Step 4: Rodar os testes e confirmar RED**

Run: `node --test tests/turmasKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs`

Expected: FAIL porque migration, helper e integracoes ainda nao existem.

- [ ] **Step 5: Commit**

```bash
git add tests/turmasKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs
git commit -m "test: fixa contrato canonico de media por turma"
```

### Task 2: Criar a RPC neutra de turmas

**Files:**
- Create: `supabase/migrations/20260804220000_kpis_turmas_canonicos_v1.sql`
- Test: `tests/turmasKpisCanonicos.test.mjs`

- [ ] **Step 1: Implementar autorizacao e escopo de unidade**

Reutilizar o padrao de `get_kpis_professor_periodo_canonico_v2`: `SECURITY DEFINER`, `search_path = public`, usuario ativo, admin com permissao de leitura e usuario de unidade limitado a sua unidade. Autorizar quem tenha `professores.ver` ou `alunos.ver`, sem permitir consolidado fora do escopo.

- [ ] **Step 2: Implementar o contrato sobre a fonte homologada**

Chamar `get_carteira_professor_periodo_canonica(p_ano, p_mes, v_unidade_efetiva, p_data_inicio, p_data_fim)` e projetar por professor+unidade:

```sql
alunos_via_turmas AS ocupacoes_elegiveis,
turmas_elegiveis_media AS turmas_elegiveis,
CASE WHEN turmas_elegiveis_media > 0
  THEN alunos_via_turmas::numeric / turmas_elegiveis_media
  ELSE 0
END AS media_alunos_turma
```

Publicar tambem `competencia_status`, `fonte = 'carteira_professor_periodo_canonica'` e `regra_versao = 'turmas_v1_pessoa_turma_regular'`.

- [ ] **Step 3: Endurecer grants**

Revogar de `PUBLIC` e `anon`; conceder apenas a `authenticated` e `service_role`. Manter a funcao interna da carteira sem grant direto ao navegador.

- [ ] **Step 4: Rodar o teste da migration**

Run: `node --test tests/turmasKpisCanonicos.test.mjs`

Expected: a parte SQL passa; a parte do helper continua vermelha.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260804220000_kpis_turmas_canonicos_v1.sql tests/turmasKpisCanonicos.test.mjs
git commit -m "feat: expoe kpis canonicos de turmas"
```

### Task 3: Criar o cliente TypeScript unico

**Files:**
- Create: `src/lib/turmasKpisCanonicos.ts`
- Test: `tests/turmasKpisCanonicos.test.mjs`

- [ ] **Step 1: Definir tipos e normalizacao**

Criar `FiltroKPITurmaCanonico`, `KPITurmaCanonico`, `TotaisKPITurmaCanonico` e converter todos os numeros retornados pela RPC explicitamente.

- [ ] **Step 2: Implementar consulta deduplicada**

Chamar `supabase.rpc('get_kpis_turmas_canonicos_v1', parametros)` e manter um `Map` de promessas em andamento pela chave completa unidade+ano+mes+datas. Propagar erro; nao usar fallback.

- [ ] **Step 3: Implementar consolidacao correta**

Adicionar:

```ts
calcularTotaisKpisTurmasCanonicos(linhas)
// soma ocupacoes, soma turmas, divide somente no final

indexarKpisTurmasCanonicos(linhas)
// chaves professor_unidade e professor_todos
```

- [ ] **Step 4: Rodar testes do helper**

Run: `node --test tests/turmasKpisCanonicos.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/turmasKpisCanonicos.ts tests/turmasKpisCanonicos.test.mjs
git commit -m "feat: centraliza cliente canonico de turmas"
```

### Task 4: Migrar Gestao de Alunos sem quebrar a operacao viva

**Files:**
- Modify: `src/components/App/Alunos/AlunosPage.tsx`
- Test: `tests/professoresKpisAppCanonicos.test.mjs`

- [ ] **Step 1: Tornar a competencia mensal explicita**

Inicializar o filtro local como mensal e usar `competenciaFiltro.ano`, `competenciaFiltro.mes` e `competenciaRange` na consulta canonica. Nao preencher o KPI quando o filtro for `todos` sem recorte mensal; exibir indisponibilidade observavel em vez de fotografia atual sob o mesmo rotulo.

- [ ] **Step 2: Buscar a metrica canonica em paralelo**

Adicionar `buscarKpisTurmasCanonicos` ao carregamento e calcular o card via `calcularTotaisKpisTurmasCanonicos`.

- [ ] **Step 3: Separar KPI de diagnostico operacional**

Manter `vw_turmas_implicitas` para lista de turmas, total operacional e turmas sozinhas. Remover apenas o calculo local usado pelo card `Media/Turma`.

- [ ] **Step 4: Melhorar a auditoria visual**

Atualizar o tooltip/subvalue para informar `ocupacoes regulares / turmas regulares` e a competencia selecionada.

- [ ] **Step 5: Rodar testes focados**

Run: `node --test tests/turmasKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs`

Expected: Alunos passa; demais consumidores ainda falham.

- [ ] **Step 6: Commit**

```bash
git add src/components/App/Alunos/AlunosPage.tsx tests/professoresKpisAppCanonicos.test.mjs
git commit -m "fix: alinha media por turma em alunos"
```

### Task 5: Migrar Dashboard e Analytics

**Files:**
- Modify: `src/components/App/Dashboard/DashboardPage.tsx`
- Modify: `src/components/GestaoMensal/TabProfessoresNew.tsx`
- Test: `tests/professoresKpisAppCanonicos.test.mjs`

- [ ] **Step 1: Consultar a RPC neutra nos dois consumidores**

Manter `buscarKpisProfessoresCanonicos` para KPIs exclusivamente docentes. Para `media_alunos_turma`, chamar `buscarKpisTurmasCanonicos` com exatamente a unidade, ano, mes inicial e intervalo exibidos.

- [ ] **Step 2: Consolidar sem media de medias**

Usar `calcularTotaisKpisTurmasCanonicos` e publicar a mesma precisao de exibicao nas duas telas.

- [ ] **Step 3: Exibir fonte e competencia**

Manter o rotulo unico e informar que o valor vem de ocupacoes/turmas regulares da competencia. Em falha, manter o card indisponivel e registrar o erro.

- [ ] **Step 4: Rodar testes focados**

Run: `node --test tests/turmasKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs`

Expected: Dashboard e Analytics passam; cadastro de Professores ainda falha.

- [ ] **Step 5: Commit**

```bash
git add src/components/App/Dashboard/DashboardPage.tsx src/components/GestaoMensal/TabProfessoresNew.tsx tests/professoresKpisAppCanonicos.test.mjs
git commit -m "fix: unifica media por turma no dashboard e analytics"
```

### Task 6: Migrar Professores para a competencia selecionada

**Files:**
- Modify: `src/components/App/Professores/ProfessoresPage.tsx`
- Modify: `src/components/App/Professores/TabCarteiraProfessores.tsx`
- Modify: `src/components/App/Professores/TabPerformanceProfessores.tsx`
- Test: `tests/professoresKpisAppCanonicos.test.mjs`

- [ ] **Step 1: Remover o mes do relogio no cadastro**

Ler ano, mes, inicio e fim do `OutletContext`. Recarregar quando unidade ou competencia mudar. Nao usar `new Date()` para a media exibida.

- [ ] **Step 2: Alimentar cards e tabela pelo helper neutro**

Trocar os mapas de `media_alunos_turma`, `alunos_via_turmas` e `turmas_elegiveis_media` pelo indice de `turmasKpisCanonicos`. Os demais dados de professores permanecem em suas fontes atuais.

- [ ] **Step 3: Alinhar Carteira e Performance**

Consultar o mesmo contrato neutro com o recorte mensal ou de ciclo escolhido. Preservar a regra temporal ja aprovada para os demais pilares; alterar somente os campos de ocupacao/turma.

- [ ] **Step 4: Rodar testes focados e regressao de professores**

Run: `node --test tests/turmasKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs tests/professoresKpisCanonicos.test.mjs tests/professoresCarteiraSegmentosCanonicos.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/App/Professores/ProfessoresPage.tsx src/components/App/Professores/TabCarteiraProfessores.tsx src/components/App/Professores/TabPerformanceProfessores.tsx tests/professoresKpisAppCanonicos.test.mjs
git commit -m "fix: aplica competencia canonica em professores"
```

### Task 7: Verificar relatorios e igualdade do contrato

**Files:**
- Modify: `tests/turmasKpisCanonicos.test.mjs`
- Modify: `tests/professoresKpisCanonicos.test.mjs`
- Test: `tests/turmasKpisCanonicos.test.mjs`

- [ ] **Step 1: Garantir que relatorios reutilizam a mesma base**

Adicionar assercoes para relatorio gerencial e coordenacao: quando publicarem media por turma, devem consumir numeradores e denominadores do contrato V3 que deriva da mesma `get_carteira_professor_periodo_canonica`, sem media simples de professores.

- [ ] **Step 2: Adicionar fixtures aritmeticas**

Testar consolidado ponderado, professor em duas unidades, banda/projeto fora do denominador e zero turmas sem divisao por zero.

- [ ] **Step 3: Preservar exemplos homologados**

Fixar os contratos de junho: Daiana Campo Grande `18/6 = 3.00`, Ramon Recreio `13/13 = 1.00` e Akeem Recreio `49/40 = 1.225`, exibido como `1.23` quando a tela usa duas casas.

- [ ] **Step 4: Rodar suite focal completa**

Run: `node --test tests/turmasKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs tests/professoresKpisCanonicos.test.mjs tests/professoresCarteiraSegmentosCanonicos.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/turmasKpisCanonicos.test.mjs tests/professoresKpisCanonicos.test.mjs
git commit -m "test: cobre paridade canonica de media por turma"
```

### Task 8: Validacao final e preparacao de publicacao

**Files:**
- Verify only unless a defect is found.

- [ ] **Step 1: Rodar typecheck e build**

Run: `npx tsc --noEmit`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 2: Rodar regressao focal**

Run: `node --test tests/turmasKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs tests/professoresKpisCanonicos.test.mjs tests/professoresCarteiraSegmentosCanonicos.test.mjs tests/professoresConvergenciaCanonica.test.mjs`

Expected: PASS.

- [ ] **Step 3: Revisar diff e escopo**

Run: `git status --short && git diff --check && git diff origin/main...HEAD --stat`

Expected: somente migration, helper, quatro familias de consumidores, testes e documentacao desta metrica.

- [ ] **Step 4: Comparar preview autenticado**

Com Campo Grande/Julho 2026 selecionado, registrar o mesmo `ocupacoes_elegiveis`, `turmas_elegiveis` e valor em Gestao de Alunos, Dashboard, Analytics e Professores. Repetir uma unidade adicional e uma competencia aberta.

- [ ] **Step 5: Publicar em ordem segura**

Aplicar a migration antes do frontend. Depois do deploy, repetir o smoke autenticado nas quatro telas. Nao mesclar nem publicar alteracoes de outras worktrees.

- [ ] **Step 6: Commit de correcoes finais, se houver**

```bash
git add supabase/migrations/20260804220000_kpis_turmas_canonicos_v1.sql src/lib/turmasKpisCanonicos.ts src/components/App/Alunos/AlunosPage.tsx src/components/App/Dashboard/DashboardPage.tsx src/components/GestaoMensal/TabProfessoresNew.tsx src/components/App/Professores/ProfessoresPage.tsx src/components/App/Professores/TabCarteiraProfessores.tsx src/components/App/Professores/TabPerformanceProfessores.tsx tests/turmasKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs tests/professoresKpisCanonicos.test.mjs
git commit -m "fix: conclui paridade canonica de media por turma"
```
