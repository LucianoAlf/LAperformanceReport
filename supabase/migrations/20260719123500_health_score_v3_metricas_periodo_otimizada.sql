-- Remove os calculos antigos de carteira do caminho critico.
-- Os quatro pilares restantes preservam a implementacao periodica anterior;
-- media/turma e numero de alunos delegam para a fonte canonica homologada.

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

  -- MEDIA/TURMA E NUMERO DE ALUNOS: a fonte homologada resolve o fechamento
  -- auditado no mes encerrado e a jornada canonica no mes aberto.
  return query
  select h.*
  from public.get_health_score_professor_v3_carteira_periodo(
    p_competencia, p_unidade_id, p_periodicidade
  ) h
  where h.metrica = 'media_turma';

  return query
  select h.*
  from public.get_health_score_professor_v3_carteira_periodo(
    p_competencia, p_unidade_id, p_periodicidade
  ) h
  where h.metrica = 'numero_alunos';

  -- RETENCAO ATRIBUIVEL. Motivos exatos; sem similaridade ou inferencia fuzzy.
  -- Desistencia, Desanimo, Insatisfacao e aliases historicos aprovados:
  -- Abandono de Curso -> Desistencia; Perdeu o Interesse -> Desanimo.
  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), periodos as (
    select pe.*
    from public.vw_professor_periodos_efetivos_v3_sombra pe
    join unidades_permitidas up on up.unidade_id = pe.unidade_id
    where pe.professor_id is not null
      and pe.status_periodo <> 'invalidado'
      and (pe.data_inicio at time zone 'America/Sao_Paulo')::date <= v_fim_recorte
      and (
        pe.data_fim is null
        or (pe.data_fim at time zone 'America/Sao_Paulo')::date >= v_inicio
      )
  ), expostos as (
    select pe.professor_id,
      case when p_unidade_id is null then null::uuid else pe.unidade_id end
        as unidade_saida,
      count(distinct pe.periodo_chave) filter (where pe.publicavel)::integer
        as vinculos_expostos,
      count(distinct pe.periodo_chave) filter (where not pe.publicavel)::integer
        as vinculos_revisao
    from periodos pe
    group by pe.professor_id,
      case when p_unidade_id is null then null::uuid else pe.unidade_id end
  ), saidas as (
    select m.professor_id,
      case when p_unidade_id is null then null::uuid else m.unidade_id end
        as unidade_saida,
      count(distinct m.id)::integer as encerramentos_atribuiveis,
      jsonb_agg(distinct jsonb_build_object(
        'movimentacao_id', m.id,
        'motivo_saida_id', m.motivo_saida_id,
        'motivo', coalesce(ms.nome, m.motivo)
      )) as movimentos
    from public.movimentacoes_admin m
    join unidades_permitidas up on up.unidade_id = m.unidade_id
    left join public.motivos_saida ms on ms.id = m.motivo_saida_id
    where lower(m.tipo) in ('evasao', 'nao_renovacao')
      and coalesce(m.mes_saida, m.data, m.competencia_referencia)
        between v_inicio and v_fim_recorte
      and m.professor_id is not null
      and (
        (m.motivo_saida_id in (5, 13, 14) and ms.conta_score_professor is true)
        or upper(btrim(coalesce(m.motivo, ''))) in (
          'DESISTENCIA', 'DESISTÃŠNCIA',
          'DESANIMO', 'DESÃ‚NIMO',
          'INSATISFACAO', 'INSATISFAÃ‡ÃƒO',
          'ABANDONO DE CURSO',
          'PERDEU O INTERESSE'
        )
      )
    group by m.professor_id,
      case when p_unidade_id is null then null::uuid else m.unidade_id end
  ), alvo as (
    select distinct p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
        as unidade_saida
    from periodos p
  )
  select
    'retencao'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(e.vinculos_expostos, 0) > 0 then round(
      greatest(0::numeric, 100 * (
        1 - least(
          coalesce(s.encerramentos_atribuiveis, 0),
          e.vinculos_expostos
        )::numeric / e.vinculos_expostos::numeric
      )), 2
    ) else null end,
    greatest(
      coalesce(e.vinculos_expostos, 0) - least(
        coalesce(s.encerramentos_atribuiveis, 0),
        coalesce(e.vinculos_expostos, 0)
      ), 0
    )::numeric,
    coalesce(e.vinculos_expostos, 0)::numeric,
    coalesce(e.vinculos_expostos, 0),
    case
      when coalesce(e.vinculos_expostos, 0) = 0 then 'sem_base'
      when e.vinculos_expostos < 10 then 'sem_base_amostra'
      when e.vinculos_revisao > 0 then 'revisar'
      else 'ok'
    end,
    coalesce(e.vinculos_expostos, 0) >= 10,
    case
      when coalesce(e.vinculos_expostos, 0) = 0 then 'sem_base'
      when e.vinculos_expostos < 10 then 'baixa_amostra'
      when e.vinculos_revisao > 0 then 'media'
      else 'alta'
    end,
    'vw_professor_periodos_efetivos_v3_sombra+movimentacoes_admin+motivos_saida'::text,
    'health-score-professor-v3-retencao-periodo-1'::text,
    case
      when coalesce(e.vinculos_expostos, 0) = 0 then 'nenhum vinculo exposto no periodo'
      when e.vinculos_expostos < 10 then 'base minima de 10 vinculos expostos nao atingida'
      when e.vinculos_revisao > 0 then 'ha vinculos historicos em revisao, transparentes no diagnostico'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'vinculos_expostos', coalesce(e.vinculos_expostos, 0),
      'vinculos_em_revisao', coalesce(e.vinculos_revisao, 0),
      'encerramentos_atribuiveis', coalesce(s.encerramentos_atribuiveis, 0),
      'movimentos_atribuiveis', coalesce(s.movimentos, '[]'::jsonb),
      'motivos_exatos', jsonb_build_array(
        'Desistencia', 'Desanimo', 'Insatisfacao',
        'Abandono de Curso', 'Perdeu o Interesse'
      ),
      'apta_oficial', p_periodicidade = 'ciclo'
        and v_fim_periodo <= current_date
        and coalesce(e.vinculos_expostos, 0) >= 10
        and coalesce(e.vinculos_revisao, 0) = 0
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join expostos e
    on e.professor_id = a.professor_id
   and e.unidade_saida is not distinct from a.unidade_saida
  left join saidas s
    on s.professor_id = a.professor_id
   and s.unidade_saida is not distinct from a.unidade_saida;

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

comment on function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text) is
  'Seis metricas V3 no recorte mensal ou ciclo fixo. Score parcial usa metas versionadas; fechamento oficial exige detalhes.apta_oficial.';

revoke all on function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  from public, anon;
grant execute on function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  to authenticated, service_role;
