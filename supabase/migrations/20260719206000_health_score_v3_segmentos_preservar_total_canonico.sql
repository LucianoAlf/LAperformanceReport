-- Gate 10: a segmentacao exclui projetos da pontuacao, mas o total visual da
-- carteira continua sendo o total canonico completo do professor/unidade.

do $preservar_implementacoes$
declare
  v_def text;
  v_copiada text;
begin
  drop function if exists
    public.hs_v3_segmentos_detalhe_base_canonica(
      date, uuid, uuid, text
    );
  drop function if exists
    public.hs_v3_segmentos_agregado_base_canonica(
      date, uuid, uuid, text
    );

  select pg_get_functiondef(
    'public.get_health_score_professor_v3_metricas_segmentadas_v1(date,uuid,uuid,text)'
      ::regprocedure::oid
  ) into v_def;
  v_copiada := replace(
    v_def,
    'CREATE OR REPLACE FUNCTION public.get_health_score_professor_v3_metricas_segmentadas_v1(',
    'CREATE OR REPLACE FUNCTION public.hs_v3_segmentos_detalhe_base_canonica('
  );
  if v_copiada = v_def then
    raise exception 'nao foi possivel preservar a RPC detalhada segmentada';
  end if;
  execute v_copiada;

  select pg_get_functiondef(
    'public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(date,uuid,uuid,text)'
      ::regprocedure::oid
  ) into v_def;
  v_copiada := replace(
    v_def,
    'CREATE OR REPLACE FUNCTION public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(',
    'CREATE OR REPLACE FUNCTION public.hs_v3_segmentos_agregado_base_canonica('
  );
  if v_copiada = v_def then
    raise exception 'nao foi possivel preservar a RPC agregada segmentada';
  end if;
  execute v_copiada;
end;
$preservar_implementacoes$;

create or replace function public.get_health_score_professor_v3_totais_carteira_canonica_v1(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  professor_id integer,
  unidade_id uuid,
  pessoas_unicas_total numeric,
  pessoas_fechamentos integer,
  meses_com_base integer,
  meses_com_base_consolidado integer,
  meses_no_periodo integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with periodo as (
    select
      p.periodo_inicio,
      least(
        p.periodo_fim,
        (date_trunc('month', p_competencia)::date
          + interval '1 month - 1 day')::date,
        (now() at time zone 'America/Sao_Paulo')::date
      ) as fim_recorte
    from public.fn_health_score_v3_periodo(
      p_competencia,
      p_periodicidade
    ) p
  ), meses as (
    select
      gs::date as competencia_mes,
      least(
        (gs + interval '1 month - 1 day')::date,
        p.fim_recorte
      ) as mes_fim
    from periodo p
    cross join lateral generate_series(
      p.periodo_inicio::timestamp,
      date_trunc('month', p.fim_recorte)::timestamp,
      interval '1 month'
    ) gs
  ), unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(
      p_unidade_id
    ) up
  ), mensal as (
    select
      m.competencia_mes,
      c.professor_id,
      c.unidade_id,
      c.carteira_alunos::integer as pessoas_unicas_total
    from meses m
    cross join lateral public.get_carteira_professor_periodo_canonica(
      extract(year from m.competencia_mes)::integer,
      extract(month from m.competencia_mes)::integer,
      p_unidade_id,
      m.competencia_mes,
      m.mes_fim
    ) c
    join unidades_permitidas up
      on up.unidade_id = c.unidade_id
  ), stats as (
    select count(*)::integer as meses_no_periodo
    from meses
  )
  select
    m.professor_id,
    m.unidade_id,
    round(avg(m.pessoas_unicas_total::numeric), 2)
      as pessoas_unicas_total,
    sum(m.pessoas_unicas_total)::integer as pessoas_fechamentos,
    count(*)::integer as meses_com_base,
    (
      select count(distinct mc.competencia_mes)::integer
      from mensal mc
      where mc.professor_id = m.professor_id
    ) as meses_com_base_consolidado,
    max(s.meses_no_periodo)::integer as meses_no_periodo
  from mensal m
  cross join stats s
  group by m.professor_id, m.unidade_id
  order by m.professor_id, m.unidade_id;
