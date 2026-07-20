-- Health Score Professor V3 - atribuicao formal por unidade, curso e modalidade.
-- Task 3: camada temporal aditiva, conciliacao auditavel e sem escrita remota
-- implicita. Jornada oficial prevalece sobre evidencias recentes de aula.

create table if not exists public.professor_unidade_curso_modalidade (
  id uuid primary key default gen_random_uuid(),
  professor_id integer not null
    references public.professores(id)
    on delete restrict,
  unidade_id uuid not null
    references public.unidades(id)
    on delete restrict,
  curso_id integer not null
    references public.cursos(id)
    on delete restrict,
  modalidade text not null
    check (modalidade in ('individual', 'turma')),
  vigencia_inicio date not null,
  vigencia_fim date,
  status text not null
    check (status in ('ativo', 'encerrado')),
  fonte text not null
    check (fonte in ('manual', 'jornada', 'aula', 'revisao')),
  confianca text not null
    check (confianca in ('alta', 'media', 'revisada')),
  revisado_por integer
    references public.usuarios(id)
    on delete restrict,
  revisado_em timestamptz,
  evidencias jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint professor_curso_modalidade_vigencia_chk
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  constraint professor_curso_modalidade_status_vigencia_chk
    check (
      (status = 'ativo' and vigencia_fim is null)
      or
      (status = 'encerrado' and vigencia_fim is not null)
    )
);

create unique index if not exists
  uq_professor_curso_modalidade_ativa_aberta
  on public.professor_unidade_curso_modalidade (
    professor_id,
    unidade_id,
    curso_id,
    modalidade
  )
  where status = 'ativo' and vigencia_fim is null;

create index if not exists
  idx_professor_curso_modalidade_unidade_professor
  on public.professor_unidade_curso_modalidade (
    unidade_id,
    professor_id,
    status,
    vigencia_fim
  );

create index if not exists
  idx_professor_curso_modalidade_professor_vigencia
  on public.professor_unidade_curso_modalidade (
    professor_id,
    vigencia_inicio,
    vigencia_fim
  );

create index if not exists
  idx_professor_curso_modalidade_grao_vigencia
  on public.professor_unidade_curso_modalidade (
    professor_id,
    unidade_id,
    curso_id,
    modalidade,
    vigencia_inicio,
    vigencia_fim
  );

create index if not exists
  idx_professor_curso_modalidade_curso_modalidade
  on public.professor_unidade_curso_modalidade (
    curso_id,
    modalidade,
    status
  );

create or replace function public.fn_professor_curso_modalidade_data_local_la_v1()
returns date
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.fn_professor_curso_modalidade_proteger_historico_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'PROFESSOR_CURSO_MODALIDADE_HISTORICO_IMUTAVEL: atribuicoes nao podem ser apagadas'
      using errcode = '23514';
  end if;

  if old.status = 'encerrado' or old.vigencia_fim is not null then
    raise exception
      'PROFESSOR_CURSO_MODALIDADE_HISTORICO_IMUTAVEL: atribuicao encerrada nao pode ser reescrita'
      using errcode = '23514';
  end if;

  if new.professor_id is distinct from old.professor_id
     or new.unidade_id is distinct from old.unidade_id
     or new.curso_id is distinct from old.curso_id
     or new.modalidade is distinct from old.modalidade
     or new.vigencia_inicio is distinct from old.vigencia_inicio then
    raise exception
      'PROFESSOR_CURSO_MODALIDADE_CHAVE_IMUTAVEL: revise encerrando e criando nova atribuicao'
      using errcode = '23514';
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_professor_curso_modalidade_proteger_historico
  on public.professor_unidade_curso_modalidade;
create trigger trg_professor_curso_modalidade_proteger_historico
before update or delete
on public.professor_unidade_curso_modalidade
for each row
execute function public.fn_professor_curso_modalidade_proteger_historico_v1();

create or replace function public.fn_professor_curso_modalidade_impedir_sobreposicao_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_data_local date := public.fn_professor_curso_modalidade_data_local_la_v1();
begin
  if new.vigencia_inicio > v_data_local then
    raise exception
      'PROFESSOR_CURSO_MODALIDADE_INVALIDO: vigencia_inicio futura nao e permitida'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      format(
        '%s|%s|%s|%s',
        new.professor_id,
        new.unidade_id,
        new.curso_id,
        new.modalidade
      ),
      0
    )
  );

  if exists (
    select 1
    from public.professor_unidade_curso_modalidade existente
    where existente.id is distinct from new.id
      and existente.professor_id = new.professor_id
      and existente.unidade_id = new.unidade_id
      and existente.curso_id = new.curso_id
      and existente.modalidade = new.modalidade
      and existente.vigencia_inicio
        <= coalesce(new.vigencia_fim, 'infinity'::date)
      and coalesce(existente.vigencia_fim, 'infinity'::date)
        >= new.vigencia_inicio
  ) then
    raise exception
      'PROFESSOR_CURSO_MODALIDADE_SOBREPOSICAO: vigencia sobrepoe atribuicao existente'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_professor_curso_modalidade_impedir_sobreposicao
  on public.professor_unidade_curso_modalidade;
