-- Health Score Professor V3 - configuracao segmentada, Task 6.
-- Evolui o ciclo governado sem ativar configuracao nem recalcular snapshots.

create or replace function public.fn_health_score_professor_v3_config_json(
  p_config_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when c.id is null then null else jsonb_build_object(
    'id', c.id,
    'versao', c.versao,
    'status', c.status,
    'vigencia_inicio', c.vigencia_inicio,
    'vigencia_fim', c.vigencia_fim,
    'cobertura_minima', c.cobertura_minima,
    'faixa_atencao_min', c.faixa_atencao_min,
    'faixa_saudavel_min', c.faixa_saudavel_min,
    'exige_pilar_fidelizacao', c.exige_pilar_fidelizacao,
    'justificativa', c.justificativa,
    'criado_em', c.criado_em,
    'ativado_em', c.ativado_em,
    'metricas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'metrica', m.metrica,
          'peso', m.peso,
          'meta', m.meta,
          'meta_status', coalesce(m.parametros->>'meta_status', 'rascunho'),
          'amostra_minima', m.amostra_minima,
          'cobertura_minima', m.cobertura_minima,
          'parametros', m.parametros
        )
        order by case m.metrica
          when 'retencao' then 1
          when 'permanencia' then 2
          when 'conversao' then 3
          when 'media_turma' then 4
          when 'numero_alunos' then 5
          when 'presenca' then 6
        end
      )
      from public.health_score_professor_v3_config_metricas m
      where m.config_id = c.id
    ), '[]'::jsonb),
    'metas_segmentadas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'config_id', m.config_id,
          'unidade_id', m.unidade_id,
          'unidade_nome', u.nome,
          'curso_id', m.curso_id,
          'curso_nome', curso.nome,
          'modalidade', m.modalidade,
          'estado', m.estado,
          'capacidade_maxima', m.capacidade_maxima,
          'meta_media_turma', m.meta_media_turma,
          'meta_carteira_curso', m.meta_carteira_curso,
          'parametros', m.parametros,
          'criado_em', m.criado_em,
          'atualizado_em', m.atualizado_em
        )
        order by m.unidade_id::text, m.curso_id, m.modalidade
      )
      from public.health_score_professor_v3_config_metas_curso_modalidade m
      join public.unidades u on u.id = m.unidade_id
      join public.cursos curso on curso.id = m.curso_id
      where m.config_id = c.id
    ), '[]'::jsonb)
  ) end
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id;
$$;

