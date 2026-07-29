-- Corrige a tela de configuracao do Health Score V3 para resolver a versao
-- vigente pela competencia selecionada e preserva a origem exata do rascunho.
-- Tambem expoe o nome recebido do Emusys nas excecoes sem identidade local.

begin;

create or replace function public.fn_health_score_professor_v3_config_ui_competencia(
  p_competencia date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '60s'
as $function$
declare
  v_ativa_id uuid;
  v_rascunho_id uuid;
  v_config_diagnostico_id uuid;
  v_competencia date := date_trunc(
    'month',
    coalesce(
      p_competencia,
      (clock_timestamp() at time zone 'America/Sao_Paulo')::date
    )
  )::date;
  v_pendencias jsonb;
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();
  perform pg_advisory_xact_lock_shared(
    hashtextextended('health_score_professor_v3_config', 0)
  );

  select c.id into v_ativa_id
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and c.vigencia_inicio <= v_competencia
    and (c.vigencia_fim is null or c.vigencia_fim >= v_competencia)
  order by c.vigencia_inicio desc, c.versao desc
  limit 1;

  select c.id into v_rascunho_id
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'rascunho'
  order by c.versao desc
  limit 1;

  v_config_diagnostico_id := coalesce(v_rascunho_id, v_ativa_id);

  with detalhe as materialized (
    select d.*
    from public.get_health_score_professor_v3_metricas_segmentadas_v1(
      v_competencia,
      v_config_diagnostico_id,
      null,
      'mensal'
    ) d
    where v_config_diagnostico_id is not null
  ),
  segmentos_observados as (
    select
      d.unidade_id,
      d.curso_id,
      max(d.curso_nome)::text as curso_nome,
      d.modalidade,
      count(distinct d.professor_id)::integer as professores_afetados
    from detalhe d
    where d.config_meta_segmento_id is null
      and d.curso_id is not null
      and d.modalidade in ('individual', 'turma')
      and (
        d.vinculos_ativos > 0
        or d.turmas_elegiveis > 0
        or d.ocupacoes_unicas > 0
      )
    group by d.unidade_id, d.curso_id, d.modalidade
  ),
  atribuicoes_sem_meta as (
    select distinct on (d.atribuicao_id)
      d.atribuicao_id,
      d.professor_id,
      d.professor_nome,
      d.unidade_id,
      d.curso_id,
      d.curso_nome,
      d.modalidade
    from detalhe d
    where d.metrica = 'numero_alunos'
      and d.atribuicao_id is not null
      and d.atribuicao_pontuavel
      and d.config_meta_segmento_id is null
    order by d.atribuicao_id
  ),
  atribuicoes_zero as (
    select distinct on (d.atribuicao_id)
      d.atribuicao_id,
      d.professor_id,
      d.professor_nome,
      d.unidade_id,
      d.curso_id,
      d.curso_nome,
      d.modalidade,
      d.meta_aplicada
    from detalhe d
    where d.metrica = 'numero_alunos'
      and d.atribuicao_id is not null
      and d.estado_base = 'sem_base_zero_carteira'
    order by d.atribuicao_id
  ),
  divergencias as materialized (
    select r.*
    from public.get_professor_curso_modalidade_reconciliacao_v1(
      null,
      null
    ) r
    where r.estado in (
      'conflito_modalidade_jornada_aula',
      'modalidade_nao_resolvida'
    )
  )
  select jsonb_build_object(
    'segmentos_observados_sem_regra', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'unidade_id', s.unidade_id,
          'curso_id', s.curso_id,
          'curso_nome', s.curso_nome,
          'modalidade', s.modalidade,
          'professores_afetados', s.professores_afetados
        )
        order by s.unidade_id::text, s.curso_id, s.modalidade
      )
      from segmentos_observados s
    ), '[]'::jsonb),
    'atribuicoes_sem_regra', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'atribuicao_id', a.atribuicao_id,
          'professor_id', a.professor_id,
          'professor_nome', a.professor_nome,
          'unidade_id', a.unidade_id,
          'curso_id', a.curso_id,
          'curso_nome', a.curso_nome,
          'modalidade', a.modalidade
        )
        order by a.professor_nome, a.unidade_id::text, a.curso_id, a.modalidade
      )
      from atribuicoes_sem_meta a
    ), '[]'::jsonb),
    'atribuicoes_zero_carteira', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'atribuicao_id', a.atribuicao_id,
          'professor_id', a.professor_id,
          'professor_nome', a.professor_nome,
          'unidade_id', a.unidade_id,
          'curso_id', a.curso_id,
          'curso_nome', a.curso_nome,
          'modalidade', a.modalidade,
          'meta_carteira_curso', a.meta_aplicada
        )
        order by a.professor_nome, a.unidade_id::text, a.curso_id, a.modalidade
      )
      from atribuicoes_zero a
    ), '[]'::jsonb),
    'divergencias_modalidade', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'professor_id', d.professor_id,
          'professor_nome', d.professor_nome,
          'unidade_id', d.unidade_id,
          'unidade_nome', d.unidade_nome,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'estado', d.estado,
          'evidencias', d.evidencias
        )
        order by d.professor_nome, d.unidade_nome, d.curso_nome, d.modalidade
      )
      from divergencias d
    ), '[]'::jsonb)
  ) into v_pendencias;

  return jsonb_build_object(
    'competencia_referencia', v_competencia,
    'ativa', public.fn_health_score_professor_v3_config_json(v_ativa_id),
    'rascunho', public.fn_health_score_professor_v3_config_json(v_rascunho_id),
    'pendencias', coalesce(v_pendencias, jsonb_build_object(
      'segmentos_observados_sem_regra', '[]'::jsonb,
      'atribuicoes_sem_regra', '[]'::jsonb,
      'atribuicoes_zero_carteira', '[]'::jsonb,
      'divergencias_modalidade', '[]'::jsonb
    )),
    'modo', 'homologacao',
    'publicacao_produtiva', false
  );
