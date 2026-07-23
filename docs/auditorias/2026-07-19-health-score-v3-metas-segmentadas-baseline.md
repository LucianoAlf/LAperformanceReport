# Health Score Professor V3 - baseline de metas segmentadas

## Identificacao

- Data: 2026-07-19.
- Projeto Supabase: `ouqwbbermlzqqvtqwlul`.
- Fase: Task 1, definicao do contrato estrutural e registro de baseline.
- Escopo de implementacao: teste e documentacao; nenhum schema, RPC ou frontend foi implementado.
- Origem dos dados vivos: snapshot fornecido ao executor, obtido por consultas
  SELECT-only no banco em 2026-07-19.

## Fonte canonica viva

- Definicao: `get_carteira_professor_periodo_canonica`.
- Hash: `3145ca7e057d1cebd9971d13f76d4171`.
- Tamanho da definicao viva: `10806` bytes.
- Invariante: a fonte canonica deve ser preservada pelos calculos segmentados futuros.

## Proveniencia do baseline de validacao

- Testes `70/70` passando: resultado herdado do baseline executado pelo
  controlador antes da Task 1; esta task nao reexecutou a suite completa.
- Build aprovado: resultado herdado do mesmo baseline executado pelo controlador
  antes da Task 1; esta task nao reexecutou o build.
- Os warnings de chunks e Recharts tambem pertencem a execucao preexistente do
  controlador.

O contrato novo foi executado com:

```text
node --test tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs
```

Resultado esperado nesta Task 1: `FAIL` (`1` teste, `0` passando, `1` falhando,
exit code `1`). A falha ocorreu pelo motivo correto: as migrations abaixo ainda
nao existem e pertencem as Tasks 2 e 3:

- `supabase/migrations/20260719200000_health_score_v3_metas_segmentadas_schema.sql`;
- `supabase/migrations/20260719201000_professor_unidade_curso_modalidade.sql`.

Nenhuma implementacao foi adicionada para tornar o contrato verde nesta fase.

## Configuracao V3

- Versao `2`: ativa, com vigencia desde `2026-06-01`, sem fim de vigencia e com
  `6` metricas.
- Versao `1`: arquivada, com vigencia de `2026-07-01` a `2026-07-18` e com `6`
  metricas.
- Nao ha versao em rascunho no snapshot fornecido.
- Nenhuma configuracao deve ser ativada nesta fase.

## Cobertura segmentada SELECT-only

O snapshot vivo de jornadas ativas em 2026-07-19 registrou:

- `49` combinacoes distintas de unidade + curso + modalidade;
- `0` linhas ativas e `0` combinacoes ativas sem `curso_id`;
- `0` linhas ativas e `0` combinacoes ativas sem modalidade oficial;
- `24` professores ativos multiunidade.

Para a contagem multiunidade foram aplicados cumulativamente os criterios:
professor ativo, unidade ativa, `coalesce(emusys_ativo, true) = true` e
`validacao_status` nao classificado como `ignorado` ou `rejeitado`.

## Jornadas ativas

| Unidade | Modalidade | Curso resolvido |
| --- | --- | ---: |
| Barra | turma | 266/266 |
| Campo Grande | turma | 506/506 |
| Campo Grande | individual | 6/6 |
| Recreio | turma | 431/431 |
| Recreio | individual | 4/4 |

## Agregados canonicos

| Competencia | Unidade | Professores | Soma das carteiras | Ocupacoes | Turmas | Media ponderada |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Jun/2026 | Barra | 19 | 263 | 270 | 238 | 1.1345 |
| Jun/2026 | Campo Grande | 31 | 557 | 533 | 337 | 1.5816 |
| Jun/2026 | Recreio | 25 | 424 | 423 | 351 | 1.2051 |
| Jul/2026 | Barra | 19 | 262 | 253 | 223 | 1.1345 |
| Jul/2026 | Campo Grande | 32 | 501 | 467 | 315 | 1.4825 |
| Jul/2026 | Recreio | 24 | 411 | 367 | 309 | 1.1877 |

