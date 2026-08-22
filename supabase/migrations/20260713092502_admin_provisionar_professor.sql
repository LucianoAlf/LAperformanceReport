-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- PROVISIONAMENTO DE LOGIN DO PROFESSOR.
-- Hoje 1 de 47 professores ativos tem login (o Matheus). Sem isso nao existe rollout.
-- Cria: auth.users + auth.identities + public.usuarios + vinculo professores.usuario_id.
-- A identity com provider='email' e OBRIGATORIA — sem ela o login por senha falha silenciosamente.
--
-- SEGURANCA: service_role apenas. NUNCA authenticated/anon (seria escalada de privilegio).
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
  v_prof     public.professores%rowtype;
  v_auth_id  uuid;
  v_user_id  integer;
  v_email    text := lower(btrim(p_email));
  v_fone     text := regexp_replace(coalesce(p_telefone_whatsapp,''), '\D', '', 'g');
  v_unidade  uuid;
  v_colisao  text;
begin
  if length(coalesce(p_senha,'')) < 8 then
    raise exception 'senha_curta: minimo 8 caracteres';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido: %', v_email;
  end if;

  select * into v_prof from public.professores where id = p_professor_id;
  if not found then raise exception 'professor_% nao encontrado', p_professor_id; end if;
  if v_prof.usuario_id is not null then
    raise exception 'professor_ja_tem_login (usuario_id=%). Use admin_resetar_senha_professor.', v_prof.usuario_id;
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'email_ja_existe_no_auth: %', v_email;
  end if;

  -- WhatsApp: valida colisao ANTES (o bridge do Fabio usa os ultimos 11 digitos)
  if v_fone <> '' then
    if length(v_fone) < 10 then
      raise exception 'whatsapp_incompleto: % (precisa DDD + numero)', v_fone;
    end if;
    select string_agg(p2.nome, ', ') into v_colisao
    from public.professores p2
    where p2.id <> p_professor_id and coalesce(p2.ativo,true)
      and right(regexp_replace(coalesce(p2.telefone_whatsapp,''), '\D','','g'), 11) = right(v_fone, 11)
      and length(regexp_replace(coalesce(p2.telefone_whatsapp,''), '\D','','g')) >= 10;
    if v_colisao is not null then
      raise exception 'whatsapp_em_colisao: o numero % ja e de % — o Fabio nao saberia com quem esta falando', v_fone, v_colisao;
    end if;
  end if;

  -- unidade: a do professor, ou a unidade onde ele mais da aula
  v_unidade := v_prof.unidade_id;
  if v_unidade is null then
    select ae.unidade_id into v_unidade
    from public.aulas_emusys ae
    where ae.professor_id = p_professor_id and ae.unidade_id is not null
    group by ae.unidade_id order by count(*) desc limit 1;
  end if;

  v_auth_id := gen_random_uuid();

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_senha, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('email_verified', true, 'nome', v_prof.nome)
  );

  -- SEM esta linha o login por senha nao funciona (GoTrue exige a identity)
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at
  ) values (
    gen_random_uuid(), v_auth_id, v_auth_id::text, 'email',
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email,
                       'email_verified', false, 'phone_verified', false),
    now(), now(), null
  );

  insert into public.usuarios (nome, email, unidade_id, cargo, perfil, ativo, auth_user_id, telefone)
  values (v_prof.nome, v_email, v_unidade, 'Professor', 'professor', true, v_auth_id,
          nullif(v_fone,''))
  returning id into v_user_id;

  update public.professores
     set usuario_id = v_user_id,
         telefone_whatsapp = coalesce(nullif(v_fone,''), telefone_whatsapp)
   where id = p_professor_id;

  return jsonb_build_object(
    'ok', true,
    'professor_id', p_professor_id,
    'professor', v_prof.nome,
    'usuario_id', v_user_id,
    'auth_user_id', v_auth_id,
    'email', v_email,
    'whatsapp', nullif(v_fone,''),
    'unidade_id', v_unidade,
    'aviso', case when nullif(v_fone,'') is null
                  then 'SEM WhatsApp: o Fabio nao vai conseguir mandar briefing nem cobranca para este professor'
             end
  );
end
$function$;

revoke all on function public.admin_provisionar_professor(integer,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_provisionar_professor(integer,text,text,text) to service_role;

comment on function public.admin_provisionar_professor(integer,text,text,text) is
  'Cria login do professor (auth.users + identities + usuarios + vinculo). SO service_role. Valida colisao de WhatsApp antes, porque o bridge do Fabio identifica o professor pelos ultimos 11 digitos.';
