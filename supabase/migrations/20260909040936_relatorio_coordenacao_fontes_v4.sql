begin;

-- Cada documento registra apenas as competencias que ja transcorreram. O fim
-- nominal do ciclo continua no cabecalho; os fatos param na data de corte.
create or replace function public.relatorio_coordenacao_periodos_v4(
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_data_corte date
)
returns table (
  competencia date,
  inicio date,
  fim date,
  ordinal integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_inicio date;
  v_fim date;
  v_corte date;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  select p.periodo_inicio, p.periodo_fim
    into v_inicio, v_fim
  from public.fn_health_score_v3_periodo(
    make_date(p_ano, p_mes, 1),
    p_periodicidade
  ) p;

  v_corte := least(coalesce(p_data_corte, current_date), v_fim);
  if v_corte < v_inicio then
    return;
  end if;

  return query
  select
    g.competencia::date,
    g.competencia::date,
    least(
      (g.competencia + interval '1 month - 1 day')::date,
      v_corte
    )::date,
    row_number() over (order by g.competencia)::integer
  from generate_series(
    date_trunc('month', v_inicio)::date,
    date_trunc('month', v_corte)::date,
    interval '1 month'
  ) as g(competencia)
  order by g.competencia;
end;
$function$;

revoke all on function public.relatorio_coordenacao_periodos_v4(integer, integer, text, date)
  from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_periodos_v4(integer, integer, text, date)
  to service_role;

create or replace function public.relatorio_coordenacao_unidades_v4(
  p_unidade_id uuid
)
returns table (unidade_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select p_unidade_id
  where p_unidade_id is not null

  union all

  select u.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(null) u
  where p_unidade_id is null;
$function$;

revoke all on function public.relatorio_coordenacao_unidades_v4(uuid)
  from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_unidades_v4(uuid)
  to service_role;

-- A carteira e uma fotografia de fechamento, nao a quantidade de pessoas que
-- passou por uma turma em qualquer momento do mes. Quando ha fotografia
-- auditada, ela e preservada e somente o aluno exclusivamente de atividade
-- extra e retirado. No ciclo, somamos unidades por mes e tiramos a media dos
-- fechamentos mensais observados.
create or replace function public.relatorio_coordenacao_carteira_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_data_corte date
)
returns table (
  professor_id integer,
  carteira_media numeric,
  meses_observados integer,
  total_turmas integer,
  ocupacoes_elegiveis integer,
  turmas_elegiveis integer,
  media_alunos_turma numeric,
  fechamentos jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with periodos as materialized (
    select *
    from public.relatorio_coordenacao_periodos_v4(
      p_ano, p_mes, p_periodicidade, p_data_corte
    )
  ), unidades as materialized (
    select * from public.relatorio_coordenacao_unidades_v4(p_unidade_id)
  ), grade as materialized (
    select p.competencia, p.inicio, p.fim, u.unidade_id
    from periodos p
    cross join unidades u
  ), snapshots_ranked as (
    select
      g.competencia,
      s.unidade_id,
      s.professor_id,
      s.carteira_alunos,
      row_number() over (
        partition by g.competencia, s.unidade_id, s.professor_id
        order by s.auditado_em desc nulls last, s.created_at desc, s.id desc
      ) as ordem
    from grade g
    join public.professor_carteira_mensal_canonica s
      on s.competencia = g.competencia
     and s.unidade_id = g.unidade_id
  ), snapshots as (
    select competencia, unidade_id, professor_id, carteira_alunos
    from snapshots_ranked
    where ordem = 1
  ), composicao as materialized (
    select
      g.competencia,
      c.unidade_id,
      c.professor_id,
      c.carteira_regular,
      c.carteira_so_atividade_extra
    from grade g
    cross join lateral public.get_carteira_professor_periodo_composicao_v1(
      extract(year from g.competencia)::integer,
      extract(month from g.competencia)::integer,
      g.unidade_id,
      g.inicio,
      g.fim
    ) c
  ), kpis as materialized (
    select
      g.competencia,
      k.unidade_id,
      k.professor_id,
      k.total_turmas,
      k.alunos_via_turmas,
      k.turmas_elegiveis_media
    from grade g
    cross join lateral public.get_carteira_professor_periodo_canonica(
      extract(year from g.competencia)::integer,
      extract(month from g.competencia)::integer,
      g.unidade_id,
      g.inicio,
      g.fim
    ) k
  ), chaves as (
    select competencia, unidade_id, professor_id from snapshots
    union
    select competencia, unidade_id, professor_id from composicao
    union
    select competencia, unidade_id, professor_id from kpis
  ), mensal_unidade as (
    select
      c.competencia,
      c.unidade_id,
      c.professor_id,
      case
        when s.professor_id is not null
         and (c.competencia + interval '1 month - 1 day')::date < current_date
          then greatest(
          s.carteira_alunos - coalesce(x.carteira_so_atividade_extra, 0),
          0
        )::numeric
        when x.professor_id is not null then x.carteira_regular::numeric
        when s.professor_id is not null then greatest(
          s.carteira_alunos - coalesce(x.carteira_so_atividade_extra, 0),
          0
        )::numeric
        else null::numeric
      end as carteira,
      k.total_turmas,
      k.alunos_via_turmas,
      k.turmas_elegiveis_media,
      case
        when s.professor_id is not null
         and (c.competencia + interval '1 month - 1 day')::date < current_date
          then 'fechamento_mensal_menos_extra_exclusivo'
        when x.professor_id is not null then 'composicao_regular'
        when s.professor_id is not null then 'fechamento_mensal_disponivel'
        else null::text
      end as origem
    from chaves c
    left join snapshots s
      on s.competencia = c.competencia
     and s.unidade_id = c.unidade_id
     and s.professor_id = c.professor_id
    left join composicao x
      on x.competencia = c.competencia
     and x.unidade_id = c.unidade_id
     and x.professor_id = c.professor_id
    left join kpis k
      on k.competencia = c.competencia
     and k.unidade_id = c.unidade_id
     and k.professor_id = c.professor_id
  ), mensal_professor as (
    select
      m.competencia,
      m.professor_id,
      case when count(m.carteira) > 0 then sum(m.carteira) end as carteira,
      case when count(m.total_turmas) > 0 then sum(m.total_turmas) end::integer
        as total_turmas,
      case when count(m.alunos_via_turmas) > 0 then sum(m.alunos_via_turmas) end::integer
        as ocupacoes_elegiveis,
      case when count(m.turmas_elegiveis_media) > 0 then sum(m.turmas_elegiveis_media) end::integer
        as turmas_elegiveis,
      jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'unidade_id', m.unidade_id,
        'valor', m.carteira,
        'origem', m.origem
      )) order by m.unidade_id) as unidades
    from mensal_unidade m
    group by m.competencia, m.professor_id
  )
  select
    m.professor_id,
    round(avg(m.carteira), 2) as carteira_media,
    count(m.carteira)::integer as meses_observados,
    case when count(m.total_turmas) > 0 then sum(m.total_turmas) end::integer,
    case when count(m.ocupacoes_elegiveis) > 0 then sum(m.ocupacoes_elegiveis) end::integer,
    case when count(m.turmas_elegiveis) > 0 then sum(m.turmas_elegiveis) end::integer,
    case
      when sum(m.turmas_elegiveis) > 0 then round(
        sum(m.ocupacoes_elegiveis)::numeric / sum(m.turmas_elegiveis),
        2
      )
      else null::numeric
    end as media_alunos_turma,
    jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'competencia', m.competencia,
      'valor', m.carteira,
      'total_turmas', m.total_turmas,
      'ocupacoes_elegiveis', m.ocupacoes_elegiveis,
      'turmas_elegiveis', m.turmas_elegiveis,
      'unidades', m.unidades
    )) order by m.competencia) as fechamentos
  from mensal_professor m
  group by m.professor_id
  order by m.professor_id;
