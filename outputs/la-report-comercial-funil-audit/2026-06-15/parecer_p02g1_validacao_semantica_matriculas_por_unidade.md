# Parecer P02.G1 - Validacao semantica de matriculas por unidade

Data: 2026-06-15

## Escopo

Auditoria SELECT-only da distribuicao de `matriculas_comerciais_principais` exibida no patch P02.G1 de Sazonalidade.

PR visual em referencia:

- PR #4: `p02g1-sazonalidade-v2`
- Commit: `81e3dab3c250040d4fd792f291d237bf5e7ff718`
- Bloco: `ComercialSazonalidade`

Regras de seguranca observadas:

- Sem SQL de escrita.
- Sem `UPDATE`, `INSERT`, `DELETE`, `ALTER`, `CREATE`, `DROP`.
- Sem migration.
- Sem alteracao de Supabase.
- Sem alteracao no PR #4.
- Sem merge/deploy.

Ambiente confirmado pelo MCP:

`https://ouqwbbermlzqqvtqwlul.supabase.co`

## Pergunta investigada

A RPC v2 retornou para 2025:

| Unidade | Leads entrantes | Matriculas comerciais |
| --- | ---: | ---: |
| Barra | 513 | 58 |
| Campo Grande | 1.100 | 13 |
| Recreio | 520 | 2 |
| Total | 2.133 | 73 |

A pergunta era se a concentracao de 58 matriculas comerciais na Barra e apenas 13 em Campo Grande / 2 no Recreio representa regra correta ou distorcao de campo/mapeamento.

## Como a RPC v2 atribui unidade

Consulta SELECT-only usada para ler a definicao da funcao:

```sql
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_kpis_comercial_canonicos_v2';
```

Trecho relevante encontrado na RPC:

```sql
matriculas_base AS (
  SELECT
    a.unidade_id,
    a.id AS aluno_id,
    coalesce(a.valor_passaporte, 0) AS valor_passaporte,
    (
      coalesce(a.is_segundo_curso, false) = false
      AND coalesce(a.is_ex_aluno, false) = false
      AND coalesce(a.is_aluno_retorno, false) = false
      AND coalesce(a.valor_passaporte, 0) > 0
      AND coalesce(a.tipo_aluno, 'pagante') NOT IN ('bolsista_integral', 'bolsista_parcial', 'nao_pagante')
      AND coalesce(c.is_projeto_banda, false) = false
      AND lower(coalesce(c.nome, '')) NOT LIKE '%banda%'
      AND lower(coalesce(c.nome, '')) NOT LIKE '%projeto%'
      AND lower(coalesce(c.nome, '')) NOT LIKE '%coral%'
      AND coalesce(tm.codigo, '') NOT IN ('SEGUNDO_CURSO', 'BANDA', 'BOLSISTA_INT', 'BOLSISTA_PARC')
      AND coalesce(tm.conta_como_pagante, true) = true
    ) AS is_matricula_comercial_principal
  FROM public.alunos a
  LEFT JOIN public.cursos c ON c.id = a.curso_id
  LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.data_matricula >= p.inicio::date
    AND a.data_matricula < p.fim_exclusivo::date
    AND a.arquivado_em IS NULL
    AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
)
```

Fato confirmado:

- `matriculas_comerciais_principais` usa `alunos.unidade_id`.
- Nao usa unidade do lead.
- Nao usa unidade de turma.
- Nao usa unidade historica de entrada.
- Nao usa uma tabela transacional de matricula separada.

## RPC v2 vs SELECT direto

Consulta SELECT-only usada:

```sql
with rpc_mensal as (
  select
    gs.mes,
    unidade.value->>'unidade_nome' as unidade_nome,
    (unidade.value->>'leads_entrantes')::int as leads_entrantes,
    (unidade.value->>'matriculas_comerciais_principais')::int as matriculas_comerciais_principais
  from generate_series(1, 12) as gs(mes)
  cross join lateral public.get_kpis_comercial_canonicos_v2(null::uuid, 2025, gs.mes, 'mensal', null::date) payload
  cross join lateral jsonb_array_elements(payload->'por_unidade') as unidade(value)
),
direto_matriculas as (
  select
    extract(month from a.data_matricula)::int as mes,
    u.nome as unidade_nome,
    count(*) filter (
      where coalesce(a.is_segundo_curso, false) = false
        and coalesce(a.is_ex_aluno, false) = false
        and coalesce(a.is_aluno_retorno, false) = false
        and coalesce(a.valor_passaporte, 0) > 0
        and coalesce(a.tipo_aluno, 'pagante') not in ('bolsista_integral', 'bolsista_parcial', 'nao_pagante')
        and coalesce(c.is_projeto_banda, false) = false
        and lower(coalesce(c.nome, '')) not like '%banda%'
        and lower(coalesce(c.nome, '')) not like '%projeto%'
        and lower(coalesce(c.nome, '')) not like '%coral%'
        and coalesce(tm.codigo, '') not in ('SEGUNDO_CURSO', 'BANDA', 'BOLSISTA_INT', 'BOLSISTA_PARC')
        and coalesce(tm.conta_como_pagante, true) = true
    )::int as matriculas_diretas
  from public.alunos a
  join public.unidades u on u.id = a.unidade_id
  left join public.cursos c on c.id = a.curso_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  where a.data_matricula >= date '2025-01-01'
    and a.data_matricula < date '2026-01-01'
    and a.arquivado_em is null
    and u.ativo = true
  group by 1, 2
)
select ...
```

