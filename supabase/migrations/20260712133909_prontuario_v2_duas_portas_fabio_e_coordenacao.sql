-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- BURACO FECHADO: a v1 aceitava p_professor_id = null (visao completa) e o fabio_agent tinha
-- grant nela. O Fabio podia passar null e ler o curso de outro professor. O escopo dependia do
-- agente "escolher" o parametro certo — outra vez confiando no comportamento do LLM.
-- Agora sao DUAS portas com donos diferentes.

-- 0) A logica, num lugar so
create or replace function public.fn_prontuario_aluno_interno(
  p_aluno_id     integer,
  p_professor_id integer,
  p_limite       integer
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
  if v_uni is null then raise exception 'aluno_nao_encontrado'; end if;

  -- IDENTIDADE: a pessoa, nao a linha de matricula. Chave segura = (unidade, emusys_student_id).
  if v_emusys is not null then
    select array_agg(a.id) into v_ids from public.alunos a
     where a.unidade_id = v_uni and a.emusys_student_id = v_emusys;
  else
    v_ids := array[p_aluno_id];   -- sem chave Emusys: NAO consolida por nome (homonimo)
  end if;

  if p_professor_id is not null then
    select array_agg(distinct public.fn_curso_base(v.curso_nome)) into v_cursos
    from public.vw_jornada_professor_atual v
    where v.professor_id = p_professor_id and v.aluno_id = any(v_ids);
    if v_cursos is null then raise exception 'aluno_fora_da_carteira_do_professor'; end if;
  end if;

  select jsonb_build_object(
    'aluno_id', p_aluno_id,
    'aluno_ids_da_pessoa', to_jsonb(v_ids),
    'escopo', case when p_professor_id is null then 'coordenacao' else 'professor' end,
    'cursos_no_escopo', coalesce(to_jsonb(v_cursos), 'null'::jsonb),
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
                 'data', d.data_aula, 'curso', d.curso_nome,
                 'professor', d.professor_nome, 'professor_id', d.professor_id,
                 'nr_da_aula', d.nr_da_aula, 'texto', d.texto,
                 'origem', d.origem, 'presenca', d.presenca) as x,
               d.data_aula
        from (
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
                 or public.fn_curso_base(ae.curso_nome) = any(v_cursos))
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

revoke all on function public.fn_prontuario_aluno_interno(integer,integer,integer) from public, anon, authenticated;

-- 1) PORTA DO FABIO — professor_id OBRIGATORIO (sem default, nao da pra "esquecer")
drop function if exists public.fabio_prontuario_aluno(integer,integer,integer);
create function public.fabio_prontuario_aluno(
  p_aluno_id integer, p_professor_id integer, p_limite integer default 40
)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if p_professor_id is null then
    raise exception 'professor_id_obrigatorio: o Fabio fala com professor e so pode ler os cursos DELE com este aluno.'
      using errcode = '42501';
  end if;
  return public.fn_prontuario_aluno_interno(p_aluno_id, p_professor_id, p_limite);
end $function$;

-- 2) PORTA DA COORDENACAO — pessoa inteira. O fabio_agent NAO recebe grant.
create or replace function public.coord_prontuario_aluno(
  p_aluno_id integer, p_limite integer default 60
)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  return public.fn_prontuario_aluno_interno(p_aluno_id, null, p_limite);
end $function$;

comment on function public.fabio_prontuario_aluno(integer,integer,integer) is
  'Prontuario ESCOPADO. professor_id obrigatorio. O Fabio nunca ve curso de outro professor.';
comment on function public.coord_prontuario_aluno(integer,integer) is
  'Prontuario COMPLETO da pessoa. So coordenacao (service_role). NAO conceder ao fabio_agent.';

revoke all on function public.fabio_prontuario_aluno(integer,integer,integer) from public, anon, authenticated;
revoke all on function public.coord_prontuario_aluno(integer,integer)        from public, anon, authenticated;
grant execute on function public.fabio_prontuario_aluno(integer,integer,integer) to service_role;
grant execute on function public.coord_prontuario_aluno(integer,integer)        to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname='fabio_agent') then
    execute 'grant execute on function public.fabio_prontuario_aluno(integer,integer,integer) to fabio_agent';
    execute 'revoke all on function public.coord_prontuario_aluno(integer,integer) from fabio_agent';
    execute 'revoke select on public.vw_prontuario_aluno from fabio_agent';
  end if;
end $$;
