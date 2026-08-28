-- Canonicaliza a leitura do papel JWT nas portas vivas de presenca.
--
-- Evidencia de producao em 2026-08-28: chamadas autenticadas da Agenda e as
-- tres execucoes naturais do sync v103 chegaram pelo claim JSON oficial, mas
-- os objetos abaixo ainda liam um GUC legado de role. O resultado foi
-- CONSOLIDADO_REQUER_ADMIN no navegador e service_role obrigatorio no sync.
--
-- Esta migration e somente DDL: preserva corpos, assinaturas, owners, ACLs,
-- security definer/invoker, flags e dados. A unica troca semantica em cada
-- definicao e a leitura do GUC legado pela funcao oficial auth.role().

-- Manifesto pre-change (md5 de pg_get_functiondef/pg_get_viewdef):
-- function public.admin_alterar_presenca_rollout_v1(p_unidade_id uuid, p_superficie text, p_modo text, p_motivo text, p_request_id uuid, p_evidencia jsonb) 921ccd0e179ce4f171930c03ab77809e
-- function public.fn_absenteismo_aluno_rollout_v1() 7bcb99d458848e2bbebe1387400cc2f0
-- function public.fn_presenca_dados_frescos_v1(p_unidade_id uuid, p_data_alvo date) eebafea2c3bface4a09b86eae127f56d
-- function public.fn_presenca_pendencias_do_dia_v2(p_unidade_id uuid, p_data date) 18f1f377a792bd096c1f7c6e01ce07ed
-- function public.fn_radar_aluno_sinais_rollout_v1() c9f75a2b1b1ffc0b7b277f2edba88e2d
-- function public.get_agenda_dia_canonica_v2(p_data date, p_unidade_id uuid) 95d4d874247a24fbad448625ad519e08
-- function public.get_agenda_dia_v2(p_data date, p_unidade_id uuid) 690a1f52e922f68d2bac4753c061535f
-- function public.get_faltas_periodo_canonico_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date) a14ad59176adbe0f2ccf9d7bef523f29
-- function public.get_frequencia_professor_periodo_canonica_v1(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date) 7f06e41d287b82dfcc7ddd6575beac42
-- function public.get_presenca_contexto_agente_canonico_v1(p_unidade_id uuid, p_data date, p_escopo text, p_professor_id integer) 0374ba04f69b3b6ab5001eef6f67beaf
-- function public.get_presenca_experimental_aluno_periodo_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_aluno_id integer) f245af412a599da0ebc7ae75e027372e
-- function public.get_presenca_ocorrencias_periodo_canonico_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_professor_id integer, p_aluno_id integer) 99e03cd1ecdd79add66d0cc782ef5dcb
-- function public.get_presenca_ocorrencias_periodo_legado_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_professor_id integer, p_aluno_id integer) 4fd62593bab6ee05660555c45533293f
-- function public.get_presenca_previa_reparo_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date) 2bc2b6bfe94f73b5fdf15102e8086c56
-- function public.get_presenca_rollout_modo_v1(p_unidade_id uuid, p_superficie text) d4b77c0c63d9aa95c776a987e795b788
-- function public.get_presenca_shadow_comparacao_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date) 3fec4489a053de029d3c8210383f5e76
-- function public.get_saude_cobertura_presenca_v1(p_data date) 92e5fa682c4b7bb9bcc4f22cebabef25
-- function public.presenca_sync_finalizar_v1(p_run_id uuid, p_status text, p_snapshot_hash text, p_contagens jsonb, p_erro_codigo text) 92e0de53de4f194c1a9edfa22242e5dd
-- function public.presenca_sync_heartbeat_v1(p_run_id uuid, p_contagens jsonb) cc6c098a71d04ec0e4f0726813fc6750
-- function public.presenca_sync_iniciar_v1(p_unidade_id uuid, p_modo text, p_data_alvo date, p_request_id uuid, p_lease_segundos integer) 690e56315a95b6f842fe5ff7de9bb40a
-- view public.vw_absenteismo_aluno_canonica_v2() 467987286b9380e02bcb410b68c0a65f
-- view public.vw_radar_aluno_sinais_canonica_v2() a4d5096bbc48fb647eb48561cc86ad4a


