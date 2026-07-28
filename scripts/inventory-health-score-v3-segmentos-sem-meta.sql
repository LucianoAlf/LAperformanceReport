select
  c.id as config_id,
  c.versao as config_versao,
  c.vigencia_inicio,
  c.vigencia_fim
from public.health_score_professor_v3_config_versoes c
where c.status = 'ativa'
order by (
  select count(*)
  from public.health_score_professor_v3_config_metas_curso_modalidade m
  join public.cursos curso
    on curso.id = m.curso_id
   and curso.natureza_operacional = 'pedagogica'
  where m.config_id = c.id
) desc, c.versao desc, c.id
limit 1;

with unidades_alvo (unidade_id, ordem) as (
  values
    ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 1),
    ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 2),
    ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 3)
), configuracao_origem as (
  select c.id, c.versao
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
  order by (
    select count(*)
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    join public.cursos curso
      on curso.id = m.curso_id
     and curso.natureza_operacional = 'pedagogica'
    where m.config_id = c.id
  ) desc, c.versao desc, c.id
  limit 1
), segmentos_sem_meta as (
  select
    cfg.id as config_id,
    cfg.versao as config_versao,
    alvo.ordem as unidade_ordem,
    a.unidade_id,
    u.nome as unidade,
    a.curso_id,
    c.nome as curso,
    a.modalidade,
    count(distinct a.professor_id)::integer as quantidade_professores,
    array_agg(
      distinct a.professor_id
      order by a.professor_id
    ) as professor_ids,
    string_agg(
      distinct p.nome,
      ' | '
      order by p.nome
    ) as professores_nomes,
    case
      when bool_or(excecao.id is not null)
        then 'atribuicao_formal_ativa_marcada_nao_ofertada'
      else 'meta_segmentada_configurada_ausente'
    end as motivo_ausencia_meta
  from public.professor_unidade_curso_modalidade a
  join unidades_alvo alvo
    on alvo.unidade_id = a.unidade_id
  join public.unidades u
    on u.id = a.unidade_id
  join public.cursos c
    on c.id = a.curso_id
   and c.natureza_operacional = 'pedagogica'
  join public.professores p
    on p.id = a.professor_id
  cross join configuracao_origem cfg
  left join public.health_score_professor_v3_config_metas_curso_modalidade m
    on m.config_id = cfg.id
   and m.unidade_id = a.unidade_id
   and m.curso_id = a.curso_id
   and m.modalidade = a.modalidade
   and m.estado = 'configurada'
  left join public.health_score_professor_v3_config_metas_curso_modalidade excecao
    on excecao.config_id = cfg.id
   and excecao.unidade_id = a.unidade_id
   and excecao.curso_id = a.curso_id
   and excecao.modalidade = a.modalidade
   and excecao.estado = 'nao_ofertada'
  where a.status = 'ativo'
    and a.vigencia_fim is null
    and a.confianca in ('alta', 'revisada')
    and m.id is null
  group by
    cfg.id,
    cfg.versao,
    alvo.ordem,
    a.unidade_id,
    u.nome,
    a.curso_id,
    c.nome,
    a.modalidade
)
select
  config_id,
  config_versao,
  unidade_id,
  unidade,
  curso_id,
  curso,
  modalidade,
  quantidade_professores,
  professor_ids,
  professores_nomes,
  motivo_ausencia_meta
from segmentos_sem_meta
order by
  unidade_ordem,
  curso,
  curso_id,
  modalidade;
