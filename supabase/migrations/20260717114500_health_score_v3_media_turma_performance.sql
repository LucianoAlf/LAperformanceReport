-- Gate 4: remove o join OR/ANY da identidade na media por turma.
-- O roster resolve primeiro o ID Emusys por igualdade; fallback local fica auditavel.

create or replace function public.get_professor_media_turma_v3_sombra(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  amostra integer,
  estado_base text,
  publicavel boolean,
  confianca text,
  fonte text,
  regra_versao text,
  motivo_sem_base text,
  detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with params as (
  select
    date_trunc('month', p_competencia)::date as competencia,
    date_trunc('quarter', p_competencia)::date as inicio_trimestre,
    (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date
      as fim_trimestre,
    least(
      (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date,
      (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date
    ) as fim_recorte
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), roster_resolvido as (
  select
    ae.id as aula_id,
    ae.professor_id,
    ae.unidade_id,
    ae.data_aula,
    ae.turma_nome,
    ae.curso_emusys_id,
    ae.curso_nome,
    ae.matricula_disciplina_id,
    aa.aluno_id,
    aa.aluno_emusys_id,
    coalesce(
      aa.aluno_emusys_id,
      case
        when nullif(btrim(al.emusys_student_id), '') ~ '^[0-9]+$'
          then btrim(al.emusys_student_id)::bigint
        else null
      end
    ) as emusys_aluno_id_resolvido
  from public.aulas_emusys ae
  join unidades_permitidas up on up.unidade_id = ae.unidade_id
  join params p on ae.data_aula between p.inicio_trimestre and p.fim_recorte
  join public.aula_alunos_emusys aa on aa.aula_emusys_id = ae.id
  left join public.alunos al
    on al.id = aa.aluno_id
   and al.unidade_id = ae.unidade_id
  where ae.professor_id is not null
    and ae.cancelada = false
    and lower(coalesce(ae.categoria, 'normal')) = 'normal'
    and coalesce(ae.sem_acompanhamento, false) = false
), eventos_identificados as (
  select distinct
    r.professor_id,
    r.unidade_id,
    date_trunc('month', r.data_aula)::date as mes_referencia,
    coalesce(
      i.pessoa_chave,
      case when r.emusys_aluno_id_resolvido is not null
        then 'emusys:' || r.emusys_aluno_id_resolvido::text end,
      case when r.aluno_id is not null
        then 'local:' || r.aluno_id::text end
    ) as pessoa_chave,
    (
      i.pessoa_chave is null
      and r.emusys_aluno_id_resolvido is null
      and r.aluno_id is not null
    ) as identidade_fallback_local,
    case
      when nullif(btrim(r.turma_nome), '') is not null then
        r.unidade_id::text || ':turma:'
        || coalesce(r.curso_emusys_id::text, lower(btrim(r.curso_nome)))
        || ':' || lower(btrim(r.turma_nome))
      when r.matricula_disciplina_id is not null
       and r.matricula_disciplina_id > 0 then
        r.unidade_id::text || ':individual:' || r.matricula_disciplina_id::text
      else null
    end as turma_chave,
    c.id is not null as curso_mapeado,
    coalesce(c.is_projeto_banda, false) as is_projeto_banda
  from roster_resolvido r
  left join public.vw_aluno_identidade_unidade_canonica i
    on i.unidade_id = r.unidade_id
   and i.emusys_aluno_id = r.emusys_aluno_id_resolvido
  left join public.curso_emusys_depara d
    on d.unidade_id = r.unidade_id
   and d.emusys_disciplina_id = r.curso_emusys_id
  left join public.cursos c on c.id = d.curso_id
), eventos_elegiveis as (
  select e.*
  from eventos_identificados e
  where e.pessoa_chave is not null
    and e.turma_chave is not null
    and e.is_projeto_banda = false
), mensais as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    e.mes_referencia,
    count(distinct (e.pessoa_chave, e.turma_chave))::integer as ocupacoes,
    count(distinct e.turma_chave)::integer as turmas
  from eventos_elegiveis e
  group by
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end,
    e.mes_referencia
), problemas as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    count(*) filter (where e.pessoa_chave is null)::integer as sem_identidade,
    count(*) filter (where e.identidade_fallback_local)::integer as fallback_local,
    count(*) filter (where e.turma_chave is null)::integer as sem_turma_estavel,
    count(*) filter (where not e.curso_mapeado)::integer as curso_sem_depara
  from eventos_identificados e
  where e.is_projeto_banda = false
  group by
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end
), estatisticas as (
  select
    m.professor_id,
    m.unidade_saida,
    sum(m.ocupacoes)::integer as ocupacoes_total,
    sum(m.turmas)::integer as turmas_total,
    count(distinct m.mes_referencia)::integer as meses_com_base
  from mensais m
  group by m.professor_id, m.unidade_saida
), professores_unidade as (
  select distinct pu.professor_id, pu.unidade_id
  from public.professores_unidades pu
  join unidades_permitidas up on up.unidade_id = pu.unidade_id
  where coalesce(pu.emusys_ativo, true)
    and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
  union
  select distinct e.professor_id, e.unidade_id
  from eventos_identificados e
), professores_alvo as (
  select distinct
    pu.professor_id,
    case when p_unidade_id is null then null::uuid else pu.unidade_id end as unidade_saida
  from professores_unidade pu
)
select
  pa.professor_id,
  pr.nome as professor_nome,
  pa.unidade_saida as unidade_id,
  p.competencia,
  case
    when coalesce(e.turmas_total, 0) > 0 then
      round(e.ocupacoes_total::numeric / e.turmas_total::numeric, 2)
    else null
  end as valor_bruto,
  coalesce(e.ocupacoes_total, 0)::numeric as numerador,
  coalesce(e.turmas_total, 0)::numeric as denominador,
  coalesce(e.ocupacoes_total, 0) as amostra,
  case
    when coalesce(e.turmas_total, 0) = 0 then 'sem_base'
    when e.meses_com_base < 3 then 'provisorio'
    when coalesce(pb.sem_identidade, 0)
       + coalesce(pb.fallback_local, 0)
       + coalesce(pb.sem_turma_estavel, 0)
       + coalesce(pb.curso_sem_depara, 0) > 0 then 'revisar'
    else 'ok'
  end as estado_base,
  (
    coalesce(e.turmas_total, 0) > 0
    and e.meses_com_base = 3
    and coalesce(pb.sem_identidade, 0)
      + coalesce(pb.fallback_local, 0)
      + coalesce(pb.sem_turma_estavel, 0)
      + coalesce(pb.curso_sem_depara, 0) = 0
  ) as publicavel,
  case
    when coalesce(e.turmas_total, 0) = 0 then 'sem_base'
    when coalesce(pb.sem_identidade, 0)
       + coalesce(pb.fallback_local, 0)
       + coalesce(pb.sem_turma_estavel, 0)
       + coalesce(pb.curso_sem_depara, 0) > 0 then 'media'
    when e.meses_com_base < 3 then 'provisoria'
    else 'alta'
  end as confianca,
  'aulas_emusys+aula_alunos_emusys+vw_aluno_identidade_unidade_canonica'::text
    as fonte,
  'health-score-professor-v3-media-turma-2'::text as regra_versao,
  case
    when coalesce(e.turmas_total, 0) = 0 then 'nenhuma turma regular com identidade estavel'
    when e.meses_com_base < 3 then 'trimestre ainda nao possui tres fechamentos mensais'
    when coalesce(pb.sem_identidade, 0)
       + coalesce(pb.fallback_local, 0)
       + coalesce(pb.sem_turma_estavel, 0)
       + coalesce(pb.curso_sem_depara, 0) > 0 then 'ha eventos sem identidade, turma ou de-para canonico'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'inicio_trimestre', p.inicio_trimestre,
    'fim_recorte', p.fim_recorte,
    'ocupacoes_unicas', coalesce(e.ocupacoes_total, 0),
    'turmas_regulares', coalesce(e.turmas_total, 0),
    'meses_com_base', coalesce(e.meses_com_base, 0),
    'sem_identidade', coalesce(pb.sem_identidade, 0),
    'fallback_local', coalesce(pb.fallback_local, 0),
    'sem_turma_estavel', coalesce(pb.sem_turma_estavel, 0),
    'curso_sem_depara', coalesce(pb.curso_sem_depara, 0),
    'exclusao', 'cursos is_projeto_banda=true'
  ) as detalhes
from professores_alvo pa
join public.professores pr on pr.id = pa.professor_id
cross join params p
left join estatisticas e
  on e.professor_id = pa.professor_id
 and e.unidade_saida is not distinct from pa.unidade_saida
left join problemas pb
  on pb.professor_id = pa.professor_id
 and pb.unidade_saida is not distinct from pa.unidade_saida
order by pr.nome, pa.unidade_saida;
$$;

comment on function public.get_professor_media_turma_v3_sombra(date, uuid) is
  'Media/turma V3 em sombra. Identidade por igualdade de ID Emusys; fallback local permanece auditavel.';

revoke all on function public.get_professor_media_turma_v3_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_professor_media_turma_v3_sombra(date, uuid)
  to authenticated, service_role;