create or replace function public.get_health_score_professor_v3_config_ui()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ativa_id uuid;
  v_rascunho_id uuid;
  v_config_diagnostico_id uuid;
  v_competencia date := date_trunc(
    'month',
    clock_timestamp() at time zone 'America/Sao_Paulo'
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
  ), segmentos_observados as (
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
  ), atribuicoes_sem_meta as (
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
  ), atribuicoes_zero as (
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
  ), divergencias as materialized (
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
$$;

create or replace function public.criar_health_score_professor_v3_config_rascunho(
  p_vigencia_inicio date,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ator integer;
  v_origem public.health_score_professor_v3_config_versoes%rowtype;
  v_existente_id uuid;
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

  select c.id into v_existente_id
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'rascunho'
  order by c.versao desc
  limit 1
  for update;

  if v_existente_id is not null then
    return public.fn_health_score_professor_v3_config_json(v_existente_id)
      || jsonb_build_object('rascunho_reutilizado', true);
  end if;

  select c.* into v_origem
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
  order by c.vigencia_inicio desc, c.versao desc
  limit 1;

  if not found then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao ativa de origem inexistente';
  end if;
  if p_vigencia_inicio <= v_origem.vigencia_inicio then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: nova vigencia deve ser posterior a versao de origem';
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
    || jsonb_build_object('rascunho_reutilizado', false);
end;
$$;

create or replace function public.salvar_health_score_professor_v3_config_rascunho(
  p_config_id uuid,
  p_vigencia_inicio date,
  p_justificativa text,
  p_metricas jsonb,
  p_metas_segmentadas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ator integer;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_total_metricas integer;
  v_peso_total numeric;
  v_total_segmentos integer;
  v_segmentos_distintos integer;
  v_modo_segmentado boolean;
  v_metricas_atualizadas integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found or v_config.status <> 'rascunho' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser salvo';
  end if;
  if p_vigencia_inicio is null
     or p_vigencia_inicio <> date_trunc('month', p_vigencia_inicio)::date then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: vigencia deve iniciar no primeiro dia do mes';
  end if;
  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;
  if p_metricas is null
     or jsonb_typeof(p_metricas) is distinct from 'array'
     or jsonb_array_length(p_metricas) <> 6 then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: exige seis pilares';
  end if;
  if p_metas_segmentadas is null
     or jsonb_typeof(p_metas_segmentadas) is distinct from 'array' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: matriz segmentada deve ser uma lista';
  end if;

  v_modo_segmentado := jsonb_array_length(p_metas_segmentadas) > 0
    or exists (
      select 1
      from public.health_score_professor_v3_config_metricas m
      where m.config_id = p_config_id
        and m.metrica in ('media_turma', 'numero_alunos')
        and m.parametros->>'normalizacao'
          = 'segmentada_unidade_curso_modalidade'
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_metricas) as x(
        metrica text,
        peso numeric,
        meta numeric,
        meta_status text,
        parametros jsonb
      )
      where x.metrica in ('media_turma', 'numero_alunos')
        and x.parametros->>'normalizacao'
          = 'segmentada_unidade_curso_modalidade'
    );

  with recebidas as (
    select *
    from jsonb_to_recordset(p_metricas) as x(
      metrica text,
      peso numeric,
      meta numeric,
      meta_status text,
      parametros jsonb
    )
  )
  select count(distinct r.metrica), sum(r.peso)
    into v_total_metricas, v_peso_total
  from recebidas r;

  if v_total_metricas <> 6 or v_peso_total <> 100 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: seis metricas e soma de pesos 100 obrigatorias';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_metricas) as x(
      metrica text,
      peso numeric,
      meta numeric,
      meta_status text,
      parametros jsonb
    )
    where x.metrica not in (
      'retencao',
      'permanencia',
      'conversao',
      'media_turma',
      'numero_alunos',
      'presenca'
    )
      or x.peso is null
      or x.peso not between 1 and 100
      or (
        v_modo_segmentado
        and x.metrica in ('media_turma', 'numero_alunos')
        and x.meta is not null
      )
      or (
        not (
          v_modo_segmentado
          and x.metrica in ('media_turma', 'numero_alunos')
        )
        and (
          (x.meta is not null and x.meta <= 0)
          or (
            x.meta is null
            and coalesce(x.meta_status, '') not in (
              'rascunho',
              'em_calibracao',
              'aguardando_dados_reais',
              'bloqueada_ate_inicio'
            )
          )
          or (
            x.meta is not null
            and x.meta_status is distinct from 'aprovada'
          )
        )
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: peso, meta ou estado incoerente';
  end if;

  with recebidas as (
    select *
    from jsonb_to_recordset(p_metas_segmentadas) as x(
      unidade_id uuid,
      curso_id integer,
      modalidade text,
      estado text,
      capacidade_maxima numeric,
      meta_media_turma numeric,
      meta_carteira_curso numeric,
      parametros jsonb
    )
  )
  select
    count(*),
    count(distinct row(r.unidade_id, r.curso_id, r.modalidade))
    into v_total_segmentos, v_segmentos_distintos
  from recebidas r;

  if v_total_segmentos <> v_segmentos_distintos then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: segmento duplicado na matriz';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_metas_segmentadas) as r(
      unidade_id uuid,
      curso_id integer,
      modalidade text,
      estado text,
      capacidade_maxima numeric,
      meta_media_turma numeric,
      meta_carteira_curso numeric,
      parametros jsonb
    )
    where r.unidade_id is null
      or r.curso_id is null
      or r.modalidade is null
      or r.modalidade not in ('individual', 'turma')
      or r.estado not in ('configurada', 'nao_ofertada')
      or not exists (
        select 1
        from public.unidades u
        where u.id = r.unidade_id
      )
      or not exists (
        select 1
        from public.cursos c
        where c.id = r.curso_id
          and not coalesce(c.is_projeto_banda, false)
      )
      or (
        r.estado = 'configurada'
        and (
          r.capacidade_maxima is null
          or r.meta_media_turma is null
          or r.meta_carteira_curso is null
          or r.capacidade_maxima <= 0
          or r.meta_media_turma <= 0
          or r.meta_carteira_curso <= 0
          or r.meta_media_turma > r.capacidade_maxima
        )
      )
      or (
        r.estado = 'nao_ofertada'
        and (
          r.capacidade_maxima is not null
          or r.meta_media_turma is not null
          or r.meta_carteira_curso is not null
        )
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: unidade, curso, modalidade, estado ou metas invalidos';
  end if;

  update public.health_score_professor_v3_config_versoes
  set vigencia_inicio = p_vigencia_inicio,
      justificativa = btrim(p_justificativa),
      criado_por = coalesce(criado_por, v_ator),
      atualizado_em = now()
  where id = p_config_id;

  with recebidas as (
    select *
    from jsonb_to_recordset(p_metricas) as x(
      metrica text,
      peso numeric,
      meta numeric,
      meta_status text,
      parametros jsonb
    )
  )
  update public.health_score_professor_v3_config_metricas m
  set peso = r.peso,
      meta = case
        when v_modo_segmentado
          and r.metrica in ('media_turma', 'numero_alunos') then null
        else r.meta
      end,
      parametros = case
        when v_modo_segmentado
          and r.metrica in ('media_turma', 'numero_alunos') then
          (
            m.parametros
            - 'meta_status'
            - 'meta_autoridade'
            - 'meta_aprovada_em'
            - 'normalizacao'
          ) || jsonb_build_object(
            'meta_status', 'aprovada',
            'meta_autoridade', 'usuario_id:' || v_ator::text,
            'meta_aprovada_em', current_date::text,
            'normalizacao', 'segmentada_unidade_curso_modalidade'
          )
        else
          (
            m.parametros
            - 'meta_status'
            - 'meta_autoridade'
            - 'meta_aprovada_em'
          ) || jsonb_build_object(
            'meta_status', r.meta_status,
            'meta_autoridade', case
              when r.meta is not null then 'usuario_id:' || v_ator::text
            end,
            'meta_aprovada_em', case
              when r.meta is not null then current_date::text
            end
          )
      end,
      atualizado_em = now()
  from recebidas r
  where m.config_id = p_config_id
    and m.metrica = r.metrica;
  get diagnostics v_metricas_atualizadas = row_count;

  if v_metricas_atualizadas <> 6 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: rascunho nao possui os seis pilares persistidos';
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
    p_config_id,
    r.unidade_id,
    r.curso_id,
    r.modalidade,
    r.estado,
    r.capacidade_maxima,
    r.meta_media_turma,
    r.meta_carteira_curso,
    coalesce(r.parametros, '{}'::jsonb)
      || jsonb_build_object(
        'ultima_alteracao_por', v_ator,
        'ultima_alteracao_em', now()
      )
  from jsonb_to_recordset(p_metas_segmentadas) as r(
    unidade_id uuid,
    curso_id integer,
    modalidade text,
    estado text,
    capacidade_maxima numeric,
    meta_media_turma numeric,
    meta_carteira_curso numeric,
    parametros jsonb
  )
  on conflict (config_id, unidade_id, curso_id, modalidade) do update
  set estado = excluded.estado,
      capacidade_maxima = excluded.capacidade_maxima,
      meta_media_turma = excluded.meta_media_turma,
      meta_carteira_curso = excluded.meta_carteira_curso,
      parametros = excluded.parametros,
      atualizado_em = now();

  delete from public.health_score_professor_v3_config_metas_curso_modalidade m
  where m.config_id = p_config_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_metas_segmentadas) as r(
        unidade_id uuid,
        curso_id integer,
        modalidade text
      )
      where r.unidade_id = m.unidade_id
        and r.curso_id = m.curso_id
        and r.modalidade = m.modalidade
    );

  return public.fn_health_score_professor_v3_config_json(p_config_id);
