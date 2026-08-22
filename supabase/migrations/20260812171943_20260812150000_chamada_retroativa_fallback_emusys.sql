-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 2026-08-12 - Promove a decisao humana sobre o fallback de presenca do Emusys.
--
-- Uma linha importada com status='ausente' e status_presenca nulo e visualmente
-- neutra na Agenda. Ela nao pode ser tratada como uma decisao humana idempotente.

create or replace function public.app_registrar_chamada_agenda(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id integer;
  v_aula public.aulas_emusys%rowtype;
  v_item jsonb;
  v_aula_id integer;
  v_aluno_id integer;
  v_status text;
  v_motivo text;
  v_evidencia text;
  v_existente public.aluno_presenca%rowtype;
  v_status_anterior text;
  v_inseridos integer := 0;
  v_atualizados integer := 0;
  v_retificados integer := 0;
  v_removidos integer := 0;
  v_erros jsonb := '[]'::jsonb;
  v_humanos constant text[] := array[
    'professor_la_teacher', 'professor_whatsapp', 'manual', 'fabio_audio', 'agenda_secretaria'
  ];
begin
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_aula_id := (v_item->>'aula_emusys_id')::integer;
    v_aluno_id := (v_item->>'aluno_id')::integer;
    v_status := v_item->>'status';
    v_motivo := nullif(btrim(coalesce(v_item->>'motivo', '')), '');
    v_evidencia := nullif(btrim(coalesce(v_item->>'evidencia_path', '')), '');

    select * into v_aula from public.aulas_emusys where id = v_aula_id;
    if not found then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'aula_emusys_id', v_aula_id, 'erro', 'aula_nao_encontrada');
      continue;
    end if;

    if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_aula.unidade_id) then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'sem_permissao_unidade');
      continue;
    end if;

    if coalesce(v_aula.cancelada, false) then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'aula_cancelada');
      continue;
    end if;

    if v_status not in ('presente', 'falta', 'falta_justificada', 'indeterminado') then
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

    -- Toggle: status indeterminado removes the record.
    if v_status = 'indeterminado' then
      if found then
        v_status_anterior := coalesce(
          v_existente.status_presenca,
          case v_existente.status when 'presente' then 'presente' when 'ausente' then 'falta' end
        );

        if v_existente.respondido_por = any(v_humanos) then
          insert into public.aluno_presenca_retificacoes (
            aluno_presenca_id, unidade_id, status_anterior, status_novo,
            respondido_por_anterior, respondido_em_anterior,
            motivo, autor_usuario_id, autor_auth_user_id
          ) values (
            v_existente.id, v_existente.unidade_id, v_status_anterior, 'indeterminado',
            v_existente.respondido_por, v_existente.respondido_em,
            v_motivo, v_usuario_id, auth.uid()
          );
          v_retificados := v_retificados + 1;
        end if;

        delete from public.aluno_presenca
        where id = v_existente.id;
        v_removidos := v_removidos + 1;

        update public.aluno_presenca_administrativo
        set justificada = false, updated_at = now()
        where aluno_id = v_aluno_id and aula_emusys_id = v_aula.id;

        update public.aluno_reposicoes
        set status = 'cancelada', updated_at = now()
        where aluno_id = v_aluno_id and aula_origem_id = v_aula.id
          and origem = 'falta_justificada' and status = 'pendente';
      end if;
      continue;
    end if;

    -- Fluxo normal: uma linha sem status_presenca e originada no Emusys e
    -- apenas um fallback. A primeira decisao humana deve ser persistida,
    -- mesmo quando coincide com o status derivado de v_existente.status.
    if found then
      v_status_anterior := coalesce(
        v_existente.status_presenca,
        case v_existente.status when 'presente' then 'presente' when 'ausente' then 'falta' end
      );

      if v_existente.status_presenca is not null
         and v_status_anterior is not distinct from v_status then
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

    -- Justificativa: detalhe administrativo e credito de reposicao.
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
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'retificados', v_retificados,
    'removidos', v_removidos,
    'erros', v_erros
  );
end;
$$;

revoke all on function public.app_registrar_chamada_agenda(jsonb) from public, anon;
grant execute on function public.app_registrar_chamada_agenda(jsonb) to authenticated;