CREATE OR REPLACE FUNCTION public.admin_alterar_presenca_rollout_v1(p_unidade_id uuid, p_superficie text, p_modo text, p_motivo text, p_request_id uuid, p_evidencia jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_ator text;
  v_atual public.presenca_rollout_config%rowtype;
  v_evento public.presenca_rollout_eventos%rowtype;
  v_agora timestamptz := clock_timestamp();
begin
  if v_role = 'service_role' then
    v_ator := coalesce(auth.uid()::text, 'service_role');
  elsif v_role = 'authenticated'
        and auth.uid() is not null
        and public.is_admin() then
    v_ator := auth.uid()::text;
  else
    raise insufficient_privilege using message = 'administrador obrigatorio';
  end if;

  if p_unidade_id is null
     or p_superficie not in ('agenda', 'sol', 'la_teacher', 'lia', 'mila', 'relatorios', 'kpis')
     or p_modo not in ('legado', 'sombra', 'canonico_v2')
     or p_request_id is null
     or char_length(btrim(coalesce(p_motivo, ''))) not between 10 and 500
     or jsonb_typeof(coalesce(p_evidencia, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'parametros de rollout invalidos';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_unidade_id::text || ':' || p_superficie, 0
  ));

  select e.* into v_evento
    from public.presenca_rollout_eventos e
   where e.request_id = p_request_id;
  if found then
    if v_evento.unidade_id <> p_unidade_id
       or v_evento.superficie <> p_superficie
       or v_evento.modo_novo <> p_modo
       or v_evento.motivo <> btrim(p_motivo)
       or v_evento.evidencia <> coalesce(p_evidencia, '{}'::jsonb) then
      raise exception using errcode = '23505', message = 'request_id reutilizado com payload diferente';
    end if;
    return jsonb_build_object(
      'aplicada', false,
      'idempotente', true,
      'evento_id', v_evento.id,
      'modo_anterior', v_evento.modo_anterior,
      'modo_atual', v_evento.modo_novo
    );
  end if;

  if not exists (select 1 from public.unidades u where u.id = p_unidade_id) then
    raise exception using errcode = '23503', message = 'unidade inexistente';
  end if;

  insert into public.presenca_rollout_config(
    unidade_id, superficie, modo, ativado_por, ativado_em, motivo
  ) values (
    p_unidade_id, p_superficie, 'legado', v_ator, v_agora,
    'configuracao_criada_em_modo_legado'
  ) on conflict (unidade_id, superficie) do nothing;

  select c.* into v_atual
    from public.presenca_rollout_config c
   where c.unidade_id = p_unidade_id
     and c.superficie = p_superficie
   for update;

  if p_modo = 'canonico_v2' then
    if v_atual.modo <> 'sombra' then
      raise exception using errcode = '23514', message = 'canonico_v2 exige transicao previa por sombra';
    end if;
    if coalesce((p_evidencia ->> 'dias_operacionais')::integer, -1) < 7
       or coalesce((p_evidencia ->> 'sem_explicacao')::integer, -1) <> 0
       or coalesce((p_evidencia ->> 'sync_completo')::boolean, false) is not true
       or coalesce((p_evidencia ->> 'agenda_sol_convergente')::boolean, false) is not true
       or coalesce((p_evidencia ->> 'comandos_sem_recibo')::integer, -1) <> 0
       or coalesce((p_evidencia ->> 'decisoes_humanas_sobrescritas')::integer, -1) <> 0
       or coalesce((p_evidencia ->> 'vazamento_acl')::integer, -1) <> 0 then
      raise exception using errcode = '23514', message = 'evidencia insuficiente para canonico_v2';
    end if;
  elsif p_modo = 'legado' and v_atual.modo <> 'legado' then
    if lower(btrim(p_motivo)) not like 'rollback:%'
       or coalesce(p_evidencia ->> 'gatilho', '') not in (
         'sync_incompleto_sem_bloqueio',
         'divergencia_agenda_sol',
         'comando_sem_recibo',
         'decisao_humana_sobrescrita',
         'vazamento_acl',
         'delta_sem_explicacao'
       ) then
      raise exception using errcode = '23514', message = 'rollback exige gatilho governado';
    end if;
  end if;

  if v_atual.modo = p_modo then
    insert into public.presenca_rollout_eventos(
      request_id, unidade_id, superficie, modo_anterior, modo_novo,
      ativado_por, motivo, evidencia
    ) values (
      p_request_id, p_unidade_id, p_superficie, v_atual.modo, p_modo,
      v_ator, btrim(p_motivo), coalesce(p_evidencia, '{}'::jsonb)
    ) returning * into v_evento;
    return jsonb_build_object(
      'aplicada', false,
      'idempotente', true,
      'evento_id', v_evento.id,
      'modo_anterior', v_atual.modo,
      'modo_atual', p_modo
    );
  end if;

  update public.presenca_rollout_config c set
    modo = p_modo,
    ativado_por = v_ator,
    ativado_em = v_agora,
    motivo = btrim(p_motivo),
    versao = c.versao + 1
  where c.unidade_id = p_unidade_id
    and c.superficie = p_superficie;

  insert into public.presenca_rollout_eventos(
    request_id, unidade_id, superficie, modo_anterior, modo_novo,
    ativado_por, motivo, evidencia
  ) values (
    p_request_id, p_unidade_id, p_superficie, v_atual.modo, p_modo,
    v_ator, btrim(p_motivo), coalesce(p_evidencia, '{}'::jsonb)
  ) returning * into v_evento;

  return jsonb_build_object(
    'aplicada', true,
    'idempotente', false,
    'evento_id', v_evento.id,
    'modo_anterior', v_atual.modo,
    'modo_atual', p_modo,
    'versao', v_atual.versao + 1
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_absenteismo_aluno_rollout_v1()
 RETURNS SETOF vw_absenteismo_aluno_canonica_v2
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select c.*
  from public.vw_absenteismo_aluno_canonica_v2 c
  join public.alunos a on a.id = c.aluno_id
  where public.fn_presenca_rollout_modo_interno_v1(a.unidade_id, 'kpis') = 'canonico_v2'
    and (
      auth.role() = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        auth.role() = 'authenticated'
        and ((select public.is_admin()) or a.unidade_id in (select public.get_user_unidade_ids()))
      )
    )
  union all
  select
    l.aluno_id,
    l.total_aulas,
    l.faltas,
    l.taxa_historica,
    l.taxa_recente_30d,
    l.tendencia,
    l.ultima_presenca,
    l.dias_sem_presenca,
    l.confiavel,
    case when l.total_aulas is not null and l.faltas is not null
      then l.total_aulas - l.faltas else null end::bigint,
    l.faltas::bigint,
    0::bigint,
    null::bigint,
    null::bigint,
    null::bigint,
    null::bigint,
    'legado'::text,
    'publicavel'::text,
    null::timestamptz,
    'presenca-legado-v1'::text
  from public.vw_absenteismo_aluno_legado_v1 l
  join public.alunos a on a.id = l.aluno_id
  where public.fn_presenca_rollout_modo_interno_v1(a.unidade_id, 'kpis') <> 'canonico_v2'
    and (
      auth.role() = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        auth.role() = 'authenticated'
        and ((select public.is_admin()) or a.unidade_id in (select public.get_user_unidade_ids()))
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.fn_presenca_dados_frescos_v1(p_unidade_id uuid, p_data_alvo date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user::text not in ('postgres', 'service_role') then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  return public.fn_presenca_dados_frescos_interno_v1(p_unidade_id, p_data_alvo);
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_presenca_pendencias_do_dia_v2(p_unidade_id uuid, p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_frescor jsonb;
  v_status text;
  v_sincronizado_em timestamptz;
  v_pendencias jsonb := '[]'::jsonb;
  v_conflitos jsonb := '[]'::jsonb;
  v_revisoes jsonb := '[]'::jsonb;
  v_tem_revisao boolean := false;
  v_inicio_dia timestamptz := p_data::timestamp at time zone 'America/Sao_Paulo';
begin
  if p_unidade_id is null or p_data is null then
    raise exception 'UNIDADE_E_DATA_OBRIGATORIAS' using errcode = '22023';
  end if;

  if v_role <> 'service_role' and session_user::text not in (
    'postgres', 'service_role',
    'sol_acesso_restrito', 'lia_acesso_restrito', 'mila_acesso_restrito'
  ) then
    if v_role <> 'authenticated'
       or not (
         (select public.is_admin())
         or p_unidade_id in (select public.get_user_unidade_ids())
       ) then
      raise insufficient_privilege using message = 'UNIDADE_NAO_AUTORIZADA';
    end if;
  end if;

  if v_role = 'service_role' or session_user::text in ('postgres', 'service_role') then
    v_frescor := public.fn_presenca_dados_frescos_v1(p_unidade_id, p_data);
  else
    v_frescor := public.fn_presenca_dados_frescos_interno_v1(p_unidade_id, p_data);
  end if;

  v_sincronizado_em := nullif(v_frescor ->> 'finalizada_em', '')::timestamptz;

  select exists (
    select 1
    from public.aulas_emusys ae
    left join public.aula_roster_sync_estado re on re.aula_id = ae.id
    where ae.unidade_id = p_unidade_id
      and ae.data_aula = p_data
      and ae.data_hora_fim < now()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and not coalesce(ae.cancelada, false)
      and ae.professor_id is not null
      and (
        coalesce(re.estado, 'sem_fotografia') in ('incompleto', 'ambiguo', 'sem_fotografia')
        or re.sincronizado_em is null
        or re.sincronizado_em < v_inicio_dia
        or (v_sincronizado_em is not null and re.sincronizado_em > v_sincronizado_em)
      )
  ) into v_tem_revisao;

  if coalesce((v_frescor ->> 'publicavel')::boolean, false) is not true then
    v_status := 'dados_desatualizados';
  elsif v_tem_revisao then
    v_status := 'roster_em_revisao';
  else
    v_status := 'atualizados';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aula_emusys_id', x.aula_id,
    'estado', x.estado,
    'qtd_esperada', x.qtd_esperada,
    'qtd_recebida', x.qtd_recebida,
    'sincronizado_em', x.sincronizado_em
  ) order by x.aula_id), '[]'::jsonb)
  into v_revisoes
  from (
    select ae.id as aula_id,
           case
             when coalesce(re.estado, 'sem_fotografia') in ('incompleto', 'ambiguo', 'sem_fotografia')
               then coalesce(re.estado, 'sem_fotografia')
             else 'roster_desatualizado'
           end as estado,
           re.qtd_esperada,
           re.qtd_recebida,
           re.sincronizado_em
    from public.aulas_emusys ae
    left join public.aula_roster_sync_estado re on re.aula_id = ae.id
    where ae.unidade_id = p_unidade_id
      and ae.data_aula = p_data
      and ae.data_hora_fim < now()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and not coalesce(ae.cancelada, false)
      and ae.professor_id is not null
      and (
        coalesce(re.estado, 'sem_fotografia') in ('incompleto', 'ambiguo', 'sem_fotografia')
        or re.sincronizado_em is null
        or re.sincronizado_em < v_inicio_dia
        or (v_sincronizado_em is not null and re.sincronizado_em > v_sincronizado_em)
      )
  ) x;

  if v_status = 'atualizados' then
    with candidatos as (
      select
        public.fn_presenca_slot_key_v2(
          r.aluno_id,
          ae.unidade_id,
          ae.professor_id,
          ae.data_hora_inicio,
          ae.data_hora_fim,
          ae.curso_nome
        ) as slot_key,
        r.aluno_id,
        ae.id as aula_emusys_id,
        ae.unidade_id,
        ae.professor_id,
        ae.data_hora_inicio,
        ae.data_hora_fim,
        ae.curso_nome,
        ae.turma_nome,
        row_number() over (
          partition by
            r.aluno_id, ae.unidade_id, ae.professor_id,
            ae.data_hora_inicio, ae.data_hora_fim,
            lower(btrim(coalesce(ae.curso_nome, '')))
          order by
            nullif(ae.matricula_disciplina_id, 0) nulls last,
            case when ae.tipo = 'turma' then 0 else 1 end,
            ae.id
        ) as posicao
      from public.vw_aula_roster_operacional_v1 r
      join public.aulas_emusys ae on ae.id = r.aula_emusys_id
      where ae.unidade_id = p_unidade_id
        and ae.data_aula = p_data
        and ae.data_hora_fim < now()
        and coalesce(ae.categoria, 'normal') = 'normal'
        and ae.professor_id is not null
        and public.fn_presenca_pendencia_elegivel(
          ae.unidade_id,
          r.aluno_id,
          ae.data_aula,
          ae.matricula_disciplina_id,
          ae.curso_nome
        )
        and not exists (
          select 1
          from public.aulas_emusys g
          where g.unidade_id = ae.unidade_id
            and g.professor_id = ae.professor_id
            and g.data_hora_inicio = ae.data_hora_inicio
            and g.data_hora_fim = ae.data_hora_fim
            and lower(btrim(coalesce(g.curso_nome, '')))
                = lower(btrim(coalesce(ae.curso_nome, '')))
            and (coalesce(g.cancelada, false) or coalesce(g.justificada, false))
        )
    ), pares as (
      select * from candidatos where posicao = 1
    ), enriquecidos as (
      select p.*,
             al.nome as aluno_nome,
             pr.nome as professor_nome,
             o.resultado_canonico,
             o.fecha_chamada,
             o.fonte_decisao,
             o.decidido_em,
             o.possui_conflito,
             o.regra_versao as ocorrencia_regra_versao
      from pares p
      join public.alunos al on al.id = p.aluno_id
      left join public.professores pr on pr.id = p.professor_id
      left join public.vw_presenca_ocorrencia_canonica_v2 o on o.slot_key = p.slot_key
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'slot_key', e.slot_key,
        'aula_emusys_id', e.aula_emusys_id,
        'aluno_id', e.aluno_id,
        'aluno_nome', e.aluno_nome,
        'professor_id', e.professor_id,
        'professor_nome', coalesce(e.professor_nome, '(sem professor)'),
        'curso_nome', coalesce(e.curso_nome, e.turma_nome, 'Aula'),
        'turma_nome', e.turma_nome,
        'hora', to_char(e.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'motivo', 'sem_resposta',
        'resultado_canonico', coalesce(e.resultado_canonico, 'indeterminado'),
        'fonte_decisao', coalesce(e.fonte_decisao, 'sem_registro')
      ) order by e.professor_nome, e.data_hora_inicio, e.aluno_nome)
        filter (where coalesce(e.fecha_chamada, false) = false and not coalesce(e.possui_conflito, false)),
        '[]'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object(
        'slot_key', e.slot_key,
        'aula_emusys_id', e.aula_emusys_id,
        'aluno_id', e.aluno_id,
        'aluno_nome', e.aluno_nome,
        'professor_id', e.professor_id,
        'professor_nome', coalesce(e.professor_nome, '(sem professor)'),
        'curso_nome', coalesce(e.curso_nome, e.turma_nome, 'Aula'),
        'turma_nome', e.turma_nome,
        'hora', to_char(e.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'motivo', 'divergencia',
        'resultado_canonico', e.resultado_canonico,
        'fonte_decisao', e.fonte_decisao,
        'decidido_em', e.decidido_em,
        'detalhe', 'Decisoes de presenca conflitantes; revisar a ocorrencia canonica.'
      ) order by e.professor_nome, e.data_hora_inicio, e.aluno_nome)
        filter (where coalesce(e.possui_conflito, false)),
        '[]'::jsonb)
    into v_pendencias, v_conflitos
    from enriquecidos e;
  end if;

  return jsonb_build_object(
    'dados_status', v_status,
    'sincronizado_em', v_sincronizado_em,
    'regra_versao', 'presenca-v2',
    'pendencias', v_pendencias,
    'conflitos', v_conflitos,
    'revisoes_estruturais', v_revisoes
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_radar_aluno_sinais_rollout_v1()
 RETURNS SETOF vw_radar_aluno_sinais_canonica_v2
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select c.*
  from public.vw_radar_aluno_sinais_canonica_v2 c
  where public.fn_presenca_rollout_modo_interno_v1(c.unidade_id, 'kpis') = 'canonico_v2'
    and (
      auth.role() = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        auth.role() = 'authenticated'
        and ((select public.is_admin()) or c.unidade_id in (select public.get_user_unidade_ids()))
      )
    )
  union all
  select
    l.*,
    0::bigint,
    'legado'::text,
    'publicavel'::text,
    null::timestamptz,
    'presenca-legado-v1'::text
  from public.vw_radar_aluno_sinais_legado_v1 l
  where public.fn_presenca_rollout_modo_interno_v1(l.unidade_id, 'kpis') <> 'canonico_v2'
    and (
      auth.role() = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        auth.role() = 'authenticated'
        and ((select public.is_admin()) or l.unidade_id in (select public.get_user_unidade_ids()))
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_agenda_dia_canonica_v2(p_data date, p_unidade_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_envelope jsonb;
  v_unidade record;
  v_item jsonb;
  v_status text := 'atualizados';
  v_sincronizado_em timestamptz;
  v_pendencias jsonb := '[]'::jsonb;
  v_conflitos jsonb := '[]'::jsonb;
  v_revisoes jsonb := '[]'::jsonb;
  v_aulas jsonb;
  v_ocorrencias jsonb := '[]'::jsonb;
  v_professores_ocorrencias jsonb := '[]'::jsonb;
begin
  if p_data is null then
    raise exception 'DATA_OBRIGATORIA' using errcode = '22023';
  end if;

  if p_unidade_id is not null then
    v_envelope := public.fn_presenca_pendencias_do_dia_v2(p_unidade_id, p_data);
  else
    if v_role <> 'service_role' and session_user::text not in ('postgres', 'service_role')
       and not (select public.is_admin()) then
      raise insufficient_privilege using message = 'CONSOLIDADO_REQUER_ADMIN';
    end if;

    for v_unidade in
      select distinct ae.unidade_id
      from public.aulas_emusys ae
      where ae.data_aula = p_data
        and ae.data_hora_fim < now()
        and coalesce(ae.categoria, 'normal') = 'normal'
        and not coalesce(ae.cancelada, false)
        and ae.professor_id is not null
    loop
      v_item := public.fn_presenca_pendencias_do_dia_v2(v_unidade.unidade_id, p_data);
      if v_item ->> 'dados_status' = 'dados_desatualizados' then
        v_status := 'dados_desatualizados';
      elsif v_item ->> 'dados_status' = 'roster_em_revisao' and v_status = 'atualizados' then
        v_status := 'roster_em_revisao';
      end if;
      if nullif(v_item ->> 'sincronizado_em', '') is not null then
        v_sincronizado_em := least(
          coalesce(v_sincronizado_em, (v_item ->> 'sincronizado_em')::timestamptz),
          (v_item ->> 'sincronizado_em')::timestamptz
        );
      end if;
      v_pendencias := v_pendencias || coalesce(v_item -> 'pendencias', '[]'::jsonb);
      v_conflitos := v_conflitos || coalesce(v_item -> 'conflitos', '[]'::jsonb);
      v_revisoes := v_revisoes || coalesce(v_item -> 'revisoes_estruturais', '[]'::jsonb);
    end loop;
    v_envelope := jsonb_build_object(
      'dados_status', v_status,
      'sincronizado_em', v_sincronizado_em,
      'regra_versao', 'presenca-v2',
      'pendencias', v_pendencias,
      'conflitos', v_conflitos,
      'revisoes_estruturais', v_revisoes
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
  into v_aulas
  from public.get_agenda_dia(p_data, p_unidade_id) g;

  -- Estado visual por ocorrência, sem nomes. O recibo só é associado quando o
  -- evento aplicado coincide em pessoa, aula, fonte, estado e instante; assim
  -- uma decisão antiga não recebe por engano o request_id de outro comando.
  if v_envelope ->> 'dados_status' = 'atualizados' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'slot_key', o.slot_key,
      'aluno_id', o.aluno_id,
      'ids_aulas_emusys', to_jsonb(o.ids_aulas_emusys),
      'resultado_canonico', o.resultado_canonico,
      'fonte_decisao', o.fonte_decisao,
      'decidido_em', o.decidido_em,
      'possui_conflito', o.possui_conflito,
      'request_id', recibo.request_id,
      'recibo_status', recibo.status
    )) order by o.data_hora_inicio, o.aluno_id, o.slot_key), '[]'::jsonb)
    into v_ocorrencias
    from public.vw_presenca_ocorrencia_canonica_v2 o
    left join lateral (
      select e.request_id, c.status
      from public.presenca_acao_eventos e
      join public.presenca_comandos c on c.request_id = e.request_id
      where e.tipo = 'item_aplicado'
        and e.aluno_id = o.aluno_id
        and e.aula_id = any(o.ids_aulas_emusys)
        and e.status_novo = o.resultado_canonico
        and e.fonte = o.fonte_decisao
        and o.decidido_em is not null
        and abs(extract(epoch from (e.criado_em - o.decidido_em))) <= 60
      order by abs(extract(epoch from (e.criado_em - o.decidido_em))), e.id desc
      limit 1
    ) recibo on true
    where o.data_aula = p_data
      and (p_unidade_id is null or o.unidade_id = p_unidade_id);

    -- O valor bruto `ausente` do professor tambem e default do Emusys. So vira
    -- estado operacional quando existe origem humana preservada na aula. O
    -- recibo e anexado pelo mesmo ledger append-only dos demais comandos.
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'aula_emusys_id', ae.id,
      'professor_id', ae.professor_id,
      'estado', case
        when lower(ae.professor_presenca) = 'presente' then 'presente'
        when lower(ae.professor_presenca) = 'ausente' then 'ausente'
        else 'indeterminado'
      end,
      'fonte', ae.professor_presenca_origem,
      'decidido_em', recibo.criado_em,
      'request_id', recibo.request_id,
      'recibo_status', recibo.status
    )) order by ae.data_hora_inicio, ae.id), '[]'::jsonb)
    into v_professores_ocorrencias
    from public.aulas_emusys ae
    left join lateral (
      select e.request_id, e.criado_em, c.status
      from public.presenca_acao_eventos e
      join public.presenca_comandos c on c.request_id = e.request_id
      where e.tipo = 'item_aplicado'
        and e.professor_id = ae.professor_id
        and e.status_novo = lower(ae.professor_presenca)
        and e.fonte = ae.professor_presenca_origem
        and (
          e.aula_id = ae.id
          or (
            e.aula_id is null
            and c.data_referencia = ae.data_aula
            and c.unidade_id = ae.unidade_id
          )
        )
      order by e.criado_em desc, e.id desc
      limit 1
    ) recibo on true
    where ae.data_aula = p_data
      and (p_unidade_id is null or ae.unidade_id = p_unidade_id)
      and ae.professor_id is not null
      and ae.professor_presenca_origem is not null;
  end if;

  return v_envelope || jsonb_build_object(
    'aulas', v_aulas,
    'ocorrencias', v_ocorrencias,
    'professores_ocorrencias', v_professores_ocorrencias
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_agenda_dia_v2(p_data date, p_unidade_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_modo text;
  v_resultado jsonb;
begin
  if p_data is null then
    raise exception 'DATA_OBRIGATORIA' using errcode = '22023';
  end if;

  if v_role <> 'service_role'
     and session_user::text not in ('postgres', 'service_role') then
    if p_unidade_id is null then
      if v_role <> 'authenticated' or not (select public.is_admin()) then
        raise insufficient_privilege using message = 'CONSOLIDADO_REQUER_ADMIN';
      end if;
    elsif v_role <> 'authenticated'
       or not (
         (select public.is_admin())
         or p_unidade_id in (select public.get_user_unidade_ids())
       ) then
      raise insufficient_privilege using message = 'UNIDADE_NAO_AUTORIZADA';
    end if;
  end if;

  v_modo := public.fn_presenca_rollout_modo_escopo_interno_v1(
    p_unidade_id,
    'agenda'
  );

  if v_modo = 'canonico_v2' then
    return public.get_agenda_dia_canonica_v2(p_data, p_unidade_id)
      || jsonb_build_object('rollout_modo', v_modo);
  end if;

  if v_modo = 'sombra' then
    begin
      perform public.get_agenda_dia_canonica_v2(p_data, p_unidade_id);
    exception when others then
      null;
    end;
  end if;

  v_resultado := public.fn_agenda_dia_legado_envelope_v1(p_data, p_unidade_id);
  return v_resultado || jsonb_build_object('rollout_modo', v_modo);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_faltas_periodo_canonico_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date)
 RETURNS TABLE(aluno_id integer, nome text, unidade_id uuid, unidade_codigo text, curso_nome text, professor_nome text, telefone text, whatsapp text, responsavel_telefone text, denominador bigint, presentes bigint, faltas bigint, faltas_justificadas bigint, faltas_total bigint, percentual_presenca numeric, is_projeto_banda boolean, dados_status text, estado_publicacao text, sincronizado_em timestamp with time zone, regra_versao text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with unidades_observadas as (
    select distinct o.unidade_id
    from public.vw_presenca_ocorrencia_metrica_v2 o
    where o.data_aula between p_data_inicio and p_data_fim
      and (p_unidade_id is null or o.unidade_id = p_unidade_id)
      and (
        auth.role() = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          auth.role() = 'authenticated'
          and (
            (select public.is_admin())
            or o.unidade_id in (select public.get_user_unidade_ids())
          )
        )
      )
  ), unidades_alvo as (
    select u.unidade_id from unidades_observadas u
    union
    select p_unidade_id
    where p_unidade_id is not null
      and (
        auth.role() = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          auth.role() = 'authenticated'
          and (
            (select public.is_admin())
            or p_unidade_id in (select public.get_user_unidade_ids())
          )
        )
      )
  ), metricas as (
    select m.*
    from unidades_alvo u
    cross join lateral public.get_presenca_metricas_canonicas_v2(
      u.unidade_id, p_data_inicio, p_data_fim, null, null
    ) m
  ), agregada as (
    select
      m.aluno_id,
      m.unidade_id,
      sum(m.denominador_observado)::bigint as denominador_observado,
      sum(m.presentes_observados)::bigint as presentes_observados,
      sum(m.faltas_observadas)::bigint as faltas_observadas,
      sum(m.faltas_justificadas_observadas)::bigint
        as faltas_justificadas_observadas,
      bool_and(m.estado_publicacao = 'publicavel') as publicavel,
      max(m.dados_status) as dados_status,
      max(m.estado_publicacao) as estado_publicacao,
      max(m.sincronizado_em) as sincronizado_em
    from metricas m
    where m.aluno_id is not null
    group by m.aluno_id, m.unidade_id
  )
  select
    a.id,
    a.nome::text,
    g.unidade_id,
    u.codigo::text,
    c.nome::text,
    pr.nome::text,
    a.telefone::text,
    a.whatsapp::text,
    a.responsavel_telefone::text,
    case when g.publicavel then g.denominador_observado else null end,
    case when g.publicavel then g.presentes_observados else null end,
    case when g.publicavel then g.faltas_observadas else null end,
    case when g.publicavel then g.faltas_justificadas_observadas else null end,
    case when g.publicavel
      then g.faltas_observadas + g.faltas_justificadas_observadas
      else null
    end,
    case when g.publicavel and g.denominador_observado > 0
      then round(
        g.presentes_observados::numeric / g.denominador_observado * 100,
        2
      )
      else null
    end,
    coalesce(c.is_projeto_banda, false),
    g.dados_status,
    g.estado_publicacao,
    g.sincronizado_em,
    'faltas-periodo-v2.1'::text
  from agregada g
  join public.alunos a
    on a.id = g.aluno_id and a.unidade_id = g.unidade_id
  left join public.unidades u on u.id = a.unidade_id
  left join public.cursos c on c.id = a.curso_id
  left join public.professores pr on pr.id = a.professor_atual_id
  where g.faltas_observadas + g.faltas_justificadas_observadas >= 1
    and a.status in ('ativo', 'aviso_previo')
  order by
    g.faltas_observadas + g.faltas_justificadas_observadas desc,
    a.nome;
