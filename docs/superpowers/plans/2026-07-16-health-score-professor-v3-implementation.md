# Health Score do Professor V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir em sombra o historico professor-matricula-disciplina e o Health Score do Professor V3, sem alterar a V2 produtiva nem os relatorios gerencial, administrativo e comercial.

**Architecture:** A implementacao e aditiva: um coletor retomavel grava payloads historicos do Emusys em staging isolado, um reconstrutor versionado materializa periodos pedagogicos e read models calculam os seis pilares. Configuracoes e snapshots V3 sao imutaveis por competencia; consumidores visuais migram individualmente apenas depois dos gates de piloto, seguranca e homologacao.

**Tech Stack:** Supabase/PostgreSQL, Supabase Edge Functions em Deno/TypeScript, React 19, TypeScript, Vite, Node test runner, Emusys API `GET /aulas`.

---

## Regras de execucao

- Trabalhar no worktree atual, conforme decisao do usuario; nao criar outro worktree.
- Nao reverter nem incluir por acidente alteracoes locais preexistentes.
- Antes de cada migration, confirmar o projeto `ouqwbbermlzqqvtqwlul`.
- Aplicar migrations uma por vez e validar o gate correspondente.
- Nao migrar consumidores produtivos enquanto o usuario nao aprovar a virada.
- Nao fazer commit intermediario automatico. Manter checkpoints por `git diff` e realizar commit/push somente quando o usuario solicitar ao final da serie.
- Se um gate falhar, parar a fase, preservar evidencia e nao avancar.

## Mapa de arquivos

### Criar

- `supabase/migrations/20260716155305_health_score_v3_staging_historico.sql`
- `supabase/functions/backfill-historico-professor-emusys/index.ts`
- `supabase/functions/_shared/emusys-aulas.ts`
- `scripts/backfill-historico-professor-emusys.mjs`
- `tests/backfillHistoricoProfessorEmusys.test.mjs`
- `supabase/migrations/20260716162325_health_score_v3_periodos_professor.sql`
- `supabase/functions/reconstruir-periodos-professor/index.ts`
- `tests/periodosProfessorCanonicos.test.mjs`
- `supabase/migrations/20260716130000_health_score_v3_metricas_sombra.sql`
- `tests/healthScoreProfessorV3Metricas.test.mjs`
- `supabase/migrations/20260716133000_health_score_v3_config_snapshots.sql`
- `tests/healthScoreProfessorV3Snapshots.test.mjs`
- `src/lib/healthScoreProfessorV3.ts`
- `src/hooks/useHealthScoreProfessorV3.ts`
- `src/hooks/useHealthScoreProfessorV3Config.ts`
- `src/components/App/Professores/HealthScoreV3Config.tsx`
- `tests/healthScoreProfessorV3Frontend.test.mjs`
- `scripts/verify-health-score-professor-v3.sql`
- `docs/auditorias/2026-07-16-health-score-professor-v3-piloto.md`
- `docs/auditorias/2026-07-16-health-score-professor-v3-sombra.md`

### Modificar somente nas fases indicadas

- `supabase/functions/processar-matricula-emusys/index.ts`
- `supabase/functions/_shared/jornada-canonica.ts`
- `src/components/App/Professores/ProfessoresPage.tsx`
- `src/components/App/Professores/TabPerformanceProfessores.tsx`
- `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx`
- `src/components/App/Professores/TabCarteiraProfessores.tsx`
- `src/components/App/Professores/ModalRelatorioCoordenacao.tsx`
- `src/lib/relatorioCoordenacaoInstantaneo.ts`
- `docs/MAPA-SISTEMA.md`
- `docs/METRICAS.md`
- `docs/MAPA-INTEGRACAO-EMUSYS.md`

### Nao modificar durante staging, reconstrucao e sombra

- `src/hooks/useHealthScore.ts`
- `src/hooks/useHealthScoreConfig.ts`
- `src/components/App/Professores/HealthScoreConfig.tsx`
- `src/lib/professoresKpisCanonicos.ts`
- `supabase/functions/sync-presenca-emusys/index.ts`
- `aulas_emusys.anotacoes`
- `aulas_emusys.anotacoes_fabio`
- pipeline de churn/Random Forest
- relatorios gerencial, administrativo e comercial

---

## Fase 0 - Baseline e contrato de nao regressao

### Task 1: Congelar o inventario de consumidores V2

**Files:**
- Create: `tests/healthScoreProfessorV3Contrato.test.mjs`
- Create: `docs/auditorias/2026-07-16-health-score-professor-v3-consumidores-v2.md`

- [ ] **Step 1: Escrever o teste de isolamento V2/V3**

O teste deve exigir que os arquivos V2 continuem apontando para `get_kpis_professor_periodo_canonico_v3`, `config_health_score_professor` e `calcularHealthScore`, e que nenhum deles mencione tabelas/RPCs V3 antes do cutover.

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';

const arquivosV2 = [
  'src/hooks/useHealthScore.ts',
  'src/hooks/useHealthScoreConfig.ts',
  'src/lib/professoresKpisCanonicos.ts',
  'src/lib/relatorioCoordenacaoInstantaneo.ts',
];