Resultado:

- RPC v2 e SELECT direto deram diferenca zero em todos os meses/unidades.
- Logo, nao ha bug aritmetico na RPC para essa regra.
- A duvida e semantica: se `alunos.unidade_id` e a unidade correta para esta metrica.

Resumo mensal de matriculas comerciais pela RPC:

| Mes | Barra | Campo Grande | Recreio | Total |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 8 | 2 | 0 | 10 |
| 2 | 4 | 0 | 0 | 4 |
| 3 | 4 | 2 | 0 | 6 |
| 4 | 3 | 1 | 0 | 4 |
| 5 | 5 | 1 | 0 | 6 |
| 6 | 5 | 0 | 0 | 5 |
| 7 | 5 | 0 | 0 | 5 |
| 8 | 11 | 3 | 2 | 16 |
| 9 | 5 | 2 | 0 | 7 |
| 10 | 3 | 1 | 0 | 4 |
| 11 | 4 | 1 | 0 | 5 |
| 12 | 1 | 0 | 0 | 1 |

## Comparacao de conceitos de unidade

Consulta SELECT-only usada para resolver lead preferencial por aluno:

```sql
with matriculas as (
  select a.id as aluno_id, a.unidade_id as aluno_unidade_id, ua.nome as aluno_unidade_nome, a.lead_origem_id
  from public.alunos a
  join public.unidades ua on ua.id = a.unidade_id
  left join public.cursos c on c.id = a.curso_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  where a.data_matricula >= date '2025-01-01'
    and a.data_matricula < date '2026-01-01'
    and a.arquivado_em is null
    and ua.ativo = true
    and <mesma regra de matricula_comercial_principal>
),
base as (
  select
    m.*,
    lv.id as lead_id_resolvido,
    lv.unidade_id as lead_unidade_id,
    ul.nome as lead_unidade_nome
  from matriculas m
  left join lateral (
    select l.*
    from public.leads l
    where l.id = m.lead_origem_id
       or l.aluno_id = m.aluno_id
    order by (l.id = m.lead_origem_id) desc, l.data_contato nulls last, l.id
    limit 1
  ) lv on true
  left join public.unidades ul on ul.id = lv.unidade_id
)
select ...
```

Resultado por unidade atual do aluno:

| Unidade do aluno | Matriculas v2 | Com lead resolvido | Sem lead resolvido | Lead mesma unidade | Lead unidade diferente |
| --- | ---: | ---: | ---: | ---: | ---: |
| Barra | 58 | 0 | 58 | 0 | 0 |
| Campo Grande | 13 | 1 | 12 | 1 | 0 |
| Recreio | 2 | 0 | 2 | 0 | 0 |

Distribuicao se a unidade viesse do lead resolvido:

| Criterio | Unidade | Qtd |
| --- | --- | ---: |
| lead resolvido | Campo Grande | 1 |
| lead resolvido | SEM_LEAD | 72 |

Fato confirmado:

- 72/73 matriculas comerciais v2 de 2025 nao possuem lead resolvido via `alunos.lead_origem_id` nem via `leads.aluno_id`.
- Portanto, a distribuicao 58/13/2 nao deve ser lida como conversao por unidade do lead.

## Comparacao com historico de entrada

Consulta SELECT-only usada:

```sql
select
  u.nome as unidade_nome,
  count(*)::int as historico_entradas_2025,
  count(*) filter (where coalesce(ah.anulado, false) = false)::int as historico_entradas_nao_anuladas_2025
from public.alunos_historico ah
left join public.unidades u on u.id = ah.unidade_id
where ah.data_entrada >= date '2025-01-01'
  and ah.data_entrada < date '2026-01-01'
group by u.nome;
```

Resultado geral em `alunos_historico`:

