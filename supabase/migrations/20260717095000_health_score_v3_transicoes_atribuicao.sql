-- Health Score Professor V3 - Gate 3.
-- Enriquece a trilha futura de troca de professor sem reescrever reconstrucoes concluidas.

alter table public.aluno_professor_transicoes
  add column if not exists motivo_saida_id integer
    references public.motivos_saida(id) on delete set null,
  add column if not exists atribuicao_confirmada boolean,
  add column if not exists conta_retencao_professor boolean,
  add column if not exists revisado_por integer
    references public.usuarios(id) on delete set null,
  add column if not exists revisado_em timestamptz,
  add column if not exists periodo_origem_id uuid
    references public.professor_matricula_disciplina_periodos_v1(id) on delete set null;

create index if not exists idx_aluno_professor_transicoes_periodo_origem
  on public.aluno_professor_transicoes (periodo_origem_id)
  where periodo_origem_id is not null;

create index if not exists idx_aluno_professor_transicoes_atribuicao_pendente
  on public.aluno_professor_transicoes (unidade_id, data_transicao desc)
  where atribuicao_confirmada is null;

comment on column public.aluno_professor_transicoes.motivo_saida_id is
  'Motivo confirmado da troca, preenchido somente por conciliacao humana.';
comment on column public.aluno_professor_transicoes.atribuicao_confirmada is
  'Indica se a atribuicao pedagogica da troca foi revisada e confirmada.';
comment on column public.aluno_professor_transicoes.conta_retencao_professor is
  'Decisao versionavel sobre impacto da troca na retencao do professor de origem.';
comment on column public.aluno_professor_transicoes.periodo_origem_id is
  'Referencia imutavel ao periodo ativo da ultima reconstrucao concluida anterior a troca.';

