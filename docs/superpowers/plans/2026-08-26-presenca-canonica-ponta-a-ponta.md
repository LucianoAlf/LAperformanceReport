# Presença canônica ponta a ponta — Emusys, LA Report, LA Teacher, agentes e indicadores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar na raiz as falsas pendências, chamadas reaparecendo e divergências de frequência, entregando uma ocorrência de presença canônica, fresca e auditável para Agenda, LA Teacher/Fábio, Sol, Lia, Mila, relatórios, KPIs e gráficos, sem misturar presença do aluno com presença do professor.

**Architecture:** Manter `aluno_presenca` como evidência bruta e introduzir uma projeção canônica aditiva, uma linha por aluno e slot real, com chave completa, precedência explícita, estado do roster e frescor do sync. Sincronizações ganham lease, cobertura por unidade/data e idempotência; ações humanas ganham recibo append-only. Consumidores migram em sombra e por feature flag, sem reescrever decisões históricas ou snapshots fechados.

**Tech Stack:** PostgreSQL/Supabase migrations, pg_cron, Supabase Edge Functions em Deno/TypeScript, React/Vite, LA Teacher React/Vite, Node test runner, Vitest, PostgreSQL 17 em Docker e Playwright/browser autenticado.

---

## 1. Contrato do programa

### 1.1 Grão canônico

Uma ocorrência real de presença é identificada por:

```text
(aluno_id, unidade_id, professor_id,
 data_hora_inicio, data_hora_fim, curso_nome_normalizado)
```

`aula_emusys_id` continua como proveniência, mas não pode ser a identidade da ocorrência porque o Emusys pode emitir as linhas `turma` e `individual` para o mesmo evento.

### 1.2 Estados e precedência

| Evidência | Resultado canônico | Fecha chamada? | Regra |
|---|---|---:|---|
| Humana terminal: `presente` | `presente` | sim | prevalece sobre sync |
| Humana terminal: `falta` | `falta` | sim | prevalece sobre sync |
| Humana terminal: `falta_justificada` | `falta_justificada` | sim | prevalece sobre sync |
| Emusys `presente` sem decisão humana | `presente` | sim | entra como presença |
| Emusys `ausente` sem política temporal aplicável | `indeterminado` | não | gera revisão, não falta |
| Evidências contraditórias | decisão de maior precedência + `possui_conflito=true` | conforme decisão | nunca sobrescrever silenciosamente |
| Roster incompleto/ambíguo | `roster_em_revisao` | não | não atribuir pendência nominal |
| Sync do dia incompleto | `dados_desatualizados` | não publicável | bloquear cobrança/KPI do recorte |

`fn_presenca_e_forte` permanece evidência histórica. `fn_presenca_fecha_chamada` exige um estado terminal e é a única régua de fechamento operacional.

A presença do professor usa outro grão:

```text
(professor_id, unidade_id, aula real)
```

`aulas_emusys.professor_presenca` é evidência operacional bruta. A decisão humana usa `professor_presenca_origem` e as RPCs administrativas. Esse campo isolado não fecha chamada de aluno e não pode virar penalidade, indicador de RH ou Health Score.

### 1.3 Invariantes

- `aluno_presenca` não é apagada para corrigir leitura.
- Retificações preservam antes/depois, autor, motivo e instante.
- Decisão humana nunca é anulada por Emusys `ausente`.
- ID do Emusys sempre é escopado por `unidade_id`.
- Roster histórico pode ser preservado, mas vínculo não confirmado não pode virar cobrança nominal.
- Relatório, agente ou KPI não publica dado do dia sem cobertura concluída.
- Presença do professor e presença do aluno permanecem contratos independentes, ainda que apareçam na mesma Agenda.
- Snapshots fechados do Health Score Professor V3 permanecem imutáveis; a nova regra vale para novas materializações e ciclos abertos.
- O LA Report é a autoridade da decisão; o Emusys fornece agenda e evidência. Escrita de volta no Emusys fica fora deste programa.
- Nenhuma fixture sintética é criada em produção.

### 1.4 Definição mensurável de concluído

- Os casos equivalentes a Davi, Helena, Ísis e Valentina passam em fixture PostgreSQL.
- Agenda e relatório da Sol retornam os mesmos alunos e a mesma classificação para unidade/data.
- Execução interrompida não marca cobertura como concluída e impede o relatório das 9h.
- Repetir a mesma execução ou o mesmo comando não duplica presença nem efeito colateral.
- Toda ação recebida pelo banco possui `request_id`, ator, fonte e resultado por item.
- Toda marcação humana de presença do professor também possui recibo e não é desfeita por sync.
- Os consumidores inventariados não leem `aluno_presenca` diretamente, salvo escritores, auditoria e projeções canônicas allowlisted.
- Toda diferença entre leitura antiga e nova em 30 dias é classificada; diferenças sem explicação são zero antes do cutover.
- Cada unidade completa sete dias operacionais consecutivos sem sync incompleto, falsa pendência confirmada ou divergência entre superfícies.
- Build e suítes dos dois repositórios passam; as telas críticas são verificadas em navegador autenticado e permanecem estáveis após reload.

## 2. Estrutura de arquivos planejada

### Criar no LA Report

- `docs/contracts/presenca-canonica-v2.md`: contrato de grão, precedência, frescor e metadados.
- `docs/contracts/presenca-consumidores.md`: matriz de produtor → contrato → consumidor → validação.
- `docs/runbooks/presenca-canonica.md`: operação, alarmes, rollback e investigação de incidentes.
- `scripts/auditar-presenca-canonica.mjs`: auditoria read-only e comparação v1/v2.
- `supabase/functions/_shared/presenca-sync-run.ts`: ordenação do trabalho, `request_id` e finalização de cobertura.
- `src/lib/presencaCanonica.ts`: tipos e normalização única para as telas.
- `tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs`.
- `tests/presencaSyncCoberturaPostgres.test.mjs`.
- `tests/presencaSyncOrquestracao.test.mjs`.
- `tests/presencaRosterOperacionalPostgres.test.mjs`.
- `tests/presencaComandoAuditoriaPostgres.test.mjs`.
- `tests/presencaProfessorComandoAuditoriaPostgres.test.mjs`.
- `tests/presencaPendenciasCanonicasV2Postgres.test.mjs`.
- `tests/presencaRelatorioFrescorPostgres.test.mjs`.
- `tests/presencaConsumidoresCanonicosV2.test.mjs`.
- `tests/presencaAgentesCanonicos.test.mjs`.
- `tests/presencaKpisCanonicosV2.test.mjs`.
- `tests/presencaShadowComparacaoPostgres.test.mjs`.

### Modificar no LA Report

- `supabase/functions/sync-presenca-emusys/index.ts`.
- `supabase/functions/_shared/reconciliacao-grade-snapshot.ts`.
- `supabase/functions/relatorio-admin-whatsapp/index.ts`.
- `supabase/functions/processar-alertas-lia/index.ts` e `dispatcher.ts`.
- `supabase/functions/mila-processar-mensagem/index.ts`, somente no contrato de experimental.
- `supabase/functions/bi-agent-lamusic/schema.ts`, `tools.ts` e `sql-validator.ts`.
- `supabase/functions/gerar-plano-aluno/index.ts` e `gerar-relatorio-aluno/index.ts`.
- `src/hooks/useAgendaDia.ts`.
- `src/components/App/Agenda/Chamada/AlertaPendencias.tsx`.
- `src/components/App/Agenda/Chamada/ChamadaDrawer.tsx`.
- `src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx`.
- `src/components/App/Agenda/Chamada/useChamadaAcoes.ts`.
- `src/components/App/Alunos/ConciliacaoPresencas.tsx`.
- `src/components/App/Automacoes/TabSaudeCrons.tsx` e `src/hooks/useSaudeCrons.ts`.
- `src/components/App/SucessoCliente/PresencaTab.tsx` e `hooks/useFaltasPeriodo.ts`.
- `src/components/App/Professores/ModalDetalhesPresenca.tsx`.
- `src/components/GestaoMensal/TabProfessoresNew.tsx`.
- Migrations mais recentes que definem as views/RPCs listadas nos checkpoints; toda nova migration deve ser criada com `supabase migration new <nome>`.

