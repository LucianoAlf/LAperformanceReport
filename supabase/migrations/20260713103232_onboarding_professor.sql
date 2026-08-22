-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ONBOARDING DO PROFESSOR
-- 1) marca quem ja passou (o Fabio nao deve cobrar/briefar quem nunca abriu o app)
-- 2) o professor CONFIRMA o proprio WhatsApp — e o unico momento em que a gente conserta
--    o cadastro sem cacar numero. Sem WhatsApp certo, o Fabio nao fala com ele.
alter table public.professores
  add column if not exists onboarding_concluido_em timestamptz,
  add column if not exists whatsapp_confirmado_em  timestamptz;

-- O que o app precisa saber ao abrir pela primeira vez
create or replace function public.app_meu_onboarding()
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_r    record;
begin
  if v_prof is null then raise exception 'sem_professor_vinculado' using errcode='42501'; end if;

  select p.id, p.nome, split_part(btrim(p.nome),' ',1) as primeiro_nome,
         p.telefone_whatsapp, p.onboarding_concluido_em, p.whatsapp_confirmado_em,
         public.fn_celular_canonico(p.telefone_whatsapp) as fone_canonico,
         (select count(distinct v.aluno_id) from public.vw_jornada_professor_atual v
           where v.professor_id = p.id) as meus_alunos,
         (select count(distinct v.curso_nome) from public.vw_jornada_professor_atual v
           where v.professor_id = p.id) as meus_cursos
    into v_r
  from public.professores p where p.id = v_prof;

  return jsonb_build_object(
    'professor_id', v_r.id,
    'primeiro_nome', v_r.primeiro_nome,
    'concluido', (v_r.onboarding_concluido_em is not null),
    'precisa_confirmar_whatsapp', (v_r.whatsapp_confirmado_em is null),
    'whatsapp_sugerido', v_r.fone_canonico,      -- pre-preenche o campo; ele so confere
    'meus_alunos', v_r.meus_alunos,
    'meus_cursos', v_r.meus_cursos
  );
end $function$;

-- O professor confirma/corrige o proprio numero
create or replace function public.app_confirmar_meu_whatsapp(p_telefone text)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_can  text := public.fn_celular_canonico(p_telefone);
  v_col  text;
begin
  if v_prof is null then raise exception 'sem_professor_vinculado' using errcode='42501'; end if;
  if v_can is null or length(v_can) < 10 then
    raise exception 'whatsapp_incompleto: informe DDD + numero';
  end if;

  -- colisao: dois professores com o mesmo numero = o Fabio nao saberia com quem fala
  select string_agg(p2.nome, ', ') into v_col
  from public.professores p2
  where p2.id <> v_prof and coalesce(p2.ativo,true)
    and public.fn_celular_canonico(p2.telefone_whatsapp) = v_can;
  if v_col is not null then
    raise exception 'whatsapp_ja_usado: esse numero ja esta no cadastro de outro professor. Fala com a coordenacao.'
      using errcode='42501';
  end if;

  update public.professores
     set telefone_whatsapp = '55' || v_can,
         whatsapp_confirmado_em = now()
   where id = v_prof;

  return jsonb_build_object('ok', true, 'whatsapp', '55' || v_can);
end $function$;

create or replace function public.app_concluir_onboarding()
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then raise exception 'sem_professor_vinculado' using errcode='42501'; end if;
  update public.professores
     set onboarding_concluido_em = coalesce(onboarding_concluido_em, now())
   where id = v_prof;
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.app_meu_onboarding()            from public, anon;
revoke all on function public.app_confirmar_meu_whatsapp(text) from public, anon;
revoke all on function public.app_concluir_onboarding()        from public, anon;
grant execute on function public.app_meu_onboarding()            to authenticated;
grant execute on function public.app_confirmar_meu_whatsapp(text) to authenticated;
grant execute on function public.app_concluir_onboarding()        to authenticated;
