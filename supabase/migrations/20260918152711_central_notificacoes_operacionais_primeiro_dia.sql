-- Ajustes observados no primeiro dia da central de notificacoes operacionais.
--
-- Mantem a projecao append-only: apenas corrige a origem de um fato ja criado
-- por webhook e consolida duplicatas historicas da mesma sessao de turma.
-- Todos os gatilhos continuam isolados para nunca interromper o sync/webhook.

alter table public.eventos_operacionais
  drop constraint if exists eventos_operacionais_tipo_check;
alter table public.eventos_operacionais
  add constraint eventos_operacionais_tipo_check check (tipo in (
    'aula_reagendada',
    'aula_cancelada',
    'professor_trocado',
    'experimental_marcada',
    'experimental_convertida',
    'aluno_novo',
    'aviso_previo',
    'matricula_trancada',
    'matricula_encerrada',
    'matricula_alterada'
  ));

create or replace function public.fn_eventos_operacionais_chave_sessao_aula(
  p_unidade_id uuid,
  p_turma_nome text,
  p_curso_emusys_id integer,
  p_inicio_referencia timestamptz,
  p_emusys_id integer,
  p_aula_id integer
)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select case
    when nullif(btrim(p_turma_nome), '') is null then
      'aula:' || coalesce(p_emusys_id, p_aula_id)::text
    else
      'turma:' || md5(jsonb_build_object(
        'unidade_id', p_unidade_id,
        'turma', lower(btrim(p_turma_nome)),
        'curso_emusys_id', p_curso_emusys_id,
        'inicio_referencia', p_inicio_referencia
      )::text)
  end;
$$;

revoke all on function public.fn_eventos_operacionais_chave_sessao_aula(
  uuid, text, integer, timestamptz, integer, integer
) from public, anon, authenticated, service_role;

create or replace function public.trg_eventos_operacionais_aula_reagendada()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_aluno_id integer;
  v_aluno_nome text;
  v_audiencia jsonb;
  v_mudanca jsonb;
  v_aula jsonb;
  v_chave_sessao text;
begin
  if not public.fn_eventos_operacionais_na_janela_aula(
    old.data_hora_inicio,
    new.data_hora_inicio
  ) then
    return new;
  end if;

  if nullif(btrim(new.turma_nome), '') is null then
    select x.aluno_id, x.aluno_nome
      into v_aluno_id, v_aluno_nome
      from public.fn_eventos_operacionais_aluno_da_aula(
        new.id,
        new.unidade_id,
        new.matricula_disciplina_id
      ) x;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('professor_id', p.professor_id, 'participacao', 'responsavel') order by p.professor_id),
    '[]'::jsonb
  ) into v_audiencia
  from (
    select distinct professor_id
    from (values (old.professor_id), (new.professor_id)) ids(professor_id)
    where professor_id is not null
  ) p;

  if v_audiencia = '[]'::jsonb then
    return new;
  end if;

  v_mudanca := jsonb_build_object(
    'antes', jsonb_build_object('inicio', old.data_hora_inicio),
    'depois', jsonb_build_object('inicio', new.data_hora_inicio)
  );
  v_aula := jsonb_build_object(
    'emusys_id', coalesce(new.emusys_id, new.id),
    'inicio', new.data_hora_inicio,
    'fim', new.data_hora_fim,
    'turma', new.turma_nome
  );
  v_chave_sessao := public.fn_eventos_operacionais_chave_sessao_aula(
    new.unidade_id,
    new.turma_nome,
    new.curso_emusys_id,
    coalesce(new.data_hora_inicio_original, old.data_hora_inicio, new.data_hora_inicio),
    new.emusys_id,
    new.id
  );

  perform public.fn_eventos_operacionais_registrar(
    'u:' || new.unidade_id::text || ':' || v_chave_sessao
      || ':aula_reagendada:' || md5(v_mudanca::text),
    'aula_reagendada',
    null,
    'sincronizacao',
    new.unidade_id,
    v_aluno_id,
    v_aluno_nome,
    new.id,
    new.curso_nome,
    v_aula,
    v_mudanca,
    null,
    null,
    v_audiencia
  );
  return new;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_AULA_REAGENDADA_FALHOU aula=% sqlstate=%', new.id, sqlstate;
  return new;
end;
$$;