$function$;

revoke all on function public.relatorio_coordenacao_carteira_v4(uuid, integer, integer, text, date)
  from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_carteira_v4(uuid, integer, integer, text, date)
  to service_role;

-- O ciclo em andamento reaproveita as mesmas fotografias mensais mostradas no
-- painel. Percentuais sao recompostos por fatos brutos. Se duas competencias
-- nominais ainda apontam para a mesma referencia anterior, ela entra uma unica
-- vez, evitando dobrar agosto em setembro/outubro.
create or replace function public.relatorio_coordenacao_presenca_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_data_corte date
)
returns table (
  professor_id integer,
  numerador numeric,
  denominador numeric,
  valor numeric,
  amostra integer,
  motivo text,
  codigo_evidencia text,
  pendencia boolean,
  competencias_observadas integer,
  detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with periodos as materialized (
    select competencia
    from public.relatorio_coordenacao_periodos_v4(
      p_ano, p_mes, p_periodicidade, p_data_corte
    )
  ), snapshots_ranked as (
    select
      s.id,
      s.professor_id,
      s.competencia as competencia_nominal,
      s.revisao,
      s.criado_em,
      row_number() over (
        partition by s.professor_id, s.competencia
        order by s.revisao desc, s.criado_em desc, s.id desc
      ) as ordem
    from public.health_score_professor_v3_snapshots s
    join periodos p on p.competencia = s.competencia
    where s.periodicidade = 'mensal'
      and s.escopo = case when p_unidade_id is null then 'consolidado' else 'unidade' end
      and s.unidade_id is not distinct from p_unidade_id
      and s.invalidado_em is null
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
  ), metricas as (
    select
      s.professor_id,
      s.competencia_nominal,
      coalesce(
        case
          when coalesce(m.detalhes ->> 'competencia_referencia', '')
                 ~ '^\d{4}-\d{2}-\d{2}$'
            then (m.detalhes ->> 'competencia_referencia')::date
        end,
        s.competencia_nominal
      ) as competencia_efetiva,
      m.valor_bruto,
      m.numerador,
      m.denominador,
      m.amostra,
      m.motivo_sem_base,
      m.codigo_evidencia,
      m.estado_base,
      m.confianca,
      m.fonte,
      m.regra_versao,
      coalesce(m.detalhes, '{}'::jsonb) as detalhes,
      row_number() over (
        partition by s.professor_id, coalesce(
          case
            when coalesce(m.detalhes ->> 'competencia_referencia', '')
                   ~ '^\d{4}-\d{2}-\d{2}$'
              then (m.detalhes ->> 'competencia_referencia')::date
          end,
          s.competencia_nominal
        )
        order by s.competencia_nominal desc, s.revisao desc, s.criado_em desc
      ) as referencia_ordem
    from snapshots_ranked s
    join public.health_score_professor_v3_snapshot_metricas m
      on m.snapshot_id = s.id
     and m.metrica = 'presenca'
    where s.ordem = 1
  ), selecionadas as (
    select * from metricas where referencia_ordem = 1
  ), agregadas as (
    select
      s.professor_id,
      sum(s.numerador) filter (where s.denominador > 0) as numerador,
      sum(s.denominador) filter (where s.denominador > 0) as denominador,
      sum(coalesce(s.amostra, s.denominador::integer, 0))
        filter (where s.denominador > 0)::integer as amostra,
      count(*) filter (where s.denominador > 0)::integer as competencias_observadas,
      (array_agg(s.motivo_sem_base order by s.competencia_nominal desc)
        filter (where s.motivo_sem_base is not null))[1] as motivo,
      (array_agg(s.codigo_evidencia order by s.competencia_nominal desc)
        filter (where s.codigo_evidencia is not null))[1] as codigo_evidencia,
      jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'competencia', s.competencia_nominal,
        'competencia_referencia', s.competencia_efetiva,
        'numerador', s.numerador,
        'denominador', s.denominador,
        'valor', s.valor_bruto,
        'codigo_evidencia', s.codigo_evidencia
      )) order by s.competencia_nominal) as detalhes
    from selecionadas s
    group by s.professor_id
  )
  select
    a.professor_id,
    a.numerador,
    a.denominador,
    case when a.denominador > 0
      then round(100 * a.numerador / a.denominador, 2)
      else null::numeric end as valor,
    a.amostra,
    a.motivo,
    a.codigo_evidencia,
    (
      coalesce(a.denominador, 0) <= 0
      and coalesce(a.codigo_evidencia, '') not in (
        'calendario_sem_aulas_elegiveis',
        'sem_eventos_elegiveis_periodo',
        'sem_aulas_elegiveis'
      )
    ) as pendencia,
    a.competencias_observadas,
    jsonb_build_object(
      'regra_agregacao', 'soma_numeradores_dividida_pela_soma_denominadores',
      'competencias', a.detalhes
    ) as detalhes
  from agregadas a
  order by a.professor_id;
