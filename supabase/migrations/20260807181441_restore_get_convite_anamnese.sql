-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.get_convite_anamnese(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_convite anamnese_convites%rowtype;
  v_unidade text;
begin
  if p_token is null or length(p_token) < 16 then
    return null;
  end if;

  select * into v_convite
    from anamnese_convites
   where token = p_token
     and usado_em is null
     and revogado_em is null
     and expira_em > now()
   limit 1;

  if not found then
    return null;
  end if;

  select nome into v_unidade from unidades where id = v_convite.unidade_id;

  -- Whitelist deliberada: so o minimo que o formulario precisa para funcionar.
  return jsonb_build_object(
    'nome_aluno',      v_convite.nome_aluno,
    'tipo_formulario', v_convite.tipo_formulario,
    'unidade_nome',    v_unidade,
    'data_nascimento', v_convite.data_nascimento,
    'expira_em',       v_convite.expira_em
  );
end;
$$;

grant execute on function public.get_convite_anamnese(text) to anon, authenticated;