### Modificar no LA Teacher

- `D:/la-teacher/src/lib/api.ts`.
- `D:/la-teacher/src/features/agenda/sessao.ts` e `sessao.test.ts`.
- `D:/la-teacher/src/features/registro/presencaLancada.ts` e `presencaLancada.test.ts`.
- `D:/la-teacher/src/features/registro/Confirmar.tsx`.
- Migrations de teste/contrato do LA Teacher; a migration de produção do banco compartilhado permanece canônica no LA Report.

---

# Checkpoint 0 — Isolamento, baseline e inventário fechado

**Objetivo:** congelar a fotografia técnica antes de qualquer alteração e provar que todos os consumidores estão no mapa.

### Task 0.1: Criar worktree e branch dedicados

**Files:** nenhum arquivo funcional.

- [x] Confirmar os dois repositórios limpos.

```powershell
git -C D:\2026\LA-performance-report status --short --branch
git -C D:\la-teacher status --short --branch
```

Expected: ambos em `main...origin/main`, sem linhas de arquivos alterados.

- [x] Atualizar referências remotas e criar worktrees.

```powershell
git -C D:\2026\LA-performance-report fetch origin
New-Item -ItemType Directory -Force D:\2026\LA-performance-report-worktrees | Out-Null
git -C D:\2026\LA-performance-report worktree add D:\2026\LA-performance-report-worktrees\presenca-canonica-raiz -b codex/presenca-canonica-raiz origin/main
git -C D:\la-teacher fetch origin
New-Item -ItemType Directory -Force D:\la-teacher-worktrees | Out-Null
git -C D:\la-teacher worktree add D:\la-teacher-worktrees\presenca-canonica-raiz -b codex/presenca-canonica-raiz origin/main
```

Expected: dois worktrees isolados nas branches novas.

Executado com o Report em `.worktrees/presenca-canonica-raiz` (diretório local
já padronizado e ignorado pelo Git) e o Teacher em
`D:\la-teacher-worktrees\presenca-canonica-raiz`, ambos sobre `origin/main`.

### Task 0.2: Versionar definições vivas que hoje existem só no banco

**Files:**

- Create via CLI: migration `presenca_funcoes_vivas_baseline`.
- Create: `docs/auditorias/artefatos/2026-08-26-presenca-baseline/README.md`.

- [x] Consultar, sem DML, `pg_get_functiondef`/`pg_get_viewdef` para:

```text
fn_enfileirar_relatorio_presenca
fn_texto_relatorio_presenca
fn_presenca_pendencias_do_dia
get_agenda_dia
app_minha_agenda_sessao
app_registrar_presencas_aula
app_registrar_chamada_agenda
fn_registrar_presencas_core
fn_presenca_fecha_chamada
fn_sincronizar_gemeos_presenca
vw_presenca_slot_canonica_v1
vw_aluno_presenca_semantica_v1
vw_aluno_frequencia_canonica_v1
```

- [x] Registrar apenas hashes, assinaturas, grants e versões no artefato; não gravar nomes de alunos ou payloads.

- [x] Gerar a migration com o CLI, copiar as duas funções live-only sem alteração semântica e validar a lista local.

```powershell
supabase migration new presenca_funcoes_vivas_baseline
supabase migration list --local
```

Expected: as funções de relatório passam a ter fonte versionada antes de serem modificadas.

Validação: replay descartável em PostgreSQL 17 reproduziu exatamente os MD5
remotos das duas funções e as ACLs. `migration list --local` exigia a stack na
porta 54322 e não foi usado como atalho de prova.

### Task 0.3: Criar inventário executável de consumidores

**Files:**

- Create: `docs/contracts/presenca-consumidores.md`.
- Create: `tests/presencaConsumidoresCanonicosV2.test.mjs`.

- [x] Catalogar cada ocorrência de:

```powershell
rg -n "aluno_presenca|vw_aluno_presenca_semantica_v1|vw_presenca_slot_canonica_v1|vw_aluno_frequencia_canonica_v1|fn_presenca_pendencias_do_dia|get_faltas_periodo|vw_absenteismo_aluno|percentual_presenca" src supabase D:\la-teacher\src
```

- [x] Classificar cada consumidor como `writer`, `auditoria`, `operacional`, `agente`, `relatorio`, `kpi`, `grafico` ou `legado_bloqueado`.

- [x] Escrever um teste estático com allowlist explícita. O teste deve falhar se surgir nova leitura runtime de `aluno_presenca` fora das projeções e ferramentas de auditoria. Migrations históricas permanecem como registro e não entram nessa proibição; o teste inspeciona código executável e a definição viva reconstruída pelas migrations mais recentes.

```js
assert.deepEqual(leiturasDiretasNaoPermitidas, []);
assert.ok(consumidoresObrigatorios.has('Agenda'));
assert.ok(consumidoresObrigatorios.has('LA Teacher/Fábio'));
assert.ok(consumidoresObrigatorios.has('Sol'));
assert.ok(consumidoresObrigatorios.has('Lia'));
assert.ok(consumidoresObrigatorios.has('Mila/experimental'));
assert.ok(consumidoresObrigatorios.has('Health Score Professor V3'));
```

### Task 0.4: Capturar baseline mensurável

**Files:**

- Create: `scripts/auditar-presenca-canonica.mjs`.

- [x] O script deve executar somente `SELECT` e produzir JSON sem PII contendo, por unidade/data:

```json
{
  "sync_completo": false,
  "aulas_reais": 0,
  "eventos_presente": 0,
  "eventos_falta": 0,
  "eventos_indeterminados": 0,
  "conflitos": 0,
  "rosters_ambiguos": 0,
  "pendencias_agenda": 0,
  "pendencias_relatorio": 0
}
```

- [x] Rodar para Barra, Recreio e Campo Grande nos últimos 30 dias e guardar apenas contagens e hashes fora do Git quando houver dado operacional sensível.

### Gate 0

- [x] Nenhuma escrita em produção ocorreu.
- [x] Definições live-only estão versionadas sem mudança de comportamento.
- [x] Todo consumidor conhecido tem dono, contrato atual e contrato-alvo.
- [x] Baseline de 30 dias está reproduzível.
- [x] Commit: `docs(presenca): fecha baseline e inventario de consumidores`.

---

# Checkpoint 1 — Contrato canônico de ocorrência

**Objetivo:** criar uma única interpretação testável, ainda sem trocar consumidores.

### Task 1.1: Escrever regressões do grão e da precedência

**Files:**

- Create: `tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs`.

- [x] Criar fixtures PostgreSQL para:

1. duas e três duplicatas `turma + individual` da mesma ocorrência;
2. mesmo aluno/professor/início em dois cursos diferentes;
3. Agenda presente + Emusys ausente posterior;
4. LA Teacher/Fábio presente sem Agenda;
5. Emusys presente sem ação humana;
6. Emusys ausente sem ação humana;
7. falta e falta justificada humanas;
8. decisão humana nula, que não pode fechar chamada;
9. IDs Emusys iguais em unidades diferentes.

- [x] Asserções mínimas:

```js
assert.equal(violao.resultado_canonico, 'indeterminado');
assert.equal(experimental.resultado_canonico, 'presente');
assert.equal(francisco.resultado_canonico, 'presente');
assert.equal(francisco.possui_conflito, true);
assert.equal(emusysPresente.fecha_chamada, true);
assert.equal(emusysAusente.fecha_chamada, false);
assert.equal(gemeas.length, 1);
```

