-- Health Score Professor V3 - periodos pedagogicos historicos em sombra.
-- Grao: unidade + matricula + matricula-disciplina + professor + periodo continuo.

create table public.professor_periodos_reconstrucoes_v1 (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  data_inicio date not null,
  data_fim date not null,
  versao_reconstrucao text not null,
  entrada_hash text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'executando', 'concluido', 'falhou')),
  execucao_backfill_id uuid
    references public.emusys_historico_backfill_execucoes_v1(id) on delete restrict,
  total_eventos integer not null default 0 check (total_eventos >= 0),
  total_particoes integer not null default 0 check (total_particoes >= 0),
  total_periodos integer not null default 0 check (total_periodos >= 0),
  total_diagnosticos integer not null default 0 check (total_diagnosticos >= 0),
  parametros jsonb not null default '{}'::jsonb,
  diagnosticos jsonb not null default '[]'::jsonb,
  ultimo_erro_codigo text,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, data_inicio, data_fim, versao_reconstrucao, entrada_hash),
  check (data_fim >= data_inicio),
  check (entrada_hash ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(parametros) = 'object'),
  check (jsonb_typeof(diagnosticos) = 'array'),
  check (concluido_em is null or status = 'concluido')
);

comment on table public.professor_periodos_reconstrucoes_v1 is
  'Execucao versionada e idempotente do reconstrutor historico de periodos professor-matricula-disciplina.';

create index idx_professor_periodos_reconstrucoes_unidade
  on public.professor_periodos_reconstrucoes_v1
  (unidade_id, data_inicio, data_fim, created_at desc);

create table public.professor_matricula_disciplina_periodos_v1 (
  id uuid primary key default gen_random_uuid(),
  reconstrucao_id uuid not null
    references public.professor_periodos_reconstrucoes_v1(id) on delete restrict,
  unidade_id uuid not null references public.unidades(id),
  pessoa_chave text not null,
  aluno_id integer references public.alunos(id) on delete set null,
  emusys_aluno_id bigint,
  emusys_matricula_id bigint,
  emusys_matricula_disciplina_id bigint,
  emusys_disciplina_id bigint,
  curso_id integer references public.cursos(id) on delete set null,
  professor_id integer references public.professores(id) on delete set null,
  emusys_professor_id bigint,
  data_inicio timestamptz not null,
  data_fim timestamptz,
  status_periodo text not null
    check (status_periodo in ('ativo', 'encerrado', 'invalidado')),
  tipo_inicio text not null,
  tipo_fim text,
  duracao_dias numeric generated always as (
    case
      when data_fim is null then null
      else extract(epoch from (data_fim - data_inicio)) / 86400::numeric
    end
  ) stored,
  duracao_meses numeric generated always as (
    case
      when data_fim is null then null
      else extract(epoch from (data_fim - data_inicio)) / 86400::numeric / 30.44::numeric
    end
  ) stored,
  elegivel_permanencia boolean generated always as (
    status_periodo = 'encerrado'
    and data_fim is not null
    and extract(epoch from (data_fim - data_inicio)) / 86400::numeric / 30.44::numeric >= 4
  ) stored,
  motivo_saida_id integer references public.motivos_saida(id) on delete set null,
  conta_retencao_professor boolean,
  confianca text not null
    check (confianca in ('alta', 'media', 'revisar', 'revisado_aprovado')),
  inicio_incompleto boolean not null default false,
  substituicao_candidata boolean not null default false,
  conflitos jsonb not null default '[]'::jsonb,
  publicavel boolean generated always as (
    confianca = 'revisado_aprovado'
    or (
      confianca = 'alta'
      and professor_id is not null
      and emusys_matricula_disciplina_id is not null
      and inicio_incompleto = false
      and jsonb_typeof(conflitos) = 'array'
      and jsonb_array_length(conflitos) = 0
    )
  ) stored,
  versao_reconstrucao text not null,
  entrada_hash text not null,
  evidencias jsonb not null default '{}'::jsonb,
  revisado_por integer references public.usuarios(id) on delete set null,
  revisado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_fim is null or data_fim >= data_inicio),
  check (status_periodo <> 'encerrado' or data_fim is not null),
  check (status_periodo <> 'ativo' or data_fim is null),
  check (entrada_hash ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(evidencias) = 'object'),
  check (jsonb_typeof(conflitos) = 'array'),
  check (publicavel = false or confianca in ('alta', 'revisado_aprovado'))
);