end;
$$;

create or replace function public.salvar_health_score_professor_v3_config_rascunho(
  p_config_id uuid,
  p_vigencia_inicio date,
  p_justificativa text,
  p_metricas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_metas_segmentadas jsonb;
  v_metricas_compat jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  perform public.fn_health_score_professor_v3_ator_gerenciador();
  perform 1
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'unidade_id', m.unidade_id,
        'curso_id', m.curso_id,
        'modalidade', m.modalidade,
        'estado', m.estado,
        'capacidade_maxima', m.capacidade_maxima,
        'meta_media_turma', m.meta_media_turma,
        'meta_carteira_curso', m.meta_carteira_curso,
        'parametros', m.parametros
      )
      order by m.unidade_id::text, m.curso_id, m.modalidade
    ),
    '[]'::jsonb
  ) into v_metas_segmentadas
  from public.health_score_professor_v3_config_metas_curso_modalidade m
  where m.config_id = p_config_id;

  if jsonb_array_length(v_metas_segmentadas) > 0 then
    select coalesce(
      jsonb_agg(
        case
          when e.item->>'metrica' in ('media_turma', 'numero_alunos') then
            e.item || jsonb_build_object(
              'meta', null::numeric,
              'meta_status', 'aprovada'
            )
          else e.item
        end
        order by e.ordem
      ),
      '[]'::jsonb
    ) into v_metricas_compat
    from jsonb_array_elements(p_metricas) with ordinality
      as e(item, ordem);
  else
    v_metricas_compat := p_metricas;
  end if;

  return public.salvar_health_score_professor_v3_config_rascunho(
    p_config_id,
    p_vigencia_inicio,
    p_justificativa,
    v_metricas_compat,
    v_metas_segmentadas
  );
