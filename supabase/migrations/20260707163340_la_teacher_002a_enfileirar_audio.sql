-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.app_enfileirar_audio(
  p_aula_id          integer,
  p_storage_path     text,
  p_duracao_segundos integer default null,
  p_registro_id      uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prof    integer := public.fn_professor_do_usuario();
  v_unidade uuid;
  v_id      uuid;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'storage_path obrigatório';
  end if;

  select unidade_id into v_unidade from public.aulas_emusys where id = p_aula_id;
  if not found then raise exception 'Aula % não encontrada', p_aula_id; end if;

  if p_registro_id is not null then
    perform 1 from public.fabio_registros_aula
     where id = p_registro_id and professor_id = v_prof
       and status in ('rascunho','aguardando_confirmacao');
    if not found then
      raise exception 'Registro % não encontrado/permitido para complemento', p_registro_id;
    end if;
  end if;

  insert into public.fabio_fila_audios
    (professor_id, unidade_id, aula_id, storage_path, duracao_segundos, origem, status)
  values (v_prof, v_unidade, p_aula_id, p_storage_path, p_duracao_segundos, 'app', 'pendente')
  returning id into v_id;

  if p_registro_id is not null then
    update public.fabio_registros_aula
       set campos = campos || jsonb_build_object('audio_complemento_id', v_id)
     where id = p_registro_id;
  end if;

  return jsonb_build_object('audio_id', v_id, 'status', 'pendente',
                            'modo', case when p_registro_id is null then 'novo' else 'complementar' end,
                            'registro_id', p_registro_id);
end $$;
revoke all on function public.app_enfileirar_audio(integer,text,integer,uuid) from public, anon;
grant execute on function public.app_enfileirar_audio(integer,text,integer,uuid) to authenticated;
