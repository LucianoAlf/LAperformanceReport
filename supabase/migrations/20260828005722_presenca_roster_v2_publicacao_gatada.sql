-- Cutover governado do roster v2. Os corpos que estao em producao sao
-- preservados por rename; sombra/legado continuam chamando exatamente esses
-- OIDs. Somente canonico_v2 entra nas portas reservadas da Task 5.

begin;

alter function public.app_minha_agenda_sessao(date)
  rename to app_minha_agenda_sessao_publicacao_legado_v1;
alter function public.app_registrar_presencas_aula(integer, integer[], uuid)
  rename to app_registrar_presencas_aula_publicacao_legado_v1;
alter function public.fabio_confirmar_chamada_acao(uuid, integer, text)
  rename to fabio_confirmar_chamada_acao_publicacao_legado_v1;
alter function public.fabio_emitir_presenca_por_registro(uuid)
  rename to fabio_emitir_presenca_por_registro_publicacao_legado_v1;

revoke all on function public.app_minha_agenda_sessao_publicacao_legado_v1(date)
  from public, anon, authenticated, service_role;
revoke all on function public.app_registrar_presencas_aula_publicacao_legado_v1(
  integer, integer[], uuid
) from public, anon, authenticated, service_role;
revoke all on function public.fabio_confirmar_chamada_acao_publicacao_legado_v1(
  uuid, integer, text
) from public, anon, authenticated, service_role;
revoke all on function public.fabio_emitir_presenca_por_registro_publicacao_legado_v1(uuid)
  from public, anon, authenticated, service_role;

