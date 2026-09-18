-- Central de notificacoes operacionais do professor.
--
-- Projecao append-only alimentada exclusivamente pelas tabelas canonicas.
-- Os gatilhos isolam qualquer falha para nunca interromper webhook ou sync.

alter table public.aluno_jornada_matricula_disciplina
  add column if not exists alteracao_descricao_emusys text;

comment on column public.aluno_jornada_matricula_disciplina.alteracao_descricao_emusys is
  'Descricao curta permitida da matricula_alterada. Nao guarda payload, observacoes ou dados financeiros.';

create table if not exists public.eventos_operacionais (
  evento_id text primary key,
  tipo text not null check (tipo in (
    'aula_reagendada',
    'aula_cancelada',
    'professor_trocado',
    'experimental_marcada',
    'aluno_novo',
    'aviso_previo',
    'matricula_trancada',
    'matricula_encerrada',
    'matricula_alterada'
  )),
  ocorreu_em timestamptz,
  detectado_em timestamptz not null default clock_timestamp(),
  origem text not null check (origem in ('webhook', 'sincronizacao', 'carga_inicial')),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  aluno_id integer references public.alunos(id) on delete set null,
  aluno_nome text,
  aula_id integer references public.aulas_emusys(id) on delete set null,
  curso text,
  aula jsonb,
  mudanca jsonb not null default '{}'::jsonb,
  motivo text,
  detalhe text,
  created_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(mudanca) = 'object'),
  check (aula is null or jsonb_typeof(aula) = 'object')
);

create table if not exists public.eventos_operacionais_audiencia (
  evento_id text not null references public.eventos_operacionais(evento_id) on delete cascade,
  professor_id integer not null references public.professores(id) on delete restrict,
  participacao text not null check (participacao in ('responsavel', 'saiu', 'entrou')),
  detectado_em timestamptz not null,
  primary key (evento_id, professor_id)
);

comment on table public.eventos_operacionais is
  'Fatos operacionais append-only para consumo por servicos. Nunca armazena financeiro, saude, presenca, observacoes livres ou payload bruto.';
comment on table public.eventos_operacionais_audiencia is
  'Audiencia por professor da projecao de eventos operacionais; detectado_em e denormalizado para leitura paginada.';

create index if not exists idx_eventos_operacionais_audiencia_professor_detectado
  on public.eventos_operacionais_audiencia
  (professor_id, detectado_em desc, evento_id desc)
  include (participacao);

create index if not exists idx_eventos_operacionais_detectado
  on public.eventos_operacionais (detectado_em desc, evento_id desc);

-- Indices da carga inicial. Eles nao participam da leitura regular da RPC.
create index if not exists idx_emusys_aulas_historico_revisoes_ultima_coleta
  on public.emusys_aulas_historico_revisoes_v1 (ultima_coleta_em desc);
create index if not exists idx_movimentacoes_admin_aviso_previo_atualizado
  on public.movimentacoes_admin (updated_at desc)
  where tipo = 'aviso_previo';
create index if not exists idx_lead_experimentais_atualizado
  on public.lead_experimentais (updated_at desc);
create index if not exists idx_aluno_professor_transicoes_criado
  on public.aluno_professor_transicoes (created_at desc);

alter table public.eventos_operacionais enable row level security;
alter table public.eventos_operacionais_audiencia enable row level security;

revoke all on public.eventos_operacionais from public, anon, authenticated, service_role;
revoke all on public.eventos_operacionais_audiencia from public, anon, authenticated, service_role;