create or replace function public.trg_eventos_operacionais_aula_cancelada()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_aluno_id integer;
  v_aluno_nome text;
  v_audiencia jsonb;
  v_mudanca jsonb;
  v_aula jsonb;
  v_inicio_anterior timestamptz;
  v_chave_sessao text;
begin
  v_inicio_anterior := case
    when tg_op = 'INSERT' then null
    else old.data_hora_inicio
  end;

  if not public.fn_eventos_operacionais_na_janela_aula(
    v_inicio_anterior,
    new.data_hora_inicio
  ) then
    return new;
  end if;

  if nullif(btrim(new.turma_nome), '') is null then
    select x.aluno_id, x.aluno_nome
      into v_aluno_id, v_aluno_nome
      from public.fn_eventos_operacionais_aluno_da_aula(
        new.id,
        new.unidade_id,
        new.matricula_disciplina_id
      ) x;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('professor_id', p.professor_id, 'participacao', 'responsavel') order by p.professor_id),
    '[]'::jsonb
  ) into v_audiencia
  from (
    select distinct professor_id
    from (
      values (
        case when tg_op = 'INSERT' then null else old.professor_id end
      ), (new.professor_id)
    ) ids(professor_id)
    where professor_id is not null
  ) p;

  if v_audiencia = '[]'::jsonb then
    return new;
  end if;

  v_mudanca := jsonb_build_object(
    'antes', jsonb_build_object('status', 'ativa'),
    'depois', jsonb_build_object('status', 'cancelada')
  );
  v_aula := jsonb_build_object(
    'emusys_id', coalesce(new.emusys_id, new.id),
    'inicio', new.data_hora_inicio,
    'fim', new.data_hora_fim,
    'turma', new.turma_nome
  );
  v_chave_sessao := public.fn_eventos_operacionais_chave_sessao_aula(
    new.unidade_id,
    new.turma_nome,
    new.curso_emusys_id,
    coalesce(new.data_hora_inicio_original, v_inicio_anterior, new.data_hora_inicio),
    new.emusys_id,
    new.id
  );

  perform public.fn_eventos_operacionais_registrar(
    'u:' || new.unidade_id::text || ':' || v_chave_sessao
      || ':aula_cancelada:' || md5((v_mudanca || jsonb_build_object('motivo', new.cancelada_motivo))::text),
    'aula_cancelada',
    new.cancelada_em,
    'sincronizacao',
    new.unidade_id,
    v_aluno_id,
    v_aluno_nome,
    new.id,
    new.curso_nome,
    v_aula,
    v_mudanca,
    new.cancelada_motivo,
    null,
    v_audiencia
  );
  return new;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_AULA_CANCELADA_FALHOU aula=% sqlstate=%', new.id, sqlstate;
  return new;
end;
$$;

create or replace function public.trg_eventos_operacionais_professor_aula()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_aluno_id integer;
  v_aluno_nome text;
  v_audiencia jsonb;
  v_mudanca jsonb;
  v_aula jsonb;
  v_chave_sessao text;
begin
  if not public.fn_eventos_operacionais_na_janela_aula(
    old.data_hora_inicio,
    new.data_hora_inicio
  ) then
    return new;
  end if;

  if nullif(btrim(new.turma_nome), '') is null then
    select x.aluno_id, x.aluno_nome
      into v_aluno_id, v_aluno_nome
      from public.fn_eventos_operacionais_aluno_da_aula(
        new.id,
        new.unidade_id,
        new.matricula_disciplina_id
      ) x;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('professor_id', p.professor_id, 'participacao', p.participacao) order by p.professor_id),
    '[]'::jsonb
  ) into v_audiencia
  from (
    select old.professor_id as professor_id, 'saiu'::text as participacao
    union all
    select new.professor_id, 'entrou'::text
  ) p
  where p.professor_id is not null;

  if v_audiencia = '[]'::jsonb then
    return new;
  end if;

  v_mudanca := jsonb_build_object(
    'antes', jsonb_build_object('professor', old.professor_id),
    'depois', jsonb_build_object('professor', new.professor_id)
  );
  v_aula := jsonb_build_object(
    'emusys_id', coalesce(new.emusys_id, new.id),
    'inicio', new.data_hora_inicio,
    'fim', new.data_hora_fim,
    'turma', new.turma_nome
  );
  v_chave_sessao := public.fn_eventos_operacionais_chave_sessao_aula(
    new.unidade_id,
    new.turma_nome,
    new.curso_emusys_id,
    coalesce(new.data_hora_inicio_original, old.data_hora_inicio, new.data_hora_inicio),
    new.emusys_id,
    new.id
  );

  perform public.fn_eventos_operacionais_registrar(
    'u:' || new.unidade_id::text || ':' || v_chave_sessao
      || ':professor_trocado:' || md5(v_mudanca::text),
    'professor_trocado',
    null,
    'sincronizacao',
    new.unidade_id,
    v_aluno_id,
    v_aluno_nome,
    new.id,
    new.curso_nome,
    v_aula,
    v_mudanca,
    null,
    null,
    v_audiencia
  );
  return new;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_PROFESSOR_AULA_FALHOU aula=% sqlstate=%', new.id, sqlstate;
  return new;
