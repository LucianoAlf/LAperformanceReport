-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 1) RESET ADMINISTRATIVO (a rede de segurança de hoje)
create or replace function public.admin_resetar_senha_professor(
  p_professor_id integer,
  p_nova_senha   text
)
returns jsonb
language plpgsql security definer
set search_path = public, auth, extensions
as $function$
declare v_auth uuid; v_email text; v_nome text;
begin
  if length(coalesce(p_nova_senha,'')) < 8 then
    raise exception 'senha_curta: minimo 8 caracteres';
  end if;

  select u.auth_user_id, u.email, p.nome into v_auth, v_email, v_nome
  from public.professores p
  join public.usuarios u on u.id = p.usuario_id
  where p.id = p_professor_id;

  if v_auth is null then
    raise exception 'professor_sem_login: use admin_provisionar_professor primeiro';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_nova_senha, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_auth;

  -- derruba as sessoes antigas: quem tinha a senha velha sai
  delete from auth.sessions where user_id = v_auth;
  delete from auth.refresh_tokens where user_id = v_auth::text;

  return jsonb_build_object('ok', true, 'professor', v_nome, 'email', v_email,
                            'sessoes_derrubadas', true);
end $function$;

revoke all on function public.admin_resetar_senha_professor(integer,text) from public, anon, authenticated;
grant execute on function public.admin_resetar_senha_professor(integer,text) to service_role;

-- 2) A PONTE DO LOGIN POR WHATSAPP (a Edge Function vai chamar isto)
-- Resolve o professor pelo numero, com os mesmos 11 digitos que o Fabio ja usa.
-- Recusa quando o numero pertence a mais de um professor (colisao) — nunca "chuta" quem e.
create or replace function public.fn_professor_por_whatsapp(p_telefone text)
returns jsonb
language plpgsql stable security definer
set search_path = public, auth
as $function$
declare
  v_fone text := regexp_replace(coalesce(p_telefone,''), '\D','','g');
  v_ids  integer[];
  v_id   integer;
  v_nome text; v_email text; v_auth uuid;
begin
  if length(v_fone) < 10 then
    return jsonb_build_object('ok', false, 'motivo', 'numero_incompleto');
  end if;

  select array_agg(p.id) into v_ids
  from public.professores p
  where coalesce(p.ativo,true)
    and length(regexp_replace(coalesce(p.telefone_whatsapp,''),'\D','','g')) >= 10
    and right(regexp_replace(coalesce(p.telefone_whatsapp,''),'\D','','g'), 11) = right(v_fone, 11);

  if v_ids is null then
    return jsonb_build_object('ok', false, 'motivo', 'numero_nao_cadastrado');
  end if;
  if array_length(v_ids,1) > 1 then
    -- NUNCA adivinhar: dois professores com o mesmo numero = risco de logar na carteira errada
    return jsonb_build_object('ok', false, 'motivo', 'numero_em_colisao', 'professor_ids', to_jsonb(v_ids));
  end if;

  v_id := v_ids[1];
  select p.nome, u.email, u.auth_user_id into v_nome, v_email, v_auth
  from public.professores p
  left join public.usuarios u on u.id = p.usuario_id
  where p.id = v_id;

  return jsonb_build_object(
    'ok', true,
    'professor_id', v_id,
    'nome', v_nome,
    'primeiro_nome', split_part(btrim(v_nome),' ',1),
    'email', v_email,
    'tem_login', (v_auth is not null),
    'motivo', case when v_auth is null then 'sem_login_ainda' end
  );
end $function$;

revoke all on function public.fn_professor_por_whatsapp(text) from public, anon, authenticated;
grant execute on function public.fn_professor_por_whatsapp(text) to service_role;

comment on function public.fn_professor_por_whatsapp(text) is
  'Resolve professor pelo WhatsApp (ultimos 11 digitos, mesmo bridge do Fabio). Base do login sem senha: a Edge Function chama isto, gera magic link e o Fabio entrega no WhatsApp. RECUSA colisao — nunca adivinha quem e.';