create or replace function public.fn_eventos_operacionais_origem(p_fonte text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when coalesce(p_fonte, '') ilike 'webhook%' then 'webhook'
    else 'sincronizacao'
  end;
$$;

create or replace function public.fn_eventos_operacionais_na_janela_aula(
  p_inicio_anterior timestamptz,
  p_inicio_atual timestamptz
)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  with janela as (
    select (clock_timestamp() at time zone 'America/Sao_Paulo')::date as hoje
  )
  select coalesce(
    (p_inicio_anterior at time zone 'America/Sao_Paulo')::date between hoje - 1 and hoje + 14,
    false
  )
  or coalesce(
    (p_inicio_atual at time zone 'America/Sao_Paulo')::date between hoje - 1 and hoje + 14,
    false
  )
  from janela;
$$;

create or replace function public.fn_eventos_operacionais_timestamptz(p_valor text)
returns timestamptz
language plpgsql
stable
set search_path = pg_catalog, public
as $$
begin
  if nullif(btrim(p_valor), '') is null then
    return null;
  end if;
  return p_valor::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.fn_eventos_operacionais_aluno_da_aula(
  p_aula_id integer,
  p_unidade_id uuid,
  p_matricula_disciplina_id bigint
)
returns table (aluno_id integer, aluno_nome text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with roster as (
    select min(aa.aluno_id)::integer as aluno_id
    from public.aula_alunos_emusys aa
    where aa.aula_emusys_id = p_aula_id
      and aa.aluno_id is not null
      and aa.ativo_operacional
    having count(distinct aa.aluno_id) = 1
  ), da_grade as (
    select j.aluno_id
    from public.aluno_jornada_matricula_disciplina j
    where j.unidade_id = p_unidade_id
      and j.emusys_matricula_disciplina_id = p_matricula_disciplina_id
      and j.aluno_id is not null
    order by j.updated_at desc nulls last, j.id
    limit 1
  ), escolhido as (
    select aluno_id from roster
    union all
    select aluno_id from da_grade where not exists (select 1 from roster)
  )
  select e.aluno_id, a.nome::text
  from escolhido e
  join public.alunos a on a.id = e.aluno_id
  limit 1;
$$;

create or replace function public.fn_eventos_operacionais_registrar(
  p_evento_id text,
  p_tipo text,
  p_ocorreu_em timestamptz,
  p_origem text,
  p_unidade_id uuid,
  p_aluno_id integer,
  p_aluno_nome text,
  p_aula_id integer,
  p_curso text,
  p_aula jsonb,
  p_mudanca jsonb,
  p_motivo text,
  p_detalhe text,
  p_audiencia jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_detectado_em timestamptz;
  v_inserido boolean := false;
begin
  if nullif(btrim(p_evento_id), '') is null
     or nullif(btrim(p_tipo), '') is null
     or p_unidade_id is null then
    return false;
  end if;

  begin
    insert into public.eventos_operacionais (
      evento_id,
      tipo,
      ocorreu_em,
      origem,
      unidade_id,
      aluno_id,
      aluno_nome,
      aula_id,
      curso,
      aula,
      mudanca,
      motivo,
      detalhe
    ) values (
      left(p_evento_id, 512),
      p_tipo,
      p_ocorreu_em,
      p_origem,
      p_unidade_id,
      p_aluno_id,
      nullif(left(coalesce(p_aluno_nome, ''), 200), ''),
      p_aula_id,
      nullif(left(coalesce(p_curso, ''), 200), ''),
      case when p_aula is null or jsonb_typeof(p_aula) = 'object' then p_aula else null end,
      case when jsonb_typeof(coalesce(p_mudanca, '{}'::jsonb)) = 'object'
        then coalesce(p_mudanca, '{}'::jsonb)
        else '{}'::jsonb
      end,
      nullif(left(coalesce(p_motivo, ''), 500), ''),
      nullif(left(coalesce(p_detalhe, ''), 500), '')
    )
    on conflict (evento_id) do nothing
    returning detectado_em into v_detectado_em;

    v_inserido := found;
    if not v_inserido then
      select e.detectado_em
        into v_detectado_em
        from public.eventos_operacionais e
       where e.evento_id = left(p_evento_id, 512);
    end if;

    insert into public.eventos_operacionais_audiencia (
      evento_id,
      professor_id,
      participacao,
      detectado_em
    )
    select left(p_evento_id, 512), x.professor_id, x.participacao, v_detectado_em
    from (
      select distinct on (r.professor_id)
             r.professor_id,
             r.participacao
      from jsonb_to_recordset(coalesce(p_audiencia, '[]'::jsonb))
        as r(professor_id integer, participacao text)
      join public.professores p on p.id = r.professor_id
      where r.professor_id is not null
        and r.participacao in ('responsavel', 'saiu', 'entrou')
      order by r.professor_id,
               case r.participacao
                 when 'entrou' then 1
                 when 'saiu' then 2
                 else 3
               end
    ) x
    on conflict (evento_id, professor_id) do nothing;

    return v_inserido;
  exception when others then
    raise warning 'EVENTOS_OPERACIONAIS_REGISTRO_FALHOU tipo=% sqlstate=%', p_tipo, sqlstate;
    return false;
  end;
end;
$$;

revoke all on function public.fn_eventos_operacionais_origem(text) from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_na_janela_aula(timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_timestamptz(text) from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_aluno_da_aula(integer, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_registrar(text, text, timestamptz, text, uuid, integer, text, integer, text, jsonb, jsonb, text, text, jsonb) from public, anon, authenticated, service_role;

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
begin
  if not public.fn_eventos_operacionais_na_janela_aula(
    old.data_hora_inicio,
    new.data_hora_inicio
  ) then
    return new;
  end if;

  if new.turma_nome is null then
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

  perform public.fn_eventos_operacionais_registrar(
    'u:' || new.unidade_id::text || ':aula:' || coalesce(new.emusys_id, new.id)::text
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
begin
  if not public.fn_eventos_operacionais_na_janela_aula(
    old.data_hora_inicio,
    new.data_hora_inicio
  ) then
    return new;
  end if;

  if new.turma_nome is null then
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
    'antes', jsonb_build_object('status', 'ativa'),
    'depois', jsonb_build_object('status', 'cancelada')
  );
  v_aula := jsonb_build_object(
    'emusys_id', coalesce(new.emusys_id, new.id),
    'inicio', new.data_hora_inicio,
    'fim', new.data_hora_fim,
    'turma', new.turma_nome
  );

  perform public.fn_eventos_operacionais_registrar(
    'u:' || new.unidade_id::text || ':aula:' || coalesce(new.emusys_id, new.id)::text
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
begin
  if not public.fn_eventos_operacionais_na_janela_aula(
    old.data_hora_inicio,
    new.data_hora_inicio
  ) then
    return new;
  end if;

  if new.turma_nome is null then
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

  perform public.fn_eventos_operacionais_registrar(
    'u:' || new.unidade_id::text || ':aula:' || coalesce(new.emusys_id, new.id)::text
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

drop trigger if exists trg_eventos_operacionais_aula_reagendada on public.aulas_emusys;
create trigger trg_eventos_operacionais_aula_reagendada
after update of data_hora_inicio on public.aulas_emusys
for each row
when (old.data_hora_inicio is distinct from new.data_hora_inicio)
execute function public.trg_eventos_operacionais_aula_reagendada();

drop trigger if exists trg_eventos_operacionais_aula_cancelada on public.aulas_emusys;
create trigger trg_eventos_operacionais_aula_cancelada
after update of cancelada on public.aulas_emusys
for each row
when (coalesce(old.cancelada, false) = false and coalesce(new.cancelada, false) = true)
execute function public.trg_eventos_operacionais_aula_cancelada();

drop trigger if exists trg_eventos_operacionais_professor_aula on public.aulas_emusys;
create trigger trg_eventos_operacionais_professor_aula
after update of professor_id on public.aulas_emusys
for each row
when (old.professor_id is distinct from new.professor_id)
execute function public.trg_eventos_operacionais_professor_aula();

create or replace function public.trg_eventos_operacionais_professor_jornada()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_aluno_nome text;
  v_curso text;
  v_curso_anterior text;
  v_audiencia jsonb;
  v_mudanca jsonb;
begin
  if new.professor_anterior_id is not distinct from new.professor_novo_id
     or (new.professor_anterior_id is null and new.professor_novo_id is null) then
    return new;
  end if;

  select a.nome::text into v_aluno_nome
  from public.alunos a
  where a.id = new.aluno_id;

  select c.nome::text into v_curso
  from public.cursos c
  where c.id = new.curso_id;

  select c.nome::text into v_curso_anterior
  from public.cursos c
  where c.id = new.curso_anterior_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('professor_id', p.professor_id, 'participacao', p.participacao) order by p.professor_id),
    '[]'::jsonb
  ) into v_audiencia
  from (
    select new.professor_anterior_id as professor_id, 'saiu'::text as participacao
    union all
    select new.professor_novo_id, 'entrou'::text
  ) p
  where p.professor_id is not null;

  if v_audiencia = '[]'::jsonb then
    return new;
  end if;

  v_mudanca := jsonb_build_object(
    'antes', jsonb_strip_nulls(jsonb_build_object(
      'professor', new.professor_anterior_id,
      'curso', v_curso_anterior
    )),
    'depois', jsonb_strip_nulls(jsonb_build_object(
      'professor', new.professor_novo_id,
      'curso', v_curso
    ))
  );

  perform public.fn_eventos_operacionais_registrar(
    'u:' || new.unidade_id::text || ':transicao:' || new.id::text,
    'professor_trocado',
    new.data_transicao,
    public.fn_eventos_operacionais_origem(new.fonte),
    new.unidade_id,
    new.aluno_id,
    v_aluno_nome,
    null,
    coalesce(v_curso, v_curso_anterior),
    null,
    v_mudanca,
    null,
    null,
    v_audiencia
  );
  return new;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_PROFESSOR_JORNADA_FALHOU transicao=% sqlstate=%', new.id, sqlstate;
  return new;
end;
$$;

drop trigger if exists trg_eventos_operacionais_professor_jornada on public.aluno_professor_transicoes;
create trigger trg_eventos_operacionais_professor_jornada
after insert on public.aluno_professor_transicoes
for each row
execute function public.trg_eventos_operacionais_professor_jornada();

create or replace function public.trg_eventos_operacionais_jornada_matricula()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_aluno_nome text;
  v_curso text;
  v_curso_anterior text;
  v_audiencia jsonb;
  v_mudanca jsonb;
  v_antes jsonb := '{}'::jsonb;
  v_depois jsonb := '{}'::jsonb;
  v_evento_id text;
  v_saida text;
  v_semantica boolean := false;
begin
  if tg_op = 'UPDATE'
     and old.fonte_ultima_atualizacao is not distinct from new.fonte_ultima_atualizacao
     and old.status_matricula is not distinct from new.status_matricula
     and old.curso_id is not distinct from new.curso_id
     and old.curso_nome_emusys is not distinct from new.curso_nome_emusys
     and old.emusys_disciplina_id is not distinct from new.emusys_disciplina_id
     and old.professor_id is not distinct from new.professor_id
     and old.alteracao_descricao_emusys is not distinct from new.alteracao_descricao_emusys then
    return new;
  end if;

  if coalesce(new.fonte_ultima_atualizacao, '') not like 'webhook:matricula_%' then
    return new;
  end if;

  select a.nome::text into v_aluno_nome
  from public.alunos a
  where a.id = new.aluno_id;

  select c.nome::text into v_curso
  from public.cursos c
  where c.id = new.curso_id;

  if tg_op = 'UPDATE' then
    select c.nome::text into v_curso_anterior
    from public.cursos c
    where c.id = old.curso_id;
  end if;

  if new.fonte_ultima_atualizacao like 'webhook:matricula_nova%' then
    if new.aluno_id is null or new.professor_id is null then
      return new;
    end if;

    v_audiencia := jsonb_build_array(
      jsonb_build_object('professor_id', new.professor_id, 'participacao', 'responsavel')
    );
    v_mudanca := jsonb_build_object(
      'antes', '{}'::jsonb,
      'depois', jsonb_strip_nulls(jsonb_build_object(
        'curso', coalesce(v_curso, new.curso_nome_emusys),
        'inicio', new.data_primeira_aula
      ))
    );
    v_evento_id := 'u:' || new.unidade_id::text || ':matricula:'
      || coalesce(new.emusys_matricula_id, new.emusys_matricula_disciplina_id)::text
      || ':aluno_novo:' || md5(jsonb_build_object(
        'aluno_id', new.aluno_id,
        'professor_id', new.professor_id,
        'curso_id', new.curso_id,
        'inicio', new.data_primeira_aula
      )::text);

    perform public.fn_eventos_operacionais_registrar(
      v_evento_id,
      'aluno_novo',
      new.ultima_sincronizacao_emusys,
      'webhook',
      new.unidade_id,
      new.aluno_id,
      v_aluno_nome,
      null,
      coalesce(v_curso, new.curso_nome_emusys),
      null,
      v_mudanca,
      null,
      null,
      v_audiencia
    );
    return new;
  end if;

  if new.fonte_ultima_atualizacao like 'webhook:matricula_trancamento%'
     and new.status_matricula = 'trancada'
     and (tg_op = 'INSERT' or old.status_matricula is distinct from 'trancada') then
    if new.aluno_id is null or new.professor_id is null then
      return new;
    end if;

    v_audiencia := jsonb_build_array(
      jsonb_build_object('professor_id', new.professor_id, 'participacao', 'responsavel')
    );
    v_mudanca := jsonb_build_object(
      'antes', case when tg_op = 'INSERT' then '{}'::jsonb else jsonb_build_object('status', old.status_matricula) end,
      'depois', jsonb_strip_nulls(jsonb_build_object(
        'status', 'trancada',
        'periodo', jsonb_strip_nulls(jsonb_build_object(
          'inicio', new.trancamento_data_inicial,
          'fim', new.trancamento_data_final
        ))
      ))
    );
    v_evento_id := 'u:' || new.unidade_id::text || ':matricula:'
      || coalesce(new.emusys_matricula_id, new.emusys_matricula_disciplina_id)::text
      || ':matricula_trancada:' || md5(jsonb_build_object(
        'status', new.status_matricula,
        'inicio', new.trancamento_data_inicial,
        'fim', new.trancamento_data_final,
        'motivo', new.trancamento_motivo
      )::text);

    perform public.fn_eventos_operacionais_registrar(
      v_evento_id,
      'matricula_trancada',
      new.ultima_sincronizacao_emusys,
      'webhook',
      new.unidade_id,
      new.aluno_id,
      v_aluno_nome,
      null,
      coalesce(v_curso, new.curso_nome_emusys),
      null,
      v_mudanca,
      new.trancamento_motivo,
      null,
      v_audiencia
    );
    return new;
  end if;

  if new.fonte_ultima_atualizacao like 'webhook:matricula_finalizacao%'
     and new.status_matricula in ('inativa', 'finalizada')
     and (tg_op = 'INSERT' or old.status_matricula is distinct from new.status_matricula) then
    if new.aluno_id is null or new.professor_id is null then
      return new;
    end if;

    v_saida := case when new.status_matricula = 'finalizada' then 'concluida' else 'interrompida' end;
    v_audiencia := jsonb_build_array(
      jsonb_build_object('professor_id', new.professor_id, 'participacao', 'responsavel')
    );
    v_mudanca := jsonb_build_object(
      'antes', case when tg_op = 'INSERT' then '{}'::jsonb else jsonb_build_object('status', old.status_matricula) end,
      'depois', jsonb_build_object('status', new.status_matricula)
    );
    v_evento_id := 'u:' || new.unidade_id::text || ':matricula:'
      || coalesce(new.emusys_matricula_id, new.emusys_matricula_disciplina_id)::text
      || ':matricula_encerrada:' || md5(jsonb_build_object(
        'status', new.status_matricula,
        'saida', v_saida
      )::text);

    perform public.fn_eventos_operacionais_registrar(
      v_evento_id,
      'matricula_encerrada',
      new.ultima_sincronizacao_emusys,
      'webhook',
      new.unidade_id,
      new.aluno_id,
      v_aluno_nome,
      null,
      coalesce(v_curso, new.curso_nome_emusys),
      null,
      v_mudanca,
      null,
      v_saida,
      v_audiencia
    );
    return new;
  end if;

  if new.fonte_ultima_atualizacao like 'webhook:matricula_alterada%' then
    if tg_op = 'INSERT' then
      v_semantica := true;
    else
      v_semantica := old.curso_id is distinct from new.curso_id
        or old.curso_nome_emusys is distinct from new.curso_nome_emusys
        or old.emusys_disciplina_id is distinct from new.emusys_disciplina_id
        or old.professor_id is distinct from new.professor_id
        or old.alteracao_descricao_emusys is distinct from new.alteracao_descricao_emusys;
    end if;

    if not v_semantica or new.aluno_id is null then
      return new;
    end if;

    if tg_op = 'INSERT' or old.professor_id is not distinct from new.professor_id then
      if new.professor_id is null then
        return new;
      end if;
      v_audiencia := jsonb_build_array(
        jsonb_build_object('professor_id', new.professor_id, 'participacao', 'responsavel')
      );
    else
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
    end if;

    if v_audiencia = '[]'::jsonb then
      return new;
    end if;

    if tg_op = 'INSERT' or old.curso_id is distinct from new.curso_id
       or old.curso_nome_emusys is distinct from new.curso_nome_emusys then
      v_antes := v_antes || jsonb_strip_nulls(jsonb_build_object(
        'curso', case when tg_op = 'INSERT' then null else coalesce(v_curso_anterior, old.curso_nome_emusys) end
      ));
      v_depois := v_depois || jsonb_strip_nulls(jsonb_build_object(
        'curso', coalesce(v_curso, new.curso_nome_emusys)
      ));
    end if;
    if tg_op = 'INSERT' or old.emusys_disciplina_id is distinct from new.emusys_disciplina_id then
      v_antes := v_antes || jsonb_strip_nulls(jsonb_build_object(
        'disciplina', case when tg_op = 'INSERT' then null else old.emusys_disciplina_id end
      ));
      v_depois := v_depois || jsonb_strip_nulls(jsonb_build_object(
        'disciplina', new.emusys_disciplina_id
      ));
    end if;
    if tg_op = 'INSERT' or old.professor_id is distinct from new.professor_id then
      v_antes := v_antes || jsonb_strip_nulls(jsonb_build_object(
        'professor', case when tg_op = 'INSERT' then null else old.professor_id end
      ));
      v_depois := v_depois || jsonb_strip_nulls(jsonb_build_object(
        'professor', new.professor_id
      ));
    end if;
    v_mudanca := jsonb_build_object('antes', v_antes, 'depois', v_depois);
    v_evento_id := 'u:' || new.unidade_id::text || ':matricula_disciplina:'
      || new.emusys_matricula_disciplina_id::text
      || ':matricula_alterada:' || md5(jsonb_build_object(
        'antes', v_antes,
        'depois', v_depois,
        'detalhe', new.alteracao_descricao_emusys
      )::text);

    perform public.fn_eventos_operacionais_registrar(
      v_evento_id,
      'matricula_alterada',
      new.ultima_sincronizacao_emusys,
      'webhook',
      new.unidade_id,
      new.aluno_id,
      v_aluno_nome,
      null,
      coalesce(v_curso, new.curso_nome_emusys),
      null,
      v_mudanca,
      null,
      new.alteracao_descricao_emusys,
      v_audiencia
    );
  end if;

  return new;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_JORNADA_MATRICULA_FALHOU jornada=% sqlstate=%', new.id, sqlstate;
  return new;
end;
$$;

drop trigger if exists trg_eventos_operacionais_jornada_matricula on public.aluno_jornada_matricula_disciplina;
create trigger trg_eventos_operacionais_jornada_matricula
after insert or update of fonte_ultima_atualizacao, status_matricula, curso_id,
  curso_nome_emusys, emusys_disciplina_id, professor_id, alteracao_descricao_emusys
on public.aluno_jornada_matricula_disciplina
for each row
execute function public.trg_eventos_operacionais_jornada_matricula();

create or replace function public.trg_eventos_operacionais_aviso_previo()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id integer;
  v_unidade_id uuid;
  v_aluno_id integer;
  v_aluno_nome text;
  v_professor_id integer;
  v_curso_id integer;
  v_data date;
  v_data_prevista date;
  v_motivo text;
  v_emusys_aviso_previo_id integer;
  v_created_at timestamptz;
  v_updated_at timestamptz;
  v_origem_registro text;
  v_anulado boolean;
  v_acao text;
  v_audiencia jsonb;
  v_curso text;
  v_antes jsonb := '{}'::jsonb;
  v_depois jsonb := '{}'::jsonb;
  v_mudanca jsonb;
begin
  if tg_op = 'DELETE' then
    if old.tipo <> 'aviso_previo' then
      return old;
    end if;
    v_id := old.id;
    v_unidade_id := old.unidade_id;
    v_aluno_id := old.aluno_id;
    v_aluno_nome := old.aluno_nome;
    v_professor_id := old.professor_id;
    v_curso_id := old.curso_id;
    v_data := old.data;
    v_data_prevista := coalesce(old.data_prevista_saida, old.mes_saida - 1);
    v_motivo := old.motivo;
    v_emusys_aviso_previo_id := old.emusys_aviso_previo_id;
    v_created_at := old.created_at;
    v_updated_at := old.updated_at;
    v_origem_registro := old.origem_registro;
    v_anulado := old.anulado;
    v_acao := 'removido';
    v_antes := jsonb_strip_nulls(jsonb_build_object(
      'data_prevista', v_data_prevista
    ));
    v_depois := jsonb_build_object('acao', v_acao);
  else
    if new.tipo <> 'aviso_previo' then
      return new;
    end if;
    if tg_op = 'INSERT' and coalesce(new.anulado, false) then
      return new;
    end if;

    v_id := new.id;
    v_unidade_id := new.unidade_id;
    v_aluno_id := new.aluno_id;
    v_aluno_nome := new.aluno_nome;
    v_professor_id := new.professor_id;
    v_curso_id := new.curso_id;
    v_data := new.data;
    v_data_prevista := coalesce(new.data_prevista_saida, new.mes_saida - 1);
    v_motivo := new.motivo;
    v_emusys_aviso_previo_id := new.emusys_aviso_previo_id;
    v_created_at := new.created_at;
    v_updated_at := new.updated_at;
    v_origem_registro := new.origem_registro;
    v_anulado := new.anulado;

    if tg_op = 'INSERT' then
      v_acao := 'adicionado';
      v_depois := jsonb_strip_nulls(jsonb_build_object(
        'acao', v_acao,
        'data_prevista', v_data_prevista
      ));
    elsif coalesce(old.anulado, false) = false and coalesce(new.anulado, false) = true then
      v_acao := 'removido';
      v_antes := jsonb_strip_nulls(jsonb_build_object(
        'data_prevista', coalesce(old.data_prevista_saida, old.mes_saida - 1)
      ));
      v_depois := jsonb_build_object('acao', v_acao);
    elsif coalesce(old.anulado, false) = true and coalesce(new.anulado, false) = false then
      v_acao := 'adicionado';
      v_depois := jsonb_strip_nulls(jsonb_build_object(
        'acao', v_acao,
        'data_prevista', v_data_prevista
      ));
    elsif old.motivo is distinct from new.motivo
       or old.data_prevista_saida is distinct from new.data_prevista_saida
       or old.mes_saida is distinct from new.mes_saida
       or old.aluno_id is distinct from new.aluno_id
       or old.professor_id is distinct from new.professor_id
       or old.curso_id is distinct from new.curso_id
       or old.emusys_aviso_previo_id is distinct from new.emusys_aviso_previo_id then
      v_acao := 'editado';
      v_antes := jsonb_strip_nulls(jsonb_build_object(
        'data_prevista', coalesce(old.data_prevista_saida, old.mes_saida - 1)
      ));
      v_depois := jsonb_strip_nulls(jsonb_build_object(
        'acao', v_acao,
        'data_prevista', v_data_prevista
      ));
    else
      return new;
    end if;
  end if;

  v_aluno_nome := coalesce(
    (select a.nome::text from public.alunos a where a.id = v_aluno_id),
    v_aluno_nome
  );

  select c.nome::text into v_curso
  from public.cursos c
  where c.id = v_curso_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('professor_id', x.professor_id, 'participacao', 'responsavel') order by x.professor_id),
    '[]'::jsonb
  ) into v_audiencia
  from (
    select distinct j.professor_id
    from public.aluno_jornada_matricula_disciplina j
    where j.unidade_id = v_unidade_id
      and j.aluno_id = v_aluno_id
      and j.professor_id is not null
    union
    select v_professor_id
    where v_professor_id is not null
  ) x;

  if v_audiencia = '[]'::jsonb then
    return coalesce(new, old);
  end if;

  v_mudanca := jsonb_build_object('antes', v_antes, 'depois', v_depois);

  perform public.fn_eventos_operacionais_registrar(
    'u:' || v_unidade_id::text || ':aviso_previo:'
      || coalesce(v_emusys_aviso_previo_id::text, v_id::text)
      || ':' || v_acao || ':' || md5(jsonb_build_object(
        'data', v_data,
        'data_prevista', v_data_prevista,
        'motivo', v_motivo,
        'aluno_id', v_aluno_id
      )::text),
    'aviso_previo',
    coalesce(v_updated_at, v_created_at, v_data::timestamptz),
    public.fn_eventos_operacionais_origem(v_origem_registro),
    v_unidade_id,
    v_aluno_id,
    v_aluno_nome,
    null,
    v_curso,
    null,
    v_mudanca,
    v_motivo,
    null,
    v_audiencia
  );

  return coalesce(new, old);
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_AVISO_PREVIO_FALHOU id=% sqlstate=%', coalesce(new.id, old.id), sqlstate;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_eventos_operacionais_aviso_previo on public.movimentacoes_admin;
create trigger trg_eventos_operacionais_aviso_previo
after insert or delete or update of tipo, aluno_id, professor_id, curso_id, motivo,
  data_prevista_saida, mes_saida, emusys_aviso_previo_id, anulado
on public.movimentacoes_admin
for each row
execute function public.trg_eventos_operacionais_aviso_previo();

create or replace function public.trg_eventos_operacionais_experimental()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inicio timestamptz;
  v_inicio_anterior timestamptz;
  v_aluno_nome text;
  v_curso text;
  v_mudanca jsonb;
  v_aula jsonb;
begin
  if tg_op = 'UPDATE'
     and old.data_experimental is not distinct from new.data_experimental
     and old.horario_experimental is not distinct from new.horario_experimental
     and old.professor_experimental_id is not distinct from new.professor_experimental_id
     and old.emusys_aula_id is not distinct from new.emusys_aula_id then
    return new;
  end if;

  if new.data_experimental is null or new.horario_experimental is null
     or new.professor_experimental_id is null then
    return new;
  end if;
  if lower(coalesce(new.status, '')) in ('cancelada', 'cancelado') then
    return new;
  end if;

  v_inicio := (new.data_experimental + new.horario_experimental)
    at time zone 'America/Sao_Paulo';
  if tg_op = 'UPDATE' and old.data_experimental is not null and old.horario_experimental is not null then
    v_inicio_anterior := (old.data_experimental + old.horario_experimental)
      at time zone 'America/Sao_Paulo';
  end if;

  if not public.fn_eventos_operacionais_na_janela_aula(v_inicio_anterior, v_inicio) then
    return new;
  end if;

  if new.emusys_aula_id is not null and exists (
    select 1
    from public.aulas_emusys ae
    where ae.unidade_id = new.unidade_id
      and ae.emusys_id = new.emusys_aula_id
  ) then
    return new;
  end if;

  select coalesce(a.nome::text, new.nome_aluno)
    into v_aluno_nome
    from public.alunos a
   where a.id = new.aluno_id;
  v_aluno_nome := coalesce(v_aluno_nome, new.nome_aluno);

  select c.nome::text into v_curso
  from public.cursos c
  where c.id = new.curso_interesse_id;

  v_mudanca := jsonb_build_object(
    'antes', case
      when tg_op = 'INSERT' then '{}'::jsonb
      else jsonb_build_object('inicio', v_inicio_anterior)
    end,
    'depois', jsonb_build_object('inicio', v_inicio)
  );
  v_aula := jsonb_build_object(
    'emusys_id', new.emusys_aula_id,
    'inicio', v_inicio,
    'fim', null,
    'turma', null
  );

  perform public.fn_eventos_operacionais_registrar(
    'u:' || new.unidade_id::text || ':experimental:' || new.id::text
      || ':experimental_marcada:' || md5(jsonb_build_object(
        'inicio_anterior', v_inicio_anterior,
        'inicio', v_inicio,
        'professor_id', new.professor_experimental_id
      )::text),
    'experimental_marcada',
    coalesce(new.updated_at, new.created_at),
    'sincronizacao',
    new.unidade_id,
    new.aluno_id,
    v_aluno_nome,
    null,
    v_curso,
    v_aula,
    v_mudanca,
    null,
    null,
    jsonb_build_array(jsonb_build_object(
      'professor_id', new.professor_experimental_id,
      'participacao', 'responsavel'
    ))
  );
  return new;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_EXPERIMENTAL_FALHOU lead=% sqlstate=%', new.id, sqlstate;
  return new;
end;
$$;

drop trigger if exists trg_eventos_operacionais_experimental on public.lead_experimentais;
create trigger trg_eventos_operacionais_experimental
after insert or update of data_experimental, horario_experimental, professor_experimental_id, emusys_aula_id
on public.lead_experimentais
for each row
execute function public.trg_eventos_operacionais_experimental();

create or replace function public.fn_eventos_operacionais_professor_v1(
  p_professor_id integer,
  p_desde timestamptz,
  p_cursor_detectado_em timestamptz default null,
  p_cursor_evento_id text default null,
  p_limite integer default 50,
  p_tipos text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limite integer;
begin
  if p_desde is null then
    raise exception 'p_desde e obrigatorio' using errcode = '22023';
  end if;
  if (p_cursor_detectado_em is null) <> (p_cursor_evento_id is null) then
    raise exception 'cursor incompleto' using errcode = '22023';
  end if;

  v_limite := coalesce(p_limite, 50);
  if v_limite < 1 or v_limite > 200 then
    raise exception 'p_limite deve estar entre 1 e 200' using errcode = '22023';
  end if;

  return (
    with selecionados as materialized (
      select
        e.evento_id,
        e.tipo,
        ea.professor_id,
        ea.participacao,
        e.ocorreu_em,
        ea.detectado_em,
        e.origem,
        e.unidade_id,
        u.nome::text as unidade_nome,
        e.aluno_id,
        coalesce(e.aluno_nome, a.nome::text) as aluno_nome,
        e.curso,
        e.aula,
        e.mudanca,
        e.motivo,
        e.detalhe
      from public.eventos_operacionais_audiencia ea
      join public.eventos_operacionais e on e.evento_id = ea.evento_id
      join public.unidades u on u.id = e.unidade_id
      left join public.alunos a on a.id = e.aluno_id
      where ea.detectado_em >= p_desde
        and (p_professor_id is null or ea.professor_id = p_professor_id)
        and (p_tipos is null or e.tipo = any(p_tipos))
        and (
          p_cursor_detectado_em is null
          or (ea.detectado_em, ea.evento_id) < (p_cursor_detectado_em, p_cursor_evento_id)
        )
      order by ea.detectado_em desc, ea.evento_id desc
      limit v_limite + 1
    ), pagina as materialized (
      select *
      from selecionados
      order by detectado_em desc, evento_id desc
      limit v_limite
    ), ultimo as (
      select evento_id, detectado_em
      from pagina
      order by detectado_em asc, evento_id asc
      limit 1
    )
    select jsonb_build_object(
      'itens', coalesce(
        (
          select jsonb_agg(jsonb_build_object(
            'evento_id', p.evento_id,
            'tipo', p.tipo,
            'professor_id', p.professor_id,
            'participacao', p.participacao,
            'ocorreu_em', p.ocorreu_em,
            'detectado_em', p.detectado_em,
            'origem', p.origem,
            'unidade', jsonb_build_object('id', p.unidade_id, 'nome', p.unidade_nome),
            'aluno', case when p.aluno_id is null then null
              else jsonb_build_object('id', p.aluno_id, 'nome', p.aluno_nome) end,
            'curso', p.curso,
            'aula', p.aula,
            'mudanca', p.mudanca,
            'motivo', p.motivo,
            'detalhe', p.detalhe
          ) order by p.detectado_em desc, p.evento_id desc)
          from pagina p
        ),
        '[]'::jsonb
      ),
      'proximo_cursor', case
        when (select count(*) from selecionados) > v_limite then (
          select jsonb_build_object(
            'detectado_em', u.detectado_em,
            'evento_id', u.evento_id
          ) from ultimo u
        )
        else null
      end
    )
  );
end;
$$;

create or replace function public.fn_aniversariantes_do_professor_v1(
  p_professor_id integer,
  p_de date,
  p_ate date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_professor_id is null or p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'professor e intervalo validos sao obrigatorios' using errcode = '22023';
  end if;
  if p_ate - p_de > 366 then
    raise exception 'intervalo maximo de 366 dias' using errcode = '22023';
  end if;

  return (
    with pessoas as materialized (
      select distinct on (
        e.unidade_id,
        coalesce(nullif(a.emusys_student_id::text, ''), 'local:' || a.id::text)
      )
        a.id as aluno_id,
        a.nome::text as aluno_nome,
        a.data_nascimento,
        lateral_curso.curso
      from public.vw_alunos_estado_operacional_v131 e
      join public.alunos a on a.id = e.aluno_id
      left join lateral (
        select coalesce(c.nome::text, j.curso_nome_emusys) as curso
        from public.aluno_jornada_matricula_disciplina j
        left join public.cursos c on c.id = j.curso_id
        where j.unidade_id = e.unidade_id
          and j.aluno_id = e.aluno_id
          and j.professor_id = p_professor_id
          and j.status_matricula = 'ativa'
        order by j.updated_at desc nulls last, j.id
        limit 1
      ) lateral_curso on true
      where e.entra_carteira_professor = true
        and a.arquivado_em is null
        and a.data_nascimento is not null
        and lateral_curso.curso is not null
      order by
        e.unidade_id,
        coalesce(nullif(a.emusys_student_id::text, ''), 'local:' || a.id::text),
        a.id
    ), aniversarios as (
      select
        gs.dia::date as dia,
        p.aluno_id,
        p.aluno_nome,
        p.data_nascimento,
        p.curso
      from pessoas p
      cross join lateral generate_series(p_de, p_ate, interval '1 day') gs(dia)
      where to_char(p.data_nascimento, 'MM-DD') = to_char(gs.dia::date, 'MM-DD')
    )
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'aluno', jsonb_build_object('id', aluno_id, 'nome', aluno_nome),
        'data_nascimento_dia_mes', to_char(data_nascimento, 'MM-DD'),
        'idade_que_faz', extract(year from age(dia, data_nascimento))::integer,
        'curso', curso
      ) order by dia, aluno_nome, aluno_id),
      '[]'::jsonb
    )
    from aniversarios
  );
end;
$$;

revoke all on function public.fn_eventos_operacionais_professor_v1(integer, timestamptz, timestamptz, text, integer, text[]) from public, anon, authenticated, service_role;
grant execute on function public.fn_eventos_operacionais_professor_v1(integer, timestamptz, timestamptz, text, integer, text[]) to service_role;
revoke all on function public.fn_aniversariantes_do_professor_v1(integer, date, date) from public, anon, authenticated, service_role;
grant execute on function public.fn_aniversariantes_do_professor_v1(integer, date, date) to service_role;

create or replace function public.fn_eventos_operacionais_carga_inicial_v1(
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
  v_reagendadas integer := 0;
  v_canceladas integer := 0;
  v_experimentais integer := 0;
  v_avisos integer := 0;
  v_transicoes integer := 0;
  v_aluno_id integer;
  v_aluno_nome text;
  v_curso text;
  v_curso_anterior text;
  v_audiencia jsonb;
  v_mudanca jsonb;
  v_aula jsonb;
  v_inicio_anterior timestamptz;
  v_inicio_atual timestamptz;
  v_inicio_experimental timestamptz;
  v_acao text;
  v_data_prevista date;
begin
  if p_desde is null then
    p_desde := clock_timestamp() - interval '7 days';
  end if;

  -- Reagendamentos e cancelamentos: a revisao guarda o estado anterior sem
  -- depender de payloads de webhook ou de uma varredura da agenda ao vivo.
  for r in
    with candidatas as (
      select distinct rev.aula_staging_id
      from public.emusys_aulas_historico_revisoes_v1 rev
      where rev.ultima_coleta_em >= p_desde
    ), historico as (
      select
        rev.*,
        lag(rev.payload ->> 'data_hora_inicio') over (
          partition by rev.aula_staging_id
          order by rev.primeira_coleta_em, rev.id
        ) as inicio_anterior_texto,
        lag(coalesce(rev.payload ->> 'cancelada', 'false')) over (
          partition by rev.aula_staging_id
          order by rev.primeira_coleta_em, rev.id
        ) as cancelada_anterior_texto
      from public.emusys_aulas_historico_revisoes_v1 rev
      join candidatas c on c.aula_staging_id = rev.aula_staging_id
    )
    select
      h.unidade_id,
      h.emusys_aula_id,
      h.ultima_coleta_em,
      public.fn_eventos_operacionais_timestamptz(h.inicio_anterior_texto) as inicio_anterior,
      public.fn_eventos_operacionais_timestamptz(h.payload ->> 'data_hora_inicio') as inicio_atual,
      h.cancelada_anterior_texto,
      coalesce(h.payload ->> 'cancelada', 'false') as cancelada_atual_texto,
      ae.id as aula_id,
      ae.professor_id,
      ae.matricula_disciplina_id,
      ae.turma_nome,
      ae.curso_nome,
      ae.data_hora_fim
    from historico h
    left join public.aulas_emusys ae
      on ae.unidade_id = h.unidade_id
     and ae.emusys_id = h.emusys_aula_id
    where h.ultima_coleta_em >= p_desde
      and (
        h.inicio_anterior_texto is distinct from h.payload ->> 'data_hora_inicio'
        or (coalesce(h.cancelada_anterior_texto, 'false') <> 'true'
            and coalesce(h.payload ->> 'cancelada', 'false') = 'true')
      )
  loop
    v_inicio_anterior := r.inicio_anterior;
    v_inicio_atual := r.inicio_atual;
    v_aluno_id := null;
    v_aluno_nome := null;
    if r.aula_id is not null and r.turma_nome is null then
      select x.aluno_id, x.aluno_nome
        into v_aluno_id, v_aluno_nome
        from public.fn_eventos_operacionais_aluno_da_aula(
          r.aula_id,
          r.unidade_id,
          r.matricula_disciplina_id
        ) x;
    end if;
    v_audiencia := case when r.professor_id is null then '[]'::jsonb else jsonb_build_array(
      jsonb_build_object('professor_id', r.professor_id, 'participacao', 'responsavel')
    ) end;
    if v_audiencia = '[]'::jsonb then
      continue;
    end if;
    v_aula := jsonb_build_object(
      'emusys_id', r.emusys_aula_id,
      'inicio', coalesce(v_inicio_atual, v_inicio_anterior),
      'fim', r.data_hora_fim,
      'turma', r.turma_nome
    );

    if v_inicio_anterior is not null and v_inicio_atual is not null
       and v_inicio_anterior is distinct from v_inicio_atual
       and public.fn_eventos_operacionais_na_janela_aula(v_inicio_anterior, v_inicio_atual) then
      v_mudanca := jsonb_build_object(
        'antes', jsonb_build_object('inicio', v_inicio_anterior),
        'depois', jsonb_build_object('inicio', v_inicio_atual)
      );
      select public.fn_eventos_operacionais_registrar(
        'u:' || r.unidade_id::text || ':aula:' || r.emusys_aula_id::text
          || ':aula_reagendada:' || md5(v_mudanca::text),
        'aula_reagendada',
        r.ultima_coleta_em,
        'carga_inicial',
        r.unidade_id,
        v_aluno_id,
        v_aluno_nome,
        r.aula_id,
        r.curso_nome,
        v_aula,
        v_mudanca,
        null,
        null,
        v_audiencia
      ) into v_inserido;
      if v_inserido then
        v_total := v_total + 1;
        v_reagendadas := v_reagendadas + 1;
      end if;
    end if;

    if coalesce(r.cancelada_anterior_texto, 'false') <> 'true'
       and coalesce(r.cancelada_atual_texto, 'false') = 'true'
       and public.fn_eventos_operacionais_na_janela_aula(v_inicio_anterior, v_inicio_atual) then
      v_mudanca := jsonb_build_object(
        'antes', jsonb_build_object('status', 'ativa'),
        'depois', jsonb_build_object('status', 'cancelada')
      );
      select public.fn_eventos_operacionais_registrar(
        'u:' || r.unidade_id::text || ':aula:' || r.emusys_aula_id::text
          || ':aula_cancelada:' || md5(v_mudanca::text),
        'aula_cancelada',
        r.ultima_coleta_em,
        'carga_inicial',
        r.unidade_id,
        v_aluno_id,
        v_aluno_nome,
        r.aula_id,
        r.curso_nome,
        v_aula,
        v_mudanca,
        null,
        null,
        v_audiencia
      ) into v_inserido;
      if v_inserido then
        v_total := v_total + 1;
        v_canceladas := v_canceladas + 1;
      end if;
    end if;
  end loop;

  -- Avisos existentes no periodo. Remocoes antigas nao existem mais na tabela,
  -- portanto so passam a ser observadas pelo gatilho a partir desta migration.
  for r in
    select m.*
    from public.movimentacoes_admin m
    where m.tipo = 'aviso_previo'
      and not coalesce(m.anulado, false)
      and coalesce(m.updated_at, m.created_at) >= p_desde
  loop
    v_acao := case when r.created_at >= p_desde then 'adicionado' else 'editado' end;
    v_data_prevista := coalesce(r.data_prevista_saida, r.mes_saida - 1);
    select coalesce(a.nome::text, r.aluno_nome) into v_aluno_nome
    from public.alunos a
    where a.id = r.aluno_id;
    v_aluno_nome := coalesce(v_aluno_nome, r.aluno_nome);
    select c.nome::text into v_curso from public.cursos c where c.id = r.curso_id;
    select coalesce(
      jsonb_agg(jsonb_build_object('professor_id', x.professor_id, 'participacao', 'responsavel') order by x.professor_id),
      '[]'::jsonb
    ) into v_audiencia
    from (
      select distinct j.professor_id
      from public.aluno_jornada_matricula_disciplina j
      where j.unidade_id = r.unidade_id
        and j.aluno_id = r.aluno_id
        and j.professor_id is not null
      union
      select r.professor_id where r.professor_id is not null
    ) x;
    if v_audiencia = '[]'::jsonb then
      continue;
    end if;
    v_mudanca := jsonb_build_object(
      'antes', '{}'::jsonb,
      'depois', jsonb_strip_nulls(jsonb_build_object(
        'acao', v_acao,
        'data_prevista', v_data_prevista
      ))
    );
    select public.fn_eventos_operacionais_registrar(
      'u:' || r.unidade_id::text || ':aviso_previo:'
        || coalesce(r.emusys_aviso_previo_id::text, r.id::text)
        || ':' || v_acao || ':' || md5(jsonb_build_object(
          'data', r.data,
          'data_prevista', v_data_prevista,
          'motivo', r.motivo,
          'aluno_id', r.aluno_id
        )::text),
      'aviso_previo',
      coalesce(r.updated_at, r.created_at, r.data::timestamptz),
      'carga_inicial',
      r.unidade_id,
      r.aluno_id,
      v_aluno_nome,
      null,
      v_curso,
      null,
      v_mudanca,
      r.motivo,
      null,
      v_audiencia
    ) into v_inserido;
    if v_inserido then
      v_total := v_total + 1;
      v_avisos := v_avisos + 1;
    end if;
  end loop;

  for r in
    select l.*
    from public.lead_experimentais l
    where coalesce(l.updated_at, l.created_at) >= p_desde
      and l.data_experimental is not null
      and l.horario_experimental is not null
      and l.professor_experimental_id is not null
      and lower(coalesce(l.status, '')) not in ('cancelada', 'cancelado')
      and not exists (
        select 1
        from public.aulas_emusys ae
        where ae.unidade_id = l.unidade_id
          and l.emusys_aula_id is not null
          and ae.emusys_id = l.emusys_aula_id
      )
  loop
    v_inicio_experimental := (r.data_experimental + r.horario_experimental)
      at time zone 'America/Sao_Paulo';
    if not public.fn_eventos_operacionais_na_janela_aula(null, v_inicio_experimental) then
      continue;
    end if;
    select coalesce(a.nome::text, r.nome_aluno) into v_aluno_nome
    from public.alunos a
    where a.id = r.aluno_id;
    v_aluno_nome := coalesce(v_aluno_nome, r.nome_aluno);
    select c.nome::text into v_curso from public.cursos c where c.id = r.curso_interesse_id;
    v_mudanca := jsonb_build_object(
      'antes', '{}'::jsonb,
      'depois', jsonb_build_object('inicio', v_inicio_experimental)
    );
    v_aula := jsonb_build_object(
      'emusys_id', r.emusys_aula_id,
      'inicio', v_inicio_experimental,
      'fim', null,
      'turma', null
    );
    select public.fn_eventos_operacionais_registrar(
      'u:' || r.unidade_id::text || ':experimental:' || r.id::text
        || ':experimental_marcada:' || md5(jsonb_build_object(
          'inicio', v_inicio_experimental,
          'professor_id', r.professor_experimental_id
        )::text),
      'experimental_marcada',
      coalesce(r.updated_at, r.created_at),
      'carga_inicial',
      r.unidade_id,
      r.aluno_id,
      v_aluno_nome,
      null,
      v_curso,
      v_aula,
      v_mudanca,
      null,
      null,
      jsonb_build_array(jsonb_build_object(
        'professor_id', r.professor_experimental_id,
        'participacao', 'responsavel'
      ))
    ) into v_inserido;
    if v_inserido then
      v_total := v_total + 1;
      v_experimentais := v_experimentais + 1;
    end if;
  end loop;

  for r in
    select t.*
    from public.aluno_professor_transicoes t
    where coalesce(t.created_at, t.data_transicao) >= p_desde
      and t.professor_anterior_id is distinct from t.professor_novo_id
      and (t.professor_anterior_id is not null or t.professor_novo_id is not null)
  loop
    select a.nome::text into v_aluno_nome from public.alunos a where a.id = r.aluno_id;
    select c.nome::text into v_curso from public.cursos c where c.id = r.curso_id;
    select c.nome::text into v_curso_anterior from public.cursos c where c.id = r.curso_anterior_id;
    select coalesce(
      jsonb_agg(jsonb_build_object('professor_id', x.professor_id, 'participacao', x.participacao) order by x.professor_id),
      '[]'::jsonb
    ) into v_audiencia
    from (
      select r.professor_anterior_id as professor_id, 'saiu'::text as participacao
      union all
      select r.professor_novo_id, 'entrou'::text
    ) x
    where x.professor_id is not null;
    if v_audiencia = '[]'::jsonb then
      continue;
    end if;
    v_mudanca := jsonb_build_object(
      'antes', jsonb_strip_nulls(jsonb_build_object(
        'professor', r.professor_anterior_id,
        'curso', v_curso_anterior
      )),
      'depois', jsonb_strip_nulls(jsonb_build_object(
        'professor', r.professor_novo_id,
        'curso', v_curso
      ))
    );
    select public.fn_eventos_operacionais_registrar(
      'u:' || r.unidade_id::text || ':transicao:' || r.id::text,
      'professor_trocado',
      r.data_transicao,
      'carga_inicial',
      r.unidade_id,
      r.aluno_id,
      v_aluno_nome,
      null,
      coalesce(v_curso, v_curso_anterior),
      null,
      v_mudanca,
      null,
      null,
      v_audiencia
    ) into v_inserido;
    if v_inserido then
      v_total := v_total + 1;
      v_transicoes := v_transicoes + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'desde', p_desde,
    'inseridos', v_total,
    'total', v_total,
    'por_tipo', jsonb_strip_nulls(jsonb_build_object(
      'aula_reagendada', case when v_reagendadas > 0 then v_reagendadas end,
      'aula_cancelada', case when v_canceladas > 0 then v_canceladas end,
      'experimental_marcada', case when v_experimentais > 0 then v_experimentais end,
      'aviso_previo', case when v_avisos > 0 then v_avisos end,
      'professor_trocado', case when v_transicoes > 0 then v_transicoes end
    ))
  );
exception when others then
  raise exception 'carga inicial de eventos operacionais falhou: %', sqlerrm using errcode = sqlstate;
end;
$$;

revoke all on function public.fn_eventos_operacionais_carga_inicial_v1(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.fn_eventos_operacionais_carga_inicial_v1(timestamptz) to service_role;
