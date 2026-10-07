-- Health Score presenca: grão aula x aluno -> slot canonico (pessoa x inicio)
--
-- CONTEXTO
-- get_health_score_prof_v3_metricas_base_20260728_c95 media esperados e
-- classificados em roster aula x aluno. Com a geminacao turma/individual do
-- Emusys (~97% das individuais tem gêmea turma, as 3 unidades), cada aula real
-- virava ~2 esperados. Pior: a gêmea individual marcada `justificada` nunca
-- classifica (resultado aula_justificada), entao era esperado morto —
-- cobertura de CG em set/2026 marcava 85,7% e 23 professores ficavam
-- `sem_base_cobertura`. Alem disso, presente classificava nas DUAS aulas e a
-- falta humana so na turma → taxa de presenca inflada (CG 82,0% vs 74,3% real).
--
-- CORRECAO (autorizada pelo Fabio/Alf em 05/10):
--   esperados  = roster dedupado a (pessoa x slot), veto POR LINHA
--                (cancelada/justificada exclui so a propria aula);
--   resultado  = vw_presenca_slot_canonica_v1 (v1.2 — resultado do slot ja
--                resolvido pela linha representante);
--   dedup pessoa preserva o or-logico antigo (presente se algum presente;
--   falta se algum falta e nenhum presente).
-- Roster sem linha de presenca (sync atrasado / aluno so-Emusys) segue
-- esperado nao-classificado — fiel ao comportamento anterior.
--
-- Dry-run transacional (funcao real, mensal):
--   set/2026: Barra 2264->1150 esp, cob 95,4->97,0; CG 4085->2120, cob 85,7->92,2;
--             Recreio 3408->1732, cob 97,2->98,3
--   taxa presenca CG set: 82,0 -> 74,3% (bate com a medicao canonica do Fabio, 74,8%)
--   estados CG: 13 prof sem_base_cobertura -> ok; 1 ok -> sem_base_amostra (8<10)
--   out/2026 segue cobertura baixa (~63-79%) — aulas frescas sem chamada, real.
--
-- Tambem genericizado: textos 'Campo Grande ... auditoria' e 'roster esperado'
-- hardcoded viram mensagens calculadas da politica vigente (skill: nunca
-- reproduzir excecao por nome de unidade).

