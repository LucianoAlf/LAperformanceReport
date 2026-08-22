-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- v2: consolida DUAS correções numa migration versionada
--  (1) aluno_contatos.principal  (a coluna NUNCA se chamou is_principal — bug meu, hotfixado fora de migration)
--  (2) limit 10 DENTRO do subselect do histórico (antes cortava a linha do jsonb_agg = trazia tudo)
create or replace function public.app_aluno_ficha(p_aluno_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prof   integer := public.fn_professor_do_usuario();
  v_ok     boolean;
  v_nome   text;
  v_cursos text[];
  v_res    jsonb;
begin
  if v_prof is null then
    raise exception 'sem_professor_vinculado' using errcode='42501';
  end if;

  select exists(
    select 1 from public.vw_jornada_professor_atual v
    where v.professor_id = v_prof and v.aluno_id = p_aluno_id
  ) into v_ok;

  if not v_ok then
    raise exception 'aluno_fora_da_sua_carteira' using errcode='42501';
  end if;

  select nome into v_nome from public.alunos where id = p_aluno_id;

  select array_agg(distinct v.curso_nome) into v_cursos
  from public.vw_jornada_professor_atual v
  where v.professor_id = v_prof and v.aluno_id = p_aluno_id;

  select jsonb_build_object(
    'perfil', (
      select jsonb_build_object(
        'aluno_id', a.id, 'nome', a.nome, 'foto_url', a.foto_url,
        'idade', a.idade_atual, 'data_nascimento', a.data_nascimento,
        'classificacao', a.classificacao, 'modalidade', a.modalidade,
        'unidade', un.nome, 'data_matricula', a.data_matricula,
        'meses_de_casa', case when a.data_matricula is not null
             then floor((now()::date - a.data_matricula) / 30.44)::int end,
        'status', a.status,
        'is_retorno', a.is_aluno_retorno,
        'is_segundo_curso', a.is_segundo_curso
      )
      from public.alunos a
      left join public.unidades un on un.id = a.unidade_id
      where a.id = p_aluno_id
    ),
    'minha_jornada', coalesce((
      select jsonb_agg(jsonb_build_object(
        'curso', v.curso_nome,
        'aula_atual', v.nr_aulas_passadas + 1,
        'aulas_contratadas', v.nr_aulas_contratadas,
        'aulas_realizadas', v.nr_aulas_passadas,
        'jornada_label', v.jornada_label,
        'dia_aula', v.dia_semana, 'horario', v.horario,
        'status_matricula', v.status_matricula,
        'percentual', case when coalesce(v.nr_aulas_contratadas,0) > 0
            then round((v.nr_aulas_passadas::numeric / v.nr_aulas_contratadas)*100) end
      ))
      from public.vw_jornada_professor_atual v
      where v.professor_id = v_prof and v.aluno_id = p_aluno_id
    ), '[]'::jsonb),
    'outros_cursos', coalesce((
      select jsonb_agg(distinct jsonb_build_object('curso', v2.curso_nome, 'professor', v2.professor_nome))
      from public.vw_jornada_professor_atual v2
      where v2.aluno_nome = v_nome and v2.professor_id is distinct from v_prof
    ), '[]'::jsonb),
    'responsaveis', coalesce((
      select jsonb_agg(jsonb_build_object('nome', c.nome, 'parentesco', c.parentesco, 'principal', c.principal))
      from public.aluno_contatos c where c.aluno_id = p_aluno_id
    ), '[]'::jsonb),

    'presenca_recente', coalesce((
      select jsonb_agg(t.x order by t.data_aula desc) from (
        select jsonb_build_object('data', ae.data_aula, 'status', ap.status, 'curso', ae.curso_nome) as x, ae.data_aula
        from public.aluno_presenca ap
        join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
        where ap.aluno_id = p_aluno_id and ae.professor_id = v_prof
        order by ae.data_aula desc limit 10
      ) t
    ), '[]'::jsonb),

    'historico_pedagogico', coalesce((
      select jsonb_agg(u.x order by u.data_aula desc)
      from (
        select t.x, t.data_aula
        from (
          select distinct on (ae.data_aula)
            jsonb_build_object(
              'data', ae.data_aula,
              'curso', ae.curso_nome,
              'texto', coalesce(nullif(btrim(ae.anotacoes_fabio),''), ae.anotacoes),
              'origem', case when coalesce(btrim(ae.anotacoes_fabio),'') <> '' then 'fabio' else 'emusys' end,
              'foi_voce', (ae.professor_id = v_prof)
            ) as x,
            ae.data_aula
          from public.aulas_emusys ae
          join public.aluno_presenca ap on ap.aula_emusys_id = ae.id
          where ap.aluno_id = p_aluno_id
            and ae.curso_nome = any(v_cursos)
            and coalesce(btrim(coalesce(ae.anotacoes_fabio, ae.anotacoes)), '') <> ''
          order by ae.data_aula desc, (ae.professor_id is null), ae.id
        ) t
        order by t.data_aula desc
        limit 10
      ) u
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end
$function$;

revoke all on function public.app_aluno_ficha(integer) from public, anon;
grant execute on function public.app_aluno_ficha(integer) to authenticated;
