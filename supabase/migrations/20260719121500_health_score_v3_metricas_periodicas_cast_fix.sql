-- Correcao versionada: professor_nome precisa ser text em todos os RETURN QUERY.
-- Reaplica a migracao de forma idempotente para substituir as funcoes no remoto.
-- Health Score Professor V3 - metricas mensais e por ciclo fixo.
-- Fontes canonicas: identidade, periodos pedagogicos, movimentos administrativos,
-- experimentais conciliadas, roster e presenca semantica.

-- A politica permanece configuracao de negocio, nunca hardcode no consumidor.
-- Barra e Recreio: presenca confiavel. Campo Grande: valor observado em auditoria,
-- excluido do score ate nova decisao versionada.
insert into public.presenca_politicas_confiabilidade (
  unidade_id,
  data_inicio,
  data_fim,
  ausencia_emusys_resultado,
  exige_revisao_operacional,
  decidido_em,
  decidido_por,
  evidencia,
  regra_versao,
  ativa
)
select
  u.id,
  date '2026-08-01',
  date '2099-12-31',
  'falta_confirmada',
  u.nome = 'Campo Grande',
  date '2026-07-19',
  'Alf',
  case
    when u.nome = 'Campo Grande' then
      'Presenca visivel em auditoria e fora do Health Score ate nivelamento operacional.'
    else
      'Lancamento diario de presenca confirmado pela direcao; ausencia Emusys representa falta.'
  end,
  'presenca-politica-unidades-20260719-v2',
  true
