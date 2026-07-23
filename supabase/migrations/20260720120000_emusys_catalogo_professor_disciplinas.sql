begin;

create table if not exists public.emusys_professor_disciplinas_sync_execucoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null
    references public.unidades(id) on delete restrict,
  origem text not null
    check (origem in ('manual', 'cron')),
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'completa', 'falhou')),
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  disciplinas_esperadas integer not null default 0
    check (disciplinas_esperadas >= 0),
  disciplinas_processadas integer not null default 0
    check (disciplinas_processadas >= 0),
  requisicoes integer not null default 0
    check (requisicoes >= 0),
  falhas jsonb not null default '[]'::jsonb
    check (jsonb_typeof(falhas) = 'array'),
  estatisticas jsonb not null default '{}'::jsonb
    check (jsonb_typeof(estatisticas) = 'object'),
  solicitado_por integer
    references public.usuarios(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emusys_disciplinas_catalogo (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null
    references public.unidades(id) on delete restrict,
  emusys_disciplina_id integer not null
    check (emusys_disciplina_id > 0),
  nome_emusys text not null
    check (btrim(nome_emusys) <> ''),
  modalidade text not null
    check (modalidade in ('individual', 'turma')),
  ativo_origem boolean not null default true,
  primeiro_visto_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now(),
  sincronizado_em timestamptz not null default now(),
  ultima_execucao_id uuid not null
    references public.emusys_professor_disciplinas_sync_execucoes(id)
    on delete restrict,
  payload_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload_snapshot) = 'object')
    check (payload_snapshot - array['id', 'nome', 'tipo'] = '{}'::jsonb)
    check (not payload_snapshot ?| array[
      'aluno', 'alunos', 'nome_aluno', 'telefone', 'telefone_aluno',
      'telefone_responsavel', 'email', 'email_aluno', 'email_responsavel'
    ]),
  hash_payload text not null
    check (btrim(hash_payload) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, emusys_disciplina_id)
);

create table if not exists public.emusys_professor_disciplinas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null
    references public.unidades(id) on delete restrict,
  emusys_professor_id integer not null
    check (emusys_professor_id > 0),
  emusys_disciplina_id integer not null
    check (emusys_disciplina_id > 0),
  ativo_origem boolean not null default true,
  primeiro_visto_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now(),
  sincronizado_em timestamptz not null default now(),
  ultima_execucao_id uuid not null
    references public.emusys_professor_disciplinas_sync_execucoes(id)
    on delete restrict,
  payload_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload_snapshot) = 'object')
    check (payload_snapshot - array['id', 'nome'] = '{}'::jsonb)
    check (not payload_snapshot ?| array[
      'aluno', 'alunos', 'nome_aluno', 'telefone', 'telefone_aluno',
      'telefone_responsavel', 'email', 'email_aluno', 'email_responsavel'
    ]),
  hash_payload text not null
    check (btrim(hash_payload) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, emusys_professor_id, emusys_disciplina_id),
  foreign key (unidade_id, emusys_disciplina_id)
    references public.emusys_disciplinas_catalogo(
      unidade_id,
      emusys_disciplina_id
    ) on delete restrict
);

create index if not exists idx_emusys_disciplinas_catalogo_unidade_ativo
  on public.emusys_disciplinas_catalogo (unidade_id, ativo_origem);
create index if not exists idx_emusys_disciplinas_catalogo_execucao
  on public.emusys_disciplinas_catalogo (ultima_execucao_id);
create index if not exists idx_emusys_professor_disciplinas_unidade_ativo
  on public.emusys_professor_disciplinas (unidade_id, ativo_origem);
create index if not exists idx_emusys_professor_disciplinas_execucao
  on public.emusys_professor_disciplinas (ultima_execucao_id);
create index if not exists idx_emusys_professor_disciplinas_sync_unidade_status
  on public.emusys_professor_disciplinas_sync_execucoes (
    unidade_id,
    status,
    iniciado_em desc
  );

