-- Gate 8: publica o observado somente quando a politica temporal da unidade
-- nao exige auditoria operacional. O valor bruto continua preservado no JSON.

create or replace function public.get_professor_presenca_v3_sombra(
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
    greatest(
      date_trunc('quarter', p_competencia)::date,
      date '2026-08-03'
    ) as inicio_recorte,
    least(
      (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date,
      (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date,
      current_date
    ) as fim_recorte,
    date_trunc('month', p_competencia)::date as inicio_observacao,
    least(
      (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date,
      current_date
    ) as fim_observacao
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), identidade_mapa as materialized (
  select
    i.unidade_id,
    i.pessoa_chave,
    unnest(i.aluno_ids_locais) as aluno_id
  from public.vw_aluno_identidade_unidade_canonica i
  join unidades_permitidas up on up.unidade_id = i.unidade_id
), roster_base as materialized (
  select distinct
    ae.professor_id,
    ae.unidade_id,
    ae.id as aula_emusys_id,
    ae.data_aula,
    exists (
      select 1
      from public.presenca_politicas_confiabilidade politica
      where politica.unidade_id = ae.unidade_id
        and politica.ativa
        and politica.exige_revisao_operacional
        and ae.data_aula between politica.data_inicio and politica.data_fim
    ) as observacao_exige_auditoria,
    coalesce(
      im.pessoa_chave,
      case when aa.aluno_emusys_id is not null
        then 'emusys:' || aa.aluno_emusys_id::text end,
      case when aa.aluno_id is not null
        then 'local:' || aa.aluno_id::text end
    ) as pessoa_chave
  from public.aulas_emusys ae
  join unidades_permitidas up on up.unidade_id = ae.unidade_id
  join params p
    on ae.data_aula between least(p.inicio_recorte, p.inicio_observacao)
                        and greatest(p.fim_recorte, p.fim_observacao)
  join public.aula_alunos_emusys aa on aa.aula_emusys_id = ae.id
  left join identidade_mapa im
    on im.unidade_id = ae.unidade_id
   and im.aluno_id = aa.aluno_id
  where ae.professor_id is not null
    and ae.cancelada = false
    and lower(coalesce(ae.categoria, 'normal')) = 'normal'
    and coalesce(ae.sem_acompanhamento, false) = false
), semantica_base as materialized (
  select
    s.professor_id,
    s.unidade_id,
    s.aula_emusys_id,
    s.data_aula,
    coalesce(im.pessoa_chave, 'local:' || s.aluno_id::text) as pessoa_chave,
    bool_or(s.resultado_pedagogico = 'presente') as presente,
    bool_or(s.resultado_pedagogico = 'falta_confirmada') as falta_confirmada
  from public.vw_aluno_presenca_semantica_v1 s
  join unidades_permitidas up on up.unidade_id = s.unidade_id
  join params p
    on s.data_aula between least(p.inicio_recorte, p.inicio_observacao)
                       and greatest(p.fim_recorte, p.fim_observacao)
  left join identidade_mapa im
    on im.unidade_id = s.unidade_id
   and im.aluno_id = s.aluno_id
  where s.professor_id is not null
    and s.resultado_pedagogico in ('presente', 'falta_confirmada')
    and s.considera_frequencia_denominador = true
  group by
    s.professor_id,
    s.unidade_id,
    s.aula_emusys_id,
    s.data_aula,
    coalesce(im.pessoa_chave, 'local:' || s.aluno_id::text)
), eventos_esperados as (
  select r.*
  from roster_base r
  cross join params p
  where r.pessoa_chave is not null
    and r.data_aula between p.inicio_recorte and p.fim_recorte
), semantica_deduplicada as (
  select s.*
  from semantica_base s
  cross join params p
  where s.data_aula between p.inicio_recorte and p.fim_recorte
    and s.data_aula >= date '2026-08-03'
), eventos_classificados as (
  select
    e.professor_id,
    e.unidade_id,
    e.aula_emusys_id,
    e.pessoa_chave,
    s.presente,
    s.falta_confirmada
  from eventos_esperados e
  join semantica_deduplicada s
    on s.professor_id = e.professor_id
   and s.unidade_id = e.unidade_id
   and s.aula_emusys_id = e.aula_emusys_id
   and s.pessoa_chave = e.pessoa_chave
), eventos_esperados_observacao as (
  select r.*
  from roster_base r
  cross join params p
  where r.pessoa_chave is not null
    and r.data_aula between p.inicio_observacao and p.fim_observacao
), semantica_observacao as (
  select s.*
  from semantica_base s
  cross join params p
  where s.data_aula between p.inicio_observacao and p.fim_observacao
), eventos_classificados_observacao as (
  select
    e.professor_id,
    e.unidade_id,
    e.aula_emusys_id,
    e.pessoa_chave,
    s.presente,
    s.falta_confirmada
  from eventos_esperados_observacao e
  join semantica_observacao s
    on s.professor_id = e.professor_id
   and s.unidade_id = e.unidade_id
   and s.aula_emusys_id = e.aula_emusys_id
   and s.pessoa_chave = e.pessoa_chave
), professores_unidade as (
  select distinct pu.professor_id, pu.unidade_id
  from public.professores_unidades pu
  join unidades_permitidas up on up.unidade_id = pu.unidade_id
  where coalesce(pu.emusys_ativo, true)
    and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
  union
  select distinct r.professor_id, r.unidade_id
  from roster_base r
), professores_alvo as (
  select distinct
    pu.professor_id,
    case when p_unidade_id is null then null::uuid else pu.unidade_id end as unidade_saida
  from professores_unidade pu
), esperados_stats as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    count(*)::integer as eventos_esperados
  from eventos_esperados e
  group by e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end
), classificados_stats as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    count(*)::integer as eventos_elegiveis,
    count(*) filter (where e.presente)::integer as presentes,
    count(*) filter (where e.falta_confirmada and not e.presente)::integer
      as faltas_confirmadas
  from eventos_classificados e
  group by e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end
), observacao_esperados_stats as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    count(*)::integer as eventos_esperados,
    bool_or(e.observacao_exige_auditoria) as exige_revisao_operacional
  from eventos_esperados_observacao e
  group by e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end
), observacao_classificados_stats as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    count(*)::integer as eventos_classificados,
    count(*) filter (where e.presente)::integer as presentes,
    count(*) filter (where e.falta_confirmada and not e.presente)::integer
      as faltas_confirmadas
  from eventos_classificados_observacao e
  group by e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end
), metricas as (
  select
    pa.professor_id,
    pa.unidade_saida,
    coalesce(es.eventos_esperados, 0)::integer as eventos_esperados,
    coalesce(cs.eventos_elegiveis, 0)::integer as eventos_elegiveis,
    coalesce(cs.presentes, 0)::integer as presentes,
    coalesce(cs.faltas_confirmadas, 0)::integer as faltas_confirmadas,
    case when coalesce(es.eventos_esperados, 0) > 0
      then coalesce(cs.eventos_elegiveis, 0)::numeric / es.eventos_esperados::numeric
      else null end as cobertura,
    coalesce(oes.eventos_esperados, 0)::integer as eventos_esperados_observados,
    coalesce(ocs.eventos_classificados, 0)::integer as eventos_classificados_observados,
    coalesce(ocs.presentes, 0)::integer as presentes_observados,
    coalesce(ocs.faltas_confirmadas, 0)::integer as faltas_confirmadas_observadas,
    coalesce(oes.exige_revisao_operacional, false) as observacao_exige_auditoria,
    case when coalesce(oes.eventos_esperados, 0) > 0
      then coalesce(ocs.eventos_classificados, 0)::numeric / oes.eventos_esperados::numeric
      else null end as cobertura_observada
  from professores_alvo pa
  left join esperados_stats es
    on es.professor_id = pa.professor_id
   and es.unidade_saida is not distinct from pa.unidade_saida
  left join classificados_stats cs
    on cs.professor_id = pa.professor_id
   and cs.unidade_saida is not distinct from pa.unidade_saida
  left join observacao_esperados_stats oes
    on oes.professor_id = pa.professor_id
   and oes.unidade_saida is not distinct from pa.unidade_saida
  left join observacao_classificados_stats ocs
    on ocs.professor_id = pa.professor_id
   and ocs.unidade_saida is not distinct from pa.unidade_saida
)
select
  m.professor_id,
  pr.nome as professor_nome,
  m.unidade_saida as unidade_id,
  p.competencia,
  case when m.eventos_elegiveis > 0
    then round(m.presentes::numeric / m.eventos_elegiveis::numeric * 100, 2)
    else null end as valor_bruto,
  m.presentes::numeric as numerador,
  m.eventos_elegiveis::numeric as denominador,
  m.eventos_elegiveis as amostra,
  case
    when m.eventos_esperados = 0 then 'sem_base'
    when m.eventos_elegiveis < 10 then 'sem_base_amostra'
    when m.cobertura < 0.95 then 'sem_base_cobertura'
    else 'ok'
  end as estado_base,
  (m.eventos_elegiveis >= 10 and m.cobertura >= 0.95) as publicavel,
  case
    when m.eventos_esperados = 0 then 'sem_base'
    when m.eventos_elegiveis < 10 or m.cobertura < 0.95 then 'baixa'
    else 'alta'
  end as confianca,
  'vw_aluno_presenca_semantica_v1+aula_alunos_emusys'::text as fonte,
  'health-score-professor-v3-presenca-3'::text as regra_versao,
  case
    when m.eventos_esperados = 0 then 'nenhum evento de roster no recorte pontuavel'
    when m.eventos_elegiveis < 10 then 'base minima de 10 eventos aluno-aula nao atingida'
    when m.cobertura < 0.95 then 'cobertura semantica inferior a 95% do roster esperado'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'inicio_recorte', p.inicio_recorte,
    'fim_recorte', p.fim_recorte,
    'eventos_esperados', m.eventos_esperados,
    'eventos_elegiveis', m.eventos_elegiveis,
    'presentes', m.presentes,
    'faltas_confirmadas', m.faltas_confirmadas,
    'cobertura', case when m.cobertura is null then null
      else round(m.cobertura * 100, 2) end,
    'vigencia_pontuavel', '2026-08-03',
    'inicio_observacao', p.inicio_observacao,
    'fim_observacao', p.fim_observacao,
    'valor_observado', case when m.eventos_classificados_observados > 0
      then round(
        m.presentes_observados::numeric
        / m.eventos_classificados_observados::numeric * 100,
        2
      ) else null end,
    'cobertura_observada', case when m.cobertura_observada is null then null
      else round(m.cobertura_observada * 100, 2) end,
    'eventos_esperados_observados', m.eventos_esperados_observados,
    'eventos_classificados_observados', m.eventos_classificados_observados,
    'presentes_observados', m.presentes_observados,
    'faltas_confirmadas_observadas', m.faltas_confirmadas_observadas,
    'observado_fora_score', p.inicio_observacao < date '2026-08-03',
    'observacao_publicacao', case
      when m.observacao_exige_auditoria then 'em_auditoria'
      else 'normal'
    end,
    'observacao_exige_revisao_operacional', m.observacao_exige_auditoria,
    'observacao_fundamento', case
      when m.observacao_exige_auditoria
        then 'politica temporal da unidade exige revisao operacional'
      else 'politica temporal permite publicacao do observado'
    end,
    'observacao_estado', case
      when m.eventos_esperados_observados = 0 then 'sem_base'
      when m.eventos_classificados_observados < 10 then 'sem_base_amostra'
      when m.cobertura_observada < 0.95 then 'sem_base_cobertura'
      else 'ok'
    end
  ) as detalhes
from metricas m
join public.professores pr on pr.id = m.professor_id
cross join params p
order by pr.nome, m.unidade_saida;
$$;

comment on function public.get_professor_presenca_v3_sombra(date, uuid) is
  'Gate 8: presenca pontuavel desde 03/08/2026; observado respeita a politica temporal versionada de auditoria por unidade.';

revoke all on function public.get_professor_presenca_v3_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_professor_presenca_v3_sombra(date, uuid)
  to authenticated, service_role;