## Consumidores e guardas

### Banco vivo em 2026-07-19

As consultas SELECT-only encontraram tres consumidores diretos vivos de
`get_carteira_professor_periodo_canonica`:

- `get_health_score_professor_v3_carteira_periodo(date,uuid,text)`;
- `get_kpis_professor_periodo_canonico_base_20260711(integer,integer,uuid,date,date)`;
- `get_saidas_professor_periodo_canonicas_v1(integer,integer,uuid,date,date)`.

Nenhuma view viva usa diretamente `get_carteira_professor_periodo_canonica`.

### Artefatos versionados encontrados por rg

- `supabase/migrations/20260719123000_health_score_v3_carteira_canonica_periodo.sql`
  define o wrapper do Health Score e referencia a carteira canonica.
- `supabase/migrations/20260719123500_health_score_v3_metricas_periodo_otimizada.sql`
  consome o wrapper para `media_turma` e `numero_alunos`.
- `supabase/migrations/20260713232404_kpis_professores_carteira_historica_canonica.sql`
  define o consumidor base de KPIs e referencia a carteira canonica.
- `supabase/migrations/20260715224149_professores_saidas_fator_demanda_canonicos.sql`
  define o consumidor canonico de saidas e referencia a carteira canonica.
- `supabase/migrations/20260715151000_professores_media_turma_pessoas_unicas.sql`
  guarda a definicao via `pg_get_functiondef` e reaplica restricao de execucao ao
  `service_role`.
- `supabase/migrations/20260713233627_kpis_professores_carteira_rpc_segura.sql`
  revoga a carteira e a funcao base de `public`, `anon` e `authenticated`,
  mantendo execucao apenas para `service_role`.
- Nenhuma ocorrencia foi encontrada em `src`; os consumidores versionados ficam
  encapsulados nas migrations/RPCs.

### Testes de guarda encontrados por rg

- `tests/healthScoreProfessorV3Cutover.test.mjs` exige a carteira canonica e o
  wrapper do Health Score nas migrations de cutover.
- `tests/professoresKpisCanonicos.test.mjs` guarda a tabela de fechamento e os
  revokes das funcoes canonicas.
- `tests/professoresSaidasFatorCanonicos.test.mjs` guarda o consumidor canonico
  de saidas e impede dependencia indevida em caminhos especificos.
- `tests/healthScoreProfessorV3MetasSegmentadasContrato.test.mjs` guarda o
  contrato futuro de metas segmentadas sem implementar as migrations.

## Invariantes

- A fonte canonica deve permanecer preservada.
- Os valores novos devem fechar exatamente contra os agregados deste baseline.
- O calculo segmentado deve ter zero fallback global.
- O estado futuro `sem_base_zero_carteira` deve ser explicito.
- Nao havera ativacao de configuracao nesta fase.
- Nao pode haver escrita ou alteracao em `aluno_presenca`, `aulas_emusys` ou no
  pipeline de churn.
- `professores_cursos` e `professores_unidades` nao podem formar produto
  cartesiano.

## Alteracoes locais preexistentes fora do escopo

Os arquivos abaixo ja estavam modificados ou nao rastreados no worktree. Eles
nao devem ser editados, revertidos, staged ou incluidos no commit desta task:

- `src/components/App/Professores/HealthScoreV3Config.tsx`;
- `supabase/migrations/20260719160000_professores_media_turma_ocupacao_estavel.sql`;
- `supabase/migrations/20260719161000_relatorio_gerencial_rankings_professores_canonicos.sql`;
- `supabase/migrations/20260719162000_health_score_v3_meta_status_repair.sql`;
- `supabase/migrations/20260719163000_relatorio_gerencial_legacy_rankings_privado.sql`;
- `tests/professoresConvergenciaCanonica.test.mjs`.
