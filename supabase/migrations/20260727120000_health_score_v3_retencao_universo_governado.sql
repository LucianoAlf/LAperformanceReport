-- Health Score Professor V3 - universo governado de retencao.
-- Numerador, denominador e pendencias partem dos mesmos periodos efetivos.

create or replace function public.get_professor_retencao_v3_governada(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
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
as $retencao$
with params as (
  select
    date_trunc('month', p_competencia)::date as competencia,
    periodo.periodo_inicio,
    periodo.periodo_fim,
    least(
      periodo.periodo_fim,
      (
        date_trunc('month', p_competencia)
        + interval '1 month - 1 day'
      )::date,
      current_date
    ) as fim_recorte,
    periodo.ciclo_codigo
  from public.fn_health_score_v3_periodo(
    p_competencia,
    p_periodicidade
  ) periodo
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), periodos as (
  select pe.*
  from public.vw_professor_periodos_efetivos_v3_sombra pe
  join unidades_permitidas up on up.unidade_id = pe.unidade_id
  cross join params p
  where pe.professor_id is not null
    and pe.status_periodo <> 'invalidado'
    and (pe.data_inicio at time zone 'America/Sao_Paulo')::date
      <= p.fim_recorte
    and (
      pe.data_fim is null
      or (pe.data_fim at time zone 'America/Sao_Paulo')::date
        >= p.periodo_inicio
    )
), estatisticas as (
  select
    pe.professor_id,
    case
      when p_unidade_id is null then null::uuid
      else pe.unidade_id
    end as unidade_saida,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel is true
    )::integer as vinculos_expostos_limpos,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel is false
    )::integer as vinculos_em_revisao,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel is true
        and (pe.data_fim at time zone 'America/Sao_Paulo')::date
          between p.periodo_inicio and p.fim_recorte
        and (
          (
            (pe.data_fim at time zone 'America/Sao_Paulo')::date
              < date '2026-08-03'
            and pe.status_periodo = 'encerrado'
          )
          or (
            (pe.data_fim at time zone 'America/Sao_Paulo')::date
              >= date '2026-08-03'
            and pe.status_periodo = 'encerrado'
            and pe.atribuicao_confirmada is true
            and pe.conta_retencao_professor is true
            and ms.conta_score_professor is true
          )
        )
    )::integer as encerramentos_penalizadores,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel is true
        and pe.status_periodo = 'encerrado'
        and (pe.data_fim at time zone 'America/Sao_Paulo')::date
          between greatest(p.periodo_inicio, date '2026-08-03')
          and p.fim_recorte
        and (
          pe.atribuicao_confirmada is not true
          or pe.motivo_saida_id is null
          or ms.id is null
          or ms.conta_score_professor is null
          or pe.conta_retencao_professor is null
          or pe.conta_retencao_professor
            is distinct from ms.conta_score_professor
        )
    )::integer as encerramentos_pos_corte_pendentes
  from periodos pe
  cross join params p
  left join public.motivos_saida ms on ms.id = pe.motivo_saida_id
  group by
    pe.professor_id,
    case
      when p_unidade_id is null then null::uuid
      else pe.unidade_id
    end
), calculos as (
  select
    e.*,
    e.vinculos_em_revisao + e.encerramentos_pos_corte_pendentes
      as pendencias_total
  from estatisticas e
)
select
  c.professor_id,
  pr.nome::text as professor_nome,
  c.unidade_saida as unidade_id,
  p.competencia,
  case
    when c.vinculos_expostos_limpos > 0 then round(
      100 * (
        1
        - c.encerramentos_penalizadores::numeric
          / c.vinculos_expostos_limpos::numeric
      ),
      2
    )
    else null
  end as valor_bruto,
  greatest(
    c.vinculos_expostos_limpos - c.encerramentos_penalizadores,
    0
  )::numeric as numerador,
  c.vinculos_expostos_limpos::numeric as denominador,
  c.vinculos_expostos_limpos as amostra,
  case
    when c.vinculos_expostos_limpos = 0 then 'sem_base'
    when c.vinculos_expostos_limpos < 10 then 'sem_base_amostra'
    when c.vinculos_expostos_limpos >= 10
      and c.vinculos_em_revisao > 0 then 'ok_com_pendencias'
    when c.vinculos_expostos_limpos >= 10
      and c.encerramentos_pos_corte_pendentes > 0 then 'ok_com_pendencias'
    when c.vinculos_expostos_limpos >= 10 then 'ok'
  end as estado_base,
  (
    c.vinculos_expostos_limpos >= 10
  ) as publicavel,
  case
    when c.vinculos_expostos_limpos = 0 then 'sem_base'
    when c.vinculos_expostos_limpos < 10 then 'baixa_amostra'
    when c.pendencias_total > 0 then 'media'
    else 'alta'
  end as confianca,
  'vw_professor_periodos_efetivos_v3_sombra'::text as fonte,
  'health-score-professor-v3-retencao-governada-1'::text as regra_versao,
  case
    when c.vinculos_expostos_limpos = 0 then
      'nenhum vinculo publicavel exposto no periodo'
    when c.vinculos_expostos_limpos < 10 then
      'base minima de 10 vinculos expostos nao atingida'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'periodicidade', p_periodicidade,
    'periodo_inicio', p.periodo_inicio,
    'periodo_fim', p.periodo_fim,
    'fim_recorte', p.fim_recorte,
    'ciclo_codigo', p.ciclo_codigo,
    'data_corte', date '2026-08-03',
    'modo_pre_corte', 'todos_encerramentos',
    'modo_pos_corte', 'somente_atribuicao_confirmada_e_motivo_atribuivel',
    'vinculos_expostos_limpos', c.vinculos_expostos_limpos,
    'vinculos_em_revisao', c.vinculos_em_revisao,
    'encerramentos_pos_corte_pendentes',
      c.encerramentos_pos_corte_pendentes,
    'encerramentos_penalizadores', c.encerramentos_penalizadores,
    'apta_oficial', (
      p_periodicidade = 'ciclo'
      and p.periodo_fim <= current_date
      and c.vinculos_expostos_limpos >= 10
      and c.pendencias_total = 0
    )
  ) as detalhes