$function$;

revoke all on function public.relatorio_coordenacao_presenca_v4(uuid, integer, integer, text, date)
  from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_presenca_v4(uuid, integer, integer, text, date)
  to service_role;

-- Matriculador e a quantidade de matriculas comerciais atribuida ao professor,
-- separada da conversao de experimentais. Documento comercial fechado vence o
-- estado vivo. Quando junho ainda nao possui lista fechada, o corte temporal do
-- documento gerencial reconstrui exatamente o universo que existia no fecho.
create or replace function public.relatorio_coordenacao_matriculas_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_data_corte date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_periodo record;
  v_unidade record;
  v_documento public.fechamento_mensal_snapshots%rowtype;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_item jsonb;
  v_linha record;
  v_professor_id integer;
  v_nome_professor text;
  v_total integer := 0;
  v_atribuidas integer := 0;
  v_sem_professor integer := 0;
  v_total_fonte integer;
  v_total_esperado integer;
  v_origem_completa boolean := true;
  v_por_professor jsonb := '{}'::jsonb;
  v_documentos jsonb := '[]'::jsonb;
begin
  for v_periodo in
    select * from public.relatorio_coordenacao_periodos_v4(
      p_ano, p_mes, p_periodicidade, p_data_corte
    ) order by competencia
  loop
    for v_unidade in
      select * from public.relatorio_coordenacao_unidades_v4(p_unidade_id)
      order by unidade_id
    loop
      v_documento := null;
      v_gerencial := null;
      v_total_fonte := 0;
      v_total_esperado := null;

      select s.* into v_documento
      from public.fechamento_mensal_snapshots s
      where s.ano = extract(year from v_periodo.competencia)::integer
        and s.mes = extract(month from v_periodo.competencia)::integer
        and s.escopo = 'unidade'
        and s.unidade_id = v_unidade.unidade_id
        and s.dominio = 'relatorio_comercial_mensal'
        and s.status in ('preview', 'aprovado', 'fechado', 'retificado')
        and jsonb_typeof(s.payload -> 'matriculas') = 'array'
      order by s.versao desc
      limit 1;

      if v_documento.id is not null then
        for v_item in
          select value
          from jsonb_array_elements(v_documento.payload -> 'matriculas')
        loop
          v_total_fonte := v_total_fonte + 1;
          v_professor_id := null;

          if coalesce(v_item ->> 'id', '') ~ '^\d+$' then
            select a.professor_experimental_id into v_professor_id
            from public.alunos a
            where a.id = (v_item ->> 'id')::integer;
          end if;

          v_nome_professor := coalesce(
            nullif(btrim(v_item ->> 'professores_experimentais'), ''),
            nullif(btrim(v_item ->> 'professores'), '')
          );
          if v_professor_id is null and v_nome_professor is not null then
            select min(p.id) into v_professor_id
            from public.professores p
            where regexp_replace(lower(public.unaccent(btrim(p.nome))), '\s+', ' ', 'g')
                = regexp_replace(lower(public.unaccent(v_nome_professor)), '\s+', ' ', 'g')
            having count(*) = 1;
          end if;

          if v_professor_id is null then
            v_sem_professor := v_sem_professor + 1;
          else
            v_atribuidas := v_atribuidas + 1;
            v_por_professor := jsonb_set(
              v_por_professor,
              array[v_professor_id::text],
              to_jsonb(coalesce((v_por_professor ->> v_professor_id::text)::integer, 0) + 1),
              true
            );
          end if;
        end loop;

        v_documentos := v_documentos || jsonb_build_array(jsonb_build_object(
          'competencia', v_periodo.competencia,
          'unidade_id', v_unidade.unidade_id,
          'tipo', 'relatorio_comercial_mensal',
          'documento_id', v_documento.id,
          'versao', v_documento.versao,
          'hash', v_documento.payload_hash,
          'capturado_em', v_documento.capturado_em,
          'matriculas', v_total_fonte
        ));
      else
        select s.* into v_gerencial
        from public.fechamento_mensal_snapshots s
        where s.ano = extract(year from v_periodo.competencia)::integer
          and s.mes = extract(month from v_periodo.competencia)::integer
          and s.escopo = 'unidade'
          and s.unidade_id = v_unidade.unidade_id
          and s.dominio = 'relatorio_gerencial'
          and s.status in ('preview', 'aprovado', 'fechado', 'retificado')
        order by s.versao desc
        limit 1;

        if v_gerencial.id is not null then
          v_total_esperado := coalesce(
            nullif(v_gerencial.payload #>> '{dados_mes_atual,0,novas_matriculas}', '')::integer,
            nullif(v_gerencial.payload #>> '{kpis_comercial,0,novas_matriculas}', '')::integer,
            nullif(v_gerencial.payload ->> 'novas_matriculas', '')::integer
          );
        elsif v_periodo.fim < date_trunc('month', current_date)::date then
          v_origem_completa := false;
        end if;

        for v_linha in
          select
            m.aluno_id,
            a.professor_experimental_id,
            a.created_at
          from public.matriculas_comerciais_v1(
            v_unidade.unidade_id,
            v_periodo.inicio,
            v_periodo.fim + 1
          ) m
          join public.alunos a on a.id = m.aluno_id
          where m.conta is true
            and (
              v_gerencial.id is null
              or a.created_at <= v_gerencial.capturado_em
            )
          order by m.data_matricula, m.aluno_id
        loop
          v_total_fonte := v_total_fonte + 1;
          v_professor_id := v_linha.professor_experimental_id;
          if v_professor_id is null then
            v_sem_professor := v_sem_professor + 1;
          else
            v_atribuidas := v_atribuidas + 1;
            v_por_professor := jsonb_set(
              v_por_professor,
              array[v_professor_id::text],
              to_jsonb(coalesce((v_por_professor ->> v_professor_id::text)::integer, 0) + 1),
              true
            );
          end if;
        end loop;

        if v_total_esperado is not null and v_total_fonte <> v_total_esperado then
          raise exception 'RELATORIO_COORDENACAO_V4_COMERCIAL_DIVERGENTE'
            using errcode = '22000',
                  detail = format(
                    'unidade=%s competencia=%s esperado=%s encontrado=%s',
                    v_unidade.unidade_id,
                    v_periodo.competencia,
                    v_total_esperado,
                    v_total_fonte
                  );
        end if;

        v_documentos := v_documentos || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'competencia', v_periodo.competencia,
          'unidade_id', v_unidade.unidade_id,
          'tipo', case when v_gerencial.id is null then 'periodo_em_andamento' else 'corte_relatorio_gerencial' end,
          'documento_id', v_gerencial.id,
          'versao', v_gerencial.versao,
          'hash', v_gerencial.payload_hash,
          'capturado_em', v_gerencial.capturado_em,
          'matriculas', v_total_fonte,
          'total_esperado', v_total_esperado
        )));
      end if;

      v_total := v_total + v_total_fonte;
    end loop;
  end loop;

  return jsonb_build_object(
    'origem_completa', v_origem_completa,
    'matriculas_total', case when v_origem_completa then v_total else null end,
    'matriculas_atribuidas_professor', case
      when v_origem_completa then v_atribuidas else null end,
    'matriculas_sem_professor', case
      when v_origem_completa then v_sem_professor else null end,
    'por_professor', case when v_origem_completa then v_por_professor else '{}'::jsonb end,
    'documentos', v_documentos,
    'regra', 'matriculas_comerciais_atribuidas_ao_professor_da_experimental'
  );
