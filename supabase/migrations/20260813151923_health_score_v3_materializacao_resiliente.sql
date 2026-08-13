begin;

-- A execucao parcial e um resultado concluido e auditavel: o escopo foi
-- materializado para todos os professores cuja captura continha as seis
-- metricas, enquanto as lacunas ficaram explicitadas no retorno.
alter table public.health_score_professor_v3_materializacao_execucoes
  drop constraint if exists
    health_score_professor_v3_materializacao_execucoes_status_check;

alter table public.health_score_professor_v3_materializacao_execucoes
  add constraint health_score_professor_v3_materializacao_execucoes_status_check
  check (status in (
    'iniciada', 'baseline_adotado', 'materializado', 'parcial',
    'sem_alteracao', 'erro'
  ));

create or replace function public.materializar_health_score_professor_v3_escopo_diario(
  p_competencia date,
  p_periodicidade text,
  p_escopo text,
  p_unidade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_escopo text := lower(trim(coalesce(p_escopo, '')));
  v_unidade_id uuid;
  v_linha record;
  v_config record;
  v_snapshot_id uuid;
  v_snapshot_ids jsonb := '[]'::jsonb;
  v_incompletos jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_classificacao text;
  v_estado_snapshot text;
  v_estado_publicacao text;
  v_fonte_preparada boolean := coalesce(
    current_setting('app.health_score_v3_fonte_preparada', true),
    'off'
  ) = 'on';
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao diaria interna'
      using errcode = '42501';
  end if;

  if p_periodicidade <> 'mensal' or v_escopo not in ('unidade', 'consolidado') then
    raise exception 'HEALTH_SCORE_V3_PARAMETRO_INVALIDO: use mensal e escopo explicito'
      using errcode = '22023';
  end if;

  if (v_escopo = 'unidade' and p_unidade_id is null)
    or (v_escopo = 'consolidado' and p_unidade_id is not null) then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_INCOMPATIVEL'
      using errcode = '22023';
  end if;

  if v_competencia <> date_trunc('month', current_date)::date then
    raise exception 'HEALTH_SCORE_V3_COMPETENCIA_NAO_ABERTA'
      using errcode = '22023';
  end if;

  v_unidade_id := case when v_escopo = 'unidade' then p_unidade_id else null::uuid end;

  -- A chamada direta compartilha a mesma serializacao do executor. O lock e
  -- reentrante na transacao, portanto o caminho executor -> materializador nao
  -- cria deadlock e nenhuma captura/revisao acontece fora dele.
  perform pg_advisory_xact_lock(hashtextextended(
    format(
      'health-score-professor-v3-diario:%s:%s:%s',
      v_competencia,
      v_escopo,
      coalesce(v_unidade_id::text, 'rede')
    ),
    0
  ));

  -- O executor prepara estas tabelas na propria sessao. A chamada direta do
  -- materializador continua valida e tambem captura o produtor apenas uma vez.
  if not v_fonte_preparada then
    drop table if exists pg_temp.health_score_v3_diario_fonte;
    drop table if exists pg_temp.health_score_v3_diario_incompletos;

    create temporary table health_score_v3_diario_fonte on commit drop as
    select p.*
    from public.get_health_score_professor_v3_performance(
      v_competencia, v_unidade_id, p_periodicidade
    ) p
    where p.escopo = v_escopo
      and p.unidade_id is not distinct from v_unidade_id;

    create temporary table health_score_v3_diario_incompletos (
      professor_id integer primary key,
      metricas_ausentes jsonb not null
    ) on commit drop;

    insert into health_score_v3_diario_incompletos (
      professor_id, metricas_ausentes
    )
    with professores_fonte as (
      select f.professor_id, min(f.config_id::text)::uuid as config_id,
        count(*)::integer as linhas,
        count(distinct f.metrica)::integer as metricas_distintas
      from health_score_v3_diario_fonte f
      group by f.professor_id
    ), avaliados as (
      select
        p.professor_id,
        p.linhas,
        p.metricas_distintas,
        count(c.metrica)::integer as metricas_esperadas,
        coalesce(
          jsonb_agg(c.metrica order by c.metrica) filter (
            where not exists (
              select 1
              from health_score_v3_diario_fonte f
              where f.professor_id = p.professor_id
                and f.metrica = c.metrica
            )
          ),
          '[]'::jsonb
        ) as metricas_ausentes
      from professores_fonte p
      join public.health_score_professor_v3_config_metricas c
        on c.config_id = p.config_id
       and c.metrica in (
         'retencao', 'permanencia', 'conversao',
         'media_turma', 'numero_alunos', 'presenca'
       )
      group by p.professor_id, p.linhas, p.metricas_distintas
    )
    select a.professor_id, a.metricas_ausentes
    from avaliados a
    where a.linhas <> 6
       or a.metricas_distintas <> 6
       or a.metricas_esperadas <> 6
       or jsonb_array_length(a.metricas_ausentes) > 0;
  end if;

  if to_regclass('pg_temp.health_score_v3_diario_fonte') is null
    or to_regclass('pg_temp.health_score_v3_diario_incompletos') is null then
    raise exception 'HEALTH_SCORE_V3_FONTE_TEMPORARIA_AUSENTE'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from health_score_v3_diario_fonte) then
    raise exception 'HEALTH_SCORE_V3_SEM_FONTE: escopo sem professores'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1 from health_score_v3_diario_fonte f
    where f.escopo is distinct from v_escopo
      or f.unidade_id is distinct from v_unidade_id
  ) then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_DIVERGENTE'
      using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'professor_id', i.professor_id,
      'metricas_ausentes', i.metricas_ausentes
    ) order by i.professor_id),
    '[]'::jsonb
  ) into v_incompletos
  from health_score_v3_diario_incompletos i;

  drop table if exists pg_temp.health_score_v3_diario_snapshots;
  create temporary table health_score_v3_diario_snapshots (
    professor_id integer primary key,
    snapshot_id uuid not null
  ) on commit drop;

  for v_linha in
    select distinct on (f.professor_id) f.*
    from health_score_v3_diario_fonte f
    where not exists (
      select 1
      from health_score_v3_diario_incompletos i
      where i.professor_id = f.professor_id
    )
    order by f.professor_id, f.metrica
  loop
    select c.faixa_saudavel_min, c.faixa_atencao_min
      into v_config
    from public.health_score_professor_v3_config_versoes c
    where c.id = v_linha.config_id;

    if not found then
      raise exception 'HEALTH_SCORE_V3_CONFIG_AUSENTE' using errcode = 'P0001';
    end if;

    v_classificacao := coalesce(
      v_linha.classificacao,
      case
        when v_linha.score is null then 'sem_base'
        when v_linha.score >= v_config.faixa_saudavel_min then 'saudavel'
        when v_linha.score >= v_config.faixa_atencao_min then 'atencao'
        else 'critico'
      end
    );
    v_estado_snapshot := case when exists (
      select 1 from health_score_v3_diario_fonte f
      where f.professor_id = v_linha.professor_id and f.estado_base = 'em_maturacao'
    ) then 'em_maturacao' else 'provisorio' end;
    v_estado_publicacao := case when v_linha.score is null then 'sem_base' else 'parcial' end;

    insert into public.health_score_professor_v3_snapshots (
      professor_id, escopo, unidade_id, competencia, trimestre_inicio, revisao,
      estado, config_id, config_versao, score, cobertura, classificacao,
      publicavel, publicado, motivo_bloqueio, regra_versao, criado_por,
      periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
      estado_publicacao, score_exibivel, ranking_habilitado
    ) values (
      v_linha.professor_id, v_escopo, v_unidade_id, v_linha.competencia, v_linha.trimestre_inicio,
      coalesce((
        select max(s.revisao) + 1
        from public.health_score_professor_v3_snapshots s
        where s.professor_id = v_linha.professor_id
          and s.escopo = v_escopo and s.unidade_id is not distinct from v_unidade_id
          and s.competencia = v_competencia and s.periodicidade = p_periodicidade
      ), 1),
      v_estado_snapshot, v_linha.config_id, v_linha.config_versao,
      v_linha.score, v_linha.cobertura, v_classificacao,
      false, false, v_linha.motivo_bloqueio, v_linha.regra_versao_snapshot, null,
      v_linha.periodicidade, v_linha.periodo_inicio, v_linha.periodo_fim,
      v_linha.ciclo_codigo, v_estado_publicacao, v_linha.score is not null, false
    ) returning id into v_snapshot_id;

    insert into health_score_v3_diario_snapshots (professor_id, snapshot_id)
      values (v_linha.professor_id, v_snapshot_id);
    v_snapshot_ids := v_snapshot_ids || jsonb_build_array(v_snapshot_id);
    v_count := v_count + 1;
  end loop;

  insert into public.health_score_professor_v3_snapshot_metricas (
    snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
    estado_base, publicavel, confianca, fonte, regra_versao, motivo_sem_base,
    detalhes, nota, peso, peso_disponivel, contribuicao, meta_aplicada,
    peso_efetivo, codigo_evidencia, papel
  )
  select
    ids.snapshot_id, f.metrica, f.valor_bruto, f.numerador, f.denominador, f.amostra,
    f.estado_base, f.metrica_publicavel, f.confianca, f.fonte, f.regra_versao_metrica,
    f.motivo_sem_base, coalesce(f.detalhes, '{}'::jsonb), f.nota, f.peso,
    f.peso_disponivel, f.contribuicao, f.meta, f.peso_efetivo,
    f.codigo_evidencia, f.papel
  from health_score_v3_diario_fonte f
  join health_score_v3_diario_snapshots ids on ids.professor_id = f.professor_id;

  perform set_config('app.health_score_v3_fonte_preparada', 'off', true);

  return jsonb_build_object(
    'competencia', v_competencia, 'periodicidade', p_periodicidade,
    'escopo', v_escopo, 'unidade_id', v_unidade_id,
    'snapshots_criados', v_count, 'snapshot_ids', v_snapshot_ids,
    'professores_incompletos', v_incompletos,
    'origem', 'get_health_score_professor_v3_performance', 'formula_alterada', false
  );
