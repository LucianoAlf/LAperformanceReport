-- Task 1 baseline for the governed retention and Jun-Aug configuration work.
-- SELECT-only: this script must not change remote state.

select
  id,
  versao,
  status,
  vigencia_inicio,
  vigencia_fim,
  criado_por,
  ativado_por,
  justificativa
from public.health_score_professor_v3_config_versoes
order by versao;

select
  config_id,
  count(*) as metas_segmentadas
from public.health_score_professor_v3_config_metas_curso_modalidade
group by config_id
order by config_id;

select
  competencia,
  estado,
  config_id,
  count(*) as snapshots
from public.health_score_professor_v3_snapshots
where competencia between date '2026-06-01' and date '2026-08-01'
group by competencia, estado, config_id
order by competencia, estado, config_id;

select
  u.nome as unidade,
  count(*) filter (where pe.publicavel is true) as periodos_limpos,
  count(*) filter (where pe.publicavel is false) as periodos_em_revisao,
  count(*) filter (
    where pe.publicavel is true
      and pe.status_periodo = 'encerrado'
  ) as encerramentos_limpos
from public.vw_professor_periodos_efetivos_v3_sombra pe
join public.unidades u on u.id = pe.unidade_id
group by u.nome
order by u.nome;

-- Task 3: o universo exato deve continuar em 207, distribuido em 75/71/61,
-- sem conflito e sem inicio incompleto.
with jornadas_ativas_agrupadas as (
  select
    j.unidade_id,
    j.emusys_matricula_disciplina_id,
    count(*)::integer as cardinalidade_jornada_ativa,
    min(j.professor_id) as professor_id,
    min(j.emusys_disciplina_id) as emusys_disciplina_id
  from public.aluno_jornada_matricula_disciplina j
  where j.status_matricula = 'ativa'
    and j.emusys_matricula_disciplina_id is not null
  group by
    j.unidade_id,
    j.emusys_matricula_disciplina_id
), jornada_atual_exata as (
  select ja.*
  from jornadas_ativas_agrupadas ja
  where ja.cardinalidade_jornada_ativa = 1
), periodos_ativos_exatos as (
  select
    b.*,
    u.nome as unidade_nome,
    ja.cardinalidade_jornada_ativa
  from public.vw_professor_periodos_baseline_v3_sombra b
  join jornada_atual_exata ja
    on ja.unidade_id = b.unidade_id
   and ja.emusys_matricula_disciplina_id
     = b.emusys_matricula_disciplina_id
   and ja.professor_id = b.professor_id
  join public.unidades u
    on u.id = b.unidade_id
  where b.status_periodo = 'ativo'
    and b.confianca = 'media'
    and b.professor_id is not null
    and b.emusys_matricula_disciplina_id is not null
    and b.emusys_disciplina_id is not null
    and ja.professor_id is not null
    and ja.emusys_disciplina_id is not null
)
select
  coalesce(unidade_nome, 'TOTAL') as unidade,
  count(*) as periodos_exatos,
  count(*) filter (
    where jsonb_typeof(conflitos) <> 'array'
       or jsonb_array_length(conflitos) > 0
  ) as conflitos,
  count(*) filter (
    where inicio_incompleto is distinct from false
  ) as inicios_incompletos,
  count(*) filter (
    where cardinalidade_jornada_ativa <> 1
  ) as cardinalidade_divergente
from periodos_ativos_exatos
group by rollup (unidade_nome)
order by unidade_nome nulls last;

-- Ator usado pela Task 3: a ativa governada valida de maior versao.
select
  c.id,
  c.versao,
  c.vigencia_inicio,
  c.vigencia_fim,
  c.criado_por,
  c.ativado_por,
  c.ativado_em,
  u.ativo as ator_ativo,
  public.usuario_tem_permissao(
    c.ativado_por,
    'professores.editar',
    null
  ) as ator_pode_editar_professores
from public.health_score_professor_v3_config_versoes c
join public.usuarios u
  on u.id = c.ativado_por
where c.status = 'ativa'
  and c.ativado_por is not null
  and u.ativo = true
  and public.usuario_tem_permissao(
    c.ativado_por,
    'professores.editar',
    null
  )
order by c.versao desc, c.vigencia_inicio desc, c.id desc
limit 1;

-- Deve retornar zero: uma promocao automatica nunca pode vir depois de uma
-- revisao humana preexistente para o mesmo periodo.
select count(*) as promocoes_que_sobrepoem_revisao_humana
from public.professor_periodos_revisoes_v1 automatica
where automatica.origem_revisao = 'promocao_automatica'
  and exists (
    select 1
    from public.professor_periodos_revisoes_v1 humana
    where humana.periodo_id = automatica.periodo_id
      and humana.origem_revisao = 'revisao_humana'
      and (
        humana.created_at < automatica.created_at
        or (
          humana.created_at = automatica.created_at
          and humana.id < automatica.id
        )
      )
  );

-- As duas colunas de divergencia devem ser zero.
with config_ativa as (
  select c.ativado_por
  from public.health_score_professor_v3_config_versoes c
  join public.usuarios u
    on u.id = c.ativado_por
  where c.status = 'ativa'
    and c.ativado_por is not null
    and u.ativo = true
    and public.usuario_tem_permissao(
      c.ativado_por,
      'professores.editar',
      null
    )
  order by c.versao desc, c.vigencia_inicio desc, c.id desc
  limit 1
)
select
  count(*) as promocoes_automaticas,
  count(*) filter (
    where rv.revisado_por is distinct from c.ativado_por
  ) as ator_divergente,
  count(*) - count(distinct rv.periodo_id) as duplicatas
from public.professor_periodos_revisoes_v1 rv
cross join config_ativa c
where rv.origem_revisao = 'promocao_automatica';

select
  confianca,
  fonte,
  count(*) as periodos
from public.vw_professor_periodos_efetivos_v3_sombra
where fonte like '%+promocao_automatica_v1'
   or fonte like '%+revisao_humana_v1'
group by confianca, fonte
order by fonte, confianca;
