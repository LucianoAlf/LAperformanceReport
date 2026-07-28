-- Permite criar a revisao Jun-Ago a partir da configuracao ativa que contem
-- a matriz segmentada homologada, mesmo quando essa origem vigora em outro
-- ciclo. O destino continua rigidamente limitado a Jun-Ago/2026.

create or replace function public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
  p_config_origem_id uuid,
  p_vigencia_inicio date,
  p_vigencia_fim date,
  p_justificativa text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_ator integer;
  v_origem public.health_score_professor_v3_config_versoes%rowtype;
  v_existente public.health_score_professor_v3_config_versoes%rowtype;
  v_novo_id uuid;
  v_versao integer;
  v_chave_criacao text;
  v_justificativa text;
  v_total_metricas integer;
  v_metricas_distintas integer;
  v_peso_total numeric;
  v_metricas_clonadas integer;
  v_metas_pedagogicas integer;
  v_metas_clonadas integer;
  v_segmentos_faltantes integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  if p_config_origem_id is null then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: configuracao de origem explicita obrigatoria';
  end if;
  if p_vigencia_inicio is distinct from date '2026-06-01'
     or p_vigencia_fim is distinct from date '2026-08-31' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: revisao deve cobrir exatamente 2026-06-01 a 2026-08-31';
  end if;
  if nullif(btrim(p_justificativa), '') is null then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;

  v_justificativa := btrim(p_justificativa);
  v_chave_criacao := md5(jsonb_build_object(
    'operacao', 'revisao_ciclo_aberto_v1',
    'config_origem_id', p_config_origem_id,
    'vigencia_inicio', p_vigencia_inicio,
    'vigencia_fim', p_vigencia_fim,
    'justificativa', v_justificativa,
    'ator', v_ator
  )::text);

  select c.* into v_existente
  from public.health_score_professor_v3_config_versoes c
  where c.chave_criacao_governada = v_chave_criacao
  for share;

  if found then
    if v_existente.status not in ('rascunho', 'ativa')
       or v_existente.vigencia_inicio is distinct from p_vigencia_inicio
       or v_existente.vigencia_fim is distinct from p_vigencia_fim
       or v_existente.justificativa is distinct from v_justificativa
       or v_existente.criado_por is distinct from v_ator then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de criacao encontrou estado incoerente';
    end if;

    select count(*)
      into v_metas_clonadas
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    where m.config_id = v_existente.id;

    return public.fn_health_score_professor_v3_config_json(v_existente.id)
      || jsonb_build_object(
        'config_origem_id', p_config_origem_id,
        'matriz_pedagogica_clonada', v_metas_clonadas,
        'ja_existente', true
      );
  end if;

  select c.* into v_origem
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_origem_id
  for share;

  if not found or v_origem.status <> 'ativa' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: origem explicita deve estar ativa';
  end if;

  select count(*), count(distinct m.metrica), sum(m.peso)
    into v_total_metricas, v_metricas_distintas, v_peso_total
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = p_config_origem_id
    and m.metrica in (
      'conversao',
      'media_turma',
      'numero_alunos',
      'permanencia',
      'presenca',
      'retencao'
    );

  if v_total_metricas <> 6
     or v_metricas_distintas <> 6
     or v_peso_total <> 100
     or exists (
       select 1
       from public.health_score_professor_v3_config_metricas m
       where m.config_id = p_config_origem_id
         and m.metrica not in (
           'conversao',
           'media_turma',
           'numero_alunos',
           'permanencia',
           'presenca',
           'retencao'
         )
     ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: origem exige seis metricas canonicas e peso total 100';
  end if;

  select count(*)
    into v_metas_pedagogicas
  from public.health_score_professor_v3_config_metas_curso_modalidade m
  join public.cursos curso
    on curso.id = m.curso_id
   and curso.natureza_operacional = 'pedagogica'
  where m.config_id = p_config_origem_id;

  if v_metas_pedagogicas = 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: origem nao possui matriz pedagogica segmentada';
  end if;

  select count(*)
    into v_segmentos_faltantes
  from (
    select distinct
      a.unidade_id,
      a.curso_id,
      a.modalidade
    from public.professor_unidade_curso_modalidade a
    join public.cursos curso
      on curso.id = a.curso_id
     and curso.natureza_operacional = 'pedagogica'
    where a.status = 'ativo'
      and a.vigencia_fim is null
      and a.confianca in ('alta', 'revisada')
  ) segmento
  left join public.health_score_professor_v3_config_metas_curso_modalidade m
    on m.config_id = p_config_origem_id
   and m.unidade_id = segmento.unidade_id
   and m.curso_id = segmento.curso_id
   and m.modalidade = segmento.modalidade
   and m.estado = 'configurada'
  where m.id is null;

  if v_segmentos_faltantes > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: origem possui % segmento(s) pedagogico(s) formal(is) sem meta configurada',
      v_segmentos_faltantes;
  end if;

  select coalesce(max(c.versao), 0) + 1
    into v_versao
  from public.health_score_professor_v3_config_versoes c;

  insert into public.health_score_professor_v3_config_versoes (
    versao,
    status,
    vigencia_inicio,
    vigencia_fim,
    cobertura_minima,
    faixa_atencao_min,
    faixa_saudavel_min,
    exige_pilar_fidelizacao,
    justificativa,
    chave_criacao_governada,
    criado_por
  ) values (
    v_versao,
    'rascunho',
    date '2026-06-01',
    date '2026-08-31',
    v_origem.cobertura_minima,
    v_origem.faixa_atencao_min,
    v_origem.faixa_saudavel_min,
    v_origem.exige_pilar_fidelizacao,
    v_justificativa,
    v_chave_criacao,
    v_ator
  )
  returning id into v_novo_id;

  insert into public.health_score_professor_v3_config_metricas (
    config_id,
    metrica,
    peso,
    meta,
    amostra_minima,
    cobertura_minima,
    parametros
  )
  select
    v_novo_id,
    m.metrica,
    m.peso,
    m.meta,
    m.amostra_minima,
    m.cobertura_minima,
    m.parametros
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = p_config_origem_id
    and m.metrica in (
      'conversao',
      'media_turma',
      'numero_alunos',
      'permanencia',
      'presenca',
      'retencao'
    );
  get diagnostics v_metricas_clonadas = row_count;

  if v_metricas_clonadas <> 6 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: clone das seis metricas ficou incompleto';
  end if;

  insert into public.health_score_professor_v3_config_metas_curso_modalidade (
    config_id,
    unidade_id,
    curso_id,
    modalidade,
    estado,
    capacidade_maxima,
    meta_media_turma,
    meta_carteira_curso,
    parametros
  )
  select
    v_novo_id,
    m.unidade_id,
    m.curso_id,
    m.modalidade,
    m.estado,
    m.capacidade_maxima,
    m.meta_media_turma,
    m.meta_carteira_curso,
    m.parametros
  from public.health_score_professor_v3_config_metas_curso_modalidade m
  join public.cursos curso
    on curso.id = m.curso_id
   and curso.natureza_operacional = 'pedagogica'
  where m.config_id = p_config_origem_id;
  get diagnostics v_metas_clonadas = row_count;

  if v_metas_clonadas <> v_metas_pedagogicas then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: clone da matriz pedagogica ficou incompleto';
  end if;

  return public.fn_health_score_professor_v3_config_json(v_novo_id)
    || jsonb_build_object(
      'config_origem_id', p_config_origem_id,
      'matriz_pedagogica_clonada', v_metas_clonadas,
      'ja_existente', false
    );
end;
$function$;

revoke all on function
  public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
    uuid, date, date, text
  )
from public, anon;

grant execute on function
  public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
    uuid, date, date, text
  )
to authenticated, service_role;

comment on function
  public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
    uuid, date, date, text
  ) is
  'Cria revisao governada Jun-Ago a partir de uma configuracao ativa com matriz pedagogica completa, sem exigir que a origem pertença ao mesmo ciclo.';