for (const arquivo of arquivosV2) {
  const fonte = fs.readFileSync(arquivo, 'utf8');
  assert.doesNotMatch(fonte, /health_score_professor_v3_/);
}
```

- [ ] **Step 2: Rodar o teste antes de qualquer implementation**

Run: `node --test tests/healthScoreProfessorV3Contrato.test.mjs`
Expected: PASS.

- [ ] **Step 3: Registrar consumidores e fonte atual**

Documentar tela, arquivo, RPC/tabela, grain, estado e rollback para Performance, modal, Carteira, configuracao, relatorio individual, coordenacao, Dashboard/Analytics de professores e agentes.

- [ ] **Step 4: Capturar baseline funcional**

Run: `node --test tests/professoresKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs tests/professoresPresencaPublicavel.test.mjs tests/professoresSaidasFatorCanonicos.test.mjs`
Expected: todos PASS.

- [ ] **Step 5: Capturar baseline de build**

Run: `npm run build`
Expected: exit 0.

**Gate 0:** baseline salvo e nenhuma fonte produtiva alterada.

---

## Fase 1 - Staging e coletor historico

### Task 2: Criar schema de staging isolado

**Files:**
- Create: `supabase/migrations/20260716155305_health_score_v3_staging_historico.sql`
- Modify: `tests/backfillHistoricoProfessorEmusys.test.mjs`

- [ ] **Step 1: Escrever teste estrutural que falha**

Exigir as tres tabelas, RLS, ausencia de grants anon/public, unicidade por unidade+aula e proibicao textual de escrita em `aulas_emusys`.

```js
const migration = fs.readFileSync(
  'supabase/migrations/20260716155305_health_score_v3_staging_historico.sql',
  'utf8'
);
assert.match(migration, /create table public\.emusys_historico_backfill_execucoes_v1/i);
assert.match(migration, /create table public\.emusys_aulas_historico_staging_v1/i);
assert.match(migration, /create table public\.emusys_aula_alunos_historico_staging_v1/i);
assert.doesNotMatch(migration, /insert\s+into\s+public\.aulas_emusys/i);
assert.doesNotMatch(migration, /grant\s+.*\s+to\s+(anon|public)/i);
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node --test tests/backfillHistoricoProfessorEmusys.test.mjs`
Expected: FAIL porque a migration ainda nao existe.

- [ ] **Step 3: Implementar a migration**

Usar os campos e checks da SPEC. O nucleo deve conter:

```sql
create table public.emusys_historico_backfill_execucoes_v1 (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  data_inicio date not null,
  data_fim date not null,
  janela_inicio_atual date not null,
  janela_fim_atual date not null,
  cursor_atual text,
  status text not null default 'pendente'
    check (status in ('pendente','executando','pausado','concluido','falhou')),
  paginas_processadas integer not null default 0 check (paginas_processadas >= 0),
  aulas_recebidas integer not null default 0 check (aulas_recebidas >= 0),
  tentativas integer not null default 0 check (tentativas >= 0),
  ultimo_erro_codigo text,
  ultimo_erro_em timestamptz,
  iniciado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz,
  criado_por integer references public.usuarios(id),
  check (data_fim >= data_inicio),
  check (janela_fim_atual >= janela_inicio_atual)
);
```

Criar indice unico parcial para um job executando por unidade, tabelas de aula/roster, hashes, indices por unidade/data/matricula-disciplina e comments de propriedade.

- [ ] **Step 4: Habilitar RLS e grants minimos**

```sql
alter table public.emusys_historico_backfill_execucoes_v1 enable row level security;
alter table public.emusys_aulas_historico_staging_v1 enable row level security;
alter table public.emusys_aula_alunos_historico_staging_v1 enable row level security;

revoke all on public.emusys_historico_backfill_execucoes_v1 from public, anon, authenticated;
revoke all on public.emusys_aulas_historico_staging_v1 from public, anon, authenticated;
revoke all on public.emusys_aula_alunos_historico_staging_v1 from public, anon, authenticated;
```

- [ ] **Step 5: Rodar teste estrutural**

Run: `node --test tests/backfillHistoricoProfessorEmusys.test.mjs`
Expected: PASS.

- [ ] **Step 6: Aplicar somente esta migration**

Confirmar URL do projeto antes. Aplicar via Supabase MCP/CLI e consultar `information_schema` para colunas, RLS, constraints e grants.

### Task 3: Extrair cliente compartilhado de aulas sem alterar comportamento produtivo

**Files:**
- Create: `supabase/functions/_shared/emusys-aulas.ts`
- Modify: `tests/backfillHistoricoProfessorEmusys.test.mjs`

- [ ] **Step 1: Testar contrato de timezone e URL**

Exigir:

```ts
export function parseDataHoraEmusys(dataHora: string): string {
  return dataHora.replace(' ', 'T') + ':00-03:00';
}
```

e montagem com `data_hora_inicial`, `data_hora_final`, `limite=100` e `encodeURIComponent(cursor)`.

- [ ] **Step 2: Implementar helper sem mover o sync atual nesta fase**

O helper novo atende somente o backfill. A deduplicacao com o sync produtivo pode ser feita em outro refactor depois da homologacao.

- [ ] **Step 3: Rodar teste**

Run: `node --test tests/backfillHistoricoProfessorEmusys.test.mjs`
Expected: PASS.

### Task 4: Implementar Edge Function retomavel

**Files:**
- Create: `supabase/functions/backfill-historico-professor-emusys/index.ts`
- Modify: `tests/backfillHistoricoProfessorEmusys.test.mjs`

- [ ] **Step 1: Escrever teste de autenticacao, checkpoint e isolamento**

Exigir `max_paginas <= 10`, service role/admin, `Retry-After`, atraso minimo de 1350 ms entre requisicoes, checkpoint por pagina, upsert apenas no staging e ausencia de `anotacoes_fabio`.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node --test tests/backfillHistoricoProfessorEmusys.test.mjs`
Expected: FAIL nos requisitos da Edge.

