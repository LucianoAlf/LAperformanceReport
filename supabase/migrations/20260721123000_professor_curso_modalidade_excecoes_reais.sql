begin;

alter table public.curso_emusys_depara
  add column if not exists status_mapeamento text;

update public.curso_emusys_depara
   set status_mapeamento = 'mapeado'
 where curso_id is not null
   and status_mapeamento is distinct from 'mapeado';

-- Atividades operacionais do Emusys, sem curso local e sem jornada ativa.
-- Elas permanecem auditaveis no de-para, mas nao geram uma pendencia por
-- professor nem participam das metas do Health Score.
update public.curso_emusys_depara depara
   set status_mapeamento = 'fora_escopo'
  from public.unidades unidade
 where unidade.id = depara.unidade_id
   and depara.curso_id is null
   and (
     (
       unidade.nome = 'Barra'
       and depara.emusys_disciplina_id in (28, 29, 31)
       and depara.emusys_nome in ('Circuito Musical', 'Visita Musical')
     )
     or (
       unidade.nome = 'Recreio'
       and depara.emusys_disciplina_id = 28
       and depara.emusys_nome = 'Circuito'
     )
   );

update public.curso_emusys_depara
   set status_mapeamento = 'pendente'
 where curso_id is null
   and status_mapeamento is null;

alter table public.curso_emusys_depara
  alter column status_mapeamento set default 'pendente',
  alter column status_mapeamento set not null;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'curso_emusys_depara_status_mapeamento_check'
      and conrelid = 'public.curso_emusys_depara'::regclass
  ) then
    alter table public.curso_emusys_depara
      add constraint curso_emusys_depara_status_mapeamento_check
      check (status_mapeamento in ('pendente', 'mapeado', 'fora_escopo'));
  end if;
end;
$do$;

comment on column public.curso_emusys_depara.status_mapeamento is
  'Distingue disciplina pendente, mapeada e atividade explicitamente fora do Health Score.';

alter function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) rename to get_prof_curso_modalidade_excecoes_v2_raw;

revoke all on function public.get_prof_curso_modalidade_excecoes_v2_raw(
  uuid, integer, boolean
) from public, anon, authenticated;
grant execute on function public.get_prof_curso_modalidade_excecoes_v2_raw(
  uuid, integer, boolean
) to service_role;

create or replace function public.get_professor_curso_modalidade_excecoes_v2(
  p_unidade_id uuid default null,
  p_professor_id integer default null,
  p_incluir_auditoria boolean default false
)
returns table (
  excecao_id text,
  tipo text,
  acionavel boolean,
  unidade_id uuid,
  unidade_nome text,
  professor_id integer,
  professor_nome text,
  emusys_professor_id integer,
  curso_id integer,
  curso_nome text,
  emusys_disciplina_id integer,
  disciplina_nome text,
  modalidade text,
  motivo text,
  sugestao text,
  estado text,
  evidencias jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_usuario_id integer;
  v_servico boolean := (
    coalesce(auth.role(), '') = 'service_role'
    or session_user = 'postgres'
  );
begin
  if not v_servico then
    v_usuario_id := public.fn_professor_curso_modalidade_ator_v1();
  end if;

  if p_unidade_id is not null
     and not v_servico
     and not public.usuario_tem_permissao(
       v_usuario_id,
       'professores.editar',
       p_unidade_id
     ) then
    raise exception 'acesso_negado_unidade'
      using errcode = '42501';
  end if;

  return query
  with evidencias_raw as (
    select
      evidencia.*,
      coalesce(
        depara.status_mapeamento,
        case when depara.curso_id is not null then 'mapeado' else 'pendente' end
      ) as status_mapeamento
    from public.get_prof_curso_modalidade_excecoes_v2_raw(
      p_unidade_id,
      p_professor_id,
      p_incluir_auditoria
    ) evidencia
    left join public.curso_emusys_depara depara
      on depara.unidade_id = evidencia.unidade_id
     and depara.emusys_disciplina_id = evidencia.emusys_disciplina_id
  ),
  disciplinas_sem_depara as (
    select distinct on (
      evidencia.unidade_id,
      evidencia.emusys_disciplina_id
    )
      md5(concat_ws(
        ':',
        'disciplina_sem_depara',
        evidencia.unidade_id,
        evidencia.emusys_disciplina_id
      )) as excecao_id,
      'disciplina_sem_depara'::text as tipo,
      true as acionavel,
      evidencia.unidade_id,
      evidencia.unidade_nome,
      null::integer as professor_id,
      null::text as professor_nome,
      null::integer as emusys_professor_id,
      null::integer as curso_id,
      null::text as curso_nome,
      evidencia.emusys_disciplina_id,
      evidencia.disciplina_nome,
      evidencia.modalidade,
      'Disciplina oficial ainda nao possui de-para para um curso local.'::text as motivo,
      'Classificar a disciplina uma unica vez; nao refazer os vinculos dos professores.'::text as sugestao,
      'pendente'::text as estado,
      evidencia.evidencias || jsonb_build_object(
        'atribuicoes_afetadas',
        count(*) over (
          partition by evidencia.unidade_id, evidencia.emusys_disciplina_id
        )
      ) as evidencias
    from evidencias_raw evidencia
    where evidencia.estado = 'disciplina_sem_depara'
      and evidencia.status_mapeamento = 'pendente'
    order by
      evidencia.unidade_id,
      evidencia.emusys_disciplina_id,
      evidencia.professor_nome nulls last
  ),
  demais as (
    select
      evidencia.excecao_id,
      evidencia.tipo,
      evidencia.acionavel,
      evidencia.unidade_id,
      evidencia.unidade_nome,
      evidencia.professor_id,
      evidencia.professor_nome,
      evidencia.emusys_professor_id,
      evidencia.curso_id,
      evidencia.curso_nome,
      evidencia.emusys_disciplina_id,
      evidencia.disciplina_nome,
      evidencia.modalidade,
      evidencia.motivo,
      evidencia.sugestao,
      evidencia.estado,
      evidencia.evidencias
    from evidencias_raw evidencia
    where evidencia.tipo <> 'disciplina_sem_depara'
  ),
  todas as (
    select * from disciplinas_sem_depara
    union all
    select * from demais
  )
  select
    todas.excecao_id,
    todas.tipo,
    todas.acionavel,
    todas.unidade_id,
    todas.unidade_nome,
    todas.professor_id,
    todas.professor_nome,
    todas.emusys_professor_id,
    todas.curso_id,
    todas.curso_nome,
    todas.emusys_disciplina_id,
    todas.disciplina_nome,
    todas.modalidade,
    todas.motivo,
    todas.sugestao,
    todas.estado,
    todas.evidencias
  from todas
  where v_servico
     or public.usuario_tem_permissao(
       v_usuario_id,
       'professores.editar',
       todas.unidade_id
     )
  order by
    todas.acionavel desc,
    todas.unidade_nome,
    todas.professor_nome nulls last,
    todas.disciplina_nome nulls last;
end;
$function$;

revoke all on function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) from public, anon;
grant execute on function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) to authenticated, service_role;

comment on function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) is 'Fila operacional V2: uma excecao real por grao canonico, sem pistas legadas ou atividades fora do Health Score.';

commit;