from public.unidades u
where u.nome in ('Barra', 'Recreio', 'Campo Grande')
  and not exists (
    select 1
    from public.presenca_politicas_confiabilidade p
    where p.unidade_id = u.id
      and p.regra_versao = 'presenca-politica-unidades-20260719-v2'
  );

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

  -- MEDIA DE ALUNOS POR TURMA
  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), roster as (
    select
      ae.professor_id,
      ae.unidade_id,
      date_trunc('month', ae.data_aula)::date as mes,
      coalesce(
        ie.pessoa_chave,
        il.pessoa_chave,
        case when aa.aluno_emusys_id is not null
          then 'emusys:' || aa.aluno_emusys_id::text end,
        case when aa.aluno_id is not null then 'local:' || aa.aluno_id::text end
      ) as pessoa_chave,
      case
        when nullif(btrim(ae.turma_nome), '') is not null then
          ae.unidade_id::text || ':turma:'
          || coalesce(ae.curso_emusys_id::text, lower(btrim(ae.curso_nome)))
          || ':' || lower(btrim(ae.turma_nome))
        when ae.matricula_disciplina_id is not null
          and ae.matricula_disciplina_id > 0 then
          ae.unidade_id::text || ':individual:' || ae.matricula_disciplina_id::text
        else null
      end as turma_chave,
      c.id is not null as curso_mapeado,
      coalesce(c.is_projeto_banda, false) as projeto_banda,
      ie.pessoa_chave is null and il.pessoa_chave is null as identidade_fallback
    from public.aulas_emusys ae
    join unidades_permitidas up on up.unidade_id = ae.unidade_id
    join public.aula_alunos_emusys aa on aa.aula_emusys_id = ae.id
    left join public.vw_aluno_identidade_unidade_canonica ie
      on ie.unidade_id = ae.unidade_id
     and ie.emusys_aluno_id = aa.aluno_emusys_id
    left join public.vw_aluno_identidade_unidade_canonica il
      on il.unidade_id = ae.unidade_id
     and aa.aluno_id = any(il.aluno_ids_locais)
    left join public.curso_emusys_depara d
      on d.unidade_id = ae.unidade_id
     and d.emusys_disciplina_id = ae.curso_emusys_id
    left join public.cursos c on c.id = d.curso_id
    where ae.data_aula between v_inicio and v_fim_recorte
      and ae.professor_id is not null
      and ae.cancelada = false
      and lower(coalesce(ae.categoria, 'normal')) = 'normal'
      and coalesce(ae.sem_acompanhamento, false) = false
  ), elegiveis as (
    select distinct r.*
    from roster r
    where r.pessoa_chave is not null
      and r.turma_chave is not null
      and not r.projeto_banda
  ), mensais as (
    select e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      e.mes,
      count(distinct (e.pessoa_chave, e.turma_chave))::integer as ocupacoes,
      count(distinct e.turma_chave)::integer as turmas
    from elegiveis e
    group by e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end,
      e.mes
  ), stats as (
    select m.professor_id, m.unidade_saida,
      sum(m.ocupacoes)::integer as ocupacoes,
      sum(m.turmas)::integer as turmas,
      count(distinct m.mes)::integer as meses
    from mensais m
    group by m.professor_id, m.unidade_saida
  ), problemas as (
    select r.professor_id,
      case when p_unidade_id is null then null::uuid else r.unidade_id end
        as unidade_saida,
      count(*) filter (where r.pessoa_chave is null)::integer as sem_identidade,
      count(*) filter (where r.turma_chave is null)::integer as sem_turma,
      count(*) filter (where not r.curso_mapeado)::integer as curso_sem_depara,
      count(*) filter (where r.identidade_fallback)::integer as fallback_identidade
    from roster r
    where not r.projeto_banda
    group by r.professor_id,
      case when p_unidade_id is null then null::uuid else r.unidade_id end
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
    from elegiveis e
  )
  select
    'media_turma'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(s.turmas, 0) > 0
      then round(s.ocupacoes::numeric / s.turmas::numeric, 2) else null end,
    coalesce(s.ocupacoes, 0)::numeric,
    coalesce(s.turmas, 0)::numeric,
    coalesce(s.ocupacoes, 0),
    case
      when coalesce(s.turmas, 0) = 0 then 'sem_base'
      when coalesce(pb.sem_identidade, 0) + coalesce(pb.sem_turma, 0) > 0 then 'revisar'
      when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados then 'provisorio'
      else 'ok'
    end,
    coalesce(s.turmas, 0) > 0
      and coalesce(pb.sem_identidade, 0) + coalesce(pb.sem_turma, 0) = 0,
    case
      when coalesce(s.turmas, 0) = 0 then 'sem_base'
      when coalesce(pb.sem_identidade, 0) + coalesce(pb.sem_turma, 0) > 0 then 'media'
      when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados then 'provisoria'
      else 'alta'
    end,
    'aulas_emusys+aula_alunos_emusys+vw_aluno_identidade_unidade_canonica'::text,
    'health-score-professor-v3-media-turma-periodo-1'::text,
    case
      when coalesce(s.turmas, 0) = 0 then 'nenhuma turma regular elegivel no periodo'
      when coalesce(pb.sem_identidade, 0) + coalesce(pb.sem_turma, 0) > 0
        then 'ha eventos sem identidade ou turma estavel'
      when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados
        then 'ciclo ainda nao possui tres fechamentos mensais'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'ocupacoes_unicas', coalesce(s.ocupacoes, 0),
      'turmas_regulares', coalesce(s.turmas, 0),
      'meses_com_base', coalesce(s.meses, 0),
      'meses_esperados', v_meses_esperados,
      'sem_identidade', coalesce(pb.sem_identidade, 0),
      'sem_turma_estavel', coalesce(pb.sem_turma, 0),
      'curso_sem_depara', coalesce(pb.curso_sem_depara, 0),
      'fallback_identidade', coalesce(pb.fallback_identidade, 0),
      'agregacao', 'soma_ocupacoes_sobre_soma_turmas',
      'apta_oficial', p_periodicidade = 'ciclo'
        and coalesce(s.meses, 0) = 3
        and coalesce(pb.sem_identidade, 0) + coalesce(pb.sem_turma, 0)
          + coalesce(pb.curso_sem_depara, 0) = 0
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join stats s
    on s.professor_id = a.professor_id
   and s.unidade_saida is not distinct from a.unidade_saida
  left join problemas pb
    on pb.professor_id = a.professor_id
   and pb.unidade_saida is not distinct from a.unidade_saida;

  -- NUMERO DE ALUNOS: pessoa canonica no fechamento de cada mes.
  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), meses as (
    select
      gs::date as mes,
      least((gs + interval '1 month - 1 day')::date, current_date) as fechamento
    from generate_series(
      v_inicio::timestamp,
      date_trunc('month', v_fim_recorte)::timestamp,
      interval '1 month'
    ) gs
  ), periodos as (
    select pe.*
    from public.vw_professor_periodos_efetivos_v3_sombra pe
    join unidades_permitidas up on up.unidade_id = pe.unidade_id
    where pe.professor_id is not null
      and pe.status_periodo <> 'invalidado'
  ), fechamentos as (
    select pe.professor_id,
      case when p_unidade_id is null then null::uuid else pe.unidade_id end
        as unidade_saida,
      m.mes,
      count(distinct pe.pessoa_chave) filter (where pe.publicavel)::integer as alunos,
      count(distinct pe.pessoa_chave) filter (where not pe.publicavel)::integer
        as excluidos_revisao
    from periodos pe
    cross join meses m
    where (pe.data_inicio at time zone 'America/Sao_Paulo')::date <= m.fechamento
      and (
        pe.data_fim is null
        or (pe.data_fim at time zone 'America/Sao_Paulo')::date > m.fechamento
      )
    group by pe.professor_id,
      case when p_unidade_id is null then null::uuid else pe.unidade_id end,
      m.mes
  ), stats as (
    select f.professor_id, f.unidade_saida,
      avg(f.alunos)::numeric as media_alunos,
      count(*)::integer as meses,
      sum(f.excluidos_revisao)::integer as excluidos_revisao,
      jsonb_agg(jsonb_build_object(
        'mes', f.mes,
        'alunos_fechamento', f.alunos,
        'excluidos_revisao', f.excluidos_revisao
      ) order by f.mes) as fechamentos
    from fechamentos f
    group by f.professor_id, f.unidade_saida
  ), alvo as (
    select distinct pu.professor_id,
      case when p_unidade_id is null then null::uuid else pu.unidade_id end
        as unidade_saida
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
    union
    select distinct p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
    from periodos p
  )
  select
    'numero_alunos'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(s.meses, 0) > 0 then round(s.media_alunos, 2) else null end,
    case when coalesce(s.meses, 0) > 0 then s.media_alunos * s.meses else 0 end,
    coalesce(s.meses, 0)::numeric,
    coalesce(s.meses, 0),
    case
      when coalesce(s.meses, 0) = 0 then 'sem_base'
      when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados then 'provisorio'
      when s.excluidos_revisao > 0 then 'revisar'
      else 'ok'
    end,
    coalesce(s.meses, 0) > 0,
    case
      when coalesce(s.meses, 0) = 0 then 'sem_base'
      when s.excluidos_revisao > 0 then 'media'
      when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados then 'provisoria'
      else 'alta'
    end,
    'vw_professor_periodos_efetivos_v3_sombra+vw_aluno_identidade_unidade_canonica'::text,
    'health-score-professor-v3-numero-alunos-periodo-1'::text,
    case
      when coalesce(s.meses, 0) = 0 then 'nenhum fechamento mensal disponivel'
      when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados
        then 'ciclo ainda nao possui tres fechamentos mensais'
      when s.excluidos_revisao > 0 then 'ha vinculos em revisao fora da carteira publicada'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'fechamentos', coalesce(s.fechamentos, '[]'::jsonb),
      'meses_com_base', coalesce(s.meses, 0),
      'meses_esperados', v_meses_esperados,
      'excluidos_revisao', coalesce(s.excluidos_revisao, 0),
      'agregacao', 'media_fechamentos_disponiveis',
      'apta_oficial', p_periodicidade = 'ciclo'
        and coalesce(s.meses, 0) = 3
        and coalesce(s.excluidos_revisao, 0) = 0
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join stats s
    on s.professor_id = a.professor_id
   and s.unidade_saida is not distinct from a.unidade_saida;

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
          'DESISTENCIA', 'DESISTÊNCIA',
          'DESANIMO', 'DESÂNIMO',
          'INSATISFACAO', 'INSATISFAÇÃO',
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