$$;

create or replace function public.get_health_score_professor_v3_metricas_segmentadas_v1(
  p_competencia date,
  p_config_id uuid,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  curso_id integer,
  curso_nome text,
  modalidade text,
  config_meta_segmento_id uuid,
  atribuicao_id uuid,
  atribuicao_formal boolean,
  atribuicao_pontuavel boolean,
  pessoas_unicas integer,
  pessoas_unicas_total numeric,
  pessoas_fechamentos integer,
  meses_com_base integer,
  meses_com_base_consolidado integer,
  meses_no_periodo integer,
  vinculos_ativos integer,
  turmas_elegiveis integer,
  ocupacoes_unicas integer,
  valor_observado numeric,
  capacidade_maxima numeric,
  meta_aplicada numeric,
  numerador numeric,
  denominador numeric,
  nota_segmento numeric,
  estado_base text,
  publicavel boolean,
  capacidade_excedida boolean,
  alertas_capacidade jsonb,
  fonte text,
  regra_versao text,
  linha_diagnostico boolean,
  dados_sem_resolucao integer,
  estados_resolucao jsonb,
  divergencias jsonb,
  detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with totais as (
    select *
    from public.get_health_score_professor_v3_totais_carteira_canonica_v1(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    )
  ), base as (
    select *
    from public.hs_v3_segmentos_detalhe_base_canonica(
      p_competencia,
      p_config_id,
      p_unidade_id,
      p_periodicidade
    )
  ), escopos_base as (
    select distinct b.professor_id, b.unidade_id
    from base b
  ), linhas as (
    select
      b.metrica,
      b.professor_id,
      b.professor_nome,
      b.unidade_id,
      b.competencia,
      b.curso_id,
      b.curso_nome,
      b.modalidade,
      b.config_meta_segmento_id,
      b.atribuicao_id,
      b.atribuicao_formal,
      b.atribuicao_pontuavel,
      b.pessoas_unicas,
      coalesce(t.pessoas_unicas_total, b.pessoas_unicas_total),
      coalesce(t.pessoas_fechamentos, b.pessoas_fechamentos),
      coalesce(t.meses_com_base, b.meses_com_base),
      coalesce(
        t.meses_com_base_consolidado,
        b.meses_com_base_consolidado
      ),
      coalesce(t.meses_no_periodo, b.meses_no_periodo),
      b.vinculos_ativos,
      b.turmas_elegiveis,
      b.ocupacoes_unicas,
      b.valor_observado,
      b.capacidade_maxima,
      b.meta_aplicada,
      b.numerador,
      b.denominador,
      b.nota_segmento,
      b.estado_base,
      b.publicavel,
      b.capacidade_excedida,
      b.alertas_capacidade,
      b.fonte || '+get_carteira_professor_periodo_canonica',
      'health-score-professor-v3-metricas-segmentadas-2'::text,
      b.linha_diagnostico,
      b.dados_sem_resolucao,
      b.estados_resolucao,
      b.divergencias,
      coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
        'pessoas_unicas_total',
          coalesce(t.pessoas_unicas_total, b.pessoas_unicas_total),
        'pessoas_fechamentos',
          coalesce(t.pessoas_fechamentos, b.pessoas_fechamentos),
        'total_visual_fonte', 'get_carteira_professor_periodo_canonica',
        'projetos_excluidos_apenas_da_pontuacao', true
      )
    from base b
    left join totais t
      on t.professor_id = b.professor_id
     and t.unidade_id = b.unidade_id

    union all

    select
      m.metrica,
      t.professor_id,
      p.nome::text,
      t.unidade_id,
      date_trunc('month', p_competencia)::date,
      null::integer,
      null::text,
      null::text,
      null::uuid,
      null::uuid,
      false,
      false,
      0::integer,
      t.pessoas_unicas_total,
      t.pessoas_fechamentos,
      t.meses_com_base,
      t.meses_com_base_consolidado,
      t.meses_no_periodo,
      0::integer,
      0::integer,
      0::integer,
      case
        when m.metrica = 'numero_alunos' then t.pessoas_unicas_total
      end,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      case
        when m.metrica = 'numero_alunos'
          then 'projeto_sem_segmento_pontuavel'
        else 'sem_base_sem_turmas'
      end::text,
      false,
      false,
      '[]'::jsonb,
      'get_carteira_professor_periodo_canonica'
        '+projeto_sem_segmento_pontuavel'::text,
      'health-score-professor-v3-metricas-segmentadas-2'::text,
      true,
      0::integer,
      '[]'::jsonb,
      jsonb_build_object('projeto_sem_segmento_pontuavel', true),
      jsonb_build_object(
        'nome_exibicao', case
          when m.metrica = 'numero_alunos' then 'Carteira por curso'
          else 'Media de alunos por turma'
        end,
        'periodicidade', p_periodicidade,
        'config_id', p_config_id,
        'pessoas_unicas_total', t.pessoas_unicas_total,
        'pessoas_fechamentos', t.pessoas_fechamentos,
        'meses_com_base', t.meses_com_base,
        'meses_com_base_consolidado', t.meses_com_base_consolidado,
        'meses_no_periodo', t.meses_no_periodo,
        'total_visual_fonte', 'get_carteira_professor_periodo_canonica',
        'projeto_sem_segmento_pontuavel', true,
        'valor_real_preservado', true
      )
    from totais t
    join public.professores p on p.id = t.professor_id
    cross join (
      values ('media_turma'::text), ('numero_alunos'::text)
    ) m(metrica)
    where not exists (
      select 1
      from escopos_base eb
      where eb.professor_id = t.professor_id
        and eb.unidade_id = t.unidade_id
    )
  )
  select *
  from linhas
  order by professor_id, unidade_id, metrica, curso_id nulls last,
    modalidade nulls last;
