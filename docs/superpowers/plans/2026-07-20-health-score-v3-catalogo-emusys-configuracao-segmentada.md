# Health Score V3 Catalogo Emusys e Configuracao Segmentada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir inferencias de curso/modalidade por um catalogo oficial sincronizado do Emusys, materializar automaticamente os vinculos professor-unidade-curso de alta confianca e oferecer uma configuracao V3 governada, editavel e aderente ao Design System, sem alterar os valores canonicos ja validados nem os consumidores ainda nao migrados.

**Architecture:** A implementacao e aditiva. Uma Edge Function focada coleta catalogo e atribuicoes formais por unidade em tabelas brutas privadas e finaliza apenas execucoes completas. Uma materializacao V2 resolve IDs locais, combina atribuicao formal com jornada ativa e publica somente excecoes reais. A configuracao passa a receber o catalogo oficial como matriz de edicao, mantendo regra ausente como ausencia de linha persistida. O frontend troca controles nativos por componentes Radix do Design System e separa salvar rascunho incompleto de simular/ativar configuracao completa. A fila V1 e a configuracao ativa permanecem disponiveis para rollback ate o cutover validado.

**Tech Stack:** Supabase/PostgreSQL, Supabase Edge Functions com Deno/TypeScript, React 19, TypeScript, Vite, Radix UI, Node test runner, Playwright/navegador autenticado e API Emusys.

**Design aprovado:** `docs/superpowers/specs/2026-07-20-health-score-v3-catalogo-emusys-e-configuracao-segmentada-design.md`

---

## Regras de execucao

- Trabalhar no checkout principal atual; nao criar worktree.
- Antes de cada conjunto de commits, executar `git fetch origin` e inspecionar `HEAD..origin/main` sem descartar alteracoes locais.
- Nao usar `git add .`; adicionar apenas os arquivos listados na tarefa.
- Escrever o teste que falha antes da alteracao funcional.
- Aplicar migrations de forma individual e na ordem deste plano. Nao executar `supabase db push` indiscriminadamente.
- Na primeira rodada do sync, coletar em modo diagnostico. Nao materializar nem encerrar vinculos antes do Gate de dados.
- Uma execucao parcial ou falha nunca pode marcar catalogo, atribuicao ou vinculo como inativo.
- `aulas_emusys.tipo` nao decide modalidade e nao abre conflito contra catalogo/jornada.
- `professores_cursos` nao cria vinculo vigente e nao aparece na fila operacional.
- Nao alterar formulas de carteira, media/turma, conversao, permanencia, retencao ou presenca.
- Nao alterar relatorios gerencial, administrativo, comercial, Dashboard, Analytics, churn ou Random Forest.
- Nao escrever em `aulas_emusys`, `aluno_presenca` ou `anotacoes_fabio`.
- Nao ativar configuracao, migrar consumidor produtivo ou revogar a V1 antes do Gate final de homologacao.
- Toda escrita do navegador passa por RPC ou Edge Function com guard `professores.editar` por unidade.
- `public`, `anon` e `authenticated` nao recebem acesso direto as tabelas brutas.
- Se catalogo Emusys, jornada e de-para local divergirem sem regra aprovada, registrar uma excecao; nao adivinhar por nome.

## Invariantes canonicos

1. A identidade de origem e `unidade_id + emusys_id`; IDs Emusys nao sao globais.
2. Modalidade oficial vem de `GET /disciplinas?tipo=turma|individual`.
3. Atribuicao formal vem de `GET /professores?curso_id={emusys_disciplina_id}`.
4. Jornada ativa confirma vinculo pedagogico, mas nao muda a modalidade do catalogo.
5. Aula informa execucao, substituicao e historico; nunca modalidade curricular.
6. Curso formal com zero alunos permanece visivel e nao penaliza o professor.
7. Historico revisado nao e reescrito nem apagado.
8. Regra segmentada ausente e exibida vazia e permanece ausente no banco.
9. Salvar rascunho incompleto e permitido; simular e ativar exigem matriz oficial completa.
10. Configuracao ativa e snapshot fechado continuam imutaveis.

## Mapa de arquivos

### Banco e Edge Functions

- Create: `supabase/migrations/20260720120000_emusys_catalogo_professor_disciplinas.sql`
- Create: `supabase/migrations/20260720121000_professor_curso_modalidade_catalogo_v2.sql`
- Create: `supabase/migrations/20260720122000_health_score_v3_catalogo_segmentos_config.sql`
- Create: `supabase/migrations/20260720123000_cron_sync_professor_disciplinas_emusys.sql`
- Create: `supabase/migrations/20260720124000_professor_curso_modalidade_v2_cutover.sql`
- Create: `supabase/functions/_shared/emusys-professor-disciplinas.ts`
- Create: `supabase/functions/_shared/emusys-professor-disciplinas.test.ts`
- Create: `supabase/functions/sync-professor-disciplinas-emusys/index.ts`
- Modify: `supabase/config.toml`

