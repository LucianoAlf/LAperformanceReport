# Health Score V3 - pendencias humanas de retencao

**Data:** 27/07/2026

**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`

**Estado:** cinco casos em revisao, todos com `publicavel=false`

**Execucao desta Task:** somente leitura; nenhum comando de gravacao foi
executado

## Objetivo

Manter a fila humana aprovada fora da base limpa de retencao e pronta para uma
decisao de Alf. O script canonico da fila e:

`scripts/health-score-v3-pendencias-humanas-2026-07.sql`

O grao auditado e:

`unidade + aluno Emusys + periodo professor-disciplina`

Os nomes sao apenas rotulos dos cinco casos aprovados para revisao. A consulta
resolve cada caso por `unidade_id + emusys_aluno_id` e seleciona o periodo por
IDs Emusys de professor e disciplina. Nome de aluno ou professor nao promove
confianca e nao torna um periodo publicavel.

## Fontes

- `professor_periodos_reconstrucoes_v1`: ultima reconstrucao concluida por
  unidade;
- `professor_matricula_disciplina_periodos_v1`: periodo bruto imutavel e suas
  evidencias;
- `vw_professor_periodos_efetivos_v3_sombra`: estado efetivo apos a ultima
  revisao humana;
- `aluno_jornada_matricula_disciplina`: jornada atual canonica por unidade,
  matricula e disciplina;
- `professor_periodos_revisoes_v1`: decisoes append-only;
- `professores`, `cursos` e `unidades`: rotulos locais.

Nao sao usados `alunos.percentual_presenca`, tabelas legadas de renovacao,
nome como identidade ou payload bruto de automacao.

## Fila em 27/07/2026

A consulta remota foi executada somente com `SELECT`. Ela retornou cinco linhas,
na ordem fixa abaixo.

| Caso | Unidade | Periodo em revisao (UTC) | Professor anterior | Professor atual | Disciplina do periodo | Jornada atual | Evidencia principal |
|---|---|---|---|---|---|---|---|
| Beatriz von Glehn Herkenhoff | Barra | 06/07/2026 18:00 a 13/07/2026 18:00 | Erick Cosme | Jeyson Gaia | Teclado | Teclado T | 2 aulas; conflito `jornada_atual_divergente` |
| Gabriela de Lima Sodre | Barra | 02/07/2026 20:00 a 16/07/2026 20:00 | Gabriel Santos | Gabriel Antony | Musicalizacao Preparat. | Musicalizacao Preparat. | 3 aulas; conflito `jornada_atual_divergente` |
| Gabriela Dornas | Barra | 27/02/2026 20:00 a 10/07/2026 20:00 | Lohana Leopoldo | Lohana Leopoldo | Teclado | Canto T | 2 aulas; disciplina atual divergente |
| Sirley Jorge Martins Dantas | Campo Grande | 02/07/2026 20:00 a 02/07/2026 20:00 | Israel Rocha | Alexandre de Sa | Violao | Violao IND | 1 aula; matricula-disciplina ausente no periodo |
| Lohan Marques Boente | Recreio | 01/07/2026 20:00 a 08/07/2026 20:00 | Ana Beatriz Paz | Erick Cosme | Musicalizacao Preparat. | Bateria | 1 aula; mesmo ID de matricula-disciplina com disciplina atual divergente |

As divergencias acima sao evidencias para decisao, nao regras automaticas. A
saida completa do script inclui IDs, limites do periodo, contadores da jornada,
conflitos, evidencias reconstruidas e a ultima revisao append-only.

## Publicabilidade e score parcial

Enquanto nao houver decisao humana valida, cada periodo permanece
`publicavel=false` e fica fora de `vinculos_expostos_limpos`.

Essas pendencias nao bloqueiam o score parcial quando a amostra limpa do
professor e maior ou igual a 10. Nesse cenario:

- a amostra e o denominador usam somente periodos `publicavel=true`;
- os cinco casos continuam em `vinculos_em_revisao`;
- o estado pode ser `ok_com_pendencias`;
- o score parcial permanece calculavel e publicavel;
- a confianca fica `media` enquanto houver pendencias;
- o fechamento oficial continua sujeito aos gates proprios do ciclo.

Logo, fila humana e score parcial sao trilhas paralelas. Resolver um dos cinco
casos melhora a cobertura historica, mas nao e pre-condicao para o parcial com
amostra limpa suficiente.

## Decisoes permitidas

### Aprovar

Usar quando o periodo, o professor e os limites forem confirmados pelas
evidencias. A nova linha deve usar `decisao='aprovado'`, preservar o snapshot
anterior e registrar no posterior `confianca='revisado_aprovado'`.

A aprovacao so pode produzir `publicavel=true` quando professor local,
professor Emusys, matricula-disciplina e limites estiverem completos e
coerentes.

### Corrigir professor

Usar quando o periodo existir, mas o titular estiver incorreto. A nova linha
deve usar `decisao='corrigido'`, preencher `professor_corrigido_id` e
`emusys_professor_corrigido_id`, ambos validados na mesma unidade, e preservar
os valores anteriores no snapshot.

Nome de professor nao e chave. A correcao exige o par de IDs local/Emusys
escopado pela unidade.

### Invalidar

Usar quando o segmento for espurio, duplicado ou nao representar um vinculo
pedagogico. No schema atual, a acao de negocio `invalidar` e registrada como
`decisao='rejeitado'`; o snapshot posterior recebe
`status_periodo='invalidado'` e `publicavel=false`.

O periodo bruto nao e apagado nem alterado.

## Restricao estrutural de Sirley

O periodo de Sirley nao possui `emusys_matricula_disciplina_id`. A view efetiva
exige esse identificador para publicar uma aprovacao. Portanto:

- `aprovar` isoladamente nao resolve o caso;
- `corrigir professor` isoladamente tambem nao resolve o caso;
- `invalidar` pode ser registrado na trilha atual;
- uma promocao futura exige primeiro uma evidencia estrutural aditiva que
  resolva a matricula-disciplina, sem sobrescrever o periodo bruto.

## Comando append-only preparado

Nao existe RPC dedicada para essa revisao no estado atual do repositorio. O
caminho existente e uma nova linha em `professor_periodos_revisoes_v1`, com
acesso restrito a `service_role`. O trigger da tabela bloqueia alteracao e
exclusao.

O modelo abaixo foi preparado, mas **nao foi executado**. Os marcadores entre
`<...>` precisam ser substituidos somente depois da decisao de Alf e de um novo
precheck pelo script da fila.

```sql
with parametros as (
  select
    '<PERIODO_ID>'::uuid as periodo_id,
    '<aprovado|corrigido|rejeitado>'::text as decisao,
    '<MOTIVO_OBRIGATORIO>'::text as motivo,
    nullif('<PROFESSOR_CORRIGIDO_ID_OU_VAZIO>', '')::integer
      as professor_corrigido_id,
    nullif('<EMUSYS_PROFESSOR_CORRIGIDO_ID_OU_VAZIO>', '')::bigint
      as emusys_professor_corrigido_id,
    nullif('<DATA_INICIO_CORRIGIDA_OU_VAZIO>', '')::timestamptz
      as data_inicio_corrigida,
    nullif('<DATA_FIM_CORRIGIDA_OU_VAZIO>', '')::timestamptz
      as data_fim_corrigida,
    '<IDEMPOTENCY_KEY_DO_CASO_E_DECISAO>'::text as idempotency_key,
    '<USUARIO_REVISOR_ID>'::integer as revisado_por
), alvo as (
  select
    p.*,
    x.decisao,
    x.motivo,
    x.professor_corrigido_id,
    x.emusys_professor_corrigido_id,
    x.data_inicio_corrigida,
    x.data_fim_corrigida,
    x.idempotency_key,
    x.revisado_por as decisao_revisado_por
  from public.professor_matricula_disciplina_periodos_v1 p
  join parametros x on x.periodo_id = p.id
  where p.publicavel is false
), validado as (
  select a.*
  from alvo a
  where a.decisao = 'rejeitado'
     or (
       a.decisao in ('aprovado', 'corrigido')
       and coalesce(a.professor_corrigido_id, a.professor_id) is not null
       and coalesce(
         a.emusys_professor_corrigido_id,
         a.emusys_professor_id
       ) is not null
       and a.emusys_matricula_disciplina_id is not null
       and coalesce(a.data_inicio_corrigida, a.data_inicio) is not null
       and (
         coalesce(a.data_fim_corrigida, a.data_fim) is null
         or coalesce(a.data_fim_corrigida, a.data_fim)
           >= coalesce(a.data_inicio_corrigida, a.data_inicio)
       )
     )
)
insert into public.professor_periodos_revisoes_v1 (
  periodo_id,
  reconstrucao_id,
  decisao,
  motivo,
  professor_corrigido_id,
  emusys_professor_corrigido_id,
  data_inicio_corrigida,
  data_fim_corrigida,
  motivo_saida_id,
  conta_retencao_professor,
  snapshot_anterior,
  snapshot_posterior,
  revisado_por
)
select
  v.id,
  v.reconstrucao_id,
  v.decisao,
  v.motivo,
  v.professor_corrigido_id,
  v.emusys_professor_corrigido_id,
  v.data_inicio_corrigida,
  v.data_fim_corrigida,
  v.motivo_saida_id,
  v.conta_retencao_professor,
  to_jsonb(v)
    - 'decisao'
    - 'motivo'
    - 'professor_corrigido_id'
    - 'emusys_professor_corrigido_id'
    - 'data_inicio_corrigida'
    - 'data_fim_corrigida'
    - 'idempotency_key'
    - 'decisao_revisado_por',
  (
    to_jsonb(v)
      - 'decisao'
      - 'motivo'
      - 'professor_corrigido_id'
      - 'emusys_professor_corrigido_id'
      - 'data_inicio_corrigida'
      - 'data_fim_corrigida'
      - 'idempotency_key'
      - 'decisao_revisado_por'
  ) || jsonb_build_object(
    'professor_id', coalesce(v.professor_corrigido_id, v.professor_id),
    'emusys_professor_id', coalesce(
      v.emusys_professor_corrigido_id,
      v.emusys_professor_id
    ),
    'data_inicio', coalesce(v.data_inicio_corrigida, v.data_inicio),
    'data_fim', coalesce(v.data_fim_corrigida, v.data_fim),
    'status_periodo', case
      when v.decisao = 'rejeitado' then 'invalidado'
      else v.status_periodo
    end,
    'confianca', case
      when v.decisao in ('aprovado', 'corrigido')
        then 'revisado_aprovado'
      else 'revisar'
    end,
    'publicavel', v.decisao in ('aprovado', 'corrigido'),
    'revisao_pendencias_humanas_2026_07', jsonb_build_object(
      'idempotency_key', v.idempotency_key,
      'decisao_negocio', case
        when v.decisao = 'rejeitado' then 'invalidar'
        else v.decisao
      end,
      'fonte', 'decisao_alf_pendencias_humanas_2026_07'
    )
  ),
  v.decisao_revisado_por
