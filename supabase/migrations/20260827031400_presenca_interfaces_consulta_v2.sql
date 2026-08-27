-- Checkpoint 8.3: contratos de detalhe para as telas de presenca.
-- Regular usa exclusivamente a ocorrencia canonica v2. Experimental permanece
-- em contrato proprio e nunca entra em frequencia, ranking ou Health Score.

create or replace function public.get_presenca_ocorrencias_periodo_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_professor_id integer default null,
  p_aluno_id integer default null
)
returns table (
  slot_key text,
  aluno_id integer,
  aluno_nome text,
  unidade_id uuid,
  professor_id integer,
  professor_nome text,
  data_aula date,
  horario_aula time,
  curso_nome text,
  resultado_canonico text,
  fonte_decisao text,
  possui_conflito boolean,
  turma_nome text,
  sala_nome text,
  anotacoes text,
  duracao_minutos integer,
  tipo text,
  nr_da_aula integer,
  qtd_alunos integer,
  universo_eventos bigint,
  presentes bigint,
  faltas bigint,
  faltas_justificadas bigint,
  dados_status text,
  estado_publicacao text,
  sincronizado_em timestamptz,
  regra_versao text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_data_inicio is null
     or p_data_fim is null
     or p_data_inicio > p_data_fim
     or p_data_fim - p_data_inicio > 370 then
    raise exception using
      errcode = '22023',
      message = 'PRESENCA_OCORRENCIAS_PERIODO_INVALIDO';
  end if;

  return query
  with permitida as (
    select o.*
    from public.vw_presenca_ocorrencia_canonica_v2 o
    where o.data_aula between p_data_inicio and p_data_fim
      and (p_unidade_id is null or o.unidade_id = p_unidade_id)
      and (p_professor_id is null or o.professor_id = p_professor_id)
      and (p_aluno_id is null or o.aluno_id = p_aluno_id)
      and (
        current_setting('request.jwt.claim.role', true) = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          current_setting('request.jwt.claim.role', true) = 'authenticated'
          and (
            (select public.is_admin())
            or o.unidade_id in (select public.get_user_unidade_ids())
          )
        )
      )
  ), frescor as (
    select
      u.unidade_id,
      public.fn_presenca_estado_publicacao_periodo_v2(
        u.unidade_id, p_data_inicio, p_data_fim
      ) as envelope
    from (select distinct p.unidade_id from permitida p) u
  ), enriquecida as (
    select
      p.*,
      a.nome::text as aluno_nome,
      pr.nome::text as professor_nome,
      ae.anotacoes::text,
      ae.duracao_minutos::integer,
      ae.tipo::text,
      ae.nr_da_aula::integer,
      ae.qtd_alunos::integer,
      f.envelope,
      count(*) filter (
        where p.resultado_canonico in (
          'presente', 'falta', 'falta_justificada'
        )
      ) over (partition by p.unidade_id)::bigint as universo_eventos,
      count(*) filter (where p.resultado_canonico = 'presente')
        over (partition by p.unidade_id)::bigint as presentes,
      count(*) filter (where p.resultado_canonico = 'falta')
        over (partition by p.unidade_id)::bigint as faltas,
      count(*) filter (where p.resultado_canonico = 'falta_justificada')
        over (partition by p.unidade_id)::bigint as faltas_justificadas
    from permitida p
    join public.alunos a on a.id = p.aluno_id
    left join public.professores pr on pr.id = p.professor_id
    left join lateral (
      select x.anotacoes, x.duracao_minutos, x.tipo, x.nr_da_aula,
             x.qtd_alunos
      from public.aulas_emusys x
      where x.id = any(p.ids_aulas_emusys)
      order by x.id
      limit 1
    ) ae on true
    join frescor f on f.unidade_id = p.unidade_id
  )
  select
    e.slot_key,
    e.aluno_id,
    e.aluno_nome,
    e.unidade_id,
    e.professor_id,
    e.professor_nome,
    e.data_aula,
    e.data_hora_inicio::time,
    e.curso_nome,
    e.resultado_canonico,
    e.fonte_decisao,
    e.possui_conflito,
    null::text as turma_nome,
    null::text as sala_nome,
    e.anotacoes,
    e.duracao_minutos,
    e.tipo,
    e.nr_da_aula,
    e.qtd_alunos,
    e.universo_eventos,
    e.presentes,
    e.faltas,
    e.faltas_justificadas,
    e.envelope ->> 'dados_status',
    case
      when e.envelope ->> 'estado_publicacao' = 'publicavel'
       and not e.possui_conflito
       and e.resultado_canonico <> 'indeterminado'
        then 'publicado'
      else 'em_auditoria'
    end,
    nullif(e.envelope ->> 'sincronizado_em', '')::timestamptz,
    e.regra_versao || '+interface-consulta-v2.1'
  from enriquecida e
  order by e.data_aula, e.data_hora_inicio, e.aluno_nome, e.slot_key;
