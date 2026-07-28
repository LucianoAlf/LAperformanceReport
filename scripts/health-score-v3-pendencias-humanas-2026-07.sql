-- Health Score Professor V3 - fila humana aprovada em 27/07/2026.
-- Grao: unidade + aluno Emusys + periodo professor-disciplina.
-- Os nomes sao rotulos da fila; a resolucao usa IDs escopados pela unidade.

with fila_aprovada (
  ordem,
  aluno_nome,
  unidade_codigo,
  emusys_aluno_id,
  emusys_professor_periodo_id,
  emusys_disciplina_periodo_id
) as (
  values
    (1, 'Beatriz von Glehn Herkenhoff', 'BARRA', 1211::bigint, 1160::bigint, 8::bigint),
    (2, 'Gabriela de Lima Sodre', 'BARRA', 1143::bigint, 1002::bigint, 1::bigint),
    (3, 'Gabriela Dornas', 'BARRA', 970::bigint, 581::bigint, 8::bigint),
    (4, 'Sirley Jorge Martins Dantas', 'CG', 3272::bigint, 2387::bigint, 10::bigint),
    (5, 'Lohan Marques Boente', 'REC', 849::bigint, 2082::bigint, 1::bigint)
), fila_com_unidade as (
  select
    f.*,
    u.id as unidade_id,
    u.nome as unidade_nome
  from fila_aprovada f
  join public.unidades u
    on u.codigo = f.unidade_codigo
), reconstrucoes_ordenadas as (
  select
    r.*,
    row_number() over (
      partition by r.unidade_id
      order by
        r.data_fim desc,
        r.data_inicio asc,
        r.concluido_em desc nulls last,
        r.created_at desc,
        r.id desc
    ) as ordem_reconstrucao
  from public.professor_periodos_reconstrucoes_v1 r
  where r.status = 'concluido'
), reconstrucoes_atuais as (
  select r.*
  from reconstrucoes_ordenadas r
  where r.ordem_reconstrucao = 1
), periodos_candidatos as (
  select
    f.ordem,
    p.*,
    row_number() over (
      partition by f.ordem
      order by
        p.data_inicio desc,
        p.data_fim desc nulls first,
        p.created_at desc,
        p.id desc
    ) as ordem_periodo
  from fila_com_unidade f
  join reconstrucoes_atuais r
    on r.unidade_id = f.unidade_id
  join public.professor_matricula_disciplina_periodos_v1 p
    on p.reconstrucao_id = r.id
   and p.unidade_id = f.unidade_id
   and p.emusys_aluno_id = f.emusys_aluno_id
   and p.emusys_professor_id = f.emusys_professor_periodo_id
   and p.emusys_disciplina_id = f.emusys_disciplina_periodo_id
   and p.publicavel is false
), periodos_fila as (
  select p.*
  from periodos_candidatos p
  where p.ordem_periodo = 1
), revisoes_ultimas as (
  select distinct on (rv.periodo_id)
    rv.*
  from public.professor_periodos_revisoes_v1 rv
  order by rv.periodo_id, rv.created_at desc, rv.id desc
)
select
  f.ordem as fila_ordem,
  f.aluno_nome,
  f.unidade_id,
  f.unidade_nome as unidade,
  f.emusys_aluno_id,
  p.reconstrucao_id,
  p.id as periodo_id,
  coalesce(pe.data_inicio, p.data_inicio) as periodo_inicio,
  coalesce(pe.data_fim, p.data_fim) as periodo_fim,
  coalesce(pe.status_periodo, p.status_periodo) as periodo_status,
  coalesce(pe.publicavel, p.publicavel, false) as publicavel,
  coalesce(pe.confianca, p.confianca) as confianca,
  p.emusys_matricula_id,
  p.emusys_matricula_disciplina_id,
  p.emusys_disciplina_id,
  cp.nome as disciplina,
  p.professor_id as professor_anterior_id,
  pp.nome as professor_anterior,
  p.emusys_professor_id as emusys_professor_anterior_id,
  j.id as jornada_atual_id,
  j.status_matricula as jornada_atual_status,
  j.emusys_matricula_id as jornada_atual_emusys_matricula_id,
  j.emusys_matricula_disciplina_id
    as jornada_atual_emusys_matricula_disciplina_id,
  j.emusys_disciplina_id as jornada_atual_emusys_disciplina_id,
  coalesce(cj.nome, j.curso_nome_emusys) as jornada_atual_disciplina,
  j.professor_id as professor_atual_id,
  coalesce(pa.nome, j.professor_nome_emusys) as professor_atual,
  j.emusys_professor_id as emusys_professor_atual_id,
  j.nr_aulas_passadas as jornada_atual_aulas_passadas,
  j.nr_aulas_futuras as jornada_atual_aulas_futuras,
  j.nr_aulas_contratadas as jornada_atual_aulas_contratadas,
  case
    when p.id is null then 'periodo_nao_encontrado'
    when coalesce(pe.publicavel, p.publicavel, false) then 'decisao_humana_aplicada'
    else 'aguardando_decisao_humana'
  end as estado_fila,
  jsonb_build_object(
    'identidade', jsonb_build_object(
      'regra', 'unidade_id+emusys_aluno_id',
      'unidade_id', f.unidade_id,
      'emusys_aluno_id', f.emusys_aluno_id,
      'nome_usado_para_promocao', false
    ),
    'periodo', jsonb_build_object(
      'tipo_inicio', p.tipo_inicio,
      'tipo_fim', p.tipo_fim,
      'inicio_incompleto', p.inicio_incompleto,
      'substituicao_candidata', p.substituicao_candidata,
      'conflitos', coalesce(p.conflitos, '[]'::jsonb),
      'evidencias', coalesce(p.evidencias, '{}'::jsonb)
    ),
    'jornada_atual', jsonb_build_object(
      'fonte', j.fonte_ultima_atualizacao,
      'ultima_sincronizacao_emusys', j.ultima_sincronizacao_emusys,
      'mesma_matricula_disciplina',
        j.emusys_matricula_disciplina_id
          is not distinct from p.emusys_matricula_disciplina_id,
      'mesma_disciplina',
        j.emusys_disciplina_id is not distinct from p.emusys_disciplina_id
    ),
    'ultima_revisao', case
      when rv.id is null then null
      else jsonb_build_object(
        'id', rv.id,
        'decisao', rv.decisao,
        'motivo', rv.motivo,
        'revisado_por', rv.revisado_por,
        'created_at', rv.created_at
      )
    end
  ) as evidencias
from fila_com_unidade f
left join periodos_fila p
  on p.ordem = f.ordem
left join public.vw_professor_periodos_efetivos_v3_sombra pe
  on pe.periodo_chave = 'baseline:' || p.id::text
left join revisoes_ultimas rv
  on rv.periodo_id = p.id
left join public.professores pp
  on pp.id = p.professor_id
left join public.cursos cp
  on cp.id = p.curso_id
left join lateral (
  select ja.*
  from public.aluno_jornada_matricula_disciplina ja
  where ja.unidade_id = f.unidade_id
    and ja.emusys_aluno_id = f.emusys_aluno_id
  order by
    case
      when ja.emusys_matricula_disciplina_id
        is not distinct from p.emusys_matricula_disciplina_id then 0
      else 1
    end,
    case
      when ja.emusys_disciplina_id
        is not distinct from p.emusys_disciplina_id then 0
      else 1
    end,
    case when ja.status_matricula = 'ativa' then 0 else 1 end,
    ja.ultima_sincronizacao_emusys desc nulls last,
    ja.updated_at desc,
    ja.id
  limit 1
) j on true
left join public.professores pa
  on pa.id = j.professor_id
left join public.cursos cj
  on cj.id = j.curso_id
order by f.ordem;