end;
$$;

create or replace function public.fn_health_score_professor_v3_config_fingerprint(
  p_config_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(jsonb_build_object(
    'config_id', c.id,
    'versao', c.versao,
    'vigencia_inicio', c.vigencia_inicio,
    'cobertura_minima', c.cobertura_minima,
    'faixa_atencao_min', c.faixa_atencao_min,
    'faixa_saudavel_min', c.faixa_saudavel_min,
    'exige_pilar_fidelizacao', c.exige_pilar_fidelizacao,
    'justificativa', c.justificativa,
    'metricas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'metrica', m.metrica,
          'peso', m.peso,
          'meta', m.meta,
          'amostra_minima', m.amostra_minima,
          'cobertura_minima', m.cobertura_minima,
          'parametros', m.parametros
        )
        order by case m.metrica
          when 'retencao' then 1
          when 'permanencia' then 2
          when 'conversao' then 3
          when 'media_turma' then 4
          when 'numero_alunos' then 5
          when 'presenca' then 6
        end
      )
      from public.health_score_professor_v3_config_metricas m
      where m.config_id = c.id
    ), '[]'::jsonb),
    'metas_segmentadas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'unidade_id', s.unidade_id,
          'curso_id', s.curso_id,
          'modalidade', s.modalidade,
          'estado', s.estado,
          'capacidade_maxima', s.capacidade_maxima,
          'meta_media_turma', s.meta_media_turma,
          'meta_carteira_curso', s.meta_carteira_curso,
          'parametros', s.parametros
        )
        order by
          s.unidade_id::text,
          s.curso_id,
          s.modalidade,
          s.estado,
          s.capacidade_maxima,
          s.meta_media_turma,
          s.meta_carteira_curso
      )
      from public.health_score_professor_v3_config_metas_curso_modalidade s
      where s.config_id = c.id
    ), '[]'::jsonb)
  )::text)
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id;
$$;