- [x] Rodar e confirmar falha antes da migration.

```powershell
node --test tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs
```

Expected: FAIL porque `vw_presenca_ocorrencia_canonica_v2` não existe.

### Task 1.2: Criar a projeção canônica v2

**Files:**

- Create via CLI: migration `presenca_ocorrencia_canonica_v2`.
- Create: `docs/contracts/presenca-canonica-v2.md`.

- [x] Gerar a migration.

```powershell
supabase migration new presenca_ocorrencia_canonica_v2
```

- [x] Criar `fn_presenca_slot_key_v2` e `vw_presenca_ocorrencia_canonica_v2` com estas colunas públicas:

```sql
slot_key text,
aluno_id integer,
unidade_id uuid,
professor_id integer,
data_aula date,
data_hora_inicio timestamptz,
data_hora_fim timestamptz,
curso_nome text,
resultado_canonico text,
fecha_chamada boolean,
fonte_decisao text,
decidido_em timestamptz,
emusys_presenca_bruta text,
possui_conflito boolean,
ids_aulas_emusys integer[],
regra_versao text
```

- [x] A partição deve usar a chave completa:

```sql
partition by aluno_id, unidade_id, professor_id,
             data_hora_inicio, data_hora_fim,
             lower(btrim(curso_nome))
```

- [x] A ordenação deve priorizar estado terminal e força da fonte, usando `decidido_em` e `id` apenas como desempate determinístico.

- [x] Reutilizar a política temporal de confiabilidade; não hardcodar nome de unidade.

- [x] Criar a view com `security_invoker=true`, revogar `PUBLIC`/`anon` e conceder somente aos papéis já autorizados.

### Task 1.3: Provar compatibilidade e diferenças esperadas

- [x] Rodar:

```powershell
node --test tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs tests/presencaCanonicaContrato.test.mjs tests/presencaSemanticaCanonica.test.mjs tests/presencaSemanticaEvidenciaBruta.test.mjs tests/presencaFontesHumanasFichaSemantica.test.mjs
```

Expected: PASS.

- [x] Acrescentar ao script de auditoria comparação v1/v2 por `slot_key`, classificando `duplicidade_emusys`, `colisao_curso`, `precedencia_humana`, `politica_temporal` ou `sem_explicacao`.

### Gate 1

- [x] Fixtures cobrem todos os nove casos.
- [x] `sem_explicacao = 0` na amostra técnica aprovada.
- [x] Nenhum consumidor operacional foi cortado para v2.
- [x] Commit: `feat(presenca): cria ocorrencia canonica v2 em sombra`.

---

# Checkpoint 2 — Sync completo, idempotente e observável

**Objetivo:** impedir que uma execução parcial seja tratada como sincronização concluída.

### Task 2.1: Escrever teste de lease e cobertura

**Files:**

- Create: `tests/presencaSyncCoberturaPostgres.test.mjs`.

- [x] Cobrir início, heartbeat, conclusão, falha, lease vencido e duas tentativas concorrentes.

```js
assert.equal(primeira.adquirida, true);
assert.equal(segunda.adquirida, false);
assert.equal(interrompida.status, 'iniciada');
assert.equal(interrompida.publicavel, false);
assert.equal(concluida.status, 'concluida');
assert.equal(concluida.publicavel, true);
```

### Task 2.2: Criar ledger de execução e RPCs privadas

**Files:**

- Create via CLI: migration `presenca_sync_cobertura_idempotente`.

- [x] Criar `presenca_sync_execucoes` como ledger de uma linha por tentativa, `presenca_sync_eventos` como transições append-only e `presenca_sync_cobertura` como estado atual por unidade/modo/data.

```sql
create table public.presenca_sync_execucoes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  unidade_id uuid not null references public.unidades(id),
  modo text not null check (modo in ('presenca','metadados','agenda')),
  data_alvo date not null,
  status text not null check (status in ('iniciada','concluida','falhou','abortada')),
  snapshot_hash text,
  paginas_lidas integer not null default 0,
  aulas_lidas integer not null default 0,
  presencas_lidas integer not null default 0,
  erro_codigo text,
  criada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  unique (request_id, unidade_id, modo, data_alvo)
);
```

- [x] `presenca_sync_eventos` registra `iniciada`, `heartbeat`, `concluida`, `falhou`, `abortada` e `deduplicada`, sem `UPDATE` ou `DELETE` pela aplicação.

- [x] `presenca_sync_cobertura` deve ter chave primária `(unidade_id, modo, data_alvo)`, `run_id`, `status`, `lease_ate`, `heartbeat_em`, `snapshot_hash`, contagens e timestamps.

- [x] Criar RPCs privadas:

```text
presenca_sync_iniciar_v1(unidade, modo, data, request_id, lease_segundos)
presenca_sync_heartbeat_v1(run_id, contagens)
presenca_sync_finalizar_v1(run_id, status, snapshot_hash, contagens, erro_codigo)
fn_presenca_dados_frescos_v1(unidade, data)
```

- [x] Revogar `PUBLIC`, `anon` e `authenticated`; conceder escrita apenas a `service_role`.

### Task 2.3: Refatorar a orquestração da Edge

**Files:**

- Create: `supabase/functions/_shared/presenca-sync-run.ts`.
- Modify: `supabase/functions/sync-presenca-emusys/index.ts`.
- Create: `tests/presencaSyncOrquestracao.test.mjs`.

- [x] O helper deve ordenar o dia atual primeiro e histórico depois:

```ts
export function ordenarDatasSync(datas: string[], hoje: string): string[] {
  return [...new Set(datas)].sort((a, b) => {
    if (a === hoje) return -1
    if (b === hoje) return 1
    return b.localeCompare(a)
  })
}
```

- [x] Cada unidade/data adquire lease antes da API; concorrente sem lease encerra como `deduplicada`, sem aplicar linhas.

- [x] Enviar heartbeat após cada página e finalizar `concluida` somente depois de paginação, upserts, roster e hash.

- [x] Capturar exceção terminal, marcar `falhou` com código redigido e nunca incluir token ou payload pessoal.

### Task 2.4: Separar dia operacional de backlog

- [x] Alterar crons para:

```text
sync-presenca-dia-barra       — um dia, após a última aula
sync-presenca-dia-campo-grande — um dia, após a última aula
sync-presenca-dia-recreio     — um dia, após a última aula
sync-presenca-catchup-manha   — 07:30 BRT, somente ontem incompleto
sync-presenca-backlog         — madrugada, janela histórica, baixa prioridade
relatorio-presenca-diario     — 09:00 BRT, condicionado a cobertura concluída
```

- [x] O cron deve apenas enfileirar/chamar; sucesso do `net.http_post` não pode equivaler a sucesso da Edge.

### Task 2.5: Expor saúde operacional

**Files:**

- Modify: `src/components/App/Automacoes/TabSaudeCrons.tsx`.
- Modify: `src/hooks/useSaudeCrons.ts`.

- [x] Exibir por unidade: data coberta, status, última conclusão, lease expirado, tentativas deduplicadas e relatório bloqueado.

### Gate 2

- [x] Teste interrompe uma execução e prova `publicavel=false`.
- [x] Três chamadas concorrentes aplicam uma única execução.
- [x] Dia atual é processado antes do backlog.
- [x] O relatório das 9h fica bloqueado quando ontem não está concluído.
- [x] Commit: `feat(presenca): garante cobertura e idempotencia do sync`.

---

# Checkpoint 3 — Roster operacional sem alunos fantasmas

**Objetivo:** preservar histórico sem transformar vínculo antigo em cobrança atual.

### Task 3.1: Escrever regressões de roster

**Files:**

- Create: `tests/presencaRosterOperacionalPostgres.test.mjs`.

