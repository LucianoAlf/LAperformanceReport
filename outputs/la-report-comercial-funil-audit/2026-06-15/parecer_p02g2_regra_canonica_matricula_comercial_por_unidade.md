# Parecer P02.G2 - Regra canonica de matricula comercial por unidade

Data: 2026-06-15

## Escopo

Auditoria SELECT-only para comparar definicoes candidatas de "matricula comercial por unidade" em 2025.

Motivo:

- O P02.G1 mostrou que o visual de Sazonalidade esta fiel ao payload v2.
- A RPC v2 bate com SELECT direto.
- A divergencia e semantica: `Barra 58 / Campo Grande 13 / Recreio 2` nasce da regra atual, mas nao necessariamente representa performance comercial por unidade.

Regras cumpridas:

- Sem SQL de escrita.
- Sem `UPDATE`, `INSERT`, `DELETE`, `ALTER`, `CREATE`, `DROP`.
- Sem migration.
- Sem alteracao de Supabase.
- Sem alteracao no PR #4.
- Sem UI.
- Sem merge/deploy.

Ambiente confirmado:

`https://ouqwbbermlzqqvtqwlul.supabase.co`

## Tabelas e campos consultados

Tabelas com potencial de unidade:

| Tabela | Campos relevantes | Leitura |
| --- | --- | --- |
| `alunos` | `id`, `unidade_id`, `data_matricula`, `valor_passaporte`, `lead_origem_id`, `curso_id`, `tipo_matricula_id`, `status` | Fonte atual da RPC v2 para matricula comercial |
| `leads` | `id`, `unidade_id`, `aluno_id`, `data_contato`, `status`, `converteu` | Origem comercial, mas quase nao vincula os 73 casos |
| `lead_experimentais` | `lead_id`, `aluno_id`, `unidade_id`, `data_experimental` | Candidato comercial/experimental, cobertura zero nos 73 |
| `alunos_historico` | `aluno_id`, `unidade_id`, `data_entrada`, `anulado` | Historico de entrada, cobertura baixa |
| `alunos_turmas` | `aluno_id`, `turma_id`, `data_entrada` | Vinculo operacional de turma, cobertura zero nos 73 |
| `turmas_alunos` | `aluno_id`, `turma_id`, `created_at` | Vinculo operacional de turma, cobertura zero nos 73 |
| `turmas` | `id`, `unidade_id`, `curso_id` | Unidade da turma, depende de vinculo aluno-turma |
| `aluno_presenca` | `aluno_id`, `unidade_id`, `data_aula`, `status` | Primeira presenca pos-matricula, cobertura parcial |
| `cursos` | `id`, `nome`, `is_projeto_banda` | Filtro de banda/projeto/coral |
| `tipos_matricula` | `codigo`, `conta_como_pagante` | Filtro de pagante/bolsista/segundo curso |

## Coorte de matricula comercial atual

Todos os cenarios abaixo usam a mesma coorte atual da RPC v2:

```sql
with comerciais as (
  select
    a.id as aluno_id,
    a.data_matricula,
    a.unidade_id as aluno_unidade_id,
    ua.nome as aluno_unidade_nome,
    a.lead_origem_id,
    a.valor_passaporte,
    a.status as aluno_status,
    c.nome as curso_nome,
    tm.codigo as tipo_matricula_codigo
  from public.alunos a
  join public.unidades ua on ua.id = a.unidade_id
  left join public.cursos c on c.id = a.curso_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  where a.data_matricula >= date '2025-01-01'
    and a.data_matricula < date '2026-01-01'
    and a.arquivado_em is null
    and ua.ativo = true
    and coalesce(a.is_segundo_curso, false) = false
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
)
```

Resultado da coorte:

- Total: 73 matriculas comerciais v2.
- Todas passam basicamente por `valor_passaporte > 0`; nos dados de 2025, nao apareceu aluno com passaporte positivo excluido por outro filtro.

