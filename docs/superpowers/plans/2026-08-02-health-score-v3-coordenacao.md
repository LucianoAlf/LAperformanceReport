# Health Score Professor V3 e Relatorio da Coordenacao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar o Health Score Professor V3 como diagnostico pedagogico justo, configuravel e explicavel, e fazer o botao mensal da Coordenacao consumir o mesmo contrato canonico, com todos os professores, sem financeiro e sem recalculos no navegador ou na IA.

**Architecture:** O PostgreSQL continua sendo a unica fonte do score e passa a separar explicitamente pilares pontuaveis, diagnosticos de carteira e alertas de capacidade. A materializacao append-only calcula nota parcial com pesos efetivos normalizados, preserva ranking somente para fechamento oficial e devolve motivos estruturados de ausencia de evidencia. A configuracao segue versionada e imutavel no banco, mas o frontend transforma o fluxo de rascunho em um laboratorio de edicao, simulacao e aplicacao. Uma RPC server-side monta o contrato mensal da Coordenacao; a Edge Function busca esse contrato com o JWT do usuario, limita a IA a narrativa e renderiza os numeros deterministicamente.

**Tech Stack:** PostgreSQL 17/Supabase RPC, Supabase Edge Functions/Deno/TypeScript, React 19/TypeScript, Node test runner, Vite, Playwright/browser smoke.

**Estado da execução em 02/08/2026:** Tasks 1 a 8 implementadas e verificadas localmente. Task 9 em fechamento documental e de gates. Task 10 pendente de rebase, implantação, PR, merge e smoke no domínio estável. A auditoria real pré-rollout confirmou que Matheus Lana e Valdo Delfino possuem base; os antigos estados genéricos decorriam dos cortes rígidos e da carteira na nota, corrigidos por esta entrega.

---

## Entrega e limites

- A implementacao ocorre somente na worktree `D:\2026\LA-performance-report\.worktrees\health-score-v3-coordenacao-design`, na branch `design/health-score-v3-coordenacao`.
- Nao alterar nem incluir arquivos de pesquisa de evasao, Agenda, PRs ou branches de outros trabalhos.
- Nao reescrever snapshots oficiais fechados. Nova leitura de periodo parcial usa revisao append-only.
- O recorte inicial do relatorio permanece mensal e manual pelo botao. Nao criar cron ou disparo automatico.
- Fabio e LA Teacher nao recebem score bruto, ranking, comparacao publica ou financeiro nesta entrega.
- Ao concluir: atualizar com `origin/main`, resolver apenas conflitos deste escopo, testar, aplicar o backend aditivo, fazer push, abrir PR, acompanhar checks, corrigir falhas deste escopo e mesclar sem pedir nova autorizacao.

## Estrutura de arquivos

- Create `supabase/migrations/20260802190000_health_score_v3_nota_diagnostica.sql`: contrato de pilares, peso efetivo, nota parcial, motivos de evidencia e read models.
- Create `supabase/migrations/20260802191000_health_score_v3_sinais_capacidade.sql`: capacidade por sala/turma, carteira diagnostica e mapa de sinais.
- Create `supabase/migrations/20260802192000_relatorio_coordenacao_canonico.sql`: produtor mensal server-side, autorizacao, periodo e contrato JSON.
- Modify `supabase/functions/_shared/health-score-v3.ts`: tipos de peso efetivo, evidencia, diagnosticos e sinais.
- Modify `supabase/functions/gemini-relatorio-coordenacao/index.ts`: busca server-side, narrativa controlada e renderizacao publica.
- Modify `src/lib/healthScoreProfessorV3.ts`: separar metrica pontuavel de diagnostico e ampliar contratos.
- Modify `src/lib/healthScoreProfessorV3Performance.ts`: normalizar pesos efetivos, motivos e sinais.
- Modify `src/hooks/useHealthScoreProfessorV3Config.ts`: esconder a gestao de rascunho e expor laboratorio.
- Modify `src/components/App/Professores/HealthScoreV3Config.tsx`: edicao livre, simulacao comparativa, restauracao e aplicacao.
- Modify `src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx`: preservar metas por unidade/curso/modalidade e separar capacidade/carteira da nota.
- Modify `src/components/App/Professores/TabPerformanceProfessores.tsx`: todos os professores, score parcial e estados explicaveis.
- Modify `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx`: evidencia pilar a pilar, carteira e sinais.
- Modify `src/components/App/Professores/ModalRelatorioCoordenacao.tsx`: chamada da Edge somente com filtros e copia robusta.
- Create `tests/healthScoreProfessorV3NotaDiagnostica.test.mjs`: contrato estatico do motor.
- Create `tests/healthScoreProfessorV3NotaDiagnosticaPostgres.test.mjs`: regressao real em PostgreSQL 17.
- Create `tests/healthScoreProfessorV3SinaisCapacidade.test.mjs`: capacidade e mapa de sinais.
- Create `tests/healthScoreProfessorV3LaboratorioConfig.test.mjs`: UX e governanca do laboratorio.
- Create `tests/relatorioCoordenacaoCanonico.test.mjs`: arquitetura, conteudo e linguagem publica.
- Create `tests/relatorioCoordenacaoCanonicoPostgres.test.mjs`: comportamento real do produtor canonico.
- Modify `tests/healthScoreProfessorV3Frontend.test.mjs`: trocar expectativas de rascunho visivel por laboratorio.
- Modify `tests/healthScoreProfessorV3ConfigCompetencia.test.mjs`: preservar versionamento interno sem burocracia na UI.
- Modify `tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs`: carteira diagnostica e granularidade preservada.
- Modify `tests/relatorioCoordenacaoRankingV3.test.mjs`: parcial sem ranking; oficial com ranking.
- Create `scripts/auditar-health-score-v3-jun-jul.mjs`: auditoria somente leitura de junho/julho e casos conhecidos.
- Create `docs/audits/2026-08-02-health-score-v3-jun-jul.md`: evidencia nominal e decisao de publicacao.
- Modify `docs/HEALTH_SCORE_PROFESSOR_V3.md`: regra final e governanca.
- Modify `docs/METRICAS.md`: definicoes do score, confianca, carteira e capacidade.
- Modify `docs/MAPA-SISTEMA.md`: fluxo painel/relatorio/Fabio/LA Teacher.

