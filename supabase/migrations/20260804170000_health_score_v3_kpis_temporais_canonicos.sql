begin;

-- A ocorrencia de presenca e identificada por professor, unidade, id externo,
-- pessoa e data da aula. O instante em que a Secretaria registra a chamada nao
-- participa dessa identidade: uma chamada tardia continua valida para a aula.
create or replace function public.get_health_score_professor_v3_presenca_periodo_v2(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text,
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
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PRESENCA_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo
    into v_inicio, v_fim_periodo, v_codigo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade) p;

  v_fim_recorte := least(v_fim_periodo, current_date);

  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), identidade_local as (
    select i.unidade_id, i.pessoa_chave, unnest(i.aluno_ids_locais) as aluno_id
    from public.vw_aluno_identidade_unidade_canonica i
    join unidades_permitidas up on up.unidade_id = i.unidade_id
  ), roster as (
    select distinct
      ae.professor_id,
      ae.unidade_id,
      ae.id as aula_id,
      ae.data_aula,
      coalesce(
        ie.pessoa_chave,
        il.pessoa_chave,
        case when aa.aluno_emusys_id is not null
          then 'emusys:' || aa.aluno_emusys_id::text end,
        case when aa.aluno_id is not null then 'local:' || aa.aluno_id::text end
      ) as pessoa_chave,
      coalesce(pol.exige_revisao_operacional, true) as exige_revisao
    from public.aulas_emusys ae
    join unidades_permitidas up on up.unidade_id = ae.unidade_id
    join public.aula_alunos_emusys aa on aa.aula_emusys_id = ae.id
    left join public.vw_aluno_identidade_unidade_canonica ie
      on ie.unidade_id = ae.unidade_id
     and ie.emusys_aluno_id = aa.aluno_emusys_id
    left join identidade_local il
      on il.unidade_id = ae.unidade_id and il.aluno_id = aa.aluno_id
    left join lateral (
      select p.exige_revisao_operacional
      from public.presenca_politicas_confiabilidade p
      where p.unidade_id = ae.unidade_id
        and p.ativa
        and ae.data_aula between p.data_inicio and p.data_fim
      order by p.data_inicio desc, p.created_at desc
      limit 1
    ) pol on true
    where ae.data_aula between v_inicio and v_fim_recorte
      and ae.professor_id is not null
      and ae.cancelada = false
      and lower(coalesce(ae.categoria, 'normal')) = 'normal'
      and coalesce(ae.sem_acompanhamento, false) = false
  ), semantica as (
    select
      s.professor_id,
      s.unidade_id,
      s.aula_emusys_id,
      s.data_aula,
      coalesce(il.pessoa_chave, 'local:' || s.aluno_id::text) as pessoa_chave,
      bool_or(s.resultado_pedagogico = 'presente') as presente,
      bool_or(s.resultado_pedagogico = 'falta_confirmada') as falta_confirmada
    from public.vw_aluno_presenca_semantica_v1 s
    join unidades_permitidas up on up.unidade_id = s.unidade_id
    left join identidade_local il
      on il.unidade_id = s.unidade_id and il.aluno_id = s.aluno_id
    where s.data_aula between v_inicio and v_fim_recorte
      and s.professor_id is not null
      and s.resultado_pedagogico in ('presente', 'falta_confirmada')
      and s.considera_frequencia_denominador
    group by s.professor_id, s.unidade_id, s.aula_emusys_id, s.data_aula,
      coalesce(il.pessoa_chave, 'local:' || s.aluno_id::text)
  ), eventos as (
    select
      r.professor_id,
      r.unidade_id,
      r.aula_id,
      r.data_aula,
      r.pessoa_chave,
      r.exige_revisao,
      s.presente,
      s.falta_confirmada
    from roster r
    left join semantica s
      on s.professor_id = r.professor_id
     and s.unidade_id = r.unidade_id
     and s.aula_emusys_id = r.aula_id
     and s.data_aula = r.data_aula
     and s.pessoa_chave = r.pessoa_chave
    where r.pessoa_chave is not null
  ), stats as (
    select e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      count(*) filter (where not e.exige_revisao)::integer as esperados_confiaveis,
      count(*) filter (
        where not e.exige_revisao and (e.presente or e.falta_confirmada)
      )::integer as classificados_confiaveis,
      count(*) filter (where not e.exige_revisao and e.presente)::integer as presentes,
      count(*) filter (
        where not e.exige_revisao and e.falta_confirmada and not coalesce(e.presente, false)
      )::integer as faltas,
      count(*) filter (where e.exige_revisao)::integer as esperados_auditoria,
      count(*) filter (
        where e.exige_revisao and (e.presente or e.falta_confirmada)
      )::integer as classificados_auditoria,
      count(*) filter (where e.exige_revisao and e.presente)::integer as presentes_auditoria,
      count(*) filter (
        where e.exige_revisao and e.falta_confirmada and not coalesce(e.presente, false)
      )::integer as faltas_auditoria
    from eventos e
    group by e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
  ), alvo as (
    select distinct pu.professor_id,
      case when p_unidade_id is null then null::uuid else pu.unidade_id end
        as unidade_saida
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
    union
    select distinct e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
    from eventos e
  )
  select
    'presenca'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(s.classificados_confiaveis, 0) > 0 then round(
      s.presentes::numeric / s.classificados_confiaveis::numeric * 100, 2
    ) else null end,
    coalesce(s.presentes, 0)::numeric,
    coalesce(s.classificados_confiaveis, 0)::numeric,
    coalesce(s.classificados_confiaveis, 0),
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0 then 'em_auditoria'
      when coalesce(s.esperados_confiaveis, 0) = 0 then 'sem_base'
      when s.classificados_confiaveis < 10 then 'sem_base_amostra'
      when s.classificados_confiaveis::numeric / s.esperados_confiaveis < 0.95
        then 'sem_base_cobertura'
      else 'ok'
    end,
    coalesce(s.classificados_confiaveis, 0) >= 10
      and s.esperados_confiaveis > 0
      and s.classificados_confiaveis::numeric / s.esperados_confiaveis >= 0.95,
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0 then 'auditoria'
      when coalesce(s.esperados_confiaveis, 0) = 0 then 'sem_base'
      when s.classificados_confiaveis < 10
        or s.classificados_confiaveis::numeric / s.esperados_confiaveis < 0.95
        then 'baixa'
      else 'alta'
    end,
    'vw_aluno_presenca_semantica_v1+aula_alunos_emusys+presenca_politicas_confiabilidade'::text,
    'health-score-professor-v3-presenca-ocorrencia-2'::text,
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0
        then 'unidade em auditoria e fora do Health Score'
      when coalesce(s.esperados_confiaveis, 0) = 0 then 'nenhum evento confiavel no periodo'
      when s.classificados_confiaveis < 10 then 'base minima de 10 eventos nao atingida'
      when s.classificados_confiaveis::numeric / s.esperados_confiaveis < 0.95
        then 'cobertura semantica inferior a 95% do roster esperado'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'eventos_esperados_confiaveis', coalesce(s.esperados_confiaveis, 0),
      'eventos_classificados_confiaveis', coalesce(s.classificados_confiaveis, 0),
      'presentes', coalesce(s.presentes, 0),
      'faltas_confirmadas', coalesce(s.faltas, 0),
      'cobertura', case when coalesce(s.esperados_confiaveis, 0) > 0
        then round(s.classificados_confiaveis::numeric / s.esperados_confiaveis * 100, 2) end,
      'eventos_esperados_auditoria', coalesce(s.esperados_auditoria, 0),
      'eventos_classificados_auditoria', coalesce(s.classificados_auditoria, 0),
      'presentes_auditoria', coalesce(s.presentes_auditoria, 0),
      'faltas_auditoria', coalesce(s.faltas_auditoria, 0),
      'identidade_ocorrencia', 'professor+unidade+aula_id+data_aula+pessoa',
      'aceita_lancamento_tardio', true,
      'apta_oficial', p_periodicidade = 'ciclo'
        and v_fim_periodo <= current_date
        and coalesce(s.classificados_confiaveis, 0) >= 10
        and s.esperados_confiaveis > 0
        and s.classificados_confiaveis::numeric / s.esperados_confiaveis >= 0.95
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join stats s
    on s.professor_id = a.professor_id
   and s.unidade_saida is not distinct from a.unidade_saida;