- [x] Fixtures obrigatórias:

```text
turma completa com dois alunos
turma completa que remove um aluno
turma completa e vazia com qtd_alunos=0
resposta parcial/inválida
aluno removido com presença humana histórica
linha individual cancelada + container vazio
```

- [x] Asserções:

```js
assert.deepEqual(vazioConfirmado.pendenciasNominais, []);
assert.equal(vazioConfirmado.estado, 'vazio_confirmado');
assert.equal(incompleto.estado, 'roster_em_revisao');
assert.equal(incompleto.pendenciasNominais.length, 0);
assert.equal(historico.presencaPreservada, true);
```

### Task 3.2: Modelar estado do snapshot e soft-inativação

**Files:**

- Create via CLI: migration `presenca_roster_operacional`.

- [x] Criar `aula_roster_sync_estado` com uma linha por aula e último run:

```text
aula_id, unidade_id, run_id,
estado = completo | vazio_confirmado | incompleto | ambiguo,
qtd_esperada, qtd_recebida, snapshot_hash,
sincronizado_em
```

- [x] Adicionar a `aula_alunos_emusys`:

```text
ativo_operacional boolean not null default true
ultimo_run_visto uuid null
inativado_em timestamptz null
inativado_motivo text null
```

- [x] Criar `vw_aula_roster_operacional_v1` com `security_invoker=true`.

### Task 3.3: Corrigir reconciliação sem DELETE físico

**Files:**

- Modify: `supabase/functions/_shared/reconciliacao-grade-snapshot.ts`.
- Modify: `supabase/functions/sync-presenca-emusys/index.ts`.
- Modify via nova migration: `reconciliar_grade_snapshot_emusys_v1`.

- [x] Aplicar regras determinísticas:

1. fotografia integral + participantes: vistos ficam ativos; ausentes ficam inativos;
2. fotografia integral + zero participantes + `qtd_alunos=0`: `vazio_confirmado`, todos inativos;
3. paginação/mapa incompleto: `incompleto`, nenhuma mudança de vínculo;
4. identidade não estável: `ambiguo`, nenhuma mudança de vínculo;
5. decisões humanas permanecem em `aluno_presenca`, independentemente do roster atual.

- [x] Em estado incompleto/ambíguo, a superfície operacional mostra um alerta estrutural sem nomes, não uma lista de faltas.

### Task 3.4: Criar fila de conciliação estrutural

**Files:**

- Modify: `src/components/App/Alunos/ConciliacaoPresencas.tsx`.

- [x] Adicionar filtros `Roster vazio confirmado`, `Roster incompleto` e `Identidade ambígua`, com unidade, aula, curso, última foto e ação de reprocessar; nenhuma ação inventa presença.

### Gate 3

- [x] Casos equivalentes a Ísis/Valentina e Helena não aparecem como pendência nominal.
- [x] Eles aparecem como vínculo inativo ou revisão estrutural auditável.
- [x] Presença humana histórica permanece intacta.
- [x] Repetir o snapshot não gera nova alteração.
- [x] Commit: `fix(presenca): separa roster historico de roster operacional`.

---

# Checkpoint 4 — Escrita humana com recibo e idempotência

**Objetivo:** provar se uma ação chegou, foi aplicada, rejeitada ou falhou por item.

### Task 4.1: Escrever regressões do comando

**Files:**

- Create: `tests/presencaComandoAuditoriaPostgres.test.mjs`.

- [x] Cobrir comando completo, parcial, rejeitado, duplicado, retificação e conflito de permissão.

```js
assert.equal(eventos[0].tipo, 'recebido');
assert.equal(eventos.at(-1).tipo, 'concluido');
assert.equal(duplicado.aplicacoes, 1);
assert.equal(parcial.itens_rejeitados, 1);
assert.equal(retificacao.trilha_preservada, true);
```

### Task 4.2: Criar comando durável e trilha append-only

**Files:**

- Create via CLI: migration `presenca_comando_auditoria`.

- [x] Criar `presenca_comandos` e `presenca_comando_itens` para persistir a intenção antes da aplicação. Guardar IDs e estados solicitados, sem nomes ou payload bruto.

```text
presenca_comandos:
  request_id, tipo, fonte, auth_user_id, usuario_id,
  unidade_id, aula_id, criado_em, payload_hash

presenca_comando_itens:
  request_id, sequencia, aluno_id nullable,
  status_solicitado, motivo_codigo nullable
```

- [x] Criar `presenca_acao_eventos` para as transições append-only:

```sql
create table public.presenca_acao_eventos (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  sequencia integer not null,
  tipo text not null check (tipo in ('recebido','item_aplicado','item_rejeitado','concluido','falhou')),
  fonte text not null,
  auth_user_id uuid,
  usuario_id integer,
  unidade_id uuid,
  aula_id integer,
  aluno_id integer,
  status_anterior text,
  status_novo text,
  erro_codigo text,
  criado_em timestamptz not null default now(),
  unique (request_id, sequencia)
);
```

- [x] Bloquear `UPDATE` e `DELETE` para os papéis da aplicação; leitura somente administrativa/serviço.

### Task 4.3: Tornar as portas idempotentes

**Files:**

- Modify via nova migration: `app_registrar_chamada_agenda`.
- Modify via nova migration: `fn_registrar_presencas_core`.
- Modify via nova migration: `app_registrar_presencas_aula`, `fabio_emitir_presenca_por_registro` e `fabio_registrar_presencas_aula`.

- [x] Criar o protocolo em duas transações:

```text
app_criar_comando_presenca_v1(request_id, tipo, unidade, aula, itens)
app_aplicar_comando_presenca_v1(request_id)
app_status_comando_presenca_v1(request_id)
```

`app_criar_comando_presenca_v1` autentica, persiste comando/itens e retorna `recebido`. `app_aplicar_comando_presenca_v1` lê a intenção já comprometida, aplica pelo núcleo existente e grava resultados. Se o cliente cair entre as duas chamadas, o comando permanece `recebido` e pode ser retomado.

- [x] As portas existentes recebem `p_request_id uuid` ou derivam um ID estável do evento do Fábio e passam a delegar ao protocolo durável durante o cutover.

- [x] A aplicação deve capturar erros por item, registrar `item_rejeitado` e devolver recibo estruturado. Falha de infraestrutura antes da criação não possui recibo e aparece como `não recebido`; falha depois da criação deixa o comando consultável como `recebido` ou `falhou`.

```json
{
  "request_id": "uuid",
  "status": "concluido|parcial|falhou",
  "aplicados": 0,
  "rejeitados": 0,
  "erros": [{"aluno_id": 0, "codigo": "FORA_DO_ROSTER"}]
}
```

### Task 4.4: Atualizar Agenda e LA Teacher

**Files:**

- Modify: `src/components/App/Agenda/Chamada/useChamadaAcoes.ts`.
- Modify: `D:/la-teacher/src/lib/api.ts`.
- Modify: `D:/la-teacher/src/features/registro/Confirmar.tsx`.

- [x] Gerar `crypto.randomUUID()` antes da chamada, criar o comando, aplicar em segunda chamada e manter o mesmo ID no retry.

- [x] Só exibir sucesso quando o recibo for `concluido`; em `parcial`, listar o item não salvo; em falha antes de criar, mostrar `Não recebido`; em falha depois de criar, consultar o status e oferecer `Retomar envio`.

- [x] Confirmações repetidas do Fábio usam o ID estável do registro e não materializam presença duas vezes.

### Task 4.5: Auditar a presença do professor no grão próprio

**Files:**

- Create: `tests/presencaProfessorComandoAuditoriaPostgres.test.mjs`.
- Modify via nova migration: `app_marcar_presenca_professor_aula`.
- Modify via nova migration: `app_registrar_presenca_professor_dia`.
- Modify via nova migration: `app_remover_presenca_professor_dia`.