from calculos c
join public.professores pr on pr.id = c.professor_id
cross join params p
order by pr.nome, c.unidade_saida;
$retencao$;

revoke all on function
  public.get_professor_retencao_v3_governada(date, uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.get_professor_retencao_v3_governada(date, uuid, text)
  to service_role;

comment on function
  public.get_professor_retencao_v3_governada(date, uuid, text) is
  'Retencao V3 por universo unico: periodos efetivos governam exposicao, encerramentos e pendencias.';

create or replace function public.get_health_score_professor_v3_metricas_periodo(
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
as $$
#variable_conflict use_column
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
  v_label text;
  v_meses_esperados integer;
  v_config_id uuid;
begin
  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo, p.periodo_label
    into v_inicio, v_fim_periodo, v_codigo, v_label
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade) p;

  v_fim_recorte := least(
    v_fim_periodo,
    (v_competencia + interval '1 month - 1 day')::date,
    current_date
  );
  v_meses_esperados := case when p_periodicidade = 'ciclo' then 3 else 1 end;


  select c.id
    into v_config_id
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and v_competencia >= c.vigencia_inicio
    and (c.vigencia_fim is null or v_competencia <= c.vigencia_fim)
  order by c.versao desc
  limit 1;

  -- CONVERSAO EXPERIMENTAL -> MATRICULA
  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), raw_vinculado as (
    select
      r.*,
      coalesce(r.aluno_id, vinculo.aluno_id) as aluno_id_resolvido,
      coalesce(
        r.emusys_aula_id::text,
        r.aula_emusys_id::text,
        'raw:' || r.id::text
      ) as evento_chave
    from public.emusys_experimentais_raw r
    join unidades_permitidas up on up.unidade_id = r.unidade_id
    left join lateral (
      select coalesce(le.aluno_id, l.aluno_id, a_origem.id) as aluno_id
      from public.lead_experimentais le
      left join public.leads l on l.id = le.lead_id
      left join public.alunos a_origem
        on a_origem.lead_origem_id = le.lead_id
       and a_origem.unidade_id = le.unidade_id
      where le.unidade_id = r.unidade_id
        and le.data_experimental = r.data_aula
        and (
          le.id = r.lead_experimental_id
          or (r.lead_id is not null and le.lead_id = r.lead_id)
          or (
            nullif(r.payload #>> '{aluno,id_lead}', '') ~ '^[0-9]+$'
            and le.emusys_lead_id = (r.payload #>> '{aluno,id_lead}')::bigint
          )
        )
      order by
        (le.id = r.lead_experimental_id) desc,
        (le.professor_experimental_id = r.professor_id) desc,
        le.id desc
      limit 1
    ) vinculo on true
    where r.data_aula between v_inicio and v_fim_recorte
      and r.professor_id is not null
      and r.situacao_operacional in ('presente', 'matriculado')
  ), experimentais as (
    select distinct on (r.unidade_id, r.evento_chave)
      r.unidade_id,
      r.professor_id,
      r.evento_chave,
      r.data_aula,
      i.pessoa_chave
    from raw_vinculado r
    left join public.vw_aluno_identidade_unidade_canonica i
      on i.unidade_id = r.unidade_id
     and r.aluno_id_resolvido = any(i.aluno_ids_locais)
    order by r.unidade_id, r.evento_chave, r.id desc
  ), matriculas as (
    select distinct
      a.unidade_id,
      coalesce(nullif(a.emusys_matricula_id, ''), 'local:' || a.id::text)
        as matricula_chave,
      i.pessoa_chave,
      a.data_matricula
    from public.alunos a
    join unidades_permitidas up on up.unidade_id = a.unidade_id
    left join public.vw_aluno_identidade_unidade_canonica i
      on i.unidade_id = a.unidade_id
     and a.id = any(i.aluno_ids_locais)
    where a.data_matricula between v_inicio
      and least(v_fim_periodo + 30, current_date)
      and lower(coalesce(a.status, '')) <> 'excluido'
  ), candidatos as (
    select
      m.unidade_id,
      m.matricula_chave,
      m.data_matricula,
      e.professor_id,
      e.evento_chave,
      e.data_aula,
      row_number() over (
        partition by m.unidade_id, m.matricula_chave
        order by e.data_aula desc, e.evento_chave desc
      ) as ordem_matricula
    from matriculas m
    join experimentais e
      on e.unidade_id = m.unidade_id
     and e.pessoa_chave = m.pessoa_chave
     and m.data_matricula between e.data_aula and e.data_aula + 30
    where m.pessoa_chave is not null
  ), candidatos_unicos as (
    select c.*,
      row_number() over (
        partition by c.unidade_id, c.evento_chave
        order by c.data_matricula, c.matricula_chave
      ) as ordem_experimental
    from candidatos c
    where c.ordem_matricula = 1
  ), creditos as (
    select c.* from candidatos_unicos c where c.ordem_experimental = 1
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
    from experimentais e
  ), estatisticas as (
    select e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      count(distinct e.evento_chave)::integer as experimentais,
      count(distinct e.evento_chave) filter (where e.pessoa_chave is null)::integer
        as sem_identidade
    from experimentais e
    group by e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
  ), conversoes as (
    select c.professor_id,
      case when p_unidade_id is null then null::uuid else c.unidade_id end
        as unidade_saida,
      count(distinct c.matricula_chave)::integer as matriculas
    from creditos c
    group by c.professor_id,
      case when p_unidade_id is null then null::uuid else c.unidade_id end
  )
  select
    'conversao'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(e.experimentais, 0) > 0 then round(
      least(coalesce(c.matriculas, 0), e.experimentais)::numeric
      / e.experimentais::numeric * 100, 2
    ) else null end,
    least(coalesce(c.matriculas, 0), coalesce(e.experimentais, 0))::numeric,
    coalesce(e.experimentais, 0)::numeric,
    coalesce(e.experimentais, 0),
    case
      when coalesce(e.experimentais, 0) = 0 then 'sem_base'
      when e.experimentais < 3 then 'sem_base_amostra'
      when e.sem_identidade > 0 then 'revisar'
      when current_date < v_fim_periodo + 30 then 'em_maturacao'
      else 'ok'
    end,
    coalesce(e.experimentais, 0) >= 3 and coalesce(e.sem_identidade, 0) = 0,
    case
      when coalesce(e.experimentais, 0) = 0 then 'sem_base'
      when e.sem_identidade > 0 then 'media'
      when current_date < v_fim_periodo + 30 then 'provisoria'
      else 'alta'
    end,
    'emusys_experimentais_raw+vw_aluno_identidade_unidade_canonica+alunos'::text,
    'health-score-professor-v3-conversao-periodo-1'::text,
    case
      when coalesce(e.experimentais, 0) = 0 then 'nenhuma experimental confirmada no periodo'
      when e.experimentais < 3 then 'base minima de 3 experimentais nao atingida'
      when e.sem_identidade > 0 then 'ha experimentais sem pessoa canonica resolvida'
      when current_date < v_fim_periodo + 30 then 'janela D+30 ainda em maturacao'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'experimentais_confirmadas', coalesce(e.experimentais, 0),
      'matriculas_creditadas', least(coalesce(c.matriculas, 0), coalesce(e.experimentais, 0)),
      'experimentais_sem_identidade', coalesce(e.sem_identidade, 0),
      'regra_credito', 'uma matricula por experimental; ultima experimental anterior em ate 30 dias',
      'apta_oficial', p_periodicidade = 'ciclo'
        and current_date >= v_fim_periodo + 30
        and coalesce(e.experimentais, 0) >= 3
        and coalesce(e.sem_identidade, 0) = 0
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join estatisticas e
    on e.professor_id = a.professor_id
   and e.unidade_saida is not distinct from a.unidade_saida
  left join conversoes c
    on c.professor_id = a.professor_id
   and c.unidade_saida is not distinct from a.unidade_saida;

  -- MEDIA/TURMA E NUMERO DE ALUNOS: metas exatas por segmento.
  -- A nota ja vem da soma dos componentes; valor_bruto continua separado.
  if coalesce(current_setting(
    'app.health_score_v3_segmentos_precarregados',
    true
  ), 'off') <> 'on' then
    return query
    select
      a.metrica,
      a.professor_id,
      a.professor_nome,
      a.unidade_id,
      a.competencia,
      a.valor_bruto,
      a.numerador,
      a.denominador,
      a.amostra,
      a.estado_base,
      a.publicavel,
      a.confianca,
      a.fonte,
      a.regra_versao,
      a.motivo_sem_base,
      a.detalhes
    from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
      p_competencia,
      v_config_id,
      p_unidade_id,
      p_periodicidade
    ) a;
  end if;

  -- RETENCAO ATRIBUIVEL. Motivos exatos; sem similaridade ou inferencia fuzzy.
  return query
  select
    'retencao'::text,
    r.professor_id,
    r.professor_nome,
    r.unidade_id,
    r.competencia,
    r.valor_bruto,
    r.numerador,
    r.denominador,
    r.amostra,
    r.estado_base,
    r.estado_base in ('ok', 'ok_com_pendencias') as publicavel,
    r.confianca,
    r.fonte,
    r.regra_versao,
    r.motivo_sem_base,
    r.detalhes
  from public.get_professor_retencao_v3_governada(
    p_competencia,
    p_unidade_id,
    p_periodicidade
  ) r;

  -- PERMANENCIA COM O PROFESSOR: historico acumulado, somente vinculos encerrados.
  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), periodos as (
    select pe.*
    from public.vw_professor_periodos_efetivos_v3_sombra pe
    join unidades_permitidas up on up.unidade_id = pe.unidade_id
    where pe.professor_id is not null
      and (pe.data_inicio at time zone 'America/Sao_Paulo')::date <= v_fim_recorte
      and pe.status_periodo <> 'invalidado'
  ), elegiveis as (
    select p.*
    from periodos p
    where p.status_periodo = 'encerrado'
      and p.elegivel_permanencia
      and p.publicavel
      and p.confianca in ('alta', 'revisado_aprovado')
      and (p.data_fim at time zone 'America/Sao_Paulo')::date <= v_fim_recorte
  ), stats as (
    select e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      sum(e.duracao_meses) as soma_meses,
      avg(e.duracao_meses) as media_meses,
      percentile_cont(0.5) within group (order by e.duracao_meses) as mediana_meses,
      count(*)::integer as vinculos
    from elegiveis e
    group by e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
  ), diagnostico as (
    select p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
        as unidade_saida,
      count(*) filter (
        where p.status_periodo = 'encerrado' and not p.elegivel_permanencia
      )::integer as abaixo_quatro_meses,
      count(*) filter (
        where p.status_periodo = 'encerrado'
          and p.elegivel_permanencia
          and (not p.publicavel or p.confianca not in ('alta', 'revisado_aprovado'))
      )::integer as em_revisao,
      bool_or(p.inicio_incompleto) as historico_incompleto,
      count(*) filter (where p.status_periodo = 'ativo')::integer as ativos
    from periodos p
    group by p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
  ), alvo as (
    select distinct p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
        as unidade_saida
    from periodos p
  )
  select
    'permanencia'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(s.vinculos, 0) > 0 then round(s.media_meses, 2) else null end,
    coalesce(s.soma_meses, 0)::numeric,
    coalesce(s.vinculos, 0)::numeric,
    coalesce(s.vinculos, 0),
    case
      when coalesce(s.vinculos, 0) = 0 then 'sem_base'
      when s.vinculos < 3 then 'sem_base_amostra'
      when coalesce(d.em_revisao, 0) > 0 or coalesce(d.historico_incompleto, false)
        then 'parcial_auditavel'
      else 'ok'
    end,
    coalesce(s.vinculos, 0) >= 3,
    case
      when coalesce(s.vinculos, 0) = 0 then 'sem_base'
      when s.vinculos < 3 then 'baixa_amostra'
      when coalesce(d.em_revisao, 0) > 0 or coalesce(d.historico_incompleto, false)
        then 'media'
      else 'alta'
    end,
    'vw_professor_periodos_efetivos_v3_sombra'::text,
    'health-score-professor-v3-permanencia-periodo-1'::text,
    case
      when coalesce(s.vinculos, 0) = 0 then 'nenhum vinculo encerrado elegivel no historico'
      when s.vinculos < 3 then 'pontuacao exige ao menos 3 vinculos encerrados elegiveis'
      when coalesce(d.em_revisao, 0) > 0 or coalesce(d.historico_incompleto, false)
        then 'valor parcial auditavel; exclusoes historicas permanecem visiveis'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'escopo_temporal', 'historico_acumulado_ate_competencia',
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'media_meses', case when coalesce(s.vinculos, 0) > 0 then round(s.media_meses, 2) end,
      'mediana_auxiliar_meses', case when coalesce(s.vinculos, 0) > 0
        then round(s.mediana_meses::numeric, 2) end,
      'vinculos_encerrados_elegiveis', coalesce(s.vinculos, 0),
      'excluidos_abaixo_quatro_meses', coalesce(d.abaixo_quatro_meses, 0),
      'vinculos_em_revisao', coalesce(d.em_revisao, 0),
      'historico_incompleto', coalesce(d.historico_incompleto, false),
      'vinculos_ativos_fora_da_media', coalesce(d.ativos, 0),
      'transparencia_exclusao', 'vinculos menores que 4 meses permanecem no historico, fora da media',
      'apta_oficial', coalesce(s.vinculos, 0) >= 3
        and coalesce(d.em_revisao, 0) = 0
        and not coalesce(d.historico_incompleto, false)
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join stats s
    on s.professor_id = a.professor_id
   and s.unidade_saida is not distinct from a.unidade_saida
  left join diagnostico d
    on d.professor_id = a.professor_id
   and d.unidade_saida is not distinct from a.unidade_saida;

  -- PRESENCA DOS ALUNOS. A politica decide se o evento e pontuavel.
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
      r.pessoa_chave,
      r.exige_revisao,
      s.presente,
      s.falta_confirmada
    from roster r
    left join semantica s
      on s.professor_id = r.professor_id
     and s.unidade_id = r.unidade_id
     and s.aula_emusys_id = r.aula_id
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
    'health-score-professor-v3-presenca-periodo-1'::text,
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0
        then 'Campo Grande permanece em auditoria e fora do Health Score'
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
      'unidades_pontuaveis', jsonb_build_array('Barra', 'Recreio'),
      'unidade_excluida', 'Campo Grande',
      'exige_revisao_operacional', coalesce(s.esperados_auditoria, 0) > 0,
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
$$;
comment on function
  public.get_health_score_professor_v3_metricas_periodo(date, uuid, text) is
  'Seis metricas V3; retencao usa universo unico de periodos efetivos e as demais preservam a base anterior.';

revoke all on function
  public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  from public, anon;
grant execute on function
  public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  to authenticated, service_role;
