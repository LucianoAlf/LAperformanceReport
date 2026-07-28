  # Health Score V3 Retention, Pending Links, and Jun-Aug Goals Implementation Plan

  > **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

  **Goal:** Corrigir a retencao e a normalizacao percentual do Health Score V3, resolver com seguranca os periodos automaticamente conciliaveis e ativar uma nova revisao das metas segmentadas para o ciclo Jun-Ago antes de recalcular as tres unidades.

  **Architecture:** A retencao passa a usar um unico universo de periodos canonicos para numerador e denominador, preservando a politica transitoria de 02/08. Periodos ativos com correspondencia exata na jornada atual sao promovidos por evidencia objetiva; casos ambiguos continuam fora da conta. Uma RPC governada cria e ativa uma revisao retroativa do ciclo ainda aberto, arquivando a configuracao conflitante sem apagar seu historico nem tocar snapshots fechados. O motor calcula percentuais pela taxa real e mantem as metricas quantitativas normalizadas pelas metas segmentadas.

  **Tech Stack:** PostgreSQL 15, Supabase migrations e RPCs, PL/pgSQL, JavaScript ESM, Node test runner, React/TypeScript apenas para verificacao de nao regressao.

  **Estado da execucao em 27/07/2026:** Tasks 1 a 7 concluidas. Task 8
  concluida ate o Step 4 e parada para homologacao do Alf, conforme autorizado.
  Nenhuma view, RPC de consumidor, tela, card, ranking ou relatorio produtivo
  foi alterado. Resultado:
  `docs/auditorias/2026-07-27-health-score-v3-recalculo-tres-unidades.md`.

  ---

  ## Invariantes

  - A tela nao muda nesta execucao.
  - Nenhum snapshot fechado e apagado, atualizado ou recalculado.
  - Configuracoes anteriores permanecem consultaveis com pesos, metas e matriz.
  - `media_turma` e `numero_alunos` nunca usam fallback global quando o modo
    segmentado esta ativo.
  - `Aula Experimental` (`curso_id = 45`) e comercial e nao participa da
    carteira pedagogica, da media por turma nem da matriz segmentada nova.
  - Retencao, conversao e presenca usam `nota = percentual real`.
  - Permanencia, media por turma e numero de alunos continuam normalizados por
    meta.
  - Periodo em revisao nao entra no numerador nem no denominador.
  - Periodo limpo nao deixa de pontuar apenas porque existe outro periodo
    pendente.
  - A base minima de retencao continua em 10 periodos limpos.
  - Ranking e premiacao continuam bloqueados.
  - O resultado das tres unidades e dos quatro professores-piloto deve ser
    apresentado ao Alf antes de qualquer cutover visual.

  ### Task 1: Congelar o baseline e o contrato em testes RED

  **Files:**
  - Create: `tests/healthScoreProfessorV3RetencaoGovernada.test.mjs`
  - Create: `tests/healthScoreProfessorV3ConfigCicloAberto.test.mjs`
  - Modify: `tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs`
  - Modify: `tests/reconstrucaoPeriodosParticionada.test.mjs`
  - Create: `scripts/verify-health-score-v3-retencao-config-jun-ago.sql`

  - [ ] **Step 1: Registrar o baseline SELECT-only**

  No script de verificacao, consultar:

  ```sql
  select id, versao, status, vigencia_inicio, vigencia_fim, justificativa
  from public.health_score_professor_v3_config_versoes
  order by versao;

  select config_id, count(*) as metas_segmentadas
  from public.health_score_professor_v3_config_metas_curso_modalidade
  group by config_id
  order by config_id;

  select competencia, estado, config_id, count(*) as snapshots
  from public.health_score_professor_v3_snapshots
  where competencia between date '2026-06-01' and date '2026-08-01'
  group by competencia, estado, config_id
  order by competencia, estado, config_id;
  ```

  Guardar no relatorio de execucao os IDs reais encontrados. Nao codificar UUIDs
  em migrations.

  - [ ] **Step 2: Escrever os testes RED da retencao**

  Exigir que a nova migration:

  - use `vw_professor_periodos_efetivos_v3_sombra` para expostos e saidas;
  - conte todo encerramento ate `2026-08-02`;
  - conte apenas motivo atribuivel confirmado a partir de `2026-08-03`;
  - nao agregue `movimentacoes_admin` separadamente do universo de periodos;
  - produza `ok_com_pendencias` quando a amostra limpa for pelo menos 10;
  - mantenha `sem_base_amostra` quando a amostra limpa for menor que 10;
  - exponha `vinculos_em_revisao` apenas no diagnostico;
  - deixe `peso_disponivel` verdadeiro para `ok` e `ok_com_pendencias`.

  - [ ] **Step 3: Escrever os testes RED da normalizacao**

  Exigir no materializador:

  ```text
  retencao   -> nota = valor_bruto
  conversao  -> nota = valor_bruto
  presenca   -> nota = valor_bruto
  permanencia, media_turma, numero_alunos -> nota por meta
  ```

  As metas percentuais continuam no payload como objetivo e estado de meta, mas
  nao dividem nem limitam a nota.

  - [ ] **Step 4: Escrever os testes RED do ciclo Jun-Ago**

  Exigir:

  - nova revisao com inicio `2026-06-01` e fim `2026-08-31`;
  - clonagem explicita de seis metricas e matriz segmentada;
  - simulacao atual obrigatoria;
  - bloqueio se houver snapshot fechado no intervalo;
  - trilha append-only de substituicao;
  - configuracao conflitante preservada e arquivada;
  - configuracao iniciada em `2026-09-01` intacta;
  - zero escrita em tabelas de snapshot durante criar, salvar, simular ou ativar.

  - [ ] **Step 5: Rodar os testes e confirmar RED**

  Run:

  ```powershell
  node --test tests/healthScoreProfessorV3RetencaoGovernada.test.mjs tests/healthScoreProfessorV3ConfigCicloAberto.test.mjs tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs tests/reconstrucaoPeriodosParticionada.test.mjs
  ```

  Expected: FAIL somente pelos contratos novos ainda nao implementados.

  ### Task 2: Unificar o universo da retencao

  **Files:**
  - Create: `supabase/migrations/20260727120000_health_score_v3_retencao_universo_governado.sql`
  - Modify: `tests/healthScoreProfessorV3RetencaoGovernada.test.mjs`
  - Modify: `tests/healthScoreProfessorV3RetencaoTransicao.test.mjs`
  - Modify: `tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs`

  - [ ] **Step 1: Criar a funcao canonica de retencao**

  Criar `public.get_professor_retencao_v3_governada` com o mesmo recorte mensal ou
  de ciclo usado pelo motor. O CTE de periodos deve produzir, por professor e
  unidade:

  - `vinculos_expostos_limpos`: periodos `publicavel=true` expostos na janela;
  - `vinculos_em_revisao`: periodos `publicavel=false`, apenas diagnostico;
  - `encerramentos_penalizadores`: subconjunto dos periodos limpos encerrados na
    janela, seguindo o corte de `2026-08-03`;
  - `valor_bruto = 100 * (1 - encerramentos_penalizadores /
    vinculos_expostos_limpos)`.

  Nao buscar um numerador independente em `movimentacoes_admin`. A movimentacao
  pode continuar como evidencia auditavel do periodo, mas nao como conjunto
  estatistico separado.

  - [ ] **Step 2: Aplicar os estados aprovados**

  ```text
  0 limpos                       -> sem_base
  1..9 limpos                    -> sem_base_amostra
  >=10 limpos e 0 pendentes      -> ok
  >=10 limpos e >0 pendentes     -> ok_com_pendencias
  ```

  `ok_com_pendencias` contribui para o score parcial. O detalhe deve informar os
  pendentes e manter `apta_oficial=false` ate a conciliacao completa.

  - [ ] **Step 3: Delegar o motor para a fonte unica**

  Recriar `public.get_health_score_professor_v3_metricas_periodo` apenas no trecho
  de retencao para consumir `get_professor_retencao_v3_governada`. Preservar as
  outras cinco metricas sem alteracao.

  - [ ] **Step 4: Fixar seguranca**

  As funcoes devem usar `security definer`, `set search_path = public, pg_temp`,
  revogar `public/anon/authenticated` quando nao houver consumidor humano direto
  e conceder somente a `service_role` e aos papeis internos ja autorizados.

  - [ ] **Step 5: Rodar os testes dirigidos**

  Run:

  ```powershell
  node --test tests/healthScoreProfessorV3RetencaoGovernada.test.mjs tests/healthScoreProfessorV3RetencaoTransicao.test.mjs tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs
  ```

  Expected: PASS.

  ### Task 3: Promover somente os 207 periodos ativos com evidencia exata

  **Files:**
  - Modify: `supabase/functions/_shared/reconstrucao-periodos-professor.mjs`
  - Create: `supabase/migrations/20260727121000_health_score_v3_promocao_periodos_ativos_exatos.sql`
  - Modify: `tests/reconstrucaoPeriodosParticionada.test.mjs`
  - Modify: `tests/healthScoreProfessorV3RevisoesEfetivas.test.mjs`
  - Modify: `scripts/verify-health-score-v3-retencao-config-jun-ago.sql`

  - [ ] **Step 1: Escrever a regra pura**

  Adicionar ao reconstrutor a promocao de periodo ativo `media -> alta` somente
  quando houver correspondencia exata e simultanea entre o periodo e
  `aluno_jornada_matricula_disciplina` por:

  ```text
  unidade_id
  emusys_matricula_disciplina_id
  professor_id
  status atual ativo
  ```

  Exigir ausencia de conflito, professor resolvido e disciplina resolvida. O nome
  do professor nunca participa da identidade.

  - [ ] **Step 2: Preservar a evidencia**

  Gravar no payload de evidencia:

  ```json
  {
    "promocao_confianca": {
      "regra": "jornada_atual_exata",
      "confianca_anterior": "media",
      "confianca_atual": "alta"
    }
  }
  ```

  O diagnostico deve separar promocao automatica de revisao humana.

  - [ ] **Step 3: Criar o backfill idempotente**

  A migration deve inserir uma revisao append-only em
  `professor_periodos_revisoes_v1` para cada candidato exato ainda nao promovido.
  Nao atualizar a reconstrucao base. Reexecucao deve inserir zero duplicatas.

  - [ ] **Step 4: Provar o escopo antes da escrita**

  Executar a consulta candidata e exigir:

  ```text
  total = 207
  Barra = 75
  Campo Grande = 71
  Recreio = 61
  conflitos = 0
  ```

  Se os totais tiverem mudado por sync posterior, parar e registrar a diferenca;
  nao ajustar o filtro para perseguir o numero antigo.

  - [ ] **Step 5: Rodar os testes**

  Run:

  ```powershell
  node --test tests/reconstrucaoPeriodosParticionada.test.mjs tests/healthScoreProfessorV3RevisoesEfetivas.test.mjs
  ```

  Expected: PASS, incluindo idempotencia e preservacao do baseline.

  ### Task 4: Manter os cinco casos humanos fora da conta e prontos para decisao

  **Files:**
  - Create: `scripts/health-score-v3-pendencias-humanas-2026-07.sql`
  - Create: `docs/auditorias/2026-07-27-health-score-v3-pendencias-humanas.md`

  - [ ] **Step 1: Gerar a fila deterministica**

  O script SELECT-only deve retornar os cinco casos ja identificados, com periodo,
  jornada atual, professor anterior, professor atual, disciplina, unidade e
  evidencias.

  - [ ] **Step 2: Nao promover automaticamente**

  Os casos permanecem `publicavel=false` ate decisao humana:

  - Beatriz von Glehn Herkenhoff;
  - Gabriela de Lima Sodre;
  - Gabriela Dornas;
  - Sirley Jorge Martins Dantas;
  - Lohan Marques Boente.

  - [ ] **Step 3: Preparar comandos, sem executar**

  Documentar para cada caso a RPC/registro append-only que sera usado quando Alf
  confirmar `aprovar`, `corrigir professor` ou `invalidar`. Nenhum caso humano
  entra como dependencia do score parcial quando a amostra limpa ja atingir 10.

  ### Task 5: Aplicar a nota percentual real

  **Files:**
  - Create: `supabase/migrations/20260727122000_health_score_v3_percentuais_valor_real.sql`
  - Modify: `tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs`
  - Modify: `tests/healthScoreProfessorV3Snapshots.test.mjs`
  - Modify: `tests/healthScoreProfessorV3Cutover.test.mjs`

  - [ ] **Step 1: Alterar a formula no motor**

  No materializador e na simulacao:

  ```sql
  case
    when metrica in ('retencao', 'conversao', 'presenca')
      then greatest(0::numeric, least(100::numeric, valor_bruto))
    else greatest(0::numeric, least(100::numeric, valor_bruto / meta * 100))
  end
  ```

  O `estado_base` continua sendo avaliado antes da formula. `sem_base_*`,
  `em_maturacao`, `regra_ausente` e estados nao pontuaveis retornam nota nula.

  - [ ] **Step 2: Preservar a meta como objetivo**

  Manter `meta`, `meta_status`, comparador e diferenca para a meta nos detalhes.
  Atingir a meta nao transforma automaticamente a nota em 100.

  - [ ] **Step 3: Fixar exemplos**

  Os testes devem provar:

  ```text
  retencao 93.00 com meta 90 -> nota 93.00
  conversao 70.00 com meta 70 -> nota 70.00
  presenca 85.20 com meta 80 -> nota 85.20
  permanencia 12 com meta 12 -> nota 100
  ```

  - [ ] **Step 4: Rodar testes**

  Run:

  ```powershell
  node --test tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs tests/healthScoreProfessorV3Snapshots.test.mjs tests/healthScoreProfessorV3Cutover.test.mjs
  ```

  Expected: PASS.

  ### Task 6: Criar o lifecycle governado da revisao Jun-Ago

  **Files:**
  - Create: `supabase/migrations/20260727123000_health_score_v3_config_ciclo_aberto.sql`
  - Modify: `tests/healthScoreProfessorV3ConfigCicloAberto.test.mjs`
  - Modify: `tests/healthScoreProfessorV3ConfigSegmentada.test.mjs`
  - Modify: `tests/healthScoreProfessorV3CatalogoConfig.test.mjs`

  - [ ] **Step 1: Criar a trilha de substituicao**

  Criar `health_score_professor_v3_config_substituicoes` append-only com:

  ```text
  id
  config_anterior_id
  config_nova_id
  vigencia_inicio
  vigencia_fim
  justificativa
  substituido_por
  substituido_em
  ```

  Habilitar RLS, revogar acesso direto de `public`, `anon` e `authenticated`, e
  permitir escrita somente pela RPC governada.

  - [ ] **Step 2: Criar o rascunho retroativo**

  Criar `criar_health_score_professor_v3_config_revisao_ciclo_aberto` com:

  ```text
  p_config_origem_id
  p_vigencia_inicio
  p_vigencia_fim
  p_justificativa
  ```

  Validar `professores.editar`, lock transacional, limites mensais e origem com
  seis pilares. Clonar metricas e toda a matriz segmentada. A origem deve
  permanecer intocada.

  - [ ] **Step 3: Criar a ativacao retroativa separada**

  Criar `ativar_health_score_professor_v3_config_revisao_ciclo_aberto` sem
  afrouxar `ativar_health_score_professor_v3_config`.

  A RPC deve:

  1. bloquear a configuracao e o lifecycle;
  2. validar justificativa e fingerprint;
  3. exigir simulacao recente e posterior a ultima edicao;
  4. revalidar catalogo, metas e excecoes atuais;
  5. rejeitar qualquer snapshot `fechado` em `2026-06-01..2026-08-31`;
  6. arquivar somente a configuracao ativa conflitante com o ciclo;
  7. registrar a substituicao append-only;
  8. ativar a nova revisao com fim em `2026-08-31`;
  9. nao tocar na configuracao ativa a partir de `2026-09-01`;
  10. nao escrever em snapshots.

  - [ ] **Step 4: Resolver a selecao temporal**

  Testar que:

  ```text
  junho, julho e agosto -> nova revisao segmentada
  setembro em diante    -> configuracao futura existente
  ```

  Nao permitir duas configuracoes ativas para o mesmo dia.

  - [ ] **Step 5: Rodar os testes**

  Run:

  ```powershell
  node --test tests/healthScoreProfessorV3ConfigCicloAberto.test.mjs tests/healthScoreProfessorV3ConfigSegmentada.test.mjs tests/healthScoreProfessorV3CatalogoConfig.test.mjs
  ```

  Expected: PASS.

  ### Task 6A: Excluir cursos comerciais e zerar segmentos pontuaveis sem meta

  **Files:**
  - Create: `supabase/migrations/20260727122500_health_score_v3_cursos_pedagogicos.sql`
  - Create: `tests/healthScoreProfessorV3CursoElegibilidade.test.mjs`
  - Create: `scripts/inventory-health-score-v3-segmentos-sem-meta.sql`
  - Create: `docs/auditorias/2026-07-27-health-score-v3-segmentos-pontuaveis-sem-meta.md`
  - Modify: `supabase/migrations/20260727123000_health_score_v3_config_ciclo_aberto.sql`
  - Modify: `tests/healthScoreProfessorV3ConfigCicloAberto.test.mjs`

  - [ ] **Step 1: Criar a classificacao canonica do curso**

  Adicionar a `public.cursos`:

  ```sql
  natureza_operacional text not null default 'pedagogica'
    check (natureza_operacional in ('pedagogica', 'comercial'))
  ```

  Classificar `curso_id = 45` como `comercial`, com comentario de banco
  registrando que Aula Experimental e evento da conversao e nao carteira
  pedagogica.

  Esta e a abordagem recomendada. Remover a linha apenas durante a clonagem
  esconderia o problema em um ciclo, mas o curso continuaria voltando no catalogo
  formal, nos diagnosticos e em revisoes futuras.

  - [ ] **Step 2: Aplicar a classificacao em todas as fontes do segmento**

  Recriar, sem mudar assinaturas publicas:

  - `fn_health_score_professor_v3_catalogo_segmentos_v1`;
  - `fn_health_score_professor_v3_segmentos_faltantes_v1`;
  - `get_health_score_professor_v3_metricas_segmentadas_v1`;
  - a consulta de atribuicoes pontuaveis usada pela simulacao e ativacao.

  Todas devem exigir `cursos.natureza_operacional = 'pedagogica'` para
  `media_turma` e `numero_alunos`.

  A conversao continua lendo a experimental por sua fonte comercial propria.

  - [ ] **Step 3: Impedir clonagem da meta comercial**

  Na RPC de revisao do ciclo aberto, a clonagem de
  `health_score_professor_v3_config_metas_curso_modalidade` deve juntar
  `public.cursos` e copiar somente cursos `pedagogica`.

  A linha da V3 original:

  ```text
  Barra | Aula Experimental | turma | capacidade 1 | media 1 | carteira 1
  ```

  permanece intacta na configuracao historica, mas nao aparece na revisao
  `Jun-Ago`.

  - [ ] **Step 4: Inventariar antes da criacao do rascunho**

  Executar o script SELECT-only nas tres unidades. O inventario deve listar cada
  combinacao:

  ```text
  unidade
  curso_id
  curso
  modalidade
  quantidade de professores
  nomes dos professores
  motivo da ausencia da meta
  ```

  Filtros obrigatorios:

  ```text
  atribuicao status = ativo
  vigencia_fim is null
  confianca in (alta, revisada)
  curso natureza_operacional = pedagogica
  meta segmentada configurada ausente
  ```

  - [ ] **Step 5: Resolver o que sobrar**

  Para cada linha:

  - se o curso e pedagogico e ofertado, preencher capacidade, meta de media e
    meta de carteira na configuracao de origem;
  - se nao e ofertado na unidade, registrar `nao_ofertada`;
  - se a atribuicao formal esta errada, corrigir a atribuicao pela trilha
    governada antes de prosseguir;
  - nunca criar meta zero ou fallback global para apenas liberar a ativacao.

  Reexecutar o inventario ate retornar lista vazia.

  - [ ] **Step 6: Rodar testes**

  Run:

  ```powershell
  node --test tests/healthScoreProfessorV3CursoElegibilidade.test.mjs tests/healthScoreProfessorV3ConfigCicloAberto.test.mjs tests/healthScoreProfessorV3CatalogoConfig.test.mjs
  ```

  Expected: PASS, incluindo prova de que Aula Experimental nao entra em carteira
  ou media e que continua disponivel para conversao.

  ### Task 7: Aplicar migrations e ativar a revisao antes do recalculo

  **Files:**
  - Modify: `scripts/verify-health-score-v3-retencao-config-jun-ago.sql`
  - Create: `docs/auditorias/2026-07-27-health-score-v3-config-jun-ago-execucao.md`

  - [ ] **Step 1: Verificar alvo e migrations remotas**

  Confirmar o projeto `ouqwbbermlzqqvtqwlul`, listar migrations aplicadas e
  comparar com os cinco novos arquivos. Nao executar `supabase db push`
  indiscriminadamente.

  - [ ] **Step 2: Aplicar migrations na ordem**

  Aplicar uma por vez:

  ```text
  20260727120000_health_score_v3_retencao_universo_governado
  20260727121000_health_score_v3_promocao_periodos_ativos_exatos
  20260727122000_health_score_v3_percentuais_valor_real
  20260727122500_health_score_v3_cursos_pedagogicos
  20260727123000_health_score_v3_config_ciclo_aberto
  ```

  Depois de cada uma, executar o bloco correspondente do script de verificacao.

  - [ ] **Step 3: Executar o backfill automatico**

  Promover apenas os candidatos exatos. Confirmar:

  - 207 revisoes append-only ou o total atual previamente auditado;
  - zero periodo base atualizado;
  - zero caso humano promovido;
  - segunda execucao com zero novas revisoes.

  - [ ] **Step 4: Executar o inventario bloqueante**

  Rodar `scripts/inventory-health-score-v3-segmentos-sem-meta.sql` depois da
  classificacao do catalogo e antes de criar o rascunho.

  Expected:

  ```text
  Campo Grande: 0 segmentos pedagogicos pontuaveis sem meta
  Recreio:      0 segmentos pedagogicos pontuaveis sem meta
  Barra:        0 segmentos pedagogicos pontuaveis sem meta
  ```

  Se houver qualquer linha, parar e resolver pelo Task 6A. Nao criar o rascunho
  enquanto o inventario nao estiver vazio.

  - [ ] **Step 5: Criar e salvar a nova revisao**

  Usar como origem a configuracao real que contem a matriz segmentada salva.
  Definir:

  ```text
  vigencia_inicio = 2026-06-01
  vigencia_fim    = 2026-08-31
  ```

  Salvar a normalizacao percentual aprovada e a matriz sem alterar as metas
  segmentadas preenchidas pela coordenacao.

  - [ ] **Step 6: Simular antes da ativacao**

  Executar `simular_health_score_professor_v3_config` para julho/2026. Exigir:

  - seis pilares presentes;
  - peso total 100;
  - zero atribuicao pontuavel sem meta;
  - zero `regra_ausente` em segmento pontuavel;
  - zero combinacao observada `nao_ofertada`;
  - nenhuma escrita em snapshot.

  - [ ] **Step 7: Ativar e conferir a trilha**

  Ativar pela RPC de ciclo aberto. Conferir:

  - nova revisao ativa em Jun-Ago;
  - versao anterior preservada e arquivada;
  - linha de substituicao criada;
  - versao de setembro intacta;
  - snapshots fechados inalterados.

  ### Task 8: Recalcular sem trocar a tela

  **Files:**
  - Create: `scripts/compare-health-score-v3-2026-07-tres-unidades.sql`
  - Create: `docs/auditorias/2026-07-27-health-score-v3-recalculo-tres-unidades.md`

  - [ ] **Step 1: Materializar apenas snapshots provisorios novos**

  Usar `materializar_health_score_professor_v3_periodo` com a nova configuracao,
  competencia julho/2026 e modo provisorio. Nunca atualizar a revisao anterior:
  criar nova revisao ligada por `snapshot_anterior_id`.

  - [ ] **Step 2: Comparar as tres unidades**

  Por Barra, Campo Grande e Recreio, registrar:

  - professores avaliados;
  - professores com parcial;
  - sem base por motivo;
  - cobertura media;
  - distribuicao de score;
  - quantidade com `ok_com_pendencias`;
  - contribuicao de cada um dos seis pilares;
  - segmentos com regra ausente.

  - [ ] **Step 3: Validar os quatro professores-piloto**

  Mostrar lado a lado, antes e depois:

  ```text
  Isaque
  Erick
  Peterson
  Gabriel Antony
  ```

  Para cada um, listar valor, nota, peso e estado dos seis pilares, score,
  cobertura e pendencias. Confirmar especificamente:

  - Isaque nao fica abaixo de Erick por amostra insuficiente tratada como 100;
  - Erick nao recebe retencao pontuavel: parte de seis periodos limpos e, mesmo
    que seus dois candidatos exatos sejam promovidos, continua abaixo da base
    minima de 10;
  - o baseline de Peterson mostra 3 limpos e 7 pendentes como conjuntos
    distintos; depois do backfill, cada um dos 7 so migra para a amostra limpa se
    cumprir a correspondencia exata;
  - o baseline de Gabriel Antony mostra 32 limpos e 14 pendentes; depois do
    backfill, os candidatos exatos passam para a amostra limpa e qualquer
    ambiguidade remanescente continua visivel, sem descartar os 32 validos.

  - [ ] **Step 4: Parar para homologacao**

  Entregar o relatorio ao Alf. Nao alterar view, RPC de consumidor, card, ranking
  ou relatorio nesta tarefa.

  ### Task 9: Verificacao de nao regressao

  **Files:**
  - Verify only.

  - [ ] **Step 1: Rodar a suite focada**

  Run:

  ```powershell
  node --test tests/healthScoreProfessorV3RetencaoGovernada.test.mjs tests/healthScoreProfessorV3ConfigCicloAberto.test.mjs tests/healthScoreProfessorV3CursoElegibilidade.test.mjs tests/healthScoreProfessorV3RetencaoTransicao.test.mjs tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs tests/healthScoreProfessorV3Snapshots.test.mjs tests/reconstrucaoPeriodosParticionada.test.mjs tests/healthScoreProfessorV3RevisoesEfetivas.test.mjs
  ```

  Expected: PASS.

  - [ ] **Step 2: Rodar a suite completa**

  Run:

  ```powershell
  node --test tests/*.test.mjs
  node --test scripts/tests/*.test.ts
  ```

  Expected: PASS.

  - [ ] **Step 3: Rodar build**

  Run:

  ```powershell
  npm run build
  ```

  Expected: Vite build concluido sem erro de TypeScript ou bundle.

  - [ ] **Step 4: Conferir seguranca e qualidade**

  Executar:

  ```powershell
  git diff --check
  ```

  No banco, confirmar:

  - nenhuma nova RPC executavel por `anon`;
  - `search_path` fixo nas RPCs `security definer`;
  - tabelas novas com RLS e sem escrita direta de `authenticated`;
  - advisors sem novo erro de seguranca;
  - nenhuma escrita em snapshots fechados.

  ### Task 10: Registrar o resultado e preparar o proximo cutover

  **Files:**
  - Create: `docs/auditorias/2026-07-27-health-score-v3-retencao-config-jun-ago-resultado.md`
  - Modify: `docs/auditorias/2026-07-27-handoff-mestre-health-score-professor-v2-v3.md` only if the file is explicitly brought into this scope by Alf.

  - [ ] **Step 1: Consolidar a evidencia**

  Documentar:

  - migrations aplicadas;
  - configuracao anterior e nova;
  - promocao automatica e casos humanos restantes;
  - formula de retencao e normalizacao;
  - comparativo das tres unidades;
  - quatro professores-piloto;
  - testes e build;
  - riscos residuais.

  - [ ] **Step 2: Definir o proximo gate**

  Somente depois da aprovacao dos numeros, abrir um plano separado para migrar a
  vitrine/consumidores. O cutover deve ser consumidor por consumidor e preservar
  rollback para a revisao anterior.