$$;

create or replace function public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  p_competencia date,
  p_config_id uuid,
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
  detalhes jsonb,
  nota numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with totais_unidade as (
    select *
    from public.get_health_score_professor_v3_totais_carteira_canonica_v1(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    )
  ), totais_saida as (
    select
      t.professor_id,
      p_unidade_id as unidade_id,
      case
        when sum(t.pessoas_fechamentos) = 0 then 0::numeric
        when p_unidade_id is null then round(
          sum(t.pessoas_fechamentos)::numeric
            / nullif(max(t.meses_com_base_consolidado), 0),
          2
        )
        else max(t.pessoas_unicas_total)
      end as pessoas_unicas_total,
      sum(t.pessoas_fechamentos)::integer as pessoas_fechamentos,
      max(t.meses_com_base)::integer as meses_com_base,
      max(t.meses_com_base_consolidado)::integer
        as meses_com_base_consolidado,
      max(t.meses_no_periodo)::integer as meses_no_periodo
    from totais_unidade t
    group by t.professor_id
  ), base as (
    select *
    from public.hs_v3_segmentos_agregado_base_canonica(
      p_competencia,
      p_config_id,
      p_unidade_id,
      p_periodicidade
    )
  ), escopos_base as (
    select distinct b.professor_id, b.unidade_id
    from base b
  ), linhas as (
    select
      b.metrica,
      b.professor_id,
      b.professor_nome,
      b.unidade_id,
      b.competencia,
      case
        when b.metrica = 'numero_alunos'
          then coalesce(t.pessoas_unicas_total, b.valor_bruto)
        else b.valor_bruto
      end,
      b.numerador,
      b.denominador,
      b.amostra,
      b.estado_base,
      b.publicavel,
      b.confianca,
      b.fonte || '+get_carteira_professor_periodo_canonica',
      'health-score-professor-v3-metricas-segmentadas-agregadas-2'::text,
      b.motivo_sem_base,
      coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
        'pessoas_unicas_total',
          coalesce(t.pessoas_unicas_total, b.valor_bruto),
        'pessoas_fechamentos', t.pessoas_fechamentos,
        'meses_com_base', t.meses_com_base,
        'meses_com_base_consolidado', t.meses_com_base_consolidado,
        'meses_no_periodo', t.meses_no_periodo,
        'total_visual_fonte', 'get_carteira_professor_periodo_canonica',
        'projetos_excluidos_apenas_da_pontuacao', true
      ),
      b.nota
    from base b
    left join totais_saida t
      on t.professor_id = b.professor_id
     and t.unidade_id is not distinct from b.unidade_id

    union all

    select
      m.metrica,
      t.professor_id,
      p.nome::text,
      t.unidade_id,
      date_trunc('month', p_competencia)::date,
      case
        when m.metrica = 'numero_alunos' then t.pessoas_unicas_total
      end,
      null::numeric,
      null::numeric,
      0::integer,
      case
        when m.metrica = 'numero_alunos'
          then 'projeto_sem_segmento_pontuavel'
        else 'sem_base_sem_turmas'
      end::text,
      false,
      'sem_base'::text,
      'get_carteira_professor_periodo_canonica'
        '+projeto_sem_segmento_pontuavel'::text,
      'health-score-professor-v3-metricas-segmentadas-agregadas-2'::text,
      case
        when m.metrica = 'numero_alunos'
          then 'carteira visivel composta apenas por projeto; fora da pontuacao segmentada'
        else 'professor sem turma regular elegivel no periodo'
      end::text,
      jsonb_build_object(
        'nome_exibicao', case
          when m.metrica = 'numero_alunos' then 'Carteira por curso'
          else 'Media de alunos por turma'
        end,
        'periodicidade', p_periodicidade,
        'config_id', p_config_id,
        'pessoas_unicas_total', t.pessoas_unicas_total,
        'pessoas_fechamentos', t.pessoas_fechamentos,
        'meses_com_base', t.meses_com_base,
        'meses_com_base_consolidado', t.meses_com_base_consolidado,
        'meses_no_periodo', t.meses_no_periodo,
        'total_visual_fonte', 'get_carteira_professor_periodo_canonica',
        'projeto_sem_segmento_pontuavel', true,
        'valor_real_preservado', true,
        'apta_oficial', false
      ),
      null::numeric
    from totais_saida t
    join public.professores p on p.id = t.professor_id
    cross join (
      values ('media_turma'::text), ('numero_alunos'::text)
    ) m(metrica)
    where not exists (
      select 1
      from escopos_base eb
      where eb.professor_id = t.professor_id
        and eb.unidade_id is not distinct from t.unidade_id
    )
  )
  select *
  from linhas
  order by professor_id, metrica;
$$;

comment on function
  public.get_health_score_professor_v3_totais_carteira_canonica_v1(
    date, uuid, text
  ) is
  'Total visual canonico da carteira, incluindo projetos; uso interno do Health Score V3.';
comment on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date, uuid, uuid, text
  ) is
  'Detalhe segmentado V3: projetos ficam fora da pontuacao, sem reduzir a carteira visual canonica.';
comment on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
    date, uuid, uuid, text
  ) is
  'Agregado segmentado V3 com total visual canonico e componentes pontuaveis sem projetos.';

revoke all on function
  public.get_health_score_professor_v3_totais_carteira_canonica_v1(
    date, uuid, text
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.hs_v3_segmentos_detalhe_base_canonica(
    date, uuid, uuid, text
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.hs_v3_segmentos_agregado_base_canonica(
    date, uuid, uuid, text
  ) from public, anon, authenticated, service_role;

revoke all on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date, uuid, uuid, text
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date, uuid, uuid, text
  ) to service_role;

revoke all on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
    date, uuid, uuid, text
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
    date, uuid, uuid, text
  ) to service_role;
