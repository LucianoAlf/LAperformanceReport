-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.app_minha_agenda(p_data date default current_date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then
    return jsonb_build_object('erro','sem_professor_vinculado');
  end if;
  return (
    select jsonb_build_object(
      'data', p_data,
      'total', count(*),
      'aulas', coalesce(jsonb_agg(to_jsonb(v) order by v.data_hora_inicio), '[]'::jsonb))
    from public.vw_fabio_aulas_contexto v
    where v.professor_id = v_prof and v.data_aula = p_data
  );
end $$;

create or replace function public.app_minha_carteira()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then
    return jsonb_build_object('erro','sem_professor_vinculado');
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'aluno_id', c.aluno_id, 'aluno_nome', c.aluno_nome, 'aluno_status', c.aluno_status,
      'curso', c.curso_nome, 'tipo_matricula', c.tipo_matricula_nome,
      'dia_aula', c.dia_aula, 'horario_aula', c.horario_aula,
      'responsavel', c.responsavel_nome, 'qualidade', c.qualidade_contexto
    ) order by c.aluno_nome), '[]'::jsonb)
    from public.vw_fabio_carteira_professor c
    where c.professor_id = v_prof
  );
end $$;

create or replace function public.app_meus_registros(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then return '[]'::jsonb; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.criado_em desc), '[]'::jsonb)
    from public.fabio_registros_aula r
    where r.professor_id = v_prof
      and r.parent_id is null
      and (p_status is null or r.status = p_status)
  );
end $$;

create or replace function public.app_confirmar_registro(p_registro_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_reg  public.fabio_registros_aula%rowtype;
  v_out  jsonb;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  select * into v_reg from public.fabio_registros_aula
   where id = p_registro_id and parent_id is null;
  if not found then raise exception 'Registro % não encontrado', p_registro_id; end if;
  if v_reg.professor_id is distinct from v_prof then
    raise exception 'Registro não pertence a este professor';
  end if;
  if v_reg.status not in ('rascunho','aguardando_confirmacao') then
    raise exception 'Registro em status % não pode ser confirmado', v_reg.status;
  end if;
  if v_reg.texto_consolidado is null or btrim(v_reg.texto_consolidado) = '' then
    raise exception 'Registro sem texto consolidado';
  end if;
  v_out := public.registrar_aula_fabio(
             p_aula_id      => v_reg.aula_id,
             p_texto        => v_reg.texto_consolidado,
             p_origem       => v_reg.origem,
             p_professor_id => v_reg.professor_id,
             p_modo         => 'novo');
  update public.fabio_registros_aula
     set status = 'gravado_emusys', confirmado_em = now(),
         confirmado_por = (select u.id from public.usuarios u where u.auth_user_id = auth.uid())
   where id = p_registro_id or parent_id = p_registro_id;
  return jsonb_build_object('registro_id', p_registro_id, 'gravacao', v_out);
end $$;

revoke all on function public.app_minha_agenda(date)            from public, anon;
revoke all on function public.app_minha_carteira()              from public, anon;
revoke all on function public.app_meus_registros(text)          from public, anon;
revoke all on function public.app_confirmar_registro(uuid)      from public, anon;
grant execute on function public.app_minha_agenda(date)         to authenticated;
grant execute on function public.app_minha_carteira()           to authenticated;
grant execute on function public.app_meus_registros(text)       to authenticated;
grant execute on function public.app_confirmar_registro(uuid)   to authenticated;
