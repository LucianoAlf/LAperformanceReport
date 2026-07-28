-- Health Score do Professor V3
-- Comparacao governada de julho/2026 nas tres unidades.
-- SELECT-only. Nao altera snapshots, configuracoes ou consumidores.

-- Configuracao homologada para o ciclo Jun-Ago:
-- V4 = 4f34ac12-8a6a-4adc-9910-c60aebe2be89

-- 1. Resumo por unidade e motivos de sem base.
with latest as (
  select distinct on (s.professor_id, s.unidade_id)
    s.*,
    u.nome as unidade
  from public.health_score_professor_v3_snapshots s
  join public.unidades u
    on u.id = s.unidade_id
  where s.competencia = date '2026-07-01'
    and s.periodicidade = 'mensal'
    and s.config_id =
      '4f34ac12-8a6a-4adc-9910-c60aebe2be89'::uuid
    and s.unidade_id is not null
  order by
    s.professor_id,
    s.unidade_id,
    s.revisao desc,
    s.criado_em desc,
    s.id desc
), flags as (
  select
    l.*,
    exists (
      select 1
      from public.health_score_professor_v3_snapshot_metricas m
      where m.snapshot_id = l.id
        and m.metrica in ('retencao', 'permanencia')
        and m.nota is not null
    ) as tem_fidelizacao
  from latest l
)
select
  unidade,
  count(*)::integer as professores_avaliados,
  count(*) filter (where score is not null)::integer
    as professores_parcial,
  count(*) filter (where score is null)::integer
    as professores_sem_base,
  round(avg(cobertura), 2) as cobertura_media,
  count(*) filter (
    where score is null
      and cobertura < 60
      and not tem_fidelizacao
  )::integer as sem_base_cobertura_e_fidelizacao,
  count(*) filter (
    where score is null
      and cobertura < 60
      and tem_fidelizacao
  )::integer as sem_base_so_cobertura,
  count(*) filter (
    where score is null
      and cobertura >= 60
      and not tem_fidelizacao
  )::integer as sem_base_so_fidelizacao,
  round(avg(score) filter (where score is not null), 2) as score_medio,
  round(min(score) filter (where score is not null), 2) as score_minimo,
  round(
    percentile_cont(0.5) within group (order by score)
      filter (where score is not null)::numeric,
    2
  ) as score_mediana,
  round(max(score) filter (where score is not null), 2) as score_maximo,
  count(*) filter (where snapshot_anterior_id is not null)::integer
    as revisoes_encadeadas
from flags
group by unidade
order by unidade;

-- 2. Distribuicao de score.
with latest as (
  select distinct on (s.professor_id, s.unidade_id)
    s.*,
    u.nome as unidade
  from public.health_score_professor_v3_snapshots s
  join public.unidades u
    on u.id = s.unidade_id
  where s.competencia = date '2026-07-01'
    and s.periodicidade = 'mensal'
    and s.config_id =
      '4f34ac12-8a6a-4adc-9910-c60aebe2be89'::uuid
    and s.unidade_id is not null
  order by
    s.professor_id,
    s.unidade_id,
    s.revisao desc,
    s.criado_em desc,
    s.id desc
)
select
  unidade,
  count(*) filter (where score >= 90)::integer as score_90_100,
  count(*) filter (where score >= 80 and score < 90)::integer
    as score_80_89,
  count(*) filter (where score >= 70 and score < 80)::integer
    as score_70_79,
  count(*) filter (where score >= 60 and score < 70)::integer
    as score_60_69,
  count(*) filter (where score < 60)::integer as score_abaixo_60,
  count(*) filter (where score is null)::integer as sem_base
from latest
group by unidade
order by unidade;