end;
$$;

drop trigger if exists trg_eventos_operacionais_aula_cancelada on public.aulas_emusys;
create trigger trg_eventos_operacionais_aula_cancelada
after update of cancelada on public.aulas_emusys
for each row
when (
  old.cancelada is distinct from new.cancelada
  and coalesce(new.cancelada, false)
)
execute function public.trg_eventos_operacionais_aula_cancelada();

drop trigger if exists trg_eventos_operacionais_aula_cancelada_insert on public.aulas_emusys;
create trigger trg_eventos_operacionais_aula_cancelada_insert
after insert on public.aulas_emusys
for each row
when (coalesce(new.cancelada, false))
execute function public.trg_eventos_operacionais_aula_cancelada();

-- A origem do fato ja criado em 18/09 era um webhook: a linha da tabela
-- canonica havia ficado com o default manual. O vinculo exige o log do mesmo
-- webhook no minuto da escrita, portanto nao reclassifica aviso manual.
update public.eventos_operacionais e
   set origem = 'webhook'
  from public.movimentacoes_admin m
 where e.tipo = 'aviso_previo'
   and e.origem = 'sincronizacao'
   and m.tipo = 'aviso_previo'
   and m.origem_registro = 'manual'
   and m.emusys_aviso_previo_id is not null
   and m.unidade_id = e.unidade_id
   and m.aluno_id is not distinct from e.aluno_id
   and exists (
     select 1
     from public.automacao_log l
     where l.workflow_id = 'processar-matricula-emusys'
       and l.aluno_id is not distinct from m.aluno_id
       and l.evento in (
         'matricula_aviso_previo_adicionado',
         'matricula_aviso_previo_editado'
       )
       and l.acao in (
         'aviso_previo_registrado',
         'aviso_previo_atualizado',
         'aviso_previo_adotado'
       )
       and l.created_at between e.detectado_em - interval '1 minute'
                            and e.detectado_em + interval '1 minute'
   );

-- Para registros antigos, preserva a primeira observacao da sessao e incorpora
-- sua audiencia antes de apagar somente os fatos repetidos da mesma turma.
with classificados as (
  select
    e.evento_id,
    first_value(e.evento_id) over w as evento_id_sobrevivente,
    row_number() over w as posicao
  from public.eventos_operacionais e
  join public.aulas_emusys ae on ae.id = e.aula_id
  where e.tipo in ('aula_reagendada', 'aula_cancelada', 'professor_trocado')
    and nullif(btrim(ae.turma_nome), '') is not null
  window w as (
    partition by
      e.tipo,
      e.unidade_id,
      lower(btrim(ae.turma_nome)),
      ae.curso_emusys_id,
      coalesce(ae.data_hora_inicio_original, ae.data_hora_inicio),
      e.mudanca,
      coalesce(e.motivo, '')
    order by e.detectado_em, e.evento_id
  )
), audiencia_movida as (
  insert into public.eventos_operacionais_audiencia (
    evento_id,
    professor_id,
    participacao,
    detectado_em
  )
  select distinct
    c.evento_id_sobrevivente,
    a.professor_id,
    a.participacao,
    a.detectado_em
  from classificados c
  join public.eventos_operacionais_audiencia a on a.evento_id = c.evento_id
  where c.posicao > 1
  on conflict (evento_id, professor_id) do nothing
)
delete from public.eventos_operacionais e
using classificados c
where e.evento_id = c.evento_id
  and c.posicao > 1;