### Task 1: Congelar o novo contrato em testes RED

**Files:**
- Create: `tests/healthScoreProfessorV3NotaDiagnostica.test.mjs`
- Create: `tests/healthScoreProfessorV3NotaDiagnosticaPostgres.test.mjs`
- Modify: `tests/healthScoreProfessorV3Frontend.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigCompetencia.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs`

- [ ] **Step 1: Escrever o teste estatico do papel das metricas**

O teste deve exigir que `numero_alunos` continue materializado como diagnostico, mas tenha `peso_disponivel = false`, `peso_efetivo = 0` e fique fora do denominador. Deve exigir conversao pontuavel somente quando `amostra >= amostra_minima`.

```js
assert.match(sql, /when\s+sm\.metrica\s*=\s*'numero_alunos'[\s\S]*then\s+false/i);
assert.match(sql, /sm\.metrica\s*<>\s*'numero_alunos'[\s\S]*sum\s*\(.*peso/i);
assert.match(sql, /sm\.metrica\s*=\s*'conversao'[\s\S]*amostra\s*>=\s*.*amostra_minima/i);
```

- [ ] **Step 2: Cobrir peso efetivo, nota parcial e classificacao oficial**

Exigir que pilares validos sejam normalizados para 100%, que um professor com ao menos um pilar valido receba score parcial e que ranking continue exigindo cobertura minima mais pilar de fidelizacao.

```js
assert.match(sql, /peso_efetivo[\s\S]*100::numeric\s*\*\s*.*peso[\s\S]*sum\s*\(.*peso/i);
assert.match(sql, /estado_publicacao[\s\S]*'parcial'/i);
assert.match(sql, /ranking_habilitado[\s\S]*cobertura_minima[\s\S]*exige_pilar_fidelizacao/i);
```

- [ ] **Step 3: Cobrir estados de evidencia estruturados**

Exigir os codigos `professor_em_maturacao`, `amostra_insuficiente`, `sem_experimental_periodo`, `cobertura_presenca_insuficiente`, `calendario_sem_aulas_elegiveis`, `segmentacao_incompleta`, `fonte_canonica_indisponivel` e `metrica_nao_aplicavel`.

- [ ] **Step 4: Criar fixture PostgreSQL 17**

A fixture deve criar configuracao, snapshot-base e metricas para quatro professores:

1. carteira alta com retencao/presenca validas;
2. duas experimentais, conversao apenas diagnostica;
3. tres experimentais, conversao pontuavel;
4. somente carteira, sem score e com motivo concreto.

Asserts obrigatorios: carteira nunca muda score; pesos efetivos somam 100; ausencia nao vira zero; score parcial nao habilita ranking; snapshot `fechado` existente permanece byte a byte igual.

- [ ] **Step 5: Rodar RED**

Run:

```powershell
node --test `
  tests/healthScoreProfessorV3NotaDiagnostica.test.mjs `
  tests/healthScoreProfessorV3NotaDiagnosticaPostgres.test.mjs `
  tests/healthScoreProfessorV3Frontend.test.mjs `
  tests/healthScoreProfessorV3ConfigCompetencia.test.mjs `
  tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
