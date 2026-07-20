# Health Score Professor V3 Segmented Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar metas versionadas por unidade, curso canonico e modalidade para os pilares Media de alunos por turma e Carteira por curso do Health Score Professor V3, preservando os valores brutos canonicos, a V2, os demais pilares e todos os consumidores ainda nao migrados.

**Architecture:** A mudanca e aditiva e governada. Uma camada detalhada unica passa a sustentar tanto o agregado canonico existente quanto os novos segmentos. A configuracao recebe uma matriz versionada por unidade/curso/modalidade, as atribuicoes formais do professor ganham camada temporal propria e os snapshots guardam a decomposicao usada na nota. A interface continua separando pesos globais de metas segmentadas; toda edicao cria rascunho, exige simulacao e nao ativa nem migra consumidor produtivo sem homologacao explicita.

**Tech Stack:** Supabase/PostgreSQL, React 19, TypeScript, Vite, Node test runner, Supabase RPCs, Emusys sincronizado no LA Report e validacao visual com navegador/Playwright.

---

## Regras de execucao

- Trabalhar no workspace atual; nao criar worktree.
- Antes de editar, executar git fetch origin e inspecionar commits remotos sem descartar alteracoes locais.
- Nao reverter, sobrescrever ou incluir nos commits os arquivos que ja estavam modificados antes desta fase.
- Nunca executar supabase db push indiscriminadamente. Conferir o historico remoto e aplicar somente a migration do gate atual.
- Aplicar migrations em ordem, uma por vez, no projeto ouqwbbermlzqqvtqwlul.
- Escrever o teste que falha antes de cada alteracao funcional.
- Nao inferir modalidade por quantidade de alunos, turma_nome ou nome do curso.
- Nao criar produto cartesiano entre professores_cursos e professores_unidades.
- Nao alterar presenca, retencao, permanencia ou conversao nesta entrega.
- Nao alterar o pipeline de churn/Random Forest.
- Nao alterar relatorios gerencial, administrativo ou comercial durante a sombra.
- Nao ativar uma nova configuracao nem migrar consumidor produtivo sem aprovacao explicita depois da simulacao.
- Usar RPC guardada para toda escrita feita pelo navegador; nenhuma tabela nova recebe escrita direta do frontend.
- Se o valor agregado anterior e o novo agregado sobre a base detalhada divergirem, parar no gate de equivalencia e investigar. Nao compensar com ajuste cosmetico.

## Invariantes canonicos

1. Curso e resolvido pelo curso_id canonico atual. Canto T e Canto IND nao serao remapeados nesta tarefa.
2. Modalidade vem da flag Emusys:
   - aulas_emusys.tipo para eventos;
   - payload_snapshot.disciplina.tipo para jornada;
   - valores aceitos para pontuacao: individual e turma.
3. Uma turma com um aluno continua sendo turma.
4. Ensaio, experimental, extra, avulsa, cancelada e projeto/banda nao regular nao entram na media.
5. Pessoas visiveis em Alunos continuam deduplicadas por pessoa canonica.
6. Carteira por curso usa vinculos unicos pessoa + curso + modalidade.
7. A mesma pessoa em dois cursos conta uma vez no total visual e uma vez em cada segmento de carteira.
8. A mesma pessoa na mesma turma conta uma ocupacao; em duas turmas, uma ocupacao em cada.
9. Capacidade maxima gera diagnostico de excedente, mas nao limita nem corrige o valor observado.
10. Curso formalmente atribuido com zero alunos fica visivel como sem_base_zero_carteira e nao penaliza o professor.
11. Pesos continuam globais; metas de Media/turma e Carteira por curso passam a ser segmentadas.
12. Configuracoes ativas e snapshots fechados permanecem imutaveis.

## Preflight do workspace

- [ ] Executar:

    git status --short --branch
    git fetch origin
    git log --oneline --decorate HEAD..origin/main

- [ ] Registrar os arquivos sujos preexistentes e impedir que sejam adicionados por comandos amplos.
- [ ] Confirmar que a SPEC aprovada existe:

    docs/superpowers/specs/2026-07-19-health-score-v3-metas-segmentadas-design.md

- [ ] Confirmar a definicao viva da fonte canonica antes de extrair a camada detalhada:

    select pg_get_functiondef(
      'public.get_carteira_professor_periodo_canonica(integer,integer,uuid,date,date)'::regprocedure
    );

- [ ] Salvar os resultados de junho e julho para as tres unidades em uma tabela temporaria ou artefato de auditoria, sem escrever em tabela produtiva:

    select *
    from public.get_carteira_professor_periodo_canonica(2026, 6, null, null, null)
    order by unidade_id, professor_id;

    select *
    from public.get_carteira_professor_periodo_canonica(2026, 7, null, null, null)
    order by unidade_id, professor_id;

- [ ] Rodar o baseline:

    node --test tests/professoresKpisCanonicos.test.mjs
    node --test tests/healthScoreProfessorV3Contrato.test.mjs
    node --test tests/healthScoreProfessorV3Metricas.test.mjs
    node --test tests/healthScoreProfessorV3Snapshots.test.mjs
    node --test tests/healthScoreProfessorV3Frontend.test.mjs
    npm run build

Expected: todos passam antes de iniciar a implementacao. Se algum falhar por mudanca local preexistente, separar e documentar antes de prosseguir.

---

## Task 1: Criar o contrato de testes da segmentacao

**Files:**
- Create: tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
- Create: docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-baseline.md

- [ ] **Step 1: Escrever o teste estrutural que falha**

O teste deve exigir:

- as tres tabelas novas;
- modalidade restrita a individual ou turma;
- unicidade config + unidade + curso + modalidade;
- meta_media_turma menor ou igual a capacidade_maxima;
- zero carteira representado por estado explicito;
- ausencia de grant para public e anon;
- ausencia de alteracao em presenca e churn;
- ausencia de produto cartesiano entre professores_cursos e professores_unidades.

Estrutura inicial:

    import test from 'node:test';
    import assert from 'node:assert/strict';
    import fs from 'node:fs';

    const schema = fs.readFileSync(
      'supabase/migrations/20260719200000_health_score_v3_metas_segmentadas_schema.sql',
      'utf8',
    );
    const assignments = fs.readFileSync(
      'supabase/migrations/20260719201000_professor_unidade_curso_modalidade.sql',
      'utf8',
    );

    test('schema segmentado preserva o grao oficial', () => {
      assert.match(schema, /health_score_professor_v3_config_metas_curso_modalidade/i);
      assert.match(schema, /health_score_professor_v3_snapshot_metrica_segmentos/i);
      assert.match(schema, /unique\s*\(config_id, unidade_id, curso_id, modalidade\)/i);
      assert.match(schema, /meta_media_turma[\s\S]*capacidade_maxima/i);
      assert.match(assignments, /professor_unidade_curso_modalidade/i);
      assert.doesNotMatch(assignments, /professores_cursos[\s\S]*cross join[\s\S]*professores_unidades/i);
    });

- [ ] **Step 2: Rodar e confirmar falha**

    node --test tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs

Expected: FAIL porque as migrations ainda nao existem.

- [ ] **Step 3: Registrar o baseline de dados e consumidores**

No documento de auditoria, registrar:

- contagem de combinacoes unidade/curso/modalidade observadas;
- combinacoes sem curso_id;
- combinacoes sem modalidade oficial;
- professores multiunidade;
- valores de carteira e media/turma em junho e julho;
- configuracao V3 ativa e rascunho;
- consumidores atuais do agregado canonico;
- hash ou copia da definicao viva de get_carteira_professor_periodo_canonica.

- [ ] **Step 4: Commit do contrato de teste**

    git add -- tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-baseline.md
    git commit -m "test: definir contrato das metas segmentadas v3"

---

## Task 2: Criar schema versionado de metas e segmentos de snapshot

**Files:**
- Create: supabase/migrations/20260719200000_health_score_v3_metas_segmentadas_schema.sql
- Modify: tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
- Modify: tests/healthScoreProfessorV3Snapshots.test.mjs

- [ ] **Step 1: Completar os testes de schema**

Exigir:

- health_score_professor_v3_config_metas_curso_modalidade;
- health_score_professor_v3_snapshot_metrica_segmentos;
- FKs com on delete restrict;
- checks de estado e valores positivos;
- nao_ofertada com metas nulas;
- configurada com tres valores positivos;
- trigger de imutabilidade para config ativa ou usada por snapshot fechado;
- RLS habilitada;
- public, anon e authenticated sem escrita direta;
- indices por config, unidade, curso e snapshot.

- [ ] **Step 2: Rodar e confirmar falha focada**

    node --test tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
    node --test tests/healthScoreProfessorV3Snapshots.test.mjs

Expected: FAIL nos objetos novos.

- [ ] **Step 3: Implementar a migration de schema**

Criar, no minimo:

    public.health_score_professor_v3_config_metas_curso_modalidade
      id uuid primary key
      config_id uuid not null
      unidade_id uuid not null
      curso_id integer not null
      modalidade text not null check modalidade in ('individual','turma')
      estado text not null check estado in ('configurada','nao_ofertada')
      capacidade_maxima numeric
      meta_media_turma numeric
      meta_carteira_curso numeric
      parametros jsonb not null default '{}'
      criado_em timestamptz
      atualizado_em timestamptz

    public.health_score_professor_v3_snapshot_metrica_segmentos
      id uuid primary key
      snapshot_metrica_id uuid not null
      config_meta_segmento_id uuid
      unidade_id uuid not null
      curso_id integer not null
      modalidade text not null
      pessoas_unicas integer
      vinculos_ativos integer
      turmas_elegiveis integer
      ocupacoes_unicas integer
      capacidade_maxima numeric
      meta_aplicada numeric
      numerador numeric
      denominador numeric
      nota numeric
      estado_base text not null
      fonte text not null
      regra_versao text not null
      detalhes jsonb not null default '{}'
      criado_em timestamptz

Regras essenciais:

    check (
      (estado = 'nao_ofertada'
        and capacidade_maxima is null
        and meta_media_turma is null
        and meta_carteira_curso is null)
      or
      (estado = 'configurada'
        and capacidade_maxima > 0
        and meta_media_turma > 0
        and meta_carteira_curso > 0
        and meta_media_turma <= capacidade_maxima)
    )

Nao conceder SELECT ou DML direto ao browser. Toda leitura e escrita ocorre por RPC.

- [ ] **Step 4: Aplicar somente esta migration e validar catalogo**

Antes de aplicar:

    supabase migration list --linked

Nao usar db push se houver outras migrations locais pendentes. Aplicar o arquivo pelo executor de migration aprovado do projeto.

Validar:

    select
      n.nspname as table_schema,
      c.relname as table_name,
      c.relrowsecurity as row_security
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'health_score_professor_v3_config_metas_curso_modalidade',
        'health_score_professor_v3_snapshot_metrica_segmentos'
      );

    select grantee, privilege_type, table_name
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'health_score_professor_v3_config_metas_curso_modalidade',
        'health_score_professor_v3_snapshot_metrica_segmentos'
      );

Expected: RLS ativa; nenhum privilegio de escrita para public, anon ou authenticated.

- [ ] **Step 5: Rodar regressao**

    node --test tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
    node --test tests/healthScoreProfessorV3Snapshots.test.mjs
    node --test tests/healthScoreProfessorV3Contrato.test.mjs