- [x] Cobrir marcação por aula, marcação do dia, remoção, retry e sync posterior.

```js
assert.equal(marcacaoHumana.professor_presenca, 'presente');
assert.equal(marcacaoHumana.professor_presenca_origem, 'agenda_secretaria');
assert.equal(aposSync.professor_presenca, 'presente');
assert.equal(retry.aplicacoes, 1);
assert.equal(chamadaAlunoFoiAlterada, false);
```

- [x] As três RPCs recebem `p_request_id`, produzem recibo no mesmo ledger e preservam as validações de unidade/permissão já existentes.

- [x] O trigger que infere professor presente a partir de aluno presente permanece somente como evidência operacional e ganha teste de que não reverte uma remoção humana ou uma ocorrência reagendada.

### Gate 4

- [x] Toda gravação recebida tem recibo consultável.
- [x] Retry não duplica.
- [x] Falha parcial não gera toast de sucesso total.
- [x] É possível responder “chegou ou não chegou ao banco” sem consultar logs efêmeros.
- [x] A mesma resposta existe para presença do professor, sem contaminar presença do aluno.
- [x] Commit LA Report: `feat(presenca): audita comandos e aplica idempotencia`.
- [x] Commit LA Teacher: `feat(presenca): envia request id e mostra recibo real`.

---

# Checkpoint 5 — Uma única pendência para Agenda e Sol

**Objetivo:** eliminar chaves divergentes e impedir relatório com dados incompletos.

### Task 5.1: Escrever regressões dos prints

**Files:**

- Create: `tests/presencaPendenciasCanonicasV2Postgres.test.mjs`.
- Create: `tests/presencaRelatorioFrescorPostgres.test.mjs`.

- [x] Fixture de dois cursos no mesmo início deve manter a aula regular indeterminada mesmo quando a experimental está presente.

- [x] Fixture de roster vazio confirmado não deve listar aluno.

- [x] Fixture de sync incompleto deve retornar `dados_desatualizados`, sem “Tudo fechado”.

### Task 5.2: Criar contrato único de pendência

**Files:**

- Create via CLI: migration `presenca_pendencias_canonicas_v2`.

- [x] Criar `fn_presenca_pendencias_do_dia_v2(unidade, data)` sobre `vw_presenca_ocorrencia_canonica_v2`, `vw_aula_roster_operacional_v1` e `fn_presenca_dados_frescos_v1`.

- [x] Reutilizar `fn_presenca_pendencia_elegivel` para trancamento, reagendamento e cancelamento; a migração v2 não pode recriar essa regra em outro `WHERE`.

- [x] Retornar envelope:

```json
{
  "dados_status": "atualizados|desatualizados|roster_em_revisao",
  "sincronizado_em": "timestamp|null",
  "regra_versao": "presenca-v2",
  "pendencias": [],
  "conflitos": [],
  "revisoes_estruturais": []
}
```

- [x] Criar `get_agenda_dia_v2` consumindo o mesmo contrato; a Agenda não recalcula fechamento com chave própria.

### Task 5.3: Versionar e corrigir o relatório diário

**Files:**

- Modify via nova migration: `fn_texto_relatorio_presenca`.
- Modify via nova migration: `fn_enfileirar_relatorio_presenca`.
- Modify: `supabase/functions/relatorio-admin-whatsapp/index.ts`.

- [x] Se `dados_status != atualizados`, enfileirar somente uma mensagem operacional de atraso, sem nomes e sem atribuir falha à equipe.

- [x] Se atualizado, usar exatamente a lista da RPC v2 e incluir `Dados sincronizados às HH:MM`.

- [x] Compatibilidade: a função antiga chama a v2 durante a transição; não manter duas regras SQL.

### Gate 5

- [x] Agenda e Sol têm igualdade exata de membros, não apenas de contagem.
- [x] O caso de colisão entre curso regular e experimental passa.
- [x] Roster fantasma não entra na mensagem.
- [x] Relatório bloqueado não diz “Tudo fechado”.
- [x] Commit: `fix(presenca): unifica pendencias da agenda e da Sol`.

---

# Checkpoint 6 — Visualizações operacionais e LA Teacher/Fábio

**Objetivo:** mostrar a mesma verdade, a fonte e o frescor em todas as interfaces humanas.

### Task 6.1: Criar adapter frontend único

**Files:**

- Create: `src/lib/presencaCanonica.ts`.
- Modify: `src/hooks/useAgendaDia.ts`.

- [x] Definir tipos:

```ts
export type PresencaCanonicaEstado =
  | 'presente'
  | 'falta'
  | 'falta_justificada'
  | 'indeterminado'
  | 'roster_em_revisao'
  | 'dados_desatualizados'

export type PresencaFonte =
  | 'emusys'
  | 'agenda_secretaria'
  | 'professor_la_teacher'
  | 'fabio_audio'
  | 'manual'
```

- [x] O adapter não infere falta a partir de `emusys_presenca_bruta='ausente'`.

### Task 6.2: Atualizar Agenda

**Files:**

- Modify: `src/components/App/Agenda/Chamada/AlertaPendencias.tsx`.
- Modify: `src/components/App/Agenda/Chamada/ChamadaDrawer.tsx`.
- Modify: `src/components/App/Agenda/Chamada/ChamadaAlunoCard.tsx`.
- Modify: `src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx`.

- [x] Exibir seis estados visuais acessíveis: presente, falta, justificada, a confirmar, conflito e dado desatualizado.

- [x] Mostrar fonte, horário e recibo da última decisão.

- [x] “Todos presentes/ausentes” deve usar a mesma RPC de comando e apresentar recibo por item.

- [x] `roster_em_revisao` aparece como problema estrutural da aula, não como aluno faltoso.

- [x] Os três comandos de professor — aula, dia presente e dia ausente — também geram `request_id`, recibo e fonte humana. O sync preserva a decisão humana; o campo bruto do professor não altera a chamada dos alunos.

### Task 6.3: Atualizar Conciliação, Sucesso do Aluno e Professores

**Files:**

- Modify: `src/components/App/Alunos/ConciliacaoPresencas.tsx`.
- Modify: `src/components/App/SucessoCliente/PresencaTab.tsx`.
- Modify: `src/components/App/SucessoCliente/hooks/useFaltasPeriodo.ts`.
- Modify: `src/components/App/Professores/ModalDetalhesPresenca.tsx`.

- [x] Todas as telas exibem denominador, fonte, período, `regra_versao` e estado de publicação.

- [x] Percentual sem denominador publicável aparece como `Em auditoria`, não `0%`.

### Task 6.4: Atualizar LA Teacher/Fábio

**Files:**

- Modify: `D:/la-teacher/src/lib/api.ts`.
- Modify: `D:/la-teacher/src/features/agenda/sessao.ts`.
- Modify: `D:/la-teacher/src/features/registro/presencaLancada.ts`.
- Modify: `D:/la-teacher/src/features/registro/Confirmar.tsx`.

- [x] `app_minha_agenda_sessao` entrega o estado v2, fonte, trava e frescor.

- [x] Professor/Fábio não precisa “dar presença de novo” quando a ocorrência já está fechada.

- [x] Se a confirmação pedagógica materializar presença, ela passa pela mesma idempotência e aparece imediatamente na Agenda após refresh.

- [x] Em conflito, preservar a decisão, mostrar o carimbo e encaminhar à secretaria; não oferecer sobrescrita silenciosa.

### Task 6.5: Testar UI local e autenticada

- [x] LA Report:

```powershell
npm test
npm run build
```

- [x] LA Teacher:

```powershell
npm run test:unit
npm run teste:tudo
npm run build
```

- [x] Em ambiente descartável, validar com Playwright: chamada individual, lote, retry, falha parcial, conflito, roster em revisão e reload.