```

Expected: FAIL pelas regras atuais de carteira no score, corte que apaga nota parcial e UI de rascunho explicita.

### Task 2: Implementar o motor V3 justo e append-only

**Files:**
- Create: `supabase/migrations/20260802190000_health_score_v3_nota_diagnostica.sql`
- Modify: `supabase/functions/_shared/health-score-v3.ts`
- Modify: `src/lib/healthScoreProfessorV3.ts`
- Modify: `src/lib/healthScoreProfessorV3Performance.ts`
- Test: `tests/healthScoreProfessorV3NotaDiagnostica.test.mjs`
- Test: `tests/healthScoreProfessorV3NotaDiagnosticaPostgres.test.mjs`

- [ ] **Step 1: Adicionar contrato aditivo de peso efetivo e evidencia**

Adicionar `peso_efetivo numeric`, `codigo_evidencia text` e `papel text` em `health_score_professor_v3_snapshot_metricas`, com valores historicos nulos e preenchimento somente em novas revisoes.

```sql
alter table public.health_score_professor_v3_snapshot_metricas
  add column if not exists peso_efetivo numeric,
  add column if not exists codigo_evidencia text,
  add column if not exists papel text;
```

- [ ] **Step 2: Substituir o materializador pela versao derivada do ultimo append-only**

Copiar como base `20260728123000_health_score_v3_carteira_disponibilidade_append_only.sql`; nao editar migration antiga. No novo corpo:

```sql
case
  when sm.metrica = 'numero_alunos' then 'diagnostico'
  else 'nota'
end as papel,
case
  when sm.metrica = 'numero_alunos' then false
  when sm.metrica = 'conversao'
    then coalesce(sm.amostra, 0) >= coalesce(cm.amostra_minima, 3)
      and sm.publicavel
  else sm.peso_disponivel
end as peso_disponivel
```

- [ ] **Step 3: Calcular score e pesos efetivos sem zeros artificiais**

O denominador usa somente metricas de papel `nota`, com nota valida e peso disponivel. `cobertura` continua sendo a soma dos pesos originais validos; `peso_efetivo` e normalizado sobre os pilares aplicaveis.

```sql
round(
  100::numeric * m.peso
  / nullif(sum(m.peso) filter (
      where m.papel = 'nota' and m.nota is not null and m.peso_disponivel
    ) over (partition by m.snapshot_id), 0),
  4
) as peso_efetivo
```

O `score` usa `sum(nota * peso_efetivo) / 100`. Ter score parcial nao implica `ranking_habilitado`.

- [ ] **Step 4: Separar visibilidade diagnostica de elegibilidade oficial**

Persistir `score_exibivel = true` quando existir pelo menos um pilar pontuavel. Manter `ranking_habilitado = true` somente em snapshot oficial, com cobertura minima e pilar de fidelizacao. Em revisao mensal parcial, ranking fica falso.

- [ ] **Step 5: Corrigir presenca e calendario**

Remover qualquer corte hardcoded de 90/95 do wrapper. Usar `cobertura_minima` da metrica/configuracao. Aulas canceladas, justificadas e dias registrados como recesso/feriado ficam fora do denominador elegivel; se o calendario nao tiver aulas elegiveis, publicar `calendario_sem_aulas_elegiveis`, nunca nota zero.

- [ ] **Step 6: Atualizar read models e parsers**

`get_health_score_professor_v3_performance` e `get_health_score_professor_v3_snapshot_modal` devem devolver `peso_efetivo`, `codigo_evidencia` e `papel`. Atualizar os tipos TS correspondentes sem fallback para V2.

- [ ] **Step 7: Rodar GREEN e commit local**

Run:

```powershell
node --test `
  tests/healthScoreProfessorV3NotaDiagnostica.test.mjs `
  tests/healthScoreProfessorV3NotaDiagnosticaPostgres.test.mjs `
  tests/healthScoreProfessorV3Snapshots.test.mjs `
  tests/healthScoreProfessorV3EstadosNaoPontuaveisMaterializador.test.mjs `
  tests/healthScoreProfessorV3ConversaoCicloProvisorio.test.mjs `
  tests/healthScoreProfessorV3ConsumidoresGovernados.test.mjs
