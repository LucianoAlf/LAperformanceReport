-- Health Score Professor V3 - Gate 7.
-- Porta segura da UI de homologacao: leitura, rascunho, salvamento, simulacao
-- e ativacao temporal. Nenhum consumidor ou tabela V2 e alterado.

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
    ), '[]'::jsonb)
  ) end
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id;
$$;

revoke all on function public.fn_health_score_professor_v3_config_json(uuid)
  from public, anon, authenticated;

create or replace function public.get_health_score_professor_v3_config_ui()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ativa_id uuid;
  v_rascunho_id uuid;
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();

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

  return jsonb_build_object(
    'ativa', public.fn_health_score_professor_v3_config_json(v_ativa_id),
    'rascunho', public.fn_health_score_professor_v3_config_json(v_rascunho_id),
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
  perform pg_advisory_xact_lock(hashtextextended('health_score_professor_v3_config', 0));
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  if p_vigencia_inicio is null
     or p_vigencia_inicio <> date_trunc('month', p_vigencia_inicio)::date then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: vigencia deve iniciar no primeiro dia do mes';
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
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao ativa de origem inexistente';
  end if;
  if p_vigencia_inicio <= v_origem.vigencia_inicio then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: nova vigencia deve ser posterior a versao de origem';
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

  return public.fn_health_score_professor_v3_config_json(v_novo_id)
    || jsonb_build_object('rascunho_reutilizado', false);
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
  v_ator integer;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_total_metricas integer;
  v_peso_total numeric;
begin
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found or v_config.status <> 'rascunho' then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser salvo';
  end if;
  if p_vigencia_inicio is null
     or p_vigencia_inicio <> date_trunc('month', p_vigencia_inicio)::date then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: vigencia deve iniciar no primeiro dia do mes';
  end if;
  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;
  if jsonb_typeof(p_metricas) <> 'array' or jsonb_array_length(p_metricas) <> 6 then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: exige seis pilares';
  end if;

  with recebidas as (
    select *
    from jsonb_to_recordset(p_metricas) as x(
      metrica text,
      peso numeric,
      meta numeric,
      meta_status text
    )
  )
  select count(distinct r.metrica), sum(r.peso)
    into v_total_metricas, v_peso_total
  from recebidas r;

  if v_total_metricas <> 6 or v_peso_total <> 100 then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: seis metricas e soma de pesos 100 obrigatorias';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_metricas) as x(
      metrica text,
      peso numeric,
      meta numeric,
      meta_status text
    )
    where x.metrica not in (
      'retencao', 'permanencia', 'conversao',
      'media_turma', 'numero_alunos', 'presenca'
    )
      or x.peso not between 1 and 100
      or (x.meta is not null and x.meta <= 0)
      or (
        x.meta is null and coalesce(x.meta_status, '') not in (
          'rascunho', 'em_calibracao',
          'aguardando_dados_reais', 'bloqueada_ate_inicio'
        )
      )
      or (x.meta is not null and x.meta_status <> 'aprovada')
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: peso, meta ou estado incoerente';
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
      meta_status text
    )
  )
  update public.health_score_professor_v3_config_metricas m
  set peso = r.peso,
      meta = r.meta,
      parametros = (
        m.parametros
        - 'meta_status'
        - 'meta_autoridade'
        - 'meta_aprovada_em'
      ) || jsonb_build_object(
        'meta_status', r.meta_status,
        'meta_autoridade', case when r.meta is not null then 'usuario_id:' || v_ator::text end,
        'meta_aprovada_em', case when r.meta is not null then current_date::text end
      ),
      atualizado_em = now()
  from recebidas r
  where m.config_id = p_config_id
    and m.metrica = r.metrica;

  return public.fn_health_score_professor_v3_config_json(p_config_id);
end;
$$;

