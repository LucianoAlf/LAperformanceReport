-- 2026-08-11 — Chamada na Agenda + Motor de Presenca (Fase 1, 100% aditiva)
-- Spec: docs/superpowers/plans/2026-08-11-chamada-agenda-motor-presenca.md
-- NAO mexe em presenca_politicas_confiabilidade (corte do fallback = item 7.1,
-- so no rollout apos piloto, com aval do Alf).

-- ============================================================
-- 1) aluno_presenca: novo status e nova origem humana
-- ============================================================
alter table public.aluno_presenca
  drop constraint if exists aluno_presenca_status_presenca_check;
alter table public.aluno_presenca
  add constraint aluno_presenca_status_presenca_check
  check (status_presenca is null or status_presenca in ('presente', 'falta', 'falta_justificada'));

alter table public.aluno_presenca
  drop constraint if exists aluno_presenca_respondido_por_check;
alter table public.aluno_presenca
  add constraint aluno_presenca_respondido_por_check
  check (respondido_por is null or respondido_por in (
    'professor_whatsapp', 'professor_la_teacher', 'manual', 'sistema', 'emusys', 'fabio_audio', 'agenda_secretaria'
  ));

-- 2) retificacoes aceitam o novo status
alter table public.aluno_presenca_retificacoes
  drop constraint if exists aluno_presenca_retificacoes_status_novo_check;
alter table public.aluno_presenca_retificacoes
  add constraint aluno_presenca_retificacoes_status_novo_check
  check (status_novo in ('presente', 'falta', 'falta_justificada'));

-- ============================================================
-- 3) Justificativa por aluno: motivo + evidencia + autor
-- ============================================================
alter table public.aluno_presenca_administrativo
  add column if not exists motivo text,
  add column if not exists evidencia_path text,
  add column if not exists autor_usuario_id integer references public.usuarios(id),
  add column if not exists autor_auth_user_id uuid;

alter table public.aluno_presenca_administrativo
  drop constraint if exists aluno_presenca_administrativo_fonte_check;
alter table public.aluno_presenca_administrativo
  add constraint aluno_presenca_administrativo_fonte_check
  check (fonte in ('emusys', 'manual_coordenacao', 'agenda_secretaria'));

-- ============================================================
-- 4) Cancelamento humano de aula, com motivo obrigatorio
-- ============================================================
alter table public.aulas_emusys
  add column if not exists cancelada_origem text,
  add column if not exists cancelada_motivo text,
  add column if not exists cancelada_evidencia_path text,
  add column if not exists cancelada_por_usuario_id integer references public.usuarios(id),
  add column if not exists cancelada_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'aulas_emusys_cancelada_origem_check'
      and conrelid = 'public.aulas_emusys'::regclass
  ) then
    alter table public.aulas_emusys
      add constraint aulas_emusys_cancelada_origem_check
      check (cancelada_origem is null or cancelada_origem in ('emusys', 'agenda_secretaria'));
  end if;
end $$;

-- ============================================================
-- 5) Creditos de reposicao
-- ============================================================
create table if not exists public.aluno_reposicoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  aluno_id integer not null references public.alunos(id) on delete cascade,
  aula_origem_id integer not null references public.aulas_emusys(id) on delete cascade,
  origem text not null check (origem in ('falta_justificada', 'cancelamento')),
  status text not null default 'pendente'
    check (status in ('pendente', 'agendada', 'realizada', 'expirada', 'cancelada')),
  motivo text,
  evidencia_path text,
  aula_reposicao_id integer references public.aulas_emusys(id),
  casamento text check (casamento is null or casamento in ('elo_direto', 'rede', 'manual')),
  agendada_em timestamptz,
  realizada_em timestamptz,
  expira_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aluno_reposicoes_unica unique (aluno_id, aula_origem_id, origem)
);

create index if not exists idx_aluno_reposicoes_pendentes
  on public.aluno_reposicoes (unidade_id, status) where status = 'pendente';
create index if not exists idx_aluno_reposicoes_aluno
  on public.aluno_reposicoes (aluno_id, status);

alter table public.aluno_reposicoes enable row level security;

drop policy if exists aluno_reposicoes_leitura_escopada on public.aluno_reposicoes;
create policy aluno_reposicoes_leitura_escopada
  on public.aluno_reposicoes for select to authenticated
  using (public.is_admin() or unidade_id = public.get_user_unidade_id());

drop policy if exists aluno_reposicoes_service_role on public.aluno_reposicoes;
create policy aluno_reposicoes_service_role
  on public.aluno_reposicoes for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke insert, update, delete on public.aluno_reposicoes from anon, authenticated;
grant select on public.aluno_reposicoes to authenticated;

comment on table public.aluno_reposicoes is
  'Credito de reposicao: nasce de falta justificada ou cancelamento, morre quando a aula reposta acontece. Casamento por elo direto (reagendada) ou rede (aluno+disciplina+janela).';

-- ============================================================
-- 6) Permissao da chamada
-- ============================================================
insert into public.permissoes (codigo, modulo, acao, descricao, categoria, ordem)
values (
  'agenda.chamada', 'agenda', 'chamada',
  'Registrar chamada (presenca, falta, falta justificada) e cancelar aulas pela Agenda',
  'OPERACIONAL', 55
)
on conflict (codigo) do nothing;

-- ============================================================
-- 7) RPC: chamada em lote por aula (secretaria na Agenda)
--    itens: [{aluno_id, status: presente|falta|falta_justificada, motivo?, evidencia_path?}]
-- ============================================================
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

-- ============================================================
-- 8) RPC: justificar uma falta existente (atalho de 1 aluno)
-- ============================================================
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

  -- caminho unico: delega para a chamada em lote (mesma validacao, retificacao e credito)
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

-- ============================================================
-- 9) RPC: cancelar aula com motivo (escopo aula ou unidade/dia)
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

  -- cancelamento em massa (vendaval): so admin ate o Alf validar quem mais pode (spec item 7.3)
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

-- ============================================================
-- 10) Motor: casar creditos de reposicao com aulas reagendadas
--     Roda apos o sync de presenca (service_role).
-- ============================================================
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
  -- A) Elo direto, agendada: a aula de origem foi reagendada (mesma linha, data nova)
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

  -- B) Rede, agendada: cancelada que volta como OUTRA aula do mesmo aluno+disciplina
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

  -- C) Realizada: a aula de reposicao aconteceu e o aluno consta presente
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