- [ ] **Step 3: Implementar handler**

Fluxo minimo:

```ts
const body = await req.json();
const maxPaginas = Math.max(1, Math.min(Number(body.max_paginas ?? 1), 10));
const execucao = await carregarExecucao(body.execucao_id);
validarEscopo(req, execucao.unidade_id);

for (let pagina = 0; pagina < maxPaginas; pagina += 1) {
  const resposta = await buscarPagina(execucao);
  await gravarPaginaAtomica(resposta.items, execucao);
  await salvarCheckpoint(execucao, resposta.paginacao);
  if (!resposta.paginacao?.tem_mais) break;
  await delay(1350);
}
```

`gravarPaginaAtomica` chama uma RPC interna transacional para aula, roster, contadores e checkpoint; uma falha nao avanca o cursor.

- [ ] **Step 4: Tratar erros sem PII**

Mapear 401/403 para falha de token, 429 para pausa/retry, 5xx/timeout para retry com jitter e erros permanentes para `falhou`. Salvar apenas codigo e contexto tecnico.

- [ ] **Step 5: Rodar testes**

Run: `node --test tests/backfillHistoricoProfessorEmusys.test.mjs`
Expected: PASS.

- [ ] **Step 6: Deploy controlado**

Deploy com JWT habilitado e guard interno. Nao criar cron ainda.

### Task 5: Implementar orquestrador local

**Files:**
- Create: `scripts/backfill-historico-professor-emusys.mjs`
- Modify: `tests/backfillHistoricoProfessorEmusys.test.mjs`

- [ ] **Step 1: Testar comandos permitidos**

Exigir `create`, `resume`, `pause`, `status`, unidade obrigatoria e datas ISO.

- [ ] **Step 2: Implementar CLI sem credenciais no codigo**

```powershell
$env:SUPABASE_URL='https://ouqwbbermlzqqvtqwlul.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='...'
node scripts/backfill-historico-professor-emusys.mjs status --job <uuid>
```

- [ ] **Step 3: Testar retomada simulada**

Interromper depois de uma pagina, consultar cursor, retomar e confirmar que o total/hash nao duplica.

**Gate 1:** staging isolado, Edge retomavel, zero escrita produtiva e rate limit comprovado.

---

## Fase 2 - Piloto e reconstrucao historica

### Task 6: Criar schema canonico de periodos e revisoes

**Files:**
- Create: `supabase/migrations/20260716162325_health_score_v3_periodos_professor.sql`
- Create: `tests/periodosProfessorCanonicos.test.mjs`

- [x] **Step 1: Escrever testes de DDL e invariantes**

Exigir campos da SPEC, checks de status/confianca, regra de quatro meses, revisao append-only, RLS e nenhum grant anon/public.

- [x] **Step 2: Rodar e confirmar falha**

Run: `node --test tests/periodosProfessorCanonicos.test.mjs`
Expected: FAIL.

- [x] **Step 3: Criar tabelas**

O check central deve impedir publicacao indevida:

```sql
check (
  publicavel = false
  or confianca in ('alta', 'revisado_aprovado')
),
check (
  status_periodo <> 'encerrado'
  or data_fim is not null
),
check (
  data_fim is null
  or data_fim >= data_inicio
)
```

`elegivel_permanencia` deve ser calculado pela funcao de materializacao usando valor preciso; nao aceitar input arbitrario de frontend.

- [x] **Step 4: Criar fila de diagnostico**

Criar view invoker somente para coordenacao/admin com conflitos: sem professor, sem matricula-disciplina, sobreposicao, inicio truncado, substituicao e duracao invalida.

- [x] **Step 5: Aplicar e validar grants**

Run read-only depois da migration: consultar RLS, policies, grants e constraints.
Expected: service role escreve; usuarios nao leem payload bruto.

### Task 7: Implementar reconstrutor versionado

**Files:**
- Create: `supabase/functions/reconstruir-periodos-professor/index.ts`
- Modify: `tests/periodosProfessorCanonicos.test.mjs`

- [x] **Step 1: Criar fixtures sinteticas**

Cobrir:

```text
A,A,A -> um periodo A ativo
A,A,B,B,B -> A encerrado e B ativo
A,A,B,A,A -> B substituicao; A continuo
A,A,B,B -> revisar sem grade/webhook
renovacao com A -> A continuo
prof_id 0 -> sem professor
periodo 3.99 meses -> inelegivel
periodo 4.00 meses -> elegivel
```

- [x] **Step 2: Rodar e confirmar falha**

Run: `node --test tests/periodosProfessorCanonicos.test.mjs`
Expected: FAIL pela ausencia do reconstrutor.

- [x] **Step 3: Implementar particao e segmentacao**

Particionar por unidade + matricula-disciplina. Resolver pessoa e professor por IDs escopados. Usar tres eventos consecutivos ou confirmacao de jornada/transicao para troca sustentada.