## Definicao A - Unidade atual do aluno

Regra:

`unidade = alunos.unidade_id`

SQL SELECT-only usado:

```sql
select
  aluno_unidade_nome as unidade_nome,
  count(*)::int as matriculas
from comerciais
group by aluno_unidade_nome
order by aluno_unidade_nome;
```

Resultado anual:

| Unidade | Matriculas comerciais 2025 |
| --- | ---: |
| Barra | 58 |
| Campo Grande | 13 |
| Recreio | 2 |
| Total | 73 |

Resultado mensal:

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

Cobertura:

- 73/73 com unidade.
- Tecnicalmente possivel hoje.

Risco semantico:

- Mede unidade atual/cadastral do aluno.
- Nao prova unidade comercial de origem.
- Nao prova unidade da experimental.
- Nao prova unidade da matricula operacional.
- Inclui ativos e inativos, porque a regra atual nao filtra `status = 'ativo'`.

## Definicao B - Unidade operacional da matricula/curso/turma

Foram testadas tres alternativas.

### B1 - Unidade por `alunos_turmas -> turmas`

Regra testada:

```sql
select
  coalesce(at_unidade.nome, 'SEM_TURMA') as unidade_nome,
  count(distinct c.aluno_id)::int as matriculas
from comerciais c
left join lateral (
  select at.*, t.unidade_id
  from public.alunos_turmas at
  join public.turmas t on t.id = at.turma_id
  where at.aluno_id = c.aluno_id
  order by (at.data_entrada >= c.data_matricula) desc, at.data_entrada nulls last, at.id
  limit 1
) at_pref on true
left join public.unidades at_unidade on at_unidade.id = at_pref.unidade_id
group by coalesce(at_unidade.nome, 'SEM_TURMA');
```

Resultado:

| Unidade | Matriculas |
| --- | ---: |
| SEM_TURMA | 73 |

Leitura:

- Nao e tecnicamente utilizavel para 2025 nessa coorte.

### B2 - Unidade por `turmas_alunos -> turmas`

Regra testada:

```sql
select
  coalesce(ta_unidade.nome, 'SEM_TURMA') as unidade_nome,
  count(distinct c.aluno_id)::int as matriculas
from comerciais c
left join lateral (
  select ta.*, t.unidade_id
  from public.turmas_alunos ta
  join public.turmas t on t.id = ta.turma_id
  where ta.aluno_id = c.aluno_id
  order by ta.created_at nulls last, ta.id
  limit 1
) ta_pref on true
left join public.unidades ta_unidade on ta_unidade.id = ta_pref.unidade_id
group by coalesce(ta_unidade.nome, 'SEM_TURMA');
```

Resultado:

| Unidade | Matriculas |
| --- | ---: |
| SEM_TURMA | 73 |

Leitura:

- Tambem nao e utilizavel para 2025 nessa coorte.

### B3 - Unidade por primeira presenca pos-matricula

Regra testada:

```sql
select
  coalesce(pres_unidade.nome, 'SEM_PRESENCA') as unidade_nome,
  count(distinct c.aluno_id)::int as matriculas
from comerciais c
left join lateral (
  select ap.*
  from public.aluno_presenca ap
  where ap.aluno_id = c.aluno_id
    and ap.data_aula >= c.data_matricula
    and coalesce(ap.status, '') = 'presente'
  order by ap.data_aula, ap.horario_aula nulls last, ap.id
  limit 1
) pres_pref on true
left join public.unidades pres_unidade on pres_unidade.id = pres_pref.unidade_id
group by coalesce(pres_unidade.nome, 'SEM_PRESENCA');
```

Resultado anual:

| Unidade | Matriculas |
| --- | ---: |
| Barra | 38 |
| Campo Grande | 12 |
| Recreio | 2 |
| SEM_PRESENCA | 21 |
| Total | 73 |

Resultado mensal:

| Mes | Barra | Campo Grande | Recreio | SEM_PRESENCA | Total |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 3 | 1 | 0 | 6 | 10 |
| 2 | 4 | 0 | 0 | 0 | 4 |
| 3 | 2 | 2 | 0 | 2 | 6 |
| 4 | 2 | 1 | 0 | 1 | 4 |
| 5 | 2 | 1 | 0 | 3 | 6 |
| 6 | 3 | 0 | 0 | 2 | 5 |
| 7 | 1 | 0 | 0 | 4 | 5 |
| 8 | 10 | 3 | 2 | 1 | 16 |
| 9 | 5 | 2 | 0 | 0 | 7 |
| 10 | 2 | 1 | 0 | 1 | 4 |
| 11 | 3 | 1 | 0 | 1 | 5 |
| 12 | 1 | 0 | 0 | 0 | 1 |

Leitura:

- Tem cobertura parcial: 52/73.
- Nao e unidade de matricula comercial; e unidade da primeira presenca registrada depois da data de matricula.
- Muitas primeiras presencas aparecem em 2026 para matriculas com `data_matricula` em 2025.
- Boa fonte diagnostica operacional, mas nao deve virar regra canonica comercial sem aprovacao.

## Definicao C - Unidade comercial/origem

Foram testadas tres alternativas.

### C1 - Unidade do lead resolvido

Regra testada:

```sql
select
  coalesce(lead_unidade.nome, 'SEM_LEAD') as unidade_nome,
  count(distinct c.aluno_id)::int as matriculas
from comerciais c
left join lateral (
  select l.*
  from public.leads l
  where l.id = c.lead_origem_id
     or l.aluno_id = c.aluno_id
  order by (l.id = c.lead_origem_id) desc, l.data_contato nulls last, l.id
  limit 1
) lead_pref on true
left join public.unidades lead_unidade on lead_unidade.id = lead_pref.unidade_id
group by coalesce(lead_unidade.nome, 'SEM_LEAD');
```

Resultado anual:

| Unidade | Matriculas |
| --- | ---: |
| Campo Grande | 1 |
| SEM_LEAD | 72 |
| Total | 73 |

Resultado mensal:

| Mes | Campo Grande | SEM_LEAD | Total |
| ---: | ---: | ---: | ---: |
| 1 | 1 | 9 | 10 |
| 2 | 0 | 4 | 4 |
| 3 | 0 | 6 | 6 |
| 4 | 0 | 4 | 4 |
| 5 | 0 | 6 | 6 |
| 6 | 0 | 5 | 5 |
| 7 | 0 | 5 | 5 |
| 8 | 0 | 16 | 16 |
| 9 | 0 | 7 | 7 |
| 10 | 0 | 4 | 4 |
| 11 | 0 | 5 | 5 |
| 12 | 0 | 1 | 1 |

Leitura:

- Semanticamente e a melhor candidata para performance comercial por unidade de origem.
- Tecnicamente nao e utilizavel hoje para 2025, porque 72/73 nao resolvem lead.

### C2 - Unidade da experimental resolvida

Regra testada:

```sql
select
  coalesce(exp_unidade.nome, 'SEM_EXPERIMENTAL') as unidade_nome,
  count(distinct c.aluno_id)::int as matriculas
from comerciais c
left join lateral (
  select le.*
  from public.lead_experimentais le
  where le.aluno_id = c.aluno_id
     or le.lead_id in (
       select l.id
       from public.leads l
       where l.id = c.lead_origem_id
          or l.aluno_id = c.aluno_id
     )
  order by (le.aluno_id = c.aluno_id) desc, le.data_experimental nulls last, le.id
  limit 1
) exp_pref on true
left join public.unidades exp_unidade on exp_unidade.id = exp_pref.unidade_id
group by coalesce(exp_unidade.nome, 'SEM_EXPERIMENTAL');
```

Resultado:

| Unidade | Matriculas |
| --- | ---: |
| SEM_EXPERIMENTAL | 73 |

Leitura:

- Nao e tecnicamente utilizavel para 2025 nessa coorte.

### C3 - Unidade de `alunos_historico`

Regra testada:

```sql
select
  coalesce(hist_unidade.nome, 'SEM_HISTORICO') as unidade_nome,
  count(distinct c.aluno_id)::int as matriculas
from comerciais c
left join lateral (
  select ah.*
  from public.alunos_historico ah
  where ah.aluno_id = c.aluno_id
    and coalesce(ah.anulado, false) = false
  order by (ah.data_entrada >= c.data_matricula) desc, ah.data_entrada nulls last, ah.id
  limit 1
) hist_pref on true
left join public.unidades hist_unidade on hist_unidade.id = hist_pref.unidade_id
group by coalesce(hist_unidade.nome, 'SEM_HISTORICO');
```

Resultado anual:

| Unidade | Matriculas |
| --- | ---: |
| Barra | 1 |
| Campo Grande | 1 |
| Recreio | 1 |
| SEM_HISTORICO | 70 |
| Total | 73 |

Leitura:

- Melhor que turma para historico, mas ainda insuficiente.
- 70/73 sem historico relacionado.

## Cobertura comparada

Consulta SELECT-only usada:

```sql
select
  count(*)::int as total_comerciais_v2,
  count(*) filter (where tem_lead)::int as com_lead,
  count(*) filter (where tem_experimental)::int as com_experimental,
  count(*) filter (where tem_historico)::int as com_historico,
  count(*) filter (where tem_alunos_turmas)::int as com_alunos_turmas,
  count(*) filter (where tem_turmas_alunos)::int as com_turmas_alunos,
  count(*) filter (where tem_presenca_pos_matricula)::int as com_presenca_pos_matricula,
  count(*) filter (where not tem_lead)::int as sem_lead,
  count(*) filter (where not tem_historico)::int as sem_historico
from coverage;
```

Resultado:

| Campo | Qtd |
| --- | ---: |
| Total comerciais v2 | 73 |
| Com lead | 1 |
| Com experimental | 0 |
| Com historico | 3 |
| Com alunos_turmas | 0 |
| Com turmas_alunos | 0 |
| Com presenca pos-matricula | 52 |
| Sem lead | 72 |
| Sem historico | 70 |

## Valor passaporte e filtros

Consulta SELECT-only usada sobre todas as matriculas academicas 2025:

```sql
select
  unidade_nome,
  count(*)::int as matriculas_academicas_2025,
  count(*) filter (where coalesce(valor_passaporte,0) > 0)::int as com_valor_passaporte_maior_zero,
  count(*) filter (where coalesce(valor_passaporte,0) <= 0)::int as sem_valor_passaporte,
  count(*) filter (where lead_id is not null)::int as com_lead_resolvido,
  count(*) filter (where historico_id is not null)::int as com_historico_resolvido,
  count(*) filter (where passa_regra_comercial_atual)::int as passa_regra_comercial_atual,
  count(*) filter (where coalesce(valor_passaporte,0) > 0 and not passa_regra_comercial_atual)::int as com_passaporte_mas_excluida_por_outro_filtro
from resolvidas
group by unidade_nome;
```

Resultado:

| Unidade | Academicas 2025 | Passaporte > 0 | Sem passaporte | Com lead | Com historico | Passa regra atual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Barra | 106 | 58 | 48 | 4 | 2 | 58 |
| Campo Grande | 222 | 13 | 209 | 22 | 21 | 13 |
| Recreio | 139 | 2 | 137 | 9 | 5 | 2 |

Leitura:

- A regra atual em 2025 e praticamente equivalente a `valor_passaporte > 0`.
- O preenchimento de passaporte e muito desigual entre unidades.
- Campo Grande tem muito mais matriculas academicas e mais lead/historico resolvido que Barra, mas entra pouco na regra comercial porque quase todas tem `valor_passaporte <= 0`.

