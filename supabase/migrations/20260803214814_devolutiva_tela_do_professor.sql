-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.app_devolutivas_pendentes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  return coalesce((
    select jsonb_agg(item order by item->>'criado_em')
    from (
      select jsonb_build_object(
        'id', d.id, 'aluno_id', d.aluno_id, 'aluno_nome', al.nome,
        'aluno_primeiro_nome', split_part(btrim(al.nome), ' ', 1),
        'curso', c.nome, 'destinatario', d.destinatario,
        'destinatario_nome', d.destinatario_nome, 'idade_na_geracao', d.idade_na_geracao,
        'texto_normal', d.texto_normal, 'texto_apoio_casa', d.texto_apoio_casa,
        'status', d.status, 'criado_em', d.criado_em, 'oferecida_em', d.oferecida_em,
        'copiada_em', d.copiada_em, 'editada_em', d.editada_em,
        'compartilhada_em', d.compartilhada_em, 'envio_confirmado_em', d.envio_confirmado_em
      ) as item
      from fabio_devolutivas d
      join alunos al on al.id = d.aluno_id
      left join cursos c on c.id = al.curso_id
      where d.professor_id = v_prof
        and d.status in ('gerada','oferecida')
        and d.envio_confirmado_em is null
        and coalesce(nullif(btrim(d.texto_normal), ''), null) is not null
      order by d.criado_em desc limit 100
    ) t
  ), '[]'::jsonb);
end; $$;

comment on function public.app_devolutivas_pendentes() is
'Devolutivas do professor logado ainda nao confirmadas como enviadas. Filtra por fn_professor_do_usuario().';

create or replace function public.app_devolutiva_marcar(p_id uuid, p_acao text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_prof integer := public.fn_professor_do_usuario(); v_afetadas integer;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  if p_acao not in ('copiada','editada','compartilhada','enviada') then
    raise exception 'Ação inválida: % (use copiada, editada, compartilhada ou enviada)', p_acao;
  end if;
  update fabio_devolutivas
     set copiada_em          = case when p_acao = 'copiada'       then coalesce(copiada_em, now())          else copiada_em end,
         editada_em          = case when p_acao = 'editada'       then now()                                else editada_em end,
         compartilhada_em    = case when p_acao = 'compartilhada' then coalesce(compartilhada_em, now())    else compartilhada_em end,
         envio_confirmado_em = case when p_acao = 'enviada'       then coalesce(envio_confirmado_em, now()) else envio_confirmado_em end,
         atualizado_em       = now()
   where id = p_id and professor_id = v_prof and status in ('gerada','oferecida');
  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada_ou_nao_e_sua');
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'acao', p_acao);
end; $$;

comment on function public.app_devolutiva_marcar(uuid, text) is
'Carimba copiada/editada/compartilhada/enviada. So na devolutiva do proprio professor.';

create or replace function public.app_devolutiva_salvar_texto(p_id uuid, p_texto text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_afetadas integer; v_texto text := btrim(coalesce(p_texto, ''));
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  if v_texto = '' then raise exception 'Texto vazio: para descartar use outra ação'; end if;
  update fabio_devolutivas
     set texto_normal = v_texto, editada_em = now(), atualizado_em = now()
   where id = p_id and professor_id = v_prof and status in ('gerada','oferecida');
  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada_ou_nao_e_sua');
  end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end; $$;

comment on function public.app_devolutiva_salvar_texto(uuid, text) is
'Salva a edicao do professor no texto_normal. So na devolutiva do proprio professor.';

revoke all on function public.app_devolutivas_pendentes()             from public, anon;
revoke all on function public.app_devolutiva_marcar(uuid, text)       from public, anon;
revoke all on function public.app_devolutiva_salvar_texto(uuid, text) from public, anon;
grant execute on function public.app_devolutivas_pendentes()             to authenticated, service_role;
grant execute on function public.app_devolutiva_marcar(uuid, text)       to authenticated, service_role;
grant execute on function public.app_devolutiva_salvar_texto(uuid, text) to authenticated, service_role;
