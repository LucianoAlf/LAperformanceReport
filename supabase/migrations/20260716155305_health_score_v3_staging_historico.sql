-- Health Score Professor V3 - staging historico isolado do Emusys.
-- Esta camada recebe evidencia bruta e nao altera fontes operacionais.

create table public.emusys_historico_backfill_execucoes_v1 (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  data_inicio date not null,
  data_fim date not null,
  janela_inicio_atual date not null,
  janela_fim_atual date not null,
  cursor_atual text,
  status text not null default 'pendente'
    check (status in ('pendente', 'executando', 'pausado', 'concluido', 'falhou')),
  paginas_processadas integer not null default 0
    check (paginas_processadas >= 0),
  aulas_recebidas integer not null default 0
    check (aulas_recebidas >= 0),
  requisicoes_realizadas integer not null default 0
    check (requisicoes_realizadas >= 0),
  tentativas integer not null default 0
    check (tentativas >= 0),
  ultimo_erro_codigo text,
  ultimo_erro_contexto jsonb,
  ultimo_erro_em timestamptz,
  iniciado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz,
  criado_por integer references public.usuarios(id),
  created_at timestamptz not null default now(),
  check (data_fim >= data_inicio),
  check (janela_fim_atual >= janela_inicio_atual),
  check (janela_inicio_atual >= data_inicio),
  check (janela_fim_atual <= data_fim),
  check (concluido_em is null or status = 'concluido')
);

comment on table public.emusys_historico_backfill_execucoes_v1 is
  'Checkpoint retomavel do coletor historico Emusys do Health Score Professor V3.';
comment on column public.emusys_historico_backfill_execucoes_v1.ultimo_erro_contexto is
  'Contexto tecnico sem payload pessoal, token ou mensagem bruta da API.';

create unique index uq_emusys_historico_backfill_execucao_unidade
  on public.emusys_historico_backfill_execucoes_v1 (unidade_id)
  where status = 'executando';

create index idx_emusys_historico_backfill_status
  on public.emusys_historico_backfill_execucoes_v1 (status, atualizado_em desc);

create table public.emusys_aulas_historico_staging_v1 (
  id bigint generated always as identity primary key,
  execucao_id uuid not null
    references public.emusys_historico_backfill_execucoes_v1(id),
  unidade_id uuid not null references public.unidades(id),
  emusys_aula_id bigint not null,
  data_hora_inicio timestamptz,
  data_hora_inicio_original timestamptz,
  categoria text,
  cancelada boolean not null default false,
  reagendada boolean not null default false,
  justificada boolean not null default false,
  emusys_turma_id bigint,
  turma_nome text,
  emusys_disciplina_id bigint,
  disciplina_nome text,
  emusys_professor_id bigint,
  professor_nome text,
  sem_acompanhamento boolean not null default false,
  payload jsonb not null,
  payload_hash text not null,
  coletado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, emusys_aula_id),
  check (payload_hash ~ '^[0-9a-f]{64}$'),
  check (not sem_acompanhamento or coalesce(emusys_professor_id, 0) = 0)
);

comment on table public.emusys_aulas_historico_staging_v1 is
  'Ultima versao observada de cada aula historica; versoes anteriores ficam na tabela de revisoes.';
comment on column public.emusys_aulas_historico_staging_v1.payload is
  'Payload bruto da aula, preservado para reconstrucao auditavel.';

create index idx_emusys_aulas_historico_unidade_data
  on public.emusys_aulas_historico_staging_v1 (unidade_id, data_hora_inicio);
create index idx_emusys_aulas_historico_professor
  on public.emusys_aulas_historico_staging_v1 (unidade_id, emusys_professor_id);
create index idx_emusys_aulas_historico_disciplina
  on public.emusys_aulas_historico_staging_v1 (unidade_id, emusys_disciplina_id);