- [x] **Step 4: Implementar confianca e evidencia**

Cada periodo registra IDs de aulas limite, hash da entrada, motivo da decisao, flags `inicio_incompleto`, `substituicao_candidata` e conflitos.

- [x] **Step 5: Implementar idempotencia**

Mesma `versao_reconstrucao` + mesmo hash nao altera contagem. Nova versao cria conjunto comparavel sem apagar a anterior.

- [x] **Step 6: Rodar testes**

Run: `node --test tests/periodosProfessorCanonicos.test.mjs`
Expected: PASS.

### Task 8: Executar piloto historico

**Files:**
- Create: `docs/auditorias/2026-07-16-health-score-professor-v3-piloto.md`
- Create: `scripts/verify-health-score-professor-v3.sql`

- [x] **Step 1: Selecionar amostra ouro**

Incluir pelo menos: veterano, evadido, segundo curso, duas disciplinas, troca conhecida, substituicao, professor inativo/historico e caso ambiguo em cada unidade.

- [x] **Step 2: Coletar a menor janela que cobre os casos**

Nao iniciar backfill total. Rodar jobs por unidade e conferir contagens/hashes/checkpoints.

- [x] **Step 3: Reconstruir com versao `periodos-professor-v1.8-piloto`**

Gerar somente periodos sombra.

- [x] **Step 4: Conferir tecnicamente e preparar amostra nominal**

Para cada caso, listar linha do tempo, professor anterior/novo, inicio/fim, confianca, permanencia, elegibilidade de quatro meses e motivo de retencao.

- [x] **Step 5: Homologar com coordenacao**

Nenhum caso ambiguo e promovido. Registrar aprovado, corrigido ou revisar.

Resultado em 16/07/2026: 31 decisoes append-only registradas (25 aprovadas, 2 corrigidas, 2 rejeitadas e 2 mantidas em revisao). As duas ambiguidades permaneceram nao publicaveis; nenhuma inferencia por nome foi promovida.

**Gate 2:** concluido; piloto nominal aprovado, ambiguidades visiveis e nenhuma inferencia por nome publicada.

### Task 9: Escalar backfill por prioridade

**Files:**
- Modify: `docs/auditorias/2026-07-16-health-score-professor-v3-piloto.md`
- Create: `docs/auditorias/2026-07-16-health-score-professor-v3-escala-pre2022.md`
- Create: `docs/auditorias/2026-07-16-health-score-professor-v3-escala-completa.md`
- Create: `supabase/migrations/20260716184500_health_score_v3_reconstrucao_particionada.sql`
- Create: `supabase/migrations/20260716185500_otimiza_eventos_reconstrucao_particionada.sql`
- Create: `supabase/migrations/20260716190500_manifesto_reconstrucao_particionada.sql`
- Create: `supabase/functions/_shared/reconstrucao-particionada-professor.mjs`
- Create: `scripts/reconstruir-periodos-professor-particionado.mjs`
- Create: `tests/reconstrucaoPeriodosParticionada.test.mjs`

- [x] **Step 1: Rodar coorte anterior a 2022**

Validar volume, rate limit, cobertura de matricula-disciplina e distribuicao de confianca.

Resultado em 16/07/2026: 105.112 eventos e 2.560 periodos em sombra nas tres unidades. Campo Grande e Recreio foram processados em 32 blocos por pessoa canonica, sem dividir pessoas, sem duplicidade ativa e com repeticao final idempotente. A cobertura de matricula-disciplina foi alta, mas a identidade historica de professor ainda possui 1.202 periodos sem vinculo local; eles permanecem fora da publicacao.

- [x] **Step 2: Rodar coorte anterior a 2024**

Comparar variacao das metricas e novos conflitos.

Resultado em 16/07/2026: 217.067 eventos, 4.901 periodos e 112.304 diagnosticos foram reconstruidos nas tres unidades com a versao `periodos-professor-v1.11-pre2024-particionado`. As 96 particoes terminaram concluidas, sem duplicidade ativa na chave canonica completa. Foram encontrados 476 periodos simultaneamente elegiveis por duracao e publicaveis em sombra.

- [x] **Step 3: Rodar restante da base**

Somente depois de Gate 2 e dos dois lotes anteriores.

Resultado em 16/07/2026: a versao `periodos-professor-v1.12-full-20260716-particionado` processou 434.193 eventos e materializou 8.934 periodos ate 16/07/2026. O manifesto bateu exatamente com os eventos de entrada, as 96 particoes terminaram concluidas, a repeticao final preservou hash e totais, e nenhum consumidor produtivo foi migrado.

- [x] **Step 4: Mapear lacunas para CSV**

CSV entra somente na fila de revisao com fonte e hash. Nao atualiza periodo publicavel sem decisao humana.

Resultado em 16/07/2026: foram mapeados 2.660 periodos associados a 84 identidades Emusys de professor escopadas por unidade e ainda sem vinculo local, alem de 399 periodos sem ID de matricula-disciplina. Todos permanecem nao publicaveis. A fila nominal, o contrato de importacao e a ressalva sobre as 31 revisoes do piloto estao documentados no relatorio de escala completa.

---

## Fase 3 - Transicoes futuras

### Task 10: Enriquecer a transicao do webhook sem bloquear jornada