end;
$function$;

revoke all on function public.materializar_health_score_professor_v3_escopo_diario(date, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.materializar_health_score_professor_v3_escopo_diario(date, text, text, uuid)
  to service_role;

create or replace function public.executar_health_score_professor_v3_escopo_diario(
  p_competencia date,
  p_periodicidade text,
  p_escopo text,
  p_unidade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', current_date)::date;
  v_fingerprint_atual text;
  v_fingerprint_anterior text;
  v_execucao_id uuid;
  v_resultado jsonb;
  v_incompletos jsonb := '[]'::jsonb;
  v_status text;
begin
  if date_trunc('month', p_competencia)::date <> v_competencia or p_periodicidade <> 'mensal' then
    raise exception 'HEALTH_SCORE_V3_COMPETENCIA_NAO_ABERTA' using errcode = '22023';
  end if;
  if (p_escopo = 'unidade' and p_unidade_id is null)
    or (p_escopo = 'consolidado' and p_unidade_id is not null) then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_INCOMPATIVEL' using errcode = '22023';
  end if;

  perform set_config('statement_timeout', '600s', true);
  perform pg_advisory_xact_lock(hashtextextended(
    format('health-score-professor-v3-diario:%s:%s:%s', v_competencia, p_escopo, coalesce(p_unidade_id::text, 'rede')), 0
  ));

  begin
    drop table if exists pg_temp.health_score_v3_diario_fonte;
    drop table if exists pg_temp.health_score_v3_diario_incompletos;

    create temporary table health_score_v3_diario_fonte on commit drop as
    select p.*
    from public.get_health_score_professor_v3_performance(
      v_competencia, p_unidade_id, p_periodicidade
    ) p
    where p.escopo = p_escopo
      and p.unidade_id is not distinct from p_unidade_id;

    create temporary table health_score_v3_diario_incompletos (
      professor_id integer primary key,
      metricas_ausentes jsonb not null
    ) on commit drop;

    insert into health_score_v3_diario_incompletos (
      professor_id, metricas_ausentes
    )
    with professores_fonte as (
      select f.professor_id, min(f.config_id::text)::uuid as config_id,
        count(*)::integer as linhas,
        count(distinct f.metrica)::integer as metricas_distintas
      from health_score_v3_diario_fonte f
      group by f.professor_id
    ), avaliados as (
      select
        p.professor_id,
        p.linhas,
        p.metricas_distintas,
        count(c.metrica)::integer as metricas_esperadas,
        coalesce(
          jsonb_agg(c.metrica order by c.metrica) filter (
            where not exists (
              select 1
              from health_score_v3_diario_fonte f
              where f.professor_id = p.professor_id
                and f.metrica = c.metrica
            )
          ),
          '[]'::jsonb
        ) as metricas_ausentes
      from professores_fonte p
      join public.health_score_professor_v3_config_metricas c
        on c.config_id = p.config_id
       and c.metrica in (
         'retencao', 'permanencia', 'conversao',
         'media_turma', 'numero_alunos', 'presenca'
       )
      group by p.professor_id, p.linhas, p.metricas_distintas
    )
    select a.professor_id, a.metricas_ausentes
    from avaliados a
    where a.linhas <> 6
       or a.metricas_distintas <> 6
       or a.metricas_esperadas <> 6
       or jsonb_array_length(a.metricas_ausentes) > 0;

    select md5(coalesce(
      jsonb_agg(to_jsonb(f) order by f.professor_id, f.metrica)::text,
      '[]'
    )) into v_fingerprint_atual
    from health_score_v3_diario_fonte f;

    select coalesce(
      jsonb_agg(jsonb_build_object(
        'professor_id', i.professor_id,
        'metricas_ausentes', i.metricas_ausentes
      ) order by i.professor_id),
      '[]'::jsonb
    ) into v_incompletos
    from health_score_v3_diario_incompletos i;
  exception when others then
    perform set_config('app.health_score_v3_fonte_preparada', 'off', true);
    insert into public.health_score_professor_v3_materializacao_execucoes (
      competencia, periodicidade, escopo, unidade_id, fingerprint_fonte, status, erro, finalizado_em
    ) values (
      v_competencia, p_periodicidade, p_escopo, p_unidade_id,
      'erro:' || md5(sqlerrm), 'erro', sqlerrm, now()
    ) returning id into v_execucao_id;
    return jsonb_build_object('execution_id', v_execucao_id, 'status', 'erro', 'erro', sqlerrm);
  end;

  select e.fingerprint_fonte into v_fingerprint_anterior
  from public.health_score_professor_v3_materializacao_execucoes e
  where e.competencia = v_competencia and e.periodicidade = p_periodicidade
    and e.escopo = p_escopo and e.unidade_id is not distinct from p_unidade_id
    and e.status in ('baseline_adotado', 'materializado', 'parcial')
  order by e.finalizado_em desc nulls last, e.iniciado_em desc, e.id desc
  limit 1;

  if v_fingerprint_atual is not distinct from v_fingerprint_anterior then
    insert into public.health_score_professor_v3_materializacao_execucoes (
      competencia, periodicidade, escopo, unidade_id, fingerprint_fonte, status, finalizado_em
    ) values (
      v_competencia, p_periodicidade, p_escopo, p_unidade_id, v_fingerprint_atual, 'sem_alteracao', now()
    ) returning id into v_execucao_id;
    return jsonb_build_object(
      'execution_id', v_execucao_id,
      'status', 'sem_alteracao',
      'professores_incompletos', v_incompletos
    );
  end if;

  if v_fingerprint_anterior is null and exists (
    select 1 from public.health_score_professor_v3_snapshots s
    where s.competencia = v_competencia and s.periodicidade = p_periodicidade
      and s.escopo = p_escopo and s.unidade_id is not distinct from p_unidade_id
  ) then
    insert into public.health_score_professor_v3_materializacao_execucoes (
      competencia, periodicidade, escopo, unidade_id, fingerprint_fonte, status, finalizado_em
    ) values (
      v_competencia, p_periodicidade, p_escopo, p_unidade_id, v_fingerprint_atual, 'baseline_adotado', now()
    ) returning id into v_execucao_id;
    return jsonb_build_object(
      'execution_id', v_execucao_id,
      'status', 'baseline_adotado',
      'professores_incompletos', v_incompletos
    );
  end if;

  insert into public.health_score_professor_v3_materializacao_execucoes (
    competencia, periodicidade, escopo, unidade_id, fingerprint_fonte, status
  ) values (
    v_competencia, p_periodicidade, p_escopo, p_unidade_id, v_fingerprint_atual, 'iniciada'
  ) returning id into v_execucao_id;

  begin
    perform set_config('app.health_score_v3_fonte_preparada', 'on', true);
    v_resultado := public.materializar_health_score_professor_v3_escopo_diario(
      v_competencia, p_periodicidade, p_escopo, p_unidade_id
    );
    perform set_config('app.health_score_v3_fonte_preparada', 'off', true);
    v_status := case
      when jsonb_array_length(v_incompletos) > 0 then 'parcial'
      else 'materializado'
    end;
    update public.health_score_professor_v3_materializacao_execucoes
      set status = v_status, snapshot_ids = coalesce(v_resultado->'snapshot_ids', '[]'::jsonb),
          snapshots_criados = coalesce((v_resultado->>'snapshots_criados')::integer, 0),
          erro = null, finalizado_em = now()
      where id = v_execucao_id;
    return v_resultado || jsonb_build_object(
      'execution_id', v_execucao_id,
      'status', v_status,
      'professores_incompletos', v_incompletos
    );
  exception when others then
    perform set_config('app.health_score_v3_fonte_preparada', 'off', true);
    update public.health_score_professor_v3_materializacao_execucoes
      set status = 'erro', erro = sqlerrm, finalizado_em = now()
      where id = v_execucao_id;
    return jsonb_build_object('execution_id', v_execucao_id, 'status', 'erro', 'erro', sqlerrm);
  end;
end;
$function$;

-- Continua privada: somente o cron SECURITY DEFINER e postgres a invocam.
revoke all on function public.executar_health_score_professor_v3_escopo_diario(date, text, text, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.fechar_health_score_professor_v3_ciclo(
  p_ciclo_codigo text,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_usuario_id integer;
  v_ciclo public.health_score_professor_v3_ciclos%rowtype;
  v_lock record;
  v_origem record;
  v_novo_id uuid;
  v_revisao integer;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_roster_diagnostico jsonb;
begin
  v_usuario_id := public.fn_health_score_professor_v3_ator_gerenciador();
  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_INVALIDO: justificativa obrigatoria';
  end if;

  select * into v_ciclo
  from public.health_score_professor_v3_ciclos c
  where c.codigo = p_ciclo_codigo
  for update;
  if not found then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_INVALIDO: ciclo inexistente';
  end if;
  if current_date < v_ciclo.data_fim then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: ciclo ainda aberto';
  end if;
  if v_ciclo.publicacao_oficial then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: ciclo ja oficial';
  end if;

  for v_lock in
    select distinct
      date_trunc('month', s.competencia)::date as competencia,
      s.periodicidade
    from public.health_score_professor_v3_snapshots s
    where s.periodicidade = 'ciclo'
      and s.ciclo_codigo = p_ciclo_codigo
    order by competencia, s.periodicidade
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'health_score_v3_periodo:'
        || v_lock.competencia::text
        || ':' || v_lock.periodicidade,
      0
    ));
  end loop;

  -- Sob os mesmos advisory locks da materializacao, o fechamento e recusado
  -- antes de criar qualquer revisao se um escopo nao retratar o roster ativo.
  with roster_unidade as (
    select distinct pu.unidade_id, p.id as professor_id
    from public.professores_unidades pu
    join public.unidades u on u.id = pu.unidade_id and u.ativo = true
    join public.professores p on p.id = pu.professor_id and p.ativo = true
    where pu.emusys_ativo = true
      and pu.validacao_status is distinct from 'ignorado'
      and to_jsonb(p) ->> 'mesclado_em_professor_id' is null
  ), roster_esperado as (
    select r.unidade_id, r.professor_id
    from roster_unidade r
    union
    select null::uuid, r.professor_id
    from roster_unidade r
  ), roster_retratado as (
    select distinct s.unidade_id, s.professor_id
    from public.health_score_professor_v3_snapshots s
    where s.periodicidade = 'ciclo'
      and s.ciclo_codigo = p_ciclo_codigo
      and s.estado_publicacao in ('parcial', 'sem_base', 'oficial')
  ), ausentes as (
    select * from roster_esperado
    except
    select * from roster_retratado
  ), excedentes as (
    select * from roster_retratado
    except
    select * from roster_esperado
  )
  select jsonb_build_object(
    'professores_ausentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unidade_id', a.unidade_id,
        'professor_id', a.professor_id
      ) order by a.unidade_id nulls first, a.professor_id)
      from ausentes a
    ), '[]'::jsonb),
    'professores_excedentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unidade_id', e.unidade_id,
        'professor_id', e.professor_id
      ) order by e.unidade_id nulls first, e.professor_id)
      from excedentes e
    ), '[]'::jsonb)
  ) into v_roster_diagnostico;

  if jsonb_array_length(v_roster_diagnostico->'professores_ausentes') > 0
    or jsonb_array_length(v_roster_diagnostico->'professores_excedentes') > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: roster incompleto',
      detail = v_roster_diagnostico::text;
  end if;

  for v_origem in
    with candidatos as (
      select s.*,
        row_number() over (
          partition by s.professor_id, s.unidade_id
          order by s.competencia desc, s.revisao desc
        ) as rn
      from public.health_score_professor_v3_snapshots s
      where s.periodicidade = 'ciclo'
        and s.ciclo_codigo = p_ciclo_codigo
        and s.estado_publicacao = 'parcial'
        and s.score_exibivel
        and s.score is not null
    )
    select c.* from candidatos c
    where c.rn = 1
      and not exists (
        select 1
        from public.health_score_professor_v3_snapshot_metricas m
        where m.snapshot_id = c.id
          and m.nota is not null
          and coalesce((m.detalhes->>'apta_oficial')::boolean, false) is not true
      )
  loop
    select coalesce(max(s.revisao), 0) + 1 into v_revisao
    from public.health_score_professor_v3_snapshots s
    where s.professor_id = v_origem.professor_id
      and s.unidade_id is not distinct from v_origem.unidade_id
      and s.competencia = v_origem.competencia
      and s.periodicidade = 'ciclo';

    insert into public.health_score_professor_v3_snapshots (
      professor_id, escopo, unidade_id, competencia, trimestre_inicio,
      revisao, estado, config_id, config_versao, score, cobertura,
      classificacao, publicavel, publicado, motivo_bloqueio, regra_versao,
      snapshot_anterior_id, justificativa_retificacao, criado_por, fechado_em,
      periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
      estado_publicacao, score_exibivel, ranking_habilitado
    ) values (
      v_origem.professor_id, v_origem.escopo, v_origem.unidade_id,
      v_origem.competencia, v_origem.trimestre_inicio, v_revisao, 'fechado',
      v_origem.config_id, v_origem.config_versao, v_origem.score,
      v_origem.cobertura, v_origem.classificacao, true, true, null,
      'health-score-professor-v3-fechamento-ciclo-1', v_origem.id,
      btrim(p_justificativa), v_usuario_id, now(), 'ciclo',
      v_origem.periodo_inicio, v_origem.periodo_fim, v_origem.ciclo_codigo,
      'oficial', true, true
    ) returning id into v_novo_id;

    insert into public.health_score_professor_v3_snapshot_metricas (
      snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
      estado_base, publicavel, confianca, fonte, regra_versao,
      motivo_sem_base, detalhes, nota, peso, peso_disponivel,
      contribuicao, meta_aplicada, peso_efetivo, codigo_evidencia, papel
    )
    select v_novo_id, m.metrica, m.valor_bruto, m.numerador, m.denominador,
      m.amostra, m.estado_base, m.publicavel, m.confianca, m.fonte,
      m.regra_versao, m.motivo_sem_base,
      m.detalhes || jsonb_build_object('fechado_oficialmente_em', now()),
      m.nota, m.peso, m.peso_disponivel, m.contribuicao, m.meta_aplicada,
      m.peso_efetivo, m.codigo_evidencia, m.papel
    from public.health_score_professor_v3_snapshot_metricas m
    where m.snapshot_id = v_origem.id;

    v_count := v_count + 1;
    v_ids := v_ids || jsonb_build_array(v_novo_id);
  end loop;

  if v_count = 0 then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: nenhum snapshot apto ao oficial';
  end if;

  update public.health_score_professor_v3_ciclos
  set estado = 'fechado', publicacao_oficial = true,
      ranking_habilitado = true, fechado_em = now(),
      fechado_por = v_usuario_id, justificativa_fechamento = btrim(p_justificativa)
  where id = v_ciclo.id;

  return jsonb_build_object(
    'ciclo_codigo', p_ciclo_codigo,
    'estado_publicacao', 'oficial',
    'ranking_habilitado', true,
    'snapshots_fechados', v_count,
    'snapshot_ids', v_ids
  );
end;
$function$;

revoke all on function public.fechar_health_score_professor_v3_ciclo(text, text)
  from public, anon, authenticated;
grant execute on function public.fechar_health_score_professor_v3_ciclo(text, text)
  to authenticated, service_role;

comment on function public.materializar_health_score_professor_v3_escopo_diario(
  date, text, text, uuid
) is
  'Materializa uma unica captura por execucao; persiste apenas professores com seis metricas e relata lacunas sem abortar o escopo.';

comment on function public.executar_health_score_professor_v3_escopo_diario(
  date, text, text, uuid
) is
  'Executor idempotente sobre captura temporaria unica; resultado parcial e auditavel e sem ranking.';

comment on function public.fechar_health_score_professor_v3_ciclo(text, text) is
  'Fecha ciclo somente quando cada escopo retrata integralmente o roster ativo; a recusa ocorre antes de qualquer snapshot oficial.';

commit;