create table public.emusys_aulas_historico_revisoes_v1 (
  id bigint generated always as identity primary key,
  aula_staging_id bigint not null
    references public.emusys_aulas_historico_staging_v1(id) on delete restrict,
  execucao_id uuid not null
    references public.emusys_historico_backfill_execucoes_v1(id),
  unidade_id uuid not null references public.unidades(id),
  emusys_aula_id bigint not null,
  payload_hash text not null,
  payload jsonb not null,
  primeira_coleta_em timestamptz not null default now(),
  ultima_coleta_em timestamptz not null default now(),
  vezes_observado integer not null default 1 check (vezes_observado > 0),
  unique (unidade_id, emusys_aula_id, payload_hash),
  check (payload_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.emusys_aulas_historico_revisoes_v1 is
  'Evidencia append-only das versoes distintas observadas para uma aula do Emusys.';

create index idx_emusys_aulas_historico_revisoes_aula
  on public.emusys_aulas_historico_revisoes_v1 (aula_staging_id, primeira_coleta_em);

create table public.emusys_aula_alunos_historico_staging_v1 (
  id bigint generated always as identity primary key,
  aula_staging_id bigint not null
    references public.emusys_aulas_historico_staging_v1(id) on delete cascade,
  execucao_id uuid not null
    references public.emusys_historico_backfill_execucoes_v1(id),
  unidade_id uuid not null references public.unidades(id),
  emusys_aula_id bigint not null,
  emusys_aluno_id bigint,
  aluno_id integer,
  aluno_nome_origem text,
  emusys_matricula_id bigint,
  emusys_matricula_disciplina_id bigint,
  presenca_origem text,
  justificada_origem boolean,
  linha_hash text not null,
  payload jsonb not null,
  coletado_em timestamptz not null default now(),
  unique (aula_staging_id, linha_hash),
  check (linha_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.emusys_aula_alunos_historico_staging_v1 is
  'Linhas distintas de roster observadas no historico; registros existentes nunca sao apagados pelo coletor.';
comment on column public.emusys_aula_alunos_historico_staging_v1.aluno_id is
  'Vinculo local opcional e nao bloqueante; o staging aceita identidade ainda nao conciliada.';

create index idx_emusys_aula_alunos_historico_unidade_aluno
  on public.emusys_aula_alunos_historico_staging_v1 (unidade_id, emusys_aluno_id);
create index idx_emusys_aula_alunos_historico_matricula
  on public.emusys_aula_alunos_historico_staging_v1
  (unidade_id, emusys_matricula_id, emusys_matricula_disciplina_id);

alter table public.emusys_historico_backfill_execucoes_v1 enable row level security;
alter table public.emusys_aulas_historico_staging_v1 enable row level security;
alter table public.emusys_aulas_historico_revisoes_v1 enable row level security;
alter table public.emusys_aula_alunos_historico_staging_v1 enable row level security;

revoke all on public.emusys_historico_backfill_execucoes_v1 from public, anon, authenticated;
revoke all on public.emusys_aulas_historico_staging_v1 from public, anon, authenticated;
revoke all on public.emusys_aulas_historico_revisoes_v1 from public, anon, authenticated;
revoke all on public.emusys_aula_alunos_historico_staging_v1 from public, anon, authenticated;

grant select, insert, update, delete
  on public.emusys_historico_backfill_execucoes_v1 to service_role;
grant select, insert, update, delete
  on public.emusys_aulas_historico_staging_v1 to service_role;
grant select, insert, update, delete
  on public.emusys_aulas_historico_revisoes_v1 to service_role;
grant select, insert, update, delete
  on public.emusys_aula_alunos_historico_staging_v1 to service_role;

revoke all on sequence public.emusys_aulas_historico_staging_v1_id_seq
  from public, anon, authenticated;
revoke all on sequence public.emusys_aulas_historico_revisoes_v1_id_seq
  from public, anon, authenticated;
revoke all on sequence public.emusys_aula_alunos_historico_staging_v1_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.emusys_aulas_historico_staging_v1_id_seq
  to service_role;
grant usage, select on sequence public.emusys_aulas_historico_revisoes_v1_id_seq
  to service_role;
grant usage, select on sequence public.emusys_aula_alunos_historico_staging_v1_id_seq
  to service_role;

create or replace function public.registrar_pagina_backfill_historico_professor_v1(
  p_execucao_id uuid,
  p_janela_inicio date,
  p_janela_fim date,
  p_cursor_esperado text,
  p_aulas jsonb,
  p_proximo_cursor text,
  p_tem_mais boolean,
  p_proxima_janela_inicio date default null,
  p_proxima_janela_fim date default null,
  p_requisicoes_realizadas integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execucao public.emusys_historico_backfill_execucoes_v1%rowtype;
  v_aula jsonb;
  v_aluno jsonb;
  v_aula_staging_id bigint;
  v_payload_hash text;
  v_payload_hash_anterior text;
  v_total_aulas integer;
  v_status text;
  v_cursor text;
  v_janela_inicio date;
  v_janela_fim date;
  v_concluido_em timestamptz;
begin
  if jsonb_typeof(coalesce(p_aulas, '[]'::jsonb)) <> 'array' then
    raise exception 'BACKFILL_AULAS_INVALIDAS' using errcode = '22023';
  end if;
  v_total_aulas := jsonb_array_length(coalesce(p_aulas, '[]'::jsonb));

  if coalesce(p_requisicoes_realizadas, 0) < 1 then
    raise exception 'BACKFILL_REQUISICOES_INVALIDAS' using errcode = '22023';
  end if;

  select *
    into v_execucao
    from public.emusys_historico_backfill_execucoes_v1
   where id = p_execucao_id
   for update;

  if not found then
    raise exception 'BACKFILL_EXECUCAO_NAO_ENCONTRADA' using errcode = 'P0002';
  end if;

  if v_execucao.status <> 'executando' then
    raise exception 'BACKFILL_EXECUCAO_FORA_DE_ESTADO: %', v_execucao.status
      using errcode = '55000';
  end if;

  if v_execucao.janela_inicio_atual is distinct from p_janela_inicio
     or v_execucao.janela_fim_atual is distinct from p_janela_fim
     or v_execucao.cursor_atual is distinct from p_cursor_esperado then
    raise exception 'BACKFILL_CHECKPOINT_DIVERGENTE' using errcode = '40001';
  end if;

  if p_tem_mais and nullif(btrim(p_proximo_cursor), '') is null then
    raise exception 'BACKFILL_CURSOR_AUSENTE' using errcode = '22023';
  end if;

  if not p_tem_mais
     and ((p_proxima_janela_inicio is null) <> (p_proxima_janela_fim is null)) then
    raise exception 'BACKFILL_PROXIMA_JANELA_INCOMPLETA' using errcode = '22023';
  end if;

  for v_aula in
    select value from jsonb_array_elements(coalesce(p_aulas, '[]'::jsonb))
  loop
    if nullif(v_aula->>'emusys_aula_id', '') is null then
      raise exception 'BACKFILL_AULA_SEM_ID' using errcode = '22023';
    end if;

    v_payload_hash := lower(coalesce(v_aula->>'payload_hash', ''));
    if v_payload_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'BACKFILL_AULA_HASH_INVALIDO' using errcode = '22023';
    end if;

    select id, payload_hash
      into v_aula_staging_id, v_payload_hash_anterior
      from public.emusys_aulas_historico_staging_v1
     where unidade_id = v_execucao.unidade_id
       and emusys_aula_id = (v_aula->>'emusys_aula_id')::bigint
     for update;

    if v_aula_staging_id is null then
      insert into public.emusys_aulas_historico_staging_v1 (
        execucao_id,
        unidade_id,
        emusys_aula_id,
        data_hora_inicio,
        data_hora_inicio_original,
        categoria,
        cancelada,
        reagendada,
        justificada,
        emusys_turma_id,
        turma_nome,
        emusys_disciplina_id,
        disciplina_nome,
        emusys_professor_id,
        professor_nome,
        sem_acompanhamento,
        payload,
        payload_hash
      ) values (
        p_execucao_id,
        v_execucao.unidade_id,
        (v_aula->>'emusys_aula_id')::bigint,
        nullif(v_aula->>'data_hora_inicio', '')::timestamptz,
        nullif(v_aula->>'data_hora_inicio_original', '')::timestamptz,
        nullif(v_aula->>'categoria', ''),
        coalesce((v_aula->>'cancelada')::boolean, false),
        coalesce((v_aula->>'reagendada')::boolean, false),
        coalesce((v_aula->>'justificada')::boolean, false),
        nullif(v_aula->>'emusys_turma_id', '')::bigint,
        nullif(v_aula->>'turma_nome', ''),
        nullif(v_aula->>'emusys_disciplina_id', '')::bigint,
        nullif(v_aula->>'disciplina_nome', ''),
        nullif(v_aula->>'emusys_professor_id', '')::bigint,
        nullif(v_aula->>'professor_nome', ''),
        coalesce((v_aula->>'sem_acompanhamento')::boolean, false),
        coalesce(v_aula->'payload', '{}'::jsonb),
        v_payload_hash
      )
      returning id into v_aula_staging_id;
    elsif v_payload_hash_anterior is distinct from v_payload_hash then
      update public.emusys_aulas_historico_staging_v1
         set execucao_id = p_execucao_id,
             data_hora_inicio = nullif(v_aula->>'data_hora_inicio', '')::timestamptz,
             data_hora_inicio_original = nullif(v_aula->>'data_hora_inicio_original', '')::timestamptz,
             categoria = nullif(v_aula->>'categoria', ''),
             cancelada = coalesce((v_aula->>'cancelada')::boolean, false),
             reagendada = coalesce((v_aula->>'reagendada')::boolean, false),
             justificada = coalesce((v_aula->>'justificada')::boolean, false),
             emusys_turma_id = nullif(v_aula->>'emusys_turma_id', '')::bigint,
             turma_nome = nullif(v_aula->>'turma_nome', ''),
             emusys_disciplina_id = nullif(v_aula->>'emusys_disciplina_id', '')::bigint,
             disciplina_nome = nullif(v_aula->>'disciplina_nome', ''),
             emusys_professor_id = nullif(v_aula->>'emusys_professor_id', '')::bigint,
             professor_nome = nullif(v_aula->>'professor_nome', ''),
             sem_acompanhamento = coalesce((v_aula->>'sem_acompanhamento')::boolean, false),
             payload = coalesce(v_aula->'payload', '{}'::jsonb),
             payload_hash = v_payload_hash,
             coletado_em = now(),
             atualizado_em = now()
       where id = v_aula_staging_id;
    end if;

    insert into public.emusys_aulas_historico_revisoes_v1 (
      aula_staging_id,
      execucao_id,
      unidade_id,
      emusys_aula_id,
      payload_hash,
      payload
    ) values (
      v_aula_staging_id,
      p_execucao_id,
      v_execucao.unidade_id,
      (v_aula->>'emusys_aula_id')::bigint,
      v_payload_hash,
      coalesce(v_aula->'payload', '{}'::jsonb)
    )
    on conflict (unidade_id, emusys_aula_id, payload_hash)
    do update set
      ultima_coleta_em = now(),
      vezes_observado = public.emusys_aulas_historico_revisoes_v1.vezes_observado + 1;

    for v_aluno in
      select value
        from jsonb_array_elements(coalesce(v_aula->'alunos', '[]'::jsonb))
    loop
      if lower(coalesce(v_aluno->>'linha_hash', '')) !~ '^[0-9a-f]{64}$' then
        raise exception 'BACKFILL_ALUNO_HASH_INVALIDO' using errcode = '22023';
      end if;

      insert into public.emusys_aula_alunos_historico_staging_v1 (
        aula_staging_id,
        execucao_id,
        unidade_id,
        emusys_aula_id,
        emusys_aluno_id,
        aluno_id,
        aluno_nome_origem,
        emusys_matricula_id,
        emusys_matricula_disciplina_id,
        presenca_origem,
        justificada_origem,
        linha_hash,
        payload
      ) values (
        v_aula_staging_id,
        p_execucao_id,
        v_execucao.unidade_id,
        (v_aula->>'emusys_aula_id')::bigint,
        nullif(v_aluno->>'emusys_aluno_id', '')::bigint,
        nullif(v_aluno->>'aluno_id', '')::integer,
        nullif(v_aluno->>'aluno_nome_origem', ''),
        nullif(v_aluno->>'emusys_matricula_id', '')::bigint,
        nullif(v_aluno->>'emusys_matricula_disciplina_id', '')::bigint,
        nullif(v_aluno->>'presenca_origem', ''),
        nullif(v_aluno->>'justificada_origem', '')::boolean,
        lower(v_aluno->>'linha_hash'),
        coalesce(v_aluno->'payload', '{}'::jsonb)
      )
      on conflict (aula_staging_id, linha_hash) do nothing;
    end loop;
  end loop;

  if p_tem_mais then
    v_status := 'executando';
    v_cursor := p_proximo_cursor;
    v_janela_inicio := p_janela_inicio;
    v_janela_fim := p_janela_fim;
    v_concluido_em := null;
  elsif p_proxima_janela_inicio is not null then
    if p_proxima_janela_inicio <= p_janela_fim
       or p_proxima_janela_fim < p_proxima_janela_inicio
       or p_proxima_janela_fim > v_execucao.data_fim then
      raise exception 'BACKFILL_PROXIMA_JANELA_INVALIDA' using errcode = '22023';
    end if;

    v_status := 'executando';
    v_cursor := null;
    v_janela_inicio := p_proxima_janela_inicio;
    v_janela_fim := p_proxima_janela_fim;
    v_concluido_em := null;
  else
    v_status := 'concluido';
    v_cursor := null;
    v_janela_inicio := p_janela_inicio;
    v_janela_fim := p_janela_fim;
    v_concluido_em := now();
  end if;

  update public.emusys_historico_backfill_execucoes_v1
     set cursor_atual = v_cursor,
         janela_inicio_atual = v_janela_inicio,
         janela_fim_atual = v_janela_fim,
         status = v_status,
         paginas_processadas = paginas_processadas + 1,
         aulas_recebidas = aulas_recebidas + v_total_aulas,
         requisicoes_realizadas = requisicoes_realizadas + p_requisicoes_realizadas,
         ultimo_erro_codigo = null,
         ultimo_erro_contexto = null,
         ultimo_erro_em = null,
         iniciado_em = coalesce(iniciado_em, now()),
         atualizado_em = now(),
         concluido_em = v_concluido_em
   where id = p_execucao_id
  returning * into v_execucao;

  return jsonb_build_object(
    'execucao_id', v_execucao.id,
    'status', v_execucao.status,
    'janela_inicio_atual', v_execucao.janela_inicio_atual,
    'janela_fim_atual', v_execucao.janela_fim_atual,
    'cursor_atual', v_execucao.cursor_atual,
    'paginas_processadas', v_execucao.paginas_processadas,
    'aulas_recebidas', v_execucao.aulas_recebidas,
    'requisicoes_realizadas', v_execucao.requisicoes_realizadas
  );
end;
$$;

comment on function public.registrar_pagina_backfill_historico_professor_v1(
  uuid, date, date, text, jsonb, text, boolean, date, date, integer
) is 'Persiste aula, roster e checkpoint na mesma transacao. Uso interno do coletor V3.';

revoke all on function public.registrar_pagina_backfill_historico_professor_v1(
  uuid, date, date, text, jsonb, text, boolean, date, date, integer
) from public, anon, authenticated;
grant execute on function public.registrar_pagina_backfill_historico_professor_v1(
  uuid, date, date, text, jsonb, text, boolean, date, date, integer
) to service_role;