- [ ] **Step 6: Commit**

    git add -- supabase/migrations/20260719200000_health_score_v3_metas_segmentadas_schema.sql tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs tests/healthScoreProfessorV3Snapshots.test.mjs
    git commit -m "feat: criar schema de metas segmentadas v3"

---

## Task 3: Criar atribuicao formal professor/unidade/curso/modalidade

**Files:**
- Create: supabase/migrations/20260719201000_professor_unidade_curso_modalidade.sql
- Create: tests/professorCursoModalidadeCanonico.test.mjs
- Modify: tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs

- [ ] **Step 1: Escrever testes que falham**

Cobrir:

- chave temporal professor + unidade + curso + modalidade;
- somente uma atribuicao ativa aberta para a mesma combinacao;
- fonte manual, jornada, aula ou revisao;
- confianca alta, media ou revisada;
- professor inativo na unidade nunca e reativado pelo backfill;
- professores_cursos nao e combinado com todas as unidades;
- jornada ativa com modalidade oficial gera atribuicao de alta confianca;
- aula normal recente com curso e tipo oficiais pode gerar evidencia;
- modalidade ausente fica pendente, nunca e inferida por turma_nome;
- atribuicao com zero aluno permanece ativa;
- escrita exige professores.editar.

- [ ] **Step 2: Confirmar falha**

    node --test tests/professorCursoModalidadeCanonico.test.mjs

- [ ] **Step 3: Implementar tabela, diagnostico e RPCs**

Criar:

    public.professor_unidade_curso_modalidade

Campos:

    id uuid primary key
    professor_id integer not null
    unidade_id uuid not null
    curso_id integer not null
    modalidade text not null
    vigencia_inicio date not null
    vigencia_fim date
    status text not null
    fonte text not null
    confianca text not null
    revisado_por integer
    revisado_em timestamptz
    evidencias jsonb not null default '{}'
    criado_em timestamptz
    atualizado_em timestamptz

Criar indice unico parcial para atribuicao ativa aberta:

    unique professor_id, unidade_id, curso_id, modalidade
    where status = 'ativo' and vigencia_fim is null

Criar as RPCs guardadas:

    public.get_professor_curso_modalidade_reconciliacao_v1(
      p_unidade_id uuid default null,
      p_professor_id integer default null
    )

    public.salvar_professor_curso_modalidade_atribuicoes_v1(
      p_professor_id integer,
      p_atribuicoes jsonb,
      p_justificativa text
    )

Ambas devem usar search_path fixo. A escrita deve chamar fn_health_score_professor_v3_ator_gerenciador ou guard equivalente de professores.editar.

- [ ] **Step 4: Fazer backfill idempotente sem produto cartesiano**

Ordem de evidencia:

1. aluno_jornada_matricula_disciplina ativa, com curso_id e disciplina.tipo validos;
2. aulas_emusys normais recentes, com professor_id, curso de-para resolvido e tipo oficial;
3. revisao manual.

professores_cursos serve apenas como pista para mostrar pendencia. Nunca cria unidade/modalidade sozinho.

O backfill deve ser uma funcao administrativa explicita, nao trigger silenciosa:

    public.reconciliar_professor_curso_modalidade_v1(
      p_data_referencia date default current_date
    )

Ela devolve inseridos, atualizados, ignorados, ambiguos e professores inativos preservados.

- [ ] **Step 5: Aplicar e validar dados**

Queries obrigatorias:

    select fonte, confianca, status, count(*)
    from public.professor_unidade_curso_modalidade
    group by fonte, confianca, status
    order by fonte, confianca, status;

    select professor_id, unidade_id, curso_id, modalidade, count(*)
    from public.professor_unidade_curso_modalidade
    where status = 'ativo' and vigencia_fim is null
    group by professor_id, unidade_id, curso_id, modalidade
    having count(*) > 1;

    select *
    from public.get_professor_curso_modalidade_reconciliacao_v1(null, null)
    where estado <> 'resolvido';

Expected:

- zero atribuicao ativa duplicada;
- zero reativacao de professor/unidade inativos;
- ambiguidades visiveis;
- linhas de zero carteira preservadas.

- [ ] **Step 6: Testes e commit**

    node --test tests/professorCursoModalidadeCanonico.test.mjs
    node --test tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
    node --test tests/professoresKpisCanonicos.test.mjs

    git add -- supabase/migrations/20260719201000_professor_unidade_curso_modalidade.sql tests/professorCursoModalidadeCanonico.test.mjs tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
    git commit -m "feat: canonizar atribuicoes de curso e modalidade"

---

## Task 4: Extrair a base detalhada sem criar uma segunda verdade

**Files:**
- Create: supabase/migrations/20260719202000_professores_carteira_segmentos_canonicos.sql
- Create: tests/professoresCarteiraSegmentosCanonicos.test.mjs
- Modify: tests/professoresKpisCanonicos.test.mjs

Nota de execucao: `tests/professoresConvergenciaCanonica.test.mjs` e um artefato
local preexistente e nao faz parte do gate versionado. Os invariantes necessarios
foram incorporados em `tests/professoresCarteiraSegmentosCanonicos.test.mjs`. Se o
arquivo local existir, ele pode ser executado como cobertura adicional, sem ser
alterado ou incluido no commit desta tarefa.

- [ ] **Step 1: Capturar equivalencia antes da mudanca**

Salvar o resultado completo da RPC viva para:

- junho/2026 e julho/2026;
- Barra, Recreio, Campo Grande e consolidado;
- Daiana, Gabriel Antony, Isaque, Peterson, Ramon e um professor multiunidade.

- [ ] **Step 2: Escrever testes de detalhe e equivalencia**