comment on table public.professor_matricula_disciplina_periodos_v1 is
  'Camada canonica em sombra dos periodos continuos por professor, matricula e disciplina.';
comment on column public.professor_matricula_disciplina_periodos_v1.pessoa_chave is
  'Identidade canonica escopada pela unidade: emusys:<id> ou fallback local explicitamente sinalizado.';
comment on column public.professor_matricula_disciplina_periodos_v1.publicavel is
  'Publicabilidade interna da evidencia em sombra; nao autoriza consumo produtivo.';

create unique index uq_professor_periodos_identidade_reconstrucao
  on public.professor_matricula_disciplina_periodos_v1 (
    reconstrucao_id,
    pessoa_chave,
    coalesce(emusys_matricula_disciplina_id, -1),
    coalesce(emusys_professor_id, -1),
    data_inicio
  );

create unique index uq_professor_periodos_um_ativo_por_disciplina
  on public.professor_matricula_disciplina_periodos_v1 (
    reconstrucao_id,
    pessoa_chave,
    coalesce(emusys_matricula_disciplina_id, -1)
  )
  where status_periodo = 'ativo';

create index idx_professor_periodos_professor_unidade
  on public.professor_matricula_disciplina_periodos_v1
  (unidade_id, professor_id, data_inicio, data_fim);
create index idx_professor_periodos_matricula_disciplina
  on public.professor_matricula_disciplina_periodos_v1
  (unidade_id, emusys_matricula_disciplina_id, data_inicio);
create index idx_professor_periodos_pessoa
  on public.professor_matricula_disciplina_periodos_v1
  (unidade_id, pessoa_chave, data_inicio);
create index idx_professor_periodos_revisao
  on public.professor_matricula_disciplina_periodos_v1
  (unidade_id, confianca, created_at desc)
  where confianca in ('media', 'revisar');

