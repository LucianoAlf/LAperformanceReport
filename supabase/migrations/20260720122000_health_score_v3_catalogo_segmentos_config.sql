begin;

create or replace function public.fn_health_score_professor_v3_catalogo_segmentos_v1(
  p_config_id uuid
)
returns table (
  unidade_id uuid,
  unidade_nome text,
  curso_id integer,
  curso_nome text,
  modalidade text,
  emusys_disciplina_ids jsonb,
  disciplinas_emusys jsonb,
  professores_formais integer,
  formalmente_ofertado boolean,
  ultima_sincronizacao timestamptz,
  fonte text,
  config_meta_id uuid,
  estado_regra text,
  capacidade_maxima numeric,
  meta_media_turma numeric,
  meta_carteira_curso numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with catalogo_resolvido as (
    select
      catalogo.unidade_id,
      unidade.nome::text as unidade_nome,
      depara.curso_id,
      curso.nome::text as curso_nome,
      catalogo.modalidade,
      jsonb_agg(
        distinct catalogo.emusys_disciplina_id
        order by catalogo.emusys_disciplina_id
      ) as emusys_disciplina_ids,
      jsonb_agg(
        distinct jsonb_build_object(
          'emusys_disciplina_id', catalogo.emusys_disciplina_id,
          'nome', catalogo.nome_emusys,
          'ultima_execucao_id', catalogo.ultima_execucao_id
        )
      ) as disciplinas_emusys,
      count(distinct atribuicao.emusys_professor_id) filter (
        where atribuicao.ativo_origem
      )::integer as professores_formais,
      bool_or(coalesce(atribuicao.ativo_origem, false))
        as formalmente_ofertado,
      max(catalogo.sincronizado_em) as ultima_sincronizacao
    from public.emusys_disciplinas_catalogo catalogo
    join public.unidades unidade
      on unidade.id = catalogo.unidade_id
    join public.curso_emusys_depara depara
      on depara.unidade_id = catalogo.unidade_id
     and depara.emusys_disciplina_id = catalogo.emusys_disciplina_id
    join public.cursos curso
      on curso.id = depara.curso_id
     and not coalesce(curso.is_projeto_banda, false)
    left join public.emusys_professor_disciplinas atribuicao
      on atribuicao.unidade_id = catalogo.unidade_id
     and atribuicao.emusys_disciplina_id = catalogo.emusys_disciplina_id
    where catalogo.ativo_origem is true
    group by
      catalogo.unidade_id,
      unidade.nome,
      depara.curso_id,
      curso.nome,
      catalogo.modalidade
  )
  select
    c.unidade_id,
    c.unidade_nome,
    c.curso_id,
    c.curso_nome,
    c.modalidade,
    c.emusys_disciplina_ids,
    c.disciplinas_emusys,
    c.professores_formais,
    c.formalmente_ofertado,
    c.ultima_sincronizacao,
    'emusys'::text as fonte,
    m.id as config_meta_id,
    coalesce(m.estado, 'nao_configurada')::text as estado_regra,
    m.capacidade_maxima,
    m.meta_media_turma,
    m.meta_carteira_curso
  from catalogo_resolvido c
  left join public.health_score_professor_v3_config_metas_curso_modalidade m
    on m.config_id = p_config_id
   and m.unidade_id = c.unidade_id
   and m.curso_id = c.curso_id
   and m.modalidade = c.modalidade
  order by c.unidade_nome, c.curso_nome, c.modalidade;
$function$;

create or replace function public.fn_health_score_professor_v3_catalogo_segmentos_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with config_atual as (
    select c.id
    from public.health_score_professor_v3_config_versoes c
    where c.status in ('rascunho', 'ativa')
    order by
      case c.status when 'rascunho' then 0 else 1 end,
      c.versao desc
    limit 1
  )
  select coalesce(
    jsonb_agg(to_jsonb(c) order by c.unidade_nome, c.curso_nome, c.modalidade),
    '[]'::jsonb
  )
  from config_atual atual
  cross join lateral public.fn_health_score_professor_v3_catalogo_segmentos_v1(
    atual.id
  ) c;
$function$;

create or replace function public.fn_health_score_professor_v3_segmentos_faltantes_v1(
  p_config_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'unidade_id', c.unidade_id,
        'unidade_nome', c.unidade_nome,
        'curso_id', c.curso_id,
        'curso_nome', c.curso_nome,
        'modalidade', c.modalidade,
        'estado_regra', coalesce(m.estado, 'nao_configurada')
      )
      order by c.unidade_nome, c.curso_nome, c.modalidade
    ),
    '[]'::jsonb
  )
  from public.fn_health_score_professor_v3_catalogo_segmentos_v1(
    p_config_id
  ) c
  left join public.health_score_professor_v3_config_metas_curso_modalidade m on
    m.config_id = p_config_id
    and m.unidade_id = c.unidade_id
    and m.curso_id = c.curso_id
    and m.modalidade = c.modalidade
  where m.id is null
     or m.estado not in ('configurada', 'nao_ofertada');
