-- 20260918170100 — as funções de anamnese passam a exigir login de EQUIPE
-- ⚠️ GERADA por scripts/gerar-20260918170100.mjs a partir da definição VIVA.
--    Não editar à mão: regerar. Cada função confere o próprio md5 antes de ser
--    trocada e RECUSA aplicar se o LA Report tiver mexido nela depois.
--
-- A 20260918170000 fechou a TABELA. Esta fecha a porta ao lado, que era maior:
-- funções SECURITY DEFINER (passam por cima da RLS) com EXECUTE para
-- 'authenticated' e sem olhar QUEM chama. Medido num ensaio com o token de um
-- professor SEM unidade (BEGIN/ROLLBACK, 18/09/2026):
--
--   get_anamnese_aluno(aluno de OUTRA unidade)  → a anamnese inteira: filiação,
--       situação dos responsáveis, telefone, share_token, entrevistador,
--       diagnósticos, medicação. Qualquer um dos 11 professores, qualquer aluno.
--   buscar_anamneses_pendentes(aluno)           → as órfãs candidatas, com telefone
--   buscar_anamneses_pendentes_todas(null)      → as órfãs de todas as unidades
--   vincular_anamnese_aluno(...)                → executa (é ESCRITA)
--
-- QUEM CHAMA DE VERDADE (grep nos 3 repos + pg_stat_statements desde 15/09):
--   get_anamnese_aluno          LA Report ModalFichaAluno + site da anamnese WelcomeScreen  258x authenticated
--   buscar_anamneses_pendentes  LA Report ModalFichaAluno (botão "Buscar anamnese")           9x authenticated
--   buscar_anamnese_pendente    LA Report ModalNovoAluno e ComercialPage                        0x (no código)
--   vincular_anamnese_aluno     LA Report ModalFichaAluno                                       1x authenticated
--   Todos são telas de EQUIPE (admin/unidade). O app do professor não chama
--   nenhuma — lê o perfil por app_aluno_ficha → fn_anamnese_do_aluno.
--
-- O QUE MUDA: a primeira linha de cada uma dessas quatro passa a ser
-- fn_exigir_equipe_para_anamnese(): login com perfil admin/unidade passa;
-- professor recebe 42501. Chamada que não vem do login do app (service_role,
-- cron, papéis próprios de agente) passa como antes. O resto do corpo é
-- byte a byte o de hoje. Não muda o recorte por unidade da equipe (a função
-- nunca teve; a tabela tem) — fora do escopo deste achado.
--
-- ⚠️ ESTAS FUNÇÕES SÃO DO LA REPORT. Se eles fizerem "create or replace" a
-- partir do arquivo deles (20260902100000_get_anamnese_aluno,
-- 20260902103000_anamnese_vinculo_e_convite_por_pessoa,
-- 20260916190000_anamnese_busca_pendente_por_telefone; buscar_anamnese_pendente
-- não tem arquivo lá — nasceu no painel), a trava some sem ninguém ver. A mesma
-- linha precisa entrar no repo deles.

create or replace function public.fn_exigir_equipe_para_anamnese()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Quem não chega pelo login do app (service_role, cron, agentes com papel
  -- próprio) não é o alvo desta trava.
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return;
  end if;
  if exists (select 1 from public.usuarios u
              where u.auth_user_id = auth.uid()
                and u.perfil in ('admin', 'unidade')) then
    return;
  end if;
  raise exception 'anamnese_restrita_a_equipe'
    using errcode = '42501',
          hint = 'A anamnese completa é da equipe (perfil admin/unidade). O professor lê o perfil do aluno por app_aluno_ficha.';
end
$$;

revoke execute on function public.fn_exigir_equipe_para_anamnese() from public, anon, authenticated;

comment on function public.fn_exigir_equipe_para_anamnese() is
'Trava de entrada das funções que devolvem a anamnese completa: só login de equipe (admin/unidade) ou chamada interna. Professor → 42501. Ver migration 20260918170100.';