$function$;

CREATE OR REPLACE FUNCTION public.get_frequencia_professor_periodo_canonica_v1(p_ano integer, p_mes integer, p_unidade_id uuid DEFAULT NULL::uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date)
 RETURNS TABLE(professor_id integer, unidade_id uuid, ano integer, mes integer, total_pessoas_evidencia integer, total_eventos_evidencia integer, eventos_resultado_confirmado integer, presencas_confirmadas integer, faltas_confirmadas integer, faltas_provaveis integer, chamadas_indeterminadas integer, eventos_excluidos integer, conflitos integer, media_presenca numeric, taxa_faltas numeric, cobertura_resultado_confirmado numeric, confianca_presenca text, regra_versao text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with parametros as (
    select
      coalesce(p_data_inicio, make_date(p_ano, p_mes, 1)) as inicio,
      coalesce(
        p_data_fim,
        (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
      ) as fim
  ), unidades_alvo as (
    select distinct o.unidade_id
    from public.vw_presenca_ocorrencia_metrica_v2 o
    cross join parametros p
    where o.data_aula between p.inicio and p.fim
      and (p_unidade_id is null or o.unidade_id = p_unidade_id)
      and (
        auth.role() = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          auth.role() = 'authenticated'
          and (
            (select public.is_admin())
            or o.unidade_id in (select public.get_user_unidade_ids())
          )
        )
      )
  ), metricas as (
    select m.*
    from unidades_alvo u
    cross join parametros p
    cross join lateral public.get_presenca_metricas_canonicas_v2(
      u.unidade_id, p.inicio, p.fim, null, null
    ) m
  ), agregado as (
    select
      m.professor_id,
      m.unidade_id,
      count(distinct m.aluno_id)::integer as total_pessoas_evidencia,
      sum(m.ocorrencias_observadas)::integer as total_eventos_evidencia,
      sum(m.denominador_observado)::integer as eventos_resultado_confirmado,
      sum(m.presentes_observados)::integer as presencas_confirmadas,
      sum(m.faltas_observadas + m.faltas_justificadas_observadas)::integer
        as faltas_confirmadas,
      0::integer as faltas_provaveis,
      sum(m.ocorrencias_incompletas)::integer as chamadas_indeterminadas,
      sum(m.eventos_excluidos_observados)::integer as eventos_excluidos,
      sum(m.conflitos)::integer as conflitos,
      bool_and(m.estado_publicacao = 'publicavel') as publicavel
    from metricas m
    where m.professor_id is not null
    group by m.professor_id, m.unidade_id
  )
  select
    a.professor_id,
    a.unidade_id,
    p_ano,
    p_mes,
    a.total_pessoas_evidencia,
    a.total_eventos_evidencia,
    a.eventos_resultado_confirmado,
    a.presencas_confirmadas,
    a.faltas_confirmadas,
    a.faltas_provaveis,
    a.chamadas_indeterminadas,
    a.eventos_excluidos,
    a.conflitos,
    case
      when a.publicavel and a.eventos_resultado_confirmado > 0
        then round(a.presencas_confirmadas::numeric
          / a.eventos_resultado_confirmado * 100, 2)
      else null
    end,
    case
      when a.publicavel and a.eventos_resultado_confirmado > 0
        then round(a.faltas_confirmadas::numeric
          / a.eventos_resultado_confirmado * 100, 2)
      else null
    end,
    case
      when a.eventos_resultado_confirmado + a.chamadas_indeterminadas > 0
        then round(a.eventos_resultado_confirmado::numeric
          / (a.eventos_resultado_confirmado + a.chamadas_indeterminadas), 6)
      else null
    end,
    case
      when not a.publicavel then 'em_auditoria'
      when a.conflitos > 0 then 'baixa'
      when a.eventos_resultado_confirmado = 0 then 'sem_base'
      when a.eventos_resultado_confirmado >= 10
        and a.chamadas_indeterminadas = 0 then 'alta'
      when a.eventos_resultado_confirmado >= 5
        and a.eventos_resultado_confirmado::numeric
          / nullif(a.eventos_resultado_confirmado + a.chamadas_indeterminadas, 0)
          >= 0.8 then 'media'
      else 'baixa'
    end,
    'frequencia-professor-canonica-v2.1'::text
  from agregado a
  order by a.professor_id, a.unidade_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_presenca_contexto_agente_canonico_v1(p_unidade_id uuid, p_data date, p_escopo text, p_professor_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_escopo text := lower(btrim(coalesce(p_escopo, '')));
  v_claim_role text := coalesce(auth.role(), '');
  v_sessao text := session_user::text;
  v_envelope jsonb;
  v_ocorrencias jsonb := '[]'::jsonb;
  v_universo integer := 0;
  v_presentes integer := 0;
  v_faltas integer := 0;
  v_indeterminados integer := 0;
  v_conflitos integer := 0;
  v_publicacao text;
begin
  if p_unidade_id is null or p_data is null then
    raise exception 'UNIDADE_E_DATA_OBRIGATORIAS' using errcode = '22023';
  end if;
  if v_escopo not in ('sol', 'lia', 'mila', 'fabio', 'bi') then
    raise exception 'ESCOPO_PRESENCA_INVALIDO' using errcode = '22023';
  end if;

  -- Edge Functions usam service_role. Os papeis SQL restritos somente podem
  -- solicitar a finalidade que lhes pertence.
  if v_claim_role <> 'service_role' and v_sessao not in ('postgres', 'service_role') then
    if not (
      (v_sessao = 'sol_acesso_restrito' and v_escopo = 'sol')
      or (v_sessao = 'lia_acesso_restrito' and v_escopo = 'lia')
      or (v_sessao = 'mila_acesso_restrito' and v_escopo = 'mila')
      or (
        v_claim_role = 'authenticated'
        and v_escopo = 'sol'
        and (
          (select public.is_admin())
          or p_unidade_id in (select public.get_user_unidade_ids())
        )
      )
    ) then
      raise insufficient_privilege using message = 'ESCOPO_AGENTE_NAO_AUTORIZADO';
    end if;
  end if;

  if v_escopo = 'mila' then
    return jsonb_build_object(
      'dados_status', 'contrato_experimental',
      'sincronizado_em', null,
      'regra_versao', 'presenca-experimental-lead-v1',
      'periodo', jsonb_build_object('inicio', p_data, 'fim', p_data),
      'universo_eventos', 0,
      'presentes', 0,
      'faltas_confirmadas', 0,
      'indeterminados', 0,
      'conflitos', 0,
      'revisoes_estruturais', 0,
      'estado_publicacao', 'contrato_experimental',
      'fonte', 'vw_conciliacao_experimentais_v2',
      'experimentais', jsonb_build_object(
        'contrato', 'lead_ou_vinculo_experimental',
        'presenca_regular_como_atalho', false
      )
    );
  end if;

  v_envelope := public.fn_presenca_pendencias_do_dia_v2(p_unidade_id, p_data);

  select
    count(*) filter (where resultado_canonico not in ('aula_cancelada', 'aula_justificada'))::integer,
    count(*) filter (where resultado_canonico = 'presente' and not possui_conflito)::integer,
    count(*) filter (where resultado_canonico in ('falta', 'falta_justificada') and not possui_conflito)::integer,
    count(*) filter (where resultado_canonico = 'indeterminado' and not possui_conflito)::integer,
    count(*) filter (where possui_conflito)::integer
  into v_universo, v_presentes, v_faltas, v_indeterminados, v_conflitos
  from public.vw_presenca_ocorrencia_canonica_v2 o
  where o.unidade_id = p_unidade_id
    and o.data_aula = p_data
    and (v_escopo <> 'fabio' or (p_professor_id is not null and o.professor_id = p_professor_id));

  -- O read model contém decisões existentes; o roster canônico acrescenta as
  -- ocorrências ainda sem linha, que são indeterminadas (jamais faltas).
  if v_escopo <> 'fabio' then
    v_indeterminados := v_indeterminados
      + jsonb_array_length(coalesce(v_envelope -> 'pendencias', '[]'::jsonb));
  end if;
  v_universo := v_presentes + v_faltas + v_indeterminados + v_conflitos;

  if (v_envelope ->> 'dados_status') = 'atualizados' then
    v_publicacao := 'publicavel';
  else
    v_publicacao := 'em_auditoria';
    v_presentes := 0;
    v_faltas := 0;
    v_indeterminados := 0;
    v_conflitos := jsonb_array_length(coalesce(v_envelope -> 'conflitos', '[]'::jsonb));
  end if;

  if v_escopo = 'fabio' then
    if p_professor_id is null then
      raise exception 'PROFESSOR_OBRIGATORIO_PARA_FABIO' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'slot_key', o.slot_key,
      'aluno_id', o.aluno_id,
      'professor_id', o.professor_id,
      'inicio', o.data_hora_inicio,
      'fim', o.data_hora_fim,
      'curso', o.curso_nome,
      'resultado_canonico', o.resultado_canonico,
      'fonte_decisao', o.fonte_decisao,
      'decidido_em', o.decidido_em,
      'possui_conflito', o.possui_conflito,
      'regra_versao', o.regra_versao
    ) order by o.data_hora_inicio, o.aluno_id), '[]'::jsonb)
    into v_ocorrencias
    from public.vw_presenca_ocorrencia_canonica_v2 o
    where o.unidade_id = p_unidade_id
      and o.data_aula = p_data
      and o.professor_id = p_professor_id;
  end if;

  return jsonb_build_object(
    'dados_status', v_envelope ->> 'dados_status',
    'sincronizado_em', v_envelope -> 'sincronizado_em',
    'regra_versao', 'presenca-agentes-v1+presenca-v2',
    'periodo', jsonb_build_object('inicio', p_data, 'fim', p_data),
    'universo_eventos', case when v_publicacao = 'publicavel' then v_universo else null end,
    'presentes', case when v_publicacao = 'publicavel' then v_presentes else null end,
    'faltas_confirmadas', case when v_publicacao = 'publicavel' then v_faltas else null end,
    'indeterminados', case when v_publicacao = 'publicavel' then v_indeterminados else null end,
    'conflitos', v_conflitos,
    'revisoes_estruturais', jsonb_array_length(coalesce(v_envelope -> 'revisoes_estruturais', '[]'::jsonb)),
    'estado_publicacao', v_publicacao,
    'fonte', 'vw_presenca_ocorrencia_canonica_v2',
    'pendencias', case when v_escopo = 'sol' then coalesce(v_envelope -> 'pendencias', '[]'::jsonb) else '[]'::jsonb end,
    'conflitos_detalhes', case when v_escopo = 'sol' then coalesce(v_envelope -> 'conflitos', '[]'::jsonb) else '[]'::jsonb end,
    'revisoes_estruturais_detalhes', case when v_escopo = 'sol' then coalesce(v_envelope -> 'revisoes_estruturais', '[]'::jsonb) else '[]'::jsonb end,
    'ocorrencias', case when v_escopo = 'fabio' then v_ocorrencias else '[]'::jsonb end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_presenca_experimental_aluno_periodo_v1(p_unidade_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_aluno_id integer DEFAULT NULL::integer)
 RETURNS TABLE(aluno_id integer, aluno_nome text, unidade_id uuid, data_aula date, horario_aula time without time zone, curso_nome text, resultado text, professor_nome text, turma_nome text, sala_nome text, anotacoes text, duracao_minutos integer, tipo text, nr_da_aula integer, qtd_alunos integer, fonte text, estado_publicacao text, regra_versao text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select distinct on (
    ap.aluno_id, ap.unidade_id, ap.data_aula, ap.horario_aula,
    lower(coalesce(ap.curso_nome, ''))
  )
    ap.aluno_id,
    a.nome::text,
    ap.unidade_id,
    ap.data_aula,
    ap.horario_aula::time,
    ap.curso_nome::text,
    case
      when lower(ap.status::text) = 'presente' then 'presente'
      when lower(ap.status::text) = 'ausente' then 'falta'
      else 'indeterminado'
    end,
    ae.professor_nome::text,
    ap.turma_nome::text,
    ap.sala_nome::text,
    ae.anotacoes::text,
    ae.duracao_minutos::integer,
    ae.tipo::text,
    ae.nr_da_aula::integer,
    ae.qtd_alunos::integer,
    'presenca-experimental'::text,
    'experimental'::text,
    'presenca-experimental-v1.1'::text
  from public.aluno_presenca ap
  join public.alunos a on a.id = ap.aluno_id
  join public.aulas_emusys ae
    on ae.id = ap.aula_emusys_id
   and ae.unidade_id = ap.unidade_id
  where coalesce(ae.categoria, 'normal') = 'experimental'
    and (p_unidade_id is null or ap.unidade_id = p_unidade_id)
    and (p_aluno_id is null or ap.aluno_id = p_aluno_id)
    and (p_data_inicio is null or ap.data_aula >= p_data_inicio)
    and (p_data_fim is null or ap.data_aula <= p_data_fim)
    and lower(ap.status::text) in ('presente', 'ausente')
    and (
      auth.role() = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        auth.role() = 'authenticated'
        and (
          (select public.is_admin())
          or ap.unidade_id in (select public.get_user_unidade_ids())
        )
      )
    )
  order by
    ap.aluno_id, ap.unidade_id, ap.data_aula, ap.horario_aula,
    lower(coalesce(ap.curso_nome, '')),
    ap.respondido_em desc nulls last,
    ap.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_presenca_ocorrencias_periodo_canonico_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_professor_id integer DEFAULT NULL::integer, p_aluno_id integer DEFAULT NULL::integer)
 RETURNS TABLE(slot_key text, aluno_id integer, aluno_nome text, unidade_id uuid, professor_id integer, professor_nome text, data_aula date, horario_aula time without time zone, curso_nome text, resultado_canonico text, fonte_decisao text, possui_conflito boolean, turma_nome text, sala_nome text, anotacoes text, duracao_minutos integer, tipo text, nr_da_aula integer, qtd_alunos integer, universo_eventos bigint, presentes bigint, faltas bigint, faltas_justificadas bigint, dados_status text, estado_publicacao text, sincronizado_em timestamp with time zone, regra_versao text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if p_data_inicio is null
     or p_data_fim is null
     or p_data_inicio > p_data_fim
     or p_data_fim - p_data_inicio > 370 then
    raise exception using
      errcode = '22023',
      message = 'PRESENCA_OCORRENCIAS_PERIODO_INVALIDO';
  end if;

  return query
  with permitida as (
    select o.*
    from public.vw_presenca_ocorrencia_canonica_v2 o
    where o.data_aula between p_data_inicio and p_data_fim
      and (p_unidade_id is null or o.unidade_id = p_unidade_id)
      and (p_professor_id is null or o.professor_id = p_professor_id)
      and (p_aluno_id is null or o.aluno_id = p_aluno_id)
      and (
        auth.role() = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          auth.role() = 'authenticated'
          and (
            (select public.is_admin())
            or o.unidade_id in (select public.get_user_unidade_ids())
          )
        )
      )
  ), frescor as (
    select
      u.unidade_id,
      public.fn_presenca_estado_publicacao_periodo_v2(
        u.unidade_id, p_data_inicio, p_data_fim
      ) as envelope
    from (select distinct p.unidade_id from permitida p) u
  ), enriquecida as (
    select
      p.*,
      a.nome::text as aluno_nome,
      pr.nome::text as professor_nome,
      ae.anotacoes::text,
      ae.duracao_minutos::integer,
      ae.tipo::text,
      ae.nr_da_aula::integer,
      ae.qtd_alunos::integer,
      f.envelope,
      count(*) filter (
        where p.resultado_canonico in (
          'presente', 'falta', 'falta_justificada'
        )
      ) over (partition by p.unidade_id)::bigint as universo_eventos,
      count(*) filter (where p.resultado_canonico = 'presente')
        over (partition by p.unidade_id)::bigint as presentes,
      count(*) filter (where p.resultado_canonico = 'falta')
        over (partition by p.unidade_id)::bigint as faltas,
      count(*) filter (where p.resultado_canonico = 'falta_justificada')
        over (partition by p.unidade_id)::bigint as faltas_justificadas
    from permitida p
    join public.alunos a on a.id = p.aluno_id
    left join public.professores pr on pr.id = p.professor_id
    left join lateral (
      select x.anotacoes, x.duracao_minutos, x.tipo, x.nr_da_aula,
             x.qtd_alunos
      from public.aulas_emusys x
      where x.id = any(p.ids_aulas_emusys)
      order by x.id
      limit 1
    ) ae on true
    join frescor f on f.unidade_id = p.unidade_id
  )
  select
    e.slot_key,
    e.aluno_id,
    e.aluno_nome,
    e.unidade_id,
    e.professor_id,
    e.professor_nome,
    e.data_aula,
    e.data_hora_inicio::time,
    e.curso_nome,
    e.resultado_canonico,
    e.fonte_decisao,
    e.possui_conflito,
    null::text as turma_nome,
    null::text as sala_nome,
    e.anotacoes,
    e.duracao_minutos,
    e.tipo,
    e.nr_da_aula,
    e.qtd_alunos,
    e.universo_eventos,
    e.presentes,
    e.faltas,
    e.faltas_justificadas,
    e.envelope ->> 'dados_status',
    case
      when e.envelope ->> 'estado_publicacao' = 'publicavel'
       and not e.possui_conflito
       and e.resultado_canonico <> 'indeterminado'
        then 'publicado'
      else 'em_auditoria'
    end,
    nullif(e.envelope ->> 'sincronizado_em', '')::timestamptz,
    e.regra_versao || '+interface-consulta-v2.1'
  from enriquecida e
  order by e.data_aula, e.data_hora_inicio, e.aluno_nome, e.slot_key;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_presenca_ocorrencias_periodo_legado_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_professor_id integer DEFAULT NULL::integer, p_aluno_id integer DEFAULT NULL::integer)
 RETURNS TABLE(slot_key text, aluno_id integer, aluno_nome text, unidade_id uuid, professor_id integer, professor_nome text, data_aula date, horario_aula time without time zone, curso_nome text, resultado_canonico text, fonte_decisao text, possui_conflito boolean, turma_nome text, sala_nome text, anotacoes text, duracao_minutos integer, tipo text, nr_da_aula integer, qtd_alunos integer, universo_eventos bigint, presentes bigint, faltas bigint, faltas_justificadas bigint, dados_status text, estado_publicacao text, sincronizado_em timestamp with time zone, regra_versao text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with base as (
    select
      ('legado:' || coalesce(ap.aula_emusys_id::text, 'sem-aula') || ':'
        || ap.aluno_id::text || ':' || ap.data_aula::text || ':'
        || coalesce(ap.horario_aula::text, 'sem-hora'))::text as slot_key,
      ap.aluno_id,
      a.nome::text as aluno_nome,
      ap.unidade_id,
      ae.professor_id::integer,
      ae.professor_nome::text,
      ap.data_aula,
      ap.horario_aula::time,
      ap.curso_nome::text,
      case lower(ap.status::text)
        when 'presente' then 'presente'
        when 'ausente' then 'falta'
        else 'indeterminado'
      end::text as resultado_canonico,
      'legado_aluno_presenca'::text as fonte_decisao,
      false as possui_conflito,
      ap.turma_nome::text,
      ap.sala_nome::text,
      ae.anotacoes::text,
      ae.duracao_minutos::integer,
      ae.tipo::text,
      ae.nr_da_aula::integer,
      ae.qtd_alunos::integer
    from public.aluno_presenca ap
    join public.alunos a on a.id = ap.aluno_id
    left join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
    where ap.data_aula between p_data_inicio and p_data_fim
      and lower(ap.status::text) in ('presente', 'ausente')
      and coalesce(ae.categoria, 'normal') = 'normal'
      and (p_unidade_id is null or ap.unidade_id = p_unidade_id)
      and (p_professor_id is null or ae.professor_id = p_professor_id)
      and (p_aluno_id is null or ap.aluno_id = p_aluno_id)
      and (
        auth.role() = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          auth.role() = 'authenticated'
          and ((select public.is_admin()) or ap.unidade_id in (select public.get_user_unidade_ids()))
        )
      )
  )
  select
    b.*,
    count(*) over (partition by b.unidade_id)::bigint,
    count(*) filter (where b.resultado_canonico = 'presente')
      over (partition by b.unidade_id)::bigint,
    count(*) filter (where b.resultado_canonico = 'falta')
      over (partition by b.unidade_id)::bigint,
    0::bigint,
    'legado'::text,
    'publicado'::text,
    null::timestamptz,
    'presenca-legado-v1'::text
  from base b
  order by b.data_aula, b.horario_aula, b.aluno_nome, b.slot_key;