> Evidência local final do LA Teacher em 2026-08-26: `test:unit` (142/142),
> `teste:tudo` (95 passaram, 0 falharam, 24 superadas e 8 não reaplicáveis) e
> build passaram. O runner expande dependências `-- REQUER:` e cada ensaio SQL
> restaura as impressões digitais de linhas e schema após o rollback.

### Gate 6

- [x] Nenhuma interface recalcula status fora do adapter/contrato.
- [x] O mesmo slot mostra estado, fonte e horário iguais no Report e Teacher.
- [x] Acessibilidade de teclado, foco e rótulos passa.
- [x] Builds dos dois repositórios passam.
- [x] Commits separados por repositório.

---

# Checkpoint 7 — Agentes canônicos

**Objetivo:** impedir que agentes cobrem, orientem ou analisem com dado cru/desatualizado.

### Task 7.1: Criar RPC de contexto por papel

**Files:**

- Create via CLI: migration `presenca_contexto_agentes_v1`.
- Create: `tests/presencaAgentesCanonicos.test.mjs`.

- [x] Criar `get_presenca_contexto_agente_v1(unidade, data, escopo)` retornando somente dados necessários e metadados:

```text
dados_status, sincronizado_em, regra_versao,
universo_eventos, presentes, faltas_confirmadas,
indeterminados, conflitos, revisoes_estruturais
```

- [x] Escopos e grants:

| Agente | Escopo |
|---|---|
| Sol | pendências administrativas da unidade |
| Lia | sinais autorizados de risco/follow-up |
| Mila | presença experimental; não usa presença regular como atalho |
| Fábio | aulas/roster do professor autenticado via LA Teacher |
| BI Agent | agregados canônicos allowlisted |

- [x] `anon=false`; cada papel restrito só enxerga a própria unidade e finalidade.

### Task 7.2: Migrar Sol

**Files:**

- Modify: `supabase/functions/relatorio-admin-whatsapp/index.ts`.

- [x] Sol usa o envelope canônico. Se desatualizado, informa atraso do dado; se atualizado, lista somente pendências reais e separa conflito de ausência de ação.

### Task 7.3: Migrar Lia

**Files:**

- Modify: `supabase/functions/processar-alertas-lia/index.ts`.
- Modify: `supabase/functions/processar-alertas-lia/dispatcher.ts`.

- [x] Alertas dependentes de frequência exigem `dados_status='atualizados'` e denominador publicável. Caso contrário, ficam adiados com motivo `presenca_desatualizada`, sem mensagem à família.

### Task 7.4: Isolar Mila no grão experimental

**Files:**

- Modify: `supabase/functions/mila-processar-mensagem/index.ts` somente se o inventário confirmar leitura de presença.
- Modify: produtores comerciais que usam presença experimental.

- [x] Mila consome o contrato canônico experimental por lead/vínculo; nunca casa presença regular apenas por nome ou horário.

### Task 7.5: Migrar Fábio e agentes analíticos

**Files:**

- Modify: RPCs do Fábio na migration canônica do LA Report.
- Modify: `supabase/functions/bi-agent-lamusic/schema.ts`.
- Modify: `supabase/functions/bi-agent-lamusic/tools.ts`.
- Modify: `supabase/functions/bi-agent-lamusic/sql-validator.ts`.
- Modify: `supabase/functions/gerar-plano-aluno/index.ts`.
- Modify: `supabase/functions/gerar-relatorio-aluno/index.ts`.

- [x] Remover `aluno_presenca` da allowlist analítica e expor somente views/RPCs canônicas.

- [x] Toda resposta de agente com presença inclui período, universo, regra e frescor.

- [x] `fabio_professor_presencas_periodo` ganhou adaptador reversível por
  `la_teacher`: sombra/rollback preservam o JSON legado e `canonico_v2` publica
  somente ocorrência v2 fresca, sem converter ausência bruta em falta provável.

### Gate 7

- [x] Testes exercem atualizado, desatualizado, conflito e roster em revisão para cada agente.
- [x] Nenhum agente atribui culpa operacional com sync incompleto.
- [x] Mila não mistura experimental e aluno regular.
- [x] Fábio fecha a mesma ocorrência vista na Agenda.
- [x] Commit equivalente: `5a74b1ce feat(presenca): unifica interfaces e agentes no contrato v2`.

---

# Checkpoint 8 — KPIs, relatórios e gráficos

**Objetivo:** propagar a ocorrência canônica até todos os números publicados.

### Task 8.1: Escrever contrato de consumidores numéricos

**Files:**

- Create: `tests/presencaKpisCanonicosV2.test.mjs`.

- [x] O teste deve exigir a projeção v2 nos produtores ativos:

```text
vw_aluno_frequencia_canonica_v1
get_frequencia_professor_periodo_canonica_v1
get_frequencia_professor_periodo_publicavel_v1
get_faltas_periodo
vw_absenteismo_aluno
get_kpis_professor_periodo_canonico
get_relatorio_gerencial_canonico_v1
relatórios de coordenação
Health Score Professor V3 em ciclo aberto
Radar/Sucesso do Aluno
```

- [x] Falhar se algum produtor ativo usar `alunos.percentual_presenca` ou contar linha bruta por `aula_emusys_id`.

- [x] Falhar se `aulas_emusys.professor_presenca` isolado for usado como falta do professor, penalidade de RH ou componente do Health Score.

### Task 8.2: Migrar agregações no banco

**Files:**

- Create via CLI: migration `presenca_consumidores_numericos_v2`.

- [x] Recriar as funções/views sobre `vw_presenca_ocorrencia_canonica_v2`.

- [x] Fórmula única:

```text
denominador = ocorrências com considera_frequencia_denominador=true
numerador   = ocorrências com resultado_canonico='presente'
presença %  = numerador / denominador * 100
faltas      = falta + falta_justificada, com rótulos separados disponíveis
```

- [x] Dado incompleto retorna `null + estado_publicacao`, nunca zero silencioso.

- [x] Não alterar snapshots fechados; apenas ciclos abertos e novas materializações usam v2.

### Task 8.3: Migrar relatórios e gráficos frontend

**Files:**

- Modify: `src/components/GestaoMensal/TabProfessoresNew.tsx`.
- Modify: `src/components/App/Professores/ModalDetalhesPresenca.tsx`.
- Modify: `src/components/App/SucessoCliente/PresencaTab.tsx`.
- Modify: hooks produtores identificados no inventário.

- [x] Cada cartão/gráfico mostra período, universo e estado de publicação.

- [x] Tooltip apresenta a equação `presentes / eventos confirmados`.

- [x] Estado incompleto usa `Em auditoria` e não participa de ranking.

### Task 8.4: Verificar equações e paridade

- [ ] Para cada unidade e três períodos — dia, mês aberto e mês fechado — comparar fonte, período, universo, agregação e valor renderizado.

- [ ] A soma por professor deve fechar com o consolidado quando os universos forem iguais; diferenças deliberadas ficam rotuladas.

> Evidência local concluída em PostgreSQL descartável. A paridade com dados reais permanece vinculada ao shadow do Checkpoint 9, pois a inspeção read-only de 2026-08-26 confirmou que as migrations v2 ainda não estão no projeto remoto. Nenhuma migration foi aplicada para antecipar esse gate.

### Gate 8

- [x] Todos os produtores do inventário usam ocorrência v2 no código candidato.
- [x] Não há contagem dupla de gêmeas ou de dois cursos nas fixtures descartáveis.
- [x] Nulo não vira zero.
- [x] Snapshots fechados permanecem fora da mutação candidata; a prova byte-identical remota integra o shadow do Checkpoint 9.
- [x] Commit equivalente concluído nesta revisão: `fix(metricas): propaga presenca canonica aos indicadores`.

