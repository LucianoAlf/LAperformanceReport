# Professores: ciclo vivo, Matriculador canônico e Cadastro leve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o ranking Matriculador contar matrículas comerciais canônicas, materializar diariamente o ciclo aberto e retirar a RPC pesada do Cadastro de Professores.

**Architecture:** A quantidade de matrículas comerciais será um dado operacional independente da métrica de conversão do Health Score. O ciclo aberto continuará sendo uma fotografia append-only, atualizada por jobs próprios e publicada como acompanhamento, nunca como ranking oficial. Cadastro lerá uma RPC protegida e leve de carteira/turmas, sem abrir a cadeia de presença.

**Tech Stack:** React/TypeScript, Supabase/PostgreSQL, pg_cron, Deno Edge Functions, Node test runner, PostgreSQL 17 em Docker.

---

## Arquivos e responsabilidades

- Criar: `supabase/migrations/20260908230249_professores_ciclo_vivo_matriculador_canonico.sql` — contrato de banco: Matriculador operacional, leitor leve do Cadastro, executor de ciclo e jobs isolados.
- Criar: `src/lib/professoresCadastroKpisCanonicos.ts` — adaptador tipado da RPC leve do Cadastro.
- Criar: `tests/professoresCicloVivoMatriculador.test.mjs` — regressões de apresentação, Valdo e ausência da chamada pesada.
- Criar: `tests/professoresCicloVivoMatriculadorPostgres.test.mjs` — fixture PostgreSQL para ACL, ciclo aberto, cron e contagem comercial.
- Criar: `docs/auditorias/2026-09-08-professores-ciclo-vivo-matriculador.md` — evidência nominal de Valdo e evidência operacional pós-carga.
- Modificar: `src/components/App/Professores/ProfessoresPage.tsx` — substituir as duas leituras de KPI do Cadastro pela RPC leve única.
- Modificar: `src/lib/relatorioCoordenacaoCanonico.ts` — ler `operacional.matriculas_comerciais` para Matriculador, preservando conversão como taxa separada.
- Modificar: `supabase/functions/gemini-relatorio-coordenacao/index.ts` — manter paridade com o relatório do navegador.
- Modificar: `supabase/functions/gemini-ranking-professores/index.ts` — evitar que a Edge legada volte a chamar conversão de “Matriculador”.
- Modificar: `src/lib/healthScoreProfessorV3Performance.ts` — trocar a mensagem genérica “Dados em auditoria” por estado explícito de retrato indisponível; valores reais continuam sendo mostrados quando houver snapshot.
- Modificar: testes existentes de snapshot/relatório que hoje esperam o contrato antigo de Matriculador e texto de auditoria.

### Task 1: Definir regressões antes de código de produção

**Files:**

- Create: `tests/professoresCicloVivoMatriculador.test.mjs`
- Create: `tests/professoresCicloVivoMatriculadorPostgres.test.mjs`
- Modify: `tests/relatorioCoordenacaoSnapshotCanonico.test.mjs`
- Modify: `tests/professoresPageKpisSobDemanda.test.mjs`
- Modify: `tests/healthScoreProfessorV3Performance.test.mjs`

- [x] **Step 1: Escrever a regressão nominal de Valdo no relatório**

```js
const valdo = professor('Valdo Delfino', {
  conversaoValor: 33.33,
  matriculasPosExperimental: 2,
  matriculasComerciais: 6,
});
const caio = professor('Caio Tenório de Araújo', {
  conversaoValor: 75,
  matriculasPosExperimental: 3,
  matriculasComerciais: 3,
});
assert.ok(blocoMatriculador.indexOf('Valdo Delfino') < blocoMatriculador.indexOf('Caio Tenório'));
assert.match(blocoMatriculador, /6 matrículas/i);
assert.ok(blocoConversao.indexOf('Caio Tenório') < blocoConversao.indexOf('Valdo Delfino'));
```

- [x] **Step 2: Escrever a regressão de contrato do Cadastro**

```js
assert.match(source, /buscarKpisProfessoresCadastroCanonicos\(filtroPeriodo\)/);
assert.doesNotMatch(source, /buscarKpisProfessoresCanonicos\(filtroPeriodo\)/);
assert.doesNotMatch(source, /buscarKpisTurmasCanonicos\(filtroPeriodo\)/);
assert.match(helper, /get_kpis_professores_cadastro_canonicos_v1/);
```

- [x] **Step 3: Escrever a regressão da cópia de ciclo aberto**

```sql
select public.executar_health_score_professor_v3_escopo_diario(
  date '2026-09-01', 'ciclo', 'unidade', '95553e96-971b-4590-a6eb-0201d013c14d'::uuid
);
select assert_equals('ciclo_em_acompanhamento', estado_publicacao);
select assert_equals(false, ranking_habilitado);
select assert_equals('2026-SET-NOV', ciclo_codigo);
```

