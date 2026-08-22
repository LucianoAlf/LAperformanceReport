-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- PORTA CANONICA DO FABIO PARA O PRONTUARIO.
-- A vw_prontuario_aluno continua existindo (coordenacao/Lia leem a pessoa inteira),
-- mas o Fabio, que fala com PROFESSOR, precisa de escopo em SQL — nao em regra de prompt.
-- Resolve tres problemas da leitura direta da view:
--   1) DUPLICACAO: a mesma anotacao aparece na linha de turma + individual, e a pessoa tem
--      varios alunos.id (Valentina: 3). A view crua devolve 46 linhas de Canto para 13 datas.
--   2) VAZAMENTO: sem escopo, o Matheus leria o conteudo pedagogico do Alexandre (Teclado).
--      Regra do Alf, ja cravada em SQL na app_aluno_ficha. Aqui era so instrucao de skill.
--   3) NOME DE CURSO: "Canto" e "Canto T" virariam duas historias. Usa fn_curso_base.
create or replace function public.fabio_prontuario_aluno(
  p_aluno_id     integer,
  p_professor_id integer default null,   -- null = visao da coordenacao (pessoa inteira)
  p_limite       integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uni    uuid;
  v_emusys text;
  v_ids    integer[];
  v_cursos text[];
  v_res    jsonb;
begin
  select unidade_id, emusys_student_id into v_uni, v_emusys
  from public.alunos where id = p_aluno_id;

  if v_uni is null then
    raise exception 'aluno_nao_encontrado';
  end if;

  -- IDENTIDADE: a pessoa, nao a linha de matricula. Chave segura = (unidade, emusys_student_id).
  if v_emusys is not null then
    select array_agg(a.id) into v_ids from public.alunos a
     where a.unidade_id = v_uni and a.emusys_student_id = v_emusys;
  else
    v_ids := array[p_aluno_id];   -- sem chave Emusys: NAO consolida por nome (risco de homonimo)
  end if;

  -- ESCOPO: quando ha professor, so os cursos QUE ELE DA para essa pessoa
  if p_professor_id is not null then
    select array_agg(distinct public.fn_curso_base(v.curso_nome)) into v_cursos
    from public.vw_jornada_professor_atual v
    where v.professor_id = p_professor_id and v.aluno_id = any(v_ids);

    if v_cursos is null then
      raise exception 'aluno_fora_da_carteira_do_professor';
    end if;
  end if;

  select jsonb_build_object(
    'aluno_id', p_aluno_id,
    'aluno_ids_da_pessoa', to_jsonb(v_ids),
    'escopo', case when p_professor_id is null then 'coordenacao' else 'professor' end,
    'cursos_no_escopo', coalesce(to_jsonb(v_cursos), 'null'::jsonb),

    -- so os NOMES dos outros cursos. Zero conteudo pedagogico. Regra do Alf.
    'outros_cursos', coalesce((
      select jsonb_agg(distinct jsonb_build_object('curso', v2.curso_nome, 'professor', v2.professor_nome))
      from public.vw_jornada_professor_atual v2
      where v2.aluno_id = any(v_ids)
        and (p_professor_id is null or v2.professor_id is distinct from p_professor_id)
    ), '[]'::jsonb),

    'linha_do_tempo', coalesce((
      select jsonb_agg(t.x order by t.data_aula desc)
      from (
        select jsonb_build_object(
                 'data', d.data_aula,
                 'curso', d.curso_nome,
                 'professor', d.professor_nome,
                 'professor_id', d.professor_id,
                 'nr_da_aula', d.nr_da_aula,
                 'texto', d.texto,
                 'origem', d.origem,
                 'presenca', d.presenca
               ) as x,
               d.data_aula
        from (
          -- DEDUP: uma entrada por (data, curso canonico). Prefere a linha com professor.
          select distinct on (ae.data_aula, public.fn_curso_base(ae.curso_nome))
                 ae.data_aula, ae.curso_nome, ae.professor_nome, ae.professor_id, ae.nr_da_aula,
                 coalesce(nullif(btrim(ae.anotacoes_fabio),''), ae.anotacoes) as texto,
                 case when coalesce(btrim(ae.anotacoes_fabio),'') <> '' then 'fabio' else 'emusys' end as origem,
                 ap.status as presenca
          from public.aulas_emusys ae
          join public.aluno_presenca ap on ap.aula_emusys_id = ae.id
          where ap.aluno_id = any(v_ids)
            and coalesce(ae.cancelada,false) = false
            and coalesce(btrim(coalesce(ae.anotacoes_fabio, ae.anotacoes)),'') <> ''
            and (p_professor_id is null
                 or public.fn_curso_base(ae.curso_nome) = any(v_cursos))   -- <<< ESCOPO EM SQL
          order by ae.data_aula desc, public.fn_curso_base(ae.curso_nome),
                   (ae.professor_id is null), ae.id
        ) d
        order by d.data_aula desc
        limit greatest(coalesce(p_limite,40), 1)
      ) t
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end
$function$;

comment on function public.fabio_prontuario_aluno(integer,integer,integer) is
  'Prontuario do aluno para o Fabio. Escopo por professor aplicado EM SQL (nao confiar em regra de prompt). Deduplicado por data+curso canonico. Sem financeiro, sem anamnese.';

revoke all on function public.fabio_prontuario_aluno(integer,integer,integer) from public, anon, authenticated;
grant execute on function public.fabio_prontuario_aluno(integer,integer,integer) to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname='fabio_agent') then
    execute 'grant execute on function public.fabio_prontuario_aluno(integer,integer,integer) to fabio_agent';
  end if;
end $$;