create table public.professor_periodos_revisoes_v1 (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null
    references public.professor_matricula_disciplina_periodos_v1(id) on delete restrict,
  reconstrucao_id uuid not null
    references public.professor_periodos_reconstrucoes_v1(id) on delete restrict,
  decisao text not null
    check (decisao in ('aprovado', 'corrigido', 'rejeitado', 'manter_revisao')),
  motivo text not null,
  professor_corrigido_id integer references public.professores(id) on delete set null,
  emusys_professor_corrigido_id bigint,
  data_inicio_corrigida timestamptz,
  data_fim_corrigida timestamptz,
  motivo_saida_id integer references public.motivos_saida(id) on delete set null,
  conta_retencao_professor boolean,
  snapshot_anterior jsonb not null,
  snapshot_posterior jsonb not null,
  revisado_por integer not null references public.usuarios(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (length(btrim(motivo)) > 0),
  check (jsonb_typeof(snapshot_anterior) = 'object'),
  check (jsonb_typeof(snapshot_posterior) = 'object'),
  check (data_fim_corrigida is null or data_inicio_corrigida is null or data_fim_corrigida >= data_inicio_corrigida)
);

comment on table public.professor_periodos_revisoes_v1 is
  'Trilha append-only das decisoes humanas sobre periodos reconstruidos.';

create index idx_professor_periodos_revisoes_periodo
  on public.professor_periodos_revisoes_v1 (periodo_id, created_at desc);

create or replace function public.fn_bloquear_mutacao_professor_periodos_revisoes_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'PROFESSOR_PERIODOS_REVISAO_APPEND_ONLY' using errcode = '55000';
end;
$$;

create trigger trg_professor_periodos_revisoes_append_only
  before update or delete on public.professor_periodos_revisoes_v1
  for each row execute function public.fn_bloquear_mutacao_professor_periodos_revisoes_v1();

create or replace view public.vw_professor_periodos_diagnostico_v1
with (security_invoker=on) as
select
  p.id as periodo_id,
  p.reconstrucao_id,
  p.unidade_id,
  p.pessoa_chave,
  p.emusys_matricula_id,
  p.emusys_matricula_disciplina_id,
  p.professor_id,
  p.emusys_professor_id,
  p.data_inicio,
  p.data_fim,
  p.status_periodo,
  p.confianca,
  p.publicavel,
  p.inicio_incompleto,
  p.substituicao_candidata,
  p.conflitos,
  array_remove(array[
    case when p.professor_id is null then 'professor_nao_resolvido' end,
    case when p.emusys_matricula_disciplina_id is null then 'matricula_disciplina_ausente' end,
    case when p.inicio_incompleto then 'inicio_truncado' end,
    case when p.substituicao_candidata then 'substituicao_candidata' end,
    case when p.data_fim is not null and p.data_fim < p.data_inicio then 'duracao_invalida' end,
    case when jsonb_array_length(p.conflitos) > 0 then 'conflito_reconstrucao' end,
    case when exists (
      select 1
      from public.professor_matricula_disciplina_periodos_v1 outro
      where outro.reconstrucao_id = p.reconstrucao_id
        and outro.id <> p.id
        and outro.pessoa_chave = p.pessoa_chave
        and outro.emusys_matricula_disciplina_id is not distinct from p.emusys_matricula_disciplina_id
        and tstzrange(outro.data_inicio, coalesce(outro.data_fim, 'infinity'::timestamptz), '[)')
          && tstzrange(p.data_inicio, coalesce(p.data_fim, 'infinity'::timestamptz), '[)')
    ) then 'sobreposicao' end
  ], null) as tipos_diagnostico
from public.professor_matricula_disciplina_periodos_v1 p
where p.confianca in ('media', 'revisar')
   or p.professor_id is null
   or p.emusys_matricula_disciplina_id is null
   or p.inicio_incompleto
   or p.substituicao_candidata
   or jsonb_array_length(p.conflitos) > 0;

comment on view public.vw_professor_periodos_diagnostico_v1 is
  'Fila tecnica em sombra. Nao contem payload bruto e nao e concedida a usuarios finais nesta fase.';

create or replace function public.materializar_periodos_professor_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_versao_reconstrucao text,
  p_entrada_hash text,
  p_periodos jsonb,
  p_diagnosticos jsonb default '[]'::jsonb,
  p_execucao_backfill_id uuid default null,
  p_total_eventos integer default 0,
  p_parametros jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reconstrucao public.professor_periodos_reconstrucoes_v1%rowtype;
  v_periodo jsonb;
  v_total_periodos integer := 0;
  v_particoes integer := 0;
begin
  if p_data_fim < p_data_inicio then
    raise exception 'PERIODOS_RECORTE_INVALIDO' using errcode = '22023';
  end if;
  if nullif(btrim(p_versao_reconstrucao), '') is null then
    raise exception 'PERIODOS_VERSAO_OBRIGATORIA' using errcode = '22023';
  end if;
  if lower(coalesce(p_entrada_hash, '')) !~ '^[0-9a-f]{64}$' then
    raise exception 'PERIODOS_ENTRADA_HASH_INVALIDO' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_periodos, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_diagnosticos, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_parametros, '{}'::jsonb)) <> 'object' then
    raise exception 'PERIODOS_PAYLOAD_INVALIDO' using errcode = '22023';
  end if;

  insert into public.professor_periodos_reconstrucoes_v1 (
    unidade_id,
    data_inicio,
    data_fim,
    versao_reconstrucao,
    entrada_hash,
    status,
    execucao_backfill_id,
    total_eventos,
    total_diagnosticos,
    parametros,
    diagnosticos,
    iniciado_em
  ) values (
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_versao_reconstrucao,
    lower(p_entrada_hash),
    'executando',
    p_execucao_backfill_id,
    greatest(coalesce(p_total_eventos, 0), 0),
    jsonb_array_length(coalesce(p_diagnosticos, '[]'::jsonb)),
    coalesce(p_parametros, '{}'::jsonb),
    coalesce(p_diagnosticos, '[]'::jsonb),
    now()
  )
  on conflict (unidade_id, data_inicio, data_fim, versao_reconstrucao, entrada_hash)
  do nothing;

  select *
    into v_reconstrucao
    from public.professor_periodos_reconstrucoes_v1
   where unidade_id = p_unidade_id
     and data_inicio = p_data_inicio
     and data_fim = p_data_fim
     and versao_reconstrucao = p_versao_reconstrucao
     and entrada_hash = lower(p_entrada_hash)
   for update;

  if v_reconstrucao.status = 'concluido' then
    return jsonb_build_object(
      'reconstrucao_id', v_reconstrucao.id,
      'status', v_reconstrucao.status,
      'total_periodos', v_reconstrucao.total_periodos,
      'total_diagnosticos', v_reconstrucao.total_diagnosticos,
      'idempotente', true
    );
  end if;

  delete from public.professor_matricula_disciplina_periodos_v1
   where reconstrucao_id = v_reconstrucao.id;

  for v_periodo in
    select value from jsonb_array_elements(coalesce(p_periodos, '[]'::jsonb))
  loop
    if nullif(v_periodo->>'pessoa_chave', '') is null
       or nullif(v_periodo->>'data_inicio', '') is null
       or nullif(v_periodo->>'status_periodo', '') is null
       or nullif(v_periodo->>'confianca', '') is null then
      raise exception 'PERIODOS_LINHA_INCOMPLETA' using errcode = '22023';
    end if;

    insert into public.professor_matricula_disciplina_periodos_v1 (
      reconstrucao_id,
      unidade_id,
      pessoa_chave,
      aluno_id,
      emusys_aluno_id,
      emusys_matricula_id,
      emusys_matricula_disciplina_id,
      emusys_disciplina_id,
      curso_id,
      professor_id,
      emusys_professor_id,
      data_inicio,
      data_fim,
      status_periodo,
      tipo_inicio,
      tipo_fim,
      motivo_saida_id,
      conta_retencao_professor,
      confianca,
      inicio_incompleto,
      substituicao_candidata,
      conflitos,
      versao_reconstrucao,
      entrada_hash,
      evidencias
    ) values (
      v_reconstrucao.id,
      p_unidade_id,
      v_periodo->>'pessoa_chave',
      nullif(v_periodo->>'aluno_id', '')::integer,
      nullif(v_periodo->>'emusys_aluno_id', '')::bigint,
      nullif(v_periodo->>'emusys_matricula_id', '')::bigint,
      nullif(v_periodo->>'emusys_matricula_disciplina_id', '')::bigint,
      nullif(v_periodo->>'emusys_disciplina_id', '')::bigint,
      nullif(v_periodo->>'curso_id', '')::integer,
      nullif(v_periodo->>'professor_id', '')::integer,
      nullif(v_periodo->>'emusys_professor_id', '')::bigint,
      (v_periodo->>'data_inicio')::timestamptz,
      nullif(v_periodo->>'data_fim', '')::timestamptz,
      v_periodo->>'status_periodo',
      coalesce(nullif(v_periodo->>'tipo_inicio', ''), 'primeira_aula_observada'),
      nullif(v_periodo->>'tipo_fim', ''),
      nullif(v_periodo->>'motivo_saida_id', '')::integer,
      nullif(v_periodo->>'conta_retencao_professor', '')::boolean,
      v_periodo->>'confianca',
      coalesce((v_periodo->>'inicio_incompleto')::boolean, false),
      coalesce((v_periodo->>'substituicao_candidata')::boolean, false),
      coalesce(v_periodo->'conflitos', '[]'::jsonb),
      p_versao_reconstrucao,
      lower(coalesce(v_periodo->>'entrada_hash', p_entrada_hash)),
      coalesce(v_periodo->'evidencias', '{}'::jsonb)
    );
    v_total_periodos := v_total_periodos + 1;
  end loop;

  select count(distinct pessoa_chave || ':' || coalesce(emusys_matricula_disciplina_id::text, 'sem-md'))::integer
    into v_particoes
    from public.professor_matricula_disciplina_periodos_v1
   where reconstrucao_id = v_reconstrucao.id;

  update public.professor_periodos_reconstrucoes_v1
     set status = 'concluido',
         total_particoes = coalesce(v_particoes, 0),
         total_periodos = v_total_periodos,
         total_diagnosticos = jsonb_array_length(coalesce(p_diagnosticos, '[]'::jsonb)),
         parametros = coalesce(p_parametros, '{}'::jsonb),
         diagnosticos = coalesce(p_diagnosticos, '[]'::jsonb),
         ultimo_erro_codigo = null,
         concluido_em = now(),
         updated_at = now()
   where id = v_reconstrucao.id
  returning * into v_reconstrucao;

  return jsonb_build_object(
    'reconstrucao_id', v_reconstrucao.id,
    'status', v_reconstrucao.status,
    'total_periodos', v_reconstrucao.total_periodos,
    'total_diagnosticos', v_reconstrucao.total_diagnosticos,
    'idempotente', false
  );