-- ── public.get_anamnese_aluno(integer) ────────────────────────────────────
do $conferir$ begin
  if md5((select prosrc from pg_proc where oid = 'public.get_anamnese_aluno(integer)'::regprocedure))
     not in ('10cfa5b76224e97e1d4d3798ab6cf152', 'f1108e26d355760641cb32d9d11a725f') then
    raise exception 'public.get_anamnese_aluno(integer) mudou no banco depois que esta migration foi gerada: regerar com scripts/gerar-20260918170100.mjs';
  end if;
end $conferir$;

CREATE OR REPLACE FUNCTION public.get_anamnese_aluno(p_aluno_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chave   text;
  v_unidade uuid;
  v_anam    public.anamneses%rowtype;
  v_curso   text;
  v_resp    jsonb;
  v_ant     jsonb;
begin
  perform public.fn_exigir_equipe_para_anamnese();  -- 18/09/2026: só login de equipe (20260918170100)
  select v.pessoa_chave, v.unidade_id into v_chave, v_unidade
    from public.vw_aluno_pessoa_chave v where v.aluno_id = p_aluno_id;

  if v_chave is null then
    return jsonb_build_object('anamnese', null, 'procedencia', null, 'anteriores', '[]'::jsonb);
  end if;

  select * into v_anam
    from public.anamneses
   where unidade_id = v_unidade and pessoa_chave = v_chave and status = 'completa'
   order by created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('anamnese', null, 'procedencia', null, 'anteriores', '[]'::jsonb);
  end if;

  select c.nome into v_curso
    from public.alunos a left join public.cursos c on c.id = a.curso_id
   where a.id = v_anam.aluno_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pergunta_numero', r.pergunta_numero,
           'resposta_posicao', r.resposta_posicao) order by r.pergunta_numero), '[]'::jsonb)
    into v_resp
    from public.anamnese_respostas_perfil r where r.anamnese_id = v_anam.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'created_at', x.created_at, 'tipo_formulario', x.tipo_formulario)
           order by x.created_at desc), '[]'::jsonb)
    into v_ant
    from public.anamneses x
   where x.unidade_id = v_unidade and x.pessoa_chave = v_chave
     and x.status = 'completa' and x.id <> v_anam.id;

  return jsonb_build_object(
    'anamnese', to_jsonb(v_anam) || jsonb_build_object('anamnese_respostas_perfil', v_resp),
    'procedencia', jsonb_build_object(
      'aluno_id', v_anam.aluno_id,
      'curso_nome', v_curso,
      'respondida_em', v_anam.created_at,
      'e_esta_matricula', v_anam.aluno_id = p_aluno_id
    ),
    'anteriores', v_ant
  );
end;
$function$;

-- ── public.buscar_anamneses_pendentes(integer) ────────────────────────────
do $conferir$ begin
  if md5((select prosrc from pg_proc where oid = 'public.buscar_anamneses_pendentes(integer)'::regprocedure))
     not in ('c396bdd6e9dfb98499a7d045d75b23c2', '4c6dc530de30859de449c9fedf14c4b0') then
    raise exception 'public.buscar_anamneses_pendentes(integer) mudou no banco depois que esta migration foi gerada: regerar com scripts/gerar-20260918170100.mjs';
  end if;
end $conferir$;