## Amostras

Consulta SELECT-only usada:

```sql
select
  unidade_aluno_atual,
  aluno_id,
  data_matricula,
  valor_passaporte,
  aluno_status,
  curso_nome,
  lead_id,
  lead_unidade_nome,
  experimental_id,
  experimental_unidade_nome,
  historico_id,
  historico_unidade_nome,
  alunos_turmas_unidade_nome,
  primeira_presenca_unidade_nome,
  primeira_presenca_data
from amostras
where rn <= 6
order by unidade_aluno_atual, data_matricula, aluno_id;
```

Exemplos:

| Unidade atual | aluno_id | data_matricula | passaporte | status | lead | experimental | historico | primeira presenca |
| --- | ---: | --- | ---: | --- | --- | --- | --- | --- |
| Barra | 1344 | 2025-01-15 | 460,00 | inativo | null | null | null | null |
| Barra | 1347 | 2025-01-18 | 460,00 | inativo | null | null | null | null |
| Barra | 829 | 2025-01-23 | 430,00 | ativo | null | null | null | Barra em 2026-03-03 |
| Campo Grande | 15 | 2025-01-30 | 380,00 | ativo | 4050 / Campo Grande | null | null | Campo Grande em 2026-02-27 |
| Campo Grande | 267 | 2025-03-17 | 500,00 | ativo | null | null | null | Campo Grande em 2026-03-03 |
| Recreio | 1072 | 2025-08-09 | 250,00 | ativo | null | null | null | Recreio em 2026-03-03 |
| Recreio | 1075 | 2025-08-30 | 200,00 | evadido | null | null | Recreio | Recreio em 2026-02-26 |

## Comparativo das tres definicoes

| Definicao | Resultado | Cobertura | Tecnicamente possivel hoje | Semantica para comercial por unidade |
| --- | --- | ---: | --- | --- |
| A - `alunos.unidade_id` | Barra 58 / CG 13 / Recreio 2 | 73/73 | Sim | Fraca para comercial; boa para unidade cadastral/academica atual |
| B - turma (`alunos_turmas` ou `turmas_alunos`) | 73 sem turma | 0/73 | Nao | Nao utilizavel hoje |
| B - primeira presenca pos-matricula | Barra 38 / CG 12 / Recreio 2 / Sem 21 | 52/73 | Parcial | Operacional, nao comercial; varias presencas em 2026 |
| C - lead resolvido | CG 1 / Sem lead 72 | 1/73 | Nao para 2025 | Melhor semantica comercial, cobertura pessima |
| C - experimental resolvida | 73 sem experimental | 0/73 | Nao | Nao utilizavel hoje |
| C - historico entrada | Barra 1 / CG 1 / Recreio 1 / Sem 70 | 3/73 | Nao para 2025 | Melhor que turma, mas cobertura insuficiente |

## Recomendacao de regra canonica

Recomendacao tecnica:

Nao canonizar `matriculas_comerciais_principais por unidade` como performance comercial usando apenas `alunos.unidade_id + valor_passaporte > 0`.

Regra canonica recomendada para o futuro:

1. A metrica principal deve continuar separando conceitos:
   - `matriculas_academicas`: por `alunos.data_matricula`, unidade academica/cadastral.
   - `matriculas_comerciais_novas_pagantes`: por evento comercial de matricula, com passaporte/entrada, sem segundo curso, sem banda/projeto, sem bolsista.
   - `conversoes_de_lead`: somente com vinculo real lead -> aluno.
2. Para unidade comercial canonica, usar prioridade explicita:
   - unidade do lead convertido, quando houver vinculo real;
   - unidade da experimental convertida, quando houver vinculo real e regra Alf/Hugo aprovada;
   - unidade de evento de matricula/entrada canonico, se for criado ou preenchido por sync;
   - `alunos.unidade_id` apenas como fallback diagnostico, com campo/label explicito.