**Files:**
- Create: `supabase/migrations/20260716124500_health_score_v3_transicoes_atribuicao.sql`
- Modify: `supabase/functions/processar-matricula-emusys/index.ts`
- Modify: `supabase/functions/_shared/jornada-canonica.ts`
- Modify: `tests/passagemBastaoBackend.test.mjs`
- Modify: `tests/periodosProfessorCanonicos.test.mjs`

- [x] **Step 1: Testar campos aditivos**

Adicionar a `aluno_professor_transicoes`: `motivo_saida_id`, `atribuicao_confirmada`, `conta_retencao_professor`, `revisado_por`, `revisado_em` e `periodo_origem_id`, todos nullable/compativeis.

- [x] **Step 2: Testar ordem transacional**

Antes do upsert da jornada: ler periodo atual, gravar transicao/periodo de A, abrir B e seguir com jornada. Falha de enriquecimento e logada, mas nao bloqueia B.

- [x] **Step 3: Implementar migration aditiva**

Nao alterar nem reutilizar `movimentacoes` legada.

- [x] **Step 4: Implementar enriquecimento nao bloqueante**

```ts
try {
  await registrarTransicaoEPeriodos(contexto);
} catch (error) {
  await logarFalhaEnriquecimento(error, contexto.semPii);
}
await upsertJornadaCanonica(contexto.jornadaNova);
```

- [x] **Step 5: Rodar testes de webhook/jornada/passagem**

Run: `node --test tests/passagemBastaoBackend.test.mjs tests/periodosProfessorCanonicos.test.mjs`
Expected: PASS.

**Gate 3:** toda troca futura preserva anterior/novo sem impedir a carteira atual.

Resultado em 17/07/2026: o Gate 3 foi implantado no projeto
`ouqwbbermlzqqvtqwlul`. A RPC `registrar_transicao_professor_v3` grava a
transicao fria e a passagem de bastao na mesma transacao, e liga o evento ao
periodo ativo da ultima reconstrucao concluida por `periodo_origem_id`. As
reconstrucoes concluidas permanecem imutaveis: os eventos futuros sao compostos
com o baseline historico nos read models da Fase 4. O webhook v30 chama a RPC
antes do upsert da jornada, trata a falha como enriquecimento nao bloqueante,
nao copia payload pessoal para o log do Gate e passou a ler os tokens Emusys
somente dos Edge secrets oficiais. A Edge publicada ficou ativa na versao 58.
O smoke transacional com rollback confirmou criacao, idempotencia, uma unica
passagem, resolucao do periodo de origem e zero mutacao dos periodos. A suite
completa terminou com 185/185 testes e o build de producao concluiu. Nenhum
consumidor V2 ou interface produtiva foi migrado.

---

## Fase 4 - Read models dos seis pilares

### Task 11: Criar RPCs V3 em sombra

**Files:**
- Create: `supabase/migrations/20260716130000_health_score_v3_metricas_sombra.sql`
- Create: `tests/healthScoreProfessorV3Metricas.test.mjs`

- [x] **Step 1: Escrever testes de contrato de retorno**

Toda RPC deve retornar `valor_bruto`, `numerador`, `denominador`, `amostra`, `estado_base`, `publicavel`, `confianca`, `fonte`, `regra_versao` e `motivo_sem_base`.

- [x] **Step 2: Exigir ausencia de defaults fabricados**

```js
assert.doesNotMatch(migration, /coalesce\s*\([^,]+,\s*(0|75|100)\s*\)/i);
```

Permitir `COALESCE` apenas em contadores internos cujo denominador/base existam e estiverem explicitamente tipados; revisar manualmente falsos positivos.

- [x] **Step 3: Implementar conversao**

Usar experimental confirmada, credito unico para a ultima experimental anterior em ate 30 dias, matricula direta fora, amostra minima 3 e maturacao D+30.

- [x] **Step 4: Implementar media/turma**

Usar ocupacao unica pessoa+turma regular e agregacao trimestral ponderada por ocupacoes/turmas. Nao usar `alunos.professor_atual_id` nem inferir segunda aula.

- [x] **Step 5: Implementar numero de alunos**

Usar pessoa canonica unica por professor/unidade nos tres fechamentos mensais.

- [x] **Step 6: Implementar retencao**

Usar periodos expostos e encerramentos confirmados com `conta_score_professor=true`; base minima 10; desconhecido fora do numerador negativo.

- [x] **Step 7: Implementar permanencia**

```sql
where p.status_periodo = 'encerrado'
  and p.elegivel_permanencia = true
  and p.publicavel = true
  and p.confianca in ('alta', 'revisado_aprovado')
```

Retornar media, mediana e amostra. Pontuacao somente com amostra >= 3.

- [x] **Step 8: Implementar presenca**

Usar somente `vw_aluno_presenca_semantica_v1`, `data_aula >= date '2026-08-03'`, dez eventos e 95% de cobertura.

- [x] **Step 9: Implementar consolidado recalculado**

Com unidade nula, reunir eventos/vinculos e recalcular o valor bruto. Proibir media dos scores unitarios.

- [x] **Step 10: Aplicar grants seguros**

Sem public/anon. Authenticated apenas via guard por perfil/unidade. Staging nunca e retornado.

- [x] **Step 11: Rodar testes**

Run: `node --test tests/healthScoreProfessorV3Metricas.test.mjs tests/identidadeCarteiraPedagogica.test.mjs tests/frequenciaProfessorCanonica.test.mjs`
Expected: PASS.

