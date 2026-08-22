-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Ajuste: app_confirmar_registro passa a aceitar p_modo, para casar com os modos
-- 'novo'/'substituir'/'complementar' da registrar_aula_fabio.
-- Correção por voz de RASCUNHO (antes de confirmar) continua atuando no fabio_registros_aula.
-- Este p_modo é para a gravação FINAL na aula: 'novo' (padrão) na 1ª vez;
-- 'complementar'/'substituir' quando for ajuste de uma aula JÁ gravada.
create or replace function public.app_confirmar_registro(
  p_registro_id uuid,
  p_modo text default 'novo'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prof     integer := public.fn_professor_do_usuario();
  v_reg      public.fabio_registros_aula%rowtype;
  v_fatia    record;
  v_user_id  integer;
  v_gravadas integer := 0;
  v_puladas  integer := 0;
  v_pend     jsonb := '[]'::jsonb;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  if p_modo not in ('novo','substituir','complementar') then
    raise exception 'Modo inválido: % (use novo, substituir ou complementar)', p_modo;
  end if;
  select u.id into v_user_id from public.usuarios u where u.auth_user_id = auth.uid();

  select * into v_reg from public.fabio_registros_aula
   where id = p_registro_id and parent_id is null;
  if not found then raise exception 'Registro % não encontrado', p_registro_id; end if;
  if v_reg.professor_id is distinct from v_prof then
    raise exception 'Registro não pertence a este professor';
  end if;
  if v_reg.status not in ('rascunho','aguardando_confirmacao') then
    raise exception 'Status % não permite confirmação', v_reg.status;
  end if;

  if v_reg.aluno_id is not null then
    -- aula individual
    if coalesce(btrim(v_reg.texto_consolidado),'') = '' then
      raise exception 'Registro sem texto consolidado';
    end if;
    perform public.registrar_aula_fabio(
      p_aula_id => v_reg.aula_id, p_texto => v_reg.texto_consolidado,
      p_origem => v_reg.origem, p_professor_id => v_reg.professor_id, p_modo => p_modo);
    v_gravadas := 1;
    update public.fabio_registros_aula
       set status='gravado_emusys', confirmado_em=now(), confirmado_por=v_user_id
     where id = p_registro_id;
  else
    -- turma: tronco + fatias, grava na aula de CADA aluno
    for v_fatia in
      select * from public.fabio_registros_aula where parent_id = p_registro_id
    loop
      if coalesce(v_fatia.campos->>'presenca','presente') = 'ausente' then
        v_puladas := v_puladas + 1;
        update public.fabio_registros_aula
           set status='confirmado', confirmado_em=now(), confirmado_por=v_user_id
         where id = v_fatia.id;
      elsif v_fatia.aula_id is null
            or coalesce(btrim(v_fatia.texto_consolidado),'') = '' then
        v_pend := v_pend || jsonb_build_object(
          'fatia_id', v_fatia.id, 'aluno_id', v_fatia.aluno_id,
          'motivo', case when v_fatia.aula_id is null then 'sem aula vinculada' else 'sem texto' end);
      else
        perform public.registrar_aula_fabio(
          p_aula_id => v_fatia.aula_id, p_texto => v_fatia.texto_consolidado,
          p_origem => v_fatia.origem, p_professor_id => v_reg.professor_id, p_modo => p_modo);
        v_gravadas := v_gravadas + 1;
        update public.fabio_registros_aula
           set status='gravado_emusys', confirmado_em=now(), confirmado_por=v_user_id
         where id = v_fatia.id;
      end if;
    end loop;

    if v_gravadas = 0 and jsonb_array_length(v_pend) > 0 then
      raise exception 'Nenhuma fatia gravável: %', v_pend::text;
    end if;

    update public.fabio_registros_aula
       set status = case when jsonb_array_length(v_pend) = 0 then 'gravado_emusys' else 'confirmado' end,
           confirmado_em = now(), confirmado_por = v_user_id
     where id = p_registro_id;
  end if;

  return jsonb_build_object('registro_id', p_registro_id, 'modo', p_modo,
                            'gravadas', v_gravadas, 'ausentes_puladas', v_puladas,
                            'pendencias', v_pend);
end $$;
revoke all on function public.app_confirmar_registro(uuid,text) from public, anon;
grant execute on function public.app_confirmar_registro(uuid,text) to authenticated;