create or replace function public.fn_eventos_operacionais_registrar_experimental_convertida(
  p_jornada_id uuid,
  p_origem text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_jornada record;
  v_experimental record;
  v_audiencia jsonb;
  v_mudanca jsonb;
  v_lead_chave text;
  v_origem text;
begin
  select
    j.id as jornada_id,
    j.unidade_id,
    j.aluno_id,
    j.emusys_matricula_id,
    j.emusys_matricula_disciplina_id,
    j.professor_id as professor_jornada_id,
    j.curso_nome_emusys,
    a.nome as aluno_nome,
    a.data_matricula,
    a.emusys_lead_id as aluno_emusys_lead_id,
    a.lead_origem_id,
    c.nome as curso_nome
  into v_jornada
  from public.aluno_jornada_matricula_disciplina j
  join public.alunos a on a.id = j.aluno_id
  left join public.cursos c on c.id = j.curso_id
  where j.id = p_jornada_id;

  if not found
     or v_jornada.aluno_id is null
     or v_jornada.emusys_matricula_id is null
     or v_jornada.data_matricula is null then
    return false;
  end if;

  select
    l.id as experimental_id,
    l.lead_id,
    l.emusys_lead_id as experimental_emusys_lead_id,
    ld.emusys_lead_id as lead_emusys_lead_id,
    l.data_experimental,
    l.professor_experimental_id,
    ce.nome as curso_experimental_nome
  into v_experimental
  from public.lead_experimentais l
  left join public.leads ld
    on ld.id = l.lead_id
   and ld.unidade_id = l.unidade_id
  left join public.cursos ce on ce.id = l.curso_interesse_id
  where l.unidade_id = v_jornada.unidade_id
    and l.data_experimental is not null
    and l.data_experimental <= v_jornada.data_matricula
    and l.professor_experimental_id is not null
    and lower(coalesce(l.status, '')) in (
      'experimental_realizada',
      'realizada',
      'convertido',
      'convertida'
    )
    and (
      l.emusys_lead_id::text = v_jornada.aluno_emusys_lead_id
      or l.lead_id = v_jornada.lead_origem_id
      or l.aluno_id = v_jornada.aluno_id
      or ld.emusys_lead_id::text = v_jornada.aluno_emusys_lead_id
      or ld.id = v_jornada.lead_origem_id
      or ld.aluno_id = v_jornada.aluno_id
    )
  order by
    case
      when l.emusys_lead_id::text = v_jornada.aluno_emusys_lead_id then 1
      when ld.emusys_lead_id::text = v_jornada.aluno_emusys_lead_id then 2
      when l.lead_id = v_jornada.lead_origem_id then 3
      when ld.id = v_jornada.lead_origem_id then 4
      else 5
    end,
    l.data_experimental desc,
    l.id desc
  limit 1;

  if not found then
    return false;
  end if;

  v_lead_chave := coalesce(
    v_experimental.experimental_emusys_lead_id::text,
    v_experimental.lead_emusys_lead_id::text,
    v_experimental.lead_id::text,
    v_jornada.aluno_emusys_lead_id,
    v_jornada.lead_origem_id::text
  );
  if v_lead_chave is null then
    return false;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('professor_id', x.professor_id, 'participacao', 'responsavel') order by x.professor_id),
    '[]'::jsonb
  ) into v_audiencia
  from (
    select distinct professor_id
    from (values (
      v_experimental.professor_experimental_id
    ), (
      v_jornada.professor_jornada_id
    )) professores(professor_id)
    where professor_id is not null
  ) x;

  if v_audiencia = '[]'::jsonb then
    return false;
  end if;

  v_mudanca := jsonb_build_object(
    'antes', jsonb_build_object('data_experimental', v_experimental.data_experimental),
    'depois', jsonb_build_object('data_matricula', v_jornada.data_matricula)
  );
  v_origem := case
    when p_origem in ('webhook', 'sincronizacao', 'carga_inicial') then p_origem
    else public.fn_eventos_operacionais_origem(p_origem)
  end;

  return public.fn_eventos_operacionais_registrar(
    'u:' || v_jornada.unidade_id::text || ':lead:' || v_lead_chave
      || ':matricula:' || v_jornada.emusys_matricula_id::text
      || ':experimental_convertida',
    'experimental_convertida',
    (v_jornada.data_matricula::timestamp at time zone 'America/Sao_Paulo'),
    v_origem,
    v_jornada.unidade_id,
    v_jornada.aluno_id,
    v_jornada.aluno_nome,
    null,
    coalesce(v_jornada.curso_nome_emusys, v_jornada.curso_nome, v_experimental.curso_experimental_nome),
    null,
    v_mudanca,
    null,
    null,
    v_audiencia
  );
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_EXPERIMENTAL_CONVERTIDA_FALHOU jornada=% sqlstate=%', p_jornada_id, sqlstate;
  return false;