**Gate 4:** seis pilares retornam dados auditaveis e `sem_base` real.

Resultado em 17/07/2026: o Gate 4 foi implantado em sombra no projeto
`ouqwbbermlzqqvtqwlul`. As seis RPCs retornam o contrato auditavel completo,
recalculam o consolidado a partir dos eventos e nao publicam base insuficiente
como zero. A media por turma foi otimizada de aproximadamente 19,2 s para
236 ms no recorte auditado, sem alterar os valores. A suite dirigida terminou
com 19/19 testes, a suite oficial completa com 196/196 e o build de producao
concluiu. Nenhum consumidor produtivo foi migrado. Evidencias:
`docs/auditorias/2026-07-17-health-score-professor-v3-gate-4.md`.

---

## Fase 5 - Configuracao, motor e snapshots

### Task 12: Criar configuracao e snapshots versionados

**Files:**
- Create: `supabase/migrations/20260717170000_health_score_v3_config_snapshots.sql`
- Create: `supabase/migrations/20260717173000_health_score_v3_service_role_readonly.sql`
- Create: `supabase/migrations/20260717174500_health_score_v3_fk_indexes.sql`
- Create: `tests/healthScoreProfessorV3Snapshots.test.mjs`

- [x] **Step 1: Escrever testes de versao e imutabilidade**

Exigir seis metricas, soma 100, vigencia sem sobreposicao, snapshot fechado imutavel, retificacao por nova revisao e ausencia de grants anon/public.

- [x] **Step 2: Criar tabelas pai/filha**

Usar nomes da SPEC e constraints referenciais.

- [x] **Step 3: Criar RPC de ativacao**

`ativar_health_score_professor_v3_config(p_config_id, p_justificativa)` valida tudo em transacao. Versao usada por snapshot fechado nao e editavel.

- [x] **Step 4: Criar RPC de materializacao**

`materializar_health_score_professor_v3(p_competencia, p_config_versao, p_modo)` chama as seis metricas, calcula notas/cobertura e persiste pai/filhas.

- [x] **Step 5: Criar trigger de imutabilidade**

Bloquear `UPDATE/DELETE` de snapshot fechado, exceto alteracao controlada de estado para `invalidado` via RPC de retificacao.

- [x] **Step 6: Inserir configuracao inicial rascunho**

```text
retencao 25
permanencia 25
conversao 15
media_turma 15
numero_alunos 10
presenca 10
```

Peso, meta, valor real e nota permanecem separados. Media/turma e numero de
alunos possuem metas aprovadas; conversao e permanencia seguem em calibracao;
retencao e presenca permanecem explicitamente sem meta. O motor nao inventa
notas nem metas.

- [x] **Step 7: Rodar testes**

Run: `node --test tests/healthScoreProfessorV3Snapshots.test.mjs tests/healthScoreProfessorV3Metricas.test.mjs`
Expected: PASS.

### Task 13: Calibrar metas sem ativar configuracao

**Files:**
- Create: `docs/auditorias/2026-07-17-health-score-professor-v3-calibracao.md`

- [x] **Step 1: Gerar distribuicoes P50/P75/P90**

Separar por unidade e consolidado, mas nao criar metas automaticas por instrumento.

- [x] **Step 2: Mostrar impacto dos candidatos**

Simular ranking, cobertura e quantidade de scores por faixa para cada meta candidata.

- [x] **Step 3: Obter decisao da autoridade pedagogica**

Registrar meta aprovada, justificativa e vigencia. Somente entao ativar config.

Alf homologou a meta trimestral inicial de conversao em `70%` em 18/07/2026.
A distribuicao canonica de 2026-Q2 apresentou P90 `66,67%`; a meta foi
arredondada para 70 e registrada com evidencia, autoridade e justificativa.

Resultado tecnico adicional em 18/07/2026: Peterson e mais 12
professores-unidade foram auditados no historico integral de 2018 a 16/07/2026.
A amostra de 12 ficou com P50 `11,16`, P75 `13,51` e P90 `14,32`; as 55 linhas
atualmente publicaveis da rede ficaram com P75 `12,01`. Alf aprovou em
18/07/2026 a meta operacional `> 12 meses`. Ela foi registrada na configuracao
V1 em sombra como `meta = 12`, com comparador `>`, sem ativar a configuracao e
sem migrar consumidores. Evidencias:
`docs/auditorias/2026-07-18-permanencia-amostra-12-professores.md`.

**Gate 5:** fechado em 18/07/2026. Motor versionado e snapshots imutaveis
implantados; metas iniciais de conversao `70%` e permanencia `12 meses`
homologadas; configuracao V1 ativada exclusivamente para execucao em sombra.
Retencao permanece sem meta ate possuir dados reais e presenca inicia em
03/08/2026. Nenhum consumidor V2 foi migrado.

---

## Fase 6 - Execucao em sombra

### Task 14: Criar comparador V2 x V3

**Files:**
- Create: `docs/auditorias/2026-07-18-health-score-professor-v3-gate-6-sombra.md`
- Modify: `scripts/verify-health-score-professor-v3.sql`

- [x] **Step 1: Materializar snapshots provisorios**

Julho foi materializado em 129 snapshots porque a V1 vigora a partir de
01/07/2026. Junho permanece como baseline SELECT-only das RPCs do Gate 4; nao
se retroage uma configuracao temporal para fabricar snapshot anterior.
Agosto/setembro incluem presenca somente a partir de 03/08.

