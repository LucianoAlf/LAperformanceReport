-- 2026-08-12 — Presença do professor no grão da aula (ajuste fino)
--
-- O modal do professor (ProfessorPresencaToggle) fazia UPDATE direto em
-- aulas_emusys.professor_presenca — e a tabela não tem policy de UPDATE para
-- authenticated (só SELECT). O ajuste fino falhava por RLS.
--
-- Padrão do projeto: RPC security definer validando `agenda.chamada` por
-- unidade, igual app_registrar_presenca_professor_dia. Nada de UPDATE direto.

create or replace function public.app_marcar_presenca_professor_aula(
  p_aula_emusys_id integer,
  p_presente boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id integer;
  v_aula public.aulas_emusys%rowtype;
begin
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  select * into v_aula from public.aulas_emusys where id = p_aula_emusys_id;
  if not found then
    raise exception 'aula_nao_encontrada';
  end if;

  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_aula.unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  if coalesce(v_aula.cancelada, false) then
    raise exception 'aula_cancelada';
  end if;

  update public.aulas_emusys
  set professor_presenca = case when p_presente then 'presente' else 'ausente' end
  where id = v_aula.id;

  insert into public.professor_ponto_confirmacoes (
    professor_id, aula_emusys_id, unidade_id, data_aula,
    estava_presente, origem, respondido_em
  ) values (
    v_aula.professor_id, v_aula.id, v_aula.unidade_id, v_aula.data_aula,
    p_presente, 'chamada_secretaria', now()
  )
  on conflict (aula_emusys_id, professor_id) do update
  set estava_presente = excluded.estava_presente,
      origem = 'chamada_secretaria',
      respondido_em = now();

  return jsonb_build_object(
    'registrado', true,
    'aula_emusys_id', v_aula.id,
    'professor_presenca', case when p_presente then 'presente' else 'ausente' end
  );
end;
$$;

revoke all on function public.app_marcar_presenca_professor_aula(integer, boolean) from public, anon;
grant execute on function public.app_marcar_presenca_professor_aula(integer, boolean) to authenticated;
