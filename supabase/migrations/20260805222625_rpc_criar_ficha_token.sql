-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Cria a pessoa e o token numa chamada so, direto do front.
-- SECURITY DEFINER porque ficha_tokens e fechada por design (sem policy):
-- o token nunca pode ser lido pelo cliente, mas precisa ser devolvido
-- UMA vez para quem esta cadastrando.
--
-- PROVISORIO: o lugar certo disso e o Super Folha (RH). Fica aqui so
-- para destravar o teste com a candidata de Campo Grande.

CREATE OR REPLACE FUNCTION public.criar_ficha_pessoa(
  p_nome text,
  p_whatsapp text DEFAULT NULL,
  p_unidade_id integer DEFAULT NULL,
  p_departamento text DEFAULT 'Atendimento',
  p_situacao text DEFAULT 'candidato',
  p_cargo_contexto text DEFAULT 'ATENDIMENTO'
)
RETURNS TABLE (colaborador_id integer, token text, nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin boolean;
  v_id integer;
  v_token text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin'
  ) INTO v_admin;

  IF NOT v_admin THEN
    RAISE EXCEPTION 'Sem permissao para cadastrar pessoa';
  END IF;

  IF coalesce(trim(p_nome), '') = '' THEN
    RAISE EXCEPTION 'Nome e obrigatorio';
  END IF;

  INSERT INTO public.colaboradores
    (nome, apelido, tipo, departamento, unidade_id, whatsapp, situacao, ativo)
  VALUES
    (trim(p_nome), split_part(trim(p_nome), ' ', 1), 'farmer',
     p_departamento, p_unidade_id, nullif(trim(coalesce(p_whatsapp,'')), ''),
     p_situacao, true)
  RETURNING id INTO v_id;

  v_token := lower(regexp_replace(unaccent_imutavel(split_part(trim(p_nome),' ',1)), '[^a-z]', '', 'g'))
             || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

  INSERT INTO public.ficha_tokens (token, colaborador_id, cargo_contexto, ativo)
  VALUES (v_token, v_id, p_cargo_contexto, true);

  RETURN QUERY SELECT v_id, v_token, trim(p_nome);
END;
$$;

-- helper de acentuacao sem depender da extensao unaccent
CREATE OR REPLACE FUNCTION public.unaccent_imutavel(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(lower(t),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn');
$$;

REVOKE ALL ON FUNCTION public.criar_ficha_pessoa(text,text,integer,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.criar_ficha_pessoa(text,text,integer,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.criar_ficha_pessoa IS
  'PROVISORIO no LA Report. Cria colaborador + token da Ficha Tecnica e devolve o link. So admin. Destino final: Super Folha (RH).';