-- 3. Disponibilidade e contribuicao dos seis pilares.
with latest as (
  select distinct on (s.professor_id, s.unidade_id)
    s.id,
    u.nome as unidade
  from public.health_score_professor_v3_snapshots s
  join public.unidades u
    on u.id = s.unidade_id
  where s.competencia = date '2026-07-01'
    and s.periodicidade = 'mensal'
    and s.config_id =
      '4f34ac12-8a6a-4adc-9910-c60aebe2be89'::uuid
    and s.unidade_id is not null
  order by
    s.professor_id,
    s.unidade_id,
    s.revisao desc,
    s.criado_em desc,
    s.id desc
), base as (
  select l.unidade, m.*
  from latest l
  join public.health_score_professor_v3_snapshot_metricas m
    on m.snapshot_id = l.id
), estados as (
  select
    unidade,
    metrica,
    jsonb_object_agg(estado_base, quantidade order by estado_base) as estados
  from (
    select
      unidade,
      metrica,
      estado_base,
      count(*)::integer as quantidade
    from base
    group by unidade, metrica, estado_base
  ) x
  group by unidade, metrica
)
select
  b.unidade,
  b.metrica,
  count(*)::integer as total,
  count(*) filter (where b.nota is not null)::integer as disponiveis,
  round(avg(b.valor_bruto), 2) as valor_medio_observado,
  round(
    avg(b.nota) filter (where b.nota is not null),
    2
  ) as nota_media_disponivel,
  round(
    avg(b.contribuicao) filter (where b.contribuicao is not null),
    2
  ) as contribuicao_media_disponivel,
  count(*) filter (
    where b.estado_base = 'ok_com_pendencias'
  )::integer as ok_com_pendencias,
  sum(
    coalesce((b.detalhes ->> 'vinculos_em_revisao')::integer, 0)
  )::integer as vinculos_pendentes,
  e.estados
from base b
join estados e
  on e.unidade = b.unidade
 and e.metrica = b.metrica
group by b.unidade, b.metrica, e.estados
order by b.unidade, b.metrica;

-- 4. Antes V2 x depois V4 para os quatro professores-piloto da Barra.
with alvo as (
  select id, nome
  from public.professores
  where nome in (
    'Isaque Mendes da Silva',
    'Erick Cosme da Silva',
    'Peterson Biancamano',
    'Gabriel Antony Alves de Araújo'
  )
), configs as (
  select *
  from (
    values
      (
        'antes_v2'::text,
        '9af37ebb-761f-4234-bb74-9136d8399e3f'::uuid
      ),
      (
        'depois_v4'::text,
        '4f34ac12-8a6a-4adc-9910-c60aebe2be89'::uuid
      )
  ) x(rotulo, config_id)
), latest as (
  select distinct on (s.professor_id, s.config_id)
    s.*
  from public.health_score_professor_v3_snapshots s
  join alvo a
    on a.id = s.professor_id
  join public.unidades u
    on u.id = s.unidade_id
   and u.nome = 'Barra'
  join configs c
    on c.config_id = s.config_id
  where s.competencia = date '2026-07-01'
    and s.periodicidade = 'mensal'
  order by
    s.professor_id,
    s.config_id,
    s.revisao desc,
    s.criado_em desc,
    s.id desc
)
select
  a.nome,
  c.rotulo,
  l.config_versao,
  l.score,
  l.cobertura,
  l.estado_publicacao,
  m.metrica,
  m.valor_bruto,
  m.nota,
  m.peso,
  m.peso_disponivel,
  m.estado_base,
  m.amostra,
  coalesce(
    (m.detalhes ->> 'vinculos_em_revisao')::integer,
    0
  ) as vinculos_em_revisao
from latest l
join alvo a
  on a.id = l.professor_id
join configs c
  on c.config_id = l.config_id
join public.health_score_professor_v3_snapshot_metricas m
  on m.snapshot_id = l.id
order by a.nome, c.rotulo, m.metrica;

-- 5. Inventario bloqueante e classificacao da Aula Experimental.
select
  public.fn_health_score_professor_v3_segmentos_faltantes_v1(
    '4f34ac12-8a6a-4adc-9910-c60aebe2be89'::uuid
  ) as segmentos_pontuaveis_sem_meta,
  (
    select count(*)
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    where m.config_id =
      '4f34ac12-8a6a-4adc-9910-c60aebe2be89'::uuid
      and m.curso_id = 45
  ) as metas_aula_experimental_v4,
  (
    select natureza_operacional
    from public.cursos
    where id = 45
  ) as natureza_aula_experimental;

-- 6. Atribuicoes diagnosticas sem meta. Nenhuma delas e pontuavel, mas hoje
-- ainda torna o pilar segmentado inteiro indisponivel para o professor.
with d as materialized (
  select *
  from public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date '2026-07-01',
    '4f34ac12-8a6a-4adc-9910-c60aebe2be89'::uuid,
    null,
    'mensal'
  )
)
select distinct
  u.nome as unidade,
  d.professor_nome,
  d.curso_id,
  d.curso_nome,
  d.modalidade,
  d.atribuicao_pontuavel,
  d.estado_base
from d
join public.unidades u
  on u.id = d.unidade_id
where not d.linha_diagnostico
  and d.metrica = 'numero_alunos'
  and d.atribuicao_formal
  and d.config_meta_segmento_id is null
order by u.nome, d.professor_nome, d.curso_nome, d.modalidade;