create trigger trg_professor_curso_modalidade_impedir_sobreposicao
before insert or update
on public.professor_unidade_curso_modalidade
for each row
execute function public.fn_professor_curso_modalidade_impedir_sobreposicao_v1();

-- Resolve somente a identidade. A autorizacao acontece depois, unidade a
-- unidade, para nao exigir cumulativamente a permissao global do Health Score.
create or replace function public.fn_professor_curso_modalidade_ator_v1()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario_id integer;
begin
  if coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres' then
    return null;
  end if;

  select u.id
    into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.ativo = true
  limit 1;

  if v_usuario_id is null then
    raise exception
      'PROFESSOR_CURSO_MODALIDADE_ACESSO_NEGADO: usuario ativo nao encontrado'
      using errcode = '42501';
  end if;

  return v_usuario_id;
end;
$$;

-- Fonte unica usada tanto pelo diagnostico quanto pela materializacao. O
-- retorno inclui pendencias para que modalidade ausente e conflito entre aula
-- e jornada continuem visiveis sem virarem atribuicoes ativas.
create or replace function public.fn_professor_curso_modalidade_evidencias_v1(
  p_data_referencia date,
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns table (
  professor_id integer,
  unidade_id uuid,
  curso_id integer,
  modalidade text,
  fonte text,
  confianca text,
  vigencia_inicio date,
  estado text,
  materializavel boolean,
  evidencias jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with jornada_base as (
    select
      j.id as jornada_id,
      j.professor_id,
      j.unidade_id,
      j.curso_id,
      lower(btrim(j.payload_snapshot #>> '{disciplina,tipo}')) as modalidade,
      j.emusys_matricula_disciplina_id,
      j.emusys_disciplina_id,
      j.data_primeira_aula::date as data_primeira_aula,
      j.data_ultima_aula::date as data_ultima_aula,
      j.ultima_sincronizacao_emusys::date as data_sincronizacao,
      j.created_at::date as data_registro,
      vinculo.qualidade_vinculo,
      coalesce(curso.is_projeto_banda, false) as is_projeto_banda
    from public.aluno_jornada_matricula_disciplina j
    left join public.vw_professores_emusys_vinculos vinculo
      on vinculo.professor_id = j.professor_id
     and vinculo.unidade_id = j.unidade_id
     and (
       j.emusys_professor_id is null
       or vinculo.emusys_professor_id = j.emusys_professor_id
     )
    left join public.cursos curso
      on curso.id = j.curso_id
    where j.status_matricula = 'ativa'
      and (p_unidade_id is null or j.unidade_id = p_unidade_id)
      and (p_professor_id is null or j.professor_id = p_professor_id)
  ),
  jornada_validas as (
    select
      j.professor_id,
      j.unidade_id,
      j.curso_id,
      j.modalidade,
      coalesce(
        min(j.data_primeira_aula),
        min(j.data_registro),
        p_data_referencia
      ) as inicio_observado,
      jsonb_build_object(
        'linhas', count(*)::integer,
        'jornada_ids', jsonb_agg(j.jornada_id order by j.jornada_id),
        'matricula_disciplina_ids', coalesce(
          jsonb_agg(
            distinct j.emusys_matricula_disciplina_id
            order by j.emusys_matricula_disciplina_id
          ) filter (where j.emusys_matricula_disciplina_id is not null),
          '[]'::jsonb
        ),
        'disciplina_ids', coalesce(
          jsonb_agg(
            distinct j.emusys_disciplina_id
            order by j.emusys_disciplina_id
          ) filter (where j.emusys_disciplina_id is not null),
          '[]'::jsonb
        ),
        'data_primeira_aula_min', min(j.data_primeira_aula),
        'data_ultima_aula_max', max(j.data_ultima_aula),
        'data_sincronizacao_min', min(j.data_sincronizacao),
        'data_sincronizacao_max', max(j.data_sincronizacao)
      ) as evidencia_jornada
    from jornada_base j
    where j.professor_id is not null
      and j.curso_id is not null
      and j.modalidade in ('individual', 'turma')
      and j.qualidade_vinculo = 'vinculo_utilizavel'
      and not j.is_projeto_banda
    group by
      j.professor_id,
      j.unidade_id,
      j.curso_id,
      j.modalidade
  ),
  aula_base as (
    select
      a.id as aula_id,
      a.emusys_id as emusys_aula_id,
      a.professor_id,
      a.unidade_id,
      d.curso_id,
      lower(btrim(a.tipo::text)) as modalidade,
      a.data_aula,
      a.reagendada,
      a.justificada,
      d.emusys_disciplina_id as depara_emusys_disciplina_id,
      vinculo.qualidade_vinculo,
      coalesce(curso.is_projeto_banda, false) as is_projeto_banda
    from public.aulas_emusys a
    left join public.curso_emusys_depara d
      on d.unidade_id = a.unidade_id
     and d.emusys_disciplina_id = a.curso_emusys_id
    left join public.cursos curso
      on curso.id = d.curso_id
    left join public.vw_professores_emusys_vinculos vinculo
      on vinculo.professor_id = a.professor_id
     and vinculo.unidade_id = a.unidade_id
     and (
       a.emusys_professor_id is null
       or vinculo.emusys_professor_id = a.emusys_professor_id
     )
    where a.data_aula between p_data_referencia - 89 and p_data_referencia
      and lower(btrim(a.categoria::text)) = 'normal'
      and a.cancelada is not true
      and a.sem_acompanhamento is not true
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and (p_professor_id is null or a.professor_id = p_professor_id)
  ),
  aula_validas as (
    select
      a.professor_id,
      a.unidade_id,
      a.curso_id,
      a.modalidade,
      min(a.data_aula) as inicio_observado,
      jsonb_build_object(
        'linhas', count(*)::integer,
        'inicio_inferido', min(a.data_aula),
        'data_aula_max', max(a.data_aula),
        'aula_ids', jsonb_agg(a.aula_id order by a.aula_id),
        'emusys_aula_ids', jsonb_agg(a.emusys_aula_id order by a.emusys_aula_id),
        'reagendadas_incluidas', count(*) filter (where a.reagendada),
        'justificadas_incluidas', count(*) filter (where a.justificada),
        'depara_ids', jsonb_build_object(
          'unidade_id', a.unidade_id,
          'curso_id', a.curso_id,
          'emusys_disciplina_ids', coalesce(
            jsonb_agg(
              distinct a.depara_emusys_disciplina_id
              order by a.depara_emusys_disciplina_id
            ) filter (where a.depara_emusys_disciplina_id is not null),
            '[]'::jsonb
          )
        )
      ) as evidencia_aula
    from aula_base a
    where a.professor_id is not null
      and a.curso_id is not null
      and a.modalidade in ('individual', 'turma')
      and a.qualidade_vinculo = 'vinculo_utilizavel'
      and not a.is_projeto_banda
    group by
      a.professor_id,
      a.unidade_id,
      a.curso_id,
      a.modalidade
  ),
  jornada_candidatas as (
    select
      j.professor_id,
      j.unidade_id,
      j.curso_id,
      j.modalidade,
      'jornada'::text as fonte,
      'alta'::text as confianca,
      coalesce(j.inicio_observado, a.inicio_observado, p_data_referencia)
        as vigencia_inicio,
      'evidencia_jornada_alta'::text as estado,
      true as materializavel,
      jsonb_strip_nulls(jsonb_build_object(
        'regra_versao', 'professor_curso_modalidade_v1',
        'data_referencia', p_data_referencia,
        'prioridade', 'jornada_sobre_aula',
        'jornada', j.evidencia_jornada,
        'aula_mesma_modalidade', a.evidencia_aula
      )) as evidencias
    from jornada_validas j
    left join aula_validas a
      on a.professor_id = j.professor_id
     and a.unidade_id = j.unidade_id
     and a.curso_id = j.curso_id
     and a.modalidade = j.modalidade
  ),
  aula_candidatas as (
    select
      a.professor_id,
      a.unidade_id,
      a.curso_id,
      a.modalidade,
      'aula'::text as fonte,
      'media'::text as confianca,
      a.inicio_observado as vigencia_inicio,
      'evidencia_aula_media'::text as estado,
      true as materializavel,
      jsonb_build_object(
        'regra_versao', 'professor_curso_modalidade_v1',
        'data_referencia', p_data_referencia,
        'aula', a.evidencia_aula
      ) as evidencias
    from aula_validas a
    where not exists (
      select 1
      from jornada_validas j
      where j.professor_id = a.professor_id
        and j.unidade_id = a.unidade_id
        and j.curso_id = a.curso_id
    )
  ),
  aula_conflitos as (
    select
      a.professor_id,
      a.unidade_id,
      a.curso_id,
      a.modalidade,
      'aula'::text as fonte,
      'media'::text as confianca,
      a.inicio_observado as vigencia_inicio,
      'conflito_modalidade_jornada_aula'::text as estado,
      false as materializavel,
      jsonb_build_object(
        'regra_versao', 'professor_curso_modalidade_v1',
        'data_referencia', p_data_referencia,
        'motivo', 'jornada_alta_no_mesmo_curso_com_modalidade_oposta',
        'modalidade_jornada', j.modalidade,
        'jornada', j.evidencia_jornada,
        'aula', a.evidencia_aula
      ) as evidencias
    from aula_validas a
    join jornada_validas j
      on j.professor_id = a.professor_id
     and j.unidade_id = a.unidade_id
     and j.curso_id = a.curso_id
     and j.modalidade <> a.modalidade
    where not exists (
      select 1
      from jornada_validas mesma_modalidade
      where mesma_modalidade.professor_id = a.professor_id
        and mesma_modalidade.unidade_id = a.unidade_id
        and mesma_modalidade.curso_id = a.curso_id
        and mesma_modalidade.modalidade = a.modalidade
    )
  ),
  jornada_pendencias as (
    select
      j.professor_id,
      j.unidade_id,
      j.curso_id,
      case
        when j.modalidade in ('individual', 'turma') then j.modalidade
        else null
      end as modalidade,
      'jornada'::text as fonte,
      'alta'::text as confianca,
      coalesce(min(j.data_primeira_aula), min(j.data_registro), p_data_referencia)
        as vigencia_inicio,
      case
        when j.curso_id is null then 'curso_nao_resolvido'
        else 'modalidade_nao_resolvida'
      end::text as estado,
      false as materializavel,
      jsonb_build_object(
        'regra_versao', 'professor_curso_modalidade_v1',
        'data_referencia', p_data_referencia,
        'linhas', count(*)::integer,
        'modalidades_observadas', coalesce(
          jsonb_agg(distinct j.modalidade order by j.modalidade)
            filter (where j.modalidade is not null),
          '[]'::jsonb
        ),
        'data_primeira_aula_min', min(j.data_primeira_aula),
        'data_ultima_aula_max', max(j.data_ultima_aula)
      ) as evidencias
    from jornada_base j
    where j.professor_id is not null
      and j.qualidade_vinculo = 'vinculo_utilizavel'
      and not j.is_projeto_banda
      and (
        j.curso_id is null
        or j.modalidade not in ('individual', 'turma')
        or j.modalidade is null
      )
    group by
      j.professor_id,
      j.unidade_id,
      j.curso_id,
      case
        when j.modalidade in ('individual', 'turma') then j.modalidade
        else null
      end
  ),
  aula_pendencias as (
    select
      a.professor_id,
      a.unidade_id,
      a.curso_id,
      case
        when a.modalidade in ('individual', 'turma') then a.modalidade
        else null
      end as modalidade,
      'aula'::text as fonte,
      'media'::text as confianca,
      min(a.data_aula) as vigencia_inicio,
      case
        when a.curso_id is null then 'curso_nao_resolvido'
        else 'modalidade_nao_resolvida'
      end::text as estado,
      false as materializavel,
      jsonb_build_object(
        'regra_versao', 'professor_curso_modalidade_v1',
        'data_referencia', p_data_referencia,
        'linhas', count(*)::integer,
        'inicio_inferido', min(a.data_aula),
        'data_aula_max', max(a.data_aula),
        'modalidades_observadas', coalesce(
          jsonb_agg(distinct a.modalidade order by a.modalidade)
            filter (where a.modalidade is not null),
          '[]'::jsonb
        ),
        'depara_ids', jsonb_build_object(
          'unidade_id', a.unidade_id,
          'curso_id', a.curso_id,
          'emusys_disciplina_ids', coalesce(
            jsonb_agg(
              distinct a.depara_emusys_disciplina_id
              order by a.depara_emusys_disciplina_id
            ) filter (where a.depara_emusys_disciplina_id is not null),
            '[]'::jsonb
          )
        )
      ) as evidencias
    from aula_base a
    where a.professor_id is not null
      and a.qualidade_vinculo = 'vinculo_utilizavel'
      and not a.is_projeto_banda
      and (
        a.curso_id is null
        or a.modalidade not in ('individual', 'turma')
        or a.modalidade is null
      )
    group by
      a.professor_id,
      a.unidade_id,
      a.curso_id,
      case
        when a.modalidade in ('individual', 'turma') then a.modalidade
        else null
      end
  )
  select * from jornada_candidatas
  union all
  select * from aula_candidatas
  union all
  select * from aula_conflitos
  union all
  select * from jornada_pendencias
  union all
  select * from aula_pendencias;
$$;

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

create or replace function public.salvar_professor_curso_modalidade_atribuicoes_v1(
  p_professor_id integer,
  p_atribuicoes jsonb,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_data_local date := public.fn_professor_curso_modalidade_data_local_la_v1();
  v_usuario_id integer;
  v_unidade_id uuid;
  v_item jsonb;
  v_acao text;
  v_atribuicao_id uuid;
  v_atribuicao public.professor_unidade_curso_modalidade%rowtype;
  v_curso_id integer;
  v_modalidade text;
  v_vigencia_inicio date;
  v_vigencia_fim date;
  v_evento jsonb;
  v_mantidas integer := 0;
  v_encerradas integer := 0;
  v_revisadas integer := 0;
  v_inseridas integer := 0;
begin
  v_usuario_id := public.fn_professor_curso_modalidade_ator_v1();

  if p_professor_id is null then
    raise exception 'PROFESSOR_CURSO_MODALIDADE_INVALIDO: professor obrigatorio';
  end if;
  if p_atribuicoes is null then
    raise exception
      'PROFESSOR_CURSO_MODALIDADE_INVALIDO: p_atribuicoes nao pode ser null';
  end if;
  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'PROFESSOR_CURSO_MODALIDADE_INVALIDO: justificativa obrigatoria';
  end if;
  if jsonb_typeof(p_atribuicoes) <> 'array'
     or jsonb_array_length(p_atribuicoes) = 0 then
    raise exception 'PROFESSOR_CURSO_MODALIDADE_INVALIDO: atribuicoes devem ser array nao vazio';
  end if;

  perform pg_advisory_xact_lock_shared(
    hashtextextended('professor_curso_modalidade_reconciliacao_v1', 0)
  );

  perform 1
  from public.professores p
  where p.id = p_professor_id
  for share;
  if not found then
    raise exception 'PROFESSOR_CURSO_MODALIDADE_INVALIDO: professor inexistente';
  end if;

  if exists (
    select 1
    from (
      select item.value ->> 'atribuicao_id' as atribuicao_id
      from jsonb_array_elements(p_atribuicoes) item
      where nullif(item.value ->> 'atribuicao_id', '') is not null
      group by item.value ->> 'atribuicao_id'
      having count(*) > 1
    ) duplicadas
  ) then
    raise exception 'PROFESSOR_CURSO_MODALIDADE_INVALIDO: atribuicao repetida no payload';
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_atribuicoes) item
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'PROFESSOR_CURSO_MODALIDADE_INVALIDO: cada atribuicao deve ser objeto';
    end if;

    v_acao := lower(btrim(coalesce(v_item ->> 'acao', '')));
    if v_acao not in ('manter', 'encerrar', 'revisar') then
      raise exception
        'PROFESSOR_CURSO_MODALIDADE_INVALIDO: acao deve ser manter, encerrar ou revisar';
    end if;

    v_atribuicao_id := nullif(v_item ->> 'atribuicao_id', '')::uuid;
    v_atribuicao := null;

    if v_atribuicao_id is not null then
      select a.*
        into v_atribuicao
      from public.professor_unidade_curso_modalidade a
      where a.id = v_atribuicao_id
        and a.professor_id = p_professor_id
      for update;

      if not found then
        raise exception 'PROFESSOR_CURSO_MODALIDADE_INVALIDO: atribuicao inexistente';
      end if;
      if v_atribuicao.status <> 'ativo' or v_atribuicao.vigencia_fim is not null then
        raise exception 'PROFESSOR_CURSO_MODALIDADE_INVALIDO: historico encerrado e imutavel';
      end if;

      v_unidade_id := v_atribuicao.unidade_id;
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
    elsif v_acao in ('manter', 'encerrar') then
      raise exception
        'PROFESSOR_CURSO_MODALIDADE_INVALIDO: manter e encerrar exigem atribuicao_id';
    end if;

    v_evento := jsonb_strip_nulls(jsonb_build_object(
      'acao', v_acao,
      'justificativa', btrim(p_justificativa),
      'usuario_id', v_usuario_id,
      'registrado_em', now(),
      'fonte_anterior', v_atribuicao.fonte,
      'confianca_anterior', v_atribuicao.confianca
    ));

    if v_acao = 'manter' then
      update public.professor_unidade_curso_modalidade
      set fonte = 'revisao',
          confianca = 'revisada',
          revisado_por = v_usuario_id,
          revisado_em = now(),
          evidencias = jsonb_set(
            coalesce(evidencias, '{}'::jsonb),
            '{revisoes}',
            coalesce(evidencias -> 'revisoes', '[]'::jsonb)
              || jsonb_build_array(v_evento),
            true
          )
      where id = v_atribuicao.id;
      v_mantidas := v_mantidas + 1;
      continue;
    end if;

    if v_acao = 'encerrar' then
      v_vigencia_fim := coalesce(
        nullif(v_item ->> 'vigencia_fim', '')::date,
        v_data_local
      );
      if v_vigencia_fim < v_atribuicao.vigencia_inicio then
        raise exception 'PROFESSOR_CURSO_MODALIDADE_INVALIDO: fim anterior ao inicio';
      end if;
      if v_vigencia_fim > v_data_local then
        raise exception
          'PROFESSOR_CURSO_MODALIDADE_INVALIDO: vigencia_fim futura nao e permitida';
      end if;

      update public.professor_unidade_curso_modalidade
      set status = 'encerrado',
          vigencia_fim = v_vigencia_fim,
          fonte = 'revisao',
          confianca = 'revisada',
          revisado_por = v_usuario_id,
          revisado_em = now(),
          evidencias = jsonb_set(
            coalesce(evidencias, '{}'::jsonb),
            '{revisoes}',
            coalesce(evidencias -> 'revisoes', '[]'::jsonb)
              || jsonb_build_array(v_evento),
            true
          )
      where id = v_atribuicao.id;
      v_encerradas := v_encerradas + 1;
      continue;
    end if;

    v_unidade_id := coalesce(
      nullif(v_item ->> 'unidade_id', '')::uuid,
      v_atribuicao.unidade_id
    );
    v_curso_id := coalesce(
      nullif(v_item ->> 'curso_id', '')::integer,
      v_atribuicao.curso_id
    );
    v_modalidade := lower(btrim(coalesce(
      nullif(v_item ->> 'modalidade', ''),
      v_atribuicao.modalidade
    )));
    v_vigencia_inicio := coalesce(
      nullif(v_item ->> 'vigencia_inicio', '')::date,
      v_data_local
    );

    if v_vigencia_inicio > v_data_local then
      raise exception
        'PROFESSOR_CURSO_MODALIDADE_INVALIDO: vigencia_inicio futura nao e permitida';
    end if;

    if v_atribuicao_id is not null
       and v_vigencia_inicio <= v_atribuicao.vigencia_inicio then
      raise exception
        'PROFESSOR_CURSO_MODALIDADE_INVALIDO: nova vigencia_inicio da revisao deve ser posterior a vigencia_inicio da atribuicao antiga';
    end if;

    if v_unidade_id is null
       or v_curso_id is null
       or v_modalidade not in ('individual', 'turma') then
      raise exception
        'PROFESSOR_CURSO_MODALIDADE_INVALIDO: revisar exige unidade, curso e modalidade oficial';
    end if;

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

    if not exists (
      select 1
      from public.vw_professores_emusys_vinculos vinculo
      where vinculo.professor_id = p_professor_id
        and vinculo.unidade_id = v_unidade_id
        and vinculo.qualidade_vinculo = 'vinculo_utilizavel'
    ) then
      raise exception
        'PROFESSOR_CURSO_MODALIDADE_INVALIDO: professor/unidade sem vinculo utilizavel';
    end if;

    if not exists (
      select 1
      from public.cursos curso
      where curso.id = v_curso_id
        and not coalesce(curso.is_projeto_banda, false)
    ) then
      raise exception
        'PROFESSOR_CURSO_MODALIDADE_INVALIDO: curso inexistente ou projeto/banda';
    end if;

    if v_atribuicao_id is not null then
      v_vigencia_fim := v_vigencia_inicio - 1;

      update public.professor_unidade_curso_modalidade
      set status = 'encerrado',
          vigencia_fim = v_vigencia_fim,
          fonte = 'revisao',
          confianca = 'revisada',
          revisado_por = v_usuario_id,
          revisado_em = now(),
          evidencias = jsonb_set(
            coalesce(evidencias, '{}'::jsonb),
            '{revisoes}',
            coalesce(evidencias -> 'revisoes', '[]'::jsonb)
              || jsonb_build_array(v_evento),
            true
          )
      where id = v_atribuicao.id;
    end if;

    if exists (
      select 1
      from public.professor_unidade_curso_modalidade existente
      where existente.professor_id = p_professor_id
        and existente.unidade_id = v_unidade_id
        and existente.curso_id = v_curso_id
        and existente.modalidade = v_modalidade
        and existente.status = 'ativo'
        and existente.vigencia_fim is null
    ) then
      raise exception
        'PROFESSOR_CURSO_MODALIDADE_INVALIDO: ja existe atribuicao ativa aberta';
    end if;

    insert into public.professor_unidade_curso_modalidade (
      professor_id,
      unidade_id,
      curso_id,
      modalidade,
      vigencia_inicio,
      status,
      fonte,
      confianca,
      revisado_por,
      revisado_em,
      evidencias
    ) values (
      p_professor_id,
      v_unidade_id,
      v_curso_id,
      v_modalidade,
      v_vigencia_inicio,
      'ativo',
      case when v_atribuicao_id is null then 'manual' else 'revisao' end,
      'revisada',
      v_usuario_id,
      now(),
      jsonb_strip_nulls(jsonb_build_object(
        'regra_versao', 'professor_curso_modalidade_v1',
        'origem', case when v_atribuicao_id is null then 'manual' else 'revisao' end,
        'atribuicao_anterior_id', v_atribuicao_id,
        'revisoes', jsonb_build_array(v_evento)
      ))
    );

    if v_atribuicao_id is null then
      v_inseridas := v_inseridas + 1;
    else
      v_revisadas := v_revisadas + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'professor_id', p_professor_id,
    'mantidas', v_mantidas,
    'encerradas', v_encerradas,
    'revisadas', v_revisadas,
    'inseridas', v_inseridas
  );
end;
$$;

create or replace function public.reconciliar_professor_curso_modalidade_v1(
  p_data_referencia date default public.fn_professor_curso_modalidade_data_local_la_v1()
)
returns table (
  inseridos integer,
  atualizados integer,
  ignorados integer,
  ambiguos integer,
  ignorados_projeto_banda integer,
  professores_inativos_preservados integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_data_local date := public.fn_professor_curso_modalidade_data_local_la_v1();
  v_data_referencia date := coalesce(p_data_referencia, v_data_local);
  v_inseridos integer := 0;
  v_atualizados integer := 0;
  v_ignorados integer := 0;
  v_ambiguos integer := 0;
  v_pendencias_ignoradas integer := 0;
  v_ignorados_projeto_banda integer := 0;
  v_professores_inativos_preservados integer := 0;
  v_total_materializavel integer := 0;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or session_user = 'postgres'
  ) then
    raise exception
      'PROFESSOR_CURSO_MODALIDADE_ACESSO_NEGADO: reconciliacao exclusivamente administrativa'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('professor_curso_modalidade_reconciliacao_v1', 0)
  );

  drop table if exists pg_temp._professor_curso_modalidade_evidencias;
  create temporary table pg_temp._professor_curso_modalidade_evidencias
  on commit drop
  as
  select e.*
  from public.fn_professor_curso_modalidade_evidencias_v1(
    v_data_referencia,
    null,
    null
  ) e;

  select count(*)::integer
    into v_total_materializavel
  from pg_temp._professor_curso_modalidade_evidencias e
  where e.materializavel;

  select count(*)::integer
    into v_ambiguos
  from pg_temp._professor_curso_modalidade_evidencias e
  where e.estado = 'conflito_modalidade_jornada_aula';

  select count(*)::integer
    into v_pendencias_ignoradas
  from pg_temp._professor_curso_modalidade_evidencias e
  where not e.materializavel
    and e.estado <> 'conflito_modalidade_jornada_aula';

  with projetos_ignorados as (
    select distinct
      j.professor_id,
      j.unidade_id,
      j.curso_id,
      lower(btrim(j.payload_snapshot #>> '{disciplina,tipo}')) as modalidade
    from public.aluno_jornada_matricula_disciplina j
    join public.vw_professores_emusys_vinculos vinculo
      on vinculo.professor_id = j.professor_id
     and vinculo.unidade_id = j.unidade_id
     and (
       j.emusys_professor_id is null
       or vinculo.emusys_professor_id = j.emusys_professor_id
     )
    join public.cursos curso on curso.id = j.curso_id
    where j.status_matricula = 'ativa'
      and j.professor_id is not null
      and lower(btrim(j.payload_snapshot #>> '{disciplina,tipo}'))
        in ('individual', 'turma')
      and vinculo.qualidade_vinculo = 'vinculo_utilizavel'
      and coalesce(curso.is_projeto_banda, false)

    union

    select distinct
      a.professor_id,
      a.unidade_id,
      d.curso_id,
      lower(btrim(a.tipo::text)) as modalidade
    from public.aulas_emusys a
    join public.vw_professores_emusys_vinculos vinculo
      on vinculo.professor_id = a.professor_id
     and vinculo.unidade_id = a.unidade_id
     and (
       a.emusys_professor_id is null
       or vinculo.emusys_professor_id = a.emusys_professor_id
     )
    join public.curso_emusys_depara d
      on d.unidade_id = a.unidade_id
     and d.emusys_disciplina_id = a.curso_emusys_id
    join public.cursos curso on curso.id = d.curso_id
    where a.data_aula between v_data_referencia - 89 and v_data_referencia
      and lower(btrim(a.categoria::text)) = 'normal'
      and a.cancelada is not true
      and a.sem_acompanhamento is not true
      and a.professor_id is not null
      and lower(btrim(a.tipo::text)) in ('individual', 'turma')
      and vinculo.qualidade_vinculo = 'vinculo_utilizavel'
      and coalesce(curso.is_projeto_banda, false)
  )
  select count(*)::integer
    into v_ignorados_projeto_banda
  from projetos_ignorados;

  with professores_inativos as (
    select distinct j.professor_id, j.unidade_id
    from public.aluno_jornada_matricula_disciplina j
    join public.vw_professores_emusys_vinculos vinculo
      on vinculo.professor_id = j.professor_id
     and vinculo.unidade_id = j.unidade_id
     and (
       j.emusys_professor_id is null
       or vinculo.emusys_professor_id = j.emusys_professor_id
     )
    join public.cursos curso on curso.id = j.curso_id
    where j.status_matricula = 'ativa'
      and j.professor_id is not null
      and lower(btrim(j.payload_snapshot #>> '{disciplina,tipo}'))
        in ('individual', 'turma')
      and not coalesce(curso.is_projeto_banda, false)
      and vinculo.qualidade_vinculo
        in ('inativo', 'identidade_historica_inativa')

    union

    select distinct a.professor_id, a.unidade_id
    from public.aulas_emusys a
    join public.vw_professores_emusys_vinculos vinculo
      on vinculo.professor_id = a.professor_id
     and vinculo.unidade_id = a.unidade_id
     and (
       a.emusys_professor_id is null
       or vinculo.emusys_professor_id = a.emusys_professor_id
     )
    join public.curso_emusys_depara d
      on d.unidade_id = a.unidade_id
     and d.emusys_disciplina_id = a.curso_emusys_id
    join public.cursos curso on curso.id = d.curso_id
    where a.data_aula between v_data_referencia - 89 and v_data_referencia
      and lower(btrim(a.categoria::text)) = 'normal'
      and a.cancelada is not true
      and a.sem_acompanhamento is not true
      and a.professor_id is not null
      and lower(btrim(a.tipo::text)) in ('individual', 'turma')
      and not coalesce(curso.is_projeto_banda, false)
      and vinculo.qualidade_vinculo
        in ('inativo', 'identidade_historica_inativa')
  )
  select count(*)::integer
    into v_professores_inativos_preservados
  from professores_inativos;

  with atualizadas as (
    update public.professor_unidade_curso_modalidade atribuicao
    set fonte = e.fonte,
        confianca = e.confianca,
        evidencias = e.evidencias,
        revisado_por = null,
        revisado_em = null
    from pg_temp._professor_curso_modalidade_evidencias e
    where e.materializavel
      and atribuicao.professor_id = e.professor_id
      and atribuicao.unidade_id = e.unidade_id
      and atribuicao.curso_id = e.curso_id
      and atribuicao.modalidade = e.modalidade
      and atribuicao.status = 'ativo'
      and atribuicao.vigencia_fim is null
      and atribuicao.fonte in ('jornada', 'aula')
      and (
        atribuicao.fonte is distinct from e.fonte
        or atribuicao.confianca is distinct from e.confianca
        or atribuicao.evidencias is distinct from e.evidencias
      )
    returning atribuicao.id
  )
  select count(*)::integer into v_atualizados
  from atualizadas;

  with inseridas as (
    insert into public.professor_unidade_curso_modalidade (
      professor_id,
      unidade_id,
      curso_id,
      modalidade,
      vigencia_inicio,
      status,
      fonte,
      confianca,
      evidencias
    )
    select
      e.professor_id,
      e.unidade_id,
      e.curso_id,
      e.modalidade,
      e.vigencia_inicio,
      'ativo',
      e.fonte,
      e.confianca,
      e.evidencias
    from pg_temp._professor_curso_modalidade_evidencias e
    where e.materializavel
      and e.vigencia_inicio <= v_data_local
      and not exists (
        select 1
        from public.professor_unidade_curso_modalidade existente
        where existente.professor_id = e.professor_id
          and existente.unidade_id = e.unidade_id
          and existente.curso_id = e.curso_id
          and existente.modalidade = e.modalidade
          and existente.status = 'ativo'
          and existente.vigencia_fim is null
      )
      and not exists (
        select 1
        from public.professor_unidade_curso_modalidade historico_revisado
        where historico_revisado.professor_id = e.professor_id
          and historico_revisado.unidade_id = e.unidade_id
          and historico_revisado.curso_id = e.curso_id
          and historico_revisado.modalidade = e.modalidade
          and historico_revisado.status = 'encerrado'
          and historico_revisado.fonte = 'revisao'
          and historico_revisado.vigencia_inicio <= v_data_local
          and historico_revisado.vigencia_fim >= e.vigencia_inicio
      )
    on conflict (
      professor_id,
      unidade_id,
      curso_id,
      modalidade
    ) where status = 'ativo' and vigencia_fim is null
    do nothing
    returning id
  )
  select count(*)::integer into v_inseridos
  from inseridas;

  v_ignorados := greatest(
    v_total_materializavel - v_atualizados - v_inseridos,
    0
  ) + v_pendencias_ignoradas;

  return query
  select
    v_inseridos,
    v_atualizados,
    v_ignorados,
    v_ambiguos,
    v_ignorados_projeto_banda,
    v_professores_inativos_preservados;
end;
$$;

alter table public.professor_unidade_curso_modalidade
  enable row level security;

revoke all on table public.professor_unidade_curso_modalidade
  from public, anon, authenticated;

do $professor_curso_modalidade_grants$
declare
  role_name text;
begin
  foreach role_name in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all on table public.professor_unidade_curso_modalidade from %I',
        role_name
      );
      execute format(
        'revoke all on function public.get_professor_curso_modalidade_reconciliacao_v1(uuid, integer) from %I',
        role_name
      );
      execute format(
        'revoke all on function public.salvar_professor_curso_modalidade_atribuicoes_v1(integer, jsonb, text) from %I',
        role_name
      );
      execute format(
        'revoke all on function public.reconciliar_professor_curso_modalidade_v1(date) from %I',
        role_name
      );
    end if;
  end loop;
end;
$professor_curso_modalidade_grants$;

revoke all on table public.professor_unidade_curso_modalidade
  from service_role;
grant select on table public.professor_unidade_curso_modalidade
  to service_role;

revoke all on function public.fn_professor_curso_modalidade_data_local_la_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.fn_professor_curso_modalidade_data_local_la_v1()
  to service_role;
revoke all on function public.fn_professor_curso_modalidade_proteger_historico_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_professor_curso_modalidade_impedir_sobreposicao_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_professor_curso_modalidade_ator_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_professor_curso_modalidade_evidencias_v1(date, uuid, integer)
  from public, anon, authenticated, service_role;

revoke all on function public.get_professor_curso_modalidade_reconciliacao_v1(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_professor_curso_modalidade_reconciliacao_v1(uuid, integer)
  to authenticated, service_role;

revoke all on function public.salvar_professor_curso_modalidade_atribuicoes_v1(integer, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.salvar_professor_curso_modalidade_atribuicoes_v1(integer, jsonb, text)
  to authenticated, service_role;

revoke all on function public.reconciliar_professor_curso_modalidade_v1(date)
  from public, anon, authenticated, service_role;
grant execute on function public.reconciliar_professor_curso_modalidade_v1(date)
  to service_role;

comment on table public.professor_unidade_curso_modalidade is
  'Historico temporal canonico das atribuicoes de professor por unidade, curso e modalidade.';
comment on function public.get_professor_curso_modalidade_reconciliacao_v1(uuid, integer) is
  'Le atribuicoes, evidencias pendentes, conflitos de modalidade e pistas globais sem produto cartesiano.';
comment on function public.salvar_professor_curso_modalidade_atribuicoes_v1(integer, jsonb, text) is
  'Mantem, encerra ou revisa atribuicoes com justificativa e trilha temporal, sem apagar historico.';
comment on function public.reconciliar_professor_curso_modalidade_v1(date) is
  'Materializa evidencias oficiais de jornada e aula de forma idempotente, preservando revisoes humanas.';
