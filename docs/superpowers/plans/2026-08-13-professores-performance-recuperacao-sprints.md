# Professores Performance — Recuperação do Health Score V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restabelecer a aba Performance de Professores em Consolidado e Unidade, nas visões Mensal e Ciclo, com roster completo, estados parciais honestos, snapshots atualizados, histórico navegável e nenhuma classificação ou ranking indevido.

**Architecture:** O contrato canônico passa a materializar uma matriz completa de seis métricas para cada professor ativo, mantendo somente cinco pilares pontuáveis e peso pontuável total governado de 90. A materialização aberta tolera falha individual de cobertura sem congelar o escopo, mas registra a anomalia e impede publicação/ranking; fechamentos oficiais continuam estritos. O cron calcula cada escopo uma única vez, a UI separa erro, ausência, parcialidade e defasagem, e o histórico ganha lifecycle explícito de fechamento sem reescrever snapshots existentes.

**Tech Stack:** PostgreSQL/Supabase, migrations SQL append-only, React 19 + TypeScript, Vite, Node `node:test`, fixtures PostgreSQL 17 em Docker e navegador autenticado para E2E.

---

## 1. Relação com os documentos anteriores

Este plano substitui operacionalmente `docs/superpowers/plans/2026-08-13-professores-performance-retrato-incompleto.md`. A investigação `docs/auditorias/2026-08-13-health-score-v3-conflitos-regras.md` continua como evidência histórica, mas sua execução deve considerar estas correções:

- o contrato possui seis métricas materializadas, cinco pilares pontuáveis e peso pontuável total atual de 90;
- `numero_alunos` é diagnóstico e não participa da nota;
- as configurações v4 e v3 têm vigências adjacentes, não sobrepostas;
- `papel = NULL` existe em revisões antigas, mas não desvia o fast path das revisões elegíveis atuais;
- a causa de performance do cron não pode ser atribuída a lock, plano ou autovacuum sem medição; há cálculo estruturalmente duplicado no fluxo atual;
- o fechamento de ciclo perde `papel`, `codigo_evidencia` e `peso_efetivo`, e precisa ser corrigido antes do primeiro fechamento oficial.

## 2. Princípios e limites

- Não editar migrations já aplicadas; toda mudança de banco entra em nova migration.
- Não preencher falta de evidência com zero.
- Não criar exceção por nome ou `professor_id` para Jonathan, Matheus ou Jeyson.
- Não reescrever nem fazer backfill em snapshots fechados ou revisões históricas.
- Não promover snapshot parcial a oficial para destravar a interface.
- Não habilitar ranking mensal; ranking exige ciclo fechado, oficial, publicável e comparável.
- Não misturar correção de código com rematerialização, deploy ou escrita em produção.
- Não considerar HTTP 200, build verde ou deployment `Ready` como prova E2E.
- Preservar as alterações pendentes da página de Alunos, que não pertencem a este plano.

### Janela sugerida

| Sprint | Entrega | Esforço técnico sugerido |
|---|---|---:|
| 0 | Baseline, errata e testes vermelhos | 0,5–1 dia |
| 1 | Matriz completa e cobertura governada | 1–2 dias |
| 2 | Materialização resiliente e cron | 1–2 dias |
| 3 | Lifecycle e fechamento histórico | 1–2 dias |
| 4 | Interface não bloqueante | 1 dia |
| 5 | Regressão integrada e documentação | 1 dia |
| 6 | Rollout e E2E | 0,5–1 dia, após autorização |
| 7 | Observação | 3 execuções diárias consecutivas |

As durações são uma referência para organização da equipe. Cada checkpoint, e não a data estimada, decide se a próxima sprint pode começar.

## 3. Mapa de arquivos previsto

### Banco e migrations

- Create: `supabase/migrations/20260813190000_health_score_v3_matriz_roster_cobertura.sql`
  - completa `roster × seis métricas` no agregador canônico;
  - deriva cinco pilares e peso pontuável do catálogo da configuração, não das linhas presentes;
  - recria leitores afetados preservando ACL.