O teste deve provar repetição idempotente, revisar somente se o fingerprint mudar, aceitar as três unidades e consolidado, e verificar que os quatro jobs de ciclo usam wrapper separado dos jobs mensais.

- [x] **Step 4: Escrever a regressão de ACL e valor canônico**

```sql
set local role authenticated;
select * from public.get_kpis_professores_cadastro_canonicos_v1(2026, 9, '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, '2026-09-01', '2026-11-30');
-- usuário sem professores.ver deve receber 42501.

select professor_id, matriculas_comerciais
from public.get_relatorio_coordenacao_canonico_v3('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 2026, 8, 'ciclo');
-- fixture: Valdo = 6; Caio = 3.
```

- [x] **Step 5: Rodar os testes novos em vermelho**

Run:

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
node --test tests/professoresCicloVivoMatriculador.test.mjs tests/professoresCicloVivoMatriculadorPostgres.test.mjs
```

Expected: falha por ausência de `matriculas_comerciais`, executor `ciclo` rejeitado e Cadastro ainda chamando `get_kpis_professor_periodo_canonico_v3`.

### Task 2: Implementar a migration aditiva do banco

**Files:**

- Modify: `supabase/migrations/20260908230249_professores_ciclo_vivo_matriculador_canonico.sql`

- [x] **Step 1: Criar o leitor leve protegido do Cadastro**

```sql
create or replace function public.get_kpis_professores_cadastro_canonicos_v1(
  p_ano integer, p_mes integer, p_unidade_id uuid,
  p_data_inicio date default null, p_data_fim date default null
)
returns table (
  professor_id integer, unidade_id uuid, carteira_alunos integer,
  total_turmas integer, alunos_via_turmas integer,
  turmas_elegiveis_media integer, media_alunos_turma numeric
)
language plpgsql stable security definer set search_path = public, pg_temp;
```

Replicar as verificações de identidade/permissão de `get_kpis_turmas_canonicos_v2`, resolver o escopo efetivo e chamar `get_carteira_professor_periodo_canonica` uma vez. Revogar `PUBLIC`, `anon` e `authenticated` antes de conceder somente `authenticated` e `service_role`.

- [x] **Step 2: Acrescentar matrículas comerciais ao payload da Coordenação**

```sql
with matriculas_comerciais_por_professor as (
  select a.professor_experimental_id as professor_id, count(*)::integer as matriculas_comerciais
  from public.matriculas_comerciais_v1(
    v_unidade_id,
    v_periodo_inicio,
    v_periodo_fim + 1
  ) m
  join public.alunos a on a.id = m.aluno_id
  where m.conta and a.professor_experimental_id is not null
  group by a.professor_experimental_id
)
```

Aplicar o recorte de unidade no mesmo universo da função comercial, injetar `matriculas_comerciais` em `operacional` por professor e manter `metricas.conversao` intacta. O patch deve falhar fechado se o corpo vivo do payload divergir, como as migrations de relatório já fazem.

- [x] **Step 3: Generalizar o executor diário para ciclo aberto**

```sql
check (periodicidade in ('mensal', 'ciclo'));
```

Aceitar `mensal` apenas para o mês aberto e `ciclo` apenas para o ciclo aberto que contém a competência. Preservar advisory locks por `competência + periodicidade + escopo`, fingerprints, seis métricas, configurações imutáveis, snapshots append-only e estado retornado pelo produtor. Não alterar fórmulas, pesos, snapshots fechados ou `ranking_habilitado=false` do ciclo aberto.

- [x] **Step 4: Criar jobs de ciclo isolados e escalonados**

```sql
select cron.schedule(
  format('materializar-health-score-professor-v3-ciclo-unidade-%s', v_unidade.id),
  v_horario,
  format(
    $$select public.executar_health_score_professor_v3_job_ciclo_escopo('unidade', %L::uuid);$$,
    v_unidade.id
  )
);
```

Criar três jobs de unidade e um consolidado, depois dos jobs mensais e sem ultrapassar a concorrência recomendada. O wrapper deve registrar alertas/erros no mesmo formato existente e não chamar a rotina mensal.

- [x] **Step 5: Rodar os testes PostgreSQL e de migração em verde**

Run:

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
node --test tests/professoresCicloVivoMatriculadorPostgres.test.mjs tests/healthScoreProfessorV3CronIsoladoPostgres.test.mjs
```

Expected: todos passam; nenhuma referência nova a `statement_timeout`.

### Task 3: Ligar consumidores ao contrato correto

**Files:**