end;
$function$;

-- Mantem os demais pilares intactos e substitui somente a presenca pelo
-- produtor corrigido por ocorrencia.
alter function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  rename to get_hs_prof_v3_metricas_periodo_before_temporal_fix_20260804;

create or replace function public.get_health_score_professor_v3_metricas_periodo(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text, professor_id integer, professor_nome text, unidade_id uuid,
  competencia date, valor_bruto numeric, numerador numeric, denominador numeric,
  amostra integer, estado_base text, publicavel boolean, confianca text,
  fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select b.*
  from public.get_hs_prof_v3_metricas_periodo_before_temporal_fix_20260804(
    p_competencia, p_unidade_id, p_periodicidade
  ) b
  where b.metrica <> 'presenca'

  union all

  select p.*
  from public.get_health_score_professor_v3_presenca_periodo_v2(
    p_competencia, p_unidade_id, p_periodicidade
  ) p;
$function$;

-- No ciclo, carteira e media/turma sao metricas de estado: mostram a
-- fotografia do ultimo mes ja alcancado no recorte. Retencao, permanencia,
-- conversao e presenca continuam com suas semanticas temporais proprias.
alter function public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  date, uuid, uuid, text
) rename to get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804;

create or replace function public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  p_competencia date,
  p_config_id uuid,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text, professor_id integer, professor_nome text, unidade_id uuid,
  competencia date, valor_bruto numeric, numerador numeric, denominador numeric,
  amostra integer, estado_base text, publicavel boolean, confianca text,
  fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb, nota numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_periodo_inicio date;
  v_periodo_fim date;
  v_competencia_fotografia date;
