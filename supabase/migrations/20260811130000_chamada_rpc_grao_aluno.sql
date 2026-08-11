-- 2026-08-11 — Chamada na Agenda (Fase 2): RPCs ajustadas ao grao real + get_agenda_dia v2
-- Spec: docs/superpowers/plans/2026-08-11-chamada-agenda-motor-presenca.md
--
-- Dois aprendizados aplicados:
-- 1) Em turma, cada aluno tem SUA linha em aulas_emusys (container + 1 por
--    contrato). A chamada em lote passa a receber aula_emusys_id POR ITEM.
-- 2) get_agenda_dia e SECURITY INVOKER: todo join novo exige GRANT + policy
--    do proprio usuario (bug real de 03/08). aluno_presenca_administrativo
--    ganha leitura escopada para authenticated.

-- ============================================================
-- 1) Leitura escopada da justificativa administrativa
-- ============================================================
grant select on table public.aluno_presenca_administrativo to authenticated;

drop policy if exists aluno_presenca_administrativo_leitura_escopada on public.aluno_presenca_administrativo;
create policy aluno_presenca_administrativo_leitura_escopada
  on public.aluno_presenca_administrativo
  for select
  to authenticated
  using (
    (select public.is_admin())
    or unidade_id = (select public.get_user_unidade_id())
  );

-- ============================================================
-- 2) Chamada em lote: item carrega a propria aula (grao aluno)
--    A versao (integer, jsonb) foi publicada hoje e ainda nao tem
--    nenhum consumidor — substituicao segura.
-- ============================================================
drop function if exists public.app_registrar_chamada_agenda(integer, jsonb);

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

    -- permissao checada por aula (chamada em lote pode misturar unidades no consolidado;
    -- cada item so passa se o operador tiver permissao NAQUELA unidade)
    if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_aula.unidade_id) then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'sem_permissao_unidade');
      continue;
    end if;

    if coalesce(v_aula.cancelada, false) then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'aula_cancelada');
      continue;
    end if;

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
        continue; -- nada mudou, idempotente
      end if;

      -- sobrescrever resposta humana existente exige motivo (vira retificacao)
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

    -- justificativa: detalhe administrativo + credito de reposicao
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
      -- rebaixou justificada -> falta seca: credito pendente morre junto
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
    'erros', v_erros
  );
end;
$$;

revoke all on function public.app_registrar_chamada_agenda(jsonb) from public, anon;
grant execute on function public.app_registrar_chamada_agenda(jsonb) to authenticated;

-- Atalho de 1 aluno, delegando no caminho unico
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
    jsonb_build_array(jsonb_build_object(
      'aula_emusys_id', v_registro.aula_emusys_id,
      'aluno_id', v_registro.aluno_id,
      'status', 'falta_justificada',
      'motivo', p_motivo,
      'evidencia_path', p_evidencia_path
    ))
  );
end;
$$;

-- ============================================================
-- 3) Cancelar aula: cuida do SLOT inteiro (container + individuais)
-- ============================================================
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

  -- cancelamento em massa (vendaval): so admin ate o Alf validar (spec item 7.3)
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
    where not coalesce(ae.cancelada, false)
      and (
        -- escopo 'aula' = o SLOT inteiro (container + uma linha por contrato),
        -- identificado pelos mesmos campos que formam a chave de agrupamento da agenda
        (p_escopo = 'aula'
          and ae.unidade_id = v_aula.unidade_id
          and ae.data_hora_inicio = v_aula.data_hora_inicio
          and ae.sala_nome is not distinct from v_aula.sala_nome
          and ae.curso_nome is not distinct from v_aula.curso_nome
          and ae.turma_nome is not distinct from v_aula.turma_nome
          and ae.professor_nome is not distinct from v_aula.professor_nome)
        or (p_escopo = 'unidade_dia'
          and ae.unidade_id = v_aula.unidade_id
          and ae.data_aula = v_aula.data_aula)
      )
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
    and ae.unidade_id = v_aula.unidade_id
    and ae.data_aula = v_aula.data_aula;

  return jsonb_build_object(
    'escopo', p_escopo,
    'aulas_canceladas', v_afetadas,
    'creditos_gerados', v_creditos
  );
end;
$$;