- [x] **Step 2: Comparar por professor/unidade/pilar**

Listar V2, V3, delta, fonte V2, fonte V3, amostra, cobertura, confianca e explicacao.

- [x] **Step 3: Conferir lista ouro da coordenacao**

Validar numero de alunos e media/turma para os professores ja auditados, mais casos multiunidade e dois cursos.

- [x] **Step 4: Auditar permanencia nominalmente**

Conferir pelo menos dez periodos encerrados por unidade, incluindo abaixo/acima de quatro meses.
Separar no retorno a media historica dos vinculos encerrados da idade media da
carteira ativa. A mediana permanece apenas em diagnostico tecnico. Nao publicar
uma amostra parcialmente revisada como permanencia oficial.

- [x] **Step 5: Rodar seguranca e desempenho**

Consultar grants, RLS, explain analyze das RPCs e Supabase advisors. Nenhuma RPC V3 pode estar publica/anon.

- [x] **Step 6: Rodar suite completa**

Run: `node --test tests/*.test.mjs`
Resultado em 18/07/2026: `232/232` PASS.

- [x] **Step 7: Rodar build**

Run: `npm run build`
Resultado em 18/07/2026: exit `0`; avisos preexistentes de chunk/Recharts sem
relacao com o motor V3.

**Gate 6:** fechado tecnicamente em sombra em 18/07/2026. Diferencas foram
preservadas no comparador, seguranca foi endurecida, nenhum snapshot foi
publicado, suite `232/232` e build de producao aprovados.

---

## Fase 7 - Frontend V3 e sliders em homologacao

### Task 15: Criar tipos e hooks V3 sem substituir hooks V2

**Files:**
- Create: `src/lib/healthScoreProfessorV3.ts`
- Create: `src/hooks/useHealthScoreProfessorV3.ts`
- Create: `src/hooks/useHealthScoreProfessorV3Config.ts`
- Create: `tests/healthScoreProfessorV3Frontend.test.mjs`

- [x] **Step 1: Escrever tipos**

```ts
export type HealthMetricKeyV3 =
  | 'retencao'
  | 'permanencia'
  | 'conversao'
  | 'media_turma'
  | 'numero_alunos'
  | 'presenca';

export interface HealthMetricSnapshotV3 {
  metrica: HealthMetricKeyV3;
  valorBruto: number | null;
  numerador: number | null;
  denominador: number | null;
  amostra: number;
  nota: number | null;
  peso: number;
  publicavel: boolean;
  motivoSemBase: string | null;
}
```

- [x] **Step 2: Implementar hook somente leitura de sombra**

O hook recebe professor/unidade/competencia e nao faz fallback para V2 nem para zero.

- [x] **Step 3: Implementar hook de config rascunho**

Uma configuracao ativa e imutavel. Ao editar, o hook clona a versao ativa para
um novo `rascunho`; salvar nunca altera a ativa. Ativacao e acao separada e
exige vigencia, autor e justificativa.

- [x] **Step 4: Rodar teste**

Run: `node --test tests/healthScoreProfessorV3Frontend.test.mjs`
Expected: PASS.

### Task 16: Criar pesos e metas V3 separados

**Files:**
- Create: `src/components/App/Professores/HealthScoreV3Config.tsx`
- Modify: `src/components/App/Professores/ProfessoresPage.tsx`
- Modify: `tests/healthScoreProfessorV3Frontend.test.mjs`

- [x] **Step 1: Testar os seis fatores novos**

Exigir ausencia de crescimento/fator de demanda/evasao duplicada e presenca explicita.

- [x] **Step 2: Implementar painel protegido por feature flag**

Exibir versao, status rascunho/ativa, vigencia, soma de pesos, metas e
justificativa. Os sliders controlam somente os pesos. Cada pilar possui campo
numerico de meta separado, unidade visivel e estado
`aprovada/rascunho/sem_dados/bloqueada`. Antes da ativacao, a coordenacao deve
simular o impacto da nova versao. Nao substituir `HealthScoreConfig` V2.

O navegador nao escreve diretamente nas tabelas: toda gravacao usa RPC
protegida por `professores.editar`, com trilha de autoria. Nova meta ou peso
vale somente a partir da vigencia escolhida e nunca recalcula snapshots
fechados.

- [x] **Step 3: Validar layout desktop/mobile**

Usar Playwright/browser com coordenacao logada; confirmar que sliders nao alteram dimensoes nem estouram texto.

- [x] **Step 4: Rodar build e teste**

Run: `node --test tests/healthScoreProfessorV3Frontend.test.mjs`
Run: `npm run build`
Expected: PASS/exit 0.

**Gate 7:** fechado tecnicamente em 18/07/2026. A coordenacao consegue criar
rascunho, ajustar pesos e metas separadamente, salvar, simular e ativar uma
nova versao futura sem publicar snapshots nem alterar V2. A ativacao exige no
banco uma simulacao persistida da revisao exata do rascunho; qualquer mudanca
posterior invalida essa simulacao. O painel foi validado no navegador em
desktop e viewport mobile. O shell legado continua com largura minima e
rolagem horizontal em telas estreitas, sem alterar a composicao interna do
painel V3.

---

## Fase 8 - Cutover individual de consumidores

