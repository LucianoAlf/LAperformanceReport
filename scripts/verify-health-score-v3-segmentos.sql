-- Gate 10 - verificacao SELECT-only da configuracao segmentada V3.
-- Competencia auditada: julho/2026.
-- Rascunho auditado: versao 3. Este script nao ativa configuracao.

-- 1. Estado governado da configuracao e da simulacao.
select public.get_health_score_professor_v3_config_ui(
  '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid
) as config_rascunho;

select
  id,
  config_id,
  competencia_referencia,
  publica,
  resultado,
  created_at
from public.health_score_professor_v3_config_simulacoes
where id = '49ff6bee-1af7-45c0-b908-516a85df9890'::uuid;

-- 2. Comparacao dos valores brutos por professor/unidade.
with unidades_alvo as (
  select id as unidade_id, nome
  from public.unidades
  where upper(nome) in ('BARRA', 'RECREIO', 'CAMPO GRANDE')
), segmentado as (
  select
    u.nome as unidade,
    d.professor_id,
    max(d.pessoas_unicas_total) as pessoas_unicas_total,
    sum(d.vinculos_ativos) filter (
      where not d.linha_diagnostico and d.curso_id is not null
    )::integer as vinculos_ativos,
    sum(d.ocupacoes_unicas) filter (
      where not d.linha_diagnostico and d.curso_id is not null
    )::integer as ocupacoes_unicas,
    sum(d.turmas_elegiveis) filter (
      where not d.linha_diagnostico and d.curso_id is not null
    )::integer as turmas_elegiveis
  from unidades_alvo u
  cross join lateral
    public.get_health_score_professor_v3_metricas_segmentadas_v1(
      date '2026-07-01',
      '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid,
      u.unidade_id,
      'mensal'
    ) d
  where d.metrica = 'media_turma'
  group by u.nome, d.professor_id
), canonico as (
  select
    u.nome as unidade,
    c.professor_id,
    c.carteira_alunos::numeric as carteira_alunos,
    c.media_alunos_turma::numeric as media_alunos_turma
  from unidades_alvo u
  cross join lateral public.get_carteira_professor_periodo_canonica(
    2026,
    7,
    u.unidade_id,
    date '2026-07-01',
    date '2026-07-20'
  ) c
), comparacao as (
  select
    coalesce(s.unidade, c.unidade) as unidade,
    coalesce(s.professor_id, c.professor_id) as professor_id,
    s.pessoas_unicas_total,
    c.carteira_alunos,
    s.vinculos_ativos,
    s.ocupacoes_unicas,
    s.turmas_elegiveis,
    case
      when s.turmas_elegiveis > 0 then round(
        s.ocupacoes_unicas::numeric / s.turmas_elegiveis,
        2
      )
    end as media_segmentada,
    c.media_alunos_turma
  from segmentado s
  full join canonico c
    on c.unidade = s.unidade
   and c.professor_id = s.professor_id
)
select
  count(*) as professor_unidade_comparados,
  count(*) filter (
    where pessoas_unicas_total is distinct from carteira_alunos
  ) as divergencias_total_pessoas,
  count(*) filter (
    where coalesce(media_segmentada, 0)
      is distinct from coalesce(media_alunos_turma, 0)
  ) as divergencias_media_bruta,
  max(abs(coalesce(pessoas_unicas_total, 0) - coalesce(carteira_alunos, 0)))
    as delta_maximo_pessoas,
  max(abs(coalesce(media_segmentada, 0) - coalesce(media_alunos_turma, 0)))
    as delta_maximo_media
from comparacao;

-- 3. Separacao conceitual auditavel: pessoa, vinculo e ocupacao.
select
  u.nome as unidade,
  d.professor_id,
  max(d.professor_nome) as professor_nome,
  max(d.pessoas_unicas_total) as pessoas_unicas_total,
  sum(d.vinculos_ativos) filter (
    where not d.linha_diagnostico and d.curso_id is not null
  ) as vinculos_ativos,
  sum(d.ocupacoes_unicas) filter (
    where not d.linha_diagnostico and d.curso_id is not null
  ) as ocupacoes_unicas,
  sum(d.turmas_elegiveis) filter (
    where not d.linha_diagnostico and d.curso_id is not null
  ) as turmas_elegiveis
from public.unidades u
cross join lateral
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date '2026-07-01',
    '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid,
    u.id,
    'mensal'
  ) d
where upper(u.nome) in ('BARRA', 'RECREIO', 'CAMPO GRANDE')
  and d.metrica = 'numero_alunos'
group by u.nome, d.professor_id
order by u.nome, professor_nome;

-- 4. Bloqueios da matriz ainda nao homologada.
with detalhe as (
  select d.*
  from public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date '2026-07-01',
    '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid,
    null,
    'mensal'
  ) d
)
select jsonb_build_object(
  'regra_ausente', count(*) filter (
    where estado_base = 'regra_ausente'
  ),
  'atribuicoes_pontuaveis_sem_meta', count(distinct atribuicao_id) filter (
    where atribuicao_pontuavel and config_meta_segmento_id is null
  ),
  'segmentacao_incompleta', count(*) filter (
    where estado_base = 'segmentacao_incompleta'
  ),
  'nao_ofertada_observada', count(*) filter (
    where estado_base = 'divergencia_nao_ofertada'
  ),
  'zero_carteira', count(*) filter (
    where estado_base = 'sem_base_zero_carteira'
  ),
  'capacidade_excedida', count(*) filter (
    where capacidade_excedida
  )
) as bloqueios;

-- 5. Casos de controle da matriz. Ausencia de linha indica meta ainda nao
-- homologada; nao deve haver copia silenciosa entre unidade/modalidade.
select
  u.nome as unidade,
  c.nome as curso,
  m.modalidade,
  m.capacidade_maxima,
  m.meta_media_turma,
  m.meta_carteira_curso,
  m.estado
from public.health_score_professor_v3_config_metas_curso_modalidade m
join public.unidades u on u.id = m.unidade_id
join public.cursos c on c.id = m.curso_id
where m.config_id = '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid
  and (
    upper(c.nome) like 'BATERIA%'
    or upper(c.nome) like 'CANTO%'
  )
order by u.nome, c.nome, m.modalidade;

