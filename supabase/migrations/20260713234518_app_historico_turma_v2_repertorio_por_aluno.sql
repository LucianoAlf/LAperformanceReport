-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- CORRECAO (Alf, 13/07): repertorio NEM SEMPRE e da turma toda. Ex: turma ensaiando pro
-- recital, cada aluno canta uma musica diferente na mesma sessao. Nao e "geral com excecao",
-- e informacao genuinamente separada por aluno desde o inicio.
--
-- A v1 so mostrava repertorio do TRONCO (turma). Se cada aluno tem musica propria, a tela
-- mentiria por omissao. Agora traz os dois niveis juntos:
--   repertorio_turma     -> o que foi compartilhado (pode ser null, se tudo for individual)
--   repertorio_por_aluno -> [{aluno, repertorio}] sempre que a FATIA tiver o campo preenchido
create or replace function public.app_historico_turma(p_turma_nome text, p_limite integer default 15)
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_res  jsonb;
begin
  if v_prof is null then raise exception 'sem_professor_vinculado' using errcode='42501'; end if;

  if not exists (select 1 from public.aulas_emusys ae
                  where ae.turma_nome = p_turma_nome and ae.professor_id = v_prof) then
    raise exception 'turma_nao_encontrada_ou_nao_e_sua' using errcode='42501';
  end if;

  select jsonb_build_object(
    'turma_nome', p_turma_nome,
    'curso', (select ae.curso_nome from public.aulas_emusys ae
               where ae.turma_nome=p_turma_nome and ae.professor_id=v_prof
               order by ae.data_aula desc limit 1),
    'alunos_atuais', coalesce((
      select jsonb_agg(distinct a.nome order by a.nome)
      from public.aulas_emusys ae
      join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id
      join public.alunos a on a.id = r.aluno_id
      where ae.turma_nome = p_turma_nome and ae.professor_id = v_prof
        and ae.data_aula >= now()::date - 14
    ), '[]'::jsonb),
    'sessoes', coalesce((
      select jsonb_agg(t.x order by t.data_aula desc)
      from (
        select jsonb_build_object(
                 'data', ae.data_aula,
                 'objetivo',        nullif(btrim(coalesce(reg.campos->>'objetivo','')),''),
                 'conteudo',        nullif(btrim(coalesce(reg.campos->>'atividades','')),''),
                 'dever_casa',      nullif(btrim(coalesce(reg.campos->>'dever_casa','')),''),
                 -- repertorio COMPARTILHADO (pode ser null se tudo for individual)
                 'repertorio_turma', nullif(btrim(coalesce(reg.campos->>'repertorio','')),''),
                 -- repertorio INDIVIDUAL (uma linha por aluno que tiver o campo preenchido na fatia)
                 'repertorio_por_aluno', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'aluno', a.nome,
                            'primeiro_nome', split_part(btrim(a.nome),' ',1),
                            'repertorio', fat.campos->>'repertorio')
                          order by a.nome)
                   from public.fabio_registros_aula fat
                   join public.alunos a on a.id = fat.aluno_id
                   where fat.parent_id = reg.id
                     and nullif(btrim(coalesce(fat.campos->>'repertorio','')),'') is not null
                 ), '[]'::jsonb),
                 'origem',       case when reg.id is not null then 'fabio' else 'emusys' end,
                 'texto_legado', case when reg.id is null
                                      then nullif(btrim(coalesce(ae.anotacoes,'')),'') end
               ) as x,
               ae.data_aula
        from public.aulas_emusys ae
        left join public.fabio_registros_aula reg
               on reg.aula_id = ae.id and reg.parent_id is null
        where ae.turma_nome = p_turma_nome and ae.professor_id = v_prof
          and coalesce(ae.cancelada,false) = false
          and (
            reg.id is not null
            or nullif(btrim(coalesce(ae.anotacoes,'')),'') is not null
          )
        order by ae.data_aula desc
        limit greatest(coalesce(p_limite,15),1)
      ) t
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end
$function$;

revoke all on function public.app_historico_turma(text,integer) from public, anon;
grant execute on function public.app_historico_turma(text,integer) to authenticated;