alter table public.emusys_disciplinas_catalogo
  enable row level security;
alter table public.emusys_professor_disciplinas
  enable row level security;
alter table public.emusys_professor_disciplinas_sync_execucoes
  enable row level security;

create or replace function public.finalizar_sync_professor_disciplinas_emusys_v1(
  p_execucao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_request_role text := current_setting('request.jwt.claim.role', true);
  v_execucao public.emusys_professor_disciplinas_sync_execucoes%rowtype;
  v_catalogo_inativados integer := 0;
  v_atribuicoes_inativadas integer := 0;
begin
  if coalesce(v_request_role, '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'acesso_negado'
      using errcode = '42501';
  end if;

  select execucao.*
    into v_execucao
  from public.emusys_professor_disciplinas_sync_execucoes execucao
  where execucao.id = p_execucao_id
  for update;

  if not found then
    raise exception 'execucao_nao_encontrada'
      using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'sync_professor_disciplinas_emusys:' || v_execucao.unidade_id::text,
      0
    )
  );

  if v_execucao.status <> 'em_andamento' then
    raise exception 'execucao_nao_esta_em_andamento';
  end if;

  if v_execucao.disciplinas_processadas
       is distinct from v_execucao.disciplinas_esperadas then
    raise exception 'execucao_incompleta';
  end if;

  if jsonb_typeof(v_execucao.falhas) <> 'array'
     or jsonb_array_length(v_execucao.falhas) > 0 then
    raise exception 'execucao_possui_falhas';
  end if;

  update public.emusys_professor_disciplinas atribuicao
     set ativo_origem = false,
         sincronizado_em = now(),
         updated_at = now()
   where atribuicao.unidade_id = v_execucao.unidade_id
     and atribuicao.ativo_origem
     and atribuicao.ultima_execucao_id is distinct from p_execucao_id;
  get diagnostics v_atribuicoes_inativadas = row_count;

  update public.emusys_disciplinas_catalogo disciplina
     set ativo_origem = false,
         sincronizado_em = now(),
         updated_at = now()
   where disciplina.unidade_id = v_execucao.unidade_id
     and disciplina.ativo_origem
     and disciplina.ultima_execucao_id is distinct from p_execucao_id;
  get diagnostics v_catalogo_inativados = row_count;

  update public.emusys_professor_disciplinas_sync_execucoes execucao
     set status = 'completa',
         finalizado_em = now(),
         estatisticas = coalesce(execucao.estatisticas, '{}'::jsonb)
           || jsonb_build_object(
             'catalogo_inativados', v_catalogo_inativados,
             'atribuicoes_inativadas', v_atribuicoes_inativadas
           ),
         updated_at = now()
   where execucao.id = p_execucao_id;

  return jsonb_build_object(
    'execucao_id', p_execucao_id,
    'unidade_id', v_execucao.unidade_id,
    'status', 'completa',
    'disciplinas_esperadas', v_execucao.disciplinas_esperadas,
    'disciplinas_processadas', v_execucao.disciplinas_processadas,
    'requisicoes', v_execucao.requisicoes,
    'catalogo_inativados', v_catalogo_inativados,
    'atribuicoes_inativadas', v_atribuicoes_inativadas
  );
end;
$function$;

revoke all on table public.emusys_disciplinas_catalogo
  from public, anon, authenticated;
revoke all on table public.emusys_professor_disciplinas
  from public, anon, authenticated;
revoke all on table public.emusys_professor_disciplinas_sync_execucoes
  from public, anon, authenticated;

grant select, insert, update
  on table public.emusys_disciplinas_catalogo
  to service_role;
grant select, insert, update
  on table public.emusys_professor_disciplinas
  to service_role;
grant select, insert, update
  on table public.emusys_professor_disciplinas_sync_execucoes
  to service_role;

revoke all on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid)
  to service_role;

comment on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid)
  is 'Finaliza apenas sync Emusys completo por unidade; nunca materializa a V2.';

commit;
