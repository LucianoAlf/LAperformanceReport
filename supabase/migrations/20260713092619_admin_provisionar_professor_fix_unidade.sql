-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.admin_provisionar_professor(
  p_professor_id integer,
  p_email        text,
  p_senha        text,
  p_telefone_whatsapp text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare
  v_nome     text;
  v_uid_atual integer;
  v_auth_id  uuid;
  v_user_id  integer;
  v_email    text := lower(btrim(p_email));
  v_fone     text := regexp_replace(coalesce(p_telefone_whatsapp,''), '\D', '', 'g');
  v_unidade  uuid;
  v_colisao  text;
begin
  if length(coalesce(p_senha,'')) < 8 then raise exception 'senha_curta: minimo 8 caracteres'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido: %', v_email; end if;

  select nome, usuario_id into v_nome, v_uid_atual from public.professores where id = p_professor_id;
  if v_nome is null then raise exception 'professor_% nao encontrado', p_professor_id; end if;
  if v_uid_atual is not null then
    raise exception 'professor_ja_tem_login (usuario_id=%)', v_uid_atual;
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'email_ja_existe_no_auth: %', v_email;
  end if;

  if v_fone <> '' then
    if length(v_fone) < 10 then
      raise exception 'whatsapp_incompleto: % (precisa DDD + numero)', v_fone;
    end if;
    select string_agg(p2.nome, ', ') into v_colisao
    from public.professores p2
    where p2.id <> p_professor_id and coalesce(p2.ativo,true)
      and length(regexp_replace(coalesce(p2.telefone_whatsapp,''), '\D','','g')) >= 10
      and right(regexp_replace(coalesce(p2.telefone_whatsapp,''), '\D','','g'), 11) = right(v_fone, 11);
    if v_colisao is not null then
      raise exception 'whatsapp_em_colisao: o numero % ja e de % — o Fabio nao saberia com quem esta falando', v_fone, v_colisao;
    end if;
  end if;

  -- unidade = onde ele mais deu aula nos ultimos 60 dias (professores nao tem unidade_id)
  select ae.unidade_id into v_unidade
  from public.aulas_emusys ae
  where ae.professor_id = p_professor_id and ae.unidade_id is not null
    and ae.data_aula >= now()::date - 60
  group by ae.unidade_id order by count(*) desc limit 1;

  v_auth_id := gen_random_uuid();

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_senha, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('email_verified', true, 'nome', v_nome)
  );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, created_at, updated_at
  ) values (
    gen_random_uuid(), v_auth_id, v_auth_id::text, 'email',
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email,
                       'email_verified', false, 'phone_verified', false),
    now(), now()
  );

  insert into public.usuarios (nome, email, unidade_id, cargo, perfil, ativo, auth_user_id, telefone)
  values (v_nome, v_email, v_unidade, 'Professor', 'professor', true, v_auth_id, nullif(v_fone,''))
  returning id into v_user_id;

  update public.professores
     set usuario_id = v_user_id,
         telefone_whatsapp = coalesce(nullif(v_fone,''), telefone_whatsapp)
   where id = p_professor_id;

  return jsonb_build_object(
    'ok', true, 'professor_id', p_professor_id, 'professor', v_nome,
    'usuario_id', v_user_id, 'auth_user_id', v_auth_id,
    'email', v_email, 'whatsapp', nullif(v_fone,''), 'unidade_id', v_unidade,
    'aviso', case when nullif(v_fone,'') is null
                  then 'SEM WhatsApp: o Fabio nao conseguira mandar briefing nem cobranca' end
  );
end
$function$;

revoke all on function public.admin_provisionar_professor(integer,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_provisionar_professor(integer,text,text,text) to service_role;
