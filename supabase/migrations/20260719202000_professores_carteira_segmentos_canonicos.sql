-- Task 4 - base detalhada canonica da carteira por professor e periodo.
-- Extraida da definicao viva capturada em 2026-07-20, MD5
-- 3145ca7e057d1cebd9971d13f76d4171. Curso e modalidade sao enriquecimentos
-- oficiais; as contagens do agregado permanecem identicas ao contrato anterior.

create or replace function public.get_carteira_professor_periodo_detalhe_canonico_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table (
  professor_id integer,
  unidade_id uuid,
  pessoa_chave text,
  curso_id integer,
  modalidade text,
  turma_chave text,
  elegivel_media boolean,
  fonte text,
  curso_resolvido boolean,
  modalidade_resolvida boolean,
  estado_resolucao text,
  ocupacao_chave text,
  carteira_total_auditado integer,
  carteira_total_detalhado integer,
  segmentacao_incompleta boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_competencia date := make_date(p_ano, p_mes, 1);
  v_inicio date := coalesce(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date;
  v_periodo_mensal boolean;
begin
  v_fim := coalesce(
    p_data_fim,
    (v_inicio + interval '1 month - 1 day')::date
  );
  v_periodo_mensal := v_inicio = v_competencia
    and v_fim = (v_competencia + interval '1 month - 1 day')::date;

  return query
  with roster_periodo as (
    select distinct
      ae.professor_id as prof_id,
      ae.unidade_id as uid,
      coalesce(
        aa.aluno_emusys_id::text,
        nullif(a.emusys_student_id, ''),
        nullif(aa.aluno_chave, ''),
        case
          when aa.aluno_id is not null then 'local:' || aa.aluno_id::text
        end
      ) as pessoa_chave,
      d.curso_id as curso_id,
      lower(btrim(ae.tipo::text)) as modalidade,
      case
        when nullif(btrim(ae.turma_nome), '') is not null then
          'turma:'
          || coalesce(
            ae.curso_emusys_id::text,
            lower(btrim(ae.curso_nome)),
            'sem-curso'
          )
          || ':' || lower(btrim(ae.turma_nome))
        else
          'individual:' || coalesce(
            ae.matricula_disciplina_id::text,
            coalesce(
              aa.aluno_emusys_id::text,
              nullif(a.emusys_student_id, ''),
              nullif(aa.aluno_chave, ''),
              case
                when aa.aluno_id is not null then 'local:' || aa.aluno_id::text
              end
            )
            || ':' || coalesce(
              ae.curso_emusys_id::text,
              lower(btrim(ae.curso_nome)),
              'sem-curso'
            )
            || ':' || extract(isodow from ae.data_aula)::text
            || ':' || to_char(
              ae.data_hora_inicio at time zone 'America/Sao_Paulo',
              'HH24:MI'
            ),
            'evento:' || ae.id::text
          )
      end as turma_chave,
      not coalesce(c.is_projeto_banda, false) as elegivel_media,
      'evento'::text as fonte,
      d.curso_id is not null as curso_resolvido,
      coalesce(
        lower(btrim(ae.tipo::text)) in ('individual', 'turma'),
        false
      ) as modalidade_resolvida,
      case
        when d.curso_id is null then 'curso_nao_resolvido'
        when lower(btrim(ae.tipo::text)) in ('individual', 'turma')
          then 'resolvido'
        else 'modalidade_nao_resolvida'
      end::text as estado_resolucao
    from public.aulas_emusys ae
    join public.aula_alunos_emusys aa
      on aa.aula_emusys_id = ae.id
    left join public.alunos a
      on a.id = aa.aluno_id
    left join public.curso_emusys_depara d
      on d.unidade_id = ae.unidade_id
     and d.emusys_disciplina_id = ae.curso_emusys_id
    left join public.cursos c
      on c.id = d.curso_id
    where ae.professor_id is not null
      and ae.data_aula between v_inicio and v_fim
      and ae.cancelada = false
      and lower(coalesce(ae.categoria, 'normal')) = 'normal'
      and (p_unidade_id is null or ae.unidade_id = p_unidade_id)
  ),
  presenca_periodo as (
    select distinct
      ae.professor_id as prof_id,
      ae.unidade_id as uid,
      coalesce(
        nullif(a.emusys_student_id, ''),
        'local:' || a.id::text
      ) as pessoa_chave,
      d.curso_id as curso_id,
      lower(btrim(ae.tipo::text)) as modalidade,
      case
        when nullif(btrim(ae.turma_nome), '') is not null then
          'turma:'
          || coalesce(
            ae.curso_emusys_id::text,
            lower(btrim(ae.curso_nome)),
            'sem-curso'
          )
          || ':' || lower(btrim(ae.turma_nome))
        else
          'individual:' || coalesce(
            ae.matricula_disciplina_id::text,
            coalesce(
              nullif(a.emusys_student_id, ''),
              'local:' || a.id::text
            )
            || ':' || coalesce(
              ae.curso_emusys_id::text,
              lower(btrim(ae.curso_nome)),
              'sem-curso'
            )
            || ':' || extract(isodow from ae.data_aula)::text
            || ':' || to_char(
              ae.data_hora_inicio at time zone 'America/Sao_Paulo',
              'HH24:MI'
            ),
            'evento:' || ae.id::text
          )
      end as turma_chave,
      not coalesce(c.is_projeto_banda, false) as elegivel_media,
      'evento'::text as fonte,
      d.curso_id is not null as curso_resolvido,
      coalesce(
        lower(btrim(ae.tipo::text)) in ('individual', 'turma'),
        false
      ) as modalidade_resolvida,
      case
        when d.curso_id is null then 'curso_nao_resolvido'
        when lower(btrim(ae.tipo::text)) in ('individual', 'turma')
          then 'resolvido'
        else 'modalidade_nao_resolvida'
      end::text as estado_resolucao
    from public.aulas_emusys ae
    join public.aluno_presenca ap
      on ap.aula_emusys_id = ae.id
    join public.alunos a
      on a.id = ap.aluno_id
    left join public.curso_emusys_depara d
      on d.unidade_id = ae.unidade_id
     and d.emusys_disciplina_id = ae.curso_emusys_id
    left join public.cursos c
      on c.id = d.curso_id
    where ae.professor_id is not null
      and ae.data_aula between v_inicio and v_fim
      and ae.cancelada = false
      and lower(coalesce(ae.categoria, 'normal')) = 'normal'
      and (p_unidade_id is null or ae.unidade_id = p_unidade_id)
  ),
  eventos_periodo as (
    select distinct
      e.prof_id,
      e.uid,
      e.pessoa_chave,
      e.curso_id,
      e.modalidade,
      e.turma_chave,
      e.elegivel_media,
      e.fonte,
      e.curso_resolvido,
      e.modalidade_resolvida,
      e.estado_resolucao
    from (
      select * from roster_periodo
      union all
      select * from presenca_periodo
    ) e
    where e.pessoa_chave is not null
  ),
  jornada_atual as (
    select distinct
      j.professor_id as prof_id,
      j.unidade_id as uid,
      coalesce(
        j.emusys_aluno_id::text,
        nullif(a.emusys_student_id, ''),
        case
          when j.aluno_id is not null then 'local:' || j.aluno_id::text
        end
      ) as pessoa_chave,
      j.curso_id as curso_id,
      lower(
        btrim(j.payload_snapshot #>> '{disciplina,tipo}')
      ) as modalidade,
      case
        when nullif(
          btrim(j.payload_snapshot #>> '{disciplina,nome_turma}'),
          ''
        ) is not null then
          'turma:'
          || coalesce(
            j.curso_id::text,
            lower(btrim(j.curso_nome_emusys)),
            'sem-curso'
          )
          || ':' || lower(
            btrim(j.payload_snapshot #>> '{disciplina,nome_turma}')
          )
        when lower(
          coalesce(j.payload_snapshot #>> '{disciplina,tipo}', '')
        ) = 'turma'
          and j.dia_semana is not null
          and j.horario is not null then
          'turma:'
          || coalesce(
            j.curso_id::text,
            lower(btrim(j.curso_nome_emusys)),
            'sem-curso'
          )
          || ':' || lower(j.dia_semana)
          || ':' || j.horario
        else
          'individual:' || coalesce(
            j.emusys_matricula_disciplina_id::text,
            j.id::text
          )
      end as turma_chave,
      not coalesce(c.is_projeto_banda, false) as elegivel_media,
      'jornada'::text as fonte,
      j.curso_id is not null as curso_resolvido,
      coalesce(
        lower(
          btrim(j.payload_snapshot #>> '{disciplina,tipo}')
        ) in ('individual', 'turma'),
        false
      ) as modalidade_resolvida,
      case
        when j.curso_id is null then 'curso_nao_resolvido'
        when lower(
          btrim(j.payload_snapshot #>> '{disciplina,tipo}')
        ) in ('individual', 'turma') then 'resolvido'
        else 'modalidade_nao_resolvida'
      end::text as estado_resolucao
    from public.aluno_jornada_matricula_disciplina j
    left join public.alunos a
      on a.id = j.aluno_id
    left join public.cursos c
      on c.id = j.curso_id
    where current_date between v_inicio and v_fim
      and j.status_matricula = 'ativa'
      and j.professor_id is not null
      and (p_unidade_id is null or j.unidade_id = p_unidade_id)
  ),
  legado_periodo as (
    select distinct
      a.professor_atual_id as prof_id,
      a.unidade_id as uid,
      coalesce(
        nullif(a.emusys_student_id, ''),
        'local:' || a.id::text
      ) as pessoa_chave,
      a.curso_id as curso_id,
      null::text as modalidade,
      case
        when a.dia_aula is not null and a.horario_aula is not null then
          'legado:' || a.curso_id::text
          || ':' || lower(a.dia_aula)
          || ':' || a.horario_aula::text
        else 'legado-individual:' || a.id::text
      end as turma_chave,
      not coalesce(c.is_projeto_banda, false) as elegivel_media,
      'legado'::text as fonte,
      a.curso_id is not null as curso_resolvido,
      false as modalidade_resolvida,
      'modalidade_nao_resolvida'::text as estado_resolucao
    from public.alunos a
    join public.cursos c
      on c.id = a.curso_id
    where a.professor_atual_id is not null
      and coalesce(
        a.data_matricula,
        a.data_inicio_contrato,
        a.created_at::date
      ) <= v_fim
      and (a.data_saida is null or a.data_saida > v_fim)
      and (
        a.arquivado_em is null
        or (a.arquivado_em at time zone 'America/Sao_Paulo')::date > v_fim
      )
      and (
        lower(coalesce(a.status, 'ativo')) in ('ativo', 'ativa')
        or a.data_saida > v_fim
      )
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
  ),
  fontes as (
    select * from jornada_atual
    union all
    select * from eventos_periodo
    union all
    select * from legado_periodo
  ),
  fonte_preferida as (
    select
      f.prof_id,
      f.uid,
      case
        when bool_or(f.fonte = 'jornada') then 'jornada'
        when bool_or(f.fonte = 'evento') then 'evento'
        else 'legado'
      end as fonte
    from fontes f
    where f.pessoa_chave is not null
    group by f.prof_id, f.uid
  ),
  base_carteira as (
    select distinct
      f.prof_id,
      f.uid,
      f.pessoa_chave,
      f.curso_id,
      f.modalidade,
      f.turma_chave,
      f.elegivel_media,
      f.fonte,
      f.curso_resolvido,
      f.modalidade_resolvida,
      f.estado_resolucao
    from fontes f
    join fonte_preferida fp
      on fp.prof_id = f.prof_id
     and fp.uid = f.uid
     and fp.fonte = f.fonte
    where f.pessoa_chave is not null
  ),
  base_ocupacao as (
    select
      b.*,
      case
        when b.fonte = 'jornada'
          or b.turma_chave like 'turma:%'
          or b.turma_chave ~ '^individual:[0-9]+$'
        then b.turma_chave
        else null
      end::text as ocupacao_chave
    from base_carteira b
  ),
  carteira_detalhada as (
    select
      b.prof_id,
      b.uid,
      count(distinct b.pessoa_chave)::integer
        as carteira_total_detalhado
    from base_ocupacao b
    group by b.prof_id, b.uid
  ),
  snapshot as (
    select
      s.professor_id as prof_id,
      s.unidade_id as uid,
      s.carteira_alunos as carteira_total_auditado
    from public.professor_carteira_mensal_canonica s
    where v_periodo_mensal
      and s.competencia = v_competencia
      and (p_unidade_id is null or s.unidade_id = p_unidade_id)
  ),
  universo as (
    select
      coalesce(s.prof_id, cd.prof_id) as prof_id,
      coalesce(s.uid, cd.uid) as uid,
      s.carteira_total_auditado,
      coalesce(cd.carteira_total_detalhado, 0)
        as carteira_total_detalhado
    from carteira_detalhada cd
    full join snapshot s
      on s.prof_id = cd.prof_id
     and s.uid = cd.uid
  ),
  universo_diagnosticado as (
    select
      u.*,
      (
        u.carteira_total_auditado is not null
        and u.carteira_total_auditado
          is distinct from u.carteira_total_detalhado
      ) as segmentacao_incompleta
    from universo u
  )
  select
    b.prof_id,
    b.uid,
    b.pessoa_chave,
    b.curso_id,
    b.modalidade,
    b.turma_chave,
    b.elegivel_media,
    b.fonte,
    b.curso_resolvido,
    b.modalidade_resolvida,
    b.estado_resolucao,
    b.ocupacao_chave,
    u.carteira_total_auditado,
    u.carteira_total_detalhado,
    u.segmentacao_incompleta
  from base_ocupacao b
  join universo_diagnosticado u
    on u.prof_id = b.prof_id
   and u.uid = b.uid

  union all

  select
    u.prof_id,
    u.uid,
    null::text as pessoa_chave,
    null::integer as curso_id,
    null::text as modalidade,
    null::text as turma_chave,
    false as elegivel_media,
    'snapshot_auditado'::text as fonte,
    false as curso_resolvido,
    false as modalidade_resolvida,
    'sem_detalhe_reconstruido'::text as estado_resolucao,
    null::text as ocupacao_chave,
    u.carteira_total_auditado,
    u.carteira_total_detalhado,
    u.segmentacao_incompleta
  from universo_diagnosticado u
  where not exists (
    select 1
    from base_ocupacao b
    where b.prof_id = u.prof_id
      and b.uid = u.uid
  )
  order by 1, 2, 3 nulls last, 6 nulls last;
end;
$$;

create or replace function public.get_carteira_professor_periodo_canonica(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table (
  professor_id integer,
  unidade_id uuid,
  carteira_alunos integer,
  media_alunos_turma numeric,
  total_turmas integer,
  alunos_via_turmas integer,
  turmas_elegiveis_media integer,
  fonte_carteira text
)
language sql
stable
set search_path = public
as $$
  with detalhe as (
    select d.*
    from public.get_carteira_professor_periodo_detalhe_canonico_v1(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    ) d
  ),
  agregado as (
    select
      d.professor_id as prof_id,
      d.unidade_id as uid,
      coalesce(
        max(d.carteira_total_auditado),
        count(distinct d.pessoa_chave)::integer,
        0
      )::integer as carteira_alunos,
      count(distinct d.turma_chave)::integer as total_turmas,
      count(distinct jsonb_build_array(
        d.pessoa_chave,
        d.ocupacao_chave
      )) filter (
        where d.elegivel_media
          and d.pessoa_chave is not null
      )::integer as alunos_via_turmas,
      count(distinct d.turma_chave) filter (
        where d.elegivel_media
      )::integer as turmas_elegiveis_media,
      case
        when max(d.carteira_total_auditado) is not null
          then 'snapshot_auditado'
        else coalesce(
          min(d.fonte) filter (
            where d.pessoa_chave is not null
              and d.fonte <> 'snapshot_auditado'
          ),
          'sem_base'
        )
      end::text as fonte_carteira
    from detalhe d
    group by d.professor_id, d.unidade_id
  )
  select
    a.prof_id,
    a.uid,
    a.carteira_alunos,
    case
      when a.turmas_elegiveis_media > 0 then round(
        a.alunos_via_turmas::numeric / a.turmas_elegiveis_media,
        2
      )
      else 0
    end::numeric(10, 2) as media_alunos_turma,
    a.total_turmas,
    a.alunos_via_turmas,
    a.turmas_elegiveis_media,
    a.fonte_carteira
  from agregado a
  order by a.prof_id, a.uid;
$$;

revoke all on function
  public.get_carteira_professor_periodo_detalhe_canonico_v1(
    integer,
    integer,
    uuid,
    date,
    date
  )
  from public, anon, authenticated;
grant execute on function
  public.get_carteira_professor_periodo_detalhe_canonico_v1(
    integer,
    integer,
    uuid,
    date,
    date
  )
  to service_role;

revoke all on function public.get_carteira_professor_periodo_canonica(
  integer,
  integer,
  uuid,
  date,
  date
) from public, anon, authenticated;
grant execute on function public.get_carteira_professor_periodo_canonica(
  integer,
  integer,
  uuid,
  date,
  date
) to service_role;

comment on function
  public.get_carteira_professor_periodo_detalhe_canonico_v1(
    integer,
    integer,
    uuid,
    date,
    date
  ) is
  'Base detalhada unica da carteira: pessoa, turma, curso e modalidade oficial Emusys. Snapshot sem decomposicao preserva o total auditado e marca segmentacao_incompleta.';

comment on function public.get_carteira_professor_periodo_canonica(
  integer,
  integer,
  uuid,
  date,
  date
) is
  'Carteira por pessoa e media por ocupacao pessoa/turma, agregadas exclusivamente da base detalhada canonica v1.';
