-- Regra canônica de elegibilidade de pendência de presença.
--
-- A pendência pertence ao par aluno/aula, portanto o trancamento precisa ser
-- resolvido na mesma unidade e na mesma jornada de matricula-disciplina. A linha
-- de turma do Emusys pode não trazer matricula_disciplina_id; nesse caso o
-- fallback por curso só é usado quando há curso explícito, para não esconder
-- outro curso do mesmo aluno por coincidência de valores nulos.
create or replace function public.fn_presenca_pendencia_elegivel(
  p_unidade_id uuid,
  p_aluno_id integer,
  p_data_aula date,
  p_matricula_disciplina_id bigint,
  p_curso_nome text
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select not exists (
    select 1
      from public.aluno_jornada_matricula_disciplina j
     where j.unidade_id = p_unidade_id
       and j.aluno_id = p_aluno_id
       and j.status_matricula = 'trancada'
       and j.trancamento_data_inicial is not null
       and j.trancamento_data_inicial <= p_data_aula
       and (j.trancamento_data_final is null or j.trancamento_data_final >= p_data_aula)
       and (
         (
           coalesce(p_matricula_disciplina_id, 0) > 0
           and j.emusys_matricula_disciplina_id = p_matricula_disciplina_id
         )
         or (
           coalesce(p_matricula_disciplina_id, 0) = 0
           and nullif(btrim(coalesce(p_curso_nome, '')), '') is not null
           and lower(btrim(j.curso_nome_emusys)) = lower(btrim(p_curso_nome))
         )
       )
  );
$function$;

revoke all on function public.fn_presenca_pendencia_elegivel(uuid, integer, date, bigint, text)
  from public, anon, authenticated;
grant execute on function public.fn_presenca_pendencia_elegivel(uuid, integer, date, bigint, text)
  to service_role, sol_acesso_restrito, mila_acesso_restrito, fabio_agent, lia_acesso_restrito;

comment on function public.fn_presenca_pendencia_elegivel(uuid, integer, date, bigint, text) is
  'Define se a pendência pode aparecer para um aluno/aula. Oculta somente trancamento da mesma unidade e jornada com início até a data da aula; preserva histórico anterior ao trancamento e outro curso.';

create or replace function public.fn_presenca_pendencias_do_dia(
  p_unidade_id uuid,
  p_data date
)
returns table(
  motivo text,
  professor_nome text,
  curso_nome text,
  turma_nome text,
  hora text,
  aluno_nome text,
  detalhe text
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  with pares as (
    select distinct
           ae.unidade_id,
           ae.professor_id,
           ae.data_aula,
           ae.data_hora_inicio,
           ae.matricula_disciplina_id,
           r.aluno_id,
           ae.curso_nome,
           ae.turma_nome
      from public.aulas_emusys ae
      join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id
     where ae.unidade_id = p_unidade_id
       and ae.data_aula = p_data
       and ae.data_hora_fim < now()
       and not coalesce(ae.cancelada, false)
       and ae.professor_id is not null
       and r.aluno_id is not null
       and ae.id = public.fn_aula_operacional_id(ae.id)
       and public.fn_presenca_pendencia_elegivel(
         ae.unidade_id,
         r.aluno_id,
         ae.data_aula,
         ae.matricula_disciplina_id,
         ae.curso_nome
       )
  ),
  sem_resposta as (
    select 'sem_resposta'::text as motivo, p.*, null::text as detalhe
      from pares p
     where not exists (
       select 1 from public.aluno_presenca ap
       join public.aulas_emusys g on g.id = ap.aula_emusys_id
        where ap.aluno_id = p.aluno_id
          and g.professor_id = p.professor_id
          and g.data_hora_inicio = p.data_hora_inicio
          and public.fn_presenca_fecha_chamada(ap.status_presenca, ap.respondido_por)
     )
  ),
  divergencia as (
    select 'divergencia'::text as motivo, p.*,
           (
             select string_agg(
               distinct public.fn_presenca_fonte_legivel(ap.respondido_por)
                 || ' diz ' || ap.status_presenca,
               '   x   '
             )
               from public.aluno_presenca ap
               join public.aulas_emusys g on g.id = ap.aula_emusys_id
              where ap.aluno_id = p.aluno_id
                and g.professor_id = p.professor_id
                and g.data_hora_inicio = p.data_hora_inicio
                and public.fn_presenca_e_forte(ap.respondido_por)
           ) as detalhe
      from pares p
     where (
       select count(distinct ap.status_presenca)
         from public.aluno_presenca ap
         join public.aulas_emusys g on g.id = ap.aula_emusys_id
        where ap.aluno_id = p.aluno_id
          and g.professor_id = p.professor_id
          and g.data_hora_inicio = p.data_hora_inicio
          and public.fn_presenca_e_forte(ap.respondido_por)
     ) > 1
  ),
  tudo as (
    select * from sem_resposta
    union all
    select * from divergencia
  )
  select t.motivo,
         coalesce(pr.nome, '(sem professor)')::text,
         coalesce(t.curso_nome, t.turma_nome, 'Aula')::text,
         t.turma_nome::text,
         to_char(t.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
         al.nome::text,
         t.detalhe
    from tudo t
    join public.alunos al on al.id = t.aluno_id
    left join public.professores pr on pr.id = t.professor_id
   order by t.motivo, 2, 5, 6;
$function$;

create or replace view public.vw_presenca_pendencia as
select
  ae.unidade_id,
  u.nome as unidade_nome,
  ae.professor_id,
  p.nome as professor_nome,
  ae.id as aula_id,
  ae.tipo,
  ae.data_aula,
  ae.data_hora_inicio,
  ae.data_hora_fim,
  to_char(ae.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
  ae.curso_nome,
  ae.turma_nome,
  r.aluno_id,
  al.nome as aluno_nome,
  split_part(btrim(al.nome), ' ', 1) as aluno_primeiro_nome,
  coalesce(adm.justificada, false) as justificada,
  floor(extract(epoch from (now() - ae.data_hora_fim)) / 86400)::integer as dias_em_atraso
from public.aulas_emusys ae
join public.aula_alunos_emusys r
  on r.aula_emusys_id = ae.id
 and r.aluno_id is not null
join public.alunos al on al.id = r.aluno_id
join public.unidades u on u.id = ae.unidade_id
left join public.professores p on p.id = ae.professor_id
left join public.aluno_presenca_administrativo adm
  on adm.aula_emusys_id = ae.id
 and adm.aluno_id = r.aluno_id
where ae.id = public.fn_aula_operacional_id(ae.id)
  and coalesce(ae.cancelada, false) = false
  and ae.professor_id is not null
  and ae.data_hora_fim < now()
  and ae.data_aula >= current_date - 45
  and public.fn_presenca_pendencia_elegivel(
    ae.unidade_id,
    r.aluno_id,
    ae.data_aula,
    ae.matricula_disciplina_id,
    ae.curso_nome
  )
  and not exists (
    select 1
      from public.aluno_presenca ap
     where ap.aula_emusys_id = ae.id
       and ap.aluno_id = r.aluno_id
       and public.fn_presenca_fecha_chamada(
         coalesce(
           ap.status_presenca,
           case ap.status
             when 'presente' then 'presente'
             when 'ausente' then 'falta'
             else null
           end
         ),
         ap.respondido_por
       )
  );

-- A reconciliacao já registra esta origem; a constraint antiga é que impedia o
-- update e abortava o webhook.
alter table public.aulas_emusys
  drop constraint if exists aulas_emusys_cancelada_origem_check;
alter table public.aulas_emusys
  add constraint aulas_emusys_cancelada_origem_check
  check (
    cancelada_origem is null
    or cancelada_origem in ('emusys', 'agenda_secretaria', 'sync_ausente_emusys')
  );

-- Reconcilia a grade de UM aluno contra a foto viva do Emusys.
-- A janela aceita ontem para absorver webhook recebido após o relatório de 9h,
-- mas não varre histórico anterior. A unidade de decisão continua sendo o SLOT.
create or replace function public.reconciliar_grade_aluno_v1(
  p_aluno_emusys_id bigint,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_ids_vivos integer[],
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_detalhe jsonb;
  v_ids integer[];
  v_aplicadas integer := 0;
begin
  -- Foto vazia não é prova de que as aulas sumiram. Pode ser erro de token,
  -- paginação interrompida ou aluno errado.
  if p_ids_vivos is null or cardinality(p_ids_vivos) = 0 then
    return jsonb_build_object(
      'status','abortado',
      'motivo','API nao devolveu nenhuma aula viva para o aluno na janela',
      'aplicadas',0
    );
  end if;

  -- A correção automática é limitada ao dia anterior no fuso da operação.
  if p_data_inicio < ((now() at time zone 'America/Sao_Paulo')::date - 1) then
    return jsonb_build_object(
      'status','abortado',
      'motivo','p_data_inicio anterior a ontem - janela limitada de reconciliacao',
      'aplicadas',0
    );
  end if;

  with
  slots_ausentes as (
    select distinct
           a.unidade_id,
           a.data_hora_inicio,
           coalesce(a.turma_nome,'') as turma_nome,
           coalesce(a.professor_nome,'') as professor_nome,
           coalesce(a.sala_nome,'') as sala_nome
      from public.aulas_emusys a
      join public.aula_alunos_emusys al on al.aula_emusys_id = a.id
     where a.unidade_id = p_unidade_id
       and a.categoria = 'normal'
       and a.cancelada = false
       and a.data_aula between p_data_inicio and p_data_fim
       and al.aluno_emusys_id = p_aluno_emusys_id
       and not (a.emusys_id = any(p_ids_vivos))
  ),
  linhas_do_slot as (
    select
      a.id,
      a.emusys_id,
      a.data_aula,
      a.tipo,
      a.curso_nome,
      a.professor_nome,
      a.sala_nome,
      a.professor_presenca_origem,
      to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI') as hora,
      s.data_hora_inicio,
      s.unidade_id,
      s.turma_nome as slot_turma,
      s.professor_nome as slot_prof,
      s.sala_nome as slot_sala
    from slots_ausentes s
    join public.aulas_emusys a
      on a.unidade_id = s.unidade_id
     and a.data_hora_inicio = s.data_hora_inicio
     and coalesce(a.turma_nome,'') = s.turma_nome
     and coalesce(a.professor_nome,'') = s.professor_nome
     and coalesce(a.sala_nome,'') = s.sala_nome
    where a.categoria = 'normal'
      and a.cancelada = false
      and a.data_aula between p_data_inicio and p_data_fim
  ),
  veredito as (
    select
      l.unidade_id,
      l.data_hora_inicio,
      l.slot_turma,
      l.slot_prof,
      l.slot_sala,
      bool_or(l.emusys_id = any(p_ids_vivos)) as slot_parcialmente_vivo,
      bool_or(exists (
        select 1
          from public.aula_alunos_emusys x
         where x.aula_emusys_id = l.id
           and x.aluno_emusys_id is distinct from p_aluno_emusys_id
      )) as tem_outro_aluno,
      bool_or(
        l.professor_presenca_origem is not null
        or exists (
          select 1
            from public.aluno_presenca ap
           where ap.aula_emusys_id = l.id
             and ap.respondido_por::text in (
               'agenda_secretaria', 'professor_la_teacher', 'fabio_audio', 'manual'
             )
        )
      ) as tem_marcacao_humana,
      array_agg(l.id) as ids,
      min(l.data_aula) as data_aula,
      min(l.hora) as hora,
      string_agg(distinct l.tipo,'+') as tipos,
      min(l.curso_nome) as curso_nome,
      min(l.professor_nome) as professor_nome,
      min(l.sala_nome) as sala_nome,
      count(*)::int as linhas
    from linhas_do_slot l
    group by 1,2,3,4,5
  ),
  julgado as (
    select
      v.*,
      case
        when v.slot_parcialmente_vivo then 'mantido_slot_vivo'
        when v.tem_outro_aluno then 'mantido_outro_aluno'
        when v.tem_marcacao_humana then 'mantido_marcacao_humana'
        else 'cancelar'
      end as acao
    from veredito v
  )
  select
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'data_aula', j.data_aula,
            'hora', j.hora,
            'turma', nullif(j.slot_turma,''),
            'curso', j.curso_nome,
            'professor', j.professor_nome,
            'sala', j.sala_nome,
            'linhas', j.linhas,
            'tipos', j.tipos,
            'aula_ids', to_jsonb(j.ids),
            'acao', j.acao
          ) order by j.data_aula, j.hora
        ),
        '[]'::jsonb
      )
      from julgado j
    ),
    (
      select array_agg(x)
        from julgado j,
             unnest(j.ids) as t(x)
       where j.acao = 'cancelar'
    )
  into v_detalhe, v_ids;

  if not p_dry_run and v_ids is not null and cardinality(v_ids) > 0 then
    update public.aulas_emusys
       set cancelada = true,
           cancelada_origem = 'sync_ausente_emusys',
           cancelada_motivo = 'Aula removida no Emusys (cronograma regerado)',
           cancelada_em = now()
     where id = any(v_ids);
    get diagnostics v_aplicadas = row_count;
  end if;

  return jsonb_build_object(
    'status','ok',
    'dry_run',p_dry_run,
    'aluno_emusys_id',p_aluno_emusys_id,
    'janela',jsonb_build_object('inicio',p_data_inicio,'fim',p_data_fim),
    'ids_vivos',cardinality(p_ids_vivos),
    'slots_avaliados',jsonb_array_length(v_detalhe),
    'a_cancelar',coalesce(cardinality(v_ids),0),
    'aplicadas',v_aplicadas,
    'detalhe',v_detalhe
  );
end;
$function$;

revoke all on function public.reconciliar_grade_aluno_v1(bigint, uuid, date, date, integer[], boolean)
  from public, anon, authenticated;
grant execute on function public.reconciliar_grade_aluno_v1(bigint, uuid, date, date, integer[], boolean)
  to service_role;

comment on function public.reconciliar_grade_aluno_v1(bigint, uuid, date, date, integer[], boolean) is
  'Cancela por slot aulas de um aluno que sumiram do Emusys, da data de ontem em diante. Preserva slot vivo, outro aluno e decisão humana; chamada pela edge reconciliar-grade-aluno.';