create or replace function public.registrar_transicao_professor_v3(p_contexto jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unidade_id uuid;
  v_aluno_id integer;
  v_emusys_aluno_id bigint;
  v_emusys_matricula_id bigint;
  v_emusys_matricula_disciplina_id bigint;
  v_emusys_disciplina_id bigint;
  v_curso_id integer;
  v_curso_anterior_id integer;
  v_professor_anterior_id integer;
  v_professor_novo_id integer;
  v_emusys_professor_anterior_id bigint;
  v_emusys_professor_novo_id bigint;
  v_data_transicao timestamptz;
  v_tipo_transicao text;
  v_descricao_emusys text;
  v_automacao_log_id bigint;
  v_fonte text;
  v_periodo_origem_id uuid;
  v_transicao_id uuid;
  v_criada boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'TRANSICAO_PROFESSOR_V3_ACESSO_NEGADO' using errcode = '42501';
  end if;

  if p_contexto is null or jsonb_typeof(p_contexto) <> 'object' then
    raise exception 'TRANSICAO_PROFESSOR_V3_CONTEXTO_INVALIDO' using errcode = '22023';
  end if;

  v_unidade_id := nullif(p_contexto->>'unidade_id', '')::uuid;
  v_aluno_id := nullif(p_contexto->>'aluno_id', '')::integer;
  v_emusys_aluno_id := nullif(p_contexto->>'emusys_aluno_id', '')::bigint;
  v_emusys_matricula_id := nullif(p_contexto->>'emusys_matricula_id', '')::bigint;
  v_emusys_matricula_disciplina_id :=
    nullif(p_contexto->>'emusys_matricula_disciplina_id', '')::bigint;
  v_emusys_disciplina_id := nullif(p_contexto->>'emusys_disciplina_id', '')::bigint;
  v_curso_id := nullif(p_contexto->>'curso_id', '')::integer;
  v_curso_anterior_id := nullif(p_contexto->>'curso_anterior_id', '')::integer;
  v_professor_anterior_id := nullif(p_contexto->>'professor_anterior_id', '')::integer;
  v_professor_novo_id := nullif(p_contexto->>'professor_novo_id', '')::integer;
  v_emusys_professor_anterior_id :=
    nullif(p_contexto->>'emusys_professor_anterior_id', '')::bigint;
  v_emusys_professor_novo_id :=
    nullif(p_contexto->>'emusys_professor_novo_id', '')::bigint;
  v_data_transicao := coalesce(
    nullif(p_contexto->>'data_transicao', '')::timestamptz,
    now()
  );
  v_tipo_transicao := coalesce(
    nullif(btrim(p_contexto->>'tipo_transicao'), ''),
    'troca_professor'
  );
  v_descricao_emusys := nullif(btrim(p_contexto->>'descricao_emusys'), '');
  v_automacao_log_id := nullif(p_contexto->>'automacao_log_id', '')::bigint;
  v_fonte := coalesce(
    nullif(btrim(p_contexto->>'fonte'), ''),
    'webhook:matricula_alterada'
  );

  if v_unidade_id is null or v_emusys_matricula_disciplina_id is null then
    raise exception 'TRANSICAO_PROFESSOR_V3_CHAVE_INCOMPLETA' using errcode = '22023';
  end if;
  if v_professor_anterior_id is null and v_emusys_professor_anterior_id is null then
    raise exception 'TRANSICAO_PROFESSOR_V3_ORIGEM_AUSENTE' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_unidade_id::text || ':' || v_emusys_matricula_disciplina_id::text,
      0
    )
  );

  select p.id
    into v_periodo_origem_id
    from public.professor_matricula_disciplina_periodos_v1 p
    join public.professor_periodos_reconstrucoes_v1 r
      on r.id = p.reconstrucao_id
   where p.unidade_id = v_unidade_id
     and p.emusys_matricula_disciplina_id = v_emusys_matricula_disciplina_id
     and p.status_periodo = 'ativo'
     and r.status = 'concluido'
     and r.data_fim <= v_data_transicao::date
     and (
       (v_professor_anterior_id is not null and p.professor_id = v_professor_anterior_id)
       or (
         v_emusys_professor_anterior_id is not null
         and p.emusys_professor_id = v_emusys_professor_anterior_id
       )
     )
   order by r.data_fim desc, r.concluido_em desc nulls last, p.data_inicio desc
   limit 1;

  insert into public.aluno_professor_transicoes (
    unidade_id,
    aluno_id,
    emusys_matricula_id,
    emusys_matricula_disciplina_id,
    curso_id,
    curso_anterior_id,
    professor_anterior_id,
    professor_novo_id,
    emusys_professor_anterior_id,
    emusys_professor_novo_id,
    data_transicao,
    tipo_transicao,
    descricao_emusys,
    automacao_log_id,
    payload_snapshot,
    fonte,
    periodo_origem_id
  ) values (
    v_unidade_id,
    v_aluno_id,
    v_emusys_matricula_id,
    v_emusys_matricula_disciplina_id,
    v_curso_id,
    v_curso_anterior_id,
    v_professor_anterior_id,
    v_professor_novo_id,
    v_emusys_professor_anterior_id,
    v_emusys_professor_novo_id,
    v_data_transicao,
    v_tipo_transicao,
    v_descricao_emusys,
    v_automacao_log_id,
    jsonb_build_object(
      'schema', 'transicao_professor_v3',
      'emusys_aluno_id', v_emusys_aluno_id,
      'emusys_matricula_id', v_emusys_matricula_id,
      'emusys_matricula_disciplina_id', v_emusys_matricula_disciplina_id,
      'emusys_disciplina_id', v_emusys_disciplina_id,
      'professor_anterior_id', v_professor_anterior_id,
      'professor_novo_id', v_professor_novo_id,
      'emusys_professor_anterior_id', v_emusys_professor_anterior_id,
      'emusys_professor_novo_id', v_emusys_professor_novo_id
    ),
    v_fonte,
    v_periodo_origem_id
  )
  on conflict do nothing
  returning id into v_transicao_id;

  v_criada := v_transicao_id is not null;

  if v_transicao_id is null then
    select t.id
      into v_transicao_id
      from public.aluno_professor_transicoes t
     where t.unidade_id = v_unidade_id
       and t.emusys_matricula_disciplina_id = v_emusys_matricula_disciplina_id
       and t.emusys_professor_anterior_id is not distinct from v_emusys_professor_anterior_id
       and t.emusys_professor_novo_id is not distinct from v_emusys_professor_novo_id
       and t.data_transicao = v_data_transicao
     order by t.created_at desc
     limit 1;
  end if;

  if v_transicao_id is null then
    raise exception 'TRANSICAO_PROFESSOR_V3_IDEMPOTENCIA_INCONSISTENTE'
      using errcode = '23505';
  end if;

  insert into public.professor_passagem_bastao (
    transicao_id,
    aluno_id,
    emusys_matricula_disciplina_id,
    curso_id,
    professor_origem_id,
    professor_destino_id,
    status
  ) values (
    v_transicao_id,
    v_aluno_id,
    v_emusys_matricula_disciplina_id,
    v_curso_id,
    v_professor_anterior_id,
    v_professor_novo_id,
    'pendente'
  )
  on conflict (transicao_id) do nothing;

  return jsonb_build_object(
    'transicao_id', v_transicao_id,
    'periodo_origem_id', v_periodo_origem_id,
    'criada', v_criada,
    'idempotente', not v_criada
  );
end;
$$;

revoke all on function public.registrar_transicao_professor_v3(jsonb)
  from public, anon, authenticated;
grant execute on function public.registrar_transicao_professor_v3(jsonb) to service_role;

comment on function public.registrar_transicao_professor_v3(jsonb) is
  'Gate 3: registra transicao e passagem de bastao de forma atomica, idempotente e sem mutar periodos concluidos.';
