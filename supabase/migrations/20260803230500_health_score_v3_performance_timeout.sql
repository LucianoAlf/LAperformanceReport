-- Remove duas leituras redundantes do caminho vivo do Health Score V3.
--
-- 1. No periodo aberto, o detalhe segmentado ja contem a evidencia necessaria
--    para calcular media/turma. A funcao anterior relia toda a carteira
--    historica apenas para sobrescreve-la, em seguida, pela carteira viva.
-- 2. O roteador mensal/ciclo atravessava dois wrappers historicos e calculava
--    conversao ate tres vezes. O produtor passa a chamar a base auditada uma
--    unica vez e acrescenta somente a conversao da periodicidade solicitada.

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
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_competencia_atual date := date_trunc(
    'month', now() at time zone 'America/Sao_Paulo'
  )::date;
begin
  if v_competencia = v_competencia_atual then
    return query
    select d.*
    from public.hs_v3_segmentos_detalhe_base_canonica(
      p_competencia,
      p_config_id,
      p_unidade_id,
      p_periodicidade
    ) d
    left join public.cursos c on c.id = d.curso_id
    where d.metrica not in ('media_turma', 'numero_alunos')
       or c.natureza_operacional = 'pedagogica'
    order by
      d.professor_id,
      d.unidade_id,
      d.metrica,
      d.curso_id nulls last,
      d.modalidade nulls last;
    return;
  end if;

  return query
  select d.*
  from public.hs_v3_metricas_segmentadas_pre_cursos_pedagogicos_v1(
    p_competencia,
    p_config_id,
    p_unidade_id,
    p_periodicidade
  ) d
  order by
    d.professor_id,
    d.unidade_id,
    d.metrica,
    d.curso_id nulls last,
    d.modalidade nulls last;
end;
$function$;

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
as $function$
begin
  if p_periodicidade = 'mensal' then
    return query
    select b.*
    from public.get_health_score_prof_v3_metricas_base_20260728_c95(
      p_competencia,
      p_unidade_id,
      'mensal'
    ) b
    where b.metrica <> 'conversao'

    union all

    select c.*
    from public.get_health_score_professor_v3_conversao_mensal(
      p_competencia,
      p_unidade_id
    ) c;
    return;
  end if;

  if p_periodicidade = 'ciclo' then
    return query
    select b.*
    from public.get_health_score_prof_v3_metricas_base_20260728_c95(
      p_competencia,
      p_unidade_id,
      'ciclo'
    ) b
    where b.metrica <> 'conversao'

    union all

    select c.*
    from public.get_health_score_professor_v3_conversao_ciclo(
      p_competencia,
      p_unidade_id
    ) c;
    return;
  end if;

  raise exception 'HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA: use mensal ou ciclo'
    using errcode = '22023';
end;
$function$;

revoke all on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date, uuid, uuid, text
  ) from public, anon, authenticated;

grant execute on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date, uuid, uuid, text
  ) to service_role;

revoke all on function
  public.get_health_score_professor_v3_metricas_periodo(
    date, uuid, text
  ) from public, anon;

grant execute on function
  public.get_health_score_professor_v3_metricas_periodo(
    date, uuid, text
  ) to authenticated, service_role;

comment on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date, uuid, uuid, text
  ) is
  'Metricas segmentadas V3. No periodo aberto agrega o detalhe canonico e deixa a carteira viva para o produtor de periodo aberto; no historico preserva a fonte auditada.';

comment on function
  public.get_health_score_professor_v3_metricas_periodo(
    date, uuid, text
  ) is
  'Produtor mensal/ciclo V3 sem wrappers redundantes: uma leitura da base auditada e uma conversao da periodicidade solicitada.';