-- A base canonica do LA Teacher nasce diretamente do roster publicado v2.
-- Nao materializa app_minha_agenda_sessao_base_v1 nem a view de roster v1.
create or replace function public.app_minha_agenda_sessao_canonica_v2(
  p_data date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_professor_id integer := public.fn_professor_do_usuario();
  v_base jsonb;
  v_status text := 'atualizados';
  v_sincronizado_em timestamptz;
  v_frescor jsonb;
  v_tem_revisao boolean;
  v_unidade record;
  v_sessao jsonb;
  v_aluno jsonb;
  v_alunos jsonb;
  v_saida jsonb := '[]'::jsonb;
  v_ocorrencia record;
  v_aula_alvo integer;
begin
  if v_professor_id is null then
    return jsonb_build_object('erro', 'sem_professor_vinculado');
  end if;
  if p_data is null then
    raise exception 'DATA_OBRIGATORIA' using errcode = '22023';
  end if;

  v_base := coalesce((
    with aulas_dia as (
      select ae.*
        from public.aulas_emusys ae
       where ae.professor_id = v_professor_id
         and ae.data_aula = p_data
         and not coalesce(ae.cancelada, false)
    ), slots as (
      select
        data_hora_inicio,
        data_hora_fim,
        (array_agg(id order by case when tipo = 'turma' then 0 else 1 end, id))[1]
          as aula_id_ancora
        from aulas_dia
       group by data_hora_inicio, data_hora_fim
    ), ancoras as (
      select ae.*
        from slots s
        join aulas_dia ae on ae.id = s.aula_id_ancora
    )
    select jsonb_agg(jsonb_build_object(
      'aula_id_ancora', ae.id,
      'hora', to_char(ae.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
      'hora_fim', to_char(ae.data_hora_fim at time zone 'America/Sao_Paulo', 'HH24:MI'),
      'data_hora_inicio', ae.data_hora_inicio,
      'data_hora_fim', ae.data_hora_fim,
      'curso', ae.curso_nome,
      'turma_nome', ae.turma_nome,
      'tipo', ae.tipo,
      'n_alunos', coalesce(roster.n_alunos, 0),
      'n_registradas', coalesce(roster.n_registradas, 0),
      'tem_registro', coalesce(roster.tem_registro, false),
      'tem_rascunho', coalesce(roster.tem_rascunho, false),
      'roster_incompleto', coalesce(roster.n_sem_vinculo, 0) > 0,
      'alunos', coalesce(roster.alunos, '[]'::jsonb),
      'experimental', ae.categoria = 'experimental',
      'vinculo_id', (
        select v.id
          from public.lead_experimental_aulas v
         where v.aula_local_id = ae.id
           and v.cancelado_em is null
         order by v.id desc
         limit 1
      ),
      'experimental_nome', (
        select le.nome_aluno
          from public.lead_experimental_aulas v
          join public.lead_experimentais le on le.id = v.lead_experimental_id
         where v.aula_local_id = ae.id
           and v.cancelado_em is null
         order by v.id desc
         limit 1
      )
    ) order by ae.data_hora_inicio, ae.id)
      from ancoras ae
      left join lateral (
        select
          count(*) as n_alunos,
          count(distinct r.aluno_id) filter (
            where coalesce(ap.chamada_fechada, false)
          ) as n_registradas,
          count(*) filter (where r.aluno_id is null) as n_sem_vinculo,
          bool_or(nullif(btrim(coalesce(aula_alvo.anotacoes_fabio, '')), '') is not null)
            as tem_registro,
          bool_or(rascunho.id is not null) as tem_rascunho,
          jsonb_agg(jsonb_build_object(
            'aluno_id', r.aluno_id,
            'nome', r.aluno_nome,
            'aula_id_alvo', coalesce(aula_alvo.id, ae.id),
            'presenca', coalesce(ap.presenca_afirmada, 'a_confirmar'),
            'tem_presenca_registrada', coalesce(ap.chamada_fechada, false),
            'origem_presenca', ap.respondido_por,
            'tem_conflito_presenca', exists (
              select 1
                from public.aluno_presenca_conflitos c
               where c.aluno_presenca_id = ap.id
                 and c.estado = 'aberto'
            ),
            'tem_registro',
              nullif(btrim(coalesce(aula_alvo.anotacoes_fabio, '')), '') is not null,
            'tem_rascunho', rascunho.id is not null,
            'justificada', coalesce(adm.justificada, false)
          ) order by r.aluno_nome) as alunos
          from public.vw_aula_roster_operacional_v2 r
          left join lateral (
            select
              c.aluno_presenca_id as id,
              c.status_presenca,
              c.respondido_por,
              c.presenca_afirmada,
              c.chamada_fechada
              from public.vw_presenca_slot_canonica_v1 c
             where c.aluno_id = r.aluno_id
               and c.professor_id = ae.professor_id
               and c.data_hora_inicio = ae.data_hora_inicio
               and c.data_hora_fim is not distinct from ae.data_hora_fim
             order by
               (c.curso_nome is not distinct from ae.curso_nome) desc,
               c.chamada_fechada desc,
               c.aluno_presenca_id
             limit 1
          ) ap on true
          left join public.aluno_presenca_administrativo adm
            on adm.aula_emusys_id = ae.id
           and adm.aluno_id = r.aluno_id
          left join lateral (
            select alvo.id, alvo.anotacoes_fabio
              from public.aulas_emusys alvo
              join public.vw_aula_roster_operacional_v2 alvo_roster
                on alvo_roster.aula_emusys_id = alvo.id
               and alvo_roster.aluno_id = r.aluno_id
             where alvo.professor_id = v_professor_id
               and alvo.data_aula = p_data
               and alvo.data_hora_inicio = ae.data_hora_inicio
               and alvo.data_hora_fim is not distinct from ae.data_hora_fim
               and not coalesce(alvo.cancelada, false)
               and coalesce(alvo.tipo, '') <> 'turma'
             order by alvo.id
             limit 1
          ) aula_individual on true
          left join public.aulas_emusys aula_alvo
            on aula_alvo.id = coalesce(aula_individual.id, ae.id)
          left join lateral (
            select rasc.id
              from public.fabio_registros_aula rasc
             where rasc.professor_id = v_professor_id
               and rasc.status = 'aguardando_confirmacao'
               and (
                 (rasc.parent_id is null and rasc.aluno_id is null and rasc.aula_id = ae.id)
                 or (
                   rasc.parent_id is null
                   and rasc.aluno_id = r.aluno_id
                   and rasc.aula_id = coalesce(aula_individual.id, ae.id)
                 )
                 or (
                   rasc.parent_id is not null
                   and rasc.aluno_id = r.aluno_id
                   and exists (
                     select 1
                       from public.fabio_registros_aula tronco
                      where tronco.id = rasc.parent_id
                        and tronco.aula_id = ae.id
                        and tronco.professor_id = v_professor_id
                   )
                 )
               )
             order by rasc.criado_em, rasc.id
             limit 1
          ) rascunho on true
         where r.aula_emusys_id = ae.id
      ) roster on true
  ), '[]'::jsonb);

  for v_unidade in
    select distinct ae.unidade_id
      from public.aulas_emusys ae
     where ae.professor_id = v_professor_id
       and ae.data_aula = p_data
       and ae.data_hora_fim < now()
       and not coalesce(ae.cancelada, false)
  loop
    v_frescor := public.fn_presenca_dados_frescos_interno_v1(
      v_unidade.unidade_id,
      p_data
    );
    if coalesce((v_frescor ->> 'publicavel')::boolean, false) is not true then
      v_status := 'dados_desatualizados';
    end if;
    if nullif(v_frescor ->> 'finalizada_em', '') is not null then
      v_sincronizado_em := least(
        coalesce(v_sincronizado_em, (v_frescor ->> 'finalizada_em')::timestamptz),
        (v_frescor ->> 'finalizada_em')::timestamptz
      );
    end if;

    select exists (
      select 1
        from public.aulas_emusys ae
        left join public.aula_roster_sync_estado re on re.aula_id = ae.id
       where ae.professor_id = v_professor_id
         and ae.unidade_id = v_unidade.unidade_id
         and ae.data_aula = p_data
         and ae.data_hora_fim < now()
         and coalesce(ae.categoria, 'normal') = 'normal'
         and not coalesce(ae.cancelada, false)
         and (
           coalesce(re.estado, 'sem_fotografia') in (
             'incompleto', 'ambiguo', 'sem_fotografia'
           )
           or re.sincronizado_em is null
           or re.sincronizado_em <
             p_data::timestamp at time zone 'America/Sao_Paulo'
           or (
             nullif(v_frescor ->> 'finalizada_em', '') is not null
             and re.sincronizado_em >
               (v_frescor ->> 'finalizada_em')::timestamptz
           )
         )
    ) into v_tem_revisao;
    if v_tem_revisao and v_status = 'atualizados' then
      v_status := 'roster_em_revisao';
    end if;
  end loop;

  for v_sessao in
    select value from jsonb_array_elements(v_base)
  loop
    v_alunos := '[]'::jsonb;
    for v_aluno in
      select value
        from jsonb_array_elements(coalesce(v_sessao -> 'alunos', '[]'::jsonb))
    loop
      v_aula_alvo := nullif(v_aluno ->> 'aula_id_alvo', '')::integer;
      v_ocorrencia := null;
      if v_status = 'atualizados'
         and nullif(v_aluno ->> 'aluno_id', '') is not null then
        select
          o.resultado_canonico,
          o.fonte_decisao,
          o.fecha_chamada,
          o.decidido_em,
          o.possui_conflito
          into v_ocorrencia
          from public.vw_presenca_ocorrencia_canonica_v2 o
         where o.aluno_id = (v_aluno ->> 'aluno_id')::integer
           and o.professor_id = v_professor_id
           and o.data_aula = p_data
           and v_aula_alvo = any(o.ids_aulas_emusys)
         order by
           o.fecha_chamada desc,
           o.decidido_em desc nulls last,
           o.slot_key
         limit 1;
      end if;

      if v_status <> 'atualizados' then
        v_aluno := v_aluno || jsonb_build_object(
          'presenca_estado_v2', v_status,
          'presenca_fonte', null,
          'presenca_travada', true,
          'presenca_decidida_em', null,
          'presenca_conflito', false,
          'presenca_regra_versao', 'presenca-v2'
        );
      elsif v_ocorrencia.resultado_canonico is not null then
        v_aluno := v_aluno || jsonb_build_object(
          'presenca_estado_v2', v_ocorrencia.resultado_canonico,
          'presenca_fonte', v_ocorrencia.fonte_decisao,
          'presenca_travada', v_ocorrencia.fecha_chamada,
          'presenca_decidida_em', v_ocorrencia.decidido_em,
          'presenca_conflito', v_ocorrencia.possui_conflito,
          'presenca_regra_versao', 'presenca-v2'
        );
      else
        v_aluno := v_aluno || jsonb_build_object(
          'presenca_estado_v2', 'indeterminado',
          'presenca_fonte', null,
          'presenca_travada', false,
          'presenca_decidida_em', null,
          'presenca_conflito', false,
          'presenca_regra_versao', 'presenca-v2'
        );
      end if;
      v_alunos := v_alunos || jsonb_build_array(v_aluno);
    end loop;
    v_saida := v_saida || jsonb_build_array(
      jsonb_set(v_sessao, '{alunos}', v_alunos, true)
    );
  end loop;

  return jsonb_build_object(
    'dados_status', v_status,
    'sincronizado_em', v_sincronizado_em,
    'regra_versao', 'presenca-v2',
    'sessoes', v_saida
  );
end
$function$;

revoke all on function public.app_minha_agenda_sessao_canonica_v2(date)
  from public, anon, authenticated, service_role;

-- Create fica fora do subbloco do apply. Se o apply sofrer uma falha
-- retryable, somente o subbloco e revertido: o request continua recebido e o
-- consumidor recebe o SQLSTATE para repetir o mesmo UUID.
create or replace function public.app_registrar_presencas_aula_canonica_v2_interno(
  p_request_id uuid,
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_resultado jsonb;
  v_sqlstate text;
begin
  perform public.app_criar_comando_chamada_professor_v2(
    p_request_id,
    p_aula_emusys_id,
    p_alunos_ausentes
  );

  begin
    return public.app_aplicar_comando_presenca_v2(p_request_id);
  exception
    when sqlstate '40001'
      or sqlstate '40P01'
      or sqlstate '55P03'
      or sqlstate '57014' then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      v_resultado := public.app_status_comando_presenca_v1(p_request_id);
      return v_resultado || jsonb_build_object(
        'retryable', true,
        'erro_codigo', v_sqlstate
      );
  end;
end
$function$;

revoke all on function public.app_registrar_presencas_aula_canonica_v2_interno(
  uuid, integer, integer[]
) from public, anon, authenticated, service_role;

create or replace function public.fabio_registrar_presencas_aula_canonica_v2_interno(
  p_request_id uuid,
  p_professor_id integer,
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[],
  p_fonte text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_resultado jsonb;
  v_sqlstate text;
begin
  perform public.fabio_criar_comando_chamada_v2(
    p_request_id,
    p_professor_id,
    p_aula_emusys_id,
    p_alunos_ausentes,
    p_fonte
  );

  begin
    return public.app_aplicar_comando_presenca_v2(p_request_id);
  exception
    when sqlstate '40001'
      or sqlstate '40P01'
      or sqlstate '55P03'
      or sqlstate '57014' then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      v_resultado := public.app_status_comando_presenca_v1(p_request_id);
      return v_resultado || jsonb_build_object(
        'retryable', true,
        'erro_codigo', v_sqlstate
      );
  end;
end
$function$;

revoke all on function public.fabio_registrar_presencas_aula_canonica_v2_interno(
  uuid, integer, integer, integer[], text
) from public, anon, authenticated, service_role;

-- Canonico do Fábio: mesma validacao e o mesmo envelope do entrypoint vivo,
-- trocando somente create/apply pelas portas v2. O legado renomeado permanece
-- a unica execucao em sombra/rollback.
create or replace function public.fabio_confirmar_chamada_acao_canonica_v2_interno(
  p_acao_id uuid,
  p_professor_id integer,
  p_wa_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_acao public.fabio_acoes_pendentes%rowtype;
  v_existente jsonb;
  v_resultado jsonb;
  v_escrita jsonb;
  v_aula_id integer;
  v_ausentes integer[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_obrigatorio' using errcode = '42501';
  end if;

  select resultado
    into v_existente
    from public.fabio_acao_eventos
   where wa_message_id = p_wa_message_id;
  if v_existente is not null then
    return jsonb_build_object(
      'ok', true,
      'codigo', 'evento_existente',
      'resultado', v_existente
    );
  end if;

  select *
    into v_acao
    from public.fabio_acoes_pendentes
   where id = p_acao_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'acao_nao_encontrada');
  end if;
  if v_acao.professor_id is distinct from p_professor_id then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'acao_nao_pertence_ao_professor'
    );
  end if;
  if v_acao.tipo <> 'confirmar_chamada' or v_acao.estado <> 'aberta' then
    return jsonb_build_object('ok', false, 'codigo', 'acao_nao_confirmavel');
  end if;
  if v_acao.expira_em is not null and v_acao.expira_em < now() then
    update public.fabio_acoes_pendentes
       set estado = 'expirada',
           atualizado_em = now(),
           encerrado_em = now()
     where id = v_acao.id;
    return jsonb_build_object('ok', false, 'codigo', 'acao_expirada');
  end if;

  v_aula_id := v_acao.aula_id;
  if v_aula_id is null
     or not (v_aula_id = any(v_acao.candidatas))
     or not public.fabio_shortlist_valida(
       p_professor_id,
       'chamada',
       array[v_aula_id],
       now()
     ) then
    return jsonb_build_object('ok', false, 'codigo', 'aula_fora_da_shortlist');
  end if;

  select coalesce(array_agg(value::integer), '{}'::integer[])
    into v_ausentes
    from jsonb_array_elements_text(
      coalesce(v_acao.payload -> 'alunos_ausentes', '[]'::jsonb)
    );

  v_escrita := public.fabio_registrar_presencas_aula_canonica_v2_interno(
    p_acao_id,
    p_professor_id,
    v_aula_id,
    v_ausentes,
    'professor_whatsapp'
  );
  if v_escrita ->> 'status' <> 'concluido' then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'presenca_nao_aplicada',
      'recibo', v_escrita
    );
  end if;

  update public.fabio_acoes_pendentes
     set estado = 'resolvida',
         ultima_resposta_wa_id = p_wa_message_id,
         atualizado_em = now(),
         encerrado_em = now()
   where id = v_acao.id;
  v_resultado := jsonb_build_object(
    'ok', true,
    'codigo', 'chamada_confirmada',
    'acao', public.fabio_acao_json(v_acao.id),
    'escrita', v_escrita
  );
  insert into public.fabio_acao_eventos(
    acao_id,
    wa_message_id,
    evento,
    resultado
  ) values (
    v_acao.id,
    p_wa_message_id,
    'confirmado',
    v_resultado
  );
  return v_resultado;
end
$function$;

revoke all on function public.fabio_confirmar_chamada_acao_canonica_v2_interno(
  uuid, integer, text
) from public, anon, authenticated, service_role;

create or replace function public.fabio_emitir_presenca_registro_canonica_v2_interno(
  p_registro_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_reg public.fabio_registros_aula%rowtype;
  v_aula_reg public.aulas_emusys%rowtype;
  v_ausentes integer[];
  v_ancora integer;
  v_roster_ind integer;
  v_tem_sinal boolean;
  v_res jsonb;
  v_fonte text;
  v_request_id uuid := md5('fabio-registro:' || p_registro_id::text)::uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_obrigatorio' using errcode = '42501';
  end if;

  select *
    into v_reg
    from public.fabio_registros_aula
   where id = p_registro_id
     and parent_id is null;
  if not found then
    return jsonb_build_object(
      'aplicado', false,
      'motivo', 'registro_nao_encontrado'
    );
  end if;

  v_fonte := case
    when v_reg.modo_entrada = 'manual' then 'professor_la_teacher'
    else 'fabio_audio'
  end;
  select *
    into v_aula_reg
    from public.aulas_emusys
   where id = v_reg.aula_id;
  if not found then
    update public.fabio_registros_aula
       set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(
         'presenca_emitida', true,
         'presenca_emitida_em', now(),
         'presenca_aplicado', false,
         'presenca_erro', 'aula_do_registro_nao_encontrada',
         'presenca_fonte', v_fonte,
         'presenca_request_id', v_request_id
       )
     where id = p_registro_id;
    return jsonb_build_object(
      'aula_id', v_reg.aula_id,
      'aplicado', false,
      'motivo', 'aula_do_registro_nao_encontrada',
      'request_id', v_request_id
    );
  end if;

  if v_reg.aluno_id is not null then
    v_ancora := v_reg.aula_id;
    select count(*)
      into v_roster_ind
      from public.aula_alunos_emusys
     where aula_emusys_id = v_ancora
       and aluno_id is not null
       and ativo_operacional;
    if coalesce(v_roster_ind, 0) > 1 then
      update public.fabio_registros_aula
         set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(
           'presenca_emitida', true,
           'presenca_emitida_em', now(),
           'presenca_aplicado', false,
           'presenca_erro', 'registro_individual_em_aula_de_turma',
           'presenca_fonte', v_fonte,
           'presenca_request_id', v_request_id
         )
       where id = p_registro_id;
      return jsonb_build_object(
        'aula_id', v_ancora,
        'aplicado', false,
        'motivo', 'registro_individual_em_aula_de_turma'
      );
    end if;
    v_tem_sinal := (v_reg.campos ->> 'presenca') is not null;
    v_ausentes := case
      when coalesce(v_reg.campos ->> 'presenca', 'presente') = 'ausente'
        then array[v_reg.aluno_id]
      else '{}'::integer[]
    end;
  else
    if coalesce(v_aula_reg.tipo, '') = 'turma' then
      v_ancora := v_reg.aula_id;
    else
      select coalesce((
        select t.id
          from public.aulas_emusys t
         where t.tipo = 'turma'
           and t.unidade_id = v_aula_reg.unidade_id
           and t.data_hora_inicio = v_aula_reg.data_hora_inicio
           and t.professor_id is not distinct from v_reg.professor_id
           and not coalesce(t.cancelada, false)
         limit 1
      ), v_reg.aula_id)
        into v_ancora;
    end if;
    select coalesce(array_agg(f.aluno_id) filter (
      where coalesce(f.campos ->> 'presenca', 'presente') = 'ausente'
        and f.aluno_id is not null
    ), '{}'::integer[])
      into v_ausentes
      from public.fabio_registros_aula f
     where f.parent_id = p_registro_id;
    v_tem_sinal := exists (
      select 1
        from public.fabio_registros_aula f
       where f.parent_id = p_registro_id
         and (f.campos ->> 'presenca') is not null
    );
  end if;

  if not coalesce(v_tem_sinal, false) then
    return jsonb_build_object(
      'aula_id', v_ancora,
      'aplicado', false,
      'motivo', 'sem_sinal_de_presenca_no_registro'
    );
  end if;

  v_res := public.fabio_registrar_presencas_aula_canonica_v2_interno(
    v_request_id,
    v_reg.professor_id,
    v_ancora,
    v_ausentes,
    v_fonte
  );

  if coalesce(v_res ->> 'status', '') not in (
    'concluido', 'parcial', 'falhou'
  ) then
    return v_res || jsonb_build_object(
      'ausentes', to_jsonb(coalesce(v_ausentes, '{}'::integer[])),
      'fonte', v_fonte
    );
  end if;

  update public.fabio_registros_aula
     set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(
       'presenca_emitida', true,
       'presenca_emitida_em', now(),
       'presenca_aplicado', v_res ->> 'status' = 'concluido',
       'presenca_erro', case
         when v_res ->> 'status' = 'concluido' then null
         else v_res ->> 'status'
       end,
       'presenca_fonte', v_fonte,
       'presenca_request_id', v_request_id
     )
   where id = p_registro_id;
  return v_res || jsonb_build_object(
    'ausentes', to_jsonb(coalesce(v_ausentes, '{}'::integer[])),
    'fonte', v_fonte
  );
end
$function$;

revoke all on function public.fabio_emitir_presenca_registro_canonica_v2_interno(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.app_minha_agenda_sessao(
  p_data date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_professor_id integer := public.fn_professor_do_usuario();
  v_modo text;
begin
  if v_professor_id is null then
    return public.app_minha_agenda_sessao_publicacao_legado_v1(p_data);
  end if;

  select case
    when count(*) > 0 and bool_and(c.modo = 'canonico_v2') then 'canonico_v2'
    when count(*) > 0 and bool_and(c.modo = 'legado') then 'legado'
    else 'sombra'
  end
    into v_modo
    from public.presenca_rollout_config c
   where c.superficie = 'la_teacher'
     and c.unidade_id in (
       select distinct ae.unidade_id
         from public.aulas_emusys ae
        where ae.professor_id = v_professor_id
          and ae.data_aula = p_data
     );
  v_modo := coalesce(v_modo, 'sombra');

  if v_modo = 'canonico_v2' then
    return public.app_minha_agenda_sessao_canonica_v2(p_data)
      || jsonb_build_object('rollout_modo', v_modo);
  end if;

  -- Hugo hotfix: sombra e legado nao calculam uma resposta v2 descartada.
  return public.app_minha_agenda_sessao_publicacao_legado_v1(p_data);
end
$function$;

create or replace function public.app_registrar_presencas_aula(
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[],
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_unidade_id uuid;
  v_modo text;
begin
  select ae.unidade_id
    into v_unidade_id
    from public.aulas_emusys ae
   where ae.id = p_aula_emusys_id;
  if not found then
    return public.app_registrar_presencas_aula_publicacao_legado_v1(
      p_aula_emusys_id,
      p_alunos_ausentes,
      p_request_id
    );
  end if;

  v_modo := public.fn_presenca_rollout_modo_interno_v1(
    v_unidade_id,
    'la_teacher'
  );
  if v_modo = 'canonico_v2' then
    return public.app_registrar_presencas_aula_canonica_v2_interno(
      p_request_id,
      p_aula_emusys_id,
      p_alunos_ausentes
    );
  end if;

  return public.app_registrar_presencas_aula_publicacao_legado_v1(
    p_aula_emusys_id,
    p_alunos_ausentes,
    p_request_id
  );
end
$function$;

create or replace function public.fabio_confirmar_chamada_acao(
  p_acao_id uuid,
  p_professor_id integer,
  p_wa_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_unidade_id uuid;
  v_modo text;
begin
  select ae.unidade_id
    into v_unidade_id
    from public.fabio_acoes_pendentes acao
    join public.aulas_emusys ae on ae.id = acao.aula_id
   where acao.id = p_acao_id;
  if not found then
    return public.fabio_confirmar_chamada_acao_publicacao_legado_v1(
      p_acao_id,
      p_professor_id,
      p_wa_message_id
    );
  end if;

  v_modo := public.fn_presenca_rollout_modo_interno_v1(
    v_unidade_id,
    'la_teacher'
  );
  if v_modo = 'canonico_v2' then
    return public.fabio_confirmar_chamada_acao_canonica_v2_interno(
      p_acao_id,
      p_professor_id,
      p_wa_message_id
    );
  end if;

  return public.fabio_confirmar_chamada_acao_publicacao_legado_v1(
    p_acao_id,
    p_professor_id,
    p_wa_message_id
  );
end
$function$;

create or replace function public.fabio_emitir_presenca_por_registro(
  p_registro_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_unidade_id uuid;
  v_modo text;
begin
  select ae.unidade_id
    into v_unidade_id
    from public.fabio_registros_aula registro
    join public.aulas_emusys ae on ae.id = registro.aula_id
   where registro.id = p_registro_id
     and registro.parent_id is null;
  if not found then
    return public.fabio_emitir_presenca_por_registro_publicacao_legado_v1(
      p_registro_id
    );
  end if;

  v_modo := public.fn_presenca_rollout_modo_interno_v1(
    v_unidade_id,
    'la_teacher'
  );
  if v_modo = 'canonico_v2' then
    return public.fabio_emitir_presenca_registro_canonica_v2_interno(
      p_registro_id
    );
  end if;

  return public.fabio_emitir_presenca_por_registro_publicacao_legado_v1(
    p_registro_id
  );
end
$function$;

revoke all on function public.app_minha_agenda_sessao(date)
  from public, anon, authenticated, service_role;
grant execute on function public.app_minha_agenda_sessao(date)
  to authenticated;

revoke all on function public.app_registrar_presencas_aula(
  integer, integer[], uuid
) from public, anon, authenticated, service_role;
grant execute on function public.app_registrar_presencas_aula(
  integer, integer[], uuid
) to authenticated, service_role;

revoke all on function public.fabio_confirmar_chamada_acao(uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.fabio_confirmar_chamada_acao(uuid, integer, text)
  to service_role;

revoke all on function public.fabio_emitir_presenca_por_registro(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.fabio_emitir_presenca_por_registro(uuid)
  to service_role;

comment on function public.app_minha_agenda_sessao(date) is
  'Cutover LA Teacher: legado e sombra preservam o hotfix sem consulta v2; canonico le roster v2 diretamente.';
comment on function public.app_registrar_presencas_aula(integer, integer[], uuid) is
  'Writer LA Teacher governado por unidade; rollback por flag volta ao corpo legado preservado.';
comment on function public.fabio_confirmar_chamada_acao(uuid, integer, text) is
  'Writer Fabio de acao governado por la_teacher e unidade, service-role only.';
comment on function public.fabio_emitir_presenca_por_registro(uuid) is
  'Writer Fabio de registro governado por la_teacher e unidade, service-role only.';

commit;