- Create: `supabase/migrations/20260813193000_health_score_v3_materializacao_resiliente.sql`
  - elimina a segunda execução do produtor no mesmo escopo;
  - registra professor/métrica ausente e materialização parcial aberta;
  - mantém fechamento oficial estrito.
- Create: `supabase/migrations/20260813200000_health_score_v3_fechamento_integral.sql`
  - copia integralmente campos governados no fechamento;
  - adiciona fechamento mensal diagnóstico sem ranking;
  - preserva append-only.
- Create: `supabase/migrations/20260813203000_health_score_v3_lifecycle_cron.sql`
  - agenda apenas períodos elegíveis;
  - mantém materialização aberta separada do fechamento.

### Frontend

- Modify: `src/lib/healthScoreProfessorV3Periodos.ts`
- Modify: `src/hooks/useHealthScoreProfessorV3Performance.ts`
- Modify: `src/lib/healthScoreProfessorV3Performance.ts`
- Modify: `src/components/App/Professores/TabPerformanceProfessores.tsx`

### Testes

- Create: `tests/healthScoreProfessorV3RosterCompletoPostgres.test.mjs`
- Create: `tests/healthScoreProfessorV3MaterializacaoResilientePostgres.test.mjs`
- Create: `tests/healthScoreProfessorV3FechamentoIntegralPostgres.test.mjs`
- Create: `tests/healthScoreProfessorV3PerformanceParcialUi.test.mjs`
- Create: `tests/healthScoreProfessorV3CompetenciaConsulta.test.mjs`
- Modify: `tests/healthScoreProfessorV3CronDiario.test.mjs`
- Modify: `tests/healthScoreProfessorV3SnapshotReader.test.mjs`
- Modify: `tests/healthScoreProfessorV3CicloMensalContrato.test.mjs`
- Modify: `tests/healthScoreProfessorV3CoberturaPilaresCanonica.test.mjs`

### Documentação