3. Enquanto o evento canonico nao existir, expor campos separados:
   - `matriculas_comerciais_por_unidade_aluno`;
   - `matriculas_comerciais_com_unidade_comercial_resolvida`;
   - `matriculas_comerciais_sem_unidade_comercial`;
   - `criterio_unidade_matricula`.

Regra operacional provisoria possivel hoje:

- Manter `alunos.unidade_id` apenas como **diagnostico de unidade atual do aluno**.
- Nao chamar isso de performance comercial por unidade sem legenda.

## Impacto na RPC v2

Impacto recomendado para uma futura P02.G3/P02.H:

- Nao alterar agora.
- Criar/ajustar contrato v2 para separar unidade academica/cadastral e unidade comercial resolvida.
- Adicionar diagnosticos de cobertura:
  - `matriculas_comerciais_sem_lead_vinculado`;
  - `matriculas_comerciais_sem_historico_entrada`;
  - `matriculas_comerciais_sem_unidade_comercial_resolvida`;
  - `matriculas_comerciais_por_criterio_unidade`.
- Manter o total 73 como metrica de aluno/passaporte se Alf validar, mas nao usar sua distribuicao por unidade como performance comercial ate resolver origem/unidade canonica.

## Impacto no PR #4

Recomendacao:

- PR #4 deve continuar em draft.
- Nao mergear agora.
- Nao fechar ainda: o patch visual esta correto tecnicamente e pode ser reaproveitado.
- Antes de merge, escolher uma das opcoes:
  1. Ajustar copy/labels para deixar claro que `Matriculas Comerciais` por unidade e "por unidade atual do aluno";
  2. Remover/ocultar a metrica de `Matriculas Comerciais` da Sazonalidade ate regra canonica;
  3. Esperar ajuste futuro na RPC v2 com unidade comercial resolvida.

Minha recomendacao para produto:

- Manter o PR #4 em draft ate Alf/Hugo definirem a regra.
- Se houver pressa para publicar visual, publicar apenas `Leads Entrantes` em Sazonalidade e segurar `Matriculas Comerciais` por unidade.

## Perguntas objetivas para Alf/Hugo

1. Para "matricula comercial por unidade", a unidade correta e:
   - unidade atual do aluno;
   - unidade do lead;
   - unidade da experimental;
   - unidade da primeira aula/presenca;
   - unidade do contrato/matricula no Emusys;
   - ou outra?
2. `valor_passaporte > 0` esta confiavel em 2025 para todas as unidades?
3. Por que Campo Grande tem 222 matriculas academicas 2025, mas 209 sem passaporte?
4. Por que Recreio tem 139 matriculas academicas 2025, mas 137 sem passaporte?
5. Aluno inativo/evadido em 2026 deve contar como nova matricula comercial de 2025?
6. Matricula comercial sem lead vinculado deve entrar no mesmo KPI ou em KPI separado?
7. Lead convertido sem aluno e aluno sem lead devem ser reconciliados antes de publicar taxa/unidade?
8. A unidade da primeira presenca em 2026 pode ser usada para inferir unidade de matricula de 2025?
9. Existe no Emusys um identificador de contrato/matricula com unidade que deve virar fonte canonica?
10. O dashboard deve exibir a distribuicao 58/13/2 como diagnostico, ou deve segurar ate backfill/correcao?

## Veredito

- Definicao A (`alunos.unidade_id`) e a unica com cobertura total hoje, mas nao e semanticamente suficiente para performance comercial por unidade.
- Definicao B por turma nao tem cobertura; por presenca e parcial e operacional.
- Definicao C por lead/experimental/historico e semanticamente melhor para comercial, mas nao tem cobertura historica suficiente.
- A regra canonica ainda depende de decisao Alf/Hugo e/ou novo campo/evento canonico.
- PR #4 deve permanecer em draft.