end;
$function$;

revoke all on function public.relatorio_coordenacao_matriculas_v4(uuid, integer, integer, text, date)
  from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_matriculas_v4(uuid, integer, integer, text, date)
  to service_role;

create or replace function public.relatorio_coordenacao_saidas_v4(
  p_unidade_id uuid,
  p_inicio date,
  p_fim date
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with movimentos as (
    select
      m.id,
      m.data,
      m.tipo::text as tipo,
      coalesce(nullif(btrim(m.aluno_nome), ''), a.nome, 'Aluno nao informado') as aluno_nome,
      m.professor_id,
      p.nome as professor_nome,
      nullif(btrim(coalesce(m.motivo, '')), '') as motivo,
      coalesce(m.valor_parcela_evasao, m.valor_parcela_anterior)::numeric as valor_mrr,
      coalesce(ms.conta_score_professor, false) as conta_score_professor
    from public.movimentacoes_admin m
    left join public.alunos a on a.id = m.aluno_id
    left join public.professores p on p.id = m.professor_id
    left join lateral (
      select motivo.conta_score_professor
      from public.motivos_saida motivo
      where motivo.ativo is true
        and (
          motivo.id = m.motivo_saida_id
          or (
            m.motivo_saida_id is null
            and m.motivo is not null
            and lower(btrim(motivo.nome)) = lower(btrim(m.motivo))
          )
        )
      order by case when motivo.id = m.motivo_saida_id then 0 else 1 end, motivo.id
      limit 1
    ) ms on true
    where m.tipo in ('evasao', 'nao_renovacao')
      and m.data between p_inicio and p_fim
      and (p_unidade_id is null or m.unidade_id = p_unidade_id)
      and public.is_movimentacao_admin_retencao_valida(m.id)
      and coalesce(m.anulado, false) = false
      and coalesce(a.is_segundo_curso, false) = false
  )
  select jsonb_build_object(
    'evasoes_validas', count(*) filter (where tipo = 'evasao'),
    'nao_renovacoes_validas', count(*) filter (where tipo = 'nao_renovacao'),
    'saidas_validas_total', count(*),
    'saidas_atribuiveis_professor', count(*) filter (where conta_score_professor),
    'mrr_perdido_total', case
      when count(*) = 0 then 0::numeric
      when count(valor_mrr) > 0 then sum(valor_mrr)
      else null::numeric
    end,
    'mrr_perdido_atribuivel', case
      when count(*) filter (where conta_score_professor) = 0 then 0::numeric
      when count(valor_mrr) filter (where conta_score_professor) > 0
        then sum(valor_mrr) filter (where conta_score_professor)
      else null::numeric
    end,
    'valores_mrr_pendentes', count(*) filter (where valor_mrr is null),
    'valores_mrr_atribuiveis_pendentes', count(*) filter (
      where conta_score_professor and valor_mrr is null
    ),
    'movimentos', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'data', data,
        'tipo', tipo,
        'aluno_nome', aluno_nome,
        'professor_id', professor_id,
        'professor_nome', professor_nome,
        'motivo', motivo,
        'valor_mrr', valor_mrr,
        'conta_score_professor', conta_score_professor
      ) order by data, id
    ), '[]'::jsonb),
    'regra_publica', 'Movimentacoes validas do periodo; registros anulados nao aparecem'
  )
  from movimentos;