-- Materializador periodico: valores reais ficam preservados; a nota usa sempre
-- valor_bruto / meta_versionada * 100, limitada a 100.
create or replace function public.materializar_health_score_professor_v3_periodo(
  p_competencia date,
  p_periodicidade text default 'mensal',
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_periodo record;
  v_scope record;
  v_alvo record;
  v_snapshot_id uuid;
  v_revisao integer;
  v_cobertura numeric;
  v_score numeric;
  v_tem_fidelizacao boolean;
  v_base_suficiente boolean;
  v_classificacao text;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;
  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODO_INVALIDO: use mensal ou ciclo';
  end if;

  select * into v_periodo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade);

  select * into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and date_trunc('month', p_competencia)::date >= c.vigencia_inicio
    and (c.vigencia_fim is null or date_trunc('month', p_competencia)::date <= c.vigencia_fim)
  order by c.versao desc
  limit 1;
  if not found then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: nenhuma configuracao ativa no periodo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'health_score_v3_periodo:' || date_trunc('month', p_competencia)::date::text
      || ':' || p_periodicidade || ':' || coalesce(p_unidade_id::text, 'todos'), 0
  ));

  create temporary table if not exists health_score_v3_metricas_periodo_execucao (
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
  ) on commit drop;

  for v_scope in
    select u.id as unidade_id
    from public.unidades u
    where u.ativo and p_unidade_id is null
    union all
    select null::uuid where p_unidade_id is null
    union all
    select p_unidade_id where p_unidade_id is not null
  loop
    truncate health_score_v3_metricas_periodo_execucao;
    insert into health_score_v3_metricas_periodo_execucao
    select *
    from public.get_health_score_professor_v3_metricas_periodo(
      p_competencia, v_scope.unidade_id, p_periodicidade
    ) m
    where p_professor_id is null or m.professor_id = p_professor_id;

    for v_alvo in
      select m.professor_id, max(m.professor_nome) as professor_nome,
             m.unidade_id
      from health_score_v3_metricas_periodo_execucao m
      group by m.professor_id, m.unidade_id
    loop
      select coalesce(max(s.revisao), 0) + 1 into v_revisao
      from public.health_score_professor_v3_snapshots s
      where s.professor_id = v_alvo.professor_id
        and s.unidade_id is not distinct from v_alvo.unidade_id
        and s.competencia = date_trunc('month', p_competencia)::date
        and s.periodicidade = p_periodicidade;

      insert into public.health_score_professor_v3_snapshots (
        professor_id, escopo, unidade_id, competencia, trimestre_inicio,
        revisao, estado, config_id, config_versao, periodicidade,
        periodo_inicio, periodo_fim, ciclo_codigo, estado_publicacao,
        score_exibivel, ranking_habilitado, regra_versao
      ) values (
        v_alvo.professor_id,
        case when v_alvo.unidade_id is null then 'consolidado' else 'unidade' end,
        v_alvo.unidade_id,
        date_trunc('month', p_competencia)::date,
        v_periodo.periodo_inicio,
        v_revisao,
        'provisorio',
        v_config.id,
        v_config.versao,
        p_periodicidade,
        v_periodo.periodo_inicio,
        v_periodo.periodo_fim,
        v_periodo.ciclo_codigo,
        'sem_base',
        false,
        false,
        'health-score-professor-v3-motor-periodo-1'
      ) returning id into v_snapshot_id;

      insert into public.health_score_professor_v3_snapshot_metricas (
        snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
        estado_base, publicavel, confianca, fonte, regra_versao,
        motivo_sem_base, detalhes, nota, peso, peso_disponivel,
        contribuicao, meta_aplicada
      )
      select
        v_snapshot_id,
        cm.metrica,
        r.valor_bruto,
        r.numerador,
        r.denominador,
        r.amostra,
        coalesce(r.estado_base, 'sem_base'),
        r.publicavel and r.valor_bruto is not null and cm.meta is not null,
        coalesce(r.confianca, 'sem_base'),
        coalesce(r.fonte, 'health-score-v3-periodo-sem-linha'),
        coalesce(r.regra_versao, 'health-score-professor-v3-motor-periodo-1'),
        case
          when r.professor_id is null then 'metrica sem linha para professor e escopo'
          when cm.meta is null then 'meta versionada ausente'
          else r.motivo_sem_base
        end,
        coalesce(r.detalhes, '{}'::jsonb) || jsonb_build_object(
          'meta_versionada', cm.meta,
          'normalizacao', 'meta_versionada',
          'valor_real_preservado', true
        ),
        case
          when r.publicavel and r.valor_bruto is not null and cm.meta > 0
            then round(least(100::numeric, greatest(
              0::numeric, r.valor_bruto / cm.meta * 100
            )), 2)
          else null
        end,
        cm.peso,
        r.publicavel and r.valor_bruto is not null and cm.meta is not null,
        case
          when r.publicavel and r.valor_bruto is not null and cm.meta > 0
            then round(
              least(100::numeric, greatest(
                0::numeric, r.valor_bruto / cm.meta * 100
              )) * cm.peso / 100,
              4
            )
          else null
        end,
        cm.meta
      from public.health_score_professor_v3_config_metricas cm
      left join health_score_v3_metricas_periodo_execucao r
        on r.metrica = cm.metrica
       and r.professor_id = v_alvo.professor_id
       and r.unidade_id is not distinct from v_alvo.unidade_id
      where cm.config_id = v_config.id;

      select
        coalesce(sum(m.peso) filter (where m.nota is not null), 0),
        case when coalesce(sum(m.peso) filter (where m.nota is not null), 0) > 0
          then round(
            sum(m.nota * m.peso) filter (where m.nota is not null)
            / sum(m.peso) filter (where m.nota is not null), 2
          ) else null end,
        coalesce(bool_or(
          m.metrica in ('retencao', 'permanencia') and m.nota is not null
        ), false)
      into v_cobertura, v_score, v_tem_fidelizacao
      from public.health_score_professor_v3_snapshot_metricas m
      where m.snapshot_id = v_snapshot_id;

      v_base_suficiente := v_cobertura >= v_config.cobertura_minima
        and (not v_config.exige_pilar_fidelizacao or v_tem_fidelizacao);
      if not v_base_suficiente then v_score := null; end if;
      v_classificacao := case
        when v_score is null then 'sem_base'
        when v_score >= v_config.faixa_saudavel_min then 'saudavel'
        when v_score >= v_config.faixa_atencao_min then 'atencao'
        else 'critico'
      end;

      update public.health_score_professor_v3_snapshots
      set score = v_score,
          cobertura = v_cobertura,
          classificacao = v_classificacao,
          estado = case when exists (
            select 1 from public.health_score_professor_v3_snapshot_metricas m
            where m.snapshot_id = v_snapshot_id and m.estado_base = 'em_maturacao'
          ) then 'em_maturacao' else 'provisorio' end,
          publicavel = false,
          publicado = false,
          estado_publicacao = case when v_score is null then 'sem_base' else 'parcial' end,
          score_exibivel = v_score is not null,
          ranking_habilitado = false,
          motivo_bloqueio = case
            when v_score is null then 'cobertura ou pilar de fidelizacao insuficiente'
            else 'Health Score parcial; ranking e premiacao dependem do fechamento oficial do ciclo'
          end
      where id = v_snapshot_id;

      v_count := v_count + 1;
      v_ids := v_ids || jsonb_build_array(v_snapshot_id);
    end loop;
  end loop;

  return jsonb_build_object(
    'snapshots_criados', v_count,
    'snapshot_ids', v_ids,
    'competencia', date_trunc('month', p_competencia)::date,
    'periodicidade', p_periodicidade,
    'periodo_inicio', v_periodo.periodo_inicio,
    'periodo_fim', v_periodo.periodo_fim,
    'ciclo_codigo', v_periodo.ciclo_codigo,
    'estado_publicacao', 'parcial',
    'ranking_habilitado', false,
    'config_versao', v_config.versao
  );
end;
$$;

revoke all on function public.materializar_health_score_professor_v3_periodo(date, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.materializar_health_score_professor_v3_periodo(date, text, uuid, integer)
  to service_role;

comment on function public.materializar_health_score_professor_v3_periodo(date, text, uuid, integer) is
  'Cria snapshots V3 parciais mensais ou por ciclo. Peso e meta sao distintos; ranking permanece desabilitado.';
