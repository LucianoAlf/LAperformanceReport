-- Ajustes encontrados na revisao: dias reais com acento, ponto multiunidade e chamada imutavel.

alter table public.aluno_presenca_retificacoes
  add column if not exists respondido_por_anterior text,
  add column if not exists respondido_em_anterior timestamptz;

create or replace function public.fn_completar_origem_retificacao_presenca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_respondido_por text;
  v_respondido_em timestamptz;
begin
  select ap.respondido_por, ap.respondido_em
  into v_respondido_por, v_respondido_em
  from public.aluno_presenca ap
  where ap.id = new.aluno_presenca_id;

  new.respondido_por_anterior := coalesce(new.respondido_por_anterior, v_respondido_por);
  new.respondido_em_anterior := coalesce(new.respondido_em_anterior, v_respondido_em);
  return new;
end;
$$;

drop trigger if exists completar_origem_retificacao_presenca
  on public.aluno_presenca_retificacoes;
create trigger completar_origem_retificacao_presenca
  before insert on public.aluno_presenca_retificacoes
  for each row execute function public.fn_completar_origem_retificacao_presenca();

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

drop function if exists public.app_meu_ponto(date, date);
drop view if exists public.vw_ponto_professor_diario;

create view public.vw_ponto_professor_diario
with (security_invoker = true)
as
select
  professor_id,
  data_aula,
  array_agg(distinct unidade_id order by unidade_id) filter (where aula_creditada) as unidades_ids,
  min(data_hora_inicio) filter (where aula_creditada) as inicio_creditado,
  max(data_hora_fim) filter (where aula_creditada) as fim_creditado,
  coalesce(sum(duracao_minutos) filter (where aula_creditada), 0)::integer as minutos_creditados,
  count(*) filter (where aula_creditada)::integer as aulas_creditadas,
  count(*) filter (where aula_creditada and ponta_confirmada)::integer as pontas_confirmadas
from public.vw_ponto_professor_aulas
group by professor_id, data_aula;

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
revoke all on table public.vw_ponto_professor_diario from anon, authenticated;

create or replace function public.fn_disponibilidade_professor_valida(p_disponibilidade jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_dia record;
  v_inicio time;
  v_fim time;
begin
  if p_disponibilidade is null or jsonb_typeof(p_disponibilidade) <> 'object' then
    return false;
  end if;

  for v_dia in select key, value from jsonb_each(p_disponibilidade)
  loop
    if not (
         v_dia.key in (
           'Segunda', 'Segunda-feira',
           'Terca', 'Terca-feira',
           'Quarta', 'Quarta-feira',
           'Quinta', 'Quinta-feira',
           'Sexta', 'Sexta-feira',
           'Sabado', 'Sabado-feira',
           'Domingo'
         )
         or encode(convert_to(v_dia.key, 'UTF8'), 'hex') in (
           '546572c3a761',
           '546572c3a7612d6665697261',
           '53c3a16261646f',
           '53c3a16261646f2d6665697261'
         )
       )
       or jsonb_typeof(v_dia.value) <> 'object'
       or not (v_dia.value ? 'inicio')
       or not (v_dia.value ? 'fim')
       or (v_dia.value ->> 'inicio') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (v_dia.value ->> 'fim') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;

    v_inicio := (v_dia.value ->> 'inicio')::time;
    v_fim := (v_dia.value ->> 'fim')::time;
    if v_inicio >= v_fim then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.fn_disponibilidade_professor_valida(jsonb) from public, anon;