Exigir uma funcao interna:

    public.get_carteira_professor_periodo_detalhe_canonico_v1(
      p_ano integer,
      p_mes integer,
      p_unidade_id uuid default null,
      p_data_inicio date default null,
      p_data_fim date default null
    )

Retorno minimo:

    professor_id
    unidade_id
    pessoa_chave
    curso_id
    modalidade
    turma_chave
    elegivel_media
    fonte
    curso_resolvido
    modalidade_resolvida

O teste deve provar que get_carteira_professor_periodo_canonica agrega essa funcao, em vez de manter uma copia independente da regra.

- [ ] **Step 3: Confirmar falha**

    node --test tests/professoresCarteiraSegmentosCanonicos.test.mjs
    node --test tests/professoresKpisCanonicos.test.mjs

- [ ] **Step 4: Implementar a camada detalhada**

Extrair da definicao viva, nao de uma migration antiga:

- selecao de fonte preferida jornada > evento > legado;
- pessoa_chave;
- turma_chave;
- exclusao de projeto/banda;
- deduplicacao de reagendamento;
- recorte temporal;
- snapshot mensal auditado.

Acrescentar curso e modalidade sem inferencia:

- jornada: j.curso_id e lower(payload_snapshot #>> '{disciplina,tipo}');
- evento: curso_emusys_depara.curso_id e lower(aulas_emusys.tipo);
- legado sem modalidade oficial: modalidade nula, estado modalidade_nao_resolvida.

Reescrever get_carteira_professor_periodo_canonica com a mesma assinatura e mesmas colunas para agregar a funcao detalhada. O valor de carteira continua pessoas unicas. A media bruta continua ocupacoes pessoa/turma sobre turmas elegiveis.

Para snapshot mensal que nao possua decomposicao historica:

- preservar o total auditado como valor oficial;
- comparar o total detalhado reconstruido;
- marcar segmentacao_incompleta quando os totais nao fecharem;
- nunca inventar distribuicao proporcional.

- [ ] **Step 5: Validar equivalencia ao vivo**

Executar as mesmas consultas do baseline e comparar coluna a coluna:

    carteira_alunos
    media_alunos_turma
    total_turmas
    alunos_via_turmas
    turmas_elegiveis_media
    fonte_carteira

Expected: zero diferenca para os recortes baseline. Qualquer diferenca bloqueia o gate.

Validar modalidade:

    select modalidade, count(*)
    from public.get_carteira_professor_periodo_detalhe_canonico_v1(
      2026, 7, null, null, null
    )
    group by modalidade;

E verificar explicitamente:

- aula tipo turma com uma pessoa permanece turma;
- aula individual com turma_nome permanece individual;
- ensaio nao vira turma regular;
- curso sem de-para fica visivel como nao resolvido.

- [ ] **Step 6: Testes, performance e commit**

    node --test tests/professoresCarteiraSegmentosCanonicos.test.mjs
    node --test tests/professoresKpisCanonicos.test.mjs
    node --test tests/healthScoreProfessorV3Metricas.test.mjs

Rodar EXPLAIN ANALYZE para uma unidade e consolidado. O novo detalhe nao pode tornar o agregado mais de duas vezes mais lento que o baseline sem aprovacao.

    git add -- supabase/migrations/20260719202000_professores_carteira_segmentos_canonicos.sql tests/professoresCarteiraSegmentosCanonicos.test.mjs tests/professoresKpisCanonicos.test.mjs
    git commit -m "refactor: compartilhar base canonica dos segmentos"

---

## Task 5: Calcular Media/turma e Carteira por curso por segmento

**Files:**
- Create: supabase/migrations/20260719203000_health_score_v3_metricas_segmentadas.sql
- Create: tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs
- Modify: tests/healthScoreProfessorV3Metricas.test.mjs
- Modify: tests/healthScoreProfessorV3Performance.test.mjs

- [ ] **Step 1: Escrever testes das formulas**

Casos obrigatorios:

1. Media/turma:

    nota = min(
      100,
      100 * soma(ocupacoes_unicas)
          / soma(turmas_elegiveis * meta_media_turma)
    )

2. Valor bruto preservado:

    media_observada = soma(ocupacoes_unicas) / soma(turmas_elegiveis)

3. Carteira por curso:

    nota = min(
      100,
      100 * soma(vinculos_ativos_pontuaveis)
          / soma(meta_carteira_curso_dos_segmentos_pontuaveis)
    )

4. Pessoa em dois cursos:

- uma pessoa no total visual;
- dois vinculos nos segmentos.

5. Zero carteira:

- aparece com 0;
- estado sem_base_zero_carteira;
- fica fora do numerador e denominador;
- nao recebe nota zero.

6. Regra ausente:

- estado regra_ausente;
- bloqueia publicacao da metrica;
- nao usa meta global.

7. Capacidade:

- ocupacao acima da capacidade gera alerta;
- nao altera valor bruto nem nota.

- [ ] **Step 2: Confirmar falha**

    node --test tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs
    node --test tests/healthScoreProfessorV3Metricas.test.mjs

- [ ] **Step 3: Implementar RPC de metricas segmentadas**

Criar:

    public.get_health_score_professor_v3_metricas_segmentadas_v1(
      p_competencia date,
      p_config_id uuid,
      p_unidade_id uuid default null,
      p_periodicidade text default 'mensal'
    )

Ela deve devolver uma linha por professor/unidade/metrica/curso/modalidade com:

- valor observado;
- pessoas, vinculos, turmas e ocupacoes;
- meta e capacidade;
- numerador e denominador;
- nota de segmento;
- estado_base;
- fonte;
- atribuicao formal;
- divergencias.

Criar uma RPC agregadora para os dois pilares:

    public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(...)

O nome interno numero_alunos permanece por compatibilidade de schema, mas os detalhes devem carregar:

    nome_exibicao = 'Carteira por curso'
    pessoas_unicas_total
    vinculos_curso_modalidade

- [ ] **Step 4: Integrar ao motor sem tocar os outros quatro pilares**

Redefinir apenas o caminho de media_turma e numero_alunos em:

    public.get_health_score_professor_v3_metricas_periodo
    public.materializar_health_score_professor_v3_periodo
    public.vw_health_score_professor_v3_parcial_observado

Regras:

- retencao, permanencia, conversao e presenca continuam byte-a-byte na mesma fonte;
- media_turma.meta global passa a null;
- numero_alunos.meta global passa a null;
- a nota vem do agregado segmentado, nao de valor_bruto / meta_aplicada;
- cada materializacao grava as linhas filhas em health_score_professor_v3_snapshot_metrica_segmentos;
- o JSON detalhes e resumo, nunca unica evidencia;
- consolidado soma componentes das unidades, nunca scores unitarios.

- [ ] **Step 5: Testar sem base e redistribuicao de peso**

Validar:

- um professor so com segmentos zerados fica sem base nesse pilar;
- o peso do pilar e retirado do denominador geral;
- outro pilar nao recebe valor fabricado;
- um primeiro vinculo ativo torna o segmento pontuavel;
- segmento nao ofertado com dados gera divergencia;
- professor sem turma regular fica sem base em media_turma.

- [ ] **Step 6: Testes e commit**

    node --test tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs
    node --test tests/healthScoreProfessorV3Metricas.test.mjs
    node --test tests/healthScoreProfessorV3Performance.test.mjs
    node --test tests/healthScoreProfessorV3Snapshots.test.mjs

    git add -- supabase/migrations/20260719203000_health_score_v3_metricas_segmentadas.sql tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs tests/healthScoreProfessorV3Metricas.test.mjs tests/healthScoreProfessorV3Performance.test.mjs
    git commit -m "feat: calcular pilares v3 por segmento canonico"

---

## Task 6: Evoluir o ciclo de configuracao e a impressao digital

**Files:**
- Create: supabase/migrations/20260719204000_health_score_v3_config_segmentada_rpc.sql
- Create: tests/healthScoreProfessorV3ConfigSegmentada.test.mjs
- Modify: tests/healthScoreProfessorV3Frontend.test.mjs
- Modify: tests/healthScoreProfessorV3Snapshots.test.mjs

- [ ] **Step 1: Escrever testes do ciclo governado**

Exigir:

- get_health_score_professor_v3_config_ui retorna metas_segmentadas e pendencias;
- criar rascunho clona a matriz completa;
- salvar aceita metricas globais e matriz em uma transacao;
- salvar rejeita duplicata e meta acima da capacidade;
- salvar rejeita segmento sem curso/unidade/modalidade;
- fingerprint inclui a matriz;
- simulacao lista regra_ausente, zero carteira e superlotacao;
- ativacao exige simulacao da mesma revisao;
- ativacao aceita meta global nula para media_turma e numero_alunos somente quando a matriz esta completa;
- configuracao antiga continua legivel;
- snapshots fechados nao sao recalculados.

- [ ] **Step 2: Confirmar falha**

    node --test tests/healthScoreProfessorV3ConfigSegmentada.test.mjs
    node --test tests/healthScoreProfessorV3Frontend.test.mjs

- [ ] **Step 3: Redefinir leitura e clonagem de forma aditiva**

Redefinir com a mesma assinatura:

    fn_health_score_professor_v3_config_json(uuid)
    get_health_score_professor_v3_config_ui()
    criar_health_score_professor_v3_config_rascunho(date,text)

Adicionar ao JSON:

    metas_segmentadas
    segmentos_observados_sem_regra
    atribuicoes_sem_regra
    atribuicoes_zero_carteira
    divergencias_modalidade

Criar um novo overload atomico:

    salvar_health_score_professor_v3_config_rascunho(
      p_config_id uuid,
      p_vigencia_inicio date,
      p_justificativa text,
      p_metricas jsonb,
      p_metas_segmentadas jsonb
    )

Manter o overload antigo de quatro argumentos como wrapper de compatibilidade que preserva a matriz existente; ele nao pode apaga-la.

- [ ] **Step 4: Atualizar simulacao, fingerprint e ativacao**

Redefinir:

    fn_health_score_professor_v3_config_fingerprint(uuid)
    simular_health_score_professor_v3_config(uuid,date)
    ativar_health_score_professor_v3_config(uuid,text)

Fingerprint deve ordenar deterministicamente:

- seis metricas;
- unidade;
- curso;
- modalidade;
- estado;
- capacidade;
- meta de media;
- meta de carteira.

Ativacao deve bloquear:

- regra obrigatoria ausente;
- combinacao observada marcada nao_ofertada;
- atribuicao pontuavel sem meta;
- meta acima da capacidade;
- simulacao obsoleta;
- vigencia sobreposta.

Ativacao nao deve exigir meta global em media_turma ou numero_alunos quando parametros.normalizacao = segmentada_unidade_curso_modalidade.

- [ ] **Step 5: Validar grants**

Todas as RPCs de escrita:

- security definer;
- set search_path = public, pg_temp;
- guard professores.editar;
- revoke de public e anon;
- authenticated somente via RPC.

Queries:

    select routine_name, grantee, privilege_type
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name like '%health_score_professor_v3_config%'
    order by routine_name, grantee;

- [ ] **Step 6: Testes e commit**

    node --test tests/healthScoreProfessorV3ConfigSegmentada.test.mjs
    node --test tests/healthScoreProfessorV3Frontend.test.mjs
    node --test tests/healthScoreProfessorV3Snapshots.test.mjs
    node --test tests/healthScoreProfessorV3Contrato.test.mjs

    git add -- supabase/migrations/20260719204000_health_score_v3_config_segmentada_rpc.sql tests/healthScoreProfessorV3ConfigSegmentada.test.mjs tests/healthScoreProfessorV3Frontend.test.mjs tests/healthScoreProfessorV3Snapshots.test.mjs
    git commit -m "feat: governar configuracao segmentada v3"

---

## Task 7: Estender tipos e hook sem acesso direto a tabelas

**Files:**
- Modify: src/lib/healthScoreProfessorV3.ts
- Modify: src/hooks/useHealthScoreProfessorV3Config.ts
- Modify: tests/healthScoreProfessorV3Frontend.test.mjs
- Create: tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs

- [ ] **Step 1: Escrever testes de tipos e serializacao**

Exigir tipos:

    HealthScoreV3Modalidade = 'individual' | 'turma'
    HealthScoreV3SegmentGoalState = 'configurada' | 'nao_ofertada'
    HealthScoreV3SegmentGoal
    HealthScoreV3AssignmentSummary
    HealthScoreV3Config.metasSegmentadas
    HealthScoreV3ConfigUi.pendencias

O serializador deve emitir:

    unidade_id
    curso_id
    modalidade
    estado
    capacidade_maxima
    meta_media_turma
    meta_carteira_curso
    parametros

- [ ] **Step 2: Confirmar falha**

    node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs

- [ ] **Step 3: Implementar parser e serializador defensivos**

Adicionar:

    parseHealthScoreV3SegmentGoals(value)
    serializeHealthScoreV3SegmentGoals(goals)

Regras:

- null permanece null;
- modalidade desconhecida e descartada e contabilizada em pendencias;
- numero invalido nao vira zero;
- configuracao antiga sem metas_segmentadas continua parseando com lista vazia;
- nao alterar parser de snapshot dos outros pilares.

- [ ] **Step 4: Atualizar hook**

saveDraft passa os dois payloads:

    p_metricas
    p_metas_segmentadas

O hook continua chamando somente RPCs. Proibir qualquer:

    .from('health_score_professor_v3_...')
    .from('professor_unidade_curso_modalidade')

Expose operacoes:

    refresh()
    createDraft()
    saveDraft()
    simulate()
    activate()

Sem ativacao automatica depois de salvar ou simular.

- [ ] **Step 5: Rodar testes e build**

    node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
    node --test tests/healthScoreProfessorV3Frontend.test.mjs
    npm run build

- [ ] **Step 6: Commit**

    git add -- src/lib/healthScoreProfessorV3.ts src/hooks/useHealthScoreProfessorV3Config.ts tests/healthScoreProfessorV3Frontend.test.mjs tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
    git commit -m "feat: tipar configuracao segmentada do health score"

---

## Task 8: Construir a matriz de metas por unidade, curso e modalidade

**Files:**
- Create: src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx
- Modify: src/components/App/Professores/HealthScoreV3Config.tsx
- Modify: tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs

- [ ] **Step 1: Escrever teste estrutural da UI**

Exigir:

- sliders continuam exclusivos de peso;
- metas ficam em componente separado;
- abas de Barra, Recreio e Campo Grande;
- filtro por curso;
- filtro por modalidade;
- filtro de pendencias;
- colunas Curso, Modalidade, Capacidade maxima, Meta media/turma, Meta carteira, Estado e Fonte;
- individual e turma em linhas separadas;
- configuracao ativa read-only;
- edicao somente em rascunho;
- alerta quando meta_media_turma > capacidade_maxima;
- contadores de regra ausente, zero carteira e superlotacao;
- sem botao que ativa ao salvar.

- [ ] **Step 2: Confirmar falha**

    node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs

- [ ] **Step 3: Implementar componente focado**

HealthScoreV3MetasSegmentadas deve:

- receber metas e pendencias por props;
- manter dimensoes estaveis;
- usar tabela densa e sem cards aninhados;
- usar Select para unidade/modalidade/estado;
- usar Input number para capacidade e metas;
- usar icones Lucide em comandos;
- mostrar tooltips para conceitos menos familiares;
- manter texto dentro das celulas em desktop e mobile;
- nao alterar fonte com viewport;
- nao usar cor como unica indicacao de erro.

Validacoes locais:

    capacidade_maxima > 0
    meta_media_turma > 0
    meta_carteira_curso > 0
    meta_media_turma <= capacidade_maxima
    nao_ofertada => metas nulas

O backend continua sendo autoridade final.

- [ ] **Step 4: Integrar ao fluxo de rascunho**

HealthScoreV3Config continua com:

- seis sliders globais;
- soma de pesos igual a 100;
- metas globais para retencao, permanencia, conversao e presenca;
- metas globais de media_turma e numero_alunos exibidas como Segmentada por unidade/curso/modalidade, sem input global.

Adicionar secoes:

    Pesos dos pilares
    Metas globais remanescentes
    Metas por unidade, curso e modalidade
    Pendencias de atribuicao
    Simulacao

- [ ] **Step 5: Rodar testes e build**

    node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
    node --test tests/healthScoreProfessorV3Frontend.test.mjs
    npm run build

- [ ] **Step 6: Commit**

    git add -- src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx src/components/App/Professores/HealthScoreV3Config.tsx tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
    git commit -m "feat: adicionar matriz de metas segmentadas"

---

## Task 9: Criar conciliacao de atribuicoes sem alterar o cadastro legado

**Files:**
- Create: src/components/App/Professores/ProfessorCursoModalidadeReconciliacao.tsx
- Create: src/hooks/useProfessorCursoModalidadeReconciliacao.ts
- Modify: src/components/App/Professores/HealthScoreV3Config.tsx
- Modify: tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
- Modify: tests/professorCursoModalidadeCanonico.test.mjs

- [ ] **Step 1: Escrever testes**

Exigir:

- leitura e escrita somente por RPC;
- filtro por unidade e professor;
- exibicao de fonte e confianca;
- possibilidade de confirmar curso/modalidade em uma unidade;
- possibilidade de encerrar atribuicao sem apagar historico;
- curso com zero alunos permanece visivel;
- professor inativo nao recebe reativacao;
- professores_cursos e mostrado apenas como pista global;
- nenhuma alteracao no CRUD atual de ModalProfessor e ProfessoresPage.

- [ ] **Step 2: Confirmar falha**

    node --test tests/professorCursoModalidadeCanonico.test.mjs
    node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs

- [ ] **Step 3: Implementar hook por RPC**

O hook chama:

    get_professor_curso_modalidade_reconciliacao_v1
    salvar_professor_curso_modalidade_atribuicoes_v1

Ele nao consulta nem escreve tabelas diretamente.

- [ ] **Step 4: Implementar painel de reconciliacao**

Fluxo:

1. selecionar unidade;
2. selecionar professor;
3. revisar combinacoes observadas;
4. confirmar modalidade;
5. manter ou encerrar atribuicao;
6. registrar justificativa;
7. atualizar contadores da matriz.

Nao modificar nesta tarefa:

    src/components/App/Professores/ModalProfessor.tsx
    src/components/App/Professores/ProfessoresPage.tsx
    public.professores_cursos

Essa decisao reduz o risco de quebrar cadastro, videos por curso e filtros existentes. Uma integracao futura do modal podera delegar para a mesma RPC.

- [ ] **Step 5: Testar e commit**

    node --test tests/professorCursoModalidadeCanonico.test.mjs
    node --test tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs
    npm run build

    git add -- src/components/App/Professores/ProfessorCursoModalidadeReconciliacao.tsx src/hooks/useProfessorCursoModalidadeReconciliacao.ts src/components/App/Professores/HealthScoreV3Config.tsx tests/healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs tests/professorCursoModalidadeCanonico.test.mjs
    git commit -m "feat: adicionar conciliacao de atribuicoes pedagogicas"

---

## Task 10: Simular a configuracao sem ativar

**Files:**
- Create: scripts/verify-health-score-v3-segmentos.sql
- Create: docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-simulacao.md
- Modify: tests/healthScoreProfessorV3ConfigSegmentada.test.mjs

- [ ] **Step 1: Criar um novo rascunho**

Usar a RPC existente evoluida, com vigencia futura e justificativa clara. Nao alterar a ativa.

- [ ] **Step 2: Preencher uma matriz de homologacao**

As metas devem ser informadas pela direcao por:

    unidade + curso_id + modalidade

Nao usar:

- media global automatica;
- copia silenciosa entre unidades;
- copia silenciosa entre individual e turma;
- percentil corrente como meta permanente.

- [ ] **Step 3: Rodar simulacao**

Registrar:

- professores avaliados;
- score antes/depois;
- cobertura;
- segmentos sem regra;
- segmentos zerados;
- excedentes de capacidade;
- atribuicoes pendentes;
- diferenca entre pessoas visiveis e vinculos por curso.

- [ ] **Step 4: Casos de controle**

Validar no minimo:

- Bateria Barra turma;
- Bateria Campo Grande turma com meta diferente;
- Canto turma;
- Canto individual;
- professor com dois cursos;
- professor multiunidade;
- professor com curso atribuido e zero aluno;
- pessoa em dois cursos com professores diferentes;
- pessoa em dois cursos com o mesmo professor.

- [ ] **Step 5: Comparar valores brutos**

O script deve provar:

    novo total de pessoas = get_carteira_professor_periodo_canonica.carteira_alunos
    nova media bruta = get_carteira_professor_periodo_canonica.media_alunos_turma

E deve separar:

    total visual de pessoas
    vinculos pessoa/curso/modalidade
    ocupacoes pessoa/turma

- [ ] **Step 6: Nao ativar**

Gate termina com simulacao e relatorio. Nao executar ativar_health_score_professor_v3_config sem nova aprovacao do usuario.

- [ ] **Step 7: Testes e commit**

    node --test tests/healthScoreProfessorV3ConfigSegmentada.test.mjs
    node --test tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs

    git add -- scripts/verify-health-score-v3-segmentos.sql docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-simulacao.md tests/healthScoreProfessorV3ConfigSegmentada.test.mjs
    git commit -m "test: validar simulacao das metas segmentadas"

---

## Task 11: Auditoria de seguranca, performance e isolamento

**Files:**
- Create: tests/healthScoreProfessorV3MetasSegmentadasSecurity.test.mjs
- Create: docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-seguranca.md
- Modify: scripts/verify-health-score-v3-segmentos.sql

- [ ] **Step 1: Testar grants e guards**

Cobrir:

- anon sem SELECT nas tabelas;
- authenticated sem DML direto;
- usuario sem professores.editar nao salva, simula nem ativa;
- gerente/coordenacao autorizada le escopo permitido;
- service_role executa materializacao;
- search_path fixo em toda security definer.

- [ ] **Step 2: Testar imutabilidade**

Tentar em transacao de teste:

- alterar matriz de config ativa;
- apagar matriz usada por snapshot fechado;
- alterar segmento de snapshot fechado.

Expected: todas bloqueadas e transacao revertida.

- [ ] **Step 3: Testar performance**

Executar EXPLAIN (ANALYZE, BUFFERS) para:

- Barra mensal;
- Recreio mensal;
- Campo Grande mensal;
- consolidado mensal;
- simulacao da rede.

Gate:

- nenhuma regressao maior que 2x sobre o agregado baseline sem explicacao;
- consulta unitaria interativa dentro da mesma ordem de grandeza do Gate 4;
- indices usados nas tabelas novas;
- nenhum N+1 por professor na simulacao.

- [ ] **Step 4: Rodar suite completa relacionada**

    node --test tests/healthScoreProfessorV3*.test.mjs
    node --test tests/professorCursoModalidadeCanonico.test.mjs
    node --test tests/professoresCarteiraSegmentosCanonicos.test.mjs
    node --test tests/professoresKpisCanonicos.test.mjs
    npm run build

- [ ] **Step 5: Commit**

    git add -- tests/healthScoreProfessorV3MetasSegmentadasSecurity.test.mjs docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-seguranca.md scripts/verify-health-score-v3-segmentos.sql
    git commit -m "test: auditar seguranca das metas segmentadas"

---

## Task 12: Validacao visual e nao regressao end to end

**Files:**
- Create: docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-e2e.md
- Modify: docs/METRICAS.md
- Modify: docs/MAPA-SISTEMA.md

- [ ] **Step 1: Iniciar o app**

    npm run dev -- --host 127.0.0.1 --port 5175

Se 5175 estiver ocupado, usar a proxima porta livre e registrar a URL.

- [ ] **Step 2: Abrir com sessao autenticada**

Usar navegador controlado/Playwright com sessao existente. Nao registrar credenciais em arquivo, teste, screenshot ou log.

- [ ] **Step 3: Validar configuracao ativa**

Confirmar visualmente:

- ativa somente leitura;
- sliders alteram apenas pesos;
- metas globais de media/turma e numero de alunos nao aparecem como inputs editaveis;
- matriz segmentada mostra unidade, curso e modalidade;
- zero carteira aparece sem penalizacao;
- pendencias sao visiveis;
- layout nao sobrepoe texto em desktop e mobile.

- [ ] **Step 4: Validar rascunho**

Sem ativar:

- criar rascunho;
- editar Bateria Barra turma;
- editar Bateria Campo Grande turma com valor diferente;
- alternar individual/turma;
- provocar meta maior que capacidade e confirmar bloqueio;
- salvar;
- recarregar e confirmar persistencia;
- simular;
- confirmar que config ativa e snapshots fechados nao mudaram.

- [ ] **Step 5: Validar consumidores nao migrados**

Comparar antes/depois:

- Dashboard;
- Analytics;
- Comercial;
- Administrativo;
- relatorio gerencial;
- relatorio administrativo;
- relatorio comercial;
- Performance de professores;
- card individual;
- Carteira.

Expected:

- nenhuma dessas telas muda durante a sombra;
- total de alunos e media bruta continuam batendo com a fonte canonica;
- nenhum relatorio passa a ler a matriz antes do cutover individual.

- [ ] **Step 6: Registrar evidencias**

O relatorio E2E deve conter:

- URL e build;
- competencia e unidade testadas;
- screenshots desktop/mobile;
- consultas de comparacao;
- contagem de pendencias;
- resultado da simulacao;
- itens ainda bloqueados;
- rollback.

- [ ] **Step 7: Atualizar documentacao**

METRICAS.md:

- diferenciar Alunos, Carteira por curso e Ocupacoes;
- documentar formula e zero carteira;
- documentar capacidade como alerta.

MAPA-SISTEMA.md:

- novas tabelas;
- RPCs;
- fluxo rascunho -> salvar -> simular -> ativar;
- consumidores ainda em sombra.

- [ ] **Step 8: Verificacao final**

    git diff --check
    node --test tests/healthScoreProfessorV3*.test.mjs
    node --test tests/professorCursoModalidadeCanonico.test.mjs
    node --test tests/professoresCarteiraSegmentosCanonicos.test.mjs
    node --test tests/professoresKpisCanonicos.test.mjs
    npm run build

- [ ] **Step 9: Commit**

    git add -- docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-e2e.md docs/METRICAS.md docs/MAPA-SISTEMA.md
    git commit -m "docs: registrar validacao das metas segmentadas v3"

---

## Gate final desta entrega

Esta fase esta concluida quando:

- a camada detalhada reproduz exatamente os agregados canonicos atuais;
- curso e modalidade estao resolvidos sem inferencia por ocupacao;
- metas variam por unidade, curso e modalidade;
- pesos continuam globais e somam 100%;
- carteira zero esta visivel e nao penaliza;
- capacidade excedida alerta sem alterar dado;
- rascunho clona e salva a matriz atomicamente;
- simulacao usa a mesma matriz e a mesma impressao digital;
- nenhuma configuracao foi ativada sem aprovacao;
- nenhum consumidor produtivo mudou durante a sombra;
- seguranca, performance, build e browser passaram.

## Rollback

Rollback funcional:

1. desabilitar a feature flag da matriz na UI;
2. manter a configuracao ativa anterior;
3. interromper uso das RPCs segmentadas;
4. continuar consumindo get_carteira_professor_periodo_canonica com a mesma assinatura;
5. nao apagar matrizes, atribuicoes nem segmentos ja auditados.

Rollback de dados:

- nao remover snapshots fechados;
- nao apagar historico de atribuicao;
- marcar rascunho como arquivado se descartado;
- criar nova revisao para retificacao;
- nunca reescrever configuracao ativa.

## Proxima decisao depois da execucao

Depois da simulacao E2E, apresentar ao usuario:

1. matriz completa por unidade/curso/modalidade;
2. pendencias de atribuicao;
3. comparacao dos valores brutos;
4. impacto dos novos denominadores no score;
5. proposta de vigencia futura;
6. lista de consumidores para migracao individual.

Somente uma nova aprovacao autoriza ativar a configuracao e iniciar o cutover de consumidores.
