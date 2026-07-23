begin;

-- O catalogo Emusys passa a ser uma fonte automatica auditavel sem alterar
-- linhas historicas. Manual e revisao continuam reservados ao fluxo humano.
alter table public.professor_unidade_curso_modalidade
  drop constraint if exists professor_unidade_curso_modalidade_fonte_check;

alter table public.professor_unidade_curso_modalidade
  add constraint professor_unidade_curso_modalidade_fonte_check
  check (fonte in ('manual', 'jornada', 'aula', 'revisao', 'emusys'));

create index if not exists idx_emusys_professor_disciplinas_catalogo_fk
  on public.emusys_professor_disciplinas (
    unidade_id,
    emusys_disciplina_id
  );

create index if not exists idx_emusys_professor_disciplinas_sync_solicitado
  on public.emusys_professor_disciplinas_sync_execucoes (solicitado_por)
  where solicitado_por is not null;

create or replace function public.fn_professor_curso_modalidade_evidencias_v2(
  p_data_referencia date,
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns table (
  professor_id integer,
  unidade_id uuid,
  curso_id integer,
  modalidade text,
  emusys_professor_id integer,
  emusys_disciplina_id integer,
  fonte text,
  confianca text,
  vigencia_inicio date,
  estado text,
  materializavel boolean,
  tem_atribuicao_formal boolean,
  tem_jornada_ativa boolean,
  evidencias jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with catalogo as (
    select
      catalogo.unidade_id,
      catalogo.emusys_disciplina_id,
      catalogo.nome_emusys,
      catalogo.modalidade,
      catalogo.primeiro_visto_em,
      catalogo.ultimo_visto_em,
      catalogo.ultima_execucao_id,
      depara.curso_id,
      coalesce(curso.is_projeto_banda, false) as is_projeto_banda
    from public.emusys_disciplinas_catalogo catalogo
    left join public.curso_emusys_depara depara
      on depara.unidade_id = catalogo.unidade_id
     and depara.emusys_disciplina_id = catalogo.emusys_disciplina_id
    left join public.cursos curso
      on curso.id = depara.curso_id
    where catalogo.ativo_origem
      and (p_unidade_id is null or catalogo.unidade_id = p_unidade_id)
  ),
  jornada_base as (
    select
      jornada.unidade_id,
      jornada.emusys_disciplina_id::integer as emusys_disciplina_id,
      coalesce(
        jornada.emusys_professor_id::integer,
        identidade.emusys_id
      ) as emusys_professor_id,
      coalesce(identidade.professor_id, jornada.professor_id) as professor_id,
      identidade.emusys_ativo as professor_ativo_na_unidade,
      identidade.validacao_status,
      jornada.id as jornada_id,
      jornada.emusys_matricula_disciplina_id,
      jornada.data_primeira_aula::date as data_primeira_aula,
      jornada.data_ultima_aula::date as data_ultima_aula,
      jornada.created_at::date as data_registro
    from public.aluno_jornada_matricula_disciplina jornada
    left join public.professores_unidades identidade
      on identidade.unidade_id = jornada.unidade_id
     and (
       (
         jornada.emusys_professor_id is not null
         and identidade.emusys_id = jornada.emusys_professor_id
       )
       or
       (
         jornada.emusys_professor_id is null
         and identidade.professor_id = jornada.professor_id
       )
     )
    where lower(btrim(jornada.status_matricula)) = 'ativa'
      and (p_unidade_id is null or jornada.unidade_id = p_unidade_id)
      and (
        p_professor_id is null
        or coalesce(identidade.professor_id, jornada.professor_id)
          = p_professor_id
      )
  ),
  jornadas as (
    select
      jornada.unidade_id,
      jornada.emusys_disciplina_id,
      jornada.emusys_professor_id,
      jornada.professor_id,
      bool_or(coalesce(jornada.professor_ativo_na_unidade, false))
        as professor_ativo_na_unidade,
      min(jornada.data_primeira_aula) as data_primeira_aula,
      min(jornada.data_registro) as data_registro,
      max(jornada.data_ultima_aula) as data_ultima_aula,
      count(*)::integer as quantidade_jornadas,
      jsonb_agg(jornada.jornada_id order by jornada.jornada_id)
        as jornada_ids,
      coalesce(
        jsonb_agg(
          distinct jornada.emusys_matricula_disciplina_id
          order by jornada.emusys_matricula_disciplina_id
        ) filter (
          where jornada.emusys_matricula_disciplina_id is not null
        ),
        '[]'::jsonb
      ) as matricula_disciplina_ids
    from jornada_base jornada
    group by
      jornada.unidade_id,
      jornada.emusys_disciplina_id,
      jornada.emusys_professor_id,
      jornada.professor_id
  ),
  aulas_execucao as (
    select
      aula.unidade_id,
      aula.curso_emusys_id as emusys_disciplina_id,
      aula.emusys_professor_id,
      count(*)::integer as quantidade_aulas,
      min(aula.data_aula) as primeira_aula_observada,
      max(aula.data_aula) as ultima_aula_observada,
      count(*) filter (where aula.reagendada)::integer as reagendadas
    from public.aulas_emusys aula
    where aula.data_aula between p_data_referencia - 89 and p_data_referencia
      and lower(btrim(aula.categoria::text)) = 'normal'
      and aula.cancelada is not true
      and aula.sem_acompanhamento is not true
      and (p_unidade_id is null or aula.unidade_id = p_unidade_id)
    group by
      aula.unidade_id,
      aula.curso_emusys_id,
      aula.emusys_professor_id
  ),
  formais as (
    select
      catalogo.unidade_id,
      catalogo.emusys_disciplina_id,
      catalogo.nome_emusys,
      catalogo.modalidade,
      catalogo.curso_id,
      catalogo.is_projeto_banda,
      catalogo.primeiro_visto_em,
      catalogo.ultima_execucao_id,
      atribuicao.emusys_professor_id,
      identidade.professor_id,
      identidade.emusys_ativo as professor_ativo_na_unidade,
      identidade.validacao_status,
      atribuicao.primeiro_visto_em as atribuicao_primeiro_visto_em,
      atribuicao.ultima_execucao_id as atribuicao_execucao_id
    from catalogo
    join public.emusys_professor_disciplinas atribuicao
      on atribuicao.unidade_id = catalogo.unidade_id
     and atribuicao.emusys_disciplina_id = catalogo.emusys_disciplina_id
     and atribuicao.ativo_origem
    left join public.professores_unidades identidade
      on identidade.unidade_id = atribuicao.unidade_id
     and identidade.emusys_id = atribuicao.emusys_professor_id
    where (
      p_professor_id is null
      or identidade.professor_id = p_professor_id
    )
  ),
  candidatos_formais as (
    select
      formal.professor_id,
      formal.unidade_id,
      formal.curso_id,
      formal.modalidade,
      formal.emusys_professor_id,
      formal.emusys_disciplina_id,
      'emusys'::text as fonte,
      'alta'::text as confianca,
      least(
        formal.primeiro_visto_em::date,
        formal.atribuicao_primeiro_visto_em::date,
        coalesce(jornada.data_primeira_aula, p_data_referencia)
      ) as vigencia_inicio,
      case
        when formal.curso_id is null then 'disciplina_sem_depara'
        when formal.professor_id is null then 'professor_sem_identidade_local'
        when not coalesce(formal.professor_ativo_na_unidade, false)
          then 'professor_inativo_na_unidade'
        when formal.is_projeto_banda then 'projeto_banda_fora_escopo'
        when jornada.professor_id is not null then 'formal_com_jornada'
        else 'formal_sem_aluno'
      end::text as estado,
      (
        formal.curso_id is not null
        and formal.professor_id is not null
        and coalesce(formal.professor_ativo_na_unidade, false)
        and not formal.is_projeto_banda
      ) as materializavel,
      true as tem_atribuicao_formal,
      (jornada.professor_id is not null) as tem_jornada_ativa,
      jsonb_strip_nulls(jsonb_build_object(
        'regra_versao', 'professor_curso_modalidade_catalogo_v2',
        'data_referencia', p_data_referencia,
        'origem', 'atribuicao_formal_emusys',
        'catalogo', jsonb_build_object(
          'emusys_disciplina_id', formal.emusys_disciplina_id,
          'nome', formal.nome_emusys,
          'modalidade', formal.modalidade,
          'execucao_id', formal.ultima_execucao_id
        ),
        'atribuicao', jsonb_build_object(
          'emusys_professor_id', formal.emusys_professor_id,
          'execucao_id', formal.atribuicao_execucao_id
        ),
        'jornada', case
          when jornada.professor_id is null then null
          else jsonb_build_object(
            'quantidade', jornada.quantidade_jornadas,
            'ids', jornada.jornada_ids,
            'matricula_disciplina_ids', jornada.matricula_disciplina_ids,
            'primeira_aula', jornada.data_primeira_aula,
            'ultima_aula', jornada.data_ultima_aula
          )
        end,
        'aulas', case
          when aula.quantidade_aulas is null then null
          else jsonb_build_object(
            'quantidade', aula.quantidade_aulas,
            'primeira', aula.primeira_aula_observada,
            'ultima', aula.ultima_aula_observada,
            'reagendadas', aula.reagendadas
          )
        end
      )) as evidencias
    from formais formal
    left join jornadas jornada
      on jornada.unidade_id = formal.unidade_id
     and jornada.emusys_disciplina_id = formal.emusys_disciplina_id
     and jornada.emusys_professor_id = formal.emusys_professor_id
    left join aulas_execucao aula
      on aula.unidade_id = formal.unidade_id
     and aula.emusys_disciplina_id = formal.emusys_disciplina_id
     and aula.emusys_professor_id = formal.emusys_professor_id
  ),
  candidatos_jornada_sem_formal as (
    select
      jornada.professor_id,
      jornada.unidade_id,
      catalogo.curso_id,
      catalogo.modalidade,
      jornada.emusys_professor_id,
      jornada.emusys_disciplina_id,
      'emusys'::text as fonte,
      'alta'::text as confianca,
      coalesce(
        jornada.data_primeira_aula,
        jornada.data_registro,
        p_data_referencia
      ) as vigencia_inicio,
      case
        when catalogo.emusys_disciplina_id is null
          then 'jornada_disciplina_ausente_catalogo'
        when catalogo.curso_id is null then 'disciplina_sem_depara'
        when jornada.professor_id is null
          then 'professor_sem_identidade_local'
        when not coalesce(jornada.professor_ativo_na_unidade, false)
          then 'professor_inativo_na_unidade'
        when catalogo.is_projeto_banda then 'projeto_banda_fora_escopo'
        else 'jornada_sem_atribuicao_formal'
      end::text as estado,
      (
        catalogo.emusys_disciplina_id is not null
        and catalogo.curso_id is not null
        and jornada.professor_id is not null
        and coalesce(jornada.professor_ativo_na_unidade, false)
        and not catalogo.is_projeto_banda
      ) as materializavel,
      false as tem_atribuicao_formal,
      true as tem_jornada_ativa,
      jsonb_strip_nulls(jsonb_build_object(
        'regra_versao', 'professor_curso_modalidade_catalogo_v2',
        'data_referencia', p_data_referencia,
        'origem', 'jornada_ativa_sem_atribuicao_formal',
        'catalogo', case
          when catalogo.emusys_disciplina_id is null then null
          else jsonb_build_object(
            'emusys_disciplina_id', catalogo.emusys_disciplina_id,
            'nome', catalogo.nome_emusys,
            'modalidade', catalogo.modalidade,
            'execucao_id', catalogo.ultima_execucao_id
          )
        end,
        'jornada', jsonb_build_object(
          'quantidade', jornada.quantidade_jornadas,
          'ids', jornada.jornada_ids,
          'matricula_disciplina_ids', jornada.matricula_disciplina_ids,
          'primeira_aula', jornada.data_primeira_aula,
          'ultima_aula', jornada.data_ultima_aula
        ),
        'aulas', case
          when aula.quantidade_aulas is null then null
          else jsonb_build_object(
            'quantidade', aula.quantidade_aulas,
            'primeira', aula.primeira_aula_observada,
            'ultima', aula.ultima_aula_observada,
            'reagendadas', aula.reagendadas
          )
        end
      )) as evidencias
    from jornadas jornada
    left join catalogo
      on catalogo.unidade_id = jornada.unidade_id
     and catalogo.emusys_disciplina_id = jornada.emusys_disciplina_id
    left join aulas_execucao aula
      on aula.unidade_id = jornada.unidade_id
     and aula.emusys_disciplina_id = jornada.emusys_disciplina_id
     and aula.emusys_professor_id = jornada.emusys_professor_id
    where not exists (
      select 1
      from formais formal
      where formal.unidade_id = jornada.unidade_id
        and formal.emusys_disciplina_id = jornada.emusys_disciplina_id
        and formal.emusys_professor_id = jornada.emusys_professor_id
    )
  )
  select * from candidatos_formais
  union all
  select * from candidatos_jornada_sem_formal;
$function$;

create or replace function public.reconciliar_professor_curso_modalidade_v2(
  p_execucao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_execucao public.emusys_professor_disciplinas_sync_execucoes%rowtype;
  v_data_referencia date;
  v_criados integer := 0;
  v_atualizados integer := 0;
  v_mantidos integer := 0;
  v_encerrados integer := 0;
  v_excecoes integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'acesso_negado'
      using errcode = '42501';
  end if;

  select execucao.*
    into v_execucao
  from public.emusys_professor_disciplinas_sync_execucoes execucao
  where execucao.id = p_execucao_id
  for update;

  if not found then
    raise exception 'execucao_nao_encontrada'
      using errcode = 'P0002';
  end if;

  if v_execucao.status <> 'completa' then
    raise exception 'execucao_nao_esta_completa';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'professor_curso_modalidade_catalogo_v2:'
        || v_execucao.unidade_id::text,
      0
    )
  );

  v_data_referencia := (
    coalesce(v_execucao.finalizado_em, clock_timestamp())
      at time zone 'America/Sao_Paulo'
  )::date;

  drop table if exists pg_temp._professor_curso_modalidade_v2;
  create temporary table pg_temp._professor_curso_modalidade_v2
  on commit drop
  as
  select evidencia.*
  from public.fn_professor_curso_modalidade_evidencias_v2(
    v_data_referencia,
    v_execucao.unidade_id,
    null
  ) evidencia;

  drop table if exists pg_temp._professor_curso_modalidade_v2_materializavel;
  create temporary table pg_temp._professor_curso_modalidade_v2_materializavel
  on commit drop
  as
  select
    evidencia.professor_id,
    evidencia.unidade_id,
    evidencia.curso_id,
    evidencia.modalidade,
    min(evidencia.vigencia_inicio) as vigencia_inicio,
    bool_or(evidencia.tem_atribuicao_formal) as tem_atribuicao_formal,
    bool_or(evidencia.tem_jornada_ativa) as tem_jornada_ativa,
    jsonb_build_object(
      'regra_versao', 'professor_curso_modalidade_catalogo_v2',
      'execucao_id', p_execucao_id,
      'data_referencia', v_data_referencia,
      'origens', jsonb_agg(
        evidencia.evidencias
        order by evidencia.emusys_disciplina_id,
          evidencia.emusys_professor_id
      )
    ) as evidencias
  from pg_temp._professor_curso_modalidade_v2 evidencia
  where evidencia.materializavel
  group by
    evidencia.professor_id,
    evidencia.unidade_id,
    evidencia.curso_id,
    evidencia.modalidade;

  select count(*)::integer
    into v_excecoes
  from pg_temp._professor_curso_modalidade_v2 evidencia
  where not evidencia.materializavel
     or evidencia.estado = 'jornada_sem_atribuicao_formal';

  with atualizadas as (
    update public.professor_unidade_curso_modalidade atribuicao
       set vigencia_inicio = least(
             atribuicao.vigencia_inicio,
             materializavel.vigencia_inicio
           ),
           fonte = 'emusys',
           confianca = 'alta',
           evidencias = materializavel.evidencias,
           revisado_por = null,
           revisado_em = null,
           atualizado_em = now()
      from pg_temp._professor_curso_modalidade_v2_materializavel materializavel
     where atribuicao.professor_id = materializavel.professor_id
       and atribuicao.unidade_id = materializavel.unidade_id
       and atribuicao.curso_id = materializavel.curso_id
       and atribuicao.modalidade = materializavel.modalidade
       and atribuicao.status = 'ativo'
       and atribuicao.vigencia_fim is null
       and atribuicao.fonte in ('jornada', 'aula', 'emusys')
       and (
         atribuicao.vigencia_inicio is distinct from least(
           atribuicao.vigencia_inicio,
           materializavel.vigencia_inicio
         )
         or atribuicao.fonte is distinct from 'emusys'
         or atribuicao.confianca is distinct from 'alta'
         or atribuicao.evidencias is distinct from materializavel.evidencias
       )
    returning atribuicao.id
  )
  select count(*)::integer into v_atualizados from atualizadas;

  select count(*)::integer
    into v_mantidos
  from pg_temp._professor_curso_modalidade_v2_materializavel materializavel
  join public.professor_unidade_curso_modalidade atribuicao
    on atribuicao.professor_id = materializavel.professor_id
   and atribuicao.unidade_id = materializavel.unidade_id
   and atribuicao.curso_id = materializavel.curso_id
   and atribuicao.modalidade = materializavel.modalidade
   and atribuicao.status = 'ativo'
   and atribuicao.vigencia_fim is null;

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
      evidencias,
      atualizado_em
    )
    select
      materializavel.professor_id,
      materializavel.unidade_id,
      materializavel.curso_id,
      materializavel.modalidade,
      least(materializavel.vigencia_inicio, v_data_referencia),
      'ativo',
      'emusys',
      'alta',
      materializavel.evidencias,
      now()
    from pg_temp._professor_curso_modalidade_v2_materializavel materializavel
    where not exists (
      select 1
      from public.professor_unidade_curso_modalidade existente
      where existente.professor_id = materializavel.professor_id
        and existente.unidade_id = materializavel.unidade_id
        and existente.curso_id = materializavel.curso_id
        and existente.modalidade = materializavel.modalidade
        and existente.status = 'ativo'
        and existente.vigencia_fim is null
    )
      and not exists (
        select 1
        from public.professor_unidade_curso_modalidade revisada
        where revisada.professor_id = materializavel.professor_id
          and revisada.unidade_id = materializavel.unidade_id
          and revisada.curso_id = materializavel.curso_id
          and revisada.modalidade = materializavel.modalidade
          and revisada.status = 'encerrado'
          and revisada.fonte = 'revisao'
          and revisada.vigencia_inicio <= v_data_referencia
          and revisada.vigencia_fim >= materializavel.vigencia_inicio
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
  select count(*)::integer into v_criados from inseridas;

  with encerradas as (
    update public.professor_unidade_curso_modalidade atribuicao
       set status = 'encerrado',
           vigencia_fim = greatest(
             atribuicao.vigencia_inicio,
             v_data_referencia
           ),
           evidencias = atribuicao.evidencias || jsonb_build_object(
             'encerramento', jsonb_build_object(
               'regra_versao', 'professor_curso_modalidade_catalogo_v2',
               'execucao_id', p_execucao_id,
               'data', v_data_referencia,
               'motivo', 'ausente_no_formal_e_na_jornada_apos_sync_completo'
             )
           ),
           atualizado_em = now()
     where atribuicao.unidade_id = v_execucao.unidade_id
       and atribuicao.status = 'ativo'
       and atribuicao.vigencia_fim is null
       and atribuicao.fonte in ('jornada', 'aula', 'emusys')
       and atribuicao.fonte not in ('manual', 'revisao')
       and not exists (
         select 1
         from pg_temp._professor_curso_modalidade_v2_materializavel materializavel
         where materializavel.professor_id = atribuicao.professor_id
           and materializavel.unidade_id = atribuicao.unidade_id
           and materializavel.curso_id = atribuicao.curso_id
           and materializavel.modalidade = atribuicao.modalidade
       )
    returning atribuicao.id
  )
  select count(*)::integer into v_encerrados from encerradas;

  return jsonb_build_object(
    'execucao_id', p_execucao_id,
    'unidade_id', v_execucao.unidade_id,
    'data_referencia', v_data_referencia,
    'criados', v_criados,
    'atualizados', v_atualizados,
    'mantidos', v_mantidos,
    'encerrados', v_encerrados,
    'excecoes', v_excecoes
  );
end;
$function$;

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
  v_data_referencia date := public.fn_professor_curso_modalidade_data_local_la_v1();
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
  with evidencias_base as (
    select evidencia.*
    from public.fn_professor_curso_modalidade_evidencias_v2(
      v_data_referencia,
      p_unidade_id,
      p_professor_id
    ) evidencia
  ),
  excecoes_evidencia as (
    select
      md5(concat_ws(
        ':',
        evidencia.estado,
        evidencia.unidade_id,
        evidencia.emusys_professor_id,
        evidencia.emusys_disciplina_id,
        evidencia.professor_id,
        evidencia.curso_id
      )) as excecao_id,
      evidencia.estado as tipo,
      true as acionavel,
      evidencia.unidade_id,
      unidade.nome::text as unidade_nome,
      evidencia.professor_id,
      professor.nome::text as professor_nome,
      evidencia.emusys_professor_id,
      evidencia.curso_id,
      curso.nome::text as curso_nome,
      evidencia.emusys_disciplina_id,
      catalogo.nome_emusys as disciplina_nome,
      evidencia.modalidade,
      case evidencia.estado
        when 'professor_sem_identidade_local'
          then 'Professor do Emusys ainda nao possui identidade local resolvida.'
        when 'professor_inativo_na_unidade'
          then 'A origem lista o professor, mas seu vinculo local na unidade esta inativo.'
        when 'disciplina_sem_depara'
          then 'Disciplina oficial ainda nao possui de-para para um curso local.'
        when 'jornada_disciplina_ausente_catalogo'
          then 'Jornada ativa aponta disciplina ausente do ultimo catalogo completo.'
        when 'jornada_sem_atribuicao_formal'
          then 'Jornada ativa foi materializada, mas a atribuicao formal nao veio no catalogo.'
        else evidencia.estado
      end::text as motivo,
      case evidencia.estado
        when 'professor_sem_identidade_local'
          then 'Resolver a identidade do professor por ID Emusys e unidade.'
        when 'professor_inativo_na_unidade'
          then 'Confirmar no Emusys se a atribuicao ainda e vigente.'
        when 'disciplina_sem_depara'
          then 'Vincular a disciplina Emusys ao curso canonico correspondente.'
        when 'jornada_disciplina_ausente_catalogo'
          then 'Revisar a matricula no Emusys ou repetir um sync completo.'
        when 'jornada_sem_atribuicao_formal'
          then 'Conferir a atribuicao formal do professor para essa disciplina no Emusys.'
        else 'Revisar evidencias tecnicas.'
      end::text as sugestao,
      'pendente'::text as estado,
      evidencia.evidencias
    from evidencias_base evidencia
    join public.unidades unidade
      on unidade.id = evidencia.unidade_id
    left join public.professores professor
      on professor.id = evidencia.professor_id
    left join public.cursos curso
      on curso.id = evidencia.curso_id
    left join public.emusys_disciplinas_catalogo catalogo
      on catalogo.unidade_id = evidencia.unidade_id
     and catalogo.emusys_disciplina_id = evidencia.emusys_disciplina_id
    where evidencia.estado in (
      'professor_sem_identidade_local',
      'professor_inativo_na_unidade',
      'disciplina_sem_depara',
      'jornada_disciplina_ausente_catalogo',
      'jornada_sem_atribuicao_formal'
    )
  ),
  id_disciplina_multimodalidade as (
    select
      md5(concat_ws(':', 'id_disciplina_multimodalidade', catalogo.unidade_id,
        catalogo.emusys_disciplina_id)) as excecao_id,
      'id_disciplina_multimodalidade'::text as tipo,
      true as acionavel,
      catalogo.unidade_id,
      unidade.nome::text as unidade_nome,
      null::integer as professor_id,
      null::text as professor_nome,
      null::integer as emusys_professor_id,
      null::integer as curso_id,
      null::text as curso_nome,
      catalogo.emusys_disciplina_id,
      min(catalogo.nome_emusys)::text as disciplina_nome,
      null::text as modalidade,
      'O mesmo ID de disciplina aparece em mais de uma modalidade.'::text as motivo,
      'Corrigir o catalogo na origem antes de materializar.'::text as sugestao,
      'pendente'::text as estado,
      jsonb_build_object(
        'modalidades', jsonb_agg(distinct catalogo.modalidade order by catalogo.modalidade)
      ) as evidencias
    from public.emusys_disciplinas_catalogo catalogo
    join public.unidades unidade on unidade.id = catalogo.unidade_id
    where catalogo.ativo_origem
      and (p_unidade_id is null or catalogo.unidade_id = p_unidade_id)
    group by catalogo.unidade_id, unidade.nome, catalogo.emusys_disciplina_id
    having count(distinct catalogo.modalidade) > 1
  ),
  sobreposicao_temporal as (
    select distinct on (anterior.id, posterior.id)
      md5(concat_ws(':', 'sobreposicao_temporal', anterior.id, posterior.id))
        as excecao_id,
      'sobreposicao_temporal'::text as tipo,
      true as acionavel,
      anterior.unidade_id,
      unidade.nome::text as unidade_nome,
      anterior.professor_id,
      professor.nome::text as professor_nome,
      identidade.emusys_id as emusys_professor_id,
      anterior.curso_id,
      curso.nome::text as curso_nome,
      depara.emusys_disciplina_id,
      depara.emusys_nome::text as disciplina_nome,
      anterior.modalidade,
      'Dois periodos do mesmo vinculo possuem sobreposicao temporal.'::text as motivo,
      'Revisar os limites dos periodos sem apagar o historico.'::text as sugestao,
      'pendente'::text as estado,
      jsonb_build_object(
        'atribuicao_anterior_id', anterior.id,
        'atribuicao_posterior_id', posterior.id,
        'periodo_anterior', jsonb_build_array(anterior.vigencia_inicio, anterior.vigencia_fim),
        'periodo_posterior', jsonb_build_array(posterior.vigencia_inicio, posterior.vigencia_fim)
      ) as evidencias
    from public.professor_unidade_curso_modalidade anterior
    join public.professor_unidade_curso_modalidade posterior
      on posterior.professor_id = anterior.professor_id
     and posterior.unidade_id = anterior.unidade_id
     and posterior.curso_id = anterior.curso_id
     and posterior.modalidade = anterior.modalidade
     and posterior.id > anterior.id
     and daterange(
       anterior.vigencia_inicio,
       coalesce(anterior.vigencia_fim, 'infinity'::date),
       '[]'
     ) && daterange(
       posterior.vigencia_inicio,
       coalesce(posterior.vigencia_fim, 'infinity'::date),
       '[]'
     )
    join public.unidades unidade on unidade.id = anterior.unidade_id
    join public.professores professor on professor.id = anterior.professor_id
    join public.cursos curso on curso.id = anterior.curso_id
    left join public.professores_unidades identidade
      on identidade.professor_id = anterior.professor_id
     and identidade.unidade_id = anterior.unidade_id
    left join public.curso_emusys_depara depara
      on depara.unidade_id = anterior.unidade_id
     and depara.curso_id = anterior.curso_id
    where (p_unidade_id is null or anterior.unidade_id = p_unidade_id)
      and (p_professor_id is null or anterior.professor_id = p_professor_id)
  ),
  auditoria as (
    select
      md5(concat_ws(
        ':',
        'auditoria',
        evidencia.unidade_id,
        evidencia.professor_id,
        evidencia.curso_id,
        evidencia.modalidade,
        evidencia.emusys_disciplina_id
      )) as excecao_id,
      'resolvido_catalogo'::text as tipo,
      false as acionavel,
      evidencia.unidade_id,
      unidade.nome::text as unidade_nome,
      evidencia.professor_id,
      professor.nome::text as professor_nome,
      evidencia.emusys_professor_id,
      evidencia.curso_id,
      curso.nome::text as curso_nome,
      evidencia.emusys_disciplina_id,
      catalogo.nome_emusys as disciplina_nome,
      evidencia.modalidade,
      'Vinculo resolvido automaticamente por catalogo, identidade e jornada.'::text as motivo,
      null::text as sugestao,
      'auditoria'::text as estado,
      evidencia.evidencias
    from evidencias_base evidencia
    join public.unidades unidade on unidade.id = evidencia.unidade_id
    left join public.professores professor on professor.id = evidencia.professor_id
    left join public.cursos curso on curso.id = evidencia.curso_id
    left join public.emusys_disciplinas_catalogo catalogo
      on catalogo.unidade_id = evidencia.unidade_id
     and catalogo.emusys_disciplina_id = evidencia.emusys_disciplina_id
    where p_incluir_auditoria
      and evidencia.materializavel
      and evidencia.estado <> 'jornada_sem_atribuicao_formal'

    union all

    select
      atribuicao.id::text,
      'historico_encerrado'::text,
      false,
      atribuicao.unidade_id,
      unidade.nome::text,
      atribuicao.professor_id,
      professor.nome::text,
      identidade.emusys_id,
      atribuicao.curso_id,
      curso.nome::text,
      depara.emusys_disciplina_id,
      depara.emusys_nome::text,
      atribuicao.modalidade,
      'Vinculo historico preservado.'::text,
      null::text,
      'auditoria'::text,
      atribuicao.evidencias
    from public.professor_unidade_curso_modalidade atribuicao
    join public.unidades unidade on unidade.id = atribuicao.unidade_id
    join public.professores professor on professor.id = atribuicao.professor_id
    join public.cursos curso on curso.id = atribuicao.curso_id
    left join public.professores_unidades identidade
      on identidade.professor_id = atribuicao.professor_id
     and identidade.unidade_id = atribuicao.unidade_id
    left join public.curso_emusys_depara depara
      on depara.unidade_id = atribuicao.unidade_id
     and depara.curso_id = atribuicao.curso_id
    where p_incluir_auditoria
      and atribuicao.status = 'encerrado'
      and (p_unidade_id is null or atribuicao.unidade_id = p_unidade_id)
      and (p_professor_id is null or atribuicao.professor_id = p_professor_id)
  ),
  todas as (
    select * from excecoes_evidencia
    union all
    select * from id_disciplina_multimodalidade
    union all
    select * from sobreposicao_temporal
    union all
    select * from auditoria
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

-- Finaliza o catalogo bruto primeiro. A materializacao V2 roda depois e, por
-- estar ainda em rollout controlado, uma falha nela fica observavel sem perder
-- o catalogo completo que acabou de ser sincronizado.
create or replace function public.finalizar_sync_professor_disciplinas_emusys_v1(
  p_execucao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_execucao public.emusys_professor_disciplinas_sync_execucoes%rowtype;
  v_catalogo_inativados integer := 0;
  v_atribuicoes_inativadas integer := 0;
  v_materializacao jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'acesso_negado'
      using errcode = '42501';
  end if;

  select execucao.*
    into v_execucao
  from public.emusys_professor_disciplinas_sync_execucoes execucao
  where execucao.id = p_execucao_id
  for update;

  if not found then
    raise exception 'execucao_nao_encontrada'
      using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'sync_professor_disciplinas_emusys:' || v_execucao.unidade_id::text,
      0
    )
  );

  if v_execucao.status <> 'em_andamento' then
    raise exception 'execucao_nao_esta_em_andamento';
  end if;

  if v_execucao.disciplinas_processadas
       is distinct from v_execucao.disciplinas_esperadas then
    raise exception 'execucao_incompleta';
  end if;

  if jsonb_typeof(v_execucao.falhas) <> 'array'
     or jsonb_array_length(v_execucao.falhas) > 0 then
    raise exception 'execucao_possui_falhas';
  end if;

  update public.emusys_professor_disciplinas atribuicao
     set ativo_origem = false,
         sincronizado_em = now(),
         updated_at = now()
   where atribuicao.unidade_id = v_execucao.unidade_id
     and atribuicao.ativo_origem
     and atribuicao.ultima_execucao_id is distinct from p_execucao_id;
  get diagnostics v_atribuicoes_inativadas = row_count;

  update public.emusys_disciplinas_catalogo disciplina
     set ativo_origem = false,
         sincronizado_em = now(),
         updated_at = now()
   where disciplina.unidade_id = v_execucao.unidade_id
     and disciplina.ativo_origem
     and disciplina.ultima_execucao_id is distinct from p_execucao_id;
  get diagnostics v_catalogo_inativados = row_count;

  update public.emusys_professor_disciplinas_sync_execucoes execucao
     set status = 'completa',
         finalizado_em = now(),
         estatisticas = coalesce(execucao.estatisticas, '{}'::jsonb)
           || jsonb_build_object(
             'catalogo_inativados', v_catalogo_inativados,
             'atribuicoes_inativadas', v_atribuicoes_inativadas
           ),
         updated_at = now()
   where execucao.id = p_execucao_id;

  begin
    v_materializacao :=
      public.reconciliar_professor_curso_modalidade_v2(p_execucao_id);
  exception
    when others then
      v_materializacao := jsonb_build_object(
        'status', 'falhou',
        'sqlstate', sqlstate,
        'mensagem', sqlerrm
      );
  end;

  update public.emusys_professor_disciplinas_sync_execucoes execucao
     set estatisticas = coalesce(execucao.estatisticas, '{}'::jsonb)
       || jsonb_build_object('materializacao_v2', v_materializacao),
         updated_at = now()
   where execucao.id = p_execucao_id;

  return jsonb_build_object(
    'execucao_id', p_execucao_id,
    'unidade_id', v_execucao.unidade_id,
    'status', 'completa',
    'disciplinas_esperadas', v_execucao.disciplinas_esperadas,
    'disciplinas_processadas', v_execucao.disciplinas_processadas,
    'requisicoes', v_execucao.requisicoes,
    'catalogo_inativados', v_catalogo_inativados,
    'atribuicoes_inativadas', v_atribuicoes_inativadas,
    'materializacao_v2', v_materializacao
  );
end;
$function$;

revoke all on function public.fn_professor_curso_modalidade_evidencias_v2(
  date, uuid, integer
) from public, anon, authenticated;
grant execute on function public.fn_professor_curso_modalidade_evidencias_v2(
  date, uuid, integer
) to service_role;

revoke all on function public.reconciliar_professor_curso_modalidade_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.reconciliar_professor_curso_modalidade_v2(uuid)
  to service_role;

revoke all on function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) from public, anon;
grant execute on function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) to authenticated, service_role;

revoke all on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid)
  to service_role;

comment on function public.fn_professor_curso_modalidade_evidencias_v2(
  date, uuid, integer
) is 'Resolve modalidade pelo catalogo Emusys; aulas sao apenas evidencia de execucao.';

comment on function public.reconciliar_professor_curso_modalidade_v2(uuid)
  is 'Materializa somente sync completo e preserva manual, revisao e historico encerrado.';

comment on function public.get_professor_curso_modalidade_excecoes_v2(
  uuid, integer, boolean
) is 'Fila guardada de excecoes reais do catalogo Emusys, sem pistas legadas.';

commit;