from validado v
where not exists (
  select 1
  from public.professor_periodos_revisoes_v1 rv
  where rv.periodo_id = v.id
    and rv.snapshot_posterior
      -> 'revisao_pendencias_humanas_2026_07'
      ->> 'idempotency_key' = v.idempotency_key
)
returning id, periodo_id, decisao, created_at;
```

### Parametros por caso

Cada decisao deve usar o `periodo_id` devolvido na execucao imediatamente
anterior do script, nunca um UUID copiado de uma reconstrucao antiga.

| Caso | Aprovar | Corrigir professor | Invalidar |
|---|---|---|---|
| Beatriz | confirma Erick no periodo | informa IDs do titular confirmado | rejeita o segmento |
| Gabriela de Lima | confirma Gabriel Santos | informa IDs do titular confirmado | rejeita o segmento |
| Gabriela Dornas | confirma Lohana no periodo de Teclado | informa IDs do titular confirmado | rejeita o segmento |
| Sirley | bloqueado ate resolver matricula-disciplina | bloqueado ate resolver matricula-disciplina | rejeita o segmento fallback |
| Lohan | confirma Ana Beatriz no periodo | informa IDs do titular confirmado | rejeita o segmento |

Uma RPC futura deve apenas encapsular esse contrato com autenticacao de
coordenacao, verificacao de unidade, motivo obrigatorio, idempotencia e a mesma
gravacao append-only. Nenhuma RPC foi criada nesta Task.

## Validacao

- projeto remoto confirmado: `ouqwbbermlzqqvtqwlul`;
- consulta remota executada somente com `SELECT`;
- resultado: exatamente cinco linhas, na ordem aprovada;
- os cinco casos retornaram `publicavel=false`;
- nenhum dado foi gravado ou alterado;
- o arquivo SQL foi inspecionado para impedir comandos de gravacao, alteracao
  de schema ou controle transacional.

## Risco residual

Jornadas podem mudar por sincronizacao posterior. Por isso, professor e
disciplina atuais sao evidencias vivas e nao autorizam promocao automatica.
Antes de qualquer decisao, executar novamente o script e conferir IDs,
reconstrucao, limites, ultima revisao e divergencias.
