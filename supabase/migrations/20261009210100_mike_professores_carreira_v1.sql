-- Mike: fachada read-only da carreira musical dos professores (bloco novo da Ficha Técnica).
-- Escopo decidido pelo Alf (2026-10-09): sem telefone, sem e-mail e sem o perfil
-- comportamental (temperamento/valorização/valores ficam de fora por natureza).
-- Devolve também quem ainda não preencheu (carreira_preenchida=false) para o
-- Mike saber de quem falta o bloco, sem precisar de segunda consulta.
-- Produção: NÃO aplicar sem revisão do gate. Rollback pareado em supabase/rollbacks/.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mike_mcp') then
    raise exception 'papel mike_mcp ausente; criar credencial fora desta migration';
  end if;
end $$;

create or replace function public.mike_professores_carreira_v1()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_resultado jsonb;
begin
  if session_user::text not in ('mike_mcp','postgres','supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;

  with profs as (
    select c.id,
           c.nome,
           c.apelido,
           c.cargo,
           c.foto_url,
           c.professor_id,
           c.situacao,
           u.nome as unidade_nome,
           ca.respostas,
           ca.preenchido_em,
           ca.updated_at,
           ca.versao
      from public.colaboradores c
      left join public.unidades u on u.id = c.unidade_id
      left join public.colaborador_carreira ca on ca.colaborador_id = c.id
     where lower(btrim(coalesce(c.departamento, ''))) = 'professores'
       and lower(btrim(coalesce(c.situacao, 'ativo'))) = 'ativo'
  ),
  linhas as (
    select p.*,
           coalesce(p.respostas is not null and p.respostas::text <> '{}', false) as preenchida
      from profs p
  )
  select jsonb_build_object(
    'ok', true,
    'versao', 'mike_professores_carreira_v1',
    'totais', jsonb_build_object(
      'professores', count(*),
      'com_carreira', count(*) filter (where preenchida),
      'sem_carreira', count(*) filter (where not preenchida)
    ),
    'professores', coalesce(jsonb_agg(jsonb_build_object(
      'colaborador_id', id,
      'professor_id', professor_id,
      'nome', nome,
      'apelido', apelido,
      'unidade', unidade_nome,
      'cargo', cargo,
      'foto_url', foto_url,
      'situacao', situacao,
      'carreira_preenchida', preenchida,
      'preenchido_em', preenchido_em,
      'atualizado_em', updated_at,
      'carreira', case when preenchida then jsonb_build_object(
        'bio', nullif(btrim(coalesce(respostas->>'bio_curta', '')), ''),
        'instrumentos_nivel', nullif(btrim(coalesce(respostas->>'instrumentos_nivel', '')), ''),
        'estilos', nullif(btrim(coalesce(respostas->>'estilos', '')), ''),
        'referencias', nullif(btrim(coalesce(respostas->>'referencias', '')), ''),
        'trajetoria', nullif(btrim(coalesce(respostas->>'trajetoria', '')), ''),
        'formacao', nullif(btrim(coalesce(respostas->>'formacao', '')), ''),
        'gosta_ensinar', nullif(btrim(coalesce(respostas->>'gosta_ensinar', '')), ''),
        'dica_mestre_temas', jsonb_strip_nulls(jsonb_build_array(
          nullif(btrim(coalesce(respostas->>'dica_mestre_1', '')), ''),
          nullif(btrim(coalesce(respostas->>'dica_mestre_2', '')), ''),
          nullif(btrim(coalesce(respostas->>'dica_mestre_3', '')), '')
        )),
        'instagram', nullif(btrim(coalesce(respostas->>'instagram', '')), ''),
        'youtube', nullif(btrim(coalesce(respostas->>'youtube', '')), ''),
        'outra_rede', nullif(btrim(coalesce(respostas->>'outra_rede', '')), ''),
        'topa_video_audio', nullif(respostas->>'topa_video_audio', '')
      ) end
    ) order by preenchida desc, lower(coalesce(apelido, nome))), '[]'::jsonb),
    'frescor', max(preenchido_em) filter (where preenchido_em is not null),
    'ressalvas', jsonb_build_array(
      'Sem telefone, sem e-mail e sem o perfil comportamental — decisão do Alf (2026-10-09).',
      'Dado autodeclarado pelo professor no bloco "Minha carreira na música" da Ficha Técnica; carreira_preenchida=false é quem ainda não preencheu.',
      'topa_video_audio é o consentimento declarado para gravar vídeo/áudio (sim_video_audio, so_video, so_audio, nao_topa); conferir antes de qualquer produção.',
      'Uso interno de marketing; revisar com o professor antes de publicar qualquer conteúdo.'
    )
  ) into v_resultado
  from linhas;

  return v_resultado;
end;
$$;

revoke all on function public.mike_professores_carreira_v1() from public, anon, authenticated;
grant execute on function public.mike_professores_carreira_v1() to mike_mcp, service_role;

comment on function public.mike_professores_carreira_v1() is
  'Mike: carreira musical autodeclarada dos professores ativos (Ficha Técnica, bloco novo). Sem telefone, e-mail ou perfil comportamental; inclui quem ainda não preencheu.';
