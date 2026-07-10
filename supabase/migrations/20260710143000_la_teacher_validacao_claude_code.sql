-- Correcoes da validacao do contrato LA Teacher.
-- Ponto e agregado por slot; presenca so entra pela aula ancora de turma.

create or replace function public.app_registrar_presencas_aula(
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[] default '{}'::integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professor_id integer := public.fn_professor_do_usuario();
  v_aula public.aulas_emusys%rowtype;
  v_roster_total integer;
  v_ja_existentes integer;
  v_inseridos integer;
begin
  if v_professor_id is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;

  select * into v_aula
  from public.aulas_emusys
  where id = p_aula_emusys_id;

  if not found or v_aula.professor_id is distinct from v_professor_id then
    raise exception 'aula_nao_pertence_ao_professor' using errcode = '42501';
  end if;

  if coalesce(v_aula.cancelada, false) then
    raise exception 'aula_cancelada';
  end if;

  if coalesce(v_aula.tipo, '') <> 'turma' then
    raise exception 'chamada_somente_na_aula_ancora';
  end if;

  if v_aula.data_hora_inicio > now() + interval '15 minutes' then
    raise exception 'chamada_ainda_nao_disponivel';
  end if;

  if coalesce(v_aula.data_hora_fim, v_aula.data_hora_inicio) < now() - interval '24 hours' then
    raise exception 'janela_de_chamada_encerrada';
  end if;

  select count(*), count(*) filter (where aluno_id is null)
  into v_roster_total, v_ja_existentes
  from public.aula_alunos_emusys
  where aula_emusys_id = v_aula.id;

  if v_roster_total = 0 then
    raise exception 'roster_nao_sincronizado';
  end if;

  if v_ja_existentes > 0 then
    raise exception 'roster_incompleto';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_alunos_ausentes, '{}'::integer[])) ausente(aluno_id)
    where not exists (
      select 1
      from public.aula_alunos_emusys r
      where r.aula_emusys_id = v_aula.id
        and r.aluno_id = ausente.aluno_id
    )
  ) then
    raise exception 'aluno_ausente_fora_do_roster';
  end if;

  select count(*) into v_ja_existentes
  from public.aluno_presenca ap
  where ap.aula_emusys_id = v_aula.id;

  if exists (
    select 1
    from public.aluno_presenca ap
    where ap.aula_emusys_id = v_aula.id
      and ap.respondido_por = 'professor_la_teacher'
  ) then
    return jsonb_build_object(
      'aula_id', v_aula.id,
      'total_roster', v_roster_total,
      'inseridos', 0,
      'ignorados_first_write_wins', v_roster_total,
      'ja_havia_registros', true,
      'chamada_ja_enviada', true
    );
  end if;

  insert into public.aluno_presenca (
    aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula, horario_aula,
    status, status_presenca, curso_nome, turma_nome, sala_nome, respondido_por, respondido_em
  )
  select distinct
    r.aluno_id,
    v_aula.id,
    v_professor_id,
    v_aula.unidade_id,
    v_aula.data_aula,
    (v_aula.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
    case when r.aluno_id = any(coalesce(p_alunos_ausentes, '{}'::integer[])) then 'ausente' else 'presente' end,
    case when r.aluno_id = any(coalesce(p_alunos_ausentes, '{}'::integer[])) then 'falta' else 'presente' end,
    v_aula.curso_nome,
    v_aula.turma_nome,
    v_aula.sala_nome,
    'professor_la_teacher',
    now()
  from public.aula_alunos_emusys r
  where r.aula_emusys_id = v_aula.id
    and r.aluno_id is not null
  on conflict (aluno_id, aula_emusys_id) do nothing;

  get diagnostics v_inseridos = row_count;

  return jsonb_build_object(
    'aula_id', v_aula.id,
    'total_roster', v_roster_total,
    'inseridos', v_inseridos,
    'ignorados_first_write_wins', v_roster_total - v_inseridos,
    'ja_havia_registros', v_ja_existentes > 0,
    'chamada_ja_enviada', false
  );
end;
$$;

revoke all on function public.app_registrar_presencas_aula(integer, integer[]) from public, anon;
grant execute on function public.app_registrar_presencas_aula(integer, integer[]) to authenticated;

create or replace function public.app_minha_agenda_sessao(p_data date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_professor_id integer := public.fn_professor_do_usuario();
begin
  if v_professor_id is null then
    return jsonb_build_object('erro', 'sem_professor_vinculado');
  end if;

  return coalesce((
    with aulas_dia as (
      select ae.*
      from public.aulas_emusys ae
      where ae.professor_id = v_professor_id
        and ae.data_aula = p_data
        and ae.cancelada = false
    ), slots as (
      select
        data_hora_inicio,
        data_hora_fim,
        (array_agg(
          id
          order by case when tipo = 'turma' then 0 else 1 end, id
        ))[1] as aula_id_ancora
      from aulas_dia
      group by data_hora_inicio, data_hora_fim
    ), ancoras as (
      select ae.*
      from slots s
      join aulas_dia ae on ae.id = s.aula_id_ancora
    )
    select jsonb_agg(
      jsonb_build_object(
        'aula_id_ancora', ae.id,
        'hora', to_char(ae.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'hora_fim', to_char(ae.data_hora_fim at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'data_hora_inicio', ae.data_hora_inicio,
        'data_hora_fim', ae.data_hora_fim,
        'curso', ae.curso_nome,
        'turma_nome', ae.turma_nome,
        'tipo', ae.tipo,
        'n_alunos', coalesce(roster.n_alunos, 0),
        'n_registradas', coalesce(roster.n_registradas, 0),
        'tem_registro', coalesce(roster.tem_registro, false),
        'roster_incompleto', coalesce(roster.n_sem_vinculo, 0) > 0,
        'alunos', coalesce(roster.alunos, '[]'::jsonb)
      )
      order by ae.data_hora_inicio, ae.id
    )
    from ancoras ae
    left join lateral (
      select
        count(*) as n_alunos,
        count(ap.id) as n_registradas,
        count(*) filter (where r.aluno_id is null) as n_sem_vinculo,
        bool_or(nullif(btrim(coalesce(aula_alvo.anotacoes_fabio, '')), '') is not null) as tem_registro,
        jsonb_agg(
          jsonb_build_object(
            'aluno_id', r.aluno_id,
            'nome', r.aluno_nome,
            'aula_id_alvo', coalesce(aula_alvo.id, ae.id),
            'presenca', coalesce(
              ap.status_presenca,
              case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end,
              'a_confirmar'
            ),
            'tem_presenca_registrada', ap.id is not null,
            'tem_registro', nullif(btrim(coalesce(aula_alvo.anotacoes_fabio, '')), '') is not null,
            'justificada', coalesce(adm.justificada, false)
          )
          order by r.aluno_nome
        ) as alunos
      from public.aula_alunos_emusys r
      left join public.aluno_presenca ap
        on ap.aula_emusys_id = ae.id
       and ap.aluno_id = r.aluno_id
      left join public.aluno_presenca_administrativo adm
        on adm.aula_emusys_id = ae.id
       and adm.aluno_id = r.aluno_id
      left join lateral (
        select alvo.id, alvo.anotacoes_fabio
        from public.aulas_emusys alvo
        join public.aula_alunos_emusys alvo_roster
          on alvo_roster.aula_emusys_id = alvo.id
         and alvo_roster.aluno_id = r.aluno_id
        where alvo.professor_id = v_professor_id
          and alvo.data_aula = p_data
          and alvo.data_hora_inicio = ae.data_hora_inicio
          and alvo.data_hora_fim is not distinct from ae.data_hora_fim
          and coalesce(alvo.cancelada, false) = false
          and coalesce(alvo.tipo, '') <> 'turma'
        order by alvo.id
        limit 1
      ) aula_individual on true
      left join public.aulas_emusys aula_alvo
        on aula_alvo.id = coalesce(aula_individual.id, ae.id)
      where r.aula_emusys_id = ae.id
    ) roster on true
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.app_minha_agenda_sessao(date) from public, anon;
grant execute on function public.app_minha_agenda_sessao(date) to authenticated;

create or replace view public.vw_ponto_professor_diario
with (security_invoker = true)
as
with dias as (
  select professor_id, data_aula
  from public.vw_ponto_professor_aulas
  group by professor_id, data_aula
), aulas_creditadas as (
  select *
  from public.vw_ponto_professor_aulas
  where aula_creditada
), slots_creditados as (
  select distinct on (professor_id, data_aula, data_hora_inicio, data_hora_fim)
    professor_id,
    data_aula,
    data_hora_inicio,
    data_hora_fim,
    duracao_minutos
  from aulas_creditadas
  order by
    professor_id,
    data_aula,
    data_hora_inicio,
    data_hora_fim,
    duracao_minutos desc,
    aula_emusys_id
), flags_slots as (
  select
    professor_id,
    data_aula,
    data_hora_inicio,
    data_hora_fim,
    bool_or(ponta_confirmada) as ponta_confirmada
  from aulas_creditadas
  group by professor_id, data_aula, data_hora_inicio, data_hora_fim
), resumo_slots as (
  select
    s.professor_id,
    s.data_aula,
    min(s.data_hora_inicio) as inicio_creditado,
    max(s.data_hora_fim) as fim_creditado,
    coalesce(sum(s.duracao_minutos), 0)::integer as minutos_creditados,
    count(*)::integer as aulas_creditadas,
    count(*) filter (where f.ponta_confirmada)::integer as pontas_confirmadas
  from slots_creditados s
  join flags_slots f
    using (professor_id, data_aula, data_hora_inicio, data_hora_fim)
  group by s.professor_id, s.data_aula
), unidades_creditadas as (
  select
    professor_id,
    data_aula,
    array_agg(distinct unidade_id order by unidade_id) as unidades_ids
  from aulas_creditadas
  group by professor_id, data_aula
)
select
  d.professor_id,
  d.data_aula,
  u.unidades_ids,
  r.inicio_creditado,
  r.fim_creditado,
  coalesce(r.minutos_creditados, 0)::integer as minutos_creditados,
  coalesce(r.aulas_creditadas, 0)::integer as aulas_creditadas,
  coalesce(r.pontas_confirmadas, 0)::integer as pontas_confirmadas
from dias d
left join resumo_slots r using (professor_id, data_aula)
left join unidades_creditadas u using (professor_id, data_aula);

create or replace function public.app_meu_ponto(
  p_data_inicio date default current_date,
  p_data_fim date default current_date
)
returns table (
  data_aula date,
  unidades_ids uuid[],
  inicio_creditado timestamptz,
  fim_creditado timestamptz,
  minutos_creditados integer,
  aulas_creditadas integer,
  pontas_confirmadas integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.data_aula,
    p.unidades_ids,
    p.inicio_creditado,
    p.fim_creditado,
    p.minutos_creditados,
    p.aulas_creditadas,
    p.pontas_confirmadas
  from public.vw_ponto_professor_diario p
  where p.professor_id = public.fn_professor_do_usuario()
    and p.data_aula between p_data_inicio and p_data_fim
  order by p.data_aula;
$$;

revoke all on function public.app_meu_ponto(date, date) from public, anon;
grant execute on function public.app_meu_ponto(date, date) to authenticated;
revoke all on table public.vw_ponto_professor_diario from public, anon, authenticated;

create or replace view public.vw_disponibilidade_professores
with (security_invoker = true)
as
select
  pu.id as professores_unidade_id,
  pu.professor_id,
  p.nome as professor_nome,
  pu.unidade_id,
  u.nome as unidade_nome,
  coalesce(pu.disponibilidade, '{}'::jsonb) as disponibilidade,
  pu.emusys_id,
  pu.validacao_status,
  pu.last_seen_em,
  proposta.id as proposta_ativa_id,
  proposta.status as proposta_status,
  proposta.disponibilidade_proposta
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
join public.unidades u on u.id = pu.unidade_id
left join lateral (
  select dp.id, dp.status, dp.disponibilidade_proposta
  from public.disponibilidade_professor_propostas dp
  where dp.professor_id = pu.professor_id
    and dp.unidade_id = pu.unidade_id
    and dp.status in ('pendente_aprovacao', 'aprovada_aguardando_emusys')
  order by dp.created_at desc
  limit 1
) proposta on true
where p.ativo = true
  and (
    pu.professor_id = public.fn_professor_do_usuario()
    or public.is_admin()
    or public.usuario_tem_permissao(
      (select usr.id from public.usuarios usr where usr.auth_user_id = auth.uid() limit 1),
      'professores.ver',
      pu.unidade_id
    )
  );

revoke all on table public.vw_disponibilidade_professores from public, anon;
grant select on table public.vw_disponibilidade_professores to authenticated;

create or replace function public.app_minha_disponibilidade()
returns table (
  professores_unidade_id integer,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  unidade_nome text,
  disponibilidade jsonb,
  emusys_id integer,
  validacao_status text,
  last_seen_em timestamptz,
  proposta_ativa_id uuid,
  proposta_status text,
  disponibilidade_proposta jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.professores_unidade_id,
    d.professor_id,
    d.professor_nome,
    d.unidade_id,
    d.unidade_nome,
    d.disponibilidade,
    d.emusys_id,
    d.validacao_status,
    d.last_seen_em,
    d.proposta_ativa_id,
    d.proposta_status,
    d.disponibilidade_proposta
  from public.vw_disponibilidade_professores d
  where d.professor_id = public.fn_professor_do_usuario()
  order by d.unidade_nome;
$$;

revoke all on function public.app_minha_disponibilidade() from public, anon;
grant execute on function public.app_minha_disponibilidade() to authenticated;

comment on view public.vw_ponto_professor_diario is
  'Ponto diario derivado por slots distintos, sem multiplicar turma e individuais paralelas.';
comment on function public.app_minha_agenda_sessao(date) is
  'Agenda v5: agrupa por slot, usa turma como ancora e preserva aula individual como alvo do Fabio.';
comment on function public.app_minha_disponibilidade() is
  'Disponibilidade oficial do Emusys filtrada pelo professor autenticado.';
