-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.app_devolutivas_aguardando()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  return coalesce((
    select jsonb_agg(item order by item->>'aguardando_desde')
    from (
      select jsonb_build_object(
        'id', d.id, 'aluno_id', d.aluno_id, 'aluno_nome', al.nome,
        'aluno_primeiro_nome', split_part(btrim(al.nome), ' ', 1),
        'curso', c.nome, 'responsavel_nome', al.responsavel_nome,
        'idade_cadastrada', al.idade_atual, 'motivo', d.erro,
        'aguardando_desde', d.aguardando_desde
      ) as item
      from fabio_devolutivas d
      join alunos al on al.id = d.aluno_id
      left join cursos c on c.id = al.curso_id
      where d.professor_id = v_prof
        and d.status = 'aguardando_destinatario'
      order by d.aguardando_desde asc limit 100
    ) t
  ), '[]'::jsonb);
end; $$;

comment on function public.app_devolutivas_aguardando() is
'Devolutivas do professor logado paradas esperando ele dizer para quem mandar.';

create or replace function public.app_devolutiva_definir_destinatario(p_id uuid, p_destinatario text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_prof integer := public.fn_professor_do_usuario(); v_afetadas integer;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  if p_destinatario not in ('responsavel','aluno') then
    raise exception 'Destinatário inválido: % (use responsavel ou aluno)', p_destinatario;
  end if;
  update fabio_devolutivas
     set destinatario_override    = p_destinatario,
         destinatario_origem      = 'professor',
         destinatario_decidido_por = v_prof,
         destinatario_decidido_em = now(),
         status                   = 'pendente',
         aguardando_desde         = null,
         erro                     = null,
         proxima_tentativa_em     = null,
         tentativas               = 0,
         atualizado_em            = now()
   where id = p_id and professor_id = v_prof and status = 'aguardando_destinatario';
  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada_ou_nao_e_sua');
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'destinatario', p_destinatario);
end; $$;

comment on function public.app_devolutiva_definir_destinatario(uuid, text) is
'Professor decide o destinatario; a devolutiva volta pra fila para ser reescrita para quem vai ler.';

create or replace function public.fabio_devolutiva_expirar_aguardando(p_dias integer default 7)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare v_n integer; v_dias integer := greatest(1, coalesce(p_dias, 7));
begin
  update fabio_devolutivas
     set status        = 'descartada',
         erro          = coalesce(erro, '') || format(' [expirou apos %s dias sem decisao do professor]', v_dias),
         atualizado_em = now()
   where status = 'aguardando_destinatario'
     and aguardando_desde is not null
     and aguardando_desde < now() - make_interval(days => v_dias);
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

comment on function public.fabio_devolutiva_expirar_aguardando(integer) is
'Descarta o que ficou aguardando decisao alem do prazo. Chamada pelo worker de oferta.';

create or replace function public.fabio_devolutiva_marcar_entrega_incerta(p_dias integer default 3)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare v_n integer; v_dias integer := greatest(1, coalesce(p_dias, 3));
begin
  update fabio_devolutivas
     set status = 'entrega_incerta', atualizado_em = now()
   where status = 'oferecida'
     and oferecida_em is not null
     and oferecida_em < now() - make_interval(days => v_dias)
     and envio_confirmado_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

comment on function public.fabio_devolutiva_marcar_entrega_incerta(integer) is
'Oferecida ha dias e sem "ja mandei": a casa passa a saber que NAO sabe se chegou. Continua visivel pro professor.';

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
        and d.status in ('gerada','oferecida','entrega_incerta')
        and d.envio_confirmado_em is null
        and coalesce(nullif(btrim(d.texto_normal), ''), null) is not null
      order by d.criado_em desc limit 100
    ) t
  ), '[]'::jsonb);
end; $$;

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
   where id = p_id and professor_id = v_prof
     and status in ('gerada','oferecida','entrega_incerta');
  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada_ou_nao_e_sua');
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'acao', p_acao);
end; $$;

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
   where id = p_id and professor_id = v_prof
     and status in ('gerada','oferecida','entrega_incerta');
  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada_ou_nao_e_sua');
  end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end; $$;

revoke all on function public.app_devolutivas_aguardando()                      from public, anon;
revoke all on function public.app_devolutiva_definir_destinatario(uuid, text)   from public, anon;
revoke all on function public.app_devolutivas_pendentes()                       from public, anon;
revoke all on function public.app_devolutiva_marcar(uuid, text)                 from public, anon;
revoke all on function public.app_devolutiva_salvar_texto(uuid, text)           from public, anon;
grant execute on function public.app_devolutivas_aguardando()                    to authenticated, service_role;
grant execute on function public.app_devolutiva_definir_destinatario(uuid, text) to authenticated, service_role;
grant execute on function public.app_devolutivas_pendentes()                     to authenticated, service_role;
grant execute on function public.app_devolutiva_marcar(uuid, text)               to authenticated, service_role;
grant execute on function public.app_devolutiva_salvar_texto(uuid, text)         to authenticated, service_role;

revoke all on function public.fabio_devolutiva_expirar_aguardando(integer)       from public, anon, authenticated;
revoke all on function public.fabio_devolutiva_marcar_entrega_incerta(integer)   from public, anon, authenticated;
grant execute on function public.fabio_devolutiva_expirar_aguardando(integer)     to service_role;
grant execute on function public.fabio_devolutiva_marcar_entrega_incerta(integer) to service_role;
