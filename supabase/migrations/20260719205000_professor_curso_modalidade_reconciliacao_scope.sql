-- Gate 9: impede que pistas legadas sem unidade vazem professores fora do
-- escopo de edicao do usuario autenticado.

create or replace function public.get_professor_curso_modalidade_reconciliacao_v1(
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns table (
  atribuicao_id uuid,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  unidade_nome text,
  curso_id integer,
  curso_nome text,
  modalidade text,
  vigencia_inicio date,
  vigencia_fim date,
  status text,
  fonte text,
  confianca text,
  estado text,
  evidencias jsonb
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_data_local date := public.fn_professor_curso_modalidade_data_local_la_v1();
  v_usuario_id integer;
  v_unidade_id uuid;
begin
  v_usuario_id := public.fn_professor_curso_modalidade_ator_v1();

  if p_unidade_id is not null then
    v_unidade_id := p_unidade_id;
    if v_usuario_id is not null
       and not public.usuario_tem_permissao(
         v_usuario_id,
         'professores.editar',
         v_unidade_id
       ) then
      raise exception
        'PROFESSOR_CURSO_MODALIDADE_ACESSO_NEGADO: unidade sem professores.editar'
        using errcode = '42501';
    end if;
  end if;

  return query
  with evidencias_escopadas as (
    select e.*
    from public.fn_professor_curso_modalidade_evidencias_v1(
      v_data_local,
      p_unidade_id,
      p_professor_id
    ) e
    where (p_unidade_id is null or e.unidade_id = p_unidade_id)
      and (p_professor_id is null or e.professor_id = p_professor_id)
      and (
        v_usuario_id is null
        or public.usuario_tem_permissao(
          v_usuario_id,
          'professores.editar',
          e.unidade_id
        )
      )
  ),
  atribuicoes_escopadas as (
    select a.*
    from public.professor_unidade_curso_modalidade a
    where (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and (p_professor_id is null or a.professor_id = p_professor_id)
      and (
        v_usuario_id is null
        or public.usuario_tem_permissao(
          v_usuario_id,
          'professores.editar',
          a.unidade_id
        )
      )
  ),
  linhas_atribuicao as (
    select
      a.id as atribuicao_id,
      a.professor_id,
      p.nome::text as professor_nome,
      a.unidade_id,
      u.nome::text as unidade_nome,
      a.curso_id,
      curso.nome::text as curso_nome,
      a.modalidade,
      a.vigencia_inicio,
      a.vigencia_fim,
      a.status,
      a.fonte,
      a.confianca,
      case
        when a.status = 'ativo' then 'resolvido'
        else 'historico'
      end::text as estado,
      a.evidencias || jsonb_build_object(
        'sem_evidencia_atual',
        not exists (
          select 1
          from evidencias_escopadas e
          where e.materializavel
            and e.professor_id = a.professor_id
            and e.unidade_id = a.unidade_id
            and e.curso_id = a.curso_id
            and e.modalidade = a.modalidade
        )
      ) as evidencias
    from atribuicoes_escopadas a
    join public.professores p on p.id = a.professor_id
    join public.unidades u on u.id = a.unidade_id
    join public.cursos curso on curso.id = a.curso_id
  ),
  linhas_evidencia as (
    select
      null::uuid as atribuicao_id,
      e.professor_id,
      p.nome::text as professor_nome,
      e.unidade_id,
      u.nome::text as unidade_nome,
      e.curso_id,
      curso.nome::text as curso_nome,
      e.modalidade,
      e.vigencia_inicio,
      null::date as vigencia_fim,
      null::text as status,
      e.fonte,
      e.confianca,
      case
        when e.materializavel then 'pendente_materializacao'
        else e.estado
      end::text as estado,
      e.evidencias
    from evidencias_escopadas e
    join public.professores p on p.id = e.professor_id
    join public.unidades u on u.id = e.unidade_id
    left join public.cursos curso on curso.id = e.curso_id
    left join atribuicoes_escopadas ativa
      on ativa.professor_id = e.professor_id
     and ativa.unidade_id = e.unidade_id
     and ativa.curso_id = e.curso_id
     and ativa.modalidade = e.modalidade
     and ativa.status = 'ativo'
     and ativa.vigencia_fim is null
    where not e.materializavel or ativa.id is null
  ),
  pistas_professores_cursos as (
    select
      null::uuid as atribuicao_id,
      pc.professor_id,
      p.nome::text as professor_nome,
      null::uuid as unidade_id,
      null::text as unidade_nome,
      pc.curso_id,
      curso.nome::text as curso_nome,
      null::text as modalidade,
      null::date as vigencia_inicio,
      null::date as vigencia_fim,
      null::text as status,
      'manual'::text as fonte,
      'media'::text as confianca,
      'pista_professores_cursos_sem_escopo'::text as estado,
      jsonb_build_object(
        'professores_cursos_id', pc.id,
        'diagnostico_apenas', true,
        'motivo', 'pista_sem_unidade_e_sem_modalidade'
      ) as evidencias
    from public.professores_cursos pc
    join public.professores p on p.id = pc.professor_id
    join public.cursos curso on curso.id = pc.curso_id
    where p_unidade_id is null
      and (p_professor_id is null or pc.professor_id = p_professor_id)
      and (
        v_usuario_id is null
        or exists (
          select 1
          from public.professores_unidades pu
          where pu.professor_id = pc.professor_id
            and public.usuario_tem_permissao(
              v_usuario_id,
              'professores.editar',
              pu.unidade_id
            )
        )
      )
      and not coalesce(curso.is_projeto_banda, false)
      and not exists (
        select 1
        from atribuicoes_escopadas a
        where a.professor_id = pc.professor_id
          and a.curso_id = pc.curso_id
          and a.status = 'ativo'
          and a.vigencia_fim is null
      )
      and not exists (
        select 1
        from evidencias_escopadas e
        where e.professor_id = pc.professor_id
          and e.curso_id = pc.curso_id
          and e.materializavel
      )
  )
  select * from linhas_atribuicao
  union all
  select * from linhas_evidencia
  union all
  select * from pistas_professores_cursos
  order by
    professor_nome,
    unidade_nome nulls last,
    curso_nome,
    modalidade nulls last,
    vigencia_inicio nulls last;
end;
$$;

revoke all on function public.get_professor_curso_modalidade_reconciliacao_v1(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_professor_curso_modalidade_reconciliacao_v1(uuid, integer)
  to authenticated, service_role;

comment on function public.get_professor_curso_modalidade_reconciliacao_v1(uuid, integer) is
  'Fila auditavel de professor, unidade, curso e modalidade; pistas sem unidade respeitam o escopo professores.editar do chamador.';