end;
$$;

revoke all on function public.get_presenca_ocorrencias_periodo_v2(
  uuid, date, date, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_presenca_ocorrencias_periodo_v2(
  uuid, date, date, integer, integer
) to authenticated, service_role;

create or replace function public.get_presenca_experimental_aluno_periodo_v1(
  p_unidade_id uuid,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_aluno_id integer default null
)
returns table (
  aluno_id integer,
  aluno_nome text,
  unidade_id uuid,
  data_aula date,
  horario_aula time,
  curso_nome text,
  resultado text,
  professor_nome text,
  turma_nome text,
  sala_nome text,
  anotacoes text,
  duracao_minutos integer,
  tipo text,
  nr_da_aula integer,
  qtd_alunos integer,
  fonte text,
  estado_publicacao text,
  regra_versao text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select distinct on (
    ap.aluno_id, ap.unidade_id, ap.data_aula, ap.horario_aula,
    lower(coalesce(ap.curso_nome, ''))
  )
    ap.aluno_id,
    a.nome::text,
    ap.unidade_id,
    ap.data_aula,
    ap.horario_aula::time,
    ap.curso_nome::text,
    case
      when lower(ap.status::text) = 'presente' then 'presente'
      when lower(ap.status::text) = 'ausente' then 'falta'
      else 'indeterminado'
    end,
    ae.professor_nome::text,
    ap.turma_nome::text,
    ap.sala_nome::text,
    ae.anotacoes::text,
    ae.duracao_minutos::integer,
    ae.tipo::text,
    ae.nr_da_aula::integer,
    ae.qtd_alunos::integer,
    'presenca-experimental'::text,
    'experimental'::text,
    'presenca-experimental-v1.1'::text
  from public.aluno_presenca ap
  join public.alunos a on a.id = ap.aluno_id
  join public.aulas_emusys ae
    on ae.id = ap.aula_emusys_id
   and ae.unidade_id = ap.unidade_id
  where coalesce(ae.categoria, 'normal') = 'experimental'
    and (p_unidade_id is null or ap.unidade_id = p_unidade_id)
    and (p_aluno_id is null or ap.aluno_id = p_aluno_id)
    and (p_data_inicio is null or ap.data_aula >= p_data_inicio)
    and (p_data_fim is null or ap.data_aula <= p_data_fim)
    and lower(ap.status::text) in ('presente', 'ausente')
    and (
      current_setting('request.jwt.claim.role', true) = 'service_role'
      or session_user::text in ('postgres', 'service_role')
      or (
        current_setting('request.jwt.claim.role', true) = 'authenticated'
        and (
          (select public.is_admin())
          or ap.unidade_id in (select public.get_user_unidade_ids())
        )
      )
    )
  order by
    ap.aluno_id, ap.unidade_id, ap.data_aula, ap.horario_aula,
    lower(coalesce(ap.curso_nome, '')),
    ap.respondido_em desc nulls last,
    ap.id;
$$;

revoke all on function public.get_presenca_experimental_aluno_periodo_v1(
  uuid, date, date, integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_presenca_experimental_aluno_periodo_v1(
  uuid, date, date, integer
) to authenticated, service_role;