| Unidade | Entradas 2025 historico | Nao anuladas |
| --- | ---: | ---: |
| Barra | 2 | 2 |
| Campo Grande | 18 | 18 |
| Recreio | 5 | 5 |

Resultado cruzando os 73 alunos comerciais v2 com `alunos_historico`:

| Unidade do aluno | Comerciais v2 | Com historico 2025 nao anulado | Sem historico |
| --- | ---: | ---: | ---: |
| Barra | 58 | 1 | 57 |
| Campo Grande | 13 | 1 | 12 |
| Recreio | 2 | 1 | 1 |

Fato confirmado:

- `alunos_historico` nao explica os 73.
- A metrica v2 se apoia quase integralmente em `alunos.data_matricula` + `alunos.unidade_id`, nao em um evento historico de entrada.

## Motivos de exclusao por unidade

Consulta SELECT-only usada:

```sql
select
  unidade_nome,
  count(*) as academicas_ativas_2025,
  count(*) filter (where coalesce(valor_passaporte,0) <= 0) as exclui_sem_passaporte,
  count(*) filter (where coalesce(is_segundo_curso,false) = true) as exclui_segundo_curso,
  count(*) filter (where coalesce(tipo_aluno, 'pagante') in ('bolsista_integral', 'bolsista_parcial', 'nao_pagante')) as exclui_tipo_nao_pagante,
  count(*) filter (where coalesce(tipo_matricula_codigo,'') in ('SEGUNDO_CURSO','BANDA','BOLSISTA_INT','BOLSISTA_PARC')) as exclui_codigo_tipo_matricula,
  count(*) filter (where <regra completa>) as passa_regra_comercial
from base
group by unidade_nome;
```

Resultado:

| Unidade | Academicas 2025 | Exclui sem passaporte | Exclui segundo curso | Exclui nao pagante/tipo | Passa regra comercial |
| --- | ---: | ---: | ---: | ---: | ---: |
| Barra | 106 | 48 | 1 | 0 | 58 |
| Campo Grande | 222 | 209 | 0 | 14 | 13 |
| Recreio | 139 | 137 | 1 | 0 | 2 |

Leitura:

- A concentracao da Barra nasce principalmente porque Barra tem muito mais alunos 2025 com `valor_passaporte > 0`.
- Campo Grande e Recreio tem muitas matriculas academicas 2025, mas quase todas ficam fora da regra comercial por `valor_passaporte <= 0`.
- Isso pode ser dado correto, mas tambem pode indicar preenchimento historico desigual de `valor_passaporte`.

## Amostras

Consulta SELECT-only usada:

```sql
with comerciais as (
  select
    u.nome as unidade_nome,
    a.id as aluno_id,
    a.data_matricula,
    a.data_inicio_contrato,
    a.valor_passaporte,
    a.valor_parcela,
    a.status,
    a.tipo_aluno,
    c.nome as curso_nome,
    tm.codigo as tipo_matricula_codigo,
    tm.nome as tipo_matricula_nome,
    a.lead_origem_id,
    a.emusys_student_id,
    a.emusys_matricula_id,
    a.created_at,
    a.updated_at
  from public.alunos a
  ...
),
amostras as (
  select *, row_number() over (partition by unidade_nome order by data_matricula, aluno_id) as rn
  from comerciais
)
select ...
from amostras
where rn <= 8;
```

Amostras selecionadas:

| Unidade | aluno_id | data_matricula | valor_passaporte | status | curso | lead_origem_id | tem emusys_matricula |
| --- | ---: | --- | ---: | --- | --- | --- | --- |
| Barra | 1344 | 2025-01-15 | 460,00 | inativo | Musicalizacao Infantil | null | false |
| Barra | 1347 | 2025-01-18 | 460,00 | inativo | Guitarra | null | false |
| Barra | 829 | 2025-01-23 | 430,00 | ativo | Teclado | null | false |
| Barra | 797 | 2025-01-27 | 420,00 | ativo | Piano | null | false |
| Barra | 826 | 2025-01-28 | 420,00 | inativo | Bateria | null | false |
| Campo Grande | 15 | 2025-01-30 | 380,00 | ativo | Musicalizacao Preparatoria | null | false |
| Campo Grande | 153 | 2025-01-31 | 380,00 | inativo | Musicalizacao Preparatoria | null | false |
| Campo Grande | 267 | 2025-03-17 | 500,00 | ativo | Musicalizacao Preparatoria | null | false |
| Campo Grande | 314 | 2025-04-30 | 400,00 | ativo | Teclado | null | true |
| Recreio | 1072 | 2025-08-09 | 250,00 | ativo | Canto | null | false |
| Recreio | 1075 | 2025-08-30 | 200,00 | evadido | Canto | null | true |

