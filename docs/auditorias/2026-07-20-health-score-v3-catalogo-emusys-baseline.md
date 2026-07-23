# Baseline - Catalogo Emusys e configuracao segmentada do Health Score V3

**Data:** 2026-07-20  
**Projeto verificado:** `https://ouqwbbermlzqqvtqwlul.supabase.co`  
**Modo:** auditoria `SELECT-only`; nenhuma escrita, migration ou deploy executado  
**Git:** `main` alinhada a `origin/main` no commit `469d841`

## Veredito inicial

O sistema atual preserva 245 atribuicoes ativas, mas a origem V1 ainda mistura
evidencia curricular com sinais operacionais de aula e pistas legadas. O novo
catalogo deve nascer de IDs do Emusys escopados por unidade e permanecer
aditivo ate a homologacao.

## Baseline local

| Verificacao | Resultado |
|---|---:|
| Divergencia `HEAD...origin/main` | `0 / 0` |
| Testes atuais do dominio segmentado | `68 / 68` passando |
| Build Vite de producao | passou |
| Deno | `2.5.1` |

O build manteve apenas os avisos preexistentes de chunks grandes e reexportacao
circular de `Bar` pelo Recharts. Nenhum deles foi introduzido nesta tarefa.

## Baseline remoto

### Vinculos e evidencias V1

| Indicador | Quantidade |
|---|---:|
| Atribuicoes ativas | 245 |
| Evidencias materializaveis | 248 |
| Evidencia de jornada alta | 197 |
| Evidencia de aula media | 51 |
| Conflito modalidade jornada x aula | 182 |

### Fila V1

| Estado | Origem | Confianca | Quantidade |
|---|---|---|---:|
| `conflito_modalidade_jornada_aula` | `aula` | `media` | 182 |
| `pendente_materializacao` | `jornada` | `alta` | 3 |
| `pista_professores_cursos_sem_escopo` | `manual` | `media` | 75 |
| `resolvido` | `aula` | `media` | 51 |
| `resolvido` | `jornada` | `alta` | 194 |

Os 182 conflitos sao contaminados pelo uso de `aulas_emusys.tipo` como sinal
de modalidade. As 75 pistas vem de `professores_cursos`, que nao possui o grao
obrigatorio de unidade e modalidade. Nenhuma dessas duas classes deve ocupar a
fila operacional V2. As duas linhas `resolvido` totalizam as 245 atribuicoes
ativas, separadas por origem e confianca.

### Consumidores vivos

| Camada | Evidencia local | RPC consumida |
|---|---|---|
| Browser | `src/hooks/useProfessorCursoModalidadeReconciliacao.ts:109` | `get_professor_curso_modalidade_reconciliacao_v1` |
| Browser | `src/hooks/useHealthScoreProfessorV3Config.ts:43` | `get_health_score_professor_v3_config_ui` |
| Verificacao SQL | `scripts/verify-health-score-v3-segmentos.sql:6` | `get_health_score_professor_v3_config_ui` |
| Funcao SQL | `supabase/migrations/20260719204000_health_score_v3_config_segmentada_rpc.sql:173` | `get_professor_curso_modalidade_reconciliacao_v1` |

`fn_professor_curso_modalidade_evidencias_v1` e
`reconciliar_professor_curso_modalidade_v1` sao rotinas internas do banco; nao
ha chamada direta dessas rotinas pelo browser no recorte inspecionado.

Comando reproduzivel usado no inventario local:

```powershell
rg -n "fn_professor_curso_modalidade_evidencias_v1|get_professor_curso_modalidade_reconciliacao_v1|reconciliar_professor_curso_modalidade_v1|get_health_score_professor_v3_config_ui" src scripts supabase/migrations
```

### Valores observados em junho e julho

| Competencia | Unidade | Metrica | n | Soma | Media | Min | Max |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-06 | Barra | `media_turma` | 19 | 22.63 | 1.19 | 1 | 2 |
| 2026-06 | Barra | `numero_alunos` | 19 | 263 | 13.84 | 2 | 46 |
| 2026-06 | Campo Grande | `media_turma` | 30 | 47.38 | 1.58 | 1 | 2.73 |
| 2026-06 | Campo Grande | `numero_alunos` | 31 | 557 | 17.97 | 0 | 51 |
| 2026-06 | Recreio | `media_turma` | 25 | 29.67 | 1.19 | 1 | 2 |
| 2026-06 | Recreio | `numero_alunos` | 25 | 424 | 16.96 | 1 | 57 |
| 2026-07 | Barra | `media_turma` | 19 | 22.14 | 1.17 | 1 | 2.11 |
| 2026-07 | Barra | `numero_alunos` | 19 | 262 | 13.79 | 3 | 43 |
| 2026-07 | Campo Grande | `media_turma` | 31 | 46.64 | 1.50 | 1 | 3.25 |
| 2026-07 | Campo Grande | `numero_alunos` | 33 | 501 | 15.18 | 0 | 43 |
| 2026-07 | Recreio | `media_turma` | 24 | 27.66 | 1.15 | 1 | 1.67 |
| 2026-07 | Recreio | `numero_alunos` | 24 | 411 | 17.13 | 1 | 50 |