- Modify: `docs/auditorias/2026-08-13-health-score-v3-conflitos-regras.md`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`

## 4. Estratégia de branches e commits

- Criar worktree dedicada a partir do `main` atualizado, sem carregar as mudanças pendentes de Alunos.
- Um commit por sprint funcional; não combinar migrations, rematerialização e deploy no mesmo commit operacional.
- Antes de cada checkpoint, registrar `branch`, `HEAD`, `git status --short` e migrations presentes somente local/remoto.
- Commits sugeridos:
  1. `test: congela regressao do retrato de professores`
  2. `fix: completa matriz canonica do health score v3`
  3. `fix: torna materializacao v3 resiliente e idempotente`
  4. `fix: governa fechamento mensal e de ciclo v3`
  5. `fix: mantem performance visivel com retrato parcial`
  6. `docs: atualiza operacao do health score professor v3`

---

## Sprint 0 — Baseline, errata e contratos vermelhos

**Objetivo:** congelar o defeito real e impedir que os falsos positivos da auditoria virem implementação.

### Task 0.1: Registrar baseline reproduzível

- [ ] Capturar, somente em leitura, para Consolidado, Barra, Campo Grande e Recreio:
  - roster ativo;
  - quantidade do leitor mensal e ciclo;
  - competência/revisão do snapshot mais recente;
  - `retrato_defasagem_minutos`;
  - quantidade de métricas por professor;
  - status das cinco últimas execuções do cron.
- [ ] Salvar no documento de auditoria a hora da coleta e a equação `roster - reader = ausentes`, sem atualizar dados remotos.
- [ ] Corrigir no documento os termos `6 pilares`, `peso 100`, `configurações sobrepostas`, `fastpath morto` e a hipótese não demonstrada de autovacuum.

### Task 0.2: Criar os testes que falham antes da correção

- [ ] Em `tests/healthScoreProfessorV3RosterCompletoPostgres.test.mjs`, criar fixture com:
  - professor ativo recém-vinculado e sem retenção/permanência;
  - professor ativo sem nenhuma turma elegível;
  - professor com todas as fontes;
  - uma unidade adicional para provar isolamento.
- [ ] Exigir exatamente estas seis métricas por professor:

```js
assert.deepEqual(metricas, [
  'conversao',
  'media_turma',
  'numero_alunos',
  'permanencia',
  'presenca',
  'retencao',
]);
```

- [ ] Exigir `pilares_esperados = 5`, `peso_pontuavel_total = 90` e `numero_alunos.papel = 'diagnostico'`.
- [ ] Exigir que ausência de fonte produza `estado_base = 'sem_base'`, nota/valor nulos, `peso_disponivel = false`, `peso_efetivo = 0` e motivo causal não vazio.
- [ ] Em `tests/healthScoreProfessorV3MaterializacaoResilientePostgres.test.mjs`, provar que um professor inesperadamente incompleto não apaga snapshots válidos dos demais e gera execução `parcial` auditável.
- [ ] Executar os testes e registrar falha pelos contratos atuais, não por erro de setup.

Comando:

```powershell
node --test tests/healthScoreProfessorV3RosterCompletoPostgres.test.mjs tests/healthScoreProfessorV3MaterializacaoResilientePostgres.test.mjs
```

Resultado esperado antes da implementação: `FAIL` nas asserções de matriz completa, denominador governado e isolamento por professor.

### Checkpoint 0 — Diagnóstico congelado

**GO somente se:**

- os três casos reais aparecem na fixture por condição de dados, sem IDs especiais;
- a baseline remota permanece somente leitura;
- os testes falham pelo defeito reproduzido;
- a errata deixa explícitos seis métricas, cinco pilares e peso 90.

**STOP se:** a fixture precisar copiar dados pessoais de produção, se o leitor atual não reproduzir as contagens ou se houver drift de migrations entre local e remoto.

---

## Sprint 1 — Contrato canônico completo e cobertura correta

**Objetivo:** garantir uma linha por métrica para todo professor ativo e calcular comparabilidade contra o catálogo governado.

### Task 1.1: Completar a matriz no agregador canônico

- [ ] Criar `20260813190000_health_score_v3_matriz_roster_cobertura.sql`.
- [ ] Formar o roster a partir de `professores_unidades` ativos e unidades permitidas no recorte.
- [ ] Cruzar o roster com o catálogo fixo de seis métricas e fazer `left join` sobre as métricas realmente produzidas.
- [ ] Para linha ausente, emitir estado sem base específico por métrica; não inventar amostra, nota, numerador ou denominador.
- [ ] Fazer o consolidado retornar um professor uma única vez, mesmo com vínculo em mais de uma unidade.
- [ ] Preservar `codigo_evidencia`, `papel`, `detalhes`, `fonte`, `regra_versao`, config e período.

Contrato SQL que os testes devem validar:

```sql
select professor_id, count(distinct metrica) as metricas
from public.get_health_score_professor_v3_performance($1, $2, $3)
group by professor_id
having count(distinct metrica) <> 6;
-- esperado: 0 linhas
```

### Task 1.2: Fixar o denominador no catálogo da configuração

- [ ] Derivar `pilares_esperados` de `health_score_professor_v3_config_metricas`, excluindo `numero_alunos` pelo papel diagnóstico.
- [ ] Derivar `peso_pontuavel_total` do mesmo catálogo; com a configuração atual, o resultado precisa ser 90.
- [ ] Manter `score_observado` calculável com evidência parcial.
- [ ] Manter `score_comparavel` e `classificacao` nulos abaixo dos gates de comparabilidade.
- [ ] Reutilizar a mesma regra nos leitores V1 e V2 para impedir divergência entre snapshot atual e compatibilidade legada.

### Task 1.3: Preservar segurança e consumidores

- [ ] Reaplicar `SECURITY DEFINER`, `search_path`, `REVOKE` de `anon` e grants atuais após cada `CREATE OR REPLACE FUNCTION`.
- [ ] Provar que os relatórios não transformam `score_observado` em ranking.
- [ ] Provar que as configurações ativas e snapshots existentes não foram atualizados.

Comando de verificação:

```powershell
node --test tests/healthScoreProfessorV3RosterCompletoPostgres.test.mjs tests/healthScoreProfessorV3CoberturaPilaresCanonica.test.mjs tests/healthScoreProfessorV3ComparabilidadePostgres.test.mjs tests/healthScoreProfessorV3SnapshotReader.test.mjs
```

Resultado esperado: todos passam; fixture retorna 6 métricas, 5 pilares esperados e peso 90.

### Checkpoint 1 — Contrato íntegro

**GO somente se:**

- Jonathan, Matheus e Jeyson são representados pela regra genérica da fixture;
- todos os professores do roster produzem seis linhas;
- nenhum score/classificação muda para professores com seis linhas antes e depois da migration, salvo correção explicitamente explicada;
- V1 e V2 produzem os mesmos campos de comparabilidade para a mesma revisão;
- ACL não fica mais permissiva.

**Rollback preparado:** migration inversa deve restaurar apenas definições de funções; não deve apagar snapshots nem alterar configuração.

---

## Sprint 2 — Materialização resiliente e cron abaixo do teto

**Objetivo:** evitar congelamento do escopo e remover o cálculo duplicado que aproxima o cron do limite de 120 segundos.

### Task 2.1: Calcular cada escopo uma única vez

- [ ] Criar `20260813193000_health_score_v3_materializacao_resiliente.sql`.
- [ ] No executor de escopo, materializar uma única chamada ao produtor em `pg_temp.health_score_v3_diario_fonte`.
- [ ] Calcular o fingerprint ordenado usando essa tabela temporária.
- [ ] Se houver mudança, persistir snapshots usando a mesma tabela temporária; não chamar novamente `get_health_score_professor_v3_performance`.
- [ ] Manter idempotência: fingerprint igual gera `sem_alteracao` e nenhuma revisão nova.

Teste estrutural obrigatório:

```js
assert.equal(
  (sql.match(/get_health_score_professor_v3_performance\s*\(/gi) || []).length,
  1,
);
```

### Task 2.2: Isolar anomalia individual no período aberto

- [ ] Validar seis métricas por professor na fonte temporária.
- [ ] Persistir os professores completos.
- [ ] Não persistir o professor incompleto inesperado.
- [ ] Registrar execução `parcial`, com `professor_id`, métricas ausentes, unidade, competência e periodicidade em payload auditável.
- [ ] Manter `ranking_habilitado = false` e publicação parcial para toda materialização aberta.
- [ ] Manter hard fail no fechamento oficial se o roster elegível não estiver integral ou se algum pilar pontuável violar a política oficial.

### Task 2.3: Medir antes de dividir o cron

- [ ] Rodar `EXPLAIN (ANALYZE, BUFFERS)` em fixture ou ambiente autorizado para unidade e consolidado, uma vez com cache frio observável e uma vez aquecido.
- [ ] Registrar tempo, buffers, temp read/write e a função dominante.
- [ ] Executar o cron completo em ambiente não produtivo três vezes.
- [ ] Manter um job sequencial se todas as execuções ficarem abaixo de 75 segundos.
- [ ] Se qualquer execução atingir 75 segundos, dividir em jobs independentes por escopo, escalonados e com mesma função idempotente; não adotar Edge Function sem necessidade demonstrada.

Comando de verificação:

```powershell
node --test tests/healthScoreProfessorV3CronDiario.test.mjs tests/healthScoreProfessorV3MaterializacaoResilientePostgres.test.mjs tests/healthScoreProfessorV3SnapshotRevisaoEncadeada.test.mjs
```

### Checkpoint 2 — Recuperação automática segura

**GO somente se:**

- cada escopo executa o produtor uma vez;
- falha individual gera estado parcial e não apaga os demais;
- execução idêntica não cria revisão;
- três execuções de ensaio ficam abaixo do orçamento definido, ou os jobs foram isolados;
- nenhum fechamento oficial aceita roster incompleto.

**STOP se:** o ganho de tempo for inferido sem `EXPLAIN ANALYZE`, se o cron continuar acima de 90 segundos ou se a solução depender de aumentar o timeout da plataforma.

---

## Sprint 3 — Lifecycle histórico e fechamento sem perda de dados

**Objetivo:** tornar períodos anteriores explicitamente disponíveis ou explicitamente pendentes, preservando todos os campos governados.

### Task 3.1: Corrigir o fechamento de ciclo

- [ ] Criar `20260813200000_health_score_v3_fechamento_integral.sql`.
- [ ] Recriar `fechar_health_score_professor_v3_ciclo` copiando também `peso_efetivo`, `codigo_evidencia` e `papel`.
- [ ] Comparar origem e destino por métrica antes de confirmar o fechamento.
- [ ] Exigir que snapshot fechado continue encadeado por `snapshot_anterior_id`.
- [ ] Impedir alteração e exclusão posteriores pelos triggers existentes.

Asserção de integridade:

```sql
select count(*)
from public.health_score_professor_v3_snapshot_metricas origem
join public.health_score_professor_v3_snapshot_metricas fechado
  on fechado.metrica = origem.metrica
where origem.snapshot_id = $1
  and fechado.snapshot_id = $2
  and (origem.papel, origem.codigo_evidencia, origem.peso_efetivo)
      is distinct from
      (fechado.papel, fechado.codigo_evidencia, fechado.peso_efetivo);
-- esperado: 0
```

### Task 3.2: Criar fechamento mensal diagnóstico

- [ ] Criar função protegida `fechar_health_score_professor_v3_mensal(date, text)`.
- [ ] Exigir competência anterior ao mês atual e janela D+30 concluída.
- [ ] Criar revisão `fechado/oficial` append-only para leitura histórica.
- [ ] Manter `ranking_habilitado = false` em todo snapshot mensal.
- [ ] Registrar justificativa, ator, data de corte, config e snapshot de origem.
- [ ] Não fechar mensal se a fonte não tiver seis métricas por professor ou se houver auditoria real bloqueante.

### Task 3.3: Automatizar somente períodos elegíveis

- [ ] Criar `20260813203000_health_score_v3_lifecycle_cron.sql`.
- [ ] Separar cron de materialização aberta do cron de fechamento.
- [ ] O job de lifecycle deve procurar apenas competências cuja janela terminou e que ainda não possuem revisão oficial.
- [ ] Tratar `nenhum snapshot apto` como estado observável e não como loop infinito silencioso.
- [ ] Não rematerializar período fechado.

Comando de verificação:

```powershell
node --test tests/healthScoreProfessorV3FechamentoIntegralPostgres.test.mjs tests/healthScoreProfessorV3CicloMensalPostgres.test.mjs tests/healthScoreProfessorV3Snapshots.test.mjs tests/healthScoreProfessorV3MutacaoControlada.test.mjs
```

### Checkpoint 3 — Histórico governado

**GO somente se:**

- fechamento preserva todos os campos byte a byte;
- mensal histórico é oficial para leitura, mas nunca rankeável;
- ciclo aberto continua parcial e sem ranking;
- ciclo fechado permanece imutável;
- ausência de competência fechada retorna estado distinguível de erro técnico.

**Gate de produção:** nenhuma função de fechamento será chamada em produção antes de revisão humana da competência, contagem do roster, janela D+30 e snapshots candidatos.

---

## Sprint 4 — Interface utilizável com parcialidade e defasagem

**Objetivo:** manter a equipe trabalhando mesmo quando um retrato individual estiver ausente, sem mascarar erro ou dado velho.

### Task 4.1: Corrigir a competência de consulta do ciclo

- [ ] Em `healthScoreProfessorV3Periodos.ts`, separar `periodoSelecionado` de `competenciaConsulta`.
- [ ] Para ciclo aberto, usar o mês corrente contido no ciclo como referência de consulta.
- [ ] Para ciclo histórico, usar a referência canônica e exigir snapshot fechado/oficial.
- [ ] Cobrir a virada `Dez–Jan–Fev` sem tratar o ciclo como três anos ou três competências independentes.
- [ ] Passar a referência resolvida pelo hook sem recalcular a regra no componente.

### Task 4.2: Remover o bloqueio total por cobertura parcial

- [ ] Manter o retorno bloqueante somente durante loading inicial e erro técnico sem payload confiável.
- [ ] Renderizar banner não bloqueante quando `healthV3SnapshotCoverageIncomplete` for verdadeiro.
- [ ] Usar `mergeHealthScoreV3ActiveRoster` para manter todos os professores visíveis.
- [ ] Placeholder deve permanecer `sem_base_operacional`, sem score comparável, classificação ou ranking.
- [ ] Exibir a equação `X de Y retratos disponíveis` e a competência do retrato.
- [ ] Não incluir placeholders nas médias, taxas ou rankings.

### Task 4.3: Exibir defasagem e estados históricos

- [ ] Mostrar aviso quando o retrato aberto ultrapassar 26 horas sem atualização.
- [ ] Diferenciar mensagens:
  - falha RPC: `Dados de Performance indisponíveis`;
  - zero snapshots no período aberto: `Retrato sendo preparado`;
  - cobertura parcial: `Retrato parcial: X de Y`;
  - histórico elegível ainda não fechado: `Competência aguardando fechamento`;
  - snapshot velho: `Retrato desatualizado desde ...`.
- [ ] Manter filtros, unidade, Mensal/Ciclo, busca e tabela montados nos estados parcial e defasado.

### Task 4.4: Congelar a regressão no frontend

- [ ] Criar `healthScoreProfessorV3PerformanceParcialUi.test.mjs` cobrindo os cinco estados acima.
- [ ] Criar `healthScoreProfessorV3CompetenciaConsulta.test.mjs` cobrindo Jun–Ago aberto, ciclo histórico e Dez–Fev.
- [ ] Provar que ranking filtra `estado_publicacao`, `ranking_habilitado`, publicável e comparável.
- [ ] Provar que agregados usam apenas `scoreComparavel` não nulo.

Comando de verificação:

```powershell
node --test tests/healthScoreProfessorV3PerformanceParcialUi.test.mjs tests/healthScoreProfessorV3CompetenciaConsulta.test.mjs tests/healthScoreProfessorV3SnapshotReader.test.mjs tests/healthScoreProfessorV3FrontendCicloPrincipal.test.mjs tests/healthScoreProfessorV3ComparabilidadeFrontend.test.mjs
npm run build
```

### Checkpoint 4 — Página operacional

**GO somente se:**

- uma ausência individual não desmonta a página;
- erro RPC não vira `sem_base`;
- snapshot velho fica visivelmente marcado;
- mensal/ciclo e unidade/consolidado continuam trocáveis;
- nenhum parcial aparece em ranking ou média comparável;
- build e testes focados passam.

---

## Sprint 5 — Regressão integrada e documentação operacional

**Objetivo:** provar que a correção não quebra consumidores saudáveis nem cria duas verdades para o Health Score.

### Task 5.1: Rodar suíte integrada

- [ ] Executar testes de produtor, comparabilidade, materializador, snapshots, leitores, relatórios e frontend.
- [ ] Executar `npm test` e `npm run build`.
- [ ] Corrigir qualquer teste que ainda espere seis pilares pontuáveis ou peso 100; não relaxar asserções para fazê-las passar.

Comando mínimo:

```powershell
$healthTests = Get-ChildItem tests -Filter 'healthScoreProfessorV3*.test.mjs' | ForEach-Object { $_.FullName }
$professorTests = Get-ChildItem tests -Filter 'professores*.test.mjs' | ForEach-Object { $_.FullName }
node --test $healthTests $professorTests
npm test
npm run build
```

Resultado esperado: zero falhas; skips somente quando Docker estiver realmente indisponível e explicitamente registrado.

### Task 5.2: Provar paridade dos consumidores

- [ ] Comparar antes/depois para professores que já tinham seis métricas.
- [ ] Conferir tabela, modal, relatório gerencial e relatórios da Coordenação.
- [ ] Registrar universo contado, competência e timestamp em toda divergência.
- [ ] Fazer smoke de Cadastro, Carteira, Agenda, 360°, Divergências, Checklists e Configurações.

### Task 5.3: Atualizar documentação

- [ ] Atualizar `MAPA-SISTEMA.md` com matriz, materialização aberta, fechamento e leitores.
- [ ] Atualizar `METRICAS.md` com seis métricas, cinco pilares, peso 90 e regras de comparabilidade.
- [ ] Atualizar a auditoria com a situação corrigida e riscos residuais.
- [ ] Documentar consulta de saúde do cron, critério de defasagem e procedimento de fechamento.

### Checkpoint 5 — Pronto para rollout

**GO somente se:**

- diff revisado contém apenas arquivos deste escopo;
- migrations compilam numa base descartável na ordem real;
- suíte focada, `npm test` e build passam;
- ACL e imutabilidade foram testadas;
- não existem marcadores pendentes, fixture de produção ou exceção por professor;
- plano de rollback foi ensaiado sem apagar dados.

**Este checkpoint não autoriza aplicação no banco, rematerialização, deploy, commit ou push. Cada ação permanece um gate separado.**

---

## Sprint 6 — Rollout controlado e E2E autenticado

**Objetivo:** publicar em ordem segura e provar o fluxo real usado pela equipe pedagógica.

### Task 6.1: Aplicar backend em gate próprio

- [ ] Confirmar projeto Supabase remoto, branch, migrations pendentes e hash do commit aprovado.
- [ ] Aplicar as migrations em ordem.
- [ ] Conferir ACL e definições remotas depois da aplicação.
- [ ] Não executar fechamento ou rematerialização no mesmo passo.

### Checkpoint 6A — Backend publicado, sem dados operacionais alterados

**GO somente se:** migrations remotas coincidem com o repositório, funções compilam e consultas somente leitura preservam os contratos.

### Task 6.2: Rematerializar o mês aberto

- [ ] Obter autorização explícita para escrita operacional.
- [ ] Executar a função service-only, uma vez por escopo, registrando execution ID.
- [ ] Validar `roster = reader` para cada unidade e consolidado.
- [ ] Confirmar seis métricas por professor, cinco pilares esperados e nenhuma classificação indevida.
- [ ] Não fechar agosto nem criar snapshot oficial nesta etapa.

### Checkpoint 6B — Retratos recuperados

Critérios atuais esperados, recontados no momento da execução:

- Barra: reader igual ao roster ativo;
- Campo Grande: reader igual ao roster ativo e snapshot não defasado;
- Recreio: reader igual ao roster ativo;
- Consolidado: reader igual ao roster ativo sem duplicar professor multiunidade;
- cron executável abaixo do orçamento e sem `HEALTH_SCORE_V3_PILARES_INCOMPLETOS`.

### Task 6.3: Publicar frontend

- [ ] Confirmar link explícito com o projeto Vercel correto.
- [ ] Fazer deploy do commit aprovado.
- [ ] Confirmar deployment e asset hash.
- [ ] Não declarar sucesso antes do E2E.

### Task 6.4: Executar matriz E2E em navegador real

- [ ] Abrir `/app/professores` autenticado e limpar erros antigos do console.
- [ ] Validar `Performance → Consolidado → Ciclo`.
- [ ] Validar `Performance → Barra → Ciclo` e localizar Jonathan.
- [ ] Validar `Performance → Campo Grande → Mensal` e localizar Matheus e Jeyson.
- [ ] Validar Recreio mensal e ciclo.
- [ ] Trocar Mensal ↔ Ciclo, unidade ↔ consolidado e competência.
- [ ] Usar busca e filtro de status após cada troca.
- [ ] Recarregar a página e repetir o estado selecionado.
- [ ] Conferir DOM, requisições RPC, console e estabilidade pós-reload.
- [ ] Capturar evidência visual sem expor credenciais ou dados desnecessários.

### Checkpoint 6C — E2E aprovado

**GO somente se:** todos os recortes carregam, a lista permanece montada, os três casos reais têm semântica correta, não há erro no console e o resultado persiste após reload.

**Rollback:** se o frontend falhar, reverter somente o deployment; se o backend violar contrato, aplicar migration corretiva que restaure as definições anteriores. Não excluir snapshots já criados.

---

## Sprint 7 — Observação e encerramento

**Objetivo:** provar estabilidade além de uma execução manual bem-sucedida.

- [ ] Acompanhar três execuções consecutivas do cron diário.
- [ ] Registrar duração por escopo, status, snapshots criados e erros parciais.
- [ ] Confirmar que a defasagem aberta permanece inferior a 26 horas.
- [ ] Confirmar que nova execução sem mudança retorna `sem_alteracao`.
- [ ] Confirmar que nenhuma página ou relatório passou a publicar ranking parcial.
- [ ] Revisar logs PostgreSQL se houver nova aproximação de 90 segundos.
- [ ] Registrar hash final, migrations aplicadas, deployment, evidências E2E e riscos residuais.

### Checkpoint 7 — Encerramento

O incidente só pode ser encerrado quando:

- três crons consecutivos concluírem dentro do orçamento;
- roster e reader permanecerem iguais em todos os escopos;
- histórico mostre dado oficial ou estado explícito de fechamento pendente;
- página continue operacional com parcialidade simulada;
- equipe pedagógica consiga navegar, buscar, filtrar e abrir detalhes;
- não exista regressão nas demais abas de Professores;
- documentação e runbook reflitam o comportamento publicado.

## 5. Ordem de execução resumida

```text
Sprint 0  Baseline e testes vermelhos
    ↓ CP0
Sprint 1  Matriz completa + 5 pilares/90
    ↓ CP1
Sprint 2  Materialização resiliente + cron
    ↓ CP2
Sprint 3  Fechamento mensal/ciclo
    ↓ CP3
Sprint 4  UI não bloqueante + defasagem
    ↓ CP4
Sprint 5  Regressão e documentação
    ↓ CP5 — pronto, mas ainda sem rollout
Sprint 6  Backend → rematerialização → frontend → E2E
    ↓ CP6A / CP6B / CP6C
Sprint 7  Três crons e encerramento
```

## 6. Definition of Done

- A aba Performance exibe todo o roster ativo em Unidade e Consolidado.
- Mensal e Ciclo usam períodos corretos e não retornam zero por referência errada.
- Cada professor possui seis métricas, cinco pilares pontuáveis esperados e peso total governado de 90.
- Falta de evidência permanece nula e explicada; nunca vira zero.
- Score observado parcial não recebe classificação comparável nem ranking.
- Um professor inesperadamente incompleto não congela a leitura dos demais.
- Fechamento copia `papel`, `codigo_evidencia` e `peso_efetivo` e permanece imutável.
- Mensal histórico é legível sem habilitar ranking.
- Cron não depende de aumentar o teto de 120 segundos e completa com margem observada.
- UI diferencia erro, preparação, parcialidade, defasagem e fechamento pendente.
- E2E autenticado prova interação e estabilidade depois de reload.
- Nenhum snapshot histórico ou configuração ativa é reescrito.
