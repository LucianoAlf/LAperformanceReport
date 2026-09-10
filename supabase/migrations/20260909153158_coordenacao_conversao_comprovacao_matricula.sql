-- Pessoa resolvida nao substitui comprovacao de matricula.
-- A comprovacao e distinta do credito D+30: uma matricula fora da janela
-- ou atribuida a outra experimental nao vira pendencia de identidade.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create or replace function public.get_health_score_professor_v3_conversao_periodo_canonico(p_competencia date, p_unidade_id uuid default null, p_periodicidade text default 'mensal')
 RETURNS TABLE(metrica text, professor_id integer, professor_nome text, unidade_id uuid, competencia date, valor_bruto numeric, numerador numeric, denominador numeric, amostra integer, estado_base text, publicavel boolean, confianca text, fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_competencia date := make_date(
    extract(year from p_competencia)::integer,
    extract(month from p_competencia)::integer,
    1
  );
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
  v_label text;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_CONVERSAO_PERIODO_INVALIDO' using errcode = '22023';
  end if;

  select
    p.periodo_inicio,
    p.periodo_fim,
    p.ciclo_codigo,
    p.periodo_label
  into
    v_inicio,
    v_fim_periodo,
    v_codigo,
    v_label
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade) p;

  v_fim_recorte := least(v_fim_periodo, current_date);

  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ),
  raw_mais_recente as (
    select distinct on (
      r.unidade_id,
      coalesce(
        r.emusys_aula_id::text,
        r.aula_emusys_id::text,
        'raw:' || r.id::text
      )
    )
      r.*,
      coalesce(
        r.emusys_aula_id::text,
        r.aula_emusys_id::text,
        'raw:' || r.id::text
      ) as evento_chave
    from public.emusys_experimentais_raw r
    join unidades_permitidas up on up.unidade_id = r.unidade_id
    where r.data_aula between v_inicio - 30 and least(v_fim_periodo + 30, current_date)
      and r.professor_id is not null
      and r.situacao_operacional in ('presente', 'matriculado')
    order by
      r.unidade_id,
      coalesce(
        r.emusys_aula_id::text,
        r.aula_emusys_id::text,
        'raw:' || r.id::text
      ),
      r.id desc
  ),
  raw_resolvido as (
    select
      r.*,
      coalesce(
        r.lead_id,
        vinculo.lead_id,
        conciliacao.lead_id,
        lead_payload.id
      ) as lead_id_resolvido,
      coalesce(
        r.aluno_id,
        vinculo.aluno_id,
        lead_resolvido.aluno_id,
        aluno_origem.id
      ) as aluno_id_resolvido
    from raw_mais_recente r
    left join public.health_score_v3_experimental_lead_conciliacoes conciliacao
      on conciliacao.raw_id = r.id
    left join lateral (
      select
        le.lead_id,
        coalesce(le.aluno_id, l.aluno_id, a_origem.id) as aluno_id
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
            and le.emusys_lead_id =
              ((case when r.emusys_lead_id_zero then '0' else r.emusys_lead_id::text end))::bigint
          )
        )
      order by
        (le.id = r.lead_experimental_id) desc,
        (le.professor_experimental_id = r.professor_id) desc,
        le.id desc
      limit 1
    ) vinculo on true
    left join public.leads lead_payload
      on nullif((case when r.emusys_lead_id_zero then '0' else r.emusys_lead_id::text end), '') ~ '^[0-9]+$'
     and lead_payload.emusys_lead_id =
       ((case when r.emusys_lead_id_zero then '0' else r.emusys_lead_id::text end))::integer
     and lead_payload.unidade_id = r.unidade_id
    left join public.leads lead_resolvido
      on lead_resolvido.id = coalesce(
        r.lead_id,
        vinculo.lead_id,
        conciliacao.lead_id,
        lead_payload.id
      )
     and lead_resolvido.unidade_id = r.unidade_id
    left join public.alunos aluno_origem
      on aluno_origem.lead_origem_id = lead_resolvido.id
     and aluno_origem.unidade_id = r.unidade_id
  ),
  experimentais_candidatas as (
    select
      r.unidade_id,
      r.professor_id,
      r.evento_chave,
      coalesce(
        'lead:' || r.lead_id_resolvido::text,
        'evento:' || r.evento_chave
      ) as lead_chave,
      r.lead_id_resolvido,
      r.data_aula,
      identidade.pessoa_chave
    from raw_resolvido r
    left join public.vw_aluno_identidade_unidade_canonica identidade
      on identidade.unidade_id = r.unidade_id
     and r.aluno_id_resolvido = any(identidade.aluno_ids_locais)
  ),
  experimentais as (
    select e.* from experimentais_candidatas e
    where e.data_aula between v_inicio and v_fim_recorte
  ),
  matriculas as (
    select distinct
      a.unidade_id,
      coalesce(
        nullif(a.emusys_matricula_id, ''),
        'local:' || a.id::text
      ) as matricula_chave,
      identidade.pessoa_chave,
      a.data_matricula
    from public.alunos a
    join unidades_permitidas up on up.unidade_id = a.unidade_id
    join public.vw_aluno_identidade_unidade_canonica identidade
      on identidade.unidade_id = a.unidade_id
     and a.id = any(identidade.aluno_ids_locais)
    where a.data_matricula between v_inicio
      and least(v_fim_periodo + 30, current_date)
      and lower(coalesce(a.status, '')) <> 'excluido'
  ),
  candidatos as (
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
    join experimentais_candidatas e
      on e.unidade_id = m.unidade_id
     and m.pessoa_chave = e.pessoa_chave
     and m.data_matricula between e.data_aula and e.data_aula + 30
  ),
  candidatos_unicos as (
    select
      c.*,
      row_number() over (
        partition by c.unidade_id, c.evento_chave
        order by c.data_matricula, c.matricula_chave
      ) as ordem_experimental
    from candidatos c
    where c.ordem_matricula = 1
  ),
  creditos as (
    select c.*
    from candidatos_unicos c
    where c.ordem_experimental = 1
      and c.data_aula between v_inicio and v_fim_recorte
  ),
  alvo as (
    select distinct
      pu.professor_id,
      case when p_unidade_id is null then null::uuid else pu.unidade_id end
        as unidade_saida
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado')
        not in ('ignorado', 'rejeitado')
    union
    select distinct
      e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
    from experimentais e
  ),
  estatisticas as (
    select
      e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      count(distinct (e.unidade_id, e.evento_chave))::integer as experimentais,
      count(distinct (e.unidade_id, e.evento_chave))
        filter (where e.lead_id_resolvido is null)::integer
        as somente_evento,
      count(distinct (e.unidade_id, e.evento_chave))
        filter (where e.pessoa_chave is null)::integer
        as sem_pessoa_canonica,
      count(distinct (e.unidade_id, e.evento_chave))
        filter (
          where e.lead_id_resolvido is not null
            and not exists (
              select 1
              from public.alunos prova
              join public.vw_aluno_identidade_unidade_canonica identidade_prova
                on identidade_prova.unidade_id = prova.unidade_id
               and prova.id = any(identidade_prova.aluno_ids_locais)
              where prova.unidade_id = e.unidade_id
                and identidade_prova.pessoa_chave = e.pessoa_chave
                and prova.data_matricula is not null
                and prova.data_matricula <= current_date
                and lower(coalesce(prova.status, '')) <> 'excluido'
            )
            and exists (
              select 1
              from public.leads l
              where l.id = e.lead_id_resolvido
                and (
                  coalesce(l.converteu, false)
                  or l.data_conversao is not null
                )
            )
        )::integer as conversoes_declaradas_sem_matricula_canonica
    from experimentais e
    group by
      e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
  ),
  conversoes as (
    select
      c.professor_id,
      case when p_unidade_id is null then null::uuid else c.unidade_id end
        as unidade_saida,
      count(distinct (c.unidade_id, c.matricula_chave))::integer as matriculas
    from creditos c
    group by
      c.professor_id,
      case when p_unidade_id is null then null::uuid else c.unidade_id end
  )
  select
    'conversao'::text as metrica,
    a.professor_id,
    pr.nome::text as professor_nome,
    a.unidade_saida as unidade_id,
    v_competencia as competencia,
    case
      when coalesce(e.experimentais, 0) > 0 then round(
        least(
          coalesce(c.matriculas, 0),
          e.experimentais
        )::numeric / e.experimentais::numeric * 100,
        2
      )
      else null::numeric
    end as valor_bruto,
    least(
      coalesce(c.matriculas, 0),
      coalesce(e.experimentais, 0)
    )::numeric as numerador,
    coalesce(e.experimentais, 0)::numeric as denominador,
    coalesce(e.experimentais, 0) as amostra,
    case
      when coalesce(e.experimentais, 0) = 0 then 'sem_base'
      when e.experimentais < 3 then 'sem_base_amostra'
      when coalesce(e.conversoes_declaradas_sem_matricula_canonica, 0) > 0 then 'revisar'
      when current_date < v_fim_periodo + 30 then 'em_andamento'
      else 'ok'
    end::text as estado_base,
    coalesce(e.experimentais, 0) >= 3
      and coalesce(e.conversoes_declaradas_sem_matricula_canonica, 0) = 0 as publicavel,
    case
      when coalesce(e.experimentais, 0) = 0 then 'sem_base'
      when e.experimentais < 3 then 'baixa'
      when coalesce(e.conversoes_declaradas_sem_matricula_canonica, 0) > 0 then 'media'
      when current_date < v_fim_periodo + 30 then 'provisoria'
      else 'alta'
    end::text as confianca,
    (
      'emusys_experimentais_raw'
      || '+health_score_v3_experimental_lead_conciliacoes'
      || '+vw_aluno_identidade_unidade_canonica+alunos'
    )::text as fonte,
    'health-score-professor-v3-conversao-periodo-canonico-2.1'::text
      as regra_versao,
    case
      when coalesce(e.experimentais, 0) = 0 then 'nenhuma experimental confirmada no periodo'
      when e.experimentais < 3 then 'base minima de 3 experimentais nao atingida'
      when coalesce(e.conversoes_declaradas_sem_matricula_canonica, 0) > 0
        then 'conversao declarada sem matricula comprovada no periodo'
      when current_date < v_fim_periodo + 30 then 'janela D+30 em andamento'
      else null
    end::text as motivo_sem_base,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'ciclo_label', v_label,
      'experimentais_confirmadas', coalesce(e.experimentais, 0),
      'matriculas_creditadas', least(
        coalesce(c.matriculas, 0),
        coalesce(e.experimentais, 0)
      ),
      'experimentais_somente_evento', coalesce(e.somente_evento, 0),
      'experimentais_sem_pessoa_canonica',
        coalesce(e.sem_pessoa_canonica, 0),
      'conversoes_declaradas_sem_matricula_canonica',
        coalesce(e.conversoes_declaradas_sem_matricula_canonica, 0),
      'identidade_denominador', 'evento_chave/lead_chave',
      'identidade_numerador', 'pessoa_canonica+matricula_canonica_D+30',
      'regra_credito',
        'uma matricula por experimental; ultima experimental anterior em ate 30 dias',
      'fora_do_score', coalesce(e.experimentais, 0) < 3
        or coalesce(e.conversoes_declaradas_sem_matricula_canonica, 0) > 0,
      'codigo_evidencia', case
        when coalesce(e.experimentais, 0) = 0 then
          case when p_periodicidade = 'ciclo' then 'sem_experimental_ciclo' else 'sem_experimental_mes' end
        when e.experimentais < 3 then 'amostra_experimental_insuficiente'
        when coalesce(e.conversoes_declaradas_sem_matricula_canonica, 0) > 0 then 'fonte_canonica_indisponivel'
        else case when p_periodicidade = 'ciclo' then 'evidencia_ciclo_disponivel' else 'evidencia_mensal_disponivel' end
      end,
      'apta_oficial', p_periodicidade = 'ciclo' and current_date >= v_fim_periodo + 30
        and coalesce(e.experimentais, 0) >= 3
        and coalesce(e.conversoes_declaradas_sem_matricula_canonica, 0) = 0
    ) as detalhes
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join estatisticas e
    on e.professor_id = a.professor_id
   and e.unidade_saida is not distinct from a.unidade_saida
  left join conversoes c
    on c.professor_id = a.professor_id
   and c.unidade_saida is not distinct from a.unidade_saida;
end;
$function$;
commit;
