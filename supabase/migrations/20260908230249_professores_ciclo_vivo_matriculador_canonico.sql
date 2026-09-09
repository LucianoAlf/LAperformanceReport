-- Professor Performance: ciclo aberto materializado, Cadastro leve e
-- Matriculador comercial canônico.
--
-- Contratos preservados:
--   * Health Score, pesos, snapshots fechados e ranking oficial não mudam.
--   * O ciclo aberto continua "em acompanhamento"; ele só passa a ter um
--     retrato materializado diário em vez de cair no placeholder genérico.
--   * Matriculador não é a taxa/numerador da conversão: é a matrícula comercial
--     canônica atribuída ao professor que realizou a experimental.

-- A aba Cadastro só consome carteira/turmas. A RPC ampla também abre presença,
-- conversão, retenção e financeiro, e era a origem do timeout 57014 desta tela.
create or replace function public.get_kpis_professores_cadastro_canonicos_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null::uuid,
  p_data_inicio date default null::date,
  p_data_fim date default null::date
)
returns table(
  professor_id integer,
  unidade_id uuid,
  carteira_alunos integer,
  total_turmas integer,
  alunos_via_turmas integer,
  turmas_elegiveis_media integer,
  media_alunos_turma numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_unidade_efetiva uuid;
  v_inicio date := coalesce(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date := coalesce(
    p_data_fim,
    (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
  );
begin
  if p_mes < 1 or p_mes > 12 then
    raise exception 'Mes invalido: %', p_mes using errcode = '22023';
  end if;

  if v_fim < v_inicio then
    raise exception 'Periodo invalido: data final anterior a inicial'
      using errcode = '22023';
  end if;

  -- Mesmo contrato de acesso de get_kpis_turmas_canonicos_v2. A otimização
  -- troca apenas a fonte de leitura, não aumenta o escopo de quem pode ler.
  if auth.role() = 'service_role' then
    v_unidade_efetiva := p_unidade_id;
  else
    select u.id, u.perfil, u.unidade_id
      into v_usuario_id, v_perfil, v_unidade_usuario
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.ativo = true
    limit 1;

    if v_usuario_id is null then
      raise exception 'Acesso negado: usuario sem cadastro ativo'
        using errcode = '42501';
    end if;

    if v_perfil = 'admin' then
      if not (
        public.usuario_tem_permissao(v_usuario_id, 'professores.ver', p_unidade_id)
        or public.usuario_tem_permissao(v_usuario_id, 'alunos.ver', p_unidade_id)
      ) then
        raise exception 'Acesso negado: sem permissao para professores'
          using errcode = '42501';
      end if;
      v_unidade_efetiva := p_unidade_id;
    elsif v_perfil = 'unidade' then
      if v_unidade_usuario is null
         or (p_unidade_id is not null and p_unidade_id <> v_unidade_usuario) then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
      v_unidade_efetiva := v_unidade_usuario;
    else
      if v_unidade_usuario is null
         or (p_unidade_id is not null and p_unidade_id <> v_unidade_usuario)
         or not (
           public.usuario_tem_permissao(v_usuario_id, 'professores.ver', v_unidade_usuario)
           or public.usuario_tem_permissao(v_usuario_id, 'alunos.ver', v_unidade_usuario)
         ) then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
      v_unidade_efetiva := v_unidade_usuario;
    end if;
  end if;

  return query
  select
    c.professor_id,
    c.unidade_id,
    c.carteira_alunos,
    c.total_turmas,
    c.alunos_via_turmas,
    c.turmas_elegiveis_media,
    c.media_alunos_turma
  from public.get_carteira_professor_periodo_canonica(
    p_ano,
    p_mes,
    v_unidade_efetiva,
    p_data_inicio,
    p_data_fim
  ) c;
end;
$function$;

revoke all on function public.get_kpis_professores_cadastro_canonicos_v1(
  integer, integer, uuid, date, date
) from public, anon;
grant execute on function public.get_kpis_professores_cadastro_canonicos_v1(
  integer, integer, uuid, date, date
) to authenticated, service_role;

-- O payload é mantido no mesmo leitor autorizado; apenas acrescentamos a
-- contagem comercial ao campo operacional. Conversão continua sendo uma métrica
-- distinta e não é mais usada como substituta de matrícula.
create or replace function public.get_relatorio_coordenacao_canonico_v3(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text default 'mensal'::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_payload jsonb;
  v_periodo_inicio date;
  v_periodo_fim date;
  v_professores jsonb;
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  v_payload := public.montar_relatorio_coordenacao_payload_v3(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade
  );

  if v_payload is null
     or jsonb_typeof(v_payload->'professores') <> 'array'
     or nullif(v_payload->'periodo'->>'inicio', '') is null
     or nullif(v_payload->'periodo'->>'fim', '') is null then
    raise exception 'RELATORIO_COORDENACAO_MATRICULADOR_PAYLOAD_INVALIDO'
      using errcode = '22023';
  end if;

  v_periodo_inicio := (v_payload->'periodo'->>'inicio')::date;
  v_periodo_fim := (v_payload->'periodo'->>'fim')::date;

  with matriculas_comerciais_por_professor as (
    select
      a.professor_experimental_id as professor_id,
      count(*)::integer as matriculas_comerciais
    from public.matriculas_comerciais_v1(
      p_unidade_id,
      v_periodo_inicio,
      v_periodo_fim + 1
    ) m
    join public.alunos a on a.id = m.aluno_id
    where m.conta is true
      and a.professor_experimental_id is not null
    group by a.professor_experimental_id
  ), professores_ordenados as (
    select
      e.professor,
      e.ordem,
      nullif(e.professor->>'professor_id', '')::integer as professor_id
    from jsonb_array_elements(v_payload->'professores') with ordinality
      as e(professor, ordem)
  )
  select coalesce(
    jsonb_agg(
      jsonb_set(
        p.professor,
        '{operacional}',
        coalesce(p.professor->'operacional', '{}'::jsonb)
          || jsonb_build_object(
            'matriculas_comerciais',
            coalesce(m.matriculas_comerciais, 0)
          ),
        true
      )
      order by p.ordem
    ),
    '[]'::jsonb
  ) into v_professores
  from professores_ordenados p
  left join matriculas_comerciais_por_professor m
    on m.professor_id = p.professor_id;

  return jsonb_set(v_payload, '{professores}', v_professores, true);
end;
$function$;

revoke all on function public.get_relatorio_coordenacao_canonico_v3(
  uuid, integer, integer, text
) from public, anon;
grant execute on function public.get_relatorio_coordenacao_canonico_v3(
  uuid, integer, integer, text
) to authenticated, service_role;

-- A tabela de execuções era explicitamente mensal. Ampliar o domínio é aditivo:
-- os registros já existentes continuam válidos e nenhum snapshot é reescrito.
alter table public.health_score_professor_v3_materializacao_execucoes
  drop constraint if exists health_score_professor_v3_materializacao_ex_periodicidade_check;
alter table public.health_score_professor_v3_materializacao_execucoes
  add constraint health_score_professor_v3_materializacao_ex_periodicidade_check
  check (periodicidade in ('mensal', 'ciclo'));

-- Os dois corpos são a versão viva medida em produção. Alteramos somente a
-- guarda que bloqueava "ciclo" e falhamos fechados se ela divergir.
do $patch_materializador$
declare
  v_definicao text;
  v_guarda_antiga text := $guarda$if p_periodicidade <> 'mensal' or v_escopo not in ('unidade', 'consolidado') then$guarda$;
  v_guarda_nova text := $guarda$if p_periodicidade not in ('mensal', 'ciclo') or v_escopo not in ('unidade', 'consolidado') then$guarda$;
  v_mensagem_antiga text := 'HEALTH_SCORE_V3_PARAMETRO_INVALIDO: use mensal e escopo explicito';
  v_mensagem_nova text := 'HEALTH_SCORE_V3_PARAMETRO_INVALIDO: use mensal ou ciclo e escopo explicito';
begin
  select pg_get_functiondef(
    'public.materializar_health_score_professor_v3_escopo_diario(date,text,text,uuid)'::regprocedure
  ) into v_definicao;

  if v_definicao is null
     or position('get_health_score_professor_v3_performance' in v_definicao) = 0 then
    raise exception 'HEALTH_SCORE_V3_MATERIALIZADOR_VIVO_INESPERADO';
  end if;

  if position(v_guarda_antiga in v_definicao) > 0 then
    v_definicao := replace(v_definicao, v_guarda_antiga, v_guarda_nova);
  elsif position(v_guarda_nova in v_definicao) = 0 then
    raise exception 'HEALTH_SCORE_V3_GUARDA_MATERIALIZADOR_NAO_ENCONTRADA';
  end if;

  if position(v_mensagem_antiga in v_definicao) > 0 then
    v_definicao := replace(v_definicao, v_mensagem_antiga, v_mensagem_nova);
  elsif position(v_mensagem_nova in v_definicao) = 0 then
    raise exception 'HEALTH_SCORE_V3_MENSAGEM_MATERIALIZADOR_NAO_ENCONTRADA';
  end if;

  execute v_definicao;
end;
$patch_materializador$;

do $patch_executor$
declare
  v_definicao text;
  v_guarda_antiga text := $guarda$if date_trunc('month', p_competencia)::date <> v_competencia or p_periodicidade <> 'mensal' then$guarda$;
  v_guarda_nova text := $guarda$if date_trunc('month', p_competencia)::date <> v_competencia or p_periodicidade not in ('mensal', 'ciclo') then$guarda$;
begin
  select pg_get_functiondef(
    'public.executar_health_score_professor_v3_escopo_diario(date,text,text,uuid)'::regprocedure
  ) into v_definicao;

  if v_definicao is null
     or position('materializar_health_score_professor_v3_escopo_diario' in v_definicao) = 0 then
    raise exception 'HEALTH_SCORE_V3_EXECUTOR_VIVO_INESPERADO';
  end if;

  if position(v_guarda_antiga in v_definicao) > 0 then
    v_definicao := replace(v_definicao, v_guarda_antiga, v_guarda_nova);
  elsif position(v_guarda_nova in v_definicao) = 0 then
    raise exception 'HEALTH_SCORE_V3_GUARDA_EXECUTOR_NAO_ENCONTRADA';
  end if;

  execute v_definicao;
end;
$patch_executor$;

revoke all on function public.materializar_health_score_professor_v3_escopo_diario(date, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.executar_health_score_professor_v3_escopo_diario(date, text, text, uuid)
  from public, anon, authenticated, service_role;

-- Jobs de ciclo são independentes dos mensais e rodam depois deles, para não
-- disputarem o mesmo produtor. O consolidado reconcilia a lista de unidades
-- ativas a cada execução, tal como o cron mensal já faz.
create or replace function public.configurar_health_score_professor_v3_cron_ciclo_escopos()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_job record;
  v_unidade record;
  v_job_id bigint;
  v_total_unidades integer;
  v_total_minutos integer;
  v_agenda text;
  v_jobname text;
  v_command text;
  v_inicio_minutos constant integer := 410; -- 06:50 UTC, após a rodada mensal.
  v_intervalo_minutos constant integer := 5;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health-score-professor-v3-cron-ciclo-escopos', 0)
  );

  select count(*)::integer
    into v_total_unidades
  from public.unidades u
  where u.ativo = true;

  if v_inicio_minutos + (v_total_unidades * v_intervalo_minutos) >= 1440 then
    raise exception 'HEALTH_SCORE_V3_JANELA_CRON_CICLO_INSUFICIENTE'
      using errcode = '54000',
            detail = format('unidades_ativas=%s', v_total_unidades);
  end if;

  for v_job in
    select j.jobid
    from cron.job j
    where (
      j.jobname = 'materializar-health-score-professor-v3-ciclo-consolidado'
      or j.jobname like 'materializar-health-score-professor-v3-ciclo-unidade-%'
    )
      and (
        j.username <> current_user
        or (
          j.jobname like 'materializar-health-score-professor-v3-ciclo-unidade-%'
          and not exists (
            select 1
            from public.unidades u
            where u.ativo = true
              and j.jobname = 'materializar-health-score-professor-v3-ciclo-unidade-' || u.id::text
          )
        )
        or exists (
          select 1
          from cron.job menor
          where menor.jobname = j.jobname
            and menor.username = current_user
            and menor.jobid < j.jobid
        )
      )
    order by j.jobid
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  for v_unidade in
    select
      u.id,
      row_number() over (order by u.id)::integer as ordem
    from public.unidades u
    where u.ativo = true
    order by u.id
  loop
    v_jobname := 'materializar-health-score-professor-v3-ciclo-unidade-' || v_unidade.id::text;
    v_command := format(
      'select public.executar_health_score_professor_v3_job_ciclo_escopo(''unidade'', %L::uuid);',
      v_unidade.id::text
    );
    v_total_minutos := v_inicio_minutos
      + ((v_unidade.ordem - 1) * v_intervalo_minutos);
    v_agenda := format(
      '%s %s * * *',
      mod(v_total_minutos, 60),
      v_total_minutos / 60
    );

    select j.jobid into v_job_id
    from cron.job j
    where j.jobname = v_jobname
      and j.username = current_user
    order by j.jobid
    limit 1;

    if v_job_id is null then
      perform cron.schedule(v_jobname, v_agenda, v_command);
    else
      perform cron.alter_job(
        v_job_id,
        schedule := v_agenda,
        command := v_command,
        active := true
      );
    end if;
  end loop;

  v_total_minutos := v_inicio_minutos
    + (v_total_unidades * v_intervalo_minutos);
  v_agenda := format(
    '%s %s * * *',
    mod(v_total_minutos, 60),
    v_total_minutos / 60
  );
  v_jobname := 'materializar-health-score-professor-v3-ciclo-consolidado';
  v_command := 'select public.executar_health_score_professor_v3_job_ciclo_escopo(''consolidado'', null::uuid);';

  select j.jobid into v_job_id
  from cron.job j
  where j.jobname = v_jobname
    and j.username = current_user
  order by j.jobid
  limit 1;

  if v_job_id is null then
    perform cron.schedule(v_jobname, v_agenda, v_command);
  else
    perform cron.alter_job(
      v_job_id,
      schedule := v_agenda,
      command := v_command,
      active := true
    );
  end if;
end;
$function$;

-- Reaproveita integralmente o wrapper de execução/alerta vigente. A troca é
-- limitada ao nome, à reconciliação do cron de ciclo e à periodicidade passada
-- ao executor; qualquer divergência no corpo-base aborta a migration.
do $clone_job_ciclo$
declare
  v_definicao text;
  v_original text;
begin
  select pg_get_functiondef(
    'public.executar_health_score_professor_v3_job_escopo(text,uuid)'::regprocedure
  ) into v_definicao;

  if v_definicao is null
     or position('FUNCTION public.executar_health_score_professor_v3_job_escopo' in v_definicao) = 0
     or position('public.executar_health_score_professor_v3_escopo_diario' in v_definicao) = 0 then
    raise exception 'HEALTH_SCORE_V3_JOB_BASE_VIVO_INESPERADO';
  end if;

  v_definicao := replace(
    v_definicao,
    'FUNCTION public.executar_health_score_professor_v3_job_escopo',
    'FUNCTION public.executar_health_score_professor_v3_job_ciclo_escopo'
  );
  v_definicao := replace(
    v_definicao,
    'public.configurar_health_score_professor_v3_cron_escopos()',
    'public.configurar_health_score_professor_v3_cron_ciclo_escopos()'
  );
  v_original := v_definicao;
  v_definicao := regexp_replace(
    v_definicao,
    $padrao$public\.executar_health_score_professor_v3_escopo_diario\(\s*date_trunc\('month', current_date\)::date,\s*'mensal',\s*v_escopo,\s*v_unidade_id\s*\)$padrao$,
    $substituicao$public.executar_health_score_professor_v3_escopo_diario(
    date_trunc('month', current_date)::date,
    'ciclo',
    v_escopo,
    v_unidade_id
  )$substituicao$
  );

  if v_definicao = v_original then
    raise exception 'HEALTH_SCORE_V3_CHAMADA_MENSAL_DO_JOB_NAO_ENCONTRADA';
  end if;

  execute v_definicao;
end;
$clone_job_ciclo$;

revoke all on function public.configurar_health_score_professor_v3_cron_ciclo_escopos()
  from public, anon, authenticated, service_role;
revoke all on function public.executar_health_score_professor_v3_job_ciclo_escopo(text, uuid)
  from public, anon, authenticated;
grant execute on function public.executar_health_score_professor_v3_job_ciclo_escopo(text, uuid)
  to service_role;

select public.configurar_health_score_professor_v3_cron_ciclo_escopos();
