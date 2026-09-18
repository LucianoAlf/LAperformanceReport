-- Notificacoes para experimentais sem uma aula Emusys vinculada.
--
-- O cancelamento muda a mesma linha em lead_experimentais. O webhook de
-- reagendamento, por sua vez, cria a linha da nova data sem carregar o id da
-- anterior; por isso o gatilho do log canonico reconstroi a sequencia pelo lead
-- e so registra quando ha antes/depois distintos. Nenhum erro de notificacao
-- pode interromper a gravacao canonica.

alter table public.eventos_operacionais
  drop constraint if exists eventos_operacionais_tipo_check;
alter table public.eventos_operacionais
  add constraint eventos_operacionais_tipo_check check (tipo in (
    'aula_reagendada',
    'aula_cancelada',
    'professor_trocado',
    'experimental_marcada',
    'experimental_convertida',
    'experimental_cancelada',
    'experimental_remarcada',
    'aluno_novo',
    'aviso_previo',
    'matricula_trancada',
    'matricula_encerrada',
    'matricula_alterada'
  ));

-- Ambos os indices cobrem apenas os eventos de experimental. O timeout evita
-- que uma migration espere uma escrita concorrente no log sob carga.
set lock_timeout = '2s';

create index if not exists idx_leads_automacao_log_experimental_lead_criado
  on public.leads_automacao_log (lead_id, created_at desc, id desc)
  where (
    (evento = 'aula_experimental_criada' and acao = 'experimental_agendada')
    or (evento = 'aula_experimental_reagendada' and acao = 'experimental_reagendada')
  );

create index if not exists idx_leads_automacao_log_experimental_carga
  on public.leads_automacao_log (created_at, id)
  where (
    (evento = 'aula_experimental_cancelada' and acao = 'experimental_cancelada')
    or (evento = 'aula_experimental_reagendada' and acao = 'experimental_reagendada')
  );

reset lock_timeout;

