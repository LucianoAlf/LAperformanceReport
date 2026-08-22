-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- LICAO IMPORTADA DO LA ORGANIZER (Sprint 29 deles): comparar telefone por "ultimos 11 digitos"
-- NAO basta. O numero pode estar cadastrado com/sem 55 e com/sem o 9 do celular. La, a busca
-- falhava SILENCIOSAMENTE e o professor via "nao consegui enviar" sem saber por que.
-- Aqui: normalizamos os DOIS lados para uma forma canonica (DDD + 9 + 8 digitos).
create or replace function public.fn_celular_canonico(p_tel text)
returns text
language sql immutable parallel safe
as $function$
  with d as (select regexp_replace(coalesce(p_tel,''), '\D', '', 'g') as x),
  sem55 as (
    select case when length(x) >= 12 and left(x,2) = '55' then substr(x,3) else x end as x from d
  )
  select case
    when length(x) = 11 and substr(x,3,1) = '9' then x                       -- ja canonico
    when length(x) = 10 then substr(x,1,2) || '9' || substr(x,3)             -- celular antigo -> insere o 9
    when length(x) = 11 then x                                               -- fixo/estranho: deixa
    else nullif(x,'')
  end
  from sem55;
$function$;

create or replace function public.fn_professor_por_whatsapp(p_telefone text)
returns jsonb
language plpgsql stable security definer
set search_path = public, auth
as $function$
declare
  v_can  text := public.fn_celular_canonico(p_telefone);
  v_ids  integer[];
  v_id   integer;
  v_nome text; v_email text; v_auth uuid; v_fone text;
begin
  if v_can is null or length(v_can) < 10 then
    return jsonb_build_object('ok', false, 'motivo', 'numero_incompleto');
  end if;

  select array_agg(p.id) into v_ids
  from public.professores p
  where coalesce(p.ativo,true)
    and public.fn_celular_canonico(p.telefone_whatsapp) = v_can;

  if v_ids is null then
    return jsonb_build_object('ok', false, 'motivo', 'numero_nao_cadastrado');
  end if;
  if array_length(v_ids,1) > 1 then
    -- NUNCA adivinhar: logar na carteira errada seria pior que nao logar
    return jsonb_build_object('ok', false, 'motivo', 'numero_em_colisao', 'professor_ids', to_jsonb(v_ids));
  end if;

  v_id := v_ids[1];
  select p.nome, p.telefone_whatsapp, u.email, u.auth_user_id
    into v_nome, v_fone, v_email, v_auth
  from public.professores p
  left join public.usuarios u on u.id = p.usuario_id
  where p.id = v_id;

  return jsonb_build_object(
    'ok', true,
    'professor_id', v_id,
    'nome', v_nome,
    'primeiro_nome', split_part(btrim(v_nome),' ',1),
    'email', v_email,
    -- e-mail sintetico quando nao houver: o e-mail NAO precisa ser caixa real (padrao LA Organizer)
    'email_sugerido', coalesce(v_email, '55' || v_can || '@la.internal'),
    'telefone_envio', '55' || v_can,          -- o numero para a UAZAPI (com 55)
    'tem_login', (v_auth is not null)
  );
end $function$;

revoke all on function public.fn_professor_por_whatsapp(text) from public, anon, authenticated;
revoke all on function public.fn_celular_canonico(text) from public, anon;
grant execute on function public.fn_professor_por_whatsapp(text) to service_role;
grant execute on function public.fn_celular_canonico(text) to authenticated, service_role;