---

# Checkpoint 9 — Sombra, reparo seguro e autorização de cutover

**Objetivo:** provar o comportamento em dados reais antes de ativar qualquer superfície.

### Task 9.1: Criar comparação v1/v2

**Files:**

- Create via CLI: migration `presenca_shadow_comparacao_v2`.
- Create: `tests/presencaShadowComparacaoPostgres.test.mjs`.

- [x] Criar função read-only que retorna por unidade/data:

```text
contagem_v1, contagem_v2, delta,
duplicidade_emusys, colisao_curso,
roster_fantasma, precedencia_humana,
politica_temporal, sync_incompleto,
sem_explicacao
```

- [x] Executar 30 dias nas três unidades e exigir `sem_explicacao=0`.

> A matriz descartável e a consulta ad hoc real de 30 dias × 3 unidades fecharam 90/90 linhas com `sem_explicacao=0`. Como `vw_presenca_ocorrencia_canonica_v2`, `presenca_sync_cobertura` e `aula_roster_sync_estado` ainda não existem no remoto, a prova real reproduziu a projeção v2 em uma única consulta read-only e registrou separadamente os limites de roster e cobertura. Nenhum DDL temporário foi usado para contornar o gate. Evidência: `docs/audits/2026-08-26-presenca-shadow-30d.md`.

### Task 9.2: Preparar reparo de dados em dry-run

**Files:**

- Create: `scripts/previsualizar-reparo-presenca-v2.mjs`.

- [x] O dry-run lista somente:

```text
vínculos de roster que seriam soft-inativados
estado de snapshot que seria corrigido
gêmeas que seriam reconciliadas
funções live-only que seriam versionadas
```

- [x] Não propor backfill de presença/falta onde não existe evidência terminal.

- [x] Presenças humanas e retificações devem ter contagem e hash antes/depois idênticos.

### Task 9.3: Revisão humana obrigatória

- [x] Entregar contagens, amostras redigidas, hashes e razão de cada delta.

- [ ] Obter quatro autorizações explícitas e independentes: migration produtiva, reparo de roster, deploy de Edge e ativação de consumidores. A autorização genérica para executar o plano não substitui nenhum desses gates.

> Gates de migration e Edge recebidos e executados em 27/08/2026. Foram
> aplicadas as 22 migrations `20260827030000`-`20260827032100` e, em autorizacao
> separada, os hotfixes `20260827032200`-`20260827032300`. As oito Edge Functions
> do pacote foram publicadas com `verify_jwt` preservado. Reparos de roster e
> ativacao de consumidores continuam sem autorizacao e nao foram executados.

> Preflight remoto, versões, crons, advisors, logs sanitizados e formulário de aprovação por unidade: `docs/audits/2026-08-26-presenca-preflight-producao.md`.

### Gate 9

- [x] `sem_explicacao=0` em 30 dias e 90 combinações unidade/dia.
- [x] Nenhuma decisão humana seria alterada pelo reparo; contagens e hashes reais antes/depois simulado são idênticos.
- [ ] Dry-run aprovado por unidade.
- [x] Nenhum cutover ocorreu ainda.
- [x] Commit equivalente concluído nesta revisão: `test(presenca): fecha sombra e previa de reparo`.

---

# Checkpoint 10 — Rollout controlado por superfície e unidade

**Objetivo:** separar publicação técnica de ativação operacional e manter rollback instantâneo.

### Task 10.1: Criar flags governadas

**Files:**

- Create via CLI: migration `presenca_rollout_config`.

- [x] Criar configuração por unidade/superfície:

```text
unidade_id
superficie = agenda | sol | la_teacher | lia | mila | relatorios | kpis
modo = legado | sombra | canonico_v2
ativado_por
ativado_em
motivo
```

- [x] Escrita somente administrativa; leitura externa service-only e helper sem `EXECUTE` público para RPCs internas.

> Implementação local reversionada em 27/08/2026 após o ledger remoto avançar:
> `20260827031600_presenca_rollout_config.sql`. As três unidades reais foram
> verificadas em read-only, mas nenhuma tabela ou flag foi criada no remoto.

- [x] Preservar implementações vivas e despachar `legado | sombra | canonico_v2` em Agenda, Sol, LA Teacher/Fábio, agentes, KPIs/views e detalhes.
- [x] Provar em PostgreSQL descartável que sombra não altera a resposta operacional, canônico publica v2 e rollback volta ao legado sem DDL destrutivo.

> Compatibilidade remota verificada em read-only em 2026-08-26. A view viva `vw_radar_aluno_sinais` possui `aluno_foto_url` como 22ª coluna; a migration v2 foi corrigida para preservar posição, nome e tipo antes de acrescentar o diagnóstico canônico.

### Task 10.2: Publicar sem ativar

> Preflight de release concluído sem escrita: o histórico remoto foi buscado em staging temporário, onze migrations inéditas foram reversionadas para depois de `20260826193535` e `db push --dry-run --skip-vault` listou somente as 22 migrations v2. Não foram usados `--include-all`, repair, seed ou roles. Evidência: `docs/audits/2026-08-26-presenca-migration-release-dry-run.md`.

> Em 27/08/2026 o ledger remoto avançou para `20260827024840`. Como nenhuma das
> 22 migrations havia sido publicada, o lote completo foi reversionado, sem
> alteração de conteúdo SQL, para `20260827030000`–`20260827032100`. Um novo
> staging e dry-run são obrigatórios imediatamente antes da aplicação autorizada.

- [x] Aplicar as 22 migrations aditivas autorizadas.
- [x] Publicar exatamente o pacote compilado: `sync-presenca-emusys`, `sync-grade-futura-emusys`, `previsualizar-reconciliacao-grade-emusys`, `relatorio-admin-whatsapp`, `processar-alertas-lia`, `bi-agent-lamusic`, `gerar-plano-aluno` e `gerar-relatorio-aluno`, preservando cada `verify_jwt`.
- [x] Manter todas as superfícies em `sombra` (21/21 flags verificadas no remoto).
- [x] Verificar advisors, RLS, grants, versões da Edge e saúde dos crons.

> Evidência pós-release: `docs/audits/2026-08-27-presenca-migrations-producao.md`.
> A RPC de saúde revelou incompatibilidade `varchar(100) -> text`; o hotfix foi
> autorizado, aplicado e validado no schema real. O segundo hotfix governa a
> proveniencia dos relatorios durante o rollout. O runtime posterior comprovou
> Lia v13 e o caminho de metadados da Edge de sync v102. Um 500 isolado de
> origem externa nao identificada foi seguido por sucesso do cron no mesmo
> minuto e por dois 200 no ciclo seguinte; como o log de acesso nao trouxe o
> corpo da chamada falha, ele permanece explicitamente em monitoramento. O
> ledger de presenca continua vazio ate o primeiro fechamento natural da nova
> versao; isso nao autoriza reparo nem cutover.

### Task 10.3: Ativar em ondas

- [ ] Ordem recomendada:

```text
Onda 1 — Recreio: Agenda + Sol, porque os casos de sync incompleto e roster vazio são reproduzíveis ali
Onda 2 — Recreio: LA Teacher/Fábio + Lia + métricas abertas
Onda 3 — Barra: mesmas superfícies
Onda 4 — Campo Grande: mesmas superfícies
Onda 5 — consolidado, relatórios gerenciais e agentes analíticos
```

- [ ] Só avançar após sete dias operacionais consecutivos da onda anterior com todos os gates verdes.

### Task 10.4: Rollback

- [x] Rollback é alteração da flag para `legado`; não apaga eventos, não reverte decisões e não executa migration destrutiva.

- [x] Acionar rollback se houver um dos gatilhos governados; o cenário `divergência Agenda × Sol` foi ensaiado em PostgreSQL descartável:

```text
sync do dia incompleto sem bloqueio de publicação
divergência Agenda × Sol
comando aplicado sem recibo
decisão humana sobrescrita
vazamento de unidade/ACL
delta numérico sem explicação
```

### Gate 10

- [ ] Cada onda tem evidência de banco, Edge, UI e agente.
- [x] Rollback foi ensaiado em ambiente descartável sem criar ou tocar `aluno_presenca`.
- [x] Nenhuma onda avança apenas por prazo: a transição exige sete dias e todos os critérios objetivos verdes.

---

# Checkpoint 11 — Validação ponta a ponta e encerramento

**Objetivo:** provar que o problema está resolvido nos planos técnico, operacional, analítico e de governança.

### Task 11.1: Suítes finais

- [x] LA Report:

```powershell
node --test tests/presencaOcorrenciaCanonicaV2Postgres.test.mjs tests/presencaSyncCoberturaPostgres.test.mjs tests/presencaSyncOrquestracao.test.mjs tests/presencaRosterOperacionalPostgres.test.mjs tests/presencaComandoAuditoriaPostgres.test.mjs tests/presencaPendenciasCanonicasV2Postgres.test.mjs tests/presencaRelatorioFrescorPostgres.test.mjs tests/presencaConsumidoresCanonicosV2.test.mjs tests/presencaAgentesCanonicos.test.mjs tests/presencaKpisCanonicosV2.test.mjs tests/presencaMigrationReleaseOrder.test.mjs tests/presencaShadowComparacaoPostgres.test.mjs tests/presencaPreviaReparoScript.test.mjs tests/presencaRolloutConfigPostgres.test.mjs tests/presencaSegurancaFuncoesInternasPostgres.test.mjs tests/presencaRolloutFabioPeriodoPostgres.test.mjs
npm test
npm run build
```

> Evidência local renovada em 2026-08-26: suíte canônica dedicada com Deno 4/4 e Node
> 57/57; suíte integral LA Report 371/371; build concluído. O build manteve apenas
> os avisos preexistentes de chunks grandes/circulares; nenhuma validação remota
> ou de produção está implícita neste item.

- [x] LA Teacher:

```powershell
npm run test:unit
npm run teste:tudo
npm run build
```

Expected: todos os comandos terminam com código 0.

> Resultado: `test:unit` 142/142; `teste:tudo` 95 passaram, 0 falharam,
> 24 superadas e 8 não reaplicáveis; build concluído apenas com aviso de bundle.

### Task 11.2: Segurança e contrato remoto

- [x] Rodar advisors e verificar:

```text
RLS/grants de tabelas novas
EXECUTE das RPCs por anon/authenticated/papéis restritos/service_role
security_invoker das views
search_path fixo em SECURITY DEFINER
nenhum segredo ou payload pessoal em logs
```

- [x] Confirmar projeto Supabase, migration history e versões de Edge no preflight de 26/08/2026. Esta confirmação deve ser renovada imediatamente antes da publicação; ela não constitui alegação de produção do v2.

> Baseline read-only confirmado em 26/08/2026: projeto `ouqwbbermlzqqvtqwlul`, PostgreSQL 17.6.1.063, 1763 migrations e última versão remota `20260826193535`; todas as migrations v2 continuam ausentes. Versões Edge e crons vivos foram registrados no preflight. Advisors também foram capturados como baseline (745 achados de segurança e 1149 de performance), mas o delta dos objetos novos só pode ser validado depois da publicação técnica autorizada. O hardening candidato revogou execução ampla de cinco funções internas, com prova em PostgreSQL 17 descartável. O kernel métrico permanece `security_barrier` e `service_role` only: o ensaio mostrou que `security_invoker` exigiria ampliar acesso direto à ocorrência nominal; consumidores externos continuam nas RPCs com ACL de unidade.

> Os oito entrypoints do pacote Edge passaram em `deno check --node-modules-dir=auto`; versões, hashes e `verify_jwt` remotos foram registrados em `docs/audits/2026-08-26-presenca-edge-release-preflight.md`. Nenhum deploy ocorreu.

### Task 11.3: Browser e fluxo real autorizado

- [ ] Em navegador autenticado, validar Barra, Recreio e Campo Grande:

```text
Agenda carrega e mostra frescor
chamada individual gera recibo
retry não duplica
Teacher/Fábio vê a decisão
Sol produz a mesma pendência
Conciliação mostra conflito/roster
gráfico e KPI mostram mesmo universo
reload mantém o estado
console sem erro relevante
```

- [ ] Escrita em produção usa uma aula real indicada pela operação e o fluxo normal do dia; não criar aluno/aula sintéticos.

### Task 11.4: Monitorar sete dias após a última onda

- [ ] Medir diariamente:

```text
% unidade/dia com cobertura concluída
execuções deduplicadas
relatórios bloqueados por frescor
comandos concluídos/parciais/falhos
conflitos Emusys × humano
rosters em revisão
divergência Agenda × Sol
deltas KPI sem explicação
```

- [ ] Critério final: cobertura de 100% dos dias operacionais, zero divergência não explicada e zero falsa pendência confirmada na amostra revisada.

### Task 11.5: Handoff e documentação

**Files:**

- Update: `docs/REGRAS-DE-NEGOCIO.md`.
- Update: `docs/MAPA-SISTEMA.md`.
- Update: `docs/METRICAS.md`.
- Update: `docs/MAPA-INTEGRACAO-EMUSYS.md`.
- Create: `docs/runbooks/presenca-canonica.md`.

- [x] Documentar arquitetura candidata, matriz de consumidores, horários, alarmes, consulta de recibo, tratamento de conflito, rollback e responsáveis operacionais em `docs/runbooks/presenca-canonica.md`. O estado produtivo e as versões finais serão preenchidos após os gates de publicação.

- [ ] Relatório final deve separar:

```text
correções de código
reparos de roster autorizados
decisões humanas preservadas
snapshots históricos imutáveis
provas executadas
riscos residuais
```

### Gate final

- [ ] Todos os gates 0–11 estão assinados com evidência.
- [ ] As três unidades passaram pelo período de estabilidade.
- [ ] Todos os consumidores do inventário apontam para o contrato v2 ou estão formalmente desativados.
- [ ] Branches, commits, pushes, migrations, Edge versions e deployments estão registrados.
- [ ] O plano só é marcado concluído após a monitoração, não após o deploy.

---

## 3. Entregas por checkpoint

| Checkpoint | Entrega verificável |
|---|---|
| 0 | baseline remoto/local e inventário completo |
| 1 | ocorrência canônica v2 em sombra |
| 2 | sync com cobertura, lease, retry e frescor |
| 3 | roster operacional sem fantasmas |
| 4 | comandos humanos com recibo e idempotência |
| 5 | Agenda e Sol na mesma pendência |
| 6 | telas e LA Teacher/Fábio canônicos |
| 7 | Sol, Lia, Mila, Fábio e BI com metadados canônicos |
| 8 | KPIs, relatórios e gráficos com a mesma ocorrência |
| 9 | comparação de 30 dias e reparo em dry-run |
| 10 | rollout reversível por unidade/superfície |
| 11 | E2E, monitoração, runbook e encerramento |

## 4. Ações expressamente proibidas durante a execução

- Não usar `--include-all` para contornar divergência de migrations.
- Não aplicar backfill de falta/presença sem evidência terminal.
- Não usar nome como chave de escrita.
- Não limpar `aluno_presenca`, retificações ou snapshots fechados.
- Não considerar HTTP 200, cron `succeeded` ou Vercel `Ready` como E2E.
- Não publicar relatório/KPI stale como se estivesse completo.
- Não alterar `verify_jwt` de Edge existente sem decisão específica de segurança.
- Não avançar migration, deploy, reparo e ativação no mesmo gate.