git diff --check
git add supabase/migrations/20260802190000_health_score_v3_nota_diagnostica.sql supabase/functions/_shared/health-score-v3.ts src/lib/healthScoreProfessorV3.ts src/lib/healthScoreProfessorV3Performance.ts tests/healthScoreProfessorV3NotaDiagnostica.test.mjs tests/healthScoreProfessorV3NotaDiagnosticaPostgres.test.mjs tests/healthScoreProfessorV3Frontend.test.mjs tests/healthScoreProfessorV3ConfigCompetencia.test.mjs tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
git commit -m "feat: separar nota e diagnosticos do Health Score V3"
```

Expected: todos os testes listados passam; PostgreSQL pode ser `SKIP` somente se o runtime local estiver indisponivel, devendo ser reexecutado em ambiente real antes do rollout.

### Task 3: Separar capacidade fisica e mapa de sinais

**Files:**
- Create: `supabase/migrations/20260802191000_health_score_v3_sinais_capacidade.sql`
- Create: `tests/healthScoreProfessorV3SinaisCapacidade.test.mjs`
- Modify: `src/lib/healthScoreProfessorV3Performance.ts`
- Modify: `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx`

- [ ] **Step 1: Escrever RED para capacidade efetiva**

Cobrir Bateria com capacidade 2 em uma sala e 4 em outra, na mesma unidade. Exigir a prioridade `turma -> sala -> curso -> regra segmentada`, usando o menor limite fisico conhecido quando mais de um existir. Excedente deve gerar alerta, mas o score antes/depois deve ser identico.

- [ ] **Step 2: Criar funcao canonica de capacidade**

Criar `get_health_score_professor_v3_capacidade_diagnostico(p_competencia, p_unidade_id)` sobre `turmas_explicitas.sala_id`, `salas.capacidade_maxima`, limite explicito da turma, `cursos.capacidade_maxima` e fallback segmentado.

```sql
case
  when te.capacidade_maxima is not null then 'turma'
  when s.capacidade_maxima is not null then 'sala'
  when c.capacidade_maxima is not null then 'curso'
  else 'estimada_segmento'
end as fonte_capacidade
```

- [ ] **Step 3: Criar mapa de sinais deterministico**

Criar `get_health_score_professor_v3_sinais(p_competencia, p_unidade_id)` com sinais no maximo `baixo`, `medio` e `alto`, sempre acompanhados de evidencias. Regras iniciais:

- possivel sobrecarga: carteira acima do P75 da unidade mais deterioracao de presenca, retencao ou evasoes;
- expansao sustentavel: crescimento da carteira mais presenca/retencao saudaveis;
- oportunidade de distribuicao: carteira abaixo do P50, disponibilidade e indicadores saudaveis;
- concentracao operacional: concentracao relevante por curso/horario/unidade;
- maturacao: tempo abaixo da janela definida na politica da unidade.

Nenhum sinal isolado muda o score.

- [ ] **Step 4: Exibir diagnosticos no modal individual**

Mostrar carteira por pessoa, P50/P75, maturacao, distribuicao e sinais. Mostrar fonte de capacidade como `fisica` ou `estimada`, sem nomes de tabelas/RPCs.

- [ ] **Step 5: Rodar GREEN e commit local**

Run:

```powershell
node --test `
  tests/healthScoreProfessorV3SinaisCapacidade.test.mjs `
  tests/healthScoreProfessorV3CarteiraDisponibilidade.test.mjs `
  tests/healthScoreProfessorV3CarteiraDisponibilidadeAppendOnly.test.mjs `
  tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs
npm run build
git diff --check
git add supabase/migrations/20260802191000_health_score_v3_sinais_capacidade.sql tests/healthScoreProfessorV3SinaisCapacidade.test.mjs src/lib/healthScoreProfessorV3Performance.ts src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx
git commit -m "feat: adicionar mapa pedagogico de sinais e capacidade"
```

### Task 4: Transformar a configuracao em laboratorio utilizavel

**Files:**
- Modify: `src/hooks/useHealthScoreProfessorV3Config.ts`
- Modify: `src/components/App/Professores/HealthScoreV3Config.tsx`
- Modify: `src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx`
- Modify: `src/lib/healthScoreProfessorV3.ts`
- Create: `tests/healthScoreProfessorV3LaboratorioConfig.test.mjs`
- Modify: `tests/healthScoreProfessorV3Frontend.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigCompetencia.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs`

- [ ] **Step 1: Escrever RED da experiencia aprovada**

Exigir ausencia das acoes publicas `Criar rascunho` e `Somente leitura`; exigir `Editar configuracao`, `Desfazer`, `Restaurar vigente`, `Simular` e `Aplicar configuracao`. Exigir que carteira apareca em `Diagnosticos`, fora dos sliders de peso.

- [ ] **Step 2: Encapsular o rascunho governado no hook**

O hook continua chamando as RPCs protegidas existentes, mas apresenta uma API de laboratorio:

```ts
interface HealthScoreV3LabActions {
  startEditing(): Promise<void>;
  updateLocal(config: HealthScoreV3Config): void;
  simulate(): Promise<HealthScoreV3Simulation>;
  restore(): void;
  apply(justificativa: string): Promise<HealthScoreV3Config>;
}
```

`startEditing` cria/clona a revisao interna se necessario. `simulate` salva a revisao interna e chama o mesmo motor. `apply` exige justificativa curta, simulacao vigente e ativa pela RPC. O usuario nao administra status de rascunho.

- [ ] **Step 3: Remover carteira dos pesos e manter o diagnostico**

`HEALTH_SCORE_V3_SCORING_METRICS` deve conter somente `retencao`, `permanencia`, `conversao`, `media_turma` e `presenca`. `numero_alunos` permanece em `HEALTH_SCORE_V3_DIAGNOSTICS`.

- [ ] **Step 4: Preservar a granularidade real**

Manter abas Barra/Recreio/Campo Grande no acesso consolidado; manter curso e modalidade. Separar colunas:

- meta de media/turma: pontuavel;
- referencia de carteira: diagnostica;
- capacidade fallback: operacional.

Adicionar `Copiar para outra unidade` e edicao em lote somente como acoes explicitas. Nunca propagar alteracao silenciosamente.

- [ ] **Step 5: Mostrar impacto da simulacao**

Exibir score anterior/simulado, cobertura, peso efetivo, mudancas de faixa, professores que ganham/perdem evidencia e motivo. Score parcial deve ser rotulado `Simulacao parcial - nao oficial`.

- [ ] **Step 6: Rodar testes, build e commit local**

Run:

```powershell
node --test `
  tests/healthScoreProfessorV3LaboratorioConfig.test.mjs `
  tests/healthScoreProfessorV3Frontend.test.mjs `
  tests/healthScoreProfessorV3ConfigCompetencia.test.mjs `
  tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs `
  tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs `
  tests/healthScoreProfessorV3MetasSegmentadasSecurity.test.mjs
npm run build
git diff --check
git add src/hooks/useHealthScoreProfessorV3Config.ts src/components/App/Professores/HealthScoreV3Config.tsx src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx src/lib/healthScoreProfessorV3.ts tests/healthScoreProfessorV3LaboratorioConfig.test.mjs tests/healthScoreProfessorV3Frontend.test.mjs tests/healthScoreProfessorV3ConfigCompetencia.test.mjs tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
git commit -m "feat: liberar laboratorio governado do Health Score V3"
```

### Task 5: Fazer todos os professores aparecerem com explicacao util

**Files:**
- Modify: `src/hooks/useHealthScoreProfessorV3Performance.ts`
- Modify: `src/components/App/Professores/TabPerformanceProfessores.tsx`
- Modify: `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx`
- Modify: `src/lib/healthScoreProfessorV3Performance.ts`
- Test: `tests/healthScoreProfessorV3NotaDiagnostica.test.mjs`
- Test: `tests/healthScoreProfessorV3Frontend.test.mjs`

- [ ] **Step 1: Cobrir professor ativo sem snapshot e multiunidade**

Exigir que a tabela parta do conjunto de professores/vinculos ativos e anexe o snapshot, em vez de partir somente dos snapshots. Professor sem snapshot continua na lista com `fonte_canonica_indisponivel`. Professor multiunidade mostra recorte local e opcao consolidada.

- [ ] **Step 2: Exibir score parcial sem falso ranking**

Mostrar score parcial, cobertura e pilares ausentes. O filtro de status deve separar `Saudavel`, `Atencao`, `Critico`, `Parcial` e `Evidencia pendente`. Ordenacao padrao nao deve colocar parcial como ranking oficial.

- [ ] **Step 3: Exibir evidencia por pilar**

Cada pilar mostra valor observado, numerador/denominador, amostra exigida, peso original, peso efetivo e motivo de nao aplicabilidade. Conversao sem experimental deve dizer `Nao realizou aula experimental no periodo`, nao `Sem base`.

- [ ] **Step 4: Remover fallback V2 silencioso**

Sob a flag V3, nenhuma tabela, modal ou relatorio pode calcular `calcularHealthScore` localmente como substituto. Fonte indisponivel fica explicita.

- [ ] **Step 5: Rodar testes e commit local**

Run:

```powershell
node --test `
  tests/healthScoreProfessorV3NotaDiagnostica.test.mjs `
  tests/healthScoreProfessorV3Performance.test.mjs `
  tests/healthScoreProfessorV3Consumers.test.mjs `
  tests/healthScoreProfessorV3Frontend.test.mjs `
  tests/professoresUnidadesAtivas.test.mjs
npm run build
git diff --check
git add src/hooks/useHealthScoreProfessorV3Performance.ts src/components/App/Professores/TabPerformanceProfessores.tsx src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx src/lib/healthScoreProfessorV3Performance.ts tests/healthScoreProfessorV3NotaDiagnostica.test.mjs tests/healthScoreProfessorV3Frontend.test.mjs
git commit -m "feat: explicar evidencia de todos os professores"
```