create or replace function public.simular_health_score_professor_v3_config(
  p_config_id uuid,
  p_competencia date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_resultado jsonb;
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id;

  if not found then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao inexistente';
  end if;

  with snapshots as (
    select distinct on (s.professor_id, s.unidade_id)
      s.id,
      s.professor_id,
      s.unidade_id
    from public.health_score_professor_v3_snapshots s
    where s.competencia = v_competencia
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
    order by s.professor_id, s.unidade_id, s.revisao desc
  ), metricas as (
    select
      s.id as snapshot_id,
      s.professor_id,
      s.unidade_id,
      cm.metrica,
      cm.peso,
      cm.meta,
      sm.valor_bruto,
      case
        when sm.valor_bruto is null
          or cm.meta is null
          or cm.meta <= 0
          or sm.estado_base in ('sem_base', 'em_maturacao', 'bloqueada')
          then null
        else least(100::numeric, greatest(0::numeric, sm.valor_bruto / cm.meta * 100))
      end as nota
    from snapshots s
    cross join public.health_score_professor_v3_config_metricas cm
    left join public.health_score_professor_v3_snapshot_metricas sm
      on sm.snapshot_id = s.id
     and sm.metrica = cm.metrica
    where cm.config_id = p_config_id
  ), scores as (
    select
      m.snapshot_id,
      m.professor_id,
      m.unidade_id,
      coalesce(sum(m.peso) filter (where m.nota is not null), 0) as cobertura,
      case when count(*) filter (where m.nota is not null) > 0 then
        sum(m.nota * m.peso) filter (where m.nota is not null)
        / sum(m.peso) filter (where m.nota is not null)
      end as score_candidato,
      coalesce(bool_or(
        m.metrica in ('retencao', 'permanencia') and m.nota is not null
      ), false) as tem_fidelizacao
    from metricas m
    group by m.snapshot_id, m.professor_id, m.unidade_id
  ), classificados as (
    select
      s.*,
      case
        when s.cobertura < v_config.cobertura_minima then null
        when v_config.exige_pilar_fidelizacao and not s.tem_fidelizacao then null
        else round(s.score_candidato, 2)
      end as score
    from scores s
  )
  select jsonb_build_object(
    'config_id', p_config_id,
    'config_versao', v_config.versao,
    'competencia', v_competencia,
    'total', count(*),
    'saudaveis', count(*) filter (where c.score >= v_config.faixa_saudavel_min),
    'atencao', count(*) filter (
      where c.score >= v_config.faixa_atencao_min
        and c.score < v_config.faixa_saudavel_min
    ),
    'criticos', count(*) filter (where c.score < v_config.faixa_atencao_min),
    'sem_base', count(*) filter (where c.score is null),
    'score_medio', round(avg(c.score), 2),
    'publica', false
  ) into v_resultado
  from classificados c;

  return v_resultado;
end;
$$;

create or replace function public.get_health_score_professor_v3_snapshot_ui(
  p_competencia date,
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns table (
  professor_id integer,
  unidade_id uuid,
  competencia date,
  score numeric,
  cobertura numeric,
  classificacao text,
  estado text,
  metrica text,
  valor_bruto numeric,
  nota numeric,
  peso numeric,
  meta numeric,
  amostra integer,
  estado_base text,
  confianca text,
  motivo_sem_base text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();

  return query
  with latest as (
    select distinct on (s.professor_id, s.unidade_id)
      s.*
    from public.health_score_professor_v3_snapshots s
    where s.competencia = date_trunc('month', p_competencia)::date
      and (p_unidade_id is null or s.unidade_id = p_unidade_id)
      and (p_professor_id is null or s.professor_id = p_professor_id)
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
    order by s.professor_id, s.unidade_id, s.revisao desc
  )
  select
    s.professor_id,
    s.unidade_id,
    s.competencia,
    s.score,
    s.cobertura,
    s.classificacao,
    s.estado,
    m.metrica,
    m.valor_bruto,
    m.nota,
    m.peso,
    m.meta_aplicada,
    m.amostra,
    m.estado_base,
    m.confianca,
    m.motivo_sem_base
  from latest s
  join public.health_score_professor_v3_snapshot_metricas m
    on m.snapshot_id = s.id
  order by s.professor_id, s.unidade_id nulls last, m.metrica;
end;
$$;

-- Uma configuracao ativa nao pode ser editada livremente. A unica excecao e
-- encerrar sua vigencia por uma ativacao versionada e atomica.
create or replace function public.fn_health_score_professor_v3_bloquear_config_versao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lifecycle boolean := coalesce(
    current_setting('app.health_score_v3_config_lifecycle', true),
    'off'
  ) = 'on';
begin
  if v_lifecycle
     and tg_op = 'UPDATE'
     and old.status = 'ativa'
     and new.status = 'ativa'
     and new.vigencia_inicio = old.vigencia_inicio
     and new.vigencia_fim is not null
     and new.vigencia_fim >= old.vigencia_inicio
     and row(
       new.id,
       new.versao,
       new.cobertura_minima,
       new.faixa_atencao_min,
       new.faixa_saudavel_min,
       new.exige_pilar_fidelizacao,
       new.justificativa,
       new.criado_por,
       new.ativado_por,
       new.criado_em,
       new.ativado_em
     ) is not distinct from row(
       old.id,
       old.versao,
       old.cobertura_minima,
       old.faixa_atencao_min,
       old.faixa_saudavel_min,
       old.exige_pilar_fidelizacao,
       old.justificativa,
       old.criado_por,
       old.ativado_por,
       old.criado_em,
       old.ativado_em
     ) then
    new.atualizado_em := now();
    return new;
  end if;

  if old.status <> 'rascunho'
     or exists (
       select 1
       from public.health_score_professor_v3_snapshots s
       where s.config_id = old.id
         and s.estado in ('fechado', 'invalidado')
     ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_IMUTAVEL: versao ativa ou usada por snapshot fechado';
  end if;

  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
    return new;
  end if;
  return old;
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
  v_encerradas integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('health_score_professor_v3_config', 0));
  v_usuario_id := public.fn_health_score_professor_v3_ator_gerenciador();

  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found or v_config.status <> 'rascunho' then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser ativado';
  end if;

  select count(distinct m.metrica), sum(m.peso)
    into v_metricas, v_peso_total
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = p_config_id;

  if v_metricas <> 6 or v_peso_total <> 100 then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: exige seis pilares e soma de pesos 100';
  end if;
  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('media_turma', 'numero_alunos', 'conversao', 'permanencia')
      and (m.meta is null or m.parametros->>'meta_status' <> 'aprovada')
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: quatro metas calibraveis ainda nao homologadas';
  end if;
  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.meta is null
      and coalesce(m.parametros->>'meta_status', '') not in (
        'rascunho', 'em_calibracao',
        'aguardando_dados_reais', 'bloqueada_ate_inicio'
      )
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: pilar sem meta exige estado explicito';
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
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: nova vigencia deve suceder as versoes ativas';
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
    || jsonb_build_object('versoes_anteriores_encerradas', v_encerradas);
end;
$$;

revoke all on function public.get_health_score_professor_v3_config_ui()
  from public, anon, authenticated;
revoke all on function public.criar_health_score_professor_v3_config_rascunho(date, text)
  from public, anon, authenticated;
revoke all on function public.salvar_health_score_professor_v3_config_rascunho(uuid, date, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.simular_health_score_professor_v3_config(uuid, date)
  from public, anon, authenticated;
revoke all on function public.get_health_score_professor_v3_snapshot_ui(date, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.ativar_health_score_professor_v3_config(uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_health_score_professor_v3_config_ui()
  to authenticated, service_role;
grant execute on function public.criar_health_score_professor_v3_config_rascunho(date, text)
  to authenticated, service_role;
grant execute on function public.salvar_health_score_professor_v3_config_rascunho(uuid, date, text, jsonb)
  to authenticated, service_role;
grant execute on function public.simular_health_score_professor_v3_config(uuid, date)
  to authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_snapshot_ui(date, uuid, integer)
  to authenticated, service_role;
grant execute on function public.ativar_health_score_professor_v3_config(uuid, text)
  to authenticated, service_role;

comment on function public.get_health_score_professor_v3_config_ui() is
  'Gate 7: leitura protegida da configuracao V3 ativa e do rascunho de homologacao.';
comment on function public.simular_health_score_professor_v3_config(uuid, date) is
  'Gate 7: recalcula impacto do rascunho sobre valores brutos ja materializados, sem persistir ou publicar.';