### Frontend

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/components/ui/slider.tsx`
- Create: `src/components/ui/collapsible.tsx`
- Modify: `src/lib/healthScoreProfessorV3.ts`
- Modify: `src/hooks/useHealthScoreProfessorV3Config.ts`
- Modify: `src/hooks/useProfessorCursoModalidadeReconciliacao.ts`
- Modify: `src/components/App/Professores/HealthScoreV3Config.tsx`
- Modify: `src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx`
- Modify: `src/components/App/Professores/ProfessorCursoModalidadeReconciliacao.tsx`

### Testes e auditoria

- Create: `tests/emusysProfessorDisciplinasSchema.test.mjs`
- Create: `tests/professorCursoModalidadeCatalogoV2.test.mjs`
- Create: `tests/healthScoreProfessorV3CatalogoConfig.test.mjs`
- Create: `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`
- Modify: `tests/professorCursoModalidadeCanonico.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigSegmentada.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs`
- Create: `docs/auditorias/2026-07-20-health-score-v3-catalogo-emusys-baseline.md`
- Create: `docs/auditorias/2026-07-20-health-score-v3-catalogo-emusys-rollout.md`

---

## Preflight e baseline

- [ ] Executar e registrar:

```powershell
git status --short --branch
git fetch origin
git log --oneline --decorate HEAD..origin/main
git log --oneline --decorate origin/main..HEAD
```

Expected: a arvore e os commits locais/remotos sao conhecidos antes de qualquer edicao. Se houver commit remoto, integrar primeiro e repetir o baseline.

- [ ] Rodar o baseline automatizado:

```powershell
node --test tests/professorCursoModalidadeCanonico.test.mjs
node --test tests/healthScoreProfessorV3ConfigSegmentada.test.mjs
node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
node --test tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs
npm run build
deno --version
```

Expected: testes e build atuais passam; Deno esta disponivel. Falha preexistente deve ser registrada antes de continuar.

- [ ] Salvar em `docs/auditorias/2026-07-20-health-score-v3-catalogo-emusys-baseline.md`:
  - definicoes vivas de `fn_professor_curso_modalidade_evidencias_v1`, `reconciliar_professor_curso_modalidade_v1`, `get_professor_curso_modalidade_reconciliacao_v1` e `get_health_score_professor_v3_config_ui` por `pg_get_functiondef`;
  - contagem atual por `estado`, `fonte` e `confianca` da fila V1;
  - contagem de metas configuradas, nao ofertadas e segmentos observados sem regra;
  - os valores observados atuais de carteira e media/turma para junho e julho, sem escrita;
  - consumidores de cada RPC encontrados por `rg`.

- [ ] Confirmar semanticamente o baseline esperado da auditoria de 20/07: 182 conflitos falsos de modalidade, 75 pistas legadas e 3 jornadas de alta confianca ainda nao materializadas. Se a contagem tiver mudado, registrar a nova fotografia; o aceite continua sendo zero falsos conflitos/pistas legadas na fila operacional e materializacao de todas as pendencias de alta confianca resolviveis.

---

## Task 1: Congelar o contrato novo com testes falhando

**Files:**
- Create: `tests/emusysProfessorDisciplinasSchema.test.mjs`
- Create: `tests/professorCursoModalidadeCatalogoV2.test.mjs`
- Create: `tests/healthScoreProfessorV3CatalogoConfig.test.mjs`
- Create: `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`
- Create: `docs/auditorias/2026-07-20-health-score-v3-catalogo-emusys-baseline.md`

- [ ] **Step 1: Escrever o contrato estrutural do catalogo bruto**

Em `tests/emusysProfessorDisciplinasSchema.test.mjs`, exigir:

```js
assert.match(schema, /create table if not exists public\.emusys_disciplinas_catalogo/i);
assert.match(schema, /unique\s*\(\s*unidade_id\s*,\s*emusys_disciplina_id\s*\)/i);
assert.match(schema, /create table if not exists public\.emusys_professor_disciplinas/i);
assert.match(schema, /unique\s*\(\s*unidade_id\s*,\s*emusys_professor_id\s*,\s*emusys_disciplina_id\s*\)/i);
assert.match(schema, /create table if not exists public\.emusys_professor_disciplinas_sync_execucoes/i);
assert.match(schema, /alter table public\.emusys_disciplinas_catalogo enable row level security/i);
assert.doesNotMatch(schema, /grant\s+(?:select|insert|update|delete)[\s\S]*authenticated/i);
```

Tambem exigir execucao completa antes de inativacao, advisory lock por unidade, hash de payload e RPC finalizadora service-only.

- [ ] **Step 2: Escrever o contrato da materializacao V2**

Em `tests/professorCursoModalidadeCatalogoV2.test.mjs`, exigir:

```js
assert.match(sql, /fn_professor_curso_modalidade_evidencias_v2/i);
assert.match(sql, /reconciliar_professor_curso_modalidade_v2/i);
assert.match(sql, /get_professor_curso_modalidade_excecoes_v2/i);
assert.doesNotMatch(evidenceFunction, /aulas_emusys\.tipo/i);
assert.doesNotMatch(operationalQueue, /professores_cursos/i);
assert.match(sql, /fonte\s*=\s*'emusys'/i);
```

- [ ] **Step 3: Escrever o contrato da configuracao catalog-driven**

Em `tests/healthScoreProfessorV3CatalogoConfig.test.mjs`, exigir que `get_health_score_professor_v3_config_ui` retorne `catalogo_segmentos`, que salvar aceite ausencia de linhas, e que simular/ativar bloqueiem segmento oficial sem meta ou estado `nao_ofertada`.

- [ ] **Step 4: Escrever o contrato frontend**

Em `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`, exigir:

```js
assert.doesNotMatch(configSource, /type=["']range["']/i);
assert.doesNotMatch(configSource, /type=["']date["']/i);
assert.doesNotMatch(configSource + goalsSource + exceptionsSource, /<select\b/i);
assert.doesNotMatch(configSource + exceptionsSource, /window\.confirm/i);
assert.match(typesSource, /HealthScoreV3CatalogSegment/);
assert.match(typesSource, /estado:\s*'nao_configurada'/);
assert.match(exceptionsSource, /Excecoes de vinculos Emusys/);
```

Acrescentar testes comportamentais puros para:
- montar linhas vazias sem persistir zeros;
- nao marcar dirty durante load;
- serializar somente `configurada` e `nao_ofertada`;
- permitir save parcial;
- bloquear simulacao/ativacao quando faltar regra oficial;
- manter conciliacao habilitada durante edicao de metas.

- [ ] **Step 5: Confirmar RED**

```powershell
node --test tests/emusysProfessorDisciplinasSchema.test.mjs
node --test tests/professorCursoModalidadeCatalogoV2.test.mjs
node --test tests/healthScoreProfessorV3CatalogoConfig.test.mjs
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
```

Expected: FAIL porque migrations, tipos e componentes novos ainda nao existem.

- [ ] **Step 6: Commit do contrato de testes**

```powershell
git add -- tests/emusysProfessorDisciplinasSchema.test.mjs tests/professorCursoModalidadeCatalogoV2.test.mjs tests/healthScoreProfessorV3CatalogoConfig.test.mjs tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs docs/auditorias/2026-07-20-health-score-v3-catalogo-emusys-baseline.md
git commit -m "test: definir contrato do catalogo Emusys v3"
```

---

## Task 2: Criar as tabelas privadas e a finalizacao atomica do sync

**Files:**
- Create: `supabase/migrations/20260720120000_emusys_catalogo_professor_disciplinas.sql`
- Modify: `tests/emusysProfessorDisciplinasSchema.test.mjs`

- [ ] **Step 1: Completar os testes de schema**

Exigir os campos abaixo:

```text
emusys_disciplinas_catalogo
  unidade_id, emusys_disciplina_id, nome_emusys, modalidade,
  ativo_origem, primeiro_visto_em, ultimo_visto_em, sincronizado_em,
  ultima_execucao_id, payload_snapshot, hash_payload

emusys_professor_disciplinas
  unidade_id, emusys_professor_id, emusys_disciplina_id,
  ativo_origem, primeiro_visto_em, ultimo_visto_em, sincronizado_em,
  ultima_execucao_id, payload_snapshot, hash_payload

emusys_professor_disciplinas_sync_execucoes
  id, unidade_id, origem, status, iniciado_em, finalizado_em,
  disciplinas_esperadas, disciplinas_processadas, requisicoes,
  falhas, estatisticas, solicitado_por
```

Checks:
- modalidade `individual|turma`;
- origem `manual|cron`;
- status `em_andamento|completa|falhou`;
- payload permitido sem nome de aluno, telefone ou e-mail;
- FKs `on delete restrict`;
- indices por unidade/ativo e execucao;
- RLS sem policies de navegador.

- [ ] **Step 2: Confirmar falha focada**

```powershell
node --test tests/emusysProfessorDisciplinasSchema.test.mjs
```

Expected: FAIL nos objetos ainda ausentes.

- [ ] **Step 3: Implementar a migration**

Criar as tres tabelas e a RPC:

```sql
public.finalizar_sync_professor_disciplinas_emusys_v1(
  p_execucao_id uuid
) returns jsonb
```

A RPC deve:
1. exigir `service_role` ou `postgres`;
2. travar `pg_advisory_xact_lock` por unidade;
3. recusar execucao que nao esteja `em_andamento`;
4. validar `disciplinas_processadas = disciplinas_esperadas` e `falhas = []`;
5. marcar como inativos apenas registros ausentes da execucao completa daquela unidade;
6. marcar a execucao `completa`;
7. retornar estatisticas sem dados pessoais;
8. nao chamar ainda a materializacao V2, que so sera conectada no Task 4.

- [ ] **Step 4: Fixar grants**

```sql
revoke all on table public.emusys_disciplinas_catalogo from public, anon, authenticated;
revoke all on table public.emusys_professor_disciplinas from public, anon, authenticated;
revoke all on table public.emusys_professor_disciplinas_sync_execucoes from public, anon, authenticated;
revoke all on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid)
  to service_role;
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
node --test tests/emusysProfessorDisciplinasSchema.test.mjs
node --test tests/healthScoreProfessorV3MetasSegmentadasSecurity.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- supabase/migrations/20260720120000_emusys_catalogo_professor_disciplinas.sql tests/emusysProfessorDisciplinasSchema.test.mjs
git commit -m "feat: criar catalogo privado de disciplinas Emusys"
```

---

## Task 3: Implementar parser puro e Edge Function retomavel

**Files:**
- Create: `supabase/functions/_shared/emusys-professor-disciplinas.ts`
- Create: `supabase/functions/_shared/emusys-professor-disciplinas.test.ts`
- Create: `supabase/functions/sync-professor-disciplinas-emusys/index.ts`
- Modify: `supabase/config.toml`
- Modify: `tests/emusysProfessorDisciplinasSchema.test.mjs`

- [ ] **Step 1: Criar fixtures anonimas dentro do teste Deno**

Cobrir payload no topo e dentro das chaves `disciplinas`/`professores`, IDs numericos ou strings numericas, nomes opcionais, duplicata idempotente e payload invalido. O parser deve retornar somente:

```ts
type DisciplinaCatalogo = {
  emusysDisciplinaId: number;
  nomeEmusys: string;
  modalidade: 'individual' | 'turma';
  payloadSnapshot: { id: number; nome: string; tipo: 'individual' | 'turma' };
};

type ProfessorDisciplina = {
  emusysProfessorId: number;
  nomeEmusys: string;
  payloadSnapshot: { id: number; nome: string };
};
```

- [ ] **Step 2: Confirmar RED no parser**

```powershell
deno test supabase/functions/_shared/emusys-professor-disciplinas.test.ts
```

Expected: FAIL porque o helper ainda nao existe.

- [ ] **Step 3: Implementar helpers puros**

Exportar:

```ts
parseDisciplinasCatalogo(payload, modalidade)
parseProfessoresDisciplina(payload)
assertCatalogosDisjuntos(turma, individual)
hashPayloadAllowlist(snapshot)
waitForRateLimit(headers, fallbackDelayMs)
```

`assertCatalogosDisjuntos` deve listar IDs conflitantes e impedir a finalizacao. O hash deve usar JSON com chaves ordenadas e `crypto.subtle.digest('SHA-256', ...)`.

- [ ] **Step 4: Implementar a Edge Function por uma unidade**

Contrato de request:

```json
{
  "unidade_id": "uuid",
  "origem": "manual",
  "modo": "diagnostico"
}
```

Fluxo:
1. tratar `OPTIONS`;
2. autorizar cron por `x-sync-token` ou usuario por JWT;
3. para JWT, obter usuario e chamar uma RPC guardada de permissao para `professores.editar` naquela unidade;
4. criar execucao `em_andamento`;
5. buscar `/disciplinas?tipo=turma` e `/disciplinas?tipo=individual`;
6. validar catalogos disjuntos;
7. upsert catalogo bruto por chave natural;
8. para cada disciplina, buscar `/professores?curso_id=N` com retry/backoff e ritmo de 45-50 requisicoes/minuto;
9. upsert atribuicoes brutas;
10. finalizar a execucao somente se todas as disciplinas forem processadas;
11. em falha, marcar `falhou` sem inativar nada;
12. retornar `execucao_id`, contagens, erros e duracao.

Usar secrets:

```text
EMUSYS_TOKEN_CG
EMUSYS_TOKEN_BARRA
EMUSYS_TOKEN_RECREIO
SYNC_PROFESSOR_DISCIPLINAS_TOKEN
```

Implementar comparacao constante do token por helper local. Nunca registrar tokens ou payload integral de professores em logs.

- [ ] **Step 5: Configurar gateway explicitamente**

Adicionar em `supabase/config.toml`:

```toml
[functions.sync-professor-disciplinas-emusys]
verify_jwt = false
```

O `verify_jwt=false` e deliberado porque o mesmo endpoint atende cron por secret e navegador por JWT; a Edge Function deve rejeitar toda chamada que nao passe em um desses dois guards.

- [ ] **Step 6: Confirmar GREEN e type-check Deno**

```powershell
deno test supabase/functions/_shared/emusys-professor-disciplinas.test.ts
deno check supabase/functions/sync-professor-disciplinas-emusys/index.ts
node --test tests/emusysProfessorDisciplinasSchema.test.mjs
```

Expected: PASS.

- [x] **Step 7: Commit**

```powershell
git add -- supabase/functions/_shared/emusys-professor-disciplinas.ts supabase/functions/_shared/emusys-professor-disciplinas.test.ts supabase/functions/sync-professor-disciplinas-emusys/index.ts supabase/config.toml tests/emusysProfessorDisciplinasSchema.test.mjs
git commit -m "feat: sincronizar disciplinas e professores do Emusys"
```

---

## Gate 1: Coleta diagnostica

- [x] Aplicar apenas `20260720120000_emusys_catalogo_professor_disciplinas.sql`.
- [x] Configurar o secret dedicado e implantar a Edge Function.
- [x] Executar `modo=diagnostico` primeiro em Barra, depois Recreio, depois Campo Grande.
- [x] Conferir por SELECT:
  - IDs de disciplina nao se repetem entre modalidades na mesma unidade;
  - contagem do catalogo coincide com a resposta bruta da API;
  - atribuicoes formais possuem professor e disciplina de origem;
  - nenhuma linha existente em `professor_unidade_curso_modalidade` mudou;
  - nenhuma execucao parcial inativou registro;
  - nenhum dado pessoal desnecessario entrou nos snapshots.
- [x] Registrar as contagens e amostras anonimizadas no relatorio de rollout.

Expected: catalogo bruto reproduzivel para as tres unidades, sem efeito no Health Score ou na fila V1.

---

## Task 4: Criar materializacao V2 e fila de excecoes reais

**Files:**
- Create: `supabase/migrations/20260720121000_professor_curso_modalidade_catalogo_v2.sql`
- Modify: `tests/professorCursoModalidadeCatalogoV2.test.mjs`
- Modify: `tests/professorCursoModalidadeCanonico.test.mjs`
- Modify: `tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs`

- [x] **Step 1: Completar testes de precedencia e temporalidade**

Cobrir:
1. catalogo turma + aula `tipo=individual` continua turma e nao abre excecao;
2. catalogo + atribuicao formal + IDs resolvidos materializa confianca alta;
3. catalogo + jornada ativa materializa confianca alta e registra alerta se formal ausente;
4. professor formal com zero alunos permanece ativo;
5. aula de substituto nao troca titular;
6. pista legada nao entra na fila operacional;
7. sync parcial nao encerra;
8. sync completo encerra somente atribuicao automatica ausente de formal e jornada;
9. linha `revisao` ou `manual` nao e encerrada automaticamente;
10. historico encerrado/revisado e preservado.

- [x] **Step 2: Confirmar RED**

```powershell
node --test tests/professorCursoModalidadeCatalogoV2.test.mjs
node --test tests/professorCursoModalidadeCanonico.test.mjs
```

Expected: FAIL nas funcoes V2.

- [x] **Step 3: Estender a origem temporal sem reescrever a migration antiga**

Na migration nova, substituir o check de `fonte` para aceitar:

```text
manual, jornada, aula, revisao, emusys
```

Nao alterar linhas historicas e nao apagar `aula`/`jornada` existentes.

- [x] **Step 4: Implementar evidencia V2**

Criar:

```sql
public.fn_professor_curso_modalidade_evidencias_v2(
  p_data_referencia date,
  p_unidade_id uuid default null,
  p_professor_id integer default null
) returns table (...)
```

Precedencia:
1. modalidade de `emusys_disciplinas_catalogo` ativa;
2. `curso_emusys_depara` para curso local;
3. `professores_unidades` para professor local por unidade e Emusys ID;
4. `emusys_professor_disciplinas` para atribuicao formal;
5. `aluno_jornada_matricula_disciplina` para confirmacao ativa;
6. `aulas_emusys` apenas como evidencia de execucao/substituicao, sem ler `tipo` para modalidade.

- [x] **Step 5: Implementar materializador V2**

Criar:

```sql
public.reconciliar_professor_curso_modalidade_v2(
  p_execucao_id uuid
) returns jsonb
```

Regras:
- service-only;
- execucao deve estar completa;
- advisory lock por unidade;
- upsert idempotente por grao ativo;
- `fonte='emusys'`, `confianca='alta'` para resolucao automatica;
- manter o menor `vigencia_inicio` confirmado;
- encerrar somente linha automatica ausente do formal e da jornada em execucao completa;
- nunca atualizar chave ou periodo encerrado;
- retornar criados, mantidos, encerrados e excecoes.

Conectar a chamada ao final de `finalizar_sync_professor_disciplinas_emusys_v1` somente depois de a execucao estar marcada completa.

- [x] **Step 6: Implementar fila V2**

Criar:

```sql
public.get_professor_curso_modalidade_excecoes_v2(
  p_unidade_id uuid default null,
  p_professor_id integer default null,
  p_incluir_auditoria boolean default false
) returns table (...)
```

Por padrao, retornar somente:
- professor Emusys sem identidade local;
- disciplina sem de-para;
- disciplina em jornada ausente do catalogo apos execucao completa;
- contradicao persistente formal/jornada;
- mesmo ID em duas modalidades;
- sobreposicao temporal nao resolvida.

Quando `p_incluir_auditoria=true`, acrescentar resolvidos/historicos em conjunto identificado como auditoria, sem misturar com o contador acionavel. Nunca incluir `professores_cursos`.

- [x] **Step 7: Fixar seguranca**

- view/funcoes internas service-only;
- fila `security definer`, `search_path = public, pg_temp`;
- guard `professores.editar` por cada unidade retornada;
- `public`/`anon` revogados;
- `authenticated` recebe apenas a fila guardada, nao o materializador.

- [x] **Step 8: Confirmar GREEN**

```powershell
node --test tests/professorCursoModalidadeCatalogoV2.test.mjs
node --test tests/professorCursoModalidadeCanonico.test.mjs
node --test tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
node --test tests/healthScoreProfessorV3MetasSegmentadasSecurity.test.mjs
```

Expected: PASS.

- [x] **Step 9: Commit**

```powershell
git add -- supabase/migrations/20260720121000_professor_curso_modalidade_catalogo_v2.sql tests/professorCursoModalidadeCatalogoV2.test.mjs tests/professorCursoModalidadeCanonico.test.mjs tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
git commit -m "feat: materializar vinculos Emusys com evidencia v2"
```

---

## Gate 2: Materializacao controlada

- [x] Aplicar `20260720121000_professor_curso_modalidade_catalogo_v2.sql`.
- [x] Rodar primeiro a funcao de evidencias V2 em SELECT e comparar com a V1.
- [x] Confirmar que os falsos conflitos por `aulas.tipo` sao zero na V2.
- [x] Confirmar que pistas de `professores_cursos` sao zero na fila operacional V2.
- [x] Rodar materializacao somente na Barra e conferir manualmente uma amostra com catalogo, jornada e vinculo temporal.
- [x] Repetir no Recreio e Campo Grande.
- [x] Confirmar que todas as pendencias de jornada alta resolviveis foram materializadas.
- [x] Confirmar que professor formal com zero alunos aparece como vinculo ativo, mas nao recebe nota ou penalizacao sem valor observado.
- [x] Confirmar que V1 e consumidores atuais continuam retornando o mesmo contrato.

Expected: V2 pronta e reproduzivel, sem cutover de frontend.

---

## Task 5: Tornar a configuracao orientada pelo catalogo oficial

**Files:**
- Create: `supabase/migrations/20260720122000_health_score_v3_catalogo_segmentos_config.sql`
- Modify: `tests/healthScoreProfessorV3CatalogoConfig.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigSegmentada.test.mjs`
- Modify: `tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs`

- [x] **Step 1: Escrever os cenarios SQL que faltam**

Exigir:
- `catalogo_segmentos` vem do catalogo Emusys resolvido, nao de agregados de aula;
- uma combinacao oficial sem meta aparece no catalogo com `estado_regra='nao_configurada'`;
- salvar lista vazia ou parcial mantem ausencias como ausencia de linha;
- linha parcialmente preenchida e rejeitada;
- `nao_ofertada` exige metas nulas;
- simular/ativar lista todos os segmentos oficiais faltantes;
- configuracao ativa continua imutavel;
- curso formal zero carteira continua no catalogo, sem valor observado inventado.

- [x] **Step 2: Confirmar RED**

```powershell
node --test tests/healthScoreProfessorV3CatalogoConfig.test.mjs
node --test tests/healthScoreProfessorV3ConfigSegmentada.test.mjs
```

Expected: FAIL porque `catalogo_segmentos` ainda nao existe no contrato da RPC.

- [x] **Step 3: Redefinir a leitura de configuracao de forma aditiva**

`get_health_score_professor_v3_config_ui()` deve retornar:

```json
{
  "ativa": {},
  "rascunho": {},
  "catalogo_segmentos": [],
  "pendencias": {
    "segmentos_sem_regra": [],
    "excecoes_vinculo": [],
    "atribuicoes_zero_carteira": []
  },
  "modo": "homologacao",
  "publicacao_produtiva": false
}
```

Cada item de `catalogo_segmentos` deve conter unidade, curso local, disciplina Emusys, modalidade, nome, origem, ultima sincronizacao e se esta formalmente ofertado.

- [x] **Step 4: Separar validacao de save e ativacao**

Preservar `salvar_health_score_professor_v3_config_rascunho` como persistencia das linhas validas enviadas. Ausencias nao viram zeros nem estado persistido artificial.

Em `simular_health_score_professor_v3_config` e `ativar_health_score_professor_v3_config`, validar cobertura do catalogo oficial:

```text
cada unidade + curso + modalidade ofertado
deve possuir uma linha configurada ou nao_ofertada
```

Retornar erro com lista de chaves faltantes, sem mensagem generica.

- [x] **Step 5: Fixar grants apos CREATE OR REPLACE**

Revogar `public` e `anon`; conceder `authenticated` apenas nas RPCs com guard ja existente. Fixar `search_path` de todas as funcoes redefinidas.

- [x] **Step 6: Confirmar GREEN**

```powershell
node --test tests/healthScoreProfessorV3CatalogoConfig.test.mjs
node --test tests/healthScoreProfessorV3ConfigSegmentada.test.mjs
node --test tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
node --test tests/healthScoreProfessorV3ConfigSegmentadaSecurity.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- supabase/migrations/20260720122000_health_score_v3_catalogo_segmentos_config.sql tests/healthScoreProfessorV3CatalogoConfig.test.mjs tests/healthScoreProfessorV3ConfigSegmentada.test.mjs tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
git commit -m "feat: orientar metas v3 pelo catalogo oficial"
```

---

## Task 6: Agendar sync diario e expor atualizacao manual segura

**Files:**
- Create: `supabase/migrations/20260720123000_cron_sync_professor_disciplinas_emusys.sql`
- Modify: `supabase/functions/sync-professor-disciplinas-emusys/index.ts`
- Modify: `tests/emusysProfessorDisciplinasSchema.test.mjs`

- [ ] **Step 1: Testar contrato de autenticacao e cron**

Exigir:
- gateway explicitamente `verify_jwt=false`;
- header `x-sync-token` aceito somente com secret configurado e igual;
- JWT validado por `auth.getUser()`;
- permissao por unidade antes de qualquer escrita;
- cron usa Vault, nunca secret literal;
- tres jobs diarios escalonados;
- body identifica unidade e `origem='cron'`.

- [ ] **Step 2: Confirmar RED**

```powershell
node --test tests/emusysProfessorDisciplinasSchema.test.mjs
```

Expected: FAIL nos jobs ainda ausentes.

- [ ] **Step 3: Criar RPC de autorizacao para a Edge Function**

Na migration, criar uma RPC minima:

```sql
public.pode_sincronizar_professor_disciplinas_emusys_v1(
  p_unidade_id uuid
) returns boolean
```

Ela deve ser `security definer`, ter `search_path` fixo, resolver o usuario atual ativo e chamar `usuario_tem_permissao(usuario_id, 'professores.editar', p_unidade_id)`.

- [ ] **Step 4: Criar cron diario escalonado**

Usar `vault.decrypted_secrets` com `sync_professor_disciplinas_token` e `net.http_post`. Agendar uma unidade por job em horarios diferentes, evitando concorrencia. Os nomes devem comecar com `sync-professor-disciplinas-emusys-` para aparecerem no monitor de crons.

- [ ] **Step 5: Confirmar GREEN**

```powershell
deno check supabase/functions/sync-professor-disciplinas-emusys/index.ts
node --test tests/emusysProfessorDisciplinasSchema.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- supabase/migrations/20260720123000_cron_sync_professor_disciplinas_emusys.sql supabase/functions/sync-professor-disciplinas-emusys/index.ts tests/emusysProfessorDisciplinasSchema.test.mjs
git commit -m "feat: agendar sync seguro do catalogo Emusys"
```

---

## Task 7: Separar tipos persistidos da matriz visual de metas

**Files:**
- Modify: `src/lib/healthScoreProfessorV3.ts`
- Modify: `src/hooks/useHealthScoreProfessorV3Config.ts`
- Modify: `src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx`
- Modify: `tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`

- [ ] **Step 1: Escrever testes de tipos e funcoes puras**

Criar os tipos:

```ts
export interface HealthScoreV3CatalogSegment {
  unidadeId: string;
  unidadeNome: string;
  cursoId: number;
  cursoNome: string;
  emusysDisciplinaId: number;
  modalidade: HealthScoreV3Modalidade;
  ofertado: boolean;
  fonte: 'emusys';
  sincronizadoEm: string;
}

export type HealthScoreV3SegmentDraftGoal =
  | ({ estado: 'nao_configurada'; persistida: false } & GoalBase & NullGoals)
  | ({ estado: 'configurada'; persistida: boolean } & GoalBase & NumericGoals)
  | ({ estado: 'nao_ofertada'; persistida: boolean } & GoalBase & NullGoals);
```

Testar:
- parser de `catalogo_segmentos`;
- matriz = catalogo oficial + metas persistidas;
- catalogo sem meta gera `nao_configurada` com nulos;
- `serializeHealthScoreV3SegmentGoals` exclui `nao_configurada`;
- linha nao tocada nao altera dirty;
- linha tocada incompleta impede save daquela edicao;
- faltantes oficiais bloqueiam apenas simular/ativar.

- [ ] **Step 2: Confirmar RED**

```powershell
node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
```

Expected: FAIL nos tipos e helpers novos.

- [ ] **Step 3: Implementar parser e serializacao**

Em `src/lib/healthScoreProfessorV3.ts`:
- adicionar `catalogoSegmentos` em `HealthScoreV3ConfigUi`;
- manter `HealthScoreV3SegmentGoal` como tipo persistido;
- adicionar tipo separado de rascunho visual;
- parsear defensivamente IDs, nomes e timestamps;
- serializar somente estados persistiveis completos.

- [ ] **Step 4: Substituir injecao sintetica**

Remover o uso de `ensureHealthScoreV3DraftSegmentGoals` no load. Criar e testar:

```ts
buildHealthScoreV3SegmentMatrix(
  persistedGoals,
  catalogSegments,
): HealthScoreV3SegmentDraftGoal[]
```

O helper nao muta `workingConfig`, nao gera zero e nao marca dirty.

- [ ] **Step 5: Separar gates da tela**

Expor helpers:

```ts
canSaveHealthScoreV3Draft(matrix)
getHealthScoreV3ActivationBlockers(matrix, catalog)
```

`canSave` aceita linhas nao configuradas intocadas, mas recusa linha em edicao parcialmente preenchida. `getActivationBlockers` lista toda regra oficial ausente.

- [ ] **Step 6: Confirmar GREEN**

```powershell
node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/lib/healthScoreProfessorV3.ts src/hooks/useHealthScoreProfessorV3Config.ts src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
git commit -m "refactor: separar catalogo e rascunho de metas v3"
```

---

## Task 8: Adicionar primitives do Design System

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/components/ui/slider.tsx`
- Create: `src/components/ui/collapsible.tsx`
- Modify: `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`

- [ ] **Step 1: Escrever testes estruturais dos controls**

Exigir imports de `@radix-ui/react-slider` e `@radix-ui/react-collapsible`, `forwardRef`, foco visivel, orientacao acessivel, dimensoes estaveis e exports consistentes com os demais componentes em `src/components/ui`.

- [ ] **Step 2: Confirmar RED**

```powershell
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
```

Expected: FAIL porque os components/dependencies ainda nao existem.

- [ ] **Step 3: Instalar dependencias**

```powershell
npm install @radix-ui/react-slider @radix-ui/react-collapsible
```

- [ ] **Step 4: Implementar `Slider`**

Usar Radix `Root`, `Track`, `Range` e `Thumb`; manter altura estavel, thumb de pelo menos 20px, foco `ring`, teclado nativo do Radix e `aria-label` fornecido pelo consumidor. Nao usar gradiente nem controle HTML range.

- [ ] **Step 5: Implementar `Collapsible`**

Exportar `Collapsible`, `CollapsibleTrigger` e `CollapsibleContent`, com animacao discreta e sem card aninhado obrigatorio.

- [ ] **Step 6: Confirmar GREEN**

```powershell
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- package.json package-lock.json src/components/ui/slider.tsx src/components/ui/collapsible.tsx tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
git commit -m "feat: adicionar controles radix para configuracao v3"
```

---

## Task 9: Refatorar versao, pesos, vigencia e confirmacoes

**Files:**
- Modify: `src/components/App/Professores/HealthScoreV3Config.tsx`
- Modify: `tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`

- [ ] **Step 1: Escrever testes de interacao e ausencia de nativos**

Exigir:
- `Slider` para peso;
- `Select` Radix para estado da meta;
- `DatePicker` para vigencia;
- `AlertDialog` para descarte e ativacao;
- `beforeunload` preservado como fallback do navegador;
- nenhum `window.confirm`, `<select>`, `type=range` ou `type=date` visivel;
- pesos totalizando 100 independentemente das metas;
- configuracao ativa somente leitura;
- criacao de rascunho para edicao.

- [ ] **Step 2: Confirmar RED**

```powershell
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
```

Expected: FAIL nos controls nativos atuais.

- [ ] **Step 3: Refatorar controls**

- trocar `<input type="range">` por `Slider`;
- trocar selects nativos por `Select`/`SelectTrigger`/`SelectContent`;
- trocar `<Input type="date">` por `DatePicker`, usando `parseISO` e `format`;
- usar icon buttons apenas quando o comando for reconhecivel e manter tooltip;
- manter labels compactos adequados ao painel operacional.

- [ ] **Step 4: Substituir confirmacoes**

Usar `AlertDialog` controlado para:
- descartar alteracoes ao trocar de rota/aba;
- ativar nova versao;
- confirmar copia em lote.

O evento `beforeunload` continua usando o dialog nativo do navegador, pois navegadores nao permitem modal customizado nesse evento.

- [ ] **Step 5: Corrigir dirty state**

Inicializacao da tela deve sempre usar `setDraftIsDirty(false)`. Apenas handlers de usuario chamam `markDraftChanged()`. Refresh de catalogo/excecoes nao suja metas.

- [ ] **Step 6: Confirmar GREEN**

```powershell
node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/components/App/Professores/HealthScoreV3Config.tsx tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
git commit -m "refactor: alinhar configuracao v3 ao design system"
```

---

## Task 10: Reconstruir a matriz de metas para progresso parcial

**Files:**
- Modify: `src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx`
- Modify: `src/components/App/Professores/HealthScoreV3Config.tsx`
- Modify: `tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`

- [ ] **Step 1: Escrever testes de UX da matriz**

Exigir:
- abas por Barra, Recreio e Campo Grande;
- filtros curso/modalidade/estado via Radix Select;
- contadores configuradas, pendentes e nao ofertadas;
- linha ausente exibe `-` e `Nao configurada`;
- erro aparece somente apos toque na linha ou tentativa de simular/ativar;
- save parcial envia somente linhas completas;
- matriz preserva filtro e scroll apos save;
- meta media/turma nao pode superar capacidade;
- copia exige origem, destino, preview da quantidade e confirmacao;
- acao em lote `Marcar como nao ofertada` exige confirmacao;
- resumo de progresso fica visivel sem sobrepor tabela em desktop/mobile.

- [ ] **Step 2: Confirmar RED**

```powershell
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
```

Expected: FAIL na semantica atual de zeros e bloqueio global.

- [ ] **Step 3: Implementar matriz catalog-driven**

Renderizar `HealthScoreV3SegmentDraftGoal[]`. Para `nao_configurada`:
- inputs vazios;
- badge neutro;
- sem mensagens vermelhas antes de interacao;
- primeira digitacao muda para `configurada` e marca a linha como tocada.

Para `nao_ofertada`:
- metas nulas;
- inputs desabilitados;
- curso permanece visivel no catalogo e auditoria.

- [ ] **Step 4: Implementar salvamento parcial**

`Salvar rascunho` deve:
- validar apenas linhas tocadas e persistiveis;
- serializar metas completas existentes;
- omitir `nao_configurada`;
- manter lista de blockers de ativacao separada;
- nao bloquear o painel de excecoes.

- [ ] **Step 5: Implementar copia explicita**

Dialog deve permitir:
- unidade/curso/modalidade de origem;
- destinos filtrados;
- preview `N regras serao alteradas`;
- confirmacao;
- alteracao apenas no rascunho local ate salvar.

- [ ] **Step 6: Confirmar GREEN**

```powershell
node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx src/components/App/Professores/HealthScoreV3Config.tsx tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
git commit -m "feat: permitir progresso parcial nas metas segmentadas"
```

---

## Task 11: Transformar conciliacao em painel de excecoes Emusys

**Files:**
- Modify: `src/hooks/useProfessorCursoModalidadeReconciliacao.ts`
- Modify: `src/components/App/Professores/ProfessorCursoModalidadeReconciliacao.tsx`
- Modify: `src/components/App/Professores/HealthScoreV3Config.tsx`
- Modify: `tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`

- [ ] **Step 1: Escrever testes do hook V2**

Exigir chamadas:

```text
get_professor_curso_modalidade_excecoes_v2
sync-professor-disciplinas-emusys
```

Testar:
- contador usa somente linhas acionaveis;
- auditoria avancada e carregada apenas sob demanda;
- refresh preserva filtros;
- sync manual envia uma unidade por chamada;
- erro de uma unidade nao apaga dados das demais;
- salvar excecao nao depende de `draftIsDirty`.

- [ ] **Step 2: Confirmar RED**

```powershell
node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
```

Expected: FAIL porque o hook ainda usa a fila V1 e o componente usa controles nativos.

- [ ] **Step 3: Atualizar o hook**

Trocar leitura para V2 e adicionar:

```ts
syncUnit(unidadeId: string): Promise<SyncSummary>
setIncludeAudit(value: boolean): void
```

Manter a RPC de decisao humana existente somente para excecoes que exigem revisao; nao usar essa RPC para cadastrar tudo novamente.

- [ ] **Step 4: Refatorar o painel**

Titulo: `Excecoes de vinculos Emusys`.

Comportamento:
- `Collapsible` fechado se contador for zero;
- badge acionavel;
- botoes `Sincronizar com Emusys` e `Atualizar` com icones e tooltips;
- filtros Radix Select;
- razao em linguagem direta;
- evidencias em area expansivel;
- aba/segmento `Auditoria avancada` separado;
- empty state objetivo: `Nenhuma excecao exige acao`;
- loading, erro e retry sem zerar silenciosamente a lista anterior.

- [ ] **Step 5: Remover bloqueio cruzado**

Em `HealthScoreV3Config.tsx`, substituir:

```tsx
disabled={mutating || draftIsDirty}
```

por um estado que considere somente sync/revisao em andamento. Editar metas nao desabilita excecoes.

- [ ] **Step 6: Substituir confirmacoes e selects**

Usar `AlertDialog`, `Select` e `Collapsible`; nenhum `window.confirm` ou `<select>` permanece no fluxo.

- [ ] **Step 7: Confirmar GREEN**

```powershell
node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- src/hooks/useProfessorCursoModalidadeReconciliacao.ts src/components/App/Professores/ProfessorCursoModalidadeReconciliacao.tsx src/components/App/Professores/HealthScoreV3Config.tsx tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
git commit -m "feat: simplificar excecoes de vinculos Emusys"
```

---

## Gate 3: Cutover controlado da UI

- [ ] Aplicar `20260720122000_health_score_v3_catalogo_segmentos_config.sql` e `20260720123000_cron_sync_professor_disciplinas_emusys.sql`.
- [ ] Implantar frontend em preview/local com sessao autenticada.
- [ ] Confirmar que a configuracao ativa continua somente leitura e identica.
- [ ] Criar uma nova versao rascunho sem ativar.
- [ ] Confirmar que abrir a pagina nao marca alteracoes pendentes.
- [ ] Editar uma regra, salvar, atualizar a pagina e confirmar persistencia.
- [ ] Deixar outra regra nao configurada e confirmar que save parcial funciona.
- [ ] Confirmar que simular/ativar bloqueia e lista a regra faltante.
- [ ] Sincronizar uma unidade com rascunho sujo e confirmar que o painel funciona sem perder metas.
- [ ] Confirmar que a fila cotidiana nao mostra falsos conflitos nem pistas legadas.

Expected: frontend usa V2 sem ativar nova configuracao nem alterar consumidores produtivos.

---

## Task 12: Hardening, regressao completa e cutover da RPC antiga

**Files:**
- Create: `supabase/migrations/20260720124000_professor_curso_modalidade_v2_cutover.sql`
- Modify: `tests/professorCursoModalidadeCatalogoV2.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigSegmentada.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs`
- Create: `docs/auditorias/2026-07-20-health-score-v3-catalogo-emusys-rollout.md`

- [ ] **Step 1: Inventariar consumidores reais da V1**

```powershell
rg -n "get_professor_curso_modalidade_reconciliacao_v1|reconciliar_professor_curso_modalidade_v1|fn_professor_curso_modalidade_evidencias_v1" src supabase tests docs
```

Registrar cada consumidor e confirmar que nenhum frontend vivo depende da fila V1.

- [ ] **Step 2: Escrever teste de cutover seguro**

Exigir na migration final:
- `authenticated` perde execute da fila V1;
- `service_role` pode manter execute para rollback/diagnostico;
- V2 permanece guardada;
- nenhum drop de tabela, funcao ou evidencia;
- nenhuma alteracao de relatorio/financeiro/presenca/churn.

- [ ] **Step 3: Confirmar RED**

```powershell
node --test tests/professorCursoModalidadeCatalogoV2.test.mjs
```

Expected: FAIL porque hardening final ainda nao existe.

- [ ] **Step 4: Implementar migration de cutover**

Revogar `authenticated` de `get_professor_curso_modalidade_reconciliacao_v1`, preservar `service_role`, reaplicar grants da V2 e adicionar comments de rollback. Nao dropar V1.

- [ ] **Step 5: Executar suite completa**

```powershell
deno test supabase/functions/_shared/emusys-professor-disciplinas.test.ts
deno check supabase/functions/sync-professor-disciplinas-emusys/index.ts
node --test tests/emusysProfessorDisciplinasSchema.test.mjs
node --test tests/professorCursoModalidadeCatalogoV2.test.mjs
node --test tests/professorCursoModalidadeCanonico.test.mjs
node --test tests/healthScoreProfessorV3CatalogoConfig.test.mjs
node --test tests/healthScoreProfessorV3ConfigSegmentada.test.mjs
node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
node --test tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs
node --test tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
node --test tests/healthScoreProfessorV3MetasSegmentadasSecurity.test.mjs
node --test tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs
node --test tests/*.test.mjs
npm run build
```

Expected: todos passam. Registrar contagem total de testes e duracao no relatorio.

- [ ] **Step 6: Verificar banco por SELECT**

Registrar:
- execucoes completas/falhas por unidade;
- catalogo ativo por unidade/modalidade;
- atribuicoes formais ativas por unidade;
- excecoes acionaveis por tipo;
- falso conflito de `aulas.tipo`: zero na fila operacional;
- pista legada: zero na fila operacional;
- pendencia alta resolvivel nao materializada: zero;
- configuracao ativa inalterada;
- snapshots fechados inalterados;
- contagens de relatorios e KPIs nao relacionados iguais ao baseline.

- [ ] **Step 7: Verificar UI no navegador autenticado**

Iniciar servidor em porta livre:

```powershell
npm run dev -- --host 127.0.0.1 --port 5175
```

Testar em desktop `1440x900` e mobile `390x844`:
- pagina abre sem erro de console/RPC;
- nenhum controle nativo visivel de select/range/data;
- slider funciona com mouse e teclado;
- labels e foco sao visiveis;
- matriz nao sobrepoe texto nem estoura largura;
- linha ausente mostra tracos, nao zeros;
- salvar parcial persiste;
- bloqueio de ativacao explica faltantes;
- painel de excecoes mostra apenas acionaveis;
- sync manual mostra progresso/resultado por unidade;
- filtros e scroll sao preservados;
- rascunho sujo nao bloqueia excecoes;
- ativa e snapshots nao mudam.

Capturar screenshots dos dois viewports e registrar caminhos no relatorio de rollout.

- [ ] **Step 8: Executar verificacoes de higiene**

```powershell
rg -n "T[B]D|T[O]DO|F[I]XME|sim[i]lar|approp[r]iate|lat[e]r" docs/superpowers/plans/2026-07-20-health-score-v3-catalogo-emusys-configuracao-segmentada.md
rg -n "type=\"range\"|type=\"date\"|<select|window\.confirm" src/components/App/Professores/HealthScoreV3Config.tsx src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx src/components/App/Professores/ProfessorCursoModalidadeReconciliacao.tsx
git diff --check
git status --short
```

Expected: nenhum marcador incompleto, nenhum controle nativo no fluxo, nenhum whitespace error e apenas arquivos desta entrega.

- [ ] **Step 9: Aplicar hardening somente apos homologacao**

Aplicar `20260720124000_professor_curso_modalidade_v2_cutover.sql` apenas quando o frontend V2 estiver confirmado em producao. Antes disso, manter a migration versionada mas nao aplicada.

- [ ] **Step 10: Commit final**

```powershell
git add -- supabase/migrations/20260720124000_professor_curso_modalidade_v2_cutover.sql tests/professorCursoModalidadeCatalogoV2.test.mjs tests/healthScoreProfessorV3ConfigSegmentada.test.mjs tests/healthScoreProfessorV3ConfigEmusysFrontend.test.mjs docs/auditorias/2026-07-20-health-score-v3-catalogo-emusys-rollout.md
git commit -m "chore: fechar cutover do catalogo Emusys v3"
```

---

## Gate 4: Homologacao e ativacao separada

- [ ] Apresentar a matriz, os pesos e as excecoes para Alf/coordenacao.
- [ ] Confirmar metas preenchidas ou `nao_ofertada` para todo segmento oficial.
- [ ] Simular Barra, Recreio, Campo Grande e consolidado.
- [ ] Comparar valores observados com Performance, carteira, modal e relatorios sem migrar os consumidores.
- [ ] Ativar somente com vigencia futura e aprovacao explicita.
- [ ] Migrar consumidores do Health Score individualmente em plano separado, cada um com rollback.

Expected: esta entrega conclui origem, governanca e UX. A ativacao e a migracao dos demais consumidores permanecem atos separados e auditados.

## Rollback

1. Pausar os jobs `sync-professor-disciplinas-emusys-*`.
2. Nao executar novas materializacoes V2.
3. Reapontar o frontend para a fila V1 enquanto a V1 ainda estiver disponivel.
4. Descartar o rascunho V3; a configuracao ativa permanece intacta.
5. Preservar tabelas brutas, execucoes e historico para auditoria.
6. Nao apagar catalogo, atribuicoes, excecoes ou snapshots.
7. Se o hardening final ja tiver sido aplicado, restaurar apenas o grant da RPC V1 por migration corretiva versionada; nao editar migration aplicada.

## Definicao de pronto

- O catalogo e a modalidade sao sincronizados por ID e unidade.
- Atribuicoes formais sao sincronizadas por disciplina.
- Sync repetido e idempotente; falha parcial nao inativa dados.
- `aulas.tipo` nao cria conflito de modalidade.
- Pistas legadas e itens resolvidos nao ocupam a fila operacional.
- Vinculos de alta confianca sao materializados automaticamente.
- Regra ausente aparece vazia, nunca como zero configurado.
- Salvar parcial funciona; simular/ativar exigem matriz completa.
- Pesos, metas e vigencia usam Design System e continuam versionados.
- A configuracao ativa, snapshots e consumidores nao migrados nao regrediram.
- Testes Node, Deno, build e validacao visual passam.
- Relatorio de rollout registra evidencias, contagens, screenshots e rollback.
