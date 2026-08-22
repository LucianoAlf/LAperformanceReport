-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.fabio_contexto_admin(p_usuario_id integer)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_nome text;
  v_perfil text;
  v_res jsonb;
  v_professores_por_unidade jsonb;
begin
  select nome, perfil
    into v_nome, v_perfil
  from public.usuarios
  where id = p_usuario_id
    and coalesce(ativo,true);

  if v_perfil is null or v_perfil <> 'admin' then
    return jsonb_build_object('ok', false, 'motivo', 'nao_e_admin');
  end if;

  select coalesce(jsonb_object_agg(unidade_nome, qtd order by unidade_nome), '{}'::jsonb)
    into v_professores_por_unidade
  from (
    select unidade_nome, count(distinct professor_id) as qtd
    from public.vw_fabio_carteira_professor
    where professor_id is not null
      and professor_nome is not null
      and unidade_nome is not null
    group by unidade_nome
  ) u;

  select jsonb_build_object(
    'ok', true,
    'usuario_id', p_usuario_id,
    'nome', v_nome,
    'primeiro_nome', split_part(btrim(v_nome),' ',1),
    'visao_geral', jsonb_build_object(
      'professores_ativos', (select count(*) from public.professores where coalesce(ativo,true)),
      'professores_por_unidade', v_professores_por_unidade,
      'professores_com_pendencia_cobravel', (
        select count(distinct professor_id) from public.vw_registro_pendencia where cobravel
      ),
      'total_aulas_pendentes_cobraveis', (
        select count(*) from public.vw_registro_pendencia where cobravel
      )
    )
  ) into v_res;

  return v_res;
end;
$function$;