end;
$function$;

revoke all on function public.fn_health_score_professor_v3_config_ui_competencia(date)
  from public, anon, authenticated;
grant execute on function public.fn_health_score_professor_v3_config_ui_competencia(date)
  to service_role;

create or replace function public.get_health_score_professor_v3_config_ui(
  p_competencia date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '60s'
as $function$
declare
  v_resultado jsonb;
begin
  v_resultado := public.fn_health_score_professor_v3_config_ui_competencia(
    p_competencia
  );

  return coalesce(v_resultado, '{}'::jsonb) || jsonb_build_object(
    'catalogo_segmentos',
    public.fn_health_score_professor_v3_catalogo_segmentos_v1()
  );
end;
$function$;

revoke all on function public.get_health_score_professor_v3_config_ui(date)
  from public, anon;
grant execute on function public.get_health_score_professor_v3_config_ui(date)
  to authenticated, service_role;

create or replace function public.get_health_score_professor_v3_config_ui()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
set statement_timeout = '60s'
as $function$
  select public.get_health_score_professor_v3_config_ui(
    date_trunc(
      'month',
      clock_timestamp() at time zone 'America/Sao_Paulo'
    )::date
  );
$function$;

revoke all on function public.get_health_score_professor_v3_config_ui()
  from public, anon;
grant execute on function public.get_health_score_professor_v3_config_ui()
  to authenticated, service_role;

create or replace function public.criar_health_score_professor_v3_config_rascunho(
  p_vigencia_inicio date,
  p_justificativa text,
  p_config_origem_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_ator integer;
  v_origem public.health_score_professor_v3_config_versoes%rowtype;
  v_existente_id uuid;
  v_origem_existente_id uuid;
  v_novo_id uuid;
  v_versao integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  if p_vigencia_inicio is null
     or p_vigencia_inicio <> date_trunc('month', p_vigencia_inicio)::date then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: vigencia deve iniciar no primeiro dia do mes';
  end if;
  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;
  if p_config_origem_id is null then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: configuracao de origem obrigatoria';
  end if;

  select c.* into v_origem
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_origem_id;

  if not found or v_origem.status <> 'ativa' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao ativa de origem inexistente';
  end if;
  if p_vigencia_inicio <= v_origem.vigencia_inicio then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: nova vigencia deve ser posterior a versao de origem';
  end if;

  select c.id into v_existente_id
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'rascunho'
  order by c.versao desc
  limit 1
  for update;

  if v_existente_id is not null then
    select nullif(m.parametros->>'clonado_da_config_id', '')::uuid
      into v_origem_existente_id
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = v_existente_id
      and m.parametros ? 'clonado_da_config_id'
    order by m.metrica
    limit 1;

    if v_origem_existente_id is distinct from p_config_origem_id then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: existe rascunho criado de outra versao';
    end if;

    return public.fn_health_score_professor_v3_config_json(v_existente_id)
      || jsonb_build_object(
        'rascunho_reutilizado', true,
        'config_origem_id', p_config_origem_id
      );
  end if;

  select coalesce(max(c.versao), 0) + 1 into v_versao
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
    criado_por
  ) values (
    v_versao,
    'rascunho',
    p_vigencia_inicio,
    null,
    v_origem.cobertura_minima,
    v_origem.faixa_atencao_min,
    v_origem.faixa_saudavel_min,
    v_origem.exige_pilar_fidelizacao,
    btrim(p_justificativa),
    v_ator
  ) returning id into v_novo_id;

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
    m.parametros || jsonb_build_object(
      'clonado_da_config_id', v_origem.id,
      'clonado_da_versao', v_origem.versao
    )
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = v_origem.id;

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
    m.parametros || jsonb_build_object(
      'clonado_da_config_id', v_origem.id,
      'clonado_da_versao', v_origem.versao
    )
  from public.health_score_professor_v3_config_metas_curso_modalidade m
  where m.config_id = v_origem.id;

  return public.fn_health_score_professor_v3_config_json(v_novo_id)
    || jsonb_build_object(
      'rascunho_reutilizado', false,
      'config_origem_id', p_config_origem_id
    );
end;
$function$;

revoke all on function public.criar_health_score_professor_v3_config_rascunho(
  date, text, uuid
) from public, anon;
grant execute on function public.criar_health_score_professor_v3_config_rascunho(
  date, text, uuid
) to authenticated, service_role;

create or replace function public.criar_health_score_professor_v3_config_rascunho(
  p_vigencia_inicio date,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_origem_id uuid;
  v_competencia date := date_trunc(
    'month',
    clock_timestamp() at time zone 'America/Sao_Paulo'
  )::date;
begin
  select c.id into v_origem_id
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and c.vigencia_inicio <= v_competencia
    and (c.vigencia_fim is null or c.vigencia_fim >= v_competencia)
  order by c.vigencia_inicio desc, c.versao desc
  limit 1;

  return public.criar_health_score_professor_v3_config_rascunho(
    p_vigencia_inicio,
    p_justificativa,
    v_origem_id
  );
end;
$function$;

revoke all on function public.criar_health_score_professor_v3_config_rascunho(
  date, text
) from public, anon;
grant execute on function public.criar_health_score_professor_v3_config_rascunho(
  date, text
) to authenticated, service_role;

alter function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) rename to get_prof_curso_modalidade_excecoes_v2_pre_nome_emusys;

revoke all on function public.get_prof_curso_modalidade_excecoes_v2_pre_nome_emusys(
  uuid, integer, boolean
) from public, anon, authenticated;
grant execute on function public.get_prof_curso_modalidade_excecoes_v2_pre_nome_emusys(
  uuid, integer, boolean
) to service_role;

create or replace function public.get_professor_curso_modalidade_excecoes_v2(
  p_unidade_id uuid default null,
  p_professor_id integer default null,
  p_incluir_auditoria boolean default false
)
returns table (
  excecao_id text,
  tipo text,
  acionavel boolean,
  unidade_id uuid,
  unidade_nome text,
  professor_id integer,
  professor_nome text,
  emusys_professor_id integer,
  curso_id integer,
  curso_nome text,
  emusys_disciplina_id integer,
  disciplina_nome text,
  modalidade text,
  motivo text,
  sugestao text,
  estado text,
  evidencias jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    base.excecao_id,
    base.tipo,
    base.acionavel,
    base.unidade_id,
    base.unidade_nome,
    base.professor_id,
    coalesce(base.professor_nome, origem.emusys_professor_nome) as professor_nome,
    base.emusys_professor_id,
    base.curso_id,
    base.curso_nome,
    base.emusys_disciplina_id,
    base.disciplina_nome,
    base.modalidade,
    base.motivo,
    base.sugestao,
    base.estado,
    base.evidencias || jsonb_strip_nulls(jsonb_build_object(
      'emusys_professor_nome', origem.emusys_professor_nome
    )) as evidencias
  from public.get_prof_curso_modalidade_excecoes_v2_pre_nome_emusys(
    p_unidade_id,
    p_professor_id,
    p_incluir_auditoria
  ) base
  left join lateral (
    select
      nullif(btrim(epd.payload_snapshot->>'nome'), '')::text
        as emusys_professor_nome
    from public.emusys_professor_disciplinas epd
    where epd.unidade_id = base.unidade_id
      and epd.emusys_professor_id = base.emusys_professor_id
    order by
      (epd.emusys_disciplina_id is not distinct from base.emusys_disciplina_id)
        desc,
      epd.ativo_origem desc,
      epd.ultimo_visto_em desc
    limit 1
  ) origem on true
  order by
    base.acionavel desc,
    base.unidade_nome,
    coalesce(base.professor_nome, origem.emusys_professor_nome) nulls last,
    base.disciplina_nome nulls last;
$function$;

revoke all on function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) from public, anon;
grant execute on function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_config_ui(date) is
  'Configuracao V3 resolvida pela competencia explicita; nao mistura versao futura com regras vigentes.';
comment on function public.criar_health_score_professor_v3_config_rascunho(
  date, text, uuid
) is 'Cria rascunho governado clonando a configuracao de origem explicitamente exibida.';
comment on function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) is 'Fila operacional V2 enriquecida com nome do professor recebido no payload oficial do Emusys.';

commit;