begin
  if p_periodicidade = 'mensal' then
    return query
    select b.*
    from public.get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804(
      p_competencia, p_config_id, p_unidade_id, 'mensal'
    ) b;
    return;
  end if;

  if p_periodicidade <> 'ciclo' then
    raise exception 'HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA: use mensal ou ciclo'
      using errcode = '22023';
  end if;

  select p.periodo_inicio, p.periodo_fim
    into v_periodo_inicio, v_periodo_fim
  from public.fn_health_score_v3_periodo(p_competencia, 'ciclo') p;

  v_competencia_fotografia := date_trunc(
    'month',
    greatest(v_periodo_inicio, least(v_periodo_fim, current_date))
  )::date;

  -- Metricas de fluxo preservam o recorte inteiro: conversao soma
  -- experimentais/matriculas, presenca agrega presentes/classificados,
  -- retencao e permanencia mantem a regra temporal governada do ciclo.
  return query
  select b.*
  from public.get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804(
    p_competencia, p_config_id, p_unidade_id, 'ciclo'
  ) b
  where b.metrica not in ('media_turma', 'numero_alunos')

  union all

  -- Metricas de estado usam somente a fotografia do ultimo mes alcancado.
  select
    b.metrica,
    b.professor_id,
    b.professor_nome,
    b.unidade_id,
    date_trunc('month', p_competencia)::date,
    b.valor_bruto,
    b.numerador,
    b.denominador,
    b.amostra,
    b.estado_base,
    b.publicavel,
    b.confianca,
    b.fonte,
    'health-score-professor-v3-fotografia-fim-recorte-1'::text,
    b.motivo_sem_base,
    coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
      'periodicidade', 'ciclo',
      'semantica_ciclo', 'fotografia_fim_recorte',
      'competencia_fotografia', v_competencia_fotografia,
      'periodo_inicio', v_periodo_inicio,
      'periodo_fim', v_periodo_fim
    ),
    b.nota
  from public.get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804(
    v_competencia_fotografia, p_config_id, p_unidade_id, 'mensal'
  ) b
  where b.metrica in ('media_turma', 'numero_alunos');
end;
$function$;

revoke all on function public.get_health_score_professor_v3_presenca_periodo_v2(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_presenca_periodo_v2(
  date, uuid, text
) to authenticated, service_role;

revoke all on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) to authenticated, service_role;

revoke all on function public.get_hs_prof_v3_metricas_periodo_before_temporal_fix_20260804(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_hs_prof_v3_metricas_periodo_before_temporal_fix_20260804(
  date, uuid, text
) to service_role;

revoke all on function public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  date, uuid, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  date, uuid, uuid, text
) to service_role;

revoke all on function public.get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804(
  date, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804(
  date, uuid, uuid, text
) to service_role;

comment on function public.get_health_score_professor_v3_presenca_periodo_v2(
  date, uuid, text
) is 'Presenca canonica por ocorrencia de aula. Aceita lancamento tardio e impede casamento entre datas diferentes com o mesmo id externo.';

comment on function public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  date, uuid, uuid, text
) is 'Mensal usa a competencia selecionada; ciclo usa fotografia do ultimo mes alcancado para carteira e media por turma.';

commit;
