-- 2026-08-11 — Presenca do professor por dia (toggle na Chamada).
--
-- A view vw_ponto_professor_aulas ja calcula aula_creditada (intervalo entre
-- primeira e ultima evidencia). O que faltava era popular a fonte:
-- professor_ponto_confirmacoes. Esta migration cria as RPCs para ligar/desligar.
--
-- Toggle ON: grava ponto_confirmacao + atualiza aulas_emusys.professor_presenca
-- Toggle OFF: remove ponto_confirmacao + marca professor_presenca = 'ausente'
-- Falta: cancela aulas sem aluno presente (app_cancelar_aula existente)

-- 1. Registrar presenca do professor para o dia inteiro
create or replace function public.app_registrar_presenca_professor_dia(
  p_professor_id integer,
  p_data date,
  p_unidade_id uuid,
  p_hora_chegada time default null,
  p_hora_saida time default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario_id integer;
  v_aulas_atualizadas integer := 0;
  v_aulas record;
begin
  -- Autenticacao
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  -- Permissao por unidade
  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', p_unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  -- Atualiza professor_presenca em todas as aulas do professor no dia
  for v_aulas in
    select id, data_hora_inicio
    from aulas_emusys
    where professor_id = p_professor_id
      and data_aula = p_data
      and unidade_id = p_unidade_id
      and cancelada = false
      and categoria = 'normal'
  loop
    update aulas_emusys
    set professor_presenca = 'presente'
    where id = v_aulas.id;
    v_aulas_atualizadas := v_aulas_atualizadas + 1;

    -- Grava ponto_confirmacao para cada aula (a view usa como evidencia)
    insert into professor_ponto_confirmacoes (
      professor_id, aula_emusys_id, unidade_id, data_aula,
      estava_presente, origem, respondido_em
    ) values (
      p_professor_id, v_aulas.id, p_unidade_id, p_data,
      true, 'chamada_secretaria', now()
    )
    on conflict (aula_emusys_id, professor_id) do update
    set estava_presente = true,
        origem = 'chamada_secretaria',
        respondido_em = now();
  end loop;

  return jsonb_build_object(
    'registrado', true,
    'professor_id', p_professor_id,
    'data', p_data,
    'aulas_atualizadas', v_aulas_atualizadas,
    'hora_chegada', coalesce(p_hora_chegada::text, null),
    'hora_saida', coalesce(p_hora_saida::text, null)
  );
end;
$function$;

-- 2. Remover presenca do professor (toggle OFF)
create or replace function public.app_remover_presenca_professor_dia(
  p_professor_id integer,
  p_data date,
  p_unidade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario_id integer;
  v_aulas_afetadas integer := 0;
begin
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', p_unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  -- Remove ponto_confirmacoes
  delete from professor_ponto_confirmacoes
  where professor_id = p_professor_id
    and data_aula = p_data
    and unidade_id = p_unidade_id
    and origem = 'chamada_secretaria';

  -- Marca professor_presenca = 'ausente' nas aulas (evidencia de que o humano marcou)
  update aulas_emusys
  set professor_presenca = 'ausente'
  where professor_id = p_professor_id
    and data_aula = p_data
    and unidade_id = p_unidade_id
    and cancelada = false
    and categoria = 'normal';

  get diagnostics v_aulas_afetadas = row_count;

  return jsonb_build_object(
    'removido', true,
    'professor_id', p_professor_id,
    'data', p_data,
    'aulas_afetadas', v_aulas_afetadas
  );
end;
$function$;

-- 3. Falta do professor — cancela aulas sem aluno presente
create or replace function public.app_falta_professor_cancelar_aulas(
  p_professor_id integer,
  p_data date,
  p_unidade_id uuid,
  p_motivo text default 'Falta do professor'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario_id integer;
  v_aulas_canceladas integer := 0;
  v_aula record;
begin
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', p_unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  -- Marca professor como ausente
  update aulas_emusys
  set professor_presenca = 'ausente'
  where professor_id = p_professor_id
    and data_aula = p_data
    and unidade_id = p_unidade_id
    and cancelada = false
    and categoria = 'normal';

  -- Cancela aulas do professor que NAO tem nenhum aluno presente
  -- (se alguem ja foi marcado presente, a aula aconteceu — nao cancela)
  for v_aula in
    select ae.id
    from aulas_emusys ae
    where ae.professor_id = p_professor_id
      and ae.data_aula = p_data
      and ae.unidade_id = p_unidade_id
      and ae.cancelada = false
      and ae.categoria = 'normal'
      and not exists (
        select 1 from aluno_presenca ap
        where ap.aula_emusys_id = ae.id
          and ap.status_presenca = 'presente'
      )
  loop
    update aulas_emusys
    set cancelada = true,
        cancelada_motivo = p_motivo,
        cancelada_origem = 'agenda_secretaria',
        updated_at = now()
    where id = v_aula.id;
    v_aulas_canceladas := v_aulas_canceladas + 1;
  end loop;

  return jsonb_build_object(
    'canceladas', v_aulas_canceladas,
    'professor_id', p_professor_id,
    'data', p_data,
    'motivo', p_motivo
  );
end;
$function$;

-- Grants
revoke all on function public.app_registrar_presenca_professor_dia(integer, date, uuid, time, time) from public;
revoke all on function public.app_registrar_presenca_professor_dia(integer, date, uuid, time, time) from anon;
grant execute on function public.app_registrar_presenca_professor_dia(integer, date, uuid, time, time) to authenticated;

revoke all on function public.app_remover_presenca_professor_dia(integer, date, uuid) from public;
revoke all on function public.app_remover_presenca_professor_dia(integer, date, uuid) from anon;
grant execute on function public.app_remover_presenca_professor_dia(integer, date, uuid) to authenticated;

revoke all on function public.app_falta_professor_cancelar_aulas(integer, date, uuid, text) from public;
revoke all on function public.app_falta_professor_cancelar_aulas(integer, date, uuid, text) from anon;
grant execute on function public.app_falta_professor_cancelar_aulas(integer, date, uuid, text) to authenticated;