$function$;

revoke all on function public.relatorio_coordenacao_saidas_v4(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_saidas_v4(uuid, date, date)
  to service_role;

-- O produtor parte uma unica vez da fotografia do painel. Score, classificacao,
-- pesos, retencao, permanencia e conversao permanecem byte a byte como vieram.
-- Somente os fatos com divergencia conhecida sao substituidos antes da gravacao.
create or replace function public.montar_relatorio_coordenacao_conteudo_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base jsonb;
  v_item jsonb;
  v_novo_item jsonb;
  v_professores jsonb := '[]'::jsonb;
  v_carteiras jsonb := '{}'::jsonb;
  v_presencas jsonb := '{}'::jsonb;
  v_matriculas jsonb;
  v_saidas jsonb;
  v_carteira jsonb;
  v_presenca jsonb;
  v_operacional jsonb;
  v_metrica jsonb;
  v_professor_id integer;
  v_carteira_valor numeric;
  v_matriculas_valor integer;
  v_data_corte date;
  v_inicio date;
  v_fim date;
  v_periodo_oficial boolean;
  v_carteira_carga jsonb;
  v_presenca_resumo jsonb;
  v_competencias jsonb;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  -- O produtor usa a fotografia-base diretamente. O nome publico V3 passa a
  -- delegar ao documento V4 no cutover e, portanto, nunca pode ser dependencia
  -- deste caminho de escrita.
  v_base := public.montar_relatorio_coordenacao_payload_v3(
    p_unidade_id, p_ano, p_mes, p_periodicidade
  );
  if v_base is null
     or jsonb_typeof(v_base -> 'professores') <> 'array'
     or jsonb_typeof(v_base -> 'periodo') <> 'object' then
    raise exception 'RELATORIO_COORDENACAO_V4_CONTEUDO_INVALIDO'
      using errcode = '22023';
  end if;

  v_inicio := nullif(v_base #>> '{periodo,inicio}', '')::date;
  v_fim := nullif(v_base #>> '{periodo,fim}', '')::date;
  v_data_corte := least(
    coalesce(nullif(v_base #>> '{periodo,data_corte}', '')::date, current_date),
    v_fim
  );
  v_periodo_oficial := coalesce(
    nullif(v_base #>> '{periodo,publicacao_oficial}', '')::boolean,
    false
  );

  select coalesce(jsonb_object_agg(c.professor_id::text, to_jsonb(c)), '{}'::jsonb)
    into v_carteiras
  from public.relatorio_coordenacao_carteira_v4(
    p_unidade_id, p_ano, p_mes, p_periodicidade, v_data_corte
  ) c;

  if p_periodicidade = 'ciclo' and not v_periodo_oficial then
    select coalesce(jsonb_object_agg(p.professor_id::text, to_jsonb(p)), '{}'::jsonb)
      into v_presencas
    from public.relatorio_coordenacao_presenca_v4(
      p_unidade_id, p_ano, p_mes, p_periodicidade, v_data_corte
    ) p;
  end if;

  v_matriculas := public.relatorio_coordenacao_matriculas_v4(
    p_unidade_id, p_ano, p_mes, p_periodicidade, v_data_corte
  );
  v_saidas := public.relatorio_coordenacao_saidas_v4(
    p_unidade_id, v_inicio, v_data_corte
  );

  for v_item in
    select value
    from jsonb_array_elements(v_base -> 'professores') with ordinality
    order by ordinality
  loop
    v_novo_item := v_item;
    v_professor_id := nullif(v_item ->> 'professor_id', '')::integer;
    v_carteira := v_carteiras -> v_professor_id::text;
    v_presenca := v_presencas -> v_professor_id::text;
    v_carteira_valor := nullif(v_carteira ->> 'carteira_media', '')::numeric;

    v_metrica := coalesce(v_novo_item #> '{metricas,numero_alunos}', '{}'::jsonb);
    v_metrica := v_metrica || jsonb_build_object(
        'valor', v_carteira_valor,
        'valor_bruto', v_carteira_valor,
        'numerador', v_carteira_valor,
        'denominador', v_carteira_valor,
        'amostra', nullif(v_carteira ->> 'meses_observados', '')::integer,
        'codigo_evidencia', case
          when v_carteira_valor is null then 'dados_indisponiveis_periodo'
          else 'fechamentos_mensais_observados'
        end,
        'motivo', case
          when v_carteira_valor is null then 'Dados indisponiveis neste periodo'
          else null::text
        end,
        'detalhes', coalesce(v_metrica -> 'detalhes', '{}'::jsonb)
          || jsonb_build_object(
            'fechamentos', coalesce(v_carteira -> 'fechamentos', '[]'::jsonb),
            'meses_observados', nullif(v_carteira ->> 'meses_observados', '')::integer,
            'atividade_extra_incluida', false
          )
      );
    v_novo_item := jsonb_set(
      v_novo_item,
      '{metricas}',
      coalesce(v_novo_item -> 'metricas', '{}'::jsonb)
        || jsonb_build_object('numero_alunos', v_metrica),
      true
    );

    if coalesce((v_matriculas ->> 'origem_completa')::boolean, false) then
      v_matriculas_valor := coalesce(
        nullif(v_matriculas #>> array['por_professor', v_professor_id::text], '')::integer,
        0
      );
    else
      v_matriculas_valor := null;
    end if;

    v_operacional := coalesce(v_novo_item -> 'operacional', '{}'::jsonb)
      || jsonb_build_object(
        'carteira_alunos', v_carteira_valor,
        'total_turmas', nullif(v_carteira ->> 'total_turmas', '')::integer,
        'alunos_via_turmas', nullif(v_carteira ->> 'ocupacoes_elegiveis', '')::integer,
        'turmas_elegiveis_media', nullif(v_carteira ->> 'turmas_elegiveis', '')::integer,
        'matriculas_comerciais', v_matriculas_valor,
        'matriculas_origem_completa', coalesce(
          (v_matriculas ->> 'origem_completa')::boolean,
          false
        )
      );
    v_novo_item := jsonb_set(v_novo_item, '{operacional}', v_operacional, true);

    if v_presenca is not null then
      v_metrica := coalesce(v_novo_item #> '{metricas,presenca}', '{}'::jsonb)
        || jsonb_build_object(
          'valor', nullif(v_presenca ->> 'valor', '')::numeric,
          'valor_bruto', nullif(v_presenca ->> 'valor', '')::numeric,
          'numerador', nullif(v_presenca ->> 'numerador', '')::numeric,
          'denominador', nullif(v_presenca ->> 'denominador', '')::numeric,
          'amostra', nullif(v_presenca ->> 'amostra', '')::integer,
          'motivo', v_presenca ->> 'motivo',
          'codigo_evidencia', v_presenca ->> 'codigo_evidencia',
          'detalhes', coalesce(v_presenca -> 'detalhes', '{}'::jsonb)
        );
      v_novo_item := jsonb_set(
        v_novo_item,
        '{metricas}',
        coalesce(v_novo_item -> 'metricas', '{}'::jsonb)
          || jsonb_build_object('presenca', v_metrica),
        true
      );
    end if;

    v_professores := v_professores || jsonb_build_array(v_novo_item);
  end loop;

  with carteira as (
    select value as item from jsonb_each(v_carteiras)
  )
  select jsonb_build_object(
    'alunos_na_carteira', case
      when count(nullif(item ->> 'carteira_media', '')) > 0
        then sum(nullif(item ->> 'carteira_media', '')::numeric)
      else null::numeric end,
    'professores_com_carteira_observada', count(nullif(item ->> 'carteira_media', '')),
    'media_por_professor', round(avg(nullif(item ->> 'carteira_media', '')::numeric), 1),
    'total_turmas_operacionais', case
      when count(nullif(item ->> 'total_turmas', '')) > 0
        then sum(nullif(item ->> 'total_turmas', '')::numeric)
      else null::numeric end,
    'ocupacoes_elegiveis', case
      when count(nullif(item ->> 'ocupacoes_elegiveis', '')) > 0
        then sum(nullif(item ->> 'ocupacoes_elegiveis', '')::numeric)
      else null::numeric end,
    'turmas_elegiveis', case
      when count(nullif(item ->> 'turmas_elegiveis', '')) > 0
        then sum(nullif(item ->> 'turmas_elegiveis', '')::numeric)
      else null::numeric end,
    'media_alunos_turma', case
      when sum(nullif(item ->> 'turmas_elegiveis', '')::numeric) > 0
        then round(
          sum(nullif(item ->> 'ocupacoes_elegiveis', '')::numeric)
            / sum(nullif(item ->> 'turmas_elegiveis', '')::numeric),
          2
        )
      else null::numeric end,
    'grao_carteira', 'media_dos_fechamentos_mensais',
    'grao_media', 'ocupacoes_elegiveis_por_turma_elegivel'
  ) into v_carteira_carga
  from carteira;

  with raw as (
    select value #> '{metricas,presenca}' as item
    from jsonb_array_elements(v_professores)
  )
  select jsonb_build_object(
    'presenca_media', case
      when sum(coalesce(nullif(item ->> 'denominador', '')::numeric, 0)) > 0
        then round(
          100 * sum(coalesce(nullif(item ->> 'numerador', '')::numeric, 0))
            / sum(coalesce(nullif(item ->> 'denominador', '')::numeric, 0)),
          1
        )
      else null::numeric end,
    'professores_com_evidencia', count(*) filter (
      where coalesce(nullif(item ->> 'denominador', '')::numeric, 0) > 0
    ),
    'pendencias', count(*) filter (
      where coalesce(nullif(item ->> 'denominador', '')::numeric, 0) <= 0
        and coalesce(item ->> 'codigo_evidencia', '') not in (
          'calendario_sem_aulas_elegiveis',
          'sem_eventos_elegiveis_periodo',
          'sem_aulas_elegiveis'
        )
    ),
    'sem_aulas_elegiveis', count(*) filter (
      where coalesce(item ->> 'codigo_evidencia', '') in (
        'calendario_sem_aulas_elegiveis',
        'sem_eventos_elegiveis_periodo',
        'sem_aulas_elegiveis'
      )
    ),
    'eventos_elegiveis', sum(coalesce(nullif(item ->> 'denominador', '')::numeric, 0)),
    'presencas_confirmadas', sum(coalesce(nullif(item ->> 'numerador', '')::numeric, 0)),
    'regra_agregacao', 'soma_numeradores_dividida_pela_soma_denominadores'
  ) into v_presenca_resumo
  from raw;

  select coalesce(jsonb_agg(jsonb_build_object(
    'competencia', p.competencia,
    'inicio', p.inicio,
    'fim', p.fim
  ) order by p.ordinal), '[]'::jsonb)
    into v_competencias
  from public.relatorio_coordenacao_periodos_v4(
    p_ano, p_mes, p_periodicidade, v_data_corte
  ) p;

  return (v_base - 'documento') || jsonb_build_object(
    'schema_version', 4,
    'periodo', coalesce(v_base -> 'periodo', '{}'::jsonb) || jsonb_build_object(
      'data_corte', v_data_corte,
      'competencias_consideradas', v_competencias
    ),
    'professores', v_professores,
    'presenca', v_presenca_resumo,
    'carteira_carga', v_carteira_carga,
    'saidas_retencao', v_saidas,
    'matriculas_comerciais', v_matriculas - 'por_professor' - 'documentos',
    'origens', jsonb_build_object(
      'matriculas', v_matriculas -> 'documentos',
      'carteira', 'fechamentos_mensais_e_composicao_de_atividade_extra',
      'presenca', case
        when p_periodicidade = 'ciclo' and not v_periodo_oficial
          then 'fotografias_mensais_acumuladas'
        else 'fotografia_do_periodo'
      end,
      'saidas', 'movimentacoes_validas_nao_anuladas'
    ),
    'auditoria', (coalesce(v_base -> 'auditoria', '{}'::jsonb) - 'gerado_em')
      || jsonb_build_object(
        'contrato', 'relatorio-coordenacao-documento-4',
        'data_corte', v_data_corte
      )
  );
end;
$function$;

revoke all on function public.montar_relatorio_coordenacao_conteudo_v4(uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.montar_relatorio_coordenacao_conteudo_v4(uuid, integer, integer, text)
  to service_role;

comment on function public.montar_relatorio_coordenacao_conteudo_v4(uuid, integer, integer, text) is
  'Produtor privado do documento da Coordenacao. Preserva score e conversao da fotografia do painel; reconcilia carteira, presenca em ciclo aberto, matriculas e saidas antes da materializacao.';

commit;