Os tamanhos de amostra acima sao mantidos como medidos; nao houve preenchimento
das diferencas de `n` entre metricas.

Queries `SELECT-only` reproduziveis para vinculos, evidencias e fila V1:

```sql
select
  count(*) filter (where materializavel) as evidencias_materializaveis,
  count(*) filter (
    where materializavel and fonte = 'jornada' and confianca = 'alta'
  ) as evidencia_jornada_alta,
  count(*) filter (
    where materializavel and fonte = 'aula' and confianca = 'media'
  ) as evidencia_aula_media,
  count(*) filter (
    where estado = 'conflito_modalidade_jornada_aula'
  ) as conflitos_modalidade
from public.fn_professor_curso_modalidade_evidencias_v1(
  public.fn_professor_curso_modalidade_data_local_la_v1(),
  null,
  null
);

select estado, fonte, confianca, count(*)::integer as quantidade
from public.get_professor_curso_modalidade_reconciliacao_v1(null, null)
group by estado, fonte, confianca
order by estado, fonte, confianca;

select count(*)::integer as atribuicoes_ativas
from public.professor_unidade_curso_modalidade
where status = 'ativo';
```

Query `SELECT-only` reproduzivel para os valores observados em junho e julho:

```sql
with competencias(competencia) as (
  values (date '2026-06-01'), (date '2026-07-01')
), unidades as (
  select id, nome
  from public.unidades
  where nome in ('Barra', 'Recreio', 'Campo Grande')
), dados as (
  select c.competencia, u.nome as unidade, p.metrica, p.valor_bruto
  from competencias c
  cross join unidades u
  cross join lateral public.get_health_score_professor_v3_performance(
    c.competencia,
    u.id,
    'mensal'
  ) p
  where p.metrica in ('media_turma', 'numero_alunos')
    and p.valor_bruto is not null
)
select
  competencia,
  unidade,
  metrica,
  count(*)::integer as n,
  round(sum(valor_bruto), 2) as soma,
  round(avg(valor_bruto), 2) as media,
  min(valor_bruto) as minimo,
  max(valor_bruto) as maximo
from dados
group by competencia, unidade, metrica
order by competencia, unidade, metrica;
```

### Configuracao V3 atual

| Indicador | Valor |
|---|---|
| Configuracao ativa | `9af37ebb-761f-4234-bb74-9136d8399e3f` |
| Rascunho | `0e6a01ab-073a-46f0-9148-5412e795d9da` |
| Segmentos observados sem regra | 47 |
| Atribuicoes sem regra | 194 |
| Divergencias de modalidade | 182 |

As chaves raiz observadas na resposta foram `ativa`, `modo`, `pendencias`,
`publicacao_produtiva` e `rascunho`.

| Versao | ID | `metas_segmentadas` | Configuradas | Nao ofertadas |
|---|---|---|---:|---:|
| Ativa | `9af37ebb-761f-4234-bb74-9136d8399e3f` | `[]` | 0 | 0 |
| Rascunho | `0e6a01ab-073a-46f0-9148-5412e795d9da` | `[]` | 0 | 0 |

Portanto, no estado observado, tanto `configuradas` quanto `nao_ofertadas` sao
explicitamente zero nas duas versoes; nao se inferiu regra a partir das 47
pendencias.

`get_health_score_professor_v3_config_ui()` ainda nao retorna
`catalogo_segmentos`. A matriz atual nasce de agregados observados e representa
ausencia de regra de maneira que a nova UX precisa substituir por
`nao_configurada`, com metas nulas e sem zero sintetico.

## Definicoes inspecionadas

- `fn_professor_curso_modalidade_evidencias_v1(date, uuid, integer)` consulta
  `aluno_jornada_matricula_disciplina`, mas tambem usa `aulas_emusys.tipo` para
  formar modalidade e conflitos.
- `reconciliar_professor_curso_modalidade_v1(date)` materializa evidencias de
  jornada e aula com fontes `jornada` e `aula`.
- `get_professor_curso_modalidade_reconciliacao_v1(uuid, integer)` inclui
  `professores_cursos` como pista global sem unidade/modalidade.
- `get_health_score_professor_v3_config_ui()` deriva pendencias dos agregados
  atuais e nao entrega catalogo oficial do Emusys.