create or replace function public.simular_health_score_professor_v3_config(
  p_config_id uuid,
  p_competencia date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ator integer;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_competencia date;
  v_fingerprint text;
  v_resultado jsonb;
  v_simulacao_id uuid;
  v_simulada_em timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  if p_competencia is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: competencia obrigatoria';
  end if;
  v_competencia := date_trunc('month', p_competencia)::date;

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found or v_config.status <> 'rascunho' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser simulado';
  end if;

  v_fingerprint := public.fn_health_score_professor_v3_config_fingerprint(
    p_config_id
  );

  with detalhe as materialized (
    select d.*
    from public.get_health_score_professor_v3_metricas_segmentadas_v1(
      v_competencia,
      p_config_id,
      null,
      'mensal'
    ) d
  ), segmentadas_consolidadas as materialized (
    select a.*
    from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
      v_competencia,
      p_config_id,
      null,
      'mensal'
    ) a
  ), segmentadas_unidade_base as (
    select
      d.metrica,
      d.professor_id,
      d.unidade_id,
      sum(d.numerador) filter (where d.numerador is not null) as numerador,
      sum(d.denominador) filter (where d.denominador is not null) as denominador,
      bool_or(d.estado_base in (
        'regra_ausente',
        'segmentacao_incompleta',
        'divergencia_nao_ofertada'
      )) as tem_bloqueio
    from detalhe d
    group by d.metrica, d.professor_id, d.unidade_id
  ), segmentadas_unidade as (
    select
      s.metrica,
      s.professor_id,
      s.unidade_id,
      case
        when s.tem_bloqueio or s.denominador is null then null::numeric
        when s.denominador > 0 then round(least(
          100::numeric,
          100::numeric * s.numerador / nullif(s.denominador, 0)
        ), 2)
        else null::numeric
      end as nota
    from segmentadas_unidade_base s
  ), segmentadas_escopo as (
    select s.metrica, s.professor_id, s.unidade_id, s.nota
    from segmentadas_unidade s
    union all
    select
      s.metrica,
      s.professor_id,
      null::uuid as unidade_id,
      s.nota
    from segmentadas_consolidadas s
  ), snapshots as (
    select distinct on (s.professor_id, s.unidade_id)
      s.id,
      s.professor_id,
      s.unidade_id
    from public.health_score_professor_v3_snapshots s
    where s.competencia = v_competencia
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
    order by s.professor_id, s.unidade_id, s.revisao desc
  ), alvos as (
    select s.professor_id, s.unidade_id from snapshots s
    union
    select d.professor_id, d.unidade_id from detalhe d
    union
    select s.professor_id, null::uuid from segmentadas_consolidadas s
  ), metricas as (
    select
      a.professor_id,
      a.unidade_id,
      cm.metrica,
      cm.peso,
      case
        when cm.metrica in ('media_turma', 'numero_alunos')
          and cm.parametros->>'normalizacao'
            = 'segmentada_unidade_curso_modalidade'
          then se.nota
        when sm.valor_bruto is null
          or cm.meta is null
          or cm.meta <= 0
          or sm.estado_base in ('sem_base', 'em_maturacao', 'bloqueada')
          then null::numeric
        else least(
          100::numeric,
          greatest(0::numeric, sm.valor_bruto / cm.meta * 100)
        )
      end as nota
    from alvos a
    cross join public.health_score_professor_v3_config_metricas cm
    left join snapshots s
      on s.professor_id = a.professor_id
     and s.unidade_id is not distinct from a.unidade_id
    left join public.health_score_professor_v3_snapshot_metricas sm
      on sm.snapshot_id = s.id
     and sm.metrica = cm.metrica
    left join segmentadas_escopo se
      on se.professor_id = a.professor_id
     and se.unidade_id is not distinct from a.unidade_id
     and se.metrica = cm.metrica
    where cm.config_id = p_config_id
  ), scores as (
    select
      m.professor_id,
      m.unidade_id,
      coalesce(sum(m.peso) filter (where m.nota is not null), 0) as cobertura,
      case
        when count(*) filter (where m.nota is not null) > 0 then
          sum(m.nota * m.peso) filter (where m.nota is not null)
            / nullif(sum(m.peso) filter (where m.nota is not null), 0)
      end as score_candidato,
      coalesce(bool_or(
        m.metrica in ('retencao', 'permanencia') and m.nota is not null
      ), false) as tem_fidelizacao
    from metricas m
    group by m.professor_id, m.unidade_id
  ), classificados as (
    select
      s.*,
      case
        when s.cobertura < v_config.cobertura_minima then null::numeric
        when v_config.exige_pilar_fidelizacao and not s.tem_fidelizacao
          then null::numeric
        else round(s.score_candidato, 2)
      end as score
    from scores s
  )
  select jsonb_build_object(
    'config_id', p_config_id,
    'config_versao', v_config.versao,
    'competencia', v_competencia,
    'total', count(*),
    'saudaveis', count(*) filter (
      where c.score >= v_config.faixa_saudavel_min
    ),
    'atencao', count(*) filter (
      where c.score >= v_config.faixa_atencao_min
        and c.score < v_config.faixa_saudavel_min
    ),
    'criticos', count(*) filter (
      where c.score < v_config.faixa_atencao_min
    ),
    'sem_base', count(*) filter (where c.score is null),
    'score_medio', round(avg(c.score), 2),
    'impacto_professores', coalesce(jsonb_agg(
      jsonb_build_object(
        'professor_id', c.professor_id,
        'unidade_id', c.unidade_id,
        'cobertura', c.cobertura,
        'score', c.score,
        'classificacao', case
          when c.score is null then 'sem_base'
          when c.score >= v_config.faixa_saudavel_min then 'saudavel'
          when c.score >= v_config.faixa_atencao_min then 'atencao'
          else 'critico'
        end
      )
      order by c.professor_id, c.unidade_id::text
    ), '[]'::jsonb),
    'impacto_segmentos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'metrica', d.metrica,
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'estado_base', d.estado_base,
          'valor_observado', d.valor_observado,
          'meta_aplicada', d.meta_aplicada,
          'nota', d.nota_segmento,
          'capacidade_excedida', d.capacidade_excedida
        )
        order by
          d.professor_id,
          d.unidade_id::text,
          d.metrica,
          d.curso_id nulls last,
          d.modalidade nulls last
      )
      from detalhe d
    ), '[]'::jsonb),
    'regra_ausente', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'atribuicao_id', d.atribuicao_id
        )
        order by d.professor_id, d.unidade_id::text, d.curso_id, d.modalidade
      )
      from detalhe d
      where d.metrica = 'numero_alunos'
        and (
          d.estado_base = 'regra_ausente'
          or (
            d.config_meta_segmento_id is null
            and d.curso_id is not null
            and d.modalidade in ('individual', 'turma')
          )
        )
    ), '[]'::jsonb),
    'atribuicoes_pontuaveis_sem_meta', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'atribuicao_id', d.atribuicao_id,
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade
        )
        order by d.professor_id, d.unidade_id::text, d.curso_id, d.modalidade
      )
      from detalhe d
      where d.metrica = 'numero_alunos'
        and d.atribuicao_pontuavel
        and d.config_meta_segmento_id is null
    ), '[]'::jsonb),
    'zero_carteira', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'atribuicao_id', d.atribuicao_id,
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'meta_carteira_curso', d.meta_aplicada
        )
        order by d.professor_id, d.unidade_id::text, d.curso_id, d.modalidade
      )
      from detalhe d
      where d.metrica = 'numero_alunos'
        and d.estado_base = 'sem_base_zero_carteira'
    ), '[]'::jsonb),
    'superlotacao', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'alertas_capacidade', d.alertas_capacidade
        )
        order by d.professor_id, d.unidade_id::text, d.curso_id, d.modalidade
      )
      from detalhe d
      where d.metrica = 'media_turma'
        and d.capacidade_excedida
    ), '[]'::jsonb),
    'segmentacao_incompleta', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'dados_sem_resolucao', d.dados_sem_resolucao,
          'estados_resolucao', d.estados_resolucao,
          'divergencias', d.divergencias
        )
        order by
          d.professor_id,
          d.unidade_id::text,
          d.curso_id nulls last,
          d.modalidade nulls last
      )
      from detalhe d
      where d.metrica = 'numero_alunos'
        and d.estado_base = 'segmentacao_incompleta'
    ), '[]'::jsonb),
    'nao_ofertada_observada', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'professor_id', d.professor_id,
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade
        )
        order by d.professor_id, d.unidade_id::text, d.curso_id, d.modalidade
      )
      from detalhe d
      where d.metrica = 'numero_alunos'
        and (
          d.estado_base = 'divergencia_nao_ofertada'
          or d.divergencias->>'nao_ofertada_com_dados' = 'true'
        )
    ), '[]'::jsonb),
    'publica', false
  ) into v_resultado
  from classificados c;

  insert into public.health_score_professor_v3_config_simulacoes (
    config_id,
    competencia,
    config_fingerprint,
    resultado,
    simulado_por
  ) values (
    p_config_id,
    v_competencia,
    v_fingerprint,
    v_resultado,
    v_ator
  ) returning id, criado_em into v_simulacao_id, v_simulada_em;

  return v_resultado || jsonb_build_object(
    'simulacao_id', v_simulacao_id,
    'simulada_em', v_simulada_em,
    'config_fingerprint', v_fingerprint
  );