exception
  when others then
    if v_reconstrucao.id is not null then
      update public.professor_periodos_reconstrucoes_v1
         set status = 'falhou',
             ultimo_erro_codigo = sqlstate,
             updated_at = now()
       where id = v_reconstrucao.id;
    end if;
    raise;
end;
$$;

comment on function public.materializar_periodos_professor_v1(
  uuid, date, date, text, text, jsonb, jsonb, uuid, integer, jsonb
) is 'Materializa atomicamente uma reconstrucao em sombra; idempotente por unidade, recorte, versao e hash.';

alter table public.professor_periodos_reconstrucoes_v1 enable row level security;
alter table public.professor_matricula_disciplina_periodos_v1 enable row level security;
alter table public.professor_periodos_revisoes_v1 enable row level security;

revoke all on public.professor_periodos_reconstrucoes_v1 from public, anon, authenticated;
revoke all on public.professor_matricula_disciplina_periodos_v1 from public, anon, authenticated;
revoke all on public.professor_periodos_revisoes_v1 from public, anon, authenticated;
revoke all on public.vw_professor_periodos_diagnostico_v1 from public, anon, authenticated;
revoke all on public.professor_periodos_revisoes_v1 from service_role;
revoke all on public.vw_professor_periodos_diagnostico_v1 from service_role;
revoke all on function public.fn_bloquear_mutacao_professor_periodos_revisoes_v1()
  from public, anon, authenticated;