$function$;

alter function public.get_health_score_professor_v3_config_ui()
  rename to get_health_score_professor_v3_config_ui_pre_catalogo_v1;

create or replace function public.get_health_score_professor_v3_config_ui()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_resultado jsonb;
begin
  v_resultado := public.get_health_score_professor_v3_config_ui_pre_catalogo_v1();

  return coalesce(v_resultado, '{}'::jsonb) || jsonb_build_object(
    'catalogo_segmentos', public.fn_health_score_professor_v3_catalogo_segmentos_v1()
  );
end;
$function$;

create or replace function public.salvar_health_score_professor_v3_config_rascunho(
  p_config_id uuid,
  p_vigencia_inicio date,
  p_justificativa text,
  p_metricas jsonb,
  p_metas_segmentadas jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_ator integer;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_total_metricas integer;
  v_peso_total numeric;
  v_total_segmentos integer;
  v_segmentos_distintos integer;
  v_metricas_atualizadas integer;
  v_data_local date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
    and c.status = 'rascunho'
  for update;

  if not found or v_config.id is null then
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
  if p_metas_segmentadas is not null
     and jsonb_typeof(p_metas_segmentadas) is distinct from 'array' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: matriz segmentada deve ser uma lista';
  end if;

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
        x.metrica not in ('media_turma', 'numero_alunos')
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
    from jsonb_to_recordset(coalesce(p_metas_segmentadas, '[]'::jsonb)) as x(
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
    from jsonb_to_recordset(coalesce(p_metas_segmentadas, '[]'::jsonb)) as r(
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
      or r.modalidade not in ('individual', 'turma')
      or r.estado not in ('configurada', 'nao_ofertada')
      or not exists (
        select 1 from public.unidades u where u.id = r.unidade_id
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
  where id = p_config_id
    and status = 'rascunho';

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
        when r.metrica in ('media_turma', 'numero_alunos') then null
        else r.meta
      end,
      parametros = case
        when r.metrica in ('media_turma', 'numero_alunos') then
          (
            m.parametros
            - 'meta_status'
            - 'meta_autoridade'
            - 'meta_aprovada_em'
            - 'normalizacao'
          ) || jsonb_build_object(
            'meta_status', 'aprovada',
            'meta_autoridade', 'usuario_id:' || v_ator::text,
            'meta_aprovada_em', v_data_local::text,
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
              when r.meta is not null then v_data_local::text
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
    coalesce(r.parametros, '{}'::jsonb) || jsonb_build_object(
      'ultima_alteracao_por', v_ator,
      'ultima_alteracao_em', now()
    )
  from jsonb_to_recordset(coalesce(p_metas_segmentadas, '[]'::jsonb)) as r(
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

  return public.fn_health_score_professor_v3_config_json(p_config_id);
end;
$function$;

alter function public.simular_health_score_professor_v3_config(uuid, date)
  rename to simular_health_score_professor_v3_config_pre_catalogo_v1;

create or replace function public.simular_health_score_professor_v3_config(
  p_config_id uuid,
  p_competencia date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_segmentos_faltantes jsonb;
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();
  v_segmentos_faltantes :=
    public.fn_health_score_professor_v3_segmentos_faltantes_v1(p_config_id);

  if jsonb_array_length(v_segmentos_faltantes) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INCOMPLETA: segmentos oficiais sem regra final: %',
      v_segmentos_faltantes::text;
  end if;

  return public.simular_health_score_professor_v3_config_pre_catalogo_v1(
    p_config_id,
    p_competencia
  );
end;
$function$;

alter function public.ativar_health_score_professor_v3_config(uuid, text)
  rename to ativar_health_score_professor_v3_config_pre_catalogo_v1;

create or replace function public.ativar_health_score_professor_v3_config(
  p_config_id uuid,
  p_justificativa text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_segmentos_faltantes jsonb;
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();
  v_segmentos_faltantes :=
    public.fn_health_score_professor_v3_segmentos_faltantes_v1(p_config_id);

  if jsonb_array_length(v_segmentos_faltantes) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INCOMPLETA: segmentos oficiais sem regra final: %',
      v_segmentos_faltantes::text;
  end if;

  return public.ativar_health_score_professor_v3_config_pre_catalogo_v1(
    p_config_id,
    p_justificativa
  );
end;
$function$;

revoke all on function public.fn_health_score_professor_v3_catalogo_segmentos_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.fn_health_score_professor_v3_catalogo_segmentos_v1()
  from public, anon, authenticated;
revoke all on function public.fn_health_score_professor_v3_segmentos_faltantes_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_health_score_professor_v3_catalogo_segmentos_v1(uuid)
  to service_role;
grant execute on function public.fn_health_score_professor_v3_catalogo_segmentos_v1()
  to service_role;
grant execute on function public.fn_health_score_professor_v3_segmentos_faltantes_v1(uuid)
  to service_role;

revoke all on function public.get_health_score_professor_v3_config_ui_pre_catalogo_v1()
  from public, anon, authenticated;
revoke all on function public.simular_health_score_professor_v3_config_pre_catalogo_v1(uuid, date)
  from public, anon, authenticated;
revoke all on function public.ativar_health_score_professor_v3_config_pre_catalogo_v1(uuid, text)
  from public, anon, authenticated;

revoke all on function public.get_health_score_professor_v3_config_ui()
  from public, anon;
revoke all on function public.salvar_health_score_professor_v3_config_rascunho(
  uuid, date, text, jsonb, jsonb
) from public, anon;
revoke all on function public.simular_health_score_professor_v3_config(uuid, date)
  from public, anon;
revoke all on function public.ativar_health_score_professor_v3_config(uuid, text)
  from public, anon;

grant execute on function public.get_health_score_professor_v3_config_ui()
  to authenticated, service_role;
grant execute on function public.salvar_health_score_professor_v3_config_rascunho(
  uuid, date, text, jsonb, jsonb
) to authenticated, service_role;
grant execute on function public.simular_health_score_professor_v3_config(uuid, date)
  to authenticated, service_role;
grant execute on function public.ativar_health_score_professor_v3_config(uuid, text)
  to authenticated, service_role;

comment on function public.fn_health_score_professor_v3_catalogo_segmentos_v1(uuid)
is 'Catalogo oficial de segmentos por unidade, curso e modalidade, com regra opcional da configuracao.';
comment on function public.fn_health_score_professor_v3_segmentos_faltantes_v1(uuid)
is 'Lista segmentos oficiais sem decisao final configurada ou nao ofertada.';
comment on function public.salvar_health_score_professor_v3_config_rascunho(
  uuid, date, text, jsonb, jsonb
)
is 'Salva metricas e somente as regras segmentadas enviadas; omissoes permanecem ausentes no rascunho.';

commit;