end;
$$;

create or replace function public.ativar_health_score_professor_v3_config(
  p_config_id uuid,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_usuario_id integer;
  v_metricas integer;
  v_peso_total numeric;
  v_metricas_segmentadas integer;
  v_modo_segmentado boolean;
  v_fingerprint text;
  v_resultado_simulacao jsonb;
  v_competencia_simulacao date;
  v_encerradas integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  v_usuario_id := public.fn_health_score_professor_v3_ator_gerenciador();

  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found or v_config.status <> 'rascunho' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser ativado';
  end if;
  if btrim(p_justificativa) is distinct from v_config.justificativa then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: salve e simule a justificativa antes da ativacao';
  end if;
  if v_config.faixa_atencao_min >= v_config.faixa_saudavel_min then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: faixas incoerentes';
  end if;

  select count(distinct m.metrica), sum(m.peso)
    into v_metricas, v_peso_total
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = p_config_id;

  if v_metricas <> 6 or v_peso_total <> 100 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: exige seis pilares e soma de pesos 100';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('media_turma', 'numero_alunos')
      and m.meta is null
      and m.parametros->>'normalizacao'
        is distinct from 'segmentada_unidade_curso_modalidade'
  ) or exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('media_turma', 'numero_alunos')
      and m.parametros->>'normalizacao'
        = 'segmentada_unidade_curso_modalidade'
      and m.meta is not null
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: meta global e normalizacao segmentada incoerentes';
  end if;

  select count(*) filter (
    where m.metrica in ('media_turma', 'numero_alunos')
      and m.meta is null
      and m.parametros->>'normalizacao'
        = 'segmentada_unidade_curso_modalidade'
  ) into v_metricas_segmentadas
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = p_config_id;

  if v_metricas_segmentadas not in (0, 2) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: os dois pilares segmentados devem usar a mesma normalizacao';
  end if;
  v_modo_segmentado := v_metricas_segmentadas = 2;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('conversao', 'permanencia')
      and (
        m.meta is null
        or m.parametros->>'meta_status' is distinct from 'aprovada'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: conversao e permanencia ainda nao homologadas';
  end if;

  if not v_modo_segmentado and exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('media_turma', 'numero_alunos')
      and (
        m.meta is null
        or m.parametros->>'meta_status' is distinct from 'aprovada'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: metas globais legadas ainda nao homologadas';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.meta is null
      and m.metrica not in ('media_turma', 'numero_alunos')
      and coalesce(m.parametros->>'meta_status', '') not in (
        'rascunho',
        'em_calibracao',
        'aguardando_dados_reais',
        'bloqueada_ate_inicio'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: pilar sem meta exige estado explicito';
  end if;

  if v_modo_segmentado and not exists (
    select 1
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    where m.config_id = p_config_id
      and m.estado = 'configurada'
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: matriz segmentada completa obrigatoria';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    where m.config_id = p_config_id
      and m.estado = 'configurada'
      and m.meta_media_turma > m.capacidade_maxima
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: meta de media acima da capacidade';
  end if;

  if v_modo_segmentado and exists (
    select 1
    from public.professor_unidade_curso_modalidade a
    left join public.health_score_professor_v3_config_metas_curso_modalidade m
      on m.config_id = p_config_id
     and m.unidade_id = a.unidade_id
     and m.curso_id = a.curso_id
     and m.modalidade = a.modalidade
     and m.estado = 'configurada'
    where a.status = 'ativo'
      and a.vigencia_fim is null
      and a.confianca in ('alta', 'revisada')
      and m.id is null
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: atribuicao pontuavel sem meta segmentada';
  end if;

  v_fingerprint := public.fn_health_score_professor_v3_config_fingerprint(
    p_config_id
  );

  select s.resultado, s.competencia
    into v_resultado_simulacao, v_competencia_simulacao
  from public.health_score_professor_v3_config_simulacoes s
  where s.config_id = p_config_id
    and s.config_fingerprint = v_fingerprint
    and s.criado_em > v_config.atualizado_em
    and s.criado_em >= clock_timestamp() - interval '24 hours'
    and coalesce((s.resultado->>'total')::integer, 0) > 0
  order by s.criado_em desc, s.id desc
  limit 1;

  if not found then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: simulacao atual obrigatoria antes da ativacao';
  end if;

  if v_modo_segmentado and exists (
    select 1
    from public.get_health_score_professor_v3_metricas_segmentadas_v1(
      v_competencia_simulacao,
      p_config_id,
      null,
      'mensal'
    ) d
    where d.metrica = 'numero_alunos'
      and (
        d.estado_base in (
          'regra_ausente',
          'divergencia_nao_ofertada',
          'segmentacao_incompleta'
        )
        or (
          d.atribuicao_pontuavel
          and d.config_meta_segmento_id is null
        )
        or d.divergencias->>'nao_ofertada_com_dados' = 'true'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: diagnosticos segmentados atuais bloqueiam a ativacao';
  end if;

  if v_modo_segmentado and jsonb_array_length(
    coalesce(v_resultado_simulacao->'regra_ausente', '[]'::jsonb)
  ) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: regra obrigatoria ausente';
  end if;
  if v_modo_segmentado and jsonb_array_length(
    coalesce(
      v_resultado_simulacao->'nao_ofertada_observada',
      '[]'::jsonb
    )
  ) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: combinacao observada marcada nao_ofertada';
  end if;
  if v_modo_segmentado and jsonb_array_length(
    coalesce(
      v_resultado_simulacao->'atribuicoes_pontuaveis_sem_meta',
      '[]'::jsonb
    )
  ) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: atribuicao pontuavel sem meta';
  end if;
  if v_modo_segmentado and jsonb_array_length(
    coalesce(
      v_resultado_simulacao->'segmentacao_incompleta',
      '[]'::jsonb
    )
  ) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: regra obrigatoria depende de segmentacao completa';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_versoes c
    where c.id <> p_config_id
      and c.status = 'ativa'
      and c.vigencia_inicio >= v_config.vigencia_inicio
      and daterange(
        c.vigencia_inicio,
        coalesce(c.vigencia_fim + 1, 'infinity'::date),
        '[)'
      ) && daterange(v_config.vigencia_inicio, 'infinity'::date, '[)')
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: nova vigencia deve suceder as versoes ativas';
  end if;

  perform set_config('app.health_score_v3_config_lifecycle', 'on', true);
  update public.health_score_professor_v3_config_versoes c
  set vigencia_fim = v_config.vigencia_inicio - 1,
      atualizado_em = now()
  where c.id <> p_config_id
    and c.status = 'ativa'
    and daterange(
      c.vigencia_inicio,
      coalesce(c.vigencia_fim + 1, 'infinity'::date),
      '[)'
    ) && daterange(v_config.vigencia_inicio, 'infinity'::date, '[)');
  get diagnostics v_encerradas = row_count;
  perform set_config('app.health_score_v3_config_lifecycle', 'off', true);

  update public.health_score_professor_v3_config_versoes
  set status = 'ativa',
      justificativa = btrim(p_justificativa),
      ativado_por = v_usuario_id,
      ativado_em = now(),
      atualizado_em = now()
  where id = p_config_id;

  return public.fn_health_score_professor_v3_config_json(p_config_id)
    || jsonb_build_object(
      'versoes_anteriores_encerradas', v_encerradas,
      'config_fingerprint', v_fingerprint
    );
end;
$$;

revoke all on function public.fn_health_score_professor_v3_config_json(uuid)
  from public, anon, authenticated;
revoke all on function public.get_health_score_professor_v3_config_ui()
  from public, anon, authenticated;
revoke all on function public.criar_health_score_professor_v3_config_rascunho(date, text)
  from public, anon, authenticated;
revoke all on function public.salvar_health_score_professor_v3_config_rascunho(uuid, date, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.salvar_health_score_professor_v3_config_rascunho(uuid, date, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.fn_health_score_professor_v3_config_fingerprint(uuid)
  from public, anon, authenticated;
revoke all on function public.simular_health_score_professor_v3_config(uuid, date)
  from public, anon, authenticated;
revoke all on function public.ativar_health_score_professor_v3_config(uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_health_score_professor_v3_config_ui()
  to authenticated, service_role;
grant execute on function public.criar_health_score_professor_v3_config_rascunho(date, text)
  to authenticated, service_role;
grant execute on function public.salvar_health_score_professor_v3_config_rascunho(uuid, date, text, jsonb)
  to authenticated, service_role;
grant execute on function public.salvar_health_score_professor_v3_config_rascunho(uuid, date, text, jsonb, jsonb)
  to authenticated, service_role;
grant execute on function public.simular_health_score_professor_v3_config(uuid, date)
  to authenticated, service_role;
grant execute on function public.ativar_health_score_professor_v3_config(uuid, text)
  to authenticated, service_role;

comment on function public.get_health_score_professor_v3_config_ui() is
  'Task 6: le configuracoes, matriz segmentada e pendencias por RPC protegida.';
comment on function public.salvar_health_score_professor_v3_config_rascunho(uuid, date, text, jsonb, jsonb) is
  'Task 6: salva pesos, metas globais e matriz segmentada na mesma transacao.';
comment on function public.salvar_health_score_professor_v3_config_rascunho(uuid, date, text, jsonb) is
  'Task 6: wrapper legado que preserva integralmente a matriz segmentada atual.';
comment on function public.simular_health_score_professor_v3_config(uuid, date) is
  'Task 6: simula a revisao exata e lista regras ausentes, zero carteira e superlotacao sem publicar snapshots.';
comment on function public.ativar_health_score_professor_v3_config(uuid, text) is
  'Task 6: ativa somente revisao simulada, completa e sem sobreposicao de vigencia.';