### Task 6: Validar junho e julho com dados reais

**Files:**
- Create: `scripts/auditar-health-score-v3-jun-jul.mjs`
- Create: `docs/audits/2026-08-02-health-score-v3-jun-jul.md`
- Test: `tests/healthScoreProfessorV3NotaDiagnosticaPostgres.test.mjs`

- [ ] **Step 1: Implementar auditor somente leitura**

O script recebe `SUPABASE_URL`, `SUPABASE_ANON_KEY` e um JWT autenticado via ambiente; consulta junho e julho para Barra, Recreio, Campo Grande e consolidado. Nao chama materializacao, ativacao ou qualquer RPC de escrita.

- [ ] **Step 2: Registrar recortes obrigatorios**

Para Matheus Lana e Valdo Delfino, registrar por unidade e consolidado: carteira, retencao, permanencia, conversao, presenca, cobertura, aulas excluidas, pesos efetivos, score parcial e motivos. Julho deve declarar o recesso; junho deve permanecer mes regular.

- [ ] **Step 3: Comparar antes/depois sem alterar fechamento**

Comparar V3 vigente e V3 simulado. Bloquear rollout se:

- carteira alterar a nota;
- aula justificada/cancelada/recesso entrar no denominador;
- professor com pilar valido ficar genericamente `sem base`;
- soma de pesos efetivos divergir de 100;
- professor multiunidade perder um vinculo legitimo.

- [ ] **Step 4: Produzir a auditoria nominal**

O documento deve listar divergencias por causa: dado, regra ou contexto operacional, mais decisao tomada. Nao incluir chave, token, contato ou dado financeiro.

- [ ] **Step 5: Rodar e commit local**

Run:

```powershell
node scripts/auditar-health-score-v3-jun-jul.mjs
git diff --check
git add scripts/auditar-health-score-v3-jun-jul.mjs docs/audits/2026-08-02-health-score-v3-jun-jul.md
git commit -m "test: validar Health Score V3 em junho e julho"
```

Expected: saida `AUDITORIA_APROVADA=true`; nenhuma escrita no banco.

### Task 7: Criar o produtor canonico do relatorio da Coordenacao

**Files:**
- Create: `supabase/migrations/20260802192000_relatorio_coordenacao_canonico.sql`
- Create: `tests/relatorioCoordenacaoCanonico.test.mjs`
- Create: `tests/relatorioCoordenacaoCanonicoPostgres.test.mjs`
- Modify: `tests/relatorioCoordenacaoRankingV3.test.mjs`

- [ ] **Step 1: Escrever RED do contrato server-side**

Exigir `get_relatorio_coordenacao_canonico_v1(p_unidade_id, p_ano, p_mes)`, `security definer`, `search_path` fixo, validacao de permissao/unidade e retorno versionado:

```json
{
  "schema_version": 1,
  "periodo": {},
  "resumo_equipe": {},
  "professores": [],
  "mapa_sinais": [],
  "retencao_permanencia": {},
  "presenca": {},
  "experimentais": {},
  "carteira_carga": {},
  "agenda_treinamentos": {},
  "qualidade_dados": {},
  "ranking_oficial": null,
  "auditoria": {}
}
```

- [ ] **Step 2: Provar todos os professores e ausencia de financeiro**

A fixture PostgreSQL deve ter professor com score oficial, parcial, em maturacao, sem experimental e com fonte indisponivel. Todos devem aparecer. O JSON nao pode conter `mrr`, `ticket`, `faturamento`, `parcela` ou `financeiro`.

- [ ] **Step 3: Implementar o produtor**

O produtor parte de professores e vinculos ativos do recorte, anexa o ultimo snapshot governado da competencia, sinais, agenda e catalogo de treinamentos. Nao recebe KPIs calculados pelo frontend. A lista `ranking_oficial` so existe se o ciclo estiver oficial e `ranking_habilitado` for verdadeiro.

- [ ] **Step 4: Limitar dados tecnicos ao bloco interno**

`auditoria` pode conter versao do contrato e horario, mas o renderer publico nunca imprime nomes de RPC, tabela, snapshot, migration ou funcao.

- [ ] **Step 5: Rodar GREEN**

Run:

```powershell
node --test `
  tests/relatorioCoordenacaoCanonico.test.mjs `
  tests/relatorioCoordenacaoCanonicoPostgres.test.mjs `
  tests/relatorioCoordenacaoRankingV3.test.mjs