CREATE OR REPLACE FUNCTION public.buscar_anamneses_pendentes(p_aluno_id integer)
 RETURNS TABLE(anamnese_id integer, nome_aluno text, telefone_aluno text, tipo_formulario text, unidade_id uuid, unidade_nome text, temperamento_codinome text, created_at timestamp with time zone, match_score integer, match_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nome  text;
  v_unid  uuid;
  v_class text;
  v_first text;
begin
  perform public.fn_exigir_equipe_para_anamnese();  -- 18/09/2026: só login de equipe (20260918170100)
  select lower(btrim(al.nome)), al.unidade_id, al.classificacao
    into v_nome, v_unid, v_class
    from alunos al where al.id = p_aluno_id;

  if v_nome is null then
    return;
  end if;

  v_first := split_part(v_nome, ' ', 1);

  return query
  with chaves_do_aluno as (
    select distinct fn_normalizar_telefone_br_key(t) as k
      from (
        select a.telefone from alunos a where a.id = p_aluno_id
        union all
        select a.whatsapp from alunos a where a.id = p_aluno_id
        union all
        select a.responsavel_telefone from alunos a where a.id = p_aluno_id
        union all
        select c.telefone from aluno_contatos c where c.aluno_id = p_aluno_id
      ) f(t)
     where coalesce(btrim(t), '') <> ''
       and coalesce(fn_normalizar_telefone_br_key(t), '') <> ''
  ),
  sinais as (
    select
      an.id,
      an.nome_aluno::text        as s_nome_aluno,
      an.telefone_aluno::text    as s_telefone_aluno,
      an.tipo_formulario::text   as s_tipo_formulario,
      an.unidade_id              as s_unidade_id,
      u.nome::text               as s_unidade_nome,
      an.temperamento_codinome::text as s_temperamento_codinome,
      an.created_at              as s_created_at,
      exists (
        select 1 from chaves_do_aluno c
         where c.k = fn_normalizar_telefone_br_key(an.telefone_aluno)
      )                                              as telefone_confere,
      (lower(btrim(an.nome_aluno)) = v_nome)         as nome_exato,
      (lower(an.nome_aluno) like '%' || v_first || '%'
        or v_nome like '%' || lower(split_part(btrim(an.nome_aluno), ' ', 1)) || '%')
                                                     as primeiro_nome_bate,
      (an.unidade_id = v_unid)                       as mesma_unidade,
      (an.tipo_formulario = v_class)                 as tipo_bate
    from anamneses an
    left join unidades u on u.id = an.unidade_id
    where an.aluno_id is null
      and an.vinculo_status = 'pendente'
      and an.status = 'completa'
      and (
        an.unidade_id = v_unid
        or lower(btrim(an.nome_aluno)) = v_nome
        or lower(an.nome_aluno) like '%' || v_first || '%'
      )
  )
  select
    s.id,
    s.s_nome_aluno,
    s.s_telefone_aluno,
    s.s_tipo_formulario,
    s.s_unidade_id,
    s.s_unidade_nome,
    s.s_temperamento_codinome,
    s.s_created_at,
    (
      (case when s.telefone_confere then 50 else 0 end) +
      (case when s.nome_exato then 40 else 0 end) +
      (case when s.primeiro_nome_bate and not s.nome_exato then 15 else 0 end) +
      (case when s.mesma_unidade then 10 else 0 end) +
      (case when s.tipo_bate then 5 else 0 end)
    )::integer as s_match_score,
    (case
       when s.telefone_confere and s.nome_exato     then 'Telefone e nome conferem'
       when s.telefone_confere                      then 'Telefone confere'
       when s.nome_exato and s.mesma_unidade        then 'Nome e unidade conferem'
       when s.nome_exato                            then 'Mesmo nome (outra unidade)'
       when s.primeiro_nome_bate                    then 'Nome parecido'
       else 'Sem semelhanca - confira manualmente'
     end)::text as s_match_label
  from sinais s
  order by 9 desc, 8 desc
  limit 20;
end;
$function$;

-- ── public.buscar_anamnese_pendente(text,uuid) ────────────────────────────
do $conferir$ begin
  if md5((select prosrc from pg_proc where oid = 'public.buscar_anamnese_pendente(text,uuid)'::regprocedure))
     not in ('9559a86695a8f833ea82831d20d69bc1', '1eb56ef9ed7d148220e076d8d20d5446') then
    raise exception 'public.buscar_anamnese_pendente(text,uuid) mudou no banco depois que esta migration foi gerada: regerar com scripts/gerar-20260918170100.mjs';
  end if;
end $conferir$;

CREATE OR REPLACE FUNCTION public.buscar_anamnese_pendente(p_nome text, p_unidade_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  resultado JSON;
BEGIN
  perform public.fn_exigir_equipe_para_anamnese();  -- 18/09/2026: só login de equipe (20260918170100)
  SELECT json_build_object(
    'id', a.id,
    'nome_aluno', a.nome_aluno,
    'tipo_formulario', a.tipo_formulario,
    'temperamento_codinome', a.temperamento_codinome,
    'created_at', a.created_at
  ) INTO resultado
  FROM anamneses a
  WHERE a.vinculo_status = 'pendente'
    AND a.aluno_id IS NULL
    AND a.unidade_id = p_unidade_id
    AND LOWER(a.nome_aluno) LIKE LOWER('%' || p_nome || '%')
    AND a.status = 'completa'
  ORDER BY a.created_at DESC
  LIMIT 1;

  RETURN resultado;
END;
$function$;

-- ── public.vincular_anamnese_aluno(integer,integer) ───────────────────────
do $conferir$ begin
  if md5((select prosrc from pg_proc where oid = 'public.vincular_anamnese_aluno(integer,integer)'::regprocedure))
     not in ('7ecb0c4f5bb26ac583126c46aa062780', 'e6bb6e7749cd6bb88504754132fa715e') then
    raise exception 'public.vincular_anamnese_aluno(integer,integer) mudou no banco depois que esta migration foi gerada: regerar com scripts/gerar-20260918170100.mjs';
  end if;
end $conferir$;

CREATE OR REPLACE FUNCTION public.vincular_anamnese_aluno(p_anamnese_id integer, p_aluno_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anam  anamneses%ROWTYPE;
  v_exist boolean;
  v_mesma boolean;
  v_chave text;
BEGIN
  perform public.fn_exigir_equipe_para_anamnese();  -- 18/09/2026: só login de equipe (20260918170100)
  SELECT EXISTS(SELECT 1 FROM alunos WHERE id = p_aluno_id) INTO v_exist;
  IF NOT v_exist THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'aluno_inexistente');
  END IF;

  SELECT * INTO v_anam FROM anamneses WHERE id = p_anamnese_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'anamnese_inexistente');
  END IF;

  IF v_anam.aluno_id IS NOT NULL AND v_anam.aluno_id <> p_aluno_id THEN
    SELECT (v1.pessoa_chave = v2.pessoa_chave and v1.unidade_id = v2.unidade_id)
      INTO v_mesma
      FROM public.vw_aluno_pessoa_chave v1, public.vw_aluno_pessoa_chave v2
     WHERE v1.aluno_id = v_anam.aluno_id AND v2.aluno_id = p_aluno_id;

    IF coalesce(v_mesma, false) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'no_op', 'ja_vale_para_esta_pessoa',
        'anamnese_id', p_anamnese_id,
        'aluno_id_origem', v_anam.aluno_id,
        'tipo_formulario', v_anam.tipo_formulario
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'erro', 'ja_vinculada_a_outro_aluno',
                              'aluno_id_atual', v_anam.aluno_id);
  END IF;

  UPDATE anamneses
     SET aluno_id = p_aluno_id,
         vinculo_status = 'vinculado'
   WHERE id = p_anamnese_id;

  SELECT pessoa_chave INTO v_chave
    FROM public.vw_aluno_pessoa_chave WHERE aluno_id = p_aluno_id;

  PERFORM public.fn_sincronizar_anamnese_preenchida_pessoa(v_anam.unidade_id, v_chave);

  RETURN jsonb_build_object(
    'ok', true,
    'anamnese_id', p_anamnese_id,
    'aluno_id', p_aluno_id,
    'temperamento_codinome', v_anam.temperamento_codinome,
    'tipo_formulario', v_anam.tipo_formulario
  );
END;
$function$;

-- ── sem consumidor logado: sai o EXECUTE de quem tem login ──────────────────
-- buscar_anamneses_pendentes_todas: nenhuma tela chama (grep nos 3 repos; 0 chamadas
--   no pg_stat_statements desde 15/09; o próprio LA Report registrou "ZERO consumidores"
--   em 16/09). Devolvia as anamneses órfãs de TODAS as unidades a qualquer login.
-- get_professores_briefing_anamnese: só a edge notificar-anamnese chama, com service_role
--   (50 chamadas, 0 como authenticated).
-- Se aparecer consumidor, o conserto é um GRANT de uma linha — mas com a trava no corpo.
revoke execute on function public.buscar_anamneses_pendentes_todas(uuid) from public, anon, authenticated;
revoke execute on function public.get_professores_briefing_anamnese(integer) from public, anon, authenticated;
grant execute on function public.buscar_anamneses_pendentes_todas(uuid) to service_role;
grant execute on function public.get_professores_briefing_anamnese(integer) to service_role;