Observacoes das amostras:

- `lead_origem_id` esta vazio nas amostras.
- Ha alunos ativos e inativos incluidos. A regra atual nao filtra `status = 'ativo'`.
- Muitos registros de 2025 foram criados no Supabase em 2026, indicando carga/importacao retroativa.

## Sinais de historico/importacao

Consulta SELECT-only usada:

```sql
select
  unidade_nome,
  count(*) as qtd,
  min(data_matricula) as primeira_data_matricula,
  max(data_matricula) as ultima_data_matricula,
  min(created_at)::date as primeiro_created_at,
  max(created_at)::date as ultimo_created_at,
  count(*) filter (where created_at::date >= date '2026-01-01') as criadas_no_supabase_em_2026,
  count(*) filter (where status = 'ativo') as status_ativo,
  count(*) filter (where status <> 'ativo') as status_nao_ativo,
  sum(valor_passaporte) as passaporte_total
from comerciais
group by unidade_nome;
```

Resultado:

| Unidade | Qtd | Datas matricula | Created_at no Supabase | Criadas em 2026 | Ativas | Nao ativas | Passaporte total |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| Barra | 58 | 2025-01-15 a 2025-12-19 | 2026-01-09 a 2026-02-18 | 58 | 34 | 24 | 26.739,00 |
| Campo Grande | 13 | 2025-01-30 a 2025-11-19 | 2026-01-09 | 13 | 11 | 2 | 5.354,00 |
| Recreio | 2 | 2025-08-09 a 2025-08-30 | 2026-02-14 | 2 | 1 | 1 | 450,00 |

## Hipotese mais provavel

Classificacao: **pendente de validacao Alf/Hugo, com risco semantico alto para merge do PR #4**.

Hipotese mais provavel:

1. A RPC v2 esta matematicamente consistente com a formula implementada.
2. A distribuicao 58/13/2 vem da combinacao:
   - `alunos.data_matricula` em 2025;
   - `alunos.unidade_id`;
   - filtro `valor_passaporte > 0`;
   - exclusoes de segundo curso, retorno, bolsista/nao pagante, banda/projeto/coral.
3. O dado de `valor_passaporte` parece preenchido de forma muito desigual por unidade no historico 2025:
   - Barra: 58/106 academicas passam por passaporte.
   - Campo Grande: 13/222 passam por passaporte.
   - Recreio: 2/139 passam por passaporte.
4. Quase nenhuma dessas 73 matriculas tem vinculo comercial real com lead:
   - 72/73 sem lead resolvido.
   - 70/73 sem historico de entrada relacionado.
5. Portanto, esta metrica nao deve ser interpretada como conversao do funil por unidade do lead.

## Riscos

- Risco de o grafico de sazonalidade publicar uma distribuicao que parece performance comercial por unidade, mas na pratica e unidade atual do aluno + passaporte preenchido.
- Risco de distorcao historica por importacao/backfill, ja que os registros de matricula 2025 foram criados no Supabase em 2026.
- Risco de Campo Grande/Recreio parecerem artificialmente baixos por falta de `valor_passaporte`, nao por baixa performance comercial real.
- Risco de Barra parecer artificialmente alta se `valor_passaporte` estiver mais completo nessa unidade.

## Recomendacao

Manter o PR #4 em draft e bloquear merge ate decisao semantica.

O P02.G1 esta correto como patch visual e como leitura fiel do payload v2, mas nao esta liberado semanticamente para producao enquanto Alf/Hugo nao validarem uma destas opcoes:

1. Aceitar `matriculas_comerciais_principais` como "alunos novos pagantes por unidade atual do aluno", mesmo sem lead/historico.
2. Trocar o label/explicacao visual para deixar claro que nao e conversao do funil.
3. Ajustar a RPC v2 em fase futura para separar:
   - `matriculas_comerciais_por_unidade_aluno`;
   - `conversoes_de_lead_por_unidade_lead`;
   - `matriculas_comerciais_com_passaporte_por_unidade_aluno`;
   - `matriculas_sem_lead_vinculado`;
   - `matriculas_sem_historico_entrada`.

Veredito:

- **RPC v2 vs SELECT direto:** validado, diferenca zero.
- **Regra de unidade:** inferida como `alunos.unidade_id`.
- **Distribuicao Barra 58 / CG 13 / Recreio 2:** nao e bug visual; e efeito do payload/regra v2.
- **Confianca semantica para dashboard/relatorio:** insuficiente.
- **PR #4:** deve seguir em draft ate validacao semantica.