CREATE OR REPLACE FUNCTION public.get_health_score_prof_v3_metricas_base_20260728_c95(p_competencia date, p_unidade_id uuid DEFAULT NULL::uuid, p_periodicidade text DEFAULT 'mensal'::text)
 RETURNS TABLE(metrica text, professor_id integer, professor_nome text, unidade_id uuid, competencia date, valor_bruto numeric, numerador numeric, denominador numeric, amostra integer, estado_base text, publicavel boolean, confianca text, fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
            nullif((case when r.emusys_lead_id_zero then '0' else r.emusys_lead_id::text end), '') ~ '^[0-9]+$'
            and le.emusys_lead_id = ((case when r.emusys_lead_id_zero then '0' else r.emusys_lead_id::text end))::bigint
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
  ), roster_slot as (
    -- esperados no grao canonico (pessoa x slot): a gêmea turma/individual do
    -- Emusys vira 1 evento só; o veto vale por linha (cancelada/justificada
    -- exclui so a propria aula, nao a gêmea viva — mesma regra do slot v1.2)
    select distinct
      ae.professor_id,
      ae.unidade_id,
      ae.data_hora_inicio,
      ae.data_hora_fim,
      lower(btrim(coalesce(ae.curso_nome, ''))) as curso_chave,
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
      and not coalesce(ae.cancelada, false)
      and not coalesce(ae.justificada, false)
      and lower(coalesce(ae.categoria, 'normal')) = 'normal'
      and coalesce(ae.sem_acompanhamento, false) = false
  ), canonica as (
    -- resultado pedagogico resolvido por slot (v1.2): 1 linha por (aluno x slot);
    -- quem nao tem linha de presenca ainda nao classifica — vira esperado sem
    -- resposta, igual ao comportamento anterior
    select
      sc.unidade_id,
      sc.professor_id,
      sc.data_hora_inicio,
      sc.data_hora_fim,
      lower(btrim(coalesce(sc.curso_nome, ''))) as curso_chave,
      coalesce(il.pessoa_chave, 'local:' || sc.aluno_id::text) as pessoa_chave,
      sc.resultado_pedagogico
    from public.vw_presenca_slot_canonica_v1 sc
    join unidades_permitidas up on up.unidade_id = sc.unidade_id
    left join identidade_local il
      on il.unidade_id = sc.unidade_id and il.aluno_id = sc.aluno_id
    where sc.data_aula between v_inicio and v_fim_recorte
      and sc.professor_id is not null
  ), eventos as (
    select
      r.professor_id,
      r.unidade_id,
      r.data_hora_inicio,
      r.data_hora_fim,
      r.curso_chave,
      r.pessoa_chave,
      bool_or(r.exige_revisao) as exige_revisao,
      bool_or(c.resultado_pedagogico = 'presente') as presente,
      bool_or(c.resultado_pedagogico = 'falta_confirmada') as falta_confirmada
    from roster_slot r
    left join canonica c
      on c.unidade_id = r.unidade_id
     and c.professor_id = r.professor_id
     and c.data_hora_inicio = r.data_hora_inicio
     and c.data_hora_fim = r.data_hora_fim
     and c.curso_chave = r.curso_chave
     and c.pessoa_chave = r.pessoa_chave
    where r.pessoa_chave is not null
    group by r.professor_id, r.unidade_id, r.data_hora_inicio, r.data_hora_fim,
      r.curso_chave, r.pessoa_chave
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
    'aula_alunos_emusys(dedup slot)+vw_presenca_slot_canonica_v1+presenca_politicas_confiabilidade'::text,
    'health-score-professor-v3-presenca-slot-20261005'::text,
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0
        then 'unidade em auditoria operacional, fora do Health Score'
      when coalesce(s.esperados_confiaveis, 0) = 0 then 'nenhum evento confiavel no periodo'
      when s.classificados_confiaveis < 10 then 'base minima de 10 eventos nao atingida'
      when s.classificados_confiaveis::numeric / s.esperados_confiaveis < 0.95
        then 'cobertura semantica inferior a 95% dos slots esperados'
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
      'unidades_pontuaveis', (
        select coalesce(jsonb_agg(u2.nome order by u2.nome), '[]'::jsonb)
        from public.unidades u2
        where exists (
          select 1 from public.presenca_politicas_confiabilidade p2
          where p2.unidade_id = u2.id and p2.ativa
            and not coalesce(p2.exige_revisao_operacional, false)
            and v_fim_recorte between p2.data_inicio and p2.data_fim
        )
      ),
      'unidades_em_auditoria', (
        select coalesce(jsonb_agg(u2.nome order by u2.nome), '[]'::jsonb)
        from public.unidades u2
        where exists (
          select 1 from public.presenca_politicas_confiabilidade p2
          where p2.unidade_id = u2.id and p2.ativa
            and coalesce(p2.exige_revisao_operacional, false)
            and v_fim_recorte between p2.data_inicio and p2.data_fim
        )
      ),
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
$function$;
CREATE OR REPLACE FUNCTION public.get_health_score_prof_v3_metricas_base_20260728(p_competencia date, p_unidade_id uuid DEFAULT NULL::uuid, p_periodicidade text DEFAULT 'mensal'::text)
 RETURNS TABLE(metrica text, professor_id integer, professor_nome text, unidade_id uuid, competencia date, valor_bruto numeric, numerador numeric, denominador numeric, amostra integer, estado_base text, publicavel boolean, confianca text, fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_cobertura_minima constant numeric := 0.90;
begin
  return query
  with base as (
    select b.*
    from public.get_health_score_prof_v3_metricas_base_20260728_c95(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    ) b
  ),
  normalizada as (
    select
      b.*,
      coalesce(
        (b.detalhes ->> 'eventos_esperados_confiaveis')::integer,
        0
      ) as esperados_confiaveis,
      coalesce(
        (b.detalhes ->> 'eventos_classificados_confiaveis')::integer,
        b.amostra,
        0
      ) as classificados_confiaveis,
      coalesce(
        (b.detalhes ->> 'eventos_esperados_auditoria')::integer,
        0
      ) as esperados_auditoria
    from base b
  ),
  avaliada as (
    select
      n.*,
      case
        when n.esperados_confiaveis > 0 then
          n.classificados_confiaveis::numeric
            / n.esperados_confiaveis::numeric
        else null::numeric
      end as cobertura_fracao
    from normalizada n
  )
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
    case
      when a.metrica <> 'presenca' then a.estado_base
      when a.esperados_confiaveis = 0
        and a.esperados_auditoria > 0 then 'em_auditoria'
      when a.esperados_confiaveis = 0 then 'sem_base'
      when a.classificados_confiaveis < 10 then 'sem_base_amostra'
      when a.cobertura_fracao < v_cobertura_minima
        then 'sem_base_cobertura'
      else 'ok'
    end::text as estado_base,
    case
      when a.metrica <> 'presenca' then a.publicavel
      else a.classificados_confiaveis >= 10
        and a.esperados_confiaveis > 0
        and a.cobertura_fracao >= v_cobertura_minima
    end as publicavel,
    case
      when a.metrica <> 'presenca' then a.confianca
      when a.esperados_confiaveis = 0
        and a.esperados_auditoria > 0 then 'auditoria'
      when a.esperados_confiaveis = 0 then 'sem_base'
      when a.classificados_confiaveis < 10
        or a.cobertura_fracao < v_cobertura_minima then 'baixa'
      else 'alta'
    end::text as confianca,
    a.fonte,
    case
      when a.metrica = 'presenca'
        then 'health-score-professor-v3-presenca-cobertura-90-1'
      else a.regra_versao
    end::text as regra_versao,
    case
      when a.metrica <> 'presenca' then a.motivo_sem_base
      when a.esperados_confiaveis = 0
        and a.esperados_auditoria > 0
        then 'unidade em auditoria operacional, fora do Health Score'
      when a.esperados_confiaveis = 0
        then 'nenhum evento confiavel no periodo'
      when a.classificados_confiaveis < 10
        then 'base minima de 10 eventos nao atingida'
      when a.cobertura_fracao < v_cobertura_minima
        then 'cobertura semantica inferior a 90% dos slots esperados'
      else null::text
    end as motivo_sem_base,
    case
      when a.metrica <> 'presenca' then a.detalhes
      else coalesce(a.detalhes, '{}'::jsonb) || jsonb_build_object(
        'cobertura_minima_percentual', 90,
        'regra_cobertura',
          'health-score-professor-v3-presenca-cobertura-90-1',
        'apta_oficial',
          p_periodicidade = 'ciclo'
          and coalesce(
            (a.detalhes ->> 'periodo_fim')::date,
            date '9999-12-31'
          ) <= current_date
          and a.classificados_confiaveis >= 10
          and a.esperados_confiaveis > 0
          and a.cobertura_fracao >= v_cobertura_minima
      )
    end as detalhes
  from avaliada a;
end;
$function$;