create or replace function public.fn_eventos_operacionais_experimental_sem_aula_ligada(
  p_unidade_id uuid,
  p_emusys_aula_id integer
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select not exists (
    select 1
    from public.aulas_emusys ae
    where ae.unidade_id = p_unidade_id
      and p_emusys_aula_id is not null
      and ae.emusys_id = p_emusys_aula_id
  );
$$;

create or replace function public.fn_eventos_operacionais_registrar_experimental_mudanca(
  p_lead_experimental_id integer,
  p_tipo text,
  p_antes jsonb,
  p_depois jsonb,
  p_ocorreu_em timestamptz,
  p_origem text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_experimental public.lead_experimentais%rowtype;
  v_aluno_nome text;
  v_curso text;
  v_inicio_antes timestamptz;
  v_inicio_depois timestamptz;
  v_mudanca jsonb;
  v_evento_id text;
  v_inserido boolean := false;
begin
  if p_tipo not in ('experimental_cancelada', 'experimental_remarcada') then
    return null;
  end if;

  select *
    into v_experimental
    from public.lead_experimentais
   where id = p_lead_experimental_id;

  if not found
     or v_experimental.professor_experimental_id is null
     or not public.fn_eventos_operacionais_experimental_sem_aula_ligada(
       v_experimental.unidade_id,
       v_experimental.emusys_aula_id
     ) then
    return null;
  end if;

  if nullif(p_antes ->> 'data_experimental', '') is not null
     and nullif(p_antes ->> 'horario_experimental', '') is not null then
    v_inicio_antes := (
      (p_antes ->> 'data_experimental')::date
      + (p_antes ->> 'horario_experimental')::time
    ) at time zone 'America/Sao_Paulo';
  end if;

  if nullif(p_depois ->> 'data_experimental', '') is not null
     and nullif(p_depois ->> 'horario_experimental', '') is not null then
    v_inicio_depois := (
      (p_depois ->> 'data_experimental')::date
      + (p_depois ->> 'horario_experimental')::time
    ) at time zone 'America/Sao_Paulo';
  end if;

  if not public.fn_eventos_operacionais_na_janela_aula(
    v_inicio_antes,
    v_inicio_depois
  ) then
    return null;
  end if;

  select coalesce(a.nome::text, v_experimental.nome_aluno)
    into v_aluno_nome
    from public.alunos a
   where a.id = v_experimental.aluno_id;
  v_aluno_nome := coalesce(v_aluno_nome, v_experimental.nome_aluno);

  select c.nome::text
    into v_curso
    from public.cursos c
   where c.id = v_experimental.curso_interesse_id;

  v_mudanca := jsonb_build_object(
    'antes', jsonb_strip_nulls(p_antes),
    'depois', jsonb_strip_nulls(p_depois)
  );
  v_evento_id := 'u:' || v_experimental.unidade_id::text
    || ':lead:' || coalesce(
      v_experimental.emusys_lead_id::text,
      v_experimental.lead_id::text,
      v_experimental.id::text
    )
    || ':experimental:' || v_experimental.id::text
    || ':' || p_tipo
    || ':' || md5(v_mudanca::text);

  v_inserido := public.fn_eventos_operacionais_registrar(
    v_evento_id,
    p_tipo,
    coalesce(p_ocorreu_em, v_experimental.updated_at, v_experimental.created_at, clock_timestamp()),
    p_origem,
    v_experimental.unidade_id,
    v_experimental.aluno_id,
    v_aluno_nome,
    null,
    v_curso,
    jsonb_build_object(
      'emusys_id', v_experimental.emusys_aula_id,
      'inicio', coalesce(v_inicio_depois, v_inicio_antes),
      'fim', null,
      'turma', null
    ),
    v_mudanca,
    null,
    null,
    jsonb_build_array(jsonb_build_object(
      'professor_id', v_experimental.professor_experimental_id,
      'participacao', 'responsavel'
    ))
  );

  return jsonb_build_object(
    'evento_id', v_evento_id,
    'tipo', p_tipo,
    'inserido', coalesce(v_inserido, false)
  );
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_EXPERIMENTAL_MUDANCA_FALHOU experimental=% tipo=% sqlstate=%',
    p_lead_experimental_id, p_tipo, sqlstate;
  return null;
end;
$$;

create or replace function public.trg_eventos_operacionais_experimental_cancelada()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if lower(coalesce(new.status, '')) not in ('cancelada', 'cancelado')
     or lower(coalesce(old.status, '')) in ('cancelada', 'cancelado') then
    return new;
  end if;

  perform public.fn_eventos_operacionais_registrar_experimental_mudanca(
    new.id,
    'experimental_cancelada',
    jsonb_strip_nulls(jsonb_build_object(
      'status', old.status,
      'data_experimental', old.data_experimental,
      'horario_experimental', old.horario_experimental
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'status', new.status,
      'data_experimental', new.data_experimental,
      'horario_experimental', new.horario_experimental
    )),
    new.updated_at,
    'sincronizacao'
  );
  return new;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_EXPERIMENTAL_CANCELADA_FALHOU experimental=% sqlstate=%', new.id, sqlstate;
  return new;
end;
$$;

create or replace function public.trg_eventos_operacionais_experimental_remarcada()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if lower(coalesce(new.status, '')) in ('cancelada', 'cancelado') then
    return new;
  end if;

  perform public.fn_eventos_operacionais_registrar_experimental_mudanca(
    new.id,
    'experimental_remarcada',
    jsonb_strip_nulls(jsonb_build_object(
      'data_experimental', old.data_experimental,
      'horario_experimental', old.horario_experimental
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'data_experimental', new.data_experimental,
      'horario_experimental', new.horario_experimental
    )),
    new.updated_at,
    'sincronizacao'
  );
  return new;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_EXPERIMENTAL_REMARCADA_FALHOU experimental=% sqlstate=%', new.id, sqlstate;
  return new;
end;
$$;

create or replace function public.fn_eventos_operacionais_processar_log_experimental(
  p_log_id bigint,
  p_origem text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_log public.leads_automacao_log%rowtype;
  v_experimental_id integer;
  v_data_anterior date;
  v_horario_anterior time;
  v_data_depois date;
  v_horario_depois time;
  v_resultado jsonb;
begin
  select *
    into v_log
    from public.leads_automacao_log
   where id = p_log_id;

  if not found
     or v_log.lead_id is null then
    return null;
  end if;

  if v_log.evento = 'aula_experimental_cancelada'
     and v_log.acao = 'experimental_cancelada' then
    select le.id
      into v_experimental_id
      from public.lead_experimentais le
     where le.lead_id = v_log.lead_id
       and lower(coalesce(le.status, '')) in ('cancelada', 'cancelado')
       and le.updated_at between v_log.created_at - interval '2 minutes'
                             and v_log.created_at + interval '2 minutes'
       and public.fn_eventos_operacionais_experimental_sem_aula_ligada(
         le.unidade_id,
         le.emusys_aula_id
       )
     order by abs(extract(epoch from (le.updated_at - v_log.created_at))), le.id desc
     limit 1;

    if v_experimental_id is null then
      return jsonb_build_object('tipo', 'experimental_cancelada', 'inserido', false);
    end if;

    select public.fn_eventos_operacionais_registrar_experimental_mudanca(
      le.id,
      'experimental_cancelada',
      jsonb_strip_nulls(jsonb_build_object(
        'status', 'experimental_agendada',
        'data_experimental', le.data_experimental,
        'horario_experimental', le.horario_experimental
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'status', le.status,
        'data_experimental', le.data_experimental,
        'horario_experimental', le.horario_experimental
      )),
      v_log.created_at,
      p_origem
    )
      into v_resultado
      from public.lead_experimentais le
     where le.id = v_experimental_id;
  elsif v_log.evento = 'aula_experimental_reagendada'
        and v_log.acao = 'experimental_reagendada' then
    if nullif(v_log.detalhes ->> 'data', '') is null
       or nullif(v_log.detalhes ->> 'horario', '') is null then
      return jsonb_build_object('tipo', 'experimental_remarcada', 'inserido', false);
    end if;

    v_data_depois := (v_log.detalhes ->> 'data')::date;
    v_horario_depois := (v_log.detalhes ->> 'horario')::time;

    select le.id
      into v_experimental_id
      from public.lead_experimentais le
     where le.lead_id = v_log.lead_id
       and le.data_experimental is not distinct from v_data_depois
       and le.horario_experimental is not distinct from v_horario_depois
       and public.fn_eventos_operacionais_experimental_sem_aula_ligada(
         le.unidade_id,
         le.emusys_aula_id
       )
     order by abs(extract(epoch from (le.updated_at - v_log.created_at))), le.id desc
     limit 1;

    if v_experimental_id is null then
      return jsonb_build_object('tipo', 'experimental_remarcada', 'inserido', false);
    end if;

    select
      nullif(l.detalhes ->> 'data', '')::date,
      nullif(l.detalhes ->> 'horario', '')::time
      into v_data_anterior, v_horario_anterior
     from public.leads_automacao_log l
     where l.lead_id = v_log.lead_id
       and (
         (l.evento = 'aula_experimental_criada' and l.acao = 'experimental_agendada')
         or (l.evento = 'aula_experimental_reagendada' and l.acao = 'experimental_reagendada')
       )
       and (l.created_at, l.id) < (v_log.created_at, v_log.id)
       and nullif(l.detalhes ->> 'data', '') is not null
       and nullif(l.detalhes ->> 'horario', '') is not null
       and (
         nullif(l.detalhes ->> 'data', '')::date,
         nullif(l.detalhes ->> 'horario', '')::time
       ) is distinct from (v_data_depois, v_horario_depois)
     order by l.created_at desc, l.id desc
     limit 1;

    if v_data_anterior is null or v_horario_anterior is null then
      return jsonb_build_object('tipo', 'experimental_remarcada', 'inserido', false);
    end if;

    select public.fn_eventos_operacionais_registrar_experimental_mudanca(
      le.id,
      'experimental_remarcada',
      jsonb_build_object(
        'data_experimental', v_data_anterior,
        'horario_experimental', v_horario_anterior
      ),
      jsonb_build_object(
        'data_experimental', le.data_experimental,
        'horario_experimental', le.horario_experimental
      ),
      v_log.created_at,
      p_origem
    )
      into v_resultado
      from public.lead_experimentais le
     where le.id = v_experimental_id;
  else
    return null;
  end if;

  if p_origem = 'webhook'
     and v_resultado ? 'evento_id' then
    update public.eventos_operacionais
       set origem = 'webhook'
     where evento_id = v_resultado ->> 'evento_id'
       and origem = 'sincronizacao';
  end if;

  -- O observer grava primeiro a linha nova em lead_experimentais e so entao
  -- registra o webhook. O gatilho legado de INSERT pode ter criado uma
  -- experimental_marcada para a mesma linha; ao confirmar que ela e uma
  -- remarcacao, removemos apenas esse duplicado da tabela derivada.
  if v_log.evento = 'aula_experimental_reagendada'
     and v_log.acao = 'experimental_reagendada'
     and v_resultado ? 'evento_id' then
    delete from public.eventos_operacionais e
    using public.lead_experimentais le
    where le.id = v_experimental_id
      and e.tipo = 'experimental_marcada'
      and e.evento_id like
        'u:' || le.unidade_id::text || ':experimental:' || le.id::text
          || ':experimental_marcada:%';
  end if;

  return v_resultado;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_LOG_EXPERIMENTAL_FALHOU log=% sqlstate=%', p_log_id, sqlstate;
  return null;
end;
$$;

create or replace function public.trg_eventos_operacionais_log_experimental()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.fn_eventos_operacionais_processar_log_experimental(new.id, 'webhook');
  return new;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_LOG_EXPERIMENTAL_GATILHO_FALHOU log=% sqlstate=%', new.id, sqlstate;
  return new;
end;
$$;

-- Mantem a marcacao para criacao e atribuicao, mas a alteracao de horario passa
-- a ser somente experimental_remarcada, evitando dois avisos para o mesmo fato.
drop trigger if exists trg_eventos_operacionais_experimental on public.lead_experimentais;
create trigger trg_eventos_operacionais_experimental_insert
after insert on public.lead_experimentais
for each row
execute function public.trg_eventos_operacionais_experimental();

create trigger trg_eventos_operacionais_experimental_atribuicao
after update of professor_experimental_id, emusys_aula_id on public.lead_experimentais
for each row
when (
  old.professor_experimental_id is distinct from new.professor_experimental_id
  or old.emusys_aula_id is distinct from new.emusys_aula_id
)
execute function public.trg_eventos_operacionais_experimental();

drop trigger if exists trg_eventos_operacionais_experimental_cancelada on public.lead_experimentais;
create trigger trg_eventos_operacionais_experimental_cancelada
after update of status on public.lead_experimentais
for each row
when (old.status is distinct from new.status)
execute function public.trg_eventos_operacionais_experimental_cancelada();

drop trigger if exists trg_eventos_operacionais_experimental_remarcada on public.lead_experimentais;
create trigger trg_eventos_operacionais_experimental_remarcada
after update of data_experimental, horario_experimental on public.lead_experimentais
for each row
when (
  old.data_experimental is distinct from new.data_experimental
  or old.horario_experimental is distinct from new.horario_experimental
)
execute function public.trg_eventos_operacionais_experimental_remarcada();

drop trigger if exists trg_eventos_operacionais_log_experimental on public.leads_automacao_log;
create trigger trg_eventos_operacionais_log_experimental
after insert on public.leads_automacao_log
for each row
when (
  new.evento in ('aula_experimental_cancelada', 'aula_experimental_reagendada')
  and new.acao in ('experimental_cancelada', 'experimental_reagendada')
)
execute function public.trg_eventos_operacionais_log_experimental();

create or replace function public.fn_eventos_operacionais_carga_inicial_experimentais_sem_aula_v1(
  p_desde timestamptz default clock_timestamp() - interval '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  v_resultado jsonb;
  v_canceladas integer := 0;
  v_remarcadas integer := 0;
begin
  for r in
    select l.id
      from public.leads_automacao_log l
     where l.created_at >= p_desde
       and (
         (l.evento = 'aula_experimental_cancelada' and l.acao = 'experimental_cancelada')
         or (l.evento = 'aula_experimental_reagendada' and l.acao = 'experimental_reagendada')
       )
     order by l.created_at, l.id
  loop
    v_resultado := public.fn_eventos_operacionais_processar_log_experimental(
      r.id,
      'carga_inicial'
    );
    if coalesce((v_resultado ->> 'inserido')::boolean, false) then
      if v_resultado ->> 'tipo' = 'experimental_cancelada' then
        v_canceladas := v_canceladas + 1;
      elsif v_resultado ->> 'tipo' = 'experimental_remarcada' then
        v_remarcadas := v_remarcadas + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'desde', p_desde,
    'inseridos', v_canceladas + v_remarcadas,
    'total', v_canceladas + v_remarcadas,
    'por_tipo', jsonb_build_object(
      'experimental_cancelada', v_canceladas,
      'experimental_remarcada', v_remarcadas
    )
  );
exception when others then
  raise exception 'carga inicial de experimentais sem aula falhou: %', sqlerrm using errcode = sqlstate;
end;
$$;

revoke all on function public.fn_eventos_operacionais_experimental_sem_aula_ligada(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_registrar_experimental_mudanca(integer, text, jsonb, jsonb, timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_experimental_cancelada()
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_experimental_remarcada()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_processar_log_experimental(bigint, text)
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_log_experimental()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_carga_inicial_experimentais_sem_aula_v1(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_eventos_operacionais_carga_inicial_experimentais_sem_aula_v1(timestamptz)
  to service_role;