### Task 17: Migrar modal individual sob feature flag

**Files:**
- Modify: `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx`
- Modify: `tests/healthScoreProfessorV3Frontend.test.mjs`

- [ ] Adicionar leitura V3 quando flag ativa.
- [ ] Exibir valor, base, cobertura e recorte de cada pilar.
- [ ] Exibir `sem_base`, nunca zero substituto.
- [ ] Testar rollback desligando flag.
- [ ] Validar com Playwright em professor com base completa e incompleta.

### Task 18: Migrar tabela Performance e rankings

**Files:**
- Modify: `src/components/App/Professores/TabPerformanceProfessores.tsx`
- Modify: `tests/healthScoreProfessorV3Frontend.test.mjs`

- [ ] Trocar somente depois da homologacao do modal.
- [ ] Ordenar publicaveis; `sem_base` fica separado e nao recebe score 0.
- [ ] Conferir totais, rankings, status e competencia.
- [ ] Testar feature flag e rollback.

### Task 19: Migrar configuracao oficial

**Files:**
- Modify: `src/components/App/Professores/ProfessoresPage.tsx`

- [ ] Mostrar V3 como oficial somente depois da virada da Performance.
- [ ] Preservar acesso somente leitura ao historico V2 durante janela de observacao.
- [ ] Bloquear edicao de versao ativa/fechada.

### Task 20: Migrar relatorios de professor/coordenacao

**Files:**
- Modify: `src/components/App/Professores/ModalRelatorioCoordenacao.tsx`
- Modify: `src/lib/relatorioCoordenacaoInstantaneo.ts`
- Modify: `supabase/functions/gemini-relatorio-professor-individual/index.ts`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`

- [ ] Passar snapshot V3 estruturado para os geradores.
- [ ] Proibir o modelo de recalcular metricas ou inventar valores sem base.
- [ ] Comparar texto com snapshot campo a campo.
- [ ] Manter rollback para fonte V2.

### Task 21: Migrar Dashboard/Analytics e agentes autorizados

**Files:**
- Identificar no inventario da Task 1 os arquivos exatos vivos antes de editar.
- Modify: somente consumidores confirmados como ativos.

- [ ] Migrar um consumidor por vez.
- [ ] Testar unidade, competencia, consolidado e sem_base.
- [ ] Garantir que Fabio/LA Teacher nao recebem financeiro ou payload bruto.
- [ ] Observar logs antes do proximo consumidor.

**Gate 8:** todos os consumidores homologados usam snapshots V3; rollback individual testado.

---

## Fase 9 - Documentacao, verificacao e fechamento

### Task 22: Atualizar mapas canonicos

**Files:**
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`

- [ ] Registrar staging, periodos, metricas, snapshots, Edge, grants e consumidores.
- [ ] Marcar V2 como historica somente depois do cutover completo.
- [ ] Registrar corte de quatro meses e inicio de presenca em 03/08/2026.
- [ ] Registrar que IDs Emusys sao escopados por unidade.

### Task 23: Verificacao final

**Files:**
- Modify: `docs/auditorias/2026-07-16-health-score-professor-v3-sombra.md`

- [ ] Run: `node --test tests/*.test.mjs`
  Expected: todos PASS.
- [ ] Run: `npm run build`
  Expected: exit 0.
- [ ] Run: `git diff --check`
  Expected: sem erros.
- [ ] Confirmar Supabase advisors de seguranca e desempenho.
- [ ] Verificar no browser Performance, modal, Configuracoes e relatorio.
- [ ] Comparar pelo menos um professor por unidade e um multiunidade.
- [ ] Confirmar que relatorios gerencial, administrativo e comercial permanecem iguais.
- [ ] Confirmar que churn continua pausado/fora do escopo.

### Task 24: Integracao Git somente apos autorizacao

- [ ] Buscar remoto e inspecionar commits do Hugo.
- [ ] Integrar sem descartar alteracoes locais do usuario.
- [ ] Reexecutar suite/build depois da integracao.
- [ ] Revisar `git diff --stat` e arquivos staged.
- [ ] Fazer commit descritivo e push somente com autorizacao do usuario.

---

## Portoes resumidos

| Gate | Condicao para avancar |
|---|---|
| 0 | baseline e inventario V2 congelados |
| 1 | staging/Edge isolados, retomaveis e idempotentes |
| 2 | piloto nominal aprovado nas tres unidades |
| 3 | trocas futuras preservam anterior/novo sem bloquear jornada |
| 4 | seis pilares V3 auditaveis e sem defaults fabricados |
| 5 | configuracao homologada e snapshots imutaveis |
| 6 | sombra comparada, seguranca e nao regressao aprovadas |
| 7 | sliders e simulacao V3 sem publicar |
| 8 | cutover individual concluido com rollback |

## Stop conditions

Parar e reportar antes de avancar se ocorrer qualquer um:

- endpoint Emusys retorna IDs com semantica diferente da amostra auditada;
- rate limit real e menor que o documentado;
- staging tenta escrever em tabela produtiva;
- periodo publicavel depende somente de nome;
- periodos se sobrepoem sem explicacao;
- regra de quatro meses diverge da fonte aprovada;
- snapshot fechado pode ser alterado;
- RPC V3 fica acessivel a anon/public;
- V2 ou relatorios nao relacionados mudam durante a sombra;
- coordenacao nao homologa o piloto ou as metas.
