-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- RPCs da chamada na Agenda (spec 2026-08-11)

create or replace function public.app_registrar_chamada_agenda(
  p_aula_emusys_id integer,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id integer;
  v_aula public.aulas_emusys%rowtype;
  v_item jsonb;
  v_aluno_id integer;
  v_status text;
  v_motivo text;
  v_evidencia text;
  v_existente public.aluno_presenca%rowtype;
  v_status_anterior text;
  v_inseridos integer := 0;
  v_atualizados integer := 0;
  v_retificados integer := 0;
  v_erros jsonb := '[]'::jsonb;
  v_humanos constant text[] := array[
    'professor_la_teacher', 'professor_whatsapp', 'manual', 'fabio_audio', 'agenda_secretaria'
  ];
begin
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  select * into v_aula from public.aulas_emusys where id = p_aula_emusys_id;
  if not found then
    raise exception 'aula_nao_encontrada';
  end if;

  if v_usuario_id is null
     or not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_aula.unidade_id) then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  if coalesce(v_aula.cancelada, false) then
    raise exception 'aula_cancelada';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_aluno_id := (v_item->>'aluno_id')::integer;
    v_status := v_item->>'status';
    v_motivo := nullif(btrim(coalesce(v_item->>'motivo', '')), '');
    v_evidencia := nullif(btrim(coalesce(v_item->>'evidencia_path', '')), '');

    if v_status not in ('presente', 'falta', 'falta_justificada') then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'status_invalido');
      continue;
    end if;

    if v_status = 'falta_justificada' and (v_motivo is null or length(v_motivo) < 3) then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'motivo_obrigatorio_justificada');
      continue;
    end if;

    if not exists (
      select 1 from public.aula_alunos_emusys r
      where r.aula_emusys_id = v_aula.id and r.aluno_id = v_aluno_id
    ) then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'aluno_fora_do_roster');
      continue;
    end if;

    select * into v_existente
    from public.aluno_presenca
    where aluno_id = v_aluno_id and aula_emusys_id = v_aula.id;

    if found then
      v_status_anterior := coalesce(
        v_existente.status_presenca,
        case v_existente.status when 'presente' then 'presente' when 'ausente' then 'falta' end
      );

      if v_status_anterior is not distinct from v_status then
        continue;
      end if;

      if v_existente.respondido_por = any(v_humanos) and v_motivo is null then
        v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'motivo_obrigatorio_retificacao');
        continue;
      end if;

      if v_existente.respondido_por = any(v_humanos) then
        insert into public.aluno_presenca_retificacoes (
          aluno_presenca_id, unidade_id, status_anterior, status_novo,
          respondido_por_anterior, respondido_em_anterior,
          motivo, autor_usuario_id, autor_auth_user_id
        ) values (
          v_existente.id, v_existente.unidade_id, v_status_anterior, v_status,
          v_existente.respondido_por, v_existente.respondido_em,
          v_motivo, v_usuario_id, auth.uid()
        );
        v_retificados := v_retificados + 1;
      end if;

      update public.aluno_presenca
      set status = case when v_status = 'presente' then 'presente' else 'ausente' end,
          status_presenca = v_status,
          respondido_por = 'agenda_secretaria',
          respondido_em = now()
      where id = v_existente.id;
      v_atualizados := v_atualizados + 1;
    else
      insert into public.aluno_presenca (
        aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula, horario_aula,
        status, status_presenca, curso_nome, turma_nome, sala_nome,
        respondido_por, respondido_em
      ) values (
        v_aluno_id, v_aula.id, v_aula.professor_id, v_aula.unidade_id, v_aula.data_aula,
        (v_aula.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
        case when v_status = 'presente' then 'presente' else 'ausente' end,
        v_status, v_aula.curso_nome, v_aula.turma_nome, v_aula.sala_nome,
        'agenda_secretaria', now()
      );
      v_inseridos := v_inseridos + 1;
    end if;

    if v_status = 'falta_justificada' then
      insert into public.aluno_presenca_administrativo (
        aluno_id, aula_emusys_id, unidade_id, justificada, fonte,
        motivo, evidencia_path, autor_usuario_id, autor_auth_user_id,
        sincronizado_em, updated_at
      ) values (
        v_aluno_id, v_aula.id, v_aula.unidade_id, true, 'agenda_secretaria',
        v_motivo, v_evidencia, v_usuario_id, auth.uid(),
        now(), now()
      )
      on conflict (aluno_id, aula_emusys_id) do update set
        justificada = true,
        fonte = 'agenda_secretaria',
        motivo = excluded.motivo,
        evidencia_path = coalesce(excluded.evidencia_path, aluno_presenca_administrativo.evidencia_path),
        autor_usuario_id = excluded.autor_usuario_id,
        autor_auth_user_id = excluded.autor_auth_user_id,
        updated_at = now();

      insert into public.aluno_reposicoes (unidade_id, aluno_id, aula_origem_id, origem, motivo, evidencia_path)
      values (v_aula.unidade_id, v_aluno_id, v_aula.id, 'falta_justificada', v_motivo, v_evidencia)
      on conflict (aluno_id, aula_origem_id, origem) do nothing;
    elsif v_status = 'falta' then
      update public.aluno_reposicoes
      set status = 'cancelada', updated_at = now()
      where aluno_id = v_aluno_id and aula_origem_id = v_aula.id
        and origem = 'falta_justificada' and status = 'pendente';

      update public.aluno_presenca_administrativo
      set justificada = false, updated_at = now()
      where aluno_id = v_aluno_id and aula_emusys_id = v_aula.id;
    end if;
  end loop;

  return jsonb_build_object(
    'aula_id', v_aula.id,
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'retificados', v_retificados,
    'erros', v_erros
  );
end;
$$;

revoke all on function public.app_registrar_chamada_agenda(integer, jsonb) from public, anon;
grant execute on function public.app_registrar_chamada_agenda(integer, jsonb) to authenticated;

create or replace function public.app_justificar_falta(
  p_aluno_presenca_id uuid,
  p_motivo text,
  p_evidencia_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro public.aluno_presenca%rowtype;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'motivo_obrigatorio';
  end if;

  select * into v_registro
  from public.aluno_presenca
  where id = p_aluno_presenca_id;

  if not found then
    raise exception 'presenca_nao_encontrada';
  end if;

  return public.app_registrar_chamada_agenda(
    v_registro.aula_emusys_id,
    jsonb_build_array(jsonb_build_object(
      'aluno_id', v_registro.aluno_id,
      'status', 'falta_justificada',
      'motivo', p_motivo,
      'evidencia_path', p_evidencia_path
    ))
  );
end;
$$;

revoke all on function public.app_justificar_falta(uuid, text, text) from public, anon;
grant execute on function public.app_justificar_falta(uuid, text, text) to authenticated;

create or replace function public.app_cancelar_aula(
  p_aula_emusys_id integer,
  p_motivo text,
  p_evidencia_path text default null,
  p_escopo text default 'aula'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id integer;
  v_aula public.aulas_emusys%rowtype;
  v_afetadas integer := 0;
  v_creditos integer := 0;
begin
  if p_escopo not in ('aula', 'unidade_dia') then
    raise exception 'escopo_invalido';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'motivo_obrigatorio_cancelamento';
  end if;

  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  select * into v_aula from public.aulas_emusys where id = p_aula_emusys_id;
  if not found then
    raise exception 'aula_nao_encontrada';
  end if;

  if v_usuario_id is null
     or not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_aula.unidade_id) then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  if p_escopo = 'unidade_dia' and not public.is_admin() then
    raise exception 'cancelamento_em_massa_requer_admin' using errcode = '42501';
  end if;

  with afetadas as (
    update public.aulas_emusys ae
    set cancelada = true,
        cancelada_origem = 'agenda_secretaria',
        cancelada_motivo = btrim(p_motivo),
        cancelada_evidencia_path = nullif(btrim(coalesce(p_evidencia_path, '')), ''),
        cancelada_por_usuario_id = v_usuario_id,
        cancelada_em = now()
    where (ae.id = v_aula.id and not coalesce(ae.cancelada, false))
       or (p_escopo = 'unidade_dia'
           and ae.unidade_id = v_aula.unidade_id
           and ae.data_aula = v_aula.data_aula
           and not coalesce(ae.cancelada, false))
    returning ae.id, ae.unidade_id
  )
  insert into public.aluno_reposicoes (unidade_id, aluno_id, aula_origem_id, origem, motivo, evidencia_path)
  select a.unidade_id, r.aluno_id, a.id, 'cancelamento', btrim(p_motivo),
         nullif(btrim(coalesce(p_evidencia_path, '')), '')
  from afetadas a
  join public.aula_alunos_emusys r on r.aula_emusys_id = a.id
  where r.aluno_id is not null
  on conflict (aluno_id, aula_origem_id, origem) do nothing;

  get diagnostics v_creditos = row_count;

  select count(*) into v_afetadas
  from public.aulas_emusys ae
  where ae.cancelada
    and ae.cancelada_origem = 'agenda_secretaria'
    and ae.cancelada_em > now() - interval '1 minute'
    and (ae.id = v_aula.id or (p_escopo = 'unidade_dia' and ae.unidade_id = v_aula.unidade_id and ae.data_aula = v_aula.data_aula));

  return jsonb_build_object(
    'escopo', p_escopo,
    'aulas_canceladas', v_afetadas,
    'creditos_gerados', v_creditos
  );
end;
$$;

revoke all on function public.app_cancelar_aula(integer, text, text, text) from public, anon;
grant execute on function public.app_cancelar_aula(integer, text, text, text) to authenticated;

create or replace function public.casar_reposicoes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agendadas_direto integer := 0;
  v_agendadas_rede integer := 0;
  v_realizadas integer := 0;
begin
  with movidas as (
    update public.aluno_reposicoes r
    set status = 'agendada',
        aula_reposicao_id = r.aula_origem_id,
        casamento = 'elo_direto',
        agendada_em = now(),
        updated_at = now()
    from public.aulas_emusys ae
    where ae.id = r.aula_origem_id
      and r.status = 'pendente'
      and ae.reagendada
      and ae.data_hora_inicio_original is not null
      and not coalesce(ae.cancelada, false)
    returning r.id
  )
  select count(*) into v_agendadas_direto from movidas;

  with candidatas as (
    select distinct on (r.id)
      r.id as reposicao_id,
      ae2.id as aula_nova_id
    from public.aluno_reposicoes r
    join public.aulas_emusys origem on origem.id = r.aula_origem_id
    join public.aula_alunos_emusys r2 on r2.aluno_id = r.aluno_id
    join public.aulas_emusys ae2 on ae2.id = r2.aula_emusys_id
    where r.status = 'pendente'
      and coalesce(origem.cancelada, false)
      and ae2.id <> origem.id
      and ae2.unidade_id = r.unidade_id
      and not coalesce(ae2.cancelada, false)
      and ae2.data_aula > origem.data_aula
      and (
        (origem.matricula_disciplina_id > 0 and ae2.matricula_disciplina_id = origem.matricula_disciplina_id)
        or (coalesce(origem.matricula_disciplina_id, 0) = 0 and ae2.curso_nome = origem.curso_nome)
      )
    order by r.id, ae2.data_aula, ae2.data_hora_inicio
  ), casadas as (
    update public.aluno_reposicoes r
    set status = 'agendada',
        aula_reposicao_id = c.aula_nova_id,
        casamento = 'rede',
        agendada_em = now(),
        updated_at = now()
    from candidatas c
    where r.id = c.reposicao_id
    returning r.id
  )
  select count(*) into v_agendadas_rede from casadas;

  with feitas as (
    update public.aluno_reposicoes r
    set status = 'realizada',
        realizada_em = now(),
        updated_at = now()
    where r.status = 'agendada'
      and exists (
        select 1
        from public.aluno_presenca ap
        where ap.aluno_id = r.aluno_id
          and ap.aula_emusys_id = r.aula_reposicao_id
          and ap.status = 'presente'
      )
    returning r.id
  )
  select count(*) into v_realizadas from feitas;

  return jsonb_build_object(
    'agendadas_elo_direto', v_agendadas_direto,
    'agendadas_rede', v_agendadas_rede,
    'realizadas', v_realizadas
  );
end;
$$;

revoke all on function public.casar_reposicoes() from public, anon, authenticated;
grant execute on function public.casar_reposicoes() to service_role;