```

Expected: PASS; PostgreSQL nao pode ficar `SKIP` no gate de rollout.

### Task 8: Cortar Edge e botao para a fonte canonica

**Files:**
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`
- Modify: `supabase/functions/_shared/health-score-v3.ts`
- Modify: `src/components/App/Professores/ModalRelatorioCoordenacao.tsx`
- Test: `tests/relatorioCoordenacaoCanonico.test.mjs`
- Test: `tests/clipboardCopySynchronousFallback.test.mjs`

- [ ] **Step 1: Fazer a Edge buscar o contrato com o JWT**

Contrato novo do botao:

```ts
interface RelatorioCoordenacaoRequest {
  unidade: string;
  ano: number;
  mes: number;
}
```

A Edge cria cliente Supabase com o `Authorization` recebido e chama `get_relatorio_coordenacao_canonico_v1`. Durante o rollout, pode extrair apenas unidade/ano/mes do payload legado para manter compatibilidade, mas deve descartar todos os numeros enviados pelo navegador.

- [ ] **Step 2: Restringir a IA a narrativa**

Enviar para a IA somente sinais ja calculados e pedir campos curtos: `resumo`, `conquistas`, `pontos_atencao`, `treinamentos`, `plano_acao`. Validar resposta; em falha, usar texto deterministico. A IA nao calcula score, media, contagem, taxa ou ranking.

- [ ] **Step 3: Renderizar o relatorio pedagogico rico**

Incluir resumo da equipe, mapa de sinais priorizado, todos os professores, pilares/evidencias, retencao/permanencia, presenca/cobertura, experimentais, carteira/carga, treinamentos, qualidade dos dados e plano de acao. Remover MRR e demais financeiros. Julho declara recesso e score parcial; ranking apenas em ciclo oficial.

- [ ] **Step 4: Remover termos tecnicos e paginacao artificial**

Bloquear no texto publico: `RPC`, `snapshot`, `migration`, `camada canonica`, `read model`, nomes `get_*`, `(1/2)` e `(2/2)`. Usar linguagem operacional: `dados oficiais do periodo`, `evidencia pendente`, `amostra insuficiente`.

- [ ] **Step 5: Simplificar o frontend**

Remover `buscarKpisHealthV3RelatorioCoordenacao`, agregacoes locais e envio de `dados`. Invocar a Edge apenas com filtros. Preservar selecao de periodo, modal, WhatsApp e copia.

```ts
await supabase.functions.invoke('gemini-relatorio-coordenacao', {
  body: { unidade: unidadeId, ano: anoRelatorio, mes: mesRelatorio },
});
```

- [ ] **Step 6: Garantir copia no Simple Browser/Chrome**

Usar `copyTextToClipboard` no clique direto, manter selecao manual visivel se falhar e executar o teste de fallback sincrono.

- [ ] **Step 7: Deno, testes, build e commit local**

Run:

```powershell
node --test `
  tests/relatorioCoordenacaoCanonico.test.mjs `
  tests/relatorioCoordenacaoCanonicoPostgres.test.mjs `
  tests/relatorioCoordenacaoRankingV3.test.mjs `
  tests/clipboardCopySynchronousFallback.test.mjs
deno check supabase/functions/gemini-relatorio-coordenacao/index.ts
npm run build
git diff --check
git add supabase/migrations/20260802192000_relatorio_coordenacao_canonico.sql supabase/functions/gemini-relatorio-coordenacao/index.ts supabase/functions/_shared/health-score-v3.ts src/components/App/Professores/ModalRelatorioCoordenacao.tsx tests/relatorioCoordenacaoCanonico.test.mjs tests/relatorioCoordenacaoCanonicoPostgres.test.mjs tests/relatorioCoordenacaoRankingV3.test.mjs
git commit -m "feat: tornar relatorio da coordenacao canonico"
```

### Task 9: Documentacao e regressao total do escopo

**Files:**
- Modify: `docs/HEALTH_SCORE_PROFESSOR_V3.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/superpowers/specs/2026-08-02-health-score-v3-coordenacao-design.md`
- Modify: `docs/superpowers/plans/2026-08-02-health-score-v3-coordenacao.md`

- [ ] **Step 1: Documentar a regra implantada**

Registrar nota versus diagnostico, pesos efetivos, amostra de conversao, confianca, capacidade por sala/turma, mapa de sinais, granularidade por unidade/curso/modalidade, laboratorio governado e papel limitado da IA.

- [ ] **Step 2: Marcar spec e plano como implementados somente depois dos testes**

Atualizar status e checkboxes com a evidencia real; nao marcar item baseado apenas em revisao de codigo.