As definicoes vivas foram lidas com `pg_get_functiondef`, sem usar o texto das
migrations como substituto:

| Assinatura | MD5 de `pg_get_functiondef` | Comprimento |
|---|---|---:|
| `fn_professor_curso_modalidade_evidencias_v1(date,uuid,integer)` | `c5673bfd3dc448d3acc676d236c6c0dc` | 12061 |
| `get_health_score_professor_v3_config_ui()` | `77f6f4ac051c4d470f4f356244f7d95f` | 5543 |
| `get_professor_curso_modalidade_reconciliacao_v1(uuid,integer)` | `7c54fae75cc9b37a32ffaec7ddb41635` | 6248 |
| `reconciliar_professor_curso_modalidade_v1(date)` | `784fd81d90961d7f9487e9e070fc9783` | 8877 |

Query `SELECT-only` reproduzivel para as definicoes e seus hashes:

```sql
with assinaturas(assinatura) as (
  values
    ('public.fn_professor_curso_modalidade_evidencias_v1(date,uuid,integer)'::regprocedure),
    ('public.get_health_score_professor_v3_config_ui()'::regprocedure),
    ('public.get_professor_curso_modalidade_reconciliacao_v1(uuid,integer)'::regprocedure),
    ('public.reconciliar_professor_curso_modalidade_v1(date)'::regprocedure)
)
select
  assinatura::text as assinatura,
  md5(pg_get_functiondef(assinatura::oid)) as md5,
  length(pg_get_functiondef(assinatura::oid)) as comprimento
from assinaturas
order by assinatura::text;
```

Query `SELECT-only` reproduzivel para as chaves raiz, IDs e contagens de metas:

```sql
with ui as (
  select public.get_health_score_professor_v3_config_ui()::jsonb as payload
)
select array_agg(chave order by chave) as chaves_raiz
from ui
cross join lateral jsonb_object_keys(ui.payload) as keys(chave);

with ui as (
  select public.get_health_score_professor_v3_config_ui()::jsonb as payload
),
versoes as (
  select 'ativa'::text as versao, payload -> 'ativa' as config from ui
  union all
  select 'rascunho', payload -> 'rascunho' from ui
)
select
  versao,
  config ->> 'id' as id,
  coalesce(config -> 'metas_segmentadas', '[]'::jsonb) as metas_segmentadas,
  (
    select count(*)
    from jsonb_array_elements(
      coalesce(config -> 'metas_segmentadas', '[]'::jsonb)
    ) as meta
    where meta ->> 'estado' = 'configurada'
  ) as configuradas,
  (
    select count(*)
    from jsonb_array_elements(
      coalesce(config -> 'metas_segmentadas', '[]'::jsonb)
    ) as meta
    where meta ->> 'estado' = 'nao_ofertada'
  ) as nao_ofertadas
from versoes
order by versao;

with ui as (
  select public.get_health_score_professor_v3_config_ui()::jsonb as payload
)
select
  jsonb_array_length(
    coalesce(payload #> '{pendencias,segmentos_observados_sem_regra}', '[]'::jsonb)
  ) as segmentos_observados_sem_regra,
  jsonb_array_length(
    coalesce(payload #> '{pendencias,atribuicoes_sem_regra}', '[]'::jsonb)
  ) as atribuicoes_sem_regra,
  jsonb_array_length(
    coalesce(payload #> '{pendencias,divergencias_modalidade}', '[]'::jsonb)
  ) as divergencias_modalidade
from ui;
```

## Invariantes para a implementacao

1. IDs Emusys sao escopados por unidade.
2. A jornada canonica permanece `aluno_jornada_matricula_disciplina`.
3. Nome nunca resolve identidade definitiva.
4. `aulas_emusys.tipo` nao define modalidade curricular.
5. `professores_cursos` nao entra na fila operacional V2.
6. Falha parcial de sync nunca inativa catalogo previamente valido.
7. Regra ausente permanece vazia; nunca vira meta zero.
8. Configuracao ativa, snapshots fechados e consumidores atuais nao mudam
   durante a implantacao em sombra.
9. Presenca, permanencia, relatorios, financeiro e churn ficam fora deste
   recorte.
10. Nenhuma rotina nova escreve em `aulas_emusys`, `aluno_presenca` ou
    `anotacoes_fabio`.

## Criterio de comparacao dos gates

O Gate 1 deve provar completude e idempotencia do sync sem alterar as 245
atribuicoes atuais. O Gate 2 deve reduzir a zero os falsos conflitos de
`aulas_emusys.tipo`, as pistas legadas e as tres pendencias materializaveis,
preservando V1 para rollback. Os gates de configuracao devem manter a ativa e
os snapshots fechados byte a byte enquanto o rascunho novo e editado.