- Create: `src/lib/professoresCadastroKpisCanonicos.ts`
- Modify: `src/components/App/Professores/ProfessoresPage.tsx`
- Modify: `src/lib/relatorioCoordenacaoCanonico.ts`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`
- Modify: `supabase/functions/gemini-ranking-professores/index.ts`
- Modify: `src/lib/healthScoreProfessorV3Performance.ts`

- [x] **Step 1: Criar adaptador leve do Cadastro**

```ts
const { data, error } = await supabase.rpc('get_kpis_professores_cadastro_canonicos_v1', {
  p_ano: filtro.ano,
  p_mes: filtro.mes,
  p_unidade_id: filtro.unidadeId === 'todos' ? null : filtro.unidadeId,
  p_data_inicio: filtro.dataInicio ?? null,
  p_data_fim: filtro.dataFim ?? null,
});
```

Normalizar somente carteira, total de turmas, ocupações, denominador e média. Não importar ou simular campos financeiros, conversão, retenção ou presença.

- [x] **Step 2: Trocar Cadastro para a leitura única**

```ts
const kpisCadastro = carregarKpisCadastro
  ? await buscarKpisProfessoresCadastroCanonicos(filtroPeriodo)
  : [];
```

Construir os três mapas visíveis a partir de `kpisCadastro`, sem `Promise.all` que abra a RPC ampla e a RPC de turmas em paralelo.

- [x] **Step 3: Corrigir Matriculador nos três renderizadores**

```ts
extrairValor: (professor) => numeroOuNull(professor.operacional?.matriculas_comerciais),
```

Preservar `conversao` como indicador separado, com sua taxa e amostra próprias. Atualizar tipos de payload de navegador e das duas Edge Functions.

- [x] **Step 4: Remover o rótulo genérico de auditoria**

```ts
fonte_canonica_indisponivel: 'Sem retrato disponível para o período',
fonte_em_auditoria: 'Sem retrato disponível para o período',
```

Não usar esse fallback para um snapshot presente. Métricas sem base real devem continuar com seus motivos específicos, como “não realizou experimental no período”.

- [x] **Step 5: Rodar testes unitários em verde**

Run:

```powershell
node --test tests/professoresCicloVivoMatriculador.test.mjs tests/relatorioCoordenacaoSnapshotCanonico.test.mjs tests/professoresPageKpisSobDemanda.test.mjs tests/healthScoreProfessorV3Performance.test.mjs
```

Expected: Valdo fica primeiro com 6 no Matriculador, Caio mantém 3, conversão continua independente e Cadastro não invoca a RPC V3 ampla.

### Task 4: Validar, publicar e carregar o ciclo em produção

**Files:**

- Create: `docs/auditorias/2026-09-08-professores-ciclo-vivo-matriculador.md`

- [x] **Step 1: Executar verificações locais completas**

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
npm test
npm run build
deno check supabase/functions/gemini-relatorio-coordenacao/index.ts
git diff --check
```

- [x] **Step 2: Conferir o ledger remoto antes da migration**

Verificar que `20260908230249_professores_ciclo_vivo_matriculador_canonico` é posterior ao último ledger remoto e que não houve migration concorrente. Não usar `--include-all`.

- [x] **Step 3: Aplicar a migration e carregar Set–Nov**

Executar a migration somente após a suíte verde. Rodar uma vez, como `service_role`, os quatro escopos de `2026-09-01 / ciclo`: Barra, Campo Grande, Recreio e consolidado. Confirmar `estado_publicacao='ciclo_em_acompanhamento'`, `ranking_habilitado=false` e snapshots para o roster ativo.

- [ ] **Step 4: Publicar as Edge Functions e o frontend**

Fazer deploy de `gemini-relatorio-coordenacao` e `gemini-ranking-professores` com a configuração de JWT já vigente; ligar explicitamente o worktree ao projeto Vercel `la-performance-report` antes do deploy de produção.

- [ ] **Step 5: Validar produção com dados reais**

Confirmar por SQL: Valdo Delfino = 6 e Caio Tenório = 3 no relatório de Campo Grande Jun–Ago; snapshots Set–Nov existem nos quatro escopos; o leitor do Cadastro retorna sob o teto de timeout. Confirmar no navegador autenticado que o ciclo deixa de exibir “Dados em auditoria”, o relatório ordena a equipe pelo painel e o console não recebe `57014` ao abrir Cadastro.

- [ ] **Step 6: Registrar a auditoria e integrar**

Documentar a lista nominal de Valdo, a regra comercial, o horário da carga inicial e os resultados de produção. Fazer commit, push para `main` e confirmar deployment Ready antes de comunicar conclusão.

## Revisão do plano

- Cobertura: Matriculador, seis registros de Valdo, ciclo vivo, carga inicial, UI sem texto de auditoria, timeout do Cadastro, Edge Functions, cron, ACL, build, Deno e produção estão incluídos.
- Integridade: não há alteração de fórmula/ponderação de Health Score, nem escrita em Emusys, nem reescrita de snapshot fechado.
- Risco: o ledger remoto já contém migrations posteriores ao checkout; a etapa de preflight impede aplicação fora de ordem e exige reconciliação antes de qualquer write remoto.