revoke all on function public.materializar_periodos_professor_v1(
  uuid, date, date, text, text, jsonb, jsonb, uuid, integer, jsonb
) from public, anon, authenticated;

grant select, insert, update, delete on public.professor_periodos_reconstrucoes_v1
  to service_role;
grant select, insert, update, delete on public.professor_matricula_disciplina_periodos_v1
  to service_role;
grant select, insert on public.professor_periodos_revisoes_v1
  to service_role;
grant select on public.vw_professor_periodos_diagnostico_v1 to service_role;
grant execute on function public.materializar_periodos_professor_v1(
  uuid, date, date, text, text, jsonb, jsonb, uuid, integer, jsonb
) to service_role;

do $$
declare
  v_role text;
begin
  foreach v_role in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on public.professor_periodos_reconstrucoes_v1 from %I', v_role);
      execute format('revoke all on public.professor_matricula_disciplina_periodos_v1 from %I', v_role);
      execute format('revoke all on public.professor_periodos_revisoes_v1 from %I', v_role);
      execute format('revoke all on public.vw_professor_periodos_diagnostico_v1 from %I', v_role);
      execute format(
        'revoke all on function public.materializar_periodos_professor_v1(uuid,date,date,text,text,jsonb,jsonb,uuid,integer,jsonb) from %I',
        v_role
      );
    end if;
  end loop;
end;
$$;