- [ ] **Step 3: Rodar a suite dirigida**

Run:

```powershell
node --test `
  tests/healthScoreProfessorV3*.test.mjs `
  tests/professores*.test.mjs `
  tests/relatorioCoordenacao*.test.mjs `
  tests/fabioConsumidoresPedagogicosCanonicos.test.mjs `
  tests/laTeacher*.test.mjs `
  tests/clipboardCopySynchronousFallback.test.mjs
deno check supabase/functions/gemini-relatorio-coordenacao/index.ts
npm run build
git diff --check
```

Expected: todos os testes do escopo passam; warnings antigos de chunk do Vite podem permanecer documentados, sem erro de build.

- [ ] **Step 4: Conferir fronteiras de seguranca**

Confirmar que o relatorio nao contem financeiro; Fabio/LA Teacher nao recebem score bruto novo; RPCs de escrita exigem `professores.editar`; unidade nao autorizada falha; nenhum snapshot oficial fechado mudou.

- [ ] **Step 5: Commit de documentacao**

Run:

```powershell
git add docs/HEALTH_SCORE_PROFESSOR_V3.md docs/METRICAS.md docs/MAPA-SISTEMA.md docs/superpowers/specs/2026-08-02-health-score-v3-coordenacao-design.md docs/superpowers/plans/2026-08-02-health-score-v3-coordenacao.md
git commit -m "docs: consolidar governanca pedagogica do Health Score V3"
```

### Task 10: Rollout, smoke, PR e merge sem nova espera

**Files:**
- Deploy: `supabase/migrations/20260802190000_health_score_v3_nota_diagnostica.sql`
- Deploy: `supabase/migrations/20260802191000_health_score_v3_sinais_capacidade.sql`
- Deploy: `supabase/migrations/20260802192000_relatorio_coordenacao_canonico.sql`
- Deploy: `supabase/functions/gemini-relatorio-coordenacao/index.ts`

- [ ] **Step 1: Sincronizar com o remoto sem tocar em outros trabalhos**

Run:

```powershell
git fetch origin
git rebase origin/main
git status --short
git diff --name-only origin/main...HEAD
```

Expected: somente arquivos deste plano; conflitos fora do escopo interrompem o rollout e sao comunicados, nunca sobrescritos.

- [ ] **Step 2: Reexecutar todos os gates depois do rebase**

Repetir Task 9 Step 3 e o auditor junho/julho. Nenhum resultado anterior ao rebase vale como gate final.

- [ ] **Step 3: Aplicar backend aditivo no projeto correto**

Verificar project ref `ouqwbbermlzqqvtqwlul`, comparar hashes das tres migrations, aplicar somente essas migrations em ordem e confirmar no catalogo que as funcoes/colunas/grants esperados existem. Nao usar `db push` sobre o historico inteiro.

- [ ] **Step 4: Materializar somente revisoes parciais elegiveis**

Executar a materializacao governada para junho/julho apenas se o preflight confirmar que o snapshot alvo nao esta oficial/fechado. Se estiver fechado, manter imutavel e usar a leitura historica; registrar a decisao na auditoria.

- [ ] **Step 5: Deploy da Edge com compatibilidade de corte**

Run:

```powershell
supabase functions deploy gemini-relatorio-coordenacao --project-ref ouqwbbermlzqqvtqwlul
```

Validar tanto a chamada legado-compatibilidade quanto a chamada nova. Em ambas, comparar o hash do bloco numerico com a RPC canonica.

- [ ] **Step 6: Push, PR e checks**

Run:

```powershell
git push -u origin design/health-score-v3-coordenacao
gh pr create --base main --head design/health-score-v3-coordenacao --title "feat: publicar Health Score V3 e relatorio canonico da coordenacao" --body-file docs/superpowers/specs/2026-08-02-health-score-v3-coordenacao-design.md
gh pr checks --watch
```

Corrigir automaticamente somente falhas relacionadas ao diff; atualizar novamente com `origin/main` se ele avancar e repetir os gates.

- [ ] **Step 7: Mesclar e validar producao**

Com checks verdes:

```powershell
gh pr merge --merge --delete-branch
```

Aguardar deploy da `main`; abrir o dominio estavel autenticado; gerar Recreio junho e julho; verificar tabela V3, laboratorio, relatorio completo, ausencia de financeiro/termos tecnicos/paginacao e funcionamento de Copiar/WhatsApp.

- [ ] **Step 8: Entrega final objetiva**

Informar commit de merge, PR, migrations aplicadas, Edge implantada, deploy frontend, testes, smoke e qualquer ressalva real. Nao declarar producao concluida sem evidencia do dominio estavel.
