-- LAPE-19 — vinculo manual e convite raciocinam por pessoa.
-- Spec:  docs/superpowers/specs/2026-09-01-anamnese-por-pessoa-design.md
-- Plano: docs/superpowers/plans/2026-09-01-anamnese-por-pessoa.md (Task 4)
--
-- ⚠️ AS ASSINATURAS NAO MUDAM. Acrescentar parametro com DEFAULT criaria um
-- overload ambiguo e derrubaria o chamador posicional com "function is not
-- unique" -- foi o que aconteceu com upsert_lead em 11/08/2026 (21h de webhook
-- de leads quebrado, 22 leads perdidos).

create or replace function public.vincular_anamnese_aluno(p_anamnese_id integer, p_aluno_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_anam  anamneses%ROWTYPE;
  v_exist boolean;
  v_mesma boolean;
  v_chave text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM alunos WHERE id = p_aluno_id) INTO v_exist;
  IF NOT v_exist THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'aluno_inexistente');
  END IF;

  SELECT * INTO v_anam FROM anamneses WHERE id = p_anamnese_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'anamnese_inexistente');
  END IF;

  IF v_anam.aluno_id IS NOT NULL AND v_anam.aluno_id <> p_aluno_id THEN
    -- Outra matricula da MESMA pessoa ja esta coberta pela propagacao: responder
    -- erro seria mentira. Outra PESSOA continua recusado -- e o roubo de vinculo
    -- que esta recusa foi escrita para impedir.
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

  -- O espelho e responsabilidade de uma funcao so.
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

revoke execute on function public.vincular_anamnese_aluno(integer, integer) from public;
revoke execute on function public.vincular_anamnese_aluno(integer, integer) from anon;
grant execute on function public.vincular_anamnese_aluno(integer, integer) to authenticated, service_role;

-- gerar_convite_anamnese: unica mudanca e enxergar convite vivo da PESSOA.
-- Sem isso a secretaria gera dois links para o mesmo aluno em cursos diferentes,
-- e o problema volta por outra porta.
create or replace function public.gerar_convite_anamnese(
  p_tipo_formulario character varying,
  p_unidade_id uuid,
  p_nome_aluno text,
  p_aluno_id integer DEFAULT NULL::integer,
  p_telefone_aluno text DEFAULT NULL::text,
  p_data_nascimento date DEFAULT NULL::date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario usuarios%rowtype;
  v_convite anamnese_convites%rowtype;
  v_nome    text := btrim(coalesce(p_nome_aluno, ''));
  v_token   text;
  v_aluno_unidade uuid;
begin
  select * into v_usuario from usuarios where auth_user_id = auth.uid() and ativo = true;
  if not found then
    raise exception 'usuario nao autenticado' using errcode = '42501';
  end if;

  if v_usuario.perfil is distinct from 'admin'
     and v_usuario.unidade_id is distinct from p_unidade_id then
    raise exception 'unidade fora do alcance do usuario' using errcode = '42501';
  end if;

  if p_tipo_formulario not in ('EMLA', 'LAMK') then
    raise exception 'tipo_formulario invalido: %', p_tipo_formulario using errcode = '22023';
  end if;

  if v_nome = '' then
    raise exception 'nome_aluno obrigatorio' using errcode = '22023';
  end if;

  if p_aluno_id is not null then
    select unidade_id into v_aluno_unidade from alunos where id = p_aluno_id;
    if v_aluno_unidade is distinct from p_unidade_id then
      raise exception 'aluno nao pertence a unidade informada' using errcode = '42501';
    end if;
  end if;

  -- Ja existe convite vivo para esta PESSOA?
  select * into v_convite
    from anamnese_convites c
   where c.usado_em is null
     and c.revogado_em is null
     and (
       (p_aluno_id is not null and exists (
          select 1
            from public.vw_aluno_pessoa_chave v1, public.vw_aluno_pessoa_chave v2
           where v1.aluno_id = c.aluno_id
             and v2.aluno_id = p_aluno_id
             and v1.unidade_id = v2.unidade_id
             and v1.pessoa_chave = v2.pessoa_chave))
       or (p_aluno_id is null and c.aluno_id is null
           and lower(c.nome_aluno) = lower(v_nome)
           and c.unidade_id = p_unidade_id)
     )
   order by c.criado_em desc
   limit 1
   for update;

  if found then
    if v_convite.expira_em > now() then
      return jsonb_build_object(
        'token',       v_convite.token,
        'expira_em',   v_convite.expira_em,
        'reutilizado', true
      );
    end if;
    update anamnese_convites set revogado_em = now() where id = v_convite.id;
  end if;

  -- pgcrypto vive no schema extensions; search_path fica restrito a 'public',
  -- entao a funcao precisa ser chamada com o schema qualificado.
  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  insert into anamnese_convites (
    token, aluno_id, nome_aluno, telefone_aluno, data_nascimento,
    unidade_id, tipo_formulario, expira_em, criado_por
  ) values (
    v_token, p_aluno_id, v_nome, p_telefone_aluno, p_data_nascimento,
    p_unidade_id, p_tipo_formulario, now() + interval '7 days', v_usuario.id
  )
  returning * into v_convite;

  return jsonb_build_object(
    'token',       v_convite.token,
    'expira_em',   v_convite.expira_em,
    'reutilizado', false
  );
end;
$function$;

revoke execute on function public.gerar_convite_anamnese(character varying, uuid, text, integer, text, date) from public;
revoke execute on function public.gerar_convite_anamnese(character varying, uuid, text, integer, text, date) from anon;
grant execute on function public.gerar_convite_anamnese(character varying, uuid, text, integer, text, date) to authenticated, service_role;