$function$;

CREATE OR REPLACE FUNCTION public.get_presenca_previa_reparo_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_resultado jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_unidade_id is null or p_data_inicio is null or p_data_fim is null
     or p_data_fim < p_data_inicio or p_data_fim - p_data_inicio > 120 then
    raise exception using errcode = '22023', message = 'janela de previa invalida';
  end if;

  with roster as (
    select
      md5(aa.id::text || ':' || aa.aula_emusys_id::text || ':' || aa.aluno_id::text) as ref,
      ae.data_aula,
      'soft_inativar'::text as acao,
      'ausente_no_run_completo_atual'::text as razao
    from public.aula_alunos_emusys aa
    join public.aulas_emusys ae on ae.id = aa.aula_emusys_id
    join public.aula_roster_sync_estado re on re.aula_id = aa.aula_emusys_id
    where aa.unidade_id = p_unidade_id
      and ae.data_aula between p_data_inicio and p_data_fim
      and aa.ativo_operacional
      and re.estado = 'completo'
      and aa.ultimo_run_visto is distinct from re.run_id
  ), snapshots as (
    select
      md5(re.aula_id::text || ':' || re.snapshot_hash) as ref,
      ae.data_aula,
      'corrigir_estado_snapshot'::text as acao,
      case
        when re.estado = 'completo' then 'completo_com_contagem_incoerente'
        when re.estado = 'vazio_confirmado' then 'vazio_com_contagem_nao_zero'
        else 'estado_terminal_incompativel'
      end as razao
    from public.aula_roster_sync_estado re
    join public.aulas_emusys ae on ae.id = re.aula_id
    where re.unidade_id = p_unidade_id
      and ae.data_aula between p_data_inicio and p_data_fim
      and (
        (re.estado = 'completo' and (re.qtd_esperada <= 0 or re.qtd_esperada <> re.qtd_recebida))
        or (re.estado = 'vazio_confirmado' and (re.qtd_esperada <> 0 or re.qtd_recebida <> 0))
      )
  ), gemeas as (
    select
      left(o.slot_key, 12) as ref,
      o.data_aula,
      'reconciliar_na_projecao'::text as acao,
      'multiplos_ids_emusys_mesmo_slot_sem_reescrever_evidencia'::text as razao
    from public.vw_presenca_ocorrencia_canonica_v2 o
    where o.unidade_id = p_unidade_id
      and o.data_aula between p_data_inicio and p_data_fim
      and cardinality(o.ids_aulas_emusys) > 1
  ), humanas as (
    select
      ap.id,
      coalesce(ap.status_presenca, ap.status::text, '') as estado,
      ap.respondido_por::text as fonte,
      ap.respondido_em
    from public.aluno_presenca ap
    left join public.aulas_emusys ae
      on ae.id = ap.aula_emusys_id
     and ae.unidade_id = ap.unidade_id
    where ap.unidade_id = p_unidade_id
      and coalesce(ae.data_aula, ap.data_aula) between p_data_inicio and p_data_fim
      and lower(coalesce(ap.respondido_por::text, '')) in (
        'agenda_secretaria', 'manual', 'professor_la_teacher',
        'fabio_audio', 'professor_whatsapp'
      )
      and ap.respondido_em is not null
      and (
        lower(coalesce(ap.status_presenca, '')) in ('presente', 'falta', 'falta_justificada')
        or lower(coalesce(ap.status::text, '')) in ('presente', 'ausente')
      )
  ), integridade as (
    select
      count(*) as quantidade,
      md5(coalesce(string_agg(
        id::text || ':' || estado || ':' || fonte || ':' || respondido_em::text,
        '|' order by id
      ), '')) as hash_estado
    from humanas
  )
  select jsonb_build_object(
    'dry_run', true,
    'unidade_id', p_unidade_id,
    'periodo', jsonb_build_object('inicio', p_data_inicio, 'fim', p_data_fim),
    'acoes', jsonb_build_object(
      'vinculos_roster_soft_inativar', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.data_aula, r.ref) from roster r
      ), '[]'::jsonb),
      'estados_snapshot_corrigir', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.data_aula, s.ref) from snapshots s
      ), '[]'::jsonb),
      'gemeas_reconciliar', coalesce((
        select jsonb_agg(to_jsonb(g) order by g.data_aula, g.ref) from gemeas g
      ), '[]'::jsonb),
      'funcoes_live_only_versionar', '[]'::jsonb
    ),
    'integridade_decisoes_humanas', jsonb_build_object(
      'antes', jsonb_build_object('quantidade', i.quantidade, 'hash', i.hash_estado),
      'depois', jsonb_build_object('quantidade', i.quantidade, 'hash', i.hash_estado),
      'alteracao_prevista', false
    ),
    'backfill_presenca_falta', false
  ) into v_resultado
  from integridade i;

  return v_resultado;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_presenca_rollout_modo_v1(p_unidade_id uuid, p_superficie text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  return public.fn_presenca_rollout_modo_interno_v1(p_unidade_id, p_superficie);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_presenca_shadow_comparacao_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date)
 RETURNS TABLE(unidade_id uuid, data_alvo date, contagem_v1 bigint, contagem_v2 bigint, delta bigint, duplicidade_emusys bigint, colisao_curso bigint, roster_fantasma bigint, precedencia_humana bigint, politica_temporal bigint, sync_incompleto bigint, sem_explicacao bigint, hash_v1 text, hash_v2 text, amostras_redigidas jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_unidade_id is null or p_data_inicio is null or p_data_fim is null
     or p_data_fim < p_data_inicio or p_data_fim - p_data_inicio > 120 then
    raise exception using errcode = '22023', message = 'janela shadow invalida';
  end if;

  return query
  with datas as (
    select d::date as data_alvo
      from generate_series(p_data_inicio, p_data_fim, interval '1 day') d
  ), raw_base as (
    select
      ap.id,
      ap.aluno_id,
      ap.unidade_id,
      coalesce(ap.professor_id, ae.professor_id) as professor_id,
      coalesce(ae.data_aula, ap.data_aula) as data_aula,
      coalesce(
        ae.data_hora_inicio,
        case when ap.horario_aula is not null then
          (ap.data_aula::timestamp + ap.horario_aula)
            at time zone 'America/Sao_Paulo'
        end
      ) as data_hora_inicio,
      coalesce(
        ae.data_hora_fim,
        case when ae.data_hora_inicio is not null and ae.duracao_minutos is not null
          then ae.data_hora_inicio + make_interval(mins => ae.duracao_minutos)
        end
      ) as data_hora_fim,
      coalesce(nullif(btrim(ae.curso_nome), ''), nullif(btrim(ap.curso_nome), ''), '') as curso_nome,
      ap.aula_emusys_id,
      coalesce(ae.cancelada, false) as aula_cancelada,
      coalesce(ae.justificada, false) as aula_justificada,
      lower(nullif(btrim(ap.status::text), '')) as status_legado,
      lower(nullif(btrim(ap.status_presenca), '')) as status_presenca,
      lower(nullif(btrim(ap.respondido_por::text), '')) as respondido_por,
      ap.respondido_em,
      lower(coalesce(
        nullif(btrim(ap.emusys_presenca_bruta), ''),
        case when ap.respondido_por::text in ('emusys', 'sistema')
          then nullif(btrim(ap.status::text), '') end
      )) as emusys_resultado,
      exists (
        select 1
          from public.aula_roster_sync_estado re
         where re.aula_id = ap.aula_emusys_id
           and re.estado = 'completo'
      ) and not exists (
        select 1
          from public.aula_alunos_emusys aa
         where aa.aula_emusys_id = ap.aula_emusys_id
           and aa.aluno_id = ap.aluno_id
           and aa.ativo_operacional
      ) as roster_fantasma
    from public.aluno_presenca ap
    left join public.aulas_emusys ae
      on ae.id = ap.aula_emusys_id
     and ae.unidade_id = ap.unidade_id
    where ap.unidade_id = p_unidade_id
      and coalesce(ae.data_aula, ap.data_aula) between p_data_inicio and p_data_fim
      and (ae.id is null or coalesce(ae.categoria, 'normal') = 'normal')
  ), raw_normalizada as (
    select
      b.*,
      b.professor_id is not null
        and b.data_hora_inicio is not null
        and b.data_hora_fim is not null
        and nullif(btrim(b.curso_nome), '') is not null as identidade_completa,
      b.respondido_por in (
        'agenda_secretaria', 'manual', 'professor_la_teacher',
        'fabio_audio', 'professor_whatsapp'
      ) and b.respondido_em is not null as fonte_humana,
      case
        when b.aula_cancelada or b.aula_justificada then null
        when b.respondido_por in (
          'agenda_secretaria', 'manual', 'professor_la_teacher',
          'fabio_audio', 'professor_whatsapp'
        ) and b.respondido_em is not null then
          case
            when b.status_presenca in ('presente', 'falta', 'falta_justificada')
              then b.status_presenca
            when b.status_legado = 'presente' then 'presente'
            when b.status_legado = 'ausente' then 'falta'
            else null
          end
        when b.status_presenca in ('presente', 'falta', 'falta_justificada')
          then b.status_presenca
        when b.status_legado = 'presente' then 'presente'
        when b.status_legado = 'ausente' then 'falta'
        when b.emusys_resultado = 'presente' then 'presente'
        when b.emusys_resultado = 'ausente' then 'falta'
        else null
      end as resultado_v1
    from raw_base b
  ), raw_chaves as (
    select
      n.*,
      case when n.identidade_completa then
        public.fn_presenca_slot_key_v2(
          n.aluno_id, n.unidade_id, n.professor_id,
          n.data_hora_inicio, n.data_hora_fim, n.curso_nome
        ) else 'incompleto:' || md5(n.id::text) end as slot_key,
      md5(jsonb_build_array(
        n.aluno_id, n.unidade_id::text, n.professor_id,
        extract(epoch from n.data_hora_inicio),
        extract(epoch from n.data_hora_fim)
      )::text) as slot_sem_curso
    from raw_normalizada n
  ), raw_slots as (
    select
      r.data_aula,
      r.slot_key,
      min(r.slot_sem_curso) as slot_sem_curso,
      count(*) as linhas_raw,
      count(*) filter (where r.identidade_completa and r.resultado_v1 is not null) as terminais_v1,
      array_agg(distinct r.resultado_v1 order by r.resultado_v1)
        filter (where r.resultado_v1 is not null) as resultados_v1,
      bool_or(r.roster_fantasma) as possui_roster_fantasma,
      bool_or(r.fonte_humana) as possui_humano,
      bool_or(
        r.fonte_humana and (
          (r.resultado_v1 = 'presente' and r.emusys_resultado = 'ausente')
          or (r.resultado_v1 in ('falta', 'falta_justificada') and r.emusys_resultado = 'presente')
        )
      ) as conflito_humano_emusys,
      bool_or(not r.fonte_humana and r.emusys_resultado = 'ausente') as possui_ausencia_emusys
    from raw_chaves r
    group by r.data_aula, r.slot_key
  ), colisoes as (
    select r.data_aula, r.slot_sem_curso
      from raw_chaves r
     where r.identidade_completa
     group by r.data_aula, r.slot_sem_curso
    having count(distinct lower(btrim(r.curso_nome))) > 1
  ), canon as (
    select o.*
      from public.vw_presenca_ocorrencia_canonica_v2 o
     where o.unidade_id = p_unidade_id
       and o.data_aula between p_data_inicio and p_data_fim
  ), sync_dia as (
    select
      d.data_alvo,
      exists (
        select 1
          from public.presenca_sync_cobertura sc
         where sc.unidade_id = p_unidade_id
           and sc.modo = 'presenca'
           and sc.data_alvo = d.data_alvo
           and sc.status = 'concluida'
           and sc.snapshot_hash is not null
      ) as sync_publicavel
    from datas d
  ), comparada as (
    select
      r.data_aula,
      r.slot_key,
      r.slot_sem_curso,
      r.linhas_raw,
      r.terminais_v1,
      coalesce(r.resultados_v1, '{}'::text[]) as resultados_v1,
      r.possui_roster_fantasma,
      r.conflito_humano_emusys,
      r.possui_ausencia_emusys,
      c.resultado_canonico,
      c.fonte_decisao,
      coalesce(c.resultado_canonico in ('presente', 'falta', 'falta_justificada'), false)::integer
        as terminal_v2,
      exists (
        select 1 from colisoes x
         where x.data_aula = r.data_aula and x.slot_sem_curso = r.slot_sem_curso
      ) as possui_colisao_curso,
      (
        r.terminais_v1 <> coalesce(
          (c.resultado_canonico in ('presente', 'falta', 'falta_justificada'))::integer, 0
        )
        or (
          c.resultado_canonico in ('presente', 'falta', 'falta_justificada')
          and not (c.resultado_canonico = any(coalesce(r.resultados_v1, '{}'::text[])))
        )
        or cardinality(coalesce(r.resultados_v1, '{}'::text[])) > 1
      ) as possui_diferenca
    from raw_slots r
    left join canon c on c.slot_key = r.slot_key
  ), comparada_classificada as (
    select
      c.*,
      (
        c.linhas_raw > 1
        or c.possui_roster_fantasma
        or c.conflito_humano_emusys
        or c.possui_colisao_curso
        or (
          c.possui_ausencia_emusys
          and (c.resultado_canonico = 'indeterminado'
               or c.fonte_decisao = 'emusys_politica_temporal')
        )
      ) as possui_explicacao,
      array_remove(array[
        case when c.linhas_raw > 1 then 'duplicidade_emusys' end,
        case when c.possui_colisao_curso then 'colisao_curso' end,
        case when c.possui_roster_fantasma then 'roster_fantasma' end,
        case when c.conflito_humano_emusys then 'precedencia_humana' end,
        case when c.possui_ausencia_emusys
          and (c.resultado_canonico = 'indeterminado'
               or c.fonte_decisao = 'emusys_politica_temporal')
          then 'politica_temporal' end,
        case when not s.sync_publicavel then 'sync_incompleto' end
      ], null) as razoes
    from comparada c
    join sync_dia s on s.data_alvo = c.data_aula
  ), raw_dia as (
    select
      r.data_aula,
      count(*) filter (where r.identidade_completa and r.resultado_v1 is not null) as contagem,
      md5(coalesce(string_agg(
        r.id::text || ':' || coalesce(r.resultado_v1, 'indeterminado'),
        '|' order by r.id
      ), '')) as hash_estado
    from raw_chaves r
    group by r.data_aula
  ), canon_dia as (
    select
      c.data_aula,
      count(*) filter (where c.resultado_canonico in ('presente', 'falta', 'falta_justificada')) as contagem,
      md5(coalesce(string_agg(
        c.slot_key || ':' || c.resultado_canonico,
        '|' order by c.slot_key
      ), '')) as hash_estado
    from canon c
    group by c.data_aula
  ), diagnostico_dia as (
    select
      c.data_aula,
      sum(greatest(c.linhas_raw - 1, 0)) as duplicidade_emusys,
      count(*) filter (where c.possui_roster_fantasma) as roster_fantasma,
      count(*) filter (where c.conflito_humano_emusys) as precedencia_humana,
      count(*) filter (
        where c.possui_ausencia_emusys
          and (c.resultado_canonico = 'indeterminado'
               or c.fonte_decisao = 'emusys_politica_temporal')
      ) as politica_temporal,
      count(*) filter (where c.possui_diferenca and not c.possui_explicacao) as sem_explicacao
    from comparada_classificada c
    group by c.data_aula
  ), amostras as (
    select
      x.data_aula,
      coalesce(jsonb_agg(jsonb_build_object(
        'slot_ref', left(x.slot_key, 12),
        'v1', x.resultados_v1,
        'v2', coalesce(x.resultado_canonico, 'ausente_na_projecao'),
        'razoes', x.razoes,
        'explicada', x.possui_explicacao
      ) order by x.slot_key), '[]'::jsonb) as itens
    from (
      select c.*, row_number() over (partition by c.data_aula order by c.slot_key) as rn
        from comparada_classificada c
       where c.possui_diferenca
    ) x
    where x.rn <= 20
    group by x.data_aula
  ), colisao_dia as (
    select data_aula, count(*) as quantidade from colisoes group by data_aula
  )
  select
    p_unidade_id,
    d.data_alvo,
    coalesce(rv.contagem, 0)::bigint,
    coalesce(cv.contagem, 0)::bigint,
    (coalesce(cv.contagem, 0) - coalesce(rv.contagem, 0))::bigint,
    coalesce(dx.duplicidade_emusys, 0)::bigint,
    coalesce(cc.quantidade, 0)::bigint,
    coalesce(dx.roster_fantasma, 0)::bigint,
    coalesce(dx.precedencia_humana, 0)::bigint,
    coalesce(dx.politica_temporal, 0)::bigint,
    (case when s.sync_publicavel then 0 else 1 end)::bigint,
    coalesce(dx.sem_explicacao, 0)::bigint,
    coalesce(rv.hash_estado, md5('')),
    coalesce(cv.hash_estado, md5('')),
    coalesce(a.itens, '[]'::jsonb)
  from datas d
  join sync_dia s using (data_alvo)
  left join raw_dia rv on rv.data_aula = d.data_alvo
  left join canon_dia cv on cv.data_aula = d.data_alvo
  left join diagnostico_dia dx on dx.data_aula = d.data_alvo
  left join colisao_dia cc on cc.data_aula = d.data_alvo
  left join amostras a on a.data_aula = d.data_alvo
  order by d.data_alvo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_saude_cobertura_presenca_v1(p_data date DEFAULT (CURRENT_DATE - 1))
 RETURNS TABLE(unidade_id uuid, unidade_nome text, data_coberta date, status text, publicavel boolean, ultima_conclusao timestamp with time zone, heartbeat_em timestamp with time zone, lease_expirada boolean, tentativas_deduplicadas bigint, relatorio_bloqueado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if coalesce(auth.role(), '')
     not in ('authenticated', 'service_role') then
    raise insufficient_privilege using message = 'usuario autenticado obrigatorio';
  end if;
  if p_data is null or p_data > current_date then
    raise exception using errcode = '22023', message = 'data de cobertura invalida';
  end if;

  return query
  select
    u.id,
    u.nome::text,
    p_data,
    coalesce(c.status, 'sem_cobertura'),
    coalesce(c.status = 'concluida' and c.snapshot_hash is not null, false),
    (
      select max(x.finalizada_em)
        from public.presenca_sync_execucoes x
       where x.unidade_id = u.id
         and x.modo = 'presenca'
         and x.data_alvo = p_data
         and x.status = 'concluida'
    ),
    c.heartbeat_em,
    coalesce(c.status = 'iniciada' and c.lease_ate <= clock_timestamp(), false),
    coalesce((
      select count(*)
        from public.presenca_sync_eventos e
        join public.presenca_sync_execucoes x on x.id = e.run_id
       where x.unidade_id = u.id
         and x.modo = 'presenca'
         and x.data_alvo = p_data
         and e.tipo = 'deduplicada'
    ), 0),
    exists (
      select 1
        from public.aulas_emusys ae
       where ae.unidade_id = u.id
         and ae.data_aula = p_data
         and ae.data_hora_fim < now()
         and not coalesce(ae.cancelada, false)
    ) and not coalesce(
      c.status = 'concluida' and c.snapshot_hash is not null,
      false
    )
  from public.unidades u
  left join public.presenca_sync_cobertura c
    on c.unidade_id = u.id
   and c.modo = 'presenca'
   and c.data_alvo = p_data
  order by u.nome;
end;
$function$;

CREATE OR REPLACE FUNCTION public.presenca_sync_finalizar_v1(p_run_id uuid, p_status text, p_snapshot_hash text DEFAULT NULL::text, p_contagens jsonb DEFAULT '{}'::jsonb, p_erro_codigo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_exec public.presenca_sync_execucoes%rowtype;
  v_agora timestamptz := clock_timestamp();
  v_paginas integer;
  v_aulas integer;
  v_presencas integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_status not in ('concluida', 'falhou', 'abortada')
     or jsonb_typeof(coalesce(p_contagens, '{}'::jsonb)) <> 'object'
     or (p_status = 'concluida' and coalesce(p_snapshot_hash, '') !~ '^[0-9a-f]{64}$')
     or (p_status <> 'concluida' and p_snapshot_hash is not null)
     or (p_erro_codigo is not null and p_erro_codigo !~ '^[A-Z0-9_]{1,64}$') then
    raise exception using errcode = '22023', message = 'finalizacao invalida';
  end if;

  select * into v_exec from public.presenca_sync_execucoes where id = p_run_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'run_inexistente'); end if;
  if v_exec.status <> 'iniciada' then
    return jsonb_build_object(
      'ok', v_exec.status = p_status, 'motivo', 'run_terminal',
      'run_id', p_run_id, 'status', v_exec.status,
      'publicavel', v_exec.status = 'concluida' and v_exec.snapshot_hash is not null
    );
  end if;
  if not exists (
    select 1 from public.presenca_sync_cobertura
     where run_id = p_run_id and status = 'iniciada'
     for update
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'run_substituida', 'status', v_exec.status);
  end if;

  v_paginas := coalesce((p_contagens ->> 'paginas_lidas')::integer, v_exec.paginas_lidas);
  v_aulas := coalesce((p_contagens ->> 'aulas_lidas')::integer, v_exec.aulas_lidas);
  v_presencas := coalesce((p_contagens ->> 'presencas_lidas')::integer, v_exec.presencas_lidas);
  if least(v_paginas, v_aulas, v_presencas) < 0 then
    raise exception using errcode = '22023', message = 'contagens negativas';
  end if;

  update public.presenca_sync_execucoes set
    status = p_status, snapshot_hash = p_snapshot_hash,
    paginas_lidas = v_paginas, aulas_lidas = v_aulas, presencas_lidas = v_presencas,
    erro_codigo = p_erro_codigo, heartbeat_em = v_agora, finalizada_em = v_agora
  where id = p_run_id;
  update public.presenca_sync_cobertura set
    status = p_status, lease_ate = null, heartbeat_em = v_agora,
    snapshot_hash = p_snapshot_hash,
    paginas_lidas = v_paginas, aulas_lidas = v_aulas, presencas_lidas = v_presencas,
    finalizada_em = v_agora, atualizada_em = v_agora
  where run_id = p_run_id;
  insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
  values (p_run_id, p_status, jsonb_strip_nulls(jsonb_build_object(
    'snapshot_hash', p_snapshot_hash, 'erro_codigo', p_erro_codigo,
    'paginas_lidas', v_paginas, 'aulas_lidas', v_aulas, 'presencas_lidas', v_presencas
  )));
  return jsonb_build_object(
    'ok', true, 'run_id', p_run_id, 'status', p_status,
    'publicavel', p_status = 'concluida'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.presenca_sync_heartbeat_v1(p_run_id uuid, p_contagens jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_exec public.presenca_sync_execucoes%rowtype;
  v_agora timestamptz := clock_timestamp();
  v_paginas integer;
  v_aulas integer;
  v_presencas integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_run_id is null or jsonb_typeof(coalesce(p_contagens, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'heartbeat invalido';
  end if;

  select * into v_exec from public.presenca_sync_execucoes where id = p_run_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'run_inexistente'); end if;
  if v_exec.status <> 'iniciada' then
    return jsonb_build_object('ok', false, 'motivo', 'run_terminal', 'status', v_exec.status);
  end if;
  if not exists (
    select 1 from public.presenca_sync_cobertura
     where run_id = p_run_id and status = 'iniciada' and lease_ate > v_agora
     for update
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'lease_inativa');
  end if;

  v_paginas := coalesce((p_contagens ->> 'paginas_lidas')::integer, v_exec.paginas_lidas);
  v_aulas := coalesce((p_contagens ->> 'aulas_lidas')::integer, v_exec.aulas_lidas);
  v_presencas := coalesce((p_contagens ->> 'presencas_lidas')::integer, v_exec.presencas_lidas);
  if least(v_paginas, v_aulas, v_presencas) < 0 then
    raise exception using errcode = '22023', message = 'contagens negativas';
  end if;

  update public.presenca_sync_execucoes set
    paginas_lidas = v_paginas, aulas_lidas = v_aulas, presencas_lidas = v_presencas,
    heartbeat_em = v_agora
  where id = p_run_id;
  update public.presenca_sync_cobertura set
    paginas_lidas = v_paginas, aulas_lidas = v_aulas, presencas_lidas = v_presencas,
    heartbeat_em = v_agora,
    lease_ate = v_agora + make_interval(secs => v_exec.lease_segundos),
    atualizada_em = v_agora
  where run_id = p_run_id;
  insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
  values (p_run_id, 'heartbeat', jsonb_build_object(
    'paginas_lidas', v_paginas, 'aulas_lidas', v_aulas, 'presencas_lidas', v_presencas
  ));
  return jsonb_build_object(
    'ok', true, 'run_id', p_run_id,
    'paginas_lidas', v_paginas, 'aulas_lidas', v_aulas, 'presencas_lidas', v_presencas
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.presenca_sync_iniciar_v1(p_unidade_id uuid, p_modo text, p_data_alvo date, p_request_id uuid, p_lease_segundos integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_existente public.presenca_sync_execucoes%rowtype;
  v_cobertura public.presenca_sync_cobertura%rowtype;
  v_run_id uuid;
  v_agora timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_unidade_id is null or p_data_alvo is null or p_request_id is null
     or p_modo not in ('presenca', 'metadados', 'agenda')
     or p_lease_segundos not between 30 and 3600 then
    raise exception using errcode = '22023', message = 'parametros de sync invalidos';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_unidade_id::text || ':' || p_modo || ':' || p_data_alvo::text, 0
  ));

  select * into v_existente
    from public.presenca_sync_execucoes
   where request_id = p_request_id
     and unidade_id = p_unidade_id
     and modo = p_modo
     and data_alvo = p_data_alvo;
  if found then
    insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
    values (v_existente.id, 'deduplicada', jsonb_build_object('motivo', 'request_id_repetido'));
    return jsonb_build_object(
      'adquirida', false, 'motivo', 'request_id_repetido',
      'run_id', v_existente.id, 'status', v_existente.status
    );
  end if;

  select * into v_cobertura
    from public.presenca_sync_cobertura
   where unidade_id = p_unidade_id and modo = p_modo and data_alvo = p_data_alvo
   for update;

  if found and v_cobertura.status = 'iniciada' and v_cobertura.lease_ate > v_agora then
    insert into public.presenca_sync_execucoes(
      request_id, unidade_id, modo, data_alvo, status, erro_codigo,
      lease_segundos, finalizada_em
    ) values (
      p_request_id, p_unidade_id, p_modo, p_data_alvo, 'abortada', 'LEASE_ATIVO',
      p_lease_segundos, v_agora
    ) returning id into v_run_id;
    insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
    values (v_run_id, 'deduplicada', jsonb_build_object(
      'motivo', 'lease_ativo', 'run_ativo', v_cobertura.run_id
    ));
    return jsonb_build_object(
      'adquirida', false, 'motivo', 'lease_ativo',
      'run_id', v_run_id, 'run_ativo', v_cobertura.run_id
    );
  end if;

  if found and v_cobertura.status = 'iniciada' then
    update public.presenca_sync_execucoes
       set status = 'abortada', erro_codigo = 'LEASE_EXPIRADA', finalizada_em = v_agora
     where id = v_cobertura.run_id and status = 'iniciada';
    if found then
      insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
      values (v_cobertura.run_id, 'abortada', jsonb_build_object('motivo', 'lease_expirada'));
    end if;
  end if;

  insert into public.presenca_sync_execucoes(
    request_id, unidade_id, modo, data_alvo, status, lease_segundos, heartbeat_em
  ) values (
    p_request_id, p_unidade_id, p_modo, p_data_alvo, 'iniciada', p_lease_segundos, v_agora
  ) returning id into v_run_id;

  insert into public.presenca_sync_cobertura(
    unidade_id, modo, data_alvo, run_id, status, lease_ate, heartbeat_em,
    snapshot_hash, paginas_lidas, aulas_lidas, presencas_lidas,
    iniciada_em, finalizada_em, atualizada_em
  ) values (
    p_unidade_id, p_modo, p_data_alvo, v_run_id, 'iniciada',
    v_agora + make_interval(secs => p_lease_segundos), v_agora,
    null, 0, 0, 0, v_agora, null, v_agora
  ) on conflict (unidade_id, modo, data_alvo) do update set
    run_id = excluded.run_id,
    status = excluded.status,
    lease_ate = excluded.lease_ate,
    heartbeat_em = excluded.heartbeat_em,
    snapshot_hash = null,
    paginas_lidas = 0,
    aulas_lidas = 0,
    presencas_lidas = 0,
    iniciada_em = excluded.iniciada_em,
    finalizada_em = null,
    atualizada_em = excluded.atualizada_em;

  insert into public.presenca_sync_eventos(run_id, tipo)
  values (v_run_id, 'iniciada');
  return jsonb_build_object('adquirida', true, 'run_id', v_run_id, 'status', 'iniciada');
end;
$function$;

CREATE OR REPLACE VIEW public.vw_absenteismo_aluno_canonica_v2 WITH (security_invoker=true) AS
WITH base AS (
         SELECT o.aluno_id,
            o.unidade_id,
            count(*) FILTER (WHERE o.considera_frequencia_denominador) AS total_aulas_observado,
            count(*) FILTER (WHERE o.considera_presenca) AS presentes_observado,
            count(*) FILTER (WHERE o.considera_falta) AS faltas_observado,
            count(*) FILTER (WHERE o.considera_falta_justificada) AS faltas_justificadas_observado,
            count(*) FILTER (WHERE o.data_aula >= (CURRENT_DATE - 30) AND o.considera_frequencia_denominador) AS aulas_30d_observado,
            count(*) FILTER (WHERE o.data_aula >= (CURRENT_DATE - 30) AND o.considera_presenca) AS presentes_30d_observado,
            count(*) FILTER (WHERE o.data_aula >= (CURRENT_DATE - 30) AND o.considera_falta) AS faltas_30d_observado,
            count(*) FILTER (WHERE o.data_aula >= (CURRENT_DATE - 30) AND o.considera_falta_justificada) AS faltas_justificadas_30d_observado,
            max(o.data_aula) FILTER (WHERE o.considera_presenca) AS ultima_presenca,
            bool_or(o.ocorrencia_incompleta) AS possui_incompleta
           FROM vw_presenca_ocorrencia_metrica_v2 o
          WHERE o.data_aula <= CURRENT_DATE AND (auth.role() = 'service_role'::text OR (SESSION_USER::text = ANY (ARRAY['postgres'::text, 'service_role'::text])) OR auth.role() = 'authenticated'::text AND (( SELECT is_admin() AS is_admin) OR (o.unidade_id IN ( SELECT get_user_unidade_ids() AS get_user_unidade_ids))))
          GROUP BY o.aluno_id, o.unidade_id
        ), publicada AS (
         SELECT b.aluno_id,
            b.unidade_id,
            b.total_aulas_observado,
            b.presentes_observado,
            b.faltas_observado,
            b.faltas_justificadas_observado,
            b.aulas_30d_observado,
            b.presentes_30d_observado,
            b.faltas_30d_observado,
            b.faltas_justificadas_30d_observado,
            b.ultima_presenca,
            b.possui_incompleta,
            fn_presenca_estado_publicacao_periodo_v2(b.unidade_id, GREATEST(CURRENT_DATE - 30, '2026-08-01'::date), CURRENT_DATE) AS frescor
           FROM base b
        ), classificada AS (
         SELECT p.aluno_id,
            p.unidade_id,
            p.total_aulas_observado,
            p.presentes_observado,
            p.faltas_observado,
            p.faltas_justificadas_observado,
            p.aulas_30d_observado,
            p.presentes_30d_observado,
            p.faltas_30d_observado,
            p.faltas_justificadas_30d_observado,
            p.ultima_presenca,
            p.possui_incompleta,
            p.frescor,
            (p.frescor ->> 'estado_publicacao'::text) = 'publicavel'::text AND NOT p.possui_incompleta AS publicavel
           FROM publicada p
        )
 SELECT aluno_id,
        CASE
            WHEN publicavel THEN total_aulas_observado
            ELSE NULL::bigint
        END AS total_aulas,
        CASE
            WHEN publicavel THEN faltas_observado + faltas_justificadas_observado
            ELSE NULL::bigint
        END AS faltas,
        CASE
            WHEN publicavel AND total_aulas_observado > 0 THEN round((faltas_observado + faltas_justificadas_observado)::numeric / total_aulas_observado::numeric, 3)
            ELSE NULL::numeric
        END AS taxa_historica,
        CASE
            WHEN publicavel AND aulas_30d_observado > 0 THEN round((faltas_30d_observado + faltas_justificadas_30d_observado)::numeric / aulas_30d_observado::numeric, 3)
            ELSE NULL::numeric
        END AS taxa_recente_30d,
        CASE
            WHEN publicavel AND total_aulas_observado > 0 AND aulas_30d_observado > 0 THEN round((faltas_30d_observado + faltas_justificadas_30d_observado)::numeric / aulas_30d_observado::numeric - (faltas_observado + faltas_justificadas_observado)::numeric / total_aulas_observado::numeric, 3)
            ELSE NULL::numeric
        END AS tendencia,
        CASE
            WHEN publicavel THEN ultima_presenca
            ELSE NULL::date
        END AS ultima_presenca,
        CASE
            WHEN publicavel THEN CURRENT_DATE - ultima_presenca
            ELSE NULL::integer
        END AS dias_sem_presenca,
    publicavel AND total_aulas_observado >= 4 AS confiavel,
        CASE
            WHEN publicavel THEN presentes_observado
            ELSE NULL::bigint
        END AS presentes,
        CASE
            WHEN publicavel THEN faltas_observado
            ELSE NULL::bigint
        END AS faltas_nao_justificadas,
        CASE
            WHEN publicavel THEN faltas_justificadas_observado
            ELSE NULL::bigint
        END AS faltas_justificadas,
        CASE
            WHEN publicavel THEN aulas_30d_observado
            ELSE NULL::bigint
        END AS denominador_30d,
        CASE
            WHEN publicavel THEN presentes_30d_observado
            ELSE NULL::bigint
        END AS presentes_30d,
        CASE
            WHEN publicavel THEN faltas_30d_observado
            ELSE NULL::bigint
        END AS faltas_nao_justificadas_30d,
        CASE
            WHEN publicavel THEN faltas_justificadas_30d_observado
            ELSE NULL::bigint
        END AS faltas_justificadas_30d,
    frescor ->> 'dados_status'::text AS dados_status,
        CASE
            WHEN possui_incompleta THEN 'em_auditoria'::text
            ELSE frescor ->> 'estado_publicacao'::text
        END AS estado_publicacao,
    NULLIF(frescor ->> 'sincronizado_em'::text, ''::text)::timestamp with time zone AS sincronizado_em,
    'absenteismo-aluno-v2.1'::text AS regra_versao
   FROM classificada c;

CREATE OR REPLACE VIEW public.vw_radar_aluno_sinais_canonica_v2 WITH (security_invoker=true) AS
WITH coorte AS (
         SELECT professores.id AS professor_id
           FROM professores
          WHERE COALESCE(professores.ativo, true) AND professores.usuario_id IS NOT NULL
        ), aula AS (
         SELECT o.aluno_id,
            o.unidade_id,
            o.data_aula,
            o.data_hora_inicio,
            o.considera_presenca AS veio,
            o.considera_falta AS faltou,
            o.considera_falta_justificada AS falta_justificada
           FROM vw_presenca_ocorrencia_metrica_v2 o
          WHERE o.considera_frequencia_denominador AND o.data_aula >= '2026-08-01'::date AND o.data_aula <= CURRENT_DATE
        ), ordenada AS (
         SELECT a.aluno_id,
            a.unidade_id,
            a.data_aula,
            a.data_hora_inicio,
            a.veio,
            a.faltou,
            a.falta_justificada,
            row_number() OVER (PARTITION BY a.aluno_id ORDER BY a.data_aula DESC, a.data_hora_inicio DESC NULLS LAST) AS rn
           FROM aula a
        ), janela AS (
         SELECT o.aluno_id,
            count(*) AS aulas_medidas,
            count(*) FILTER (WHERE NOT o.veio) AS faltas_janela
           FROM ordenada o
          WHERE o.rn <= 10
          GROUP BY o.aluno_id
        ), consecutivas AS (
         SELECT o.aluno_id,
            count(*) AS faltas_consecutivas
           FROM ordenada o
          WHERE NOT o.veio AND NOT (EXISTS ( SELECT 1
                   FROM ordenada anterior
                  WHERE anterior.aluno_id = o.aluno_id AND anterior.rn < o.rn AND anterior.veio))
          GROUP BY o.aluno_id
        ), mes AS (
         SELECT a.aluno_id,
            count(*) AS aulas_mes,
            count(*) FILTER (WHERE NOT a.veio) AS faltas_mes,
            count(*) FILTER (WHERE a.falta_justificada) AS faltas_justificadas_mes
           FROM aula a
          WHERE a.data_aula >= fn_competencia_feedback()
          GROUP BY a.aluno_id
        ), frescor_unidade AS (
         SELECT u.unidade_id,
            fn_presenca_estado_publicacao_periodo_v2(u.unidade_id, '2026-08-01'::date, CURRENT_DATE) AS frescor
           FROM ( SELECT DISTINCT aula.unidade_id
                   FROM aula) u
        ), semaforo AS (
         SELECT DISTINCT ON (f.aluno_id, f.professor_id) f.aluno_id,
            f.professor_id,
            f.feedback,
            f.pratica_em_casa,
            f.evolucao,
            f.animo,
            NULLIF(btrim(f.observacao), ''::text) AS observacao,
            f.competencia
           FROM aluno_feedback_professor f
          WHERE f.competencia = fn_competencia_feedback()
          ORDER BY f.aluno_id, f.professor_id, (COALESCE(f.atualizado_em, f.respondido_em)) DESC
        ), aviso AS (
         SELECT ma.aluno_id,
            min(ma.mes_saida) AS mes_saida
           FROM movimentacoes_admin ma
          WHERE ma.tipo::text = 'aviso_previo'::text AND ma.mes_saida >= fn_competencia_feedback() AND ma.aluno_id IS NOT NULL
          GROUP BY ma.aluno_id
        )
 SELECT s.id AS aluno_id,
    s.nome AS aluno_nome,
    s.unidade_id,
    s.unidade_codigo,
    s.professor_atual_id AS professor_id,
    s.professor_nome,
    s.curso_nome,
        CASE
            WHEN (fu.frescor ->> 'estado_publicacao'::text) = 'publicavel'::text THEN COALESCE(j.aulas_medidas, 0::bigint)
            ELSE NULL::bigint
        END AS aulas_medidas,
        CASE
            WHEN (fu.frescor ->> 'estado_publicacao'::text) = 'publicavel'::text THEN COALESCE(j.faltas_janela, 0::bigint)
            ELSE NULL::bigint
        END AS faltas_janela,
        CASE
            WHEN (fu.frescor ->> 'estado_publicacao'::text) = 'publicavel'::text AND COALESCE(j.aulas_medidas, 0::bigint) > 0 THEN round(100.0 * j.faltas_janela::numeric / j.aulas_medidas::numeric, 1)
            ELSE NULL::numeric
        END AS absenteismo_pct,
        CASE
            WHEN (fu.frescor ->> 'estado_publicacao'::text) = 'publicavel'::text THEN COALESCE(m.faltas_mes, 0::bigint)
            ELSE NULL::bigint
        END AS faltas_mes,
        CASE
            WHEN (fu.frescor ->> 'estado_publicacao'::text) = 'publicavel'::text THEN COALESCE(m.aulas_mes, 0::bigint)
            ELSE NULL::bigint
        END AS aulas_mes,
    sf.feedback,
    sf.pratica_em_casa,
    sf.evolucao,
    sf.animo,
    sf.observacao,
    sf.competencia AS feedback_competencia,
    av.aluno_id IS NOT NULL AS avisou_que_sai,
    av.mes_saida,
        CASE
            WHEN (fu.frescor ->> 'estado_publicacao'::text) = 'publicavel'::text THEN COALESCE(fc.faltas_consecutivas, 0::bigint)
            ELSE NULL::bigint
        END AS faltas_consecutivas,
    s.foto_url AS aluno_foto_url,
        CASE
            WHEN (fu.frescor ->> 'estado_publicacao'::text) = 'publicavel'::text THEN COALESCE(m.faltas_justificadas_mes, 0::bigint)
            ELSE NULL::bigint
        END AS faltas_justificadas_mes,
    COALESCE(fu.frescor ->> 'dados_status'::text, 'sem_base'::text) AS dados_status,
    COALESCE(fu.frescor ->> 'estado_publicacao'::text, 'sem_base'::text) AS estado_publicacao,
    NULLIF(fu.frescor ->> 'sincronizado_em'::text, ''::text)::timestamp with time zone AS sincronizado_em,
    'radar-aluno-sinais-v2.1'::text AS regra_versao
   FROM vw_aluno_sucesso_lista s
     JOIN coorte c ON c.professor_id = s.professor_atual_id
     LEFT JOIN janela j ON j.aluno_id = s.id
     LEFT JOIN consecutivas fc ON fc.aluno_id = s.id
     LEFT JOIN mes m ON m.aluno_id = s.id
     LEFT JOIN semaforo sf ON sf.aluno_id = s.id AND sf.professor_id = s.professor_atual_id
     LEFT JOIN aviso av ON av.aluno_id = s.id
     LEFT JOIN frescor_unidade fu ON fu.unidade_id = s.unidade_id
  WHERE auth.role() = 'service_role'::text OR (SESSION_USER::text = ANY (ARRAY['postgres'::text, 'service_role'::text])) OR auth.role() = 'authenticated'::text AND (( SELECT is_admin() AS is_admin) OR (s.unidade_id IN ( SELECT get_user_unidade_ids() AS get_user_unidade_ids)));

COMMENT ON FUNCTION public.get_agenda_dia_v2(date, uuid) IS
  'Porta governada da Agenda com ACL por auth.role; publica legado, sombra ou canonico v2 por unidade.';

COMMENT ON FUNCTION public.presenca_sync_iniciar_v1(uuid, text, date, uuid, integer) IS
  'Inicia lease do sync canonico; autorizacao service_role lida por auth.role().';