end;
$$;

create or replace function public.trg_eventos_operacionais_experimental_convertida()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- A jornada tambem e regravada pelo pull. A conversao ao vivo nasce apenas
  -- no webhook de matricula_nova; a recuperacao de sete dias fica na funcao
  -- de carga inicial abaixo, sem ressuscitar matriculas antigas em sync futuro.
  if new.aluno_id is null
     or new.emusys_matricula_id is null
     or coalesce(new.fonte_ultima_atualizacao, '') not like 'webhook:matricula_nova%'
     or lower(coalesce(new.status_matricula, '')) in (
       'trancada', 'inativa', 'finalizada', 'cancelada'
     ) then
    return new;
  end if;

  perform public.fn_eventos_operacionais_registrar_experimental_convertida(
    new.id,
    new.fonte_ultima_atualizacao
  );
  return new;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_EXPERIMENTAL_CONVERTIDA_GATILHO_FALHOU jornada=% sqlstate=%', new.id, sqlstate;
  return new;
end;
$$;

drop trigger if exists trg_eventos_operacionais_experimental_convertida_insert
  on public.aluno_jornada_matricula_disciplina;
create trigger trg_eventos_operacionais_experimental_convertida_insert
after insert on public.aluno_jornada_matricula_disciplina
for each row
execute function public.trg_eventos_operacionais_experimental_convertida();

drop trigger if exists trg_eventos_operacionais_experimental_convertida_update
  on public.aluno_jornada_matricula_disciplina;
create trigger trg_eventos_operacionais_experimental_convertida_update
after update of aluno_id, emusys_matricula_id, professor_id, curso_id,
  curso_nome_emusys, status_matricula, fonte_ultima_atualizacao
on public.aluno_jornada_matricula_disciplina
for each row
when (
  old.aluno_id is distinct from new.aluno_id
  or old.emusys_matricula_id is distinct from new.emusys_matricula_id
  or old.professor_id is distinct from new.professor_id
  or old.curso_id is distinct from new.curso_id
  or old.curso_nome_emusys is distinct from new.curso_nome_emusys
  or old.status_matricula is distinct from new.status_matricula
  or old.fonte_ultima_atualizacao is distinct from new.fonte_ultima_atualizacao
)
execute function public.trg_eventos_operacionais_experimental_convertida();

create or replace function public.fn_eventos_operacionais_carga_inicial_experimental_convertida_v1(
  p_desde timestamptz default clock_timestamp() - interval '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  v_inserido boolean;
  v_total integer := 0;
begin
  if p_desde is null then
    p_desde := clock_timestamp() - interval '7 days';
  end if;

  for r in
    select j.id
    from public.alunos a
    join public.aluno_jornada_matricula_disciplina j
      on j.unidade_id = a.unidade_id
     and j.aluno_id = a.id
    where a.data_matricula >= (p_desde at time zone 'America/Sao_Paulo')::date
      and j.emusys_matricula_id is not null
      and lower(coalesce(j.status_matricula, '')) not in (
        'trancada', 'inativa', 'finalizada', 'cancelada'
      )
    order by a.data_matricula, j.id
  loop
    v_inserido := public.fn_eventos_operacionais_registrar_experimental_convertida(
      r.id,
      'carga_inicial'
    );
    if v_inserido then
      v_total := v_total + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'desde', p_desde,
    'inseridos', v_total,
    'total', v_total,
    'por_tipo', jsonb_build_object('experimental_convertida', v_total)
  );
exception when others then
  raise exception 'carga inicial de experimental_convertida falhou: %', sqlerrm using errcode = sqlstate;
end;
$$;

revoke all on function public.trg_eventos_operacionais_aula_reagendada()
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_aula_cancelada()
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_professor_aula()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_registrar_experimental_convertida(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_experimental_convertida()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_carga_inicial_experimental_convertida_v1(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_eventos_operacionais_carga_inicial_experimental_convertida_v1(timestamptz)
  to service_role;
