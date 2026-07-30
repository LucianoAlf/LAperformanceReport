\set ON_ERROR_STOP on

do $fixture_guard$
declare
  v_sentinel text;
  v_sentinel_valida boolean := false;
begin
  if current_database() !~ '^pesquisa_evasao_fixture_[0-9a-f]{16}$'
     or current_database() in ('postgres', 'template0', 'template1')
     or current_setting('server_version_num')::integer < 170000
     or current_setting('server_version_num')::integer >= 180000 then
    raise exception
      'FIXTURE_GUARD_DATABASE: exige banco descartavel nomeado e PostgreSQL 17';
  end if;

  v_sentinel := current_setting('pesquisa_evasao.fixture_sentinel', true);
  if nullif(v_sentinel, '') is null
     or to_regclass('fixture_safety.sentinel') is null then
    raise exception
      'FIXTURE_GUARD_SENTINEL: sentinela descartavel ausente';
  end if;

  execute
    'select exists (' ||
    'select 1 from fixture_safety.sentinel ' ||
    'where secret = $1 and database_name = current_database())'
  into v_sentinel_valida
  using v_sentinel;

  if not v_sentinel_valida then
    raise exception
      'FIXTURE_GUARD_SENTINEL: segredo ou banco nao confere';
  end if;
end
$fixture_guard$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'mila') then
    create role mila;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'sol') then
    create role sol;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'fabio') then
    create role fabio;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'lia') then
    create role lia;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'mila_acesso_restrito') then
    create role mila_acesso_restrito;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'sol_acesso_restrito') then
    create role sol_acesso_restrito;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'fabio_agent') then
    create role fabio_agent;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'lia_acesso_restrito') then
    create role lia_acesso_restrito;
  end if;
end
$$;

create extension if not exists pgcrypto with schema public;
create extension if not exists dblink with schema public;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create table public.unidades (
  id uuid primary key,
  nome text not null
);

create table public.usuarios (
  id integer primary key,
  auth_user_id uuid not null,
  nome text not null,
  ativo boolean not null default true
);

create table public.movimentacoes_admin (
  id integer primary key
);

create table public.whatsapp_caixas (
  id integer primary key,
  nome text not null
);

create table public.pesquisa_evasao_assinaturas (
  id uuid primary key,
  usuario_id integer not null references public.usuarios(id),
  nome_assinatura text not null,
  ativo boolean not null default true
);

create table public.pesquisa_evasao_templates (
  id uuid primary key,
  chave text not null,
  versao integer not null,
  publico text not null,
  corpo text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.pesquisa_evasao_previews (
  id uuid primary key default gen_random_uuid(),
  evasao_id integer not null references public.movimentacoes_admin(id),
  unidade_id uuid not null references public.unidades(id),
  usuario_id integer not null references public.usuarios(id),
  auth_user_id uuid not null,
  assinatura_id uuid not null references public.pesquisa_evasao_assinaturas(id),
  template_id uuid not null references public.pesquisa_evasao_templates(id),
  caixa_id integer not null references public.whatsapp_caixas(id),
  modo_teste boolean not null default false,
  destinatario_tipo text not null,
  telefone_destino text not null,
  mensagem_renderizada text not null,
  payload_hash text not null,
  idempotency_key uuid not null,
  expira_em timestamptz not null,
  consumido_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (idempotency_key),
  unique (id, idempotency_key)
);

create table public.pesquisa_evasao (
  id uuid primary key default gen_random_uuid(),
  evasao_id integer not null references public.movimentacoes_admin(id),
  aluno_id integer,
  unidade_id uuid not null references public.unidades(id),
  aluno_nome text not null,
  aluno_telefone text not null,
  aluno_curso text,
  aluno_professor text,
  tempo_permanencia_meses integer not null,
  data_evasao date not null,
  motivo_cadastrado text,
  status text not null default 'pendente',
  enviado_em timestamptz,
  enviado_por text not null,
  mensagem_uazapi_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  envio_status text not null default 'nao_enviado',
  resposta_status text not null default 'sem_resposta',
  modo_teste boolean not null default false,
  telefone_destino_snapshot text,
  caixa_id integer references public.whatsapp_caixas(id),
  executado_por_usuario_id integer references public.usuarios(id),
  executado_por_auth_user_id uuid,
  assinatura_id uuid references public.pesquisa_evasao_assinaturas(id),
  assinatura_nome_snapshot text,
  template_id uuid references public.pesquisa_evasao_templates(id),
  template_versao integer,
  mensagem_renderizada text,
  provider_message_id text,
  preview_id uuid references public.pesquisa_evasao_previews(id),
  idempotency_key uuid references public.pesquisa_evasao_previews(idempotency_key),
  envio_iniciado_em timestamptz,
  primeira_interacao_em timestamptz,
  ultima_interacao_em timestamptz,
  pronta_para_revisao_em timestamptz
);

create unique index pesquisa_evasao_evasao_producao_uidx
  on public.pesquisa_evasao (evasao_id)
  where modo_teste is false;

create unique index pesquisa_evasao_teste_ativo_uidx
  on public.pesquisa_evasao (evasao_id, telefone_destino_snapshot)
  where modo_teste is true
    and envio_status in ('enviando', 'incerto');

create unique index pesquisa_evasao_preview_id_uidx
  on public.pesquisa_evasao (preview_id);

create unique index pesquisa_evasao_idempotency_key_uidx
  on public.pesquisa_evasao (idempotency_key);

insert into public.unidades (id, nome)
values ('10000000-0000-0000-0000-000000000001', 'Unidade Fixture');

insert into public.usuarios (id, auth_user_id, nome)
values
  (1, '20000000-0000-0000-0000-000000000001', 'Operador Fixture'),
  (2, '20000000-0000-0000-0000-000000000002', 'Outro Operador');

insert into public.whatsapp_caixas (id, nome)
values (3, 'Sucesso do Aluno');

insert into public.pesquisa_evasao_assinaturas (id, usuario_id, nome_assinatura)
values ('30000000-0000-0000-0000-000000000001', 1, 'Equipe LA');

insert into public.pesquisa_evasao_templates (id, chave, versao, publico, corpo)
values
  ('40000000-0000-0000-0000-000000000001', 'evasao', 1, 'direto', 'Olá, {{aluno}}'),
  ('40000000-0000-0000-0000-000000000002', 'evasao', 1, 'responsavel', 'Olá, {{responsavel}}');

insert into public.movimentacoes_admin (id)
select generate_series(1001, 1030);

\ir /workspace/supabase/migrations/20260730173000_pesquisa_evasao_claim_seguro.sql

set request.jwt.claim.role = 'service_role';

create or replace function public.assert_true(p_condicao boolean, p_mensagem text)
returns void
language plpgsql
as $$
begin
  if p_condicao is not true then
    raise exception 'ASSERTION FAILED: %', p_mensagem;
  end if;
end
$$;

create or replace function public.criar_preview_fixture(
  p_id uuid,
  p_evasao_id integer,
  p_auth_user_id uuid default '20000000-0000-0000-0000-000000000001',
  p_modo_teste boolean default false,
  p_telefone text default '5511999999999',
  p_expira_em timestamptz default now() + interval '10 minutes',
  p_consumido boolean default false
)
returns void
language sql
as $$
  insert into public.pesquisa_evasao_previews (
    id,
    evasao_id,
    unidade_id,
    usuario_id,
    auth_user_id,
    assinatura_id,
    template_id,
    caixa_id,
    modo_teste,
    destinatario_tipo,
    telefone_destino,
    mensagem_renderizada,
    payload_hash,
    idempotency_key,
    expira_em,
    consumido_em,
    aluno_id,
    aluno_nome_snapshot,
    destinatario_nome_snapshot,
    publico_template_snapshot,
    curso_nome_snapshot,
    professor_nome_snapshot,
    tempo_permanencia_meses_snapshot,
    data_evasao_snapshot,
    motivo_cadastrado_snapshot,
    assinatura_nome_snapshot,
    template_versao
  )
  values (
    p_id,
    p_evasao_id,
    '10000000-0000-0000-0000-000000000001',
    1,
    p_auth_user_id,
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    3,
    p_modo_teste,
    case when p_modo_teste then 'teste' else 'aluno' end,
    p_telefone,
    'Mensagem imutável da fixture',
    encode(digest('Mensagem imutável da fixture', 'sha256'), 'hex'),
    gen_random_uuid(),
    p_expira_em,
    case when p_consumido then now() else null end,
    501,
    'Aluno Fixture',
    'Destinatário Fixture',
    'direto',
    'Curso Fixture',
    'Professor Fixture',
    12,
    date '2026-07-30',
    'Mudança de cidade',
    'Equipe LA',
    1
  )
$$;

\echo CASE_replay
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000001',
  1001
);
create temporary table primeira_claim as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001'
);
create temporary table replay_claim as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001'
);
select public.assert_true(
  (select deve_despachar from primeira_claim),
  'a primeira claim deve despachar'
);
select public.assert_true(
  not (select deve_despachar from replay_claim),
  'o replay deve retornar false'
);
select public.assert_true(
  (select pesquisa_id from primeira_claim) =
  (select pesquisa_id from replay_claim),
  'o replay deve retornar a mesma pesquisa'
);
select public.assert_true(
  (select idempotency_key from primeira_claim) =
  (select idempotency_key from replay_claim),
  'a chave da preview deve ser preservada'
);

\echo CASE_autor_errado
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000002',
  1002
);
do $$
begin
  perform *
  from public.claim_pesquisa_evasao_preview(
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002'
  );
  raise exception 'a autoria incorreta foi aceita';
exception
  when insufficient_privilege then
    null;
end
$$;

\echo CASE_expirada
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000003',
  1003,
  '20000000-0000-0000-0000-000000000001',
  false,
  '5511999999999',
  now() - interval '1 minute'
);
do $$
begin
  perform *
  from public.claim_pesquisa_evasao_preview(
    '50000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001'
  );
  raise exception 'a preview expirada foi aceita';
exception
  when invalid_parameter_value then
    null;
end
$$;

\echo CASE_consumida_orfa CASE_orfa_sqlstate_mensagem
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000004',
  1004,
  '20000000-0000-0000-0000-000000000001',
  false,
  '5511999999999',
  now() + interval '10 minutes',
  true
);
do $orfa_sqlstate_mensagem$
declare
  v_sqlstate text;
  v_mensagem text;
begin
  begin
    perform *
    from public.claim_pesquisa_evasao_preview(
      '50000000-0000-0000-0000-000000000004',
      '20000000-0000-0000-0000-000000000001'
    );
  exception
    when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_mensagem = message_text;
  end;

  perform public.assert_true(
    v_sqlstate = 'P0001',
    'preview orfa deve falhar com SQLSTATE P0001'
  );
  perform public.assert_true(
    v_mensagem = 'PESQUISA_EVASAO_PREVIEW_CONSUMIDA_SEM_PESQUISA',
    'preview orfa deve falhar com mensagem canonica'
  );
end
$orfa_sqlstate_mensagem$;

\echo CASE_producao_vs_teste
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000005',
  1005,
  '20000000-0000-0000-0000-000000000001',
  false,
  '5511988888888'
);
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000006',
  1005,
  '20000000-0000-0000-0000-000000000001',
  true,
  '5511977777777'
);
create temporary table prod_claim as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000005',
  '20000000-0000-0000-0000-000000000001'
);
create temporary table test_claim as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000006',
  '20000000-0000-0000-0000-000000000001'
);
select public.assert_true(
  (select deve_despachar from prod_claim)
  and (select deve_despachar from test_claim),
  'produção e teste devem ocupar slots separados'
);
select public.assert_true(
  (select count(*) from public.pesquisa_evasao where evasao_id = 1005) = 2,
  'produção e teste devem persistir linhas separadas'
);

\echo CASE_snapshot_invariantes
alter table public.pesquisa_evasao_previews
  alter column caixa_id drop not null;
do $snapshot_invariantes$
declare
  v_caso record;
  v_preview_id uuid;
  v_sqlstate text;
  v_mensagem text;
begin
  for v_caso in
    select *
    from (
      values
        (1017, 'aluno_id'),
        (1018, 'data_evasao_snapshot'),
        (1019, 'caixa_id')
    ) as casos(evasao_id, campo)
  loop
    v_preview_id := gen_random_uuid();
    perform public.criar_preview_fixture(v_preview_id, v_caso.evasao_id);
    execute format(
      'update public.pesquisa_evasao_previews set %I = null where id = $1',
      v_caso.campo
    ) using v_preview_id;

    v_sqlstate := null;
    v_mensagem := null;
    begin
      perform *
      from public.claim_pesquisa_evasao_preview(
        v_preview_id,
        '20000000-0000-0000-0000-000000000001'
      );
    exception
      when others then
        get stacked diagnostics
          v_sqlstate = returned_sqlstate,
          v_mensagem = message_text;
    end;

    perform public.assert_true(
      v_sqlstate = '22023'
      and v_mensagem = 'PESQUISA_EVASAO_PREVIEW_SNAPSHOT_INCOMPLETO',
      'campo obrigatorio ausente deve falhar com erro canonico: ' ||
      v_caso.campo
    );
    delete from public.pesquisa_evasao_previews where id = v_preview_id;
  end loop;
end
$snapshot_invariantes$;
alter table public.pesquisa_evasao_previews
  alter column caixa_id set not null;

\echo CASE_terminal_legado
do $terminal_legado$
declare
  v_caso record;
  v_preview_inicial uuid;
  v_preview_bloqueada uuid;
  v_preview_nova uuid;
  v_claim record;
  v_pesquisa_id uuid;
begin
  for v_caso in
    select *
    from (
      values
        (1011, 'ignorado', 'sem_resposta'),
        (1012, 'invalidada', 'invalidada'),
        (1013, 'recusada_opt_out', 'recusada_opt_out'),
        (1014, 'pendente', 'coletando'),
        (1015, 'pendente', 'pronta_para_revisao'),
        (1016, 'pendente', 'revisada')
    ) as casos(evasao_id, status_legado, resposta_status)
  loop
    v_preview_inicial := gen_random_uuid();
    v_preview_bloqueada := gen_random_uuid();
    v_preview_nova := gen_random_uuid();

    perform public.criar_preview_fixture(
      v_preview_inicial,
      v_caso.evasao_id
    );
    select *
    into v_claim
    from public.claim_pesquisa_evasao_preview(
      v_preview_inicial,
      '20000000-0000-0000-0000-000000000001'
    );
    perform public.assert_true(
      v_claim.deve_despachar,
      'precondicao terminal deve criar a tentativa inicial'
    );
    v_pesquisa_id := v_claim.pesquisa_id;

    update public.pesquisa_evasao
    set envio_status = 'falhou',
        status = v_caso.status_legado,
        resposta_status = v_caso.resposta_status
    where id = v_pesquisa_id;
    update public.pesquisa_evasao_previews
    set envio_status_tentativa = 'falhou',
        envio_erro_sanitizado_tentativa = 'terminal fixture',
        envio_finalizado_em = clock_timestamp()
    where id = v_preview_inicial;

    perform public.criar_preview_fixture(
      v_preview_bloqueada,
      v_caso.evasao_id
    );
    select *
    into v_claim
    from public.claim_pesquisa_evasao_preview(
      v_preview_bloqueada,
      '20000000-0000-0000-0000-000000000001'
    );
    perform public.assert_true(
      not v_claim.deve_despachar
      and v_claim.preview_id = v_preview_bloqueada
      and v_claim.envio_status = 'bloqueado',
      'estado terminal deve consumir e bloquear a preview nova'
    );
    perform public.assert_true(
      (
        select pe.status = v_caso.status_legado
          and pe.resposta_status = v_caso.resposta_status
          and pe.envio_status = 'falhou'
        from public.pesquisa_evasao pe
        where pe.id = v_pesquisa_id
      ),
      'claim bloqueada nao pode apagar estado terminal do cabecalho'
    );

    perform public.criar_preview_fixture(v_preview_nova, v_caso.evasao_id);
    select *
    into v_claim
    from public.claim_pesquisa_evasao_preview(
      v_preview_nova,
      '20000000-0000-0000-0000-000000000001'
    );
    perform public.assert_true(
      not v_claim.deve_despachar
      and v_claim.envio_status = 'bloqueado',
      'nova tentativa sobre estado terminal nunca deve despachar'
    );
  end loop;
end
$terminal_legado$;

\echo CASE_stale
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000007',
  1006
);
create temporary table stale_primeira as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000007',
  '20000000-0000-0000-0000-000000000001'
);
update public.pesquisa_evasao
set envio_iniciado_em = now() - interval '20 minutes'
where id = (select pesquisa_id from stale_primeira);
create temporary table stale_replay as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000007',
  '20000000-0000-0000-0000-000000000001'
);
select public.assert_true(
  not (select deve_despachar from stale_replay),
  'claim stale nunca deve autorizar reenvio'
);
select public.assert_true(
  (select envio_status from public.pesquisa_evasao
   where id = (select pesquisa_id from stale_primeira)) = 'incerto',
  'claim stale deve virar incerto'
);
select public.assert_true(
  (select envio_status from stale_replay) = 'incerto'
  and (
    select envio_status_tentativa
    from public.pesquisa_evasao_previews
    where id = '50000000-0000-0000-0000-000000000007'
  ) = 'incerto',
  'stale deve atualizar cabecalho, retorno e preview da tentativa'
);

\echo CASE_reconciliacao
select *
from public.registrar_resultado_pesquisa_evasao_envio(
  (select pesquisa_id from stale_primeira),
  (select preview_id from stale_primeira),
  (select idempotency_key from stale_primeira),
  '20000000-0000-0000-0000-000000000001',
  'enviado',
  'provider-reconciliado',
  null
);
select public.assert_true(
  (select envio_status from public.pesquisa_evasao
   where id = (select pesquisa_id from stale_primeira)) = 'enviado',
  'incerto deve aceitar reconciliação explícita para enviado'
);

\echo CASE_failed_retry_replay
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000010',
  1008
);
create temporary table tentativa_falha as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000010',
  '20000000-0000-0000-0000-000000000001'
);
select *
from public.registrar_resultado_pesquisa_evasao_envio(
  (select pesquisa_id from tentativa_falha),
  (select preview_id from tentativa_falha),
  (select idempotency_key from tentativa_falha),
  '20000000-0000-0000-0000-000000000001',
  'falhou',
  null,
  'falha conhecida da fixture'
);
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000011',
  1008
);
create temporary table nova_tentativa as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000001'
);
create temporary table replay_tentativa_antiga as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000010',
  '20000000-0000-0000-0000-000000000001'
);
select public.assert_true(
  (select deve_despachar from nova_tentativa),
  'nova preview deve permitir nova tentativa apos falha conhecida'
);
select public.assert_true(
  not (select deve_despachar from replay_tentativa_antiga),
  'replay da tentativa antiga deve continuar seguro'
);
select public.assert_true(
  (select pesquisa_id from tentativa_falha) =
  (select pesquisa_id from replay_tentativa_antiga),
  'replay antigo deve manter o vinculo historico ao cabecalho'
);

\echo CASE_slot_race_terminal CASE_historico_tentativa
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000012',
  1009
);
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000013',
  1009
);
create temporary table slot_primeira as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000012',
  '20000000-0000-0000-0000-000000000001'
);
create temporary table slot_segunda as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000013',
  '20000000-0000-0000-0000-000000000001'
);
select public.assert_true(
  (select deve_despachar from slot_primeira)
  and not (select deve_despachar from slot_segunda),
  'duas previews anteriores ao claim devem autorizar apenas a primeira'
);
select public.assert_true(
  (select preview_id from slot_segunda) =
    '50000000-0000-0000-0000-000000000013'::uuid,
  'claim perdedora deve devolver sua propria tentativa'
);
select public.assert_true(
  (
    select consumido_em is not null
      and envio_status_tentativa = 'bloqueado'
      and envio_erro_sanitizado_tentativa is not null
      and envio_finalizado_em is not null
    from public.pesquisa_evasao_previews
    where id = '50000000-0000-0000-0000-000000000013'
  ),
  'segunda preview deve ficar terminalmente consumida e bloqueada'
);
select *
from public.registrar_resultado_pesquisa_evasao_envio(
  (select pesquisa_id from slot_primeira),
  (select preview_id from slot_primeira),
  (select idempotency_key from slot_primeira),
  '20000000-0000-0000-0000-000000000001',
  'falhou',
  null,
  'falha conhecida da primeira tentativa'
);
select public.assert_true(
  (
    select envio_status_tentativa = 'falhou'
      and provider_message_id_tentativa is null
      and envio_erro_sanitizado_tentativa =
        'falha conhecida da primeira tentativa'
      and envio_iniciado_em is not null
      and envio_finalizado_em is not null
    from public.pesquisa_evasao_previews
    where id = '50000000-0000-0000-0000-000000000012'
  ),
  'resultado falhou deve finalizar atomicamente o snapshot da tentativa 1'
);
create temporary table slot_segunda_replay as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000013',
  '20000000-0000-0000-0000-000000000001'
);
select public.assert_true(
  not (select deve_despachar from slot_segunda_replay)
  and (select envio_status from slot_segunda_replay) = 'bloqueado',
  'preview bloqueada nao pode despachar depois da falha da vencedora'
);
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000014',
  1009
);
create temporary table slot_nova_tentativa as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000014',
  '20000000-0000-0000-0000-000000000001'
);
select public.assert_true(
  (select deve_despachar from slot_nova_tentativa),
  'somente uma nova preview deve liberar nova tentativa'
);
select *
from public.registrar_resultado_pesquisa_evasao_envio(
  (select pesquisa_id from slot_nova_tentativa),
  (select preview_id from slot_nova_tentativa),
  (select idempotency_key from slot_nova_tentativa),
  '20000000-0000-0000-0000-000000000001',
  'enviado',
  'provider-segunda-tentativa',
  null
);
select public.assert_true(
  (
    select envio_status_tentativa = 'enviado'
      and provider_message_id_tentativa = 'provider-segunda-tentativa'
      and envio_erro_sanitizado_tentativa is null
      and envio_iniciado_em is not null
      and envio_finalizado_em is not null
    from public.pesquisa_evasao_previews
    where id = '50000000-0000-0000-0000-000000000014'
  ),
  'resultado enviado deve finalizar atomicamente o snapshot da tentativa 2'
);
create temporary table slot_primeira_replay as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000012',
  '20000000-0000-0000-0000-000000000001'
);
create temporary table slot_nova_replay as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000014',
  '20000000-0000-0000-0000-000000000001'
);
select public.assert_true(
  not (select deve_despachar from slot_primeira_replay)
  and (select envio_status from slot_primeira_replay) = 'falhou'
  and (select provider_message_id from slot_primeira_replay) is null
  and (select idempotency_key from slot_primeira_replay) =
    (select idempotency_key from slot_primeira),
  'replay da tentativa 1 deve preservar falha, provider e chave antigos'
);
select public.assert_true(
  not (select deve_despachar from slot_nova_replay)
  and (select envio_status from slot_nova_replay) = 'enviado'
  and (select provider_message_id from slot_nova_replay) =
    'provider-segunda-tentativa'
  and (select idempotency_key from slot_nova_replay) =
    (select idempotency_key from slot_nova_tentativa),
  'replay da tentativa 2 deve preservar sucesso, provider e chave novos'
);
select public.assert_true(
  (select idempotency_key from slot_primeira_replay) <>
    (select idempotency_key from slot_nova_replay),
  'tentativas historicas devem manter chaves distintas'
);
select public.assert_true(
  (
    select count(*)
    from public.pesquisa_evasao
    where evasao_id = 1009
      and modo_teste is false
  ) = 1,
  'historico de tentativas deve preservar cabecalho produtivo unico'
);

\echo CASE_resultado_stale
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000015',
  1020
);
create temporary table resultado_stale_a as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000015',
  '20000000-0000-0000-0000-000000000001'
);
select *
from public.registrar_resultado_pesquisa_evasao_envio(
  (select pesquisa_id from resultado_stale_a),
  (select preview_id from resultado_stale_a),
  (select idempotency_key from resultado_stale_a),
  '20000000-0000-0000-0000-000000000001',
  'falhou',
  null,
  'falha conhecida antes da nova tentativa'
);
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000016',
  1020
);
create temporary table resultado_stale_b as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000016',
  '20000000-0000-0000-0000-000000000001'
);
do $resultado_stale$
declare
  v_mensagem text;
begin
  perform *
  from public.registrar_resultado_pesquisa_evasao_envio(
    (select pesquisa_id from resultado_stale_a),
    (select preview_id from resultado_stale_a),
    (select idempotency_key from resultado_stale_a),
    '20000000-0000-0000-0000-000000000001',
    'enviado',
    'provider-stale-a',
    null
  );
  raise exception 'ASSERTION FAILED: resultado da tentativa A deveria ser stale';
exception
  when sqlstate 'P0001' then
    get stacked diagnostics v_mensagem = message_text;
    if v_mensagem <> 'PESQUISA_EVASAO_TENTATIVA_STALE' then
      raise exception
        'ASSERTION FAILED: resultado stale retornou mensagem inesperada: %',
        v_mensagem;
    end if;
end
$resultado_stale$;
select public.assert_true(
  (
    select preview_id = (select preview_id from resultado_stale_b)
      and idempotency_key = (select idempotency_key from resultado_stale_b)
      and envio_status = 'enviando'
    from public.pesquisa_evasao
    where id = (select pesquisa_id from resultado_stale_b)
  )
  and (
    select envio_status_tentativa = 'falhou'
      and provider_message_id_tentativa is null
    from public.pesquisa_evasao_previews
    where id = (select preview_id from resultado_stale_a)
  )
  and (
    select envio_status_tentativa = 'enviando'
      and provider_message_id_tentativa is null
    from public.pesquisa_evasao_previews
    where id = (select preview_id from resultado_stale_b)
  ),
  'resultado stale de A nao pode alterar cabecalho nem tentativa B'
);
select *
from public.registrar_resultado_pesquisa_evasao_envio(
  (select pesquisa_id from resultado_stale_b),
  (select preview_id from resultado_stale_b),
  (select idempotency_key from resultado_stale_b),
  '20000000-0000-0000-0000-000000000001',
  'enviado',
  'provider-atual-b',
  null
);

\echo CASE_confirmacao_pos_timeout
select public.assert_true(
  public.confirmar_resultado_pesquisa_evasao_envio(
    (select pesquisa_id from resultado_stale_b),
    (select preview_id from resultado_stale_b),
    (select idempotency_key from resultado_stale_b),
    '20000000-0000-0000-0000-000000000001',
    'provider-atual-b'
  ),
  'confirmacao pos-timeout deve reconhecer o sucesso da propria tentativa'
);
select public.assert_true(
  not public.confirmar_resultado_pesquisa_evasao_envio(
    (select pesquisa_id from resultado_stale_b),
    (select preview_id from resultado_stale_b),
    (select idempotency_key from resultado_stale_b),
    '20000000-0000-0000-0000-000000000001',
    'provider-divergente'
  ),
  'confirmacao pos-timeout deve rejeitar provider id divergente'
);

\echo CASE_replay_resultado_sem_deadlock
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000017',
  1021
);
update public.pesquisa_evasao_previews
set idempotency_key = '60000000-0000-0000-0000-000000000017'
where id = '50000000-0000-0000-0000-000000000017';
create temporary table replay_resultado_base as
select *
from public.claim_pesquisa_evasao_preview(
  '50000000-0000-0000-0000-000000000017',
  '20000000-0000-0000-0000-000000000001'
);
select dblink_connect('replay_resultado_a', 'dbname=' || current_database());
select dblink_connect('replay_resultado_b', 'dbname=' || current_database());
select dblink_exec(
  'replay_resultado_a',
  $$set request.jwt.claim.role = 'service_role'; set lock_timeout = '5s'$$
);
select dblink_exec(
  'replay_resultado_b',
  $$set request.jwt.claim.role = 'service_role'; set lock_timeout = '5s'$$
);
select dblink_send_query(
  'replay_resultado_a',
  $$select envio_status
    from public.claim_pesquisa_evasao_preview(
      '50000000-0000-0000-0000-000000000017',
      '20000000-0000-0000-0000-000000000001'
    )$$
);
select dblink_send_query(
  'replay_resultado_b',
  format(
    $query$select envio_status
      from public.registrar_resultado_pesquisa_evasao_envio(
        %L::uuid,
        '50000000-0000-0000-0000-000000000017'::uuid,
        '60000000-0000-0000-0000-000000000017'::uuid,
        '20000000-0000-0000-0000-000000000001'::uuid,
        'enviado',
        'provider-concorrente',
        null
      )$query$,
    (select pesquisa_id from replay_resultado_base)
  )
);
create temporary table replay_resultado_concorrente (envio_status text);
insert into replay_resultado_concorrente
select envio_status
from dblink_get_result('replay_resultado_a') as t(envio_status text);
insert into replay_resultado_concorrente
select envio_status
from dblink_get_result('replay_resultado_b') as t(envio_status text);
select public.assert_true(
  (select count(*) from replay_resultado_concorrente) = 2
  and (
    select envio_status = 'enviado'
      and provider_message_id = 'provider-concorrente'
    from public.pesquisa_evasao
    where id = (select pesquisa_id from replay_resultado_base)
  )
  and (
    select envio_status_tentativa = 'enviado'
      and provider_message_id_tentativa = 'provider-concorrente'
    from public.pesquisa_evasao_previews
    where id = '50000000-0000-0000-0000-000000000017'
  ),
  'replay concorrente ao resultado deve terminar sem deadlock nem corrupcao'
);
select dblink_disconnect('replay_resultado_a');
select dblink_disconnect('replay_resultado_b');

\echo CASE_concurrency
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000008',
  1007
);
select public.criar_preview_fixture(
  '50000000-0000-0000-0000-000000000009',
  1007
);
select dblink_connect('claim_a', 'dbname=' || current_database());
select dblink_connect('claim_b', 'dbname=' || current_database());
select dblink_exec('claim_a', $$set request.jwt.claim.role = 'service_role'$$);
select dblink_exec('claim_b', $$set request.jwt.claim.role = 'service_role'$$);
select dblink_send_query(
  'claim_a',
  $$select deve_despachar::text
    from public.claim_pesquisa_evasao_preview(
      '50000000-0000-0000-0000-000000000008',
      '20000000-0000-0000-0000-000000000001'
    )$$
);
select dblink_send_query(
  'claim_b',
  $$select deve_despachar::text
    from public.claim_pesquisa_evasao_preview(
      '50000000-0000-0000-0000-000000000009',
      '20000000-0000-0000-0000-000000000001'
    )$$
);
create temporary table concorrencia_resultado (deve_despachar boolean);
insert into concorrencia_resultado
select resultado::boolean
from dblink_get_result('claim_a') as t(resultado text);
insert into concorrencia_resultado
select resultado::boolean
from dblink_get_result('claim_b') as t(resultado text);
select public.assert_true(
  (select count(*) from concorrencia_resultado where deve_despachar) = 1,
  'concorrência deve autorizar exatamente um despacho'
);
select public.assert_true(
  (
    select count(*)
    from public.pesquisa_evasao_previews
    where id in (
      '50000000-0000-0000-0000-000000000008',
      '50000000-0000-0000-0000-000000000009'
    )
      and consumido_em is not null
  ) = 2
  and (
    select count(*)
    from public.pesquisa_evasao_previews
    where id in (
      '50000000-0000-0000-0000-000000000008',
      '50000000-0000-0000-0000-000000000009'
    )
      and envio_status_tentativa = 'bloqueado'
  ) = 1,
  'corrida real deve consumir ambas e bloquear exatamente a perdedora'
);
select dblink_disconnect('claim_a');
select dblink_disconnect('claim_b');

\echo CASE_acl
select public.assert_true(
  has_function_privilege(
    'service_role',
    'public.claim_pesquisa_evasao_preview(uuid,uuid)',
    'EXECUTE'
  ),
  'service_role deve executar claim'
);
select public.assert_true(
  not has_function_privilege(
    'anon',
    'public.claim_pesquisa_evasao_preview(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.claim_pesquisa_evasao_preview(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'mila',
    'public.claim_pesquisa_evasao_preview(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'sol',
    'public.claim_pesquisa_evasao_preview(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'fabio',
    'public.claim_pesquisa_evasao_preview(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'lia',
    'public.claim_pesquisa_evasao_preview(uuid,uuid)',
    'EXECUTE'
  ),
  'claim deve ficar inacessível aos papéis de cliente e agentes'
);

\echo CASE_indice_homonimo_corrompido CASE_reaplicacao
drop index public.pesquisa_evasao_templates_publico_ativo_uidx;
create index pesquisa_evasao_templates_publico_ativo_uidx
  on public.pesquisa_evasao_templates (chave);
alter table public.pesquisa_evasao_previews
  drop constraint pesquisa_evasao_previews_pesquisa_id_fkey,
  add constraint pesquisa_evasao_previews_pesquisa_id_fkey
    foreign key (pesquisa_evasao_id)
    references public.pesquisa_evasao(id)
    on delete cascade;
\ir /workspace/supabase/migrations/20260730173000_pesquisa_evasao_claim_seguro.sql
select public.assert_true(
  has_function_privilege(
    'service_role',
    'public.claim_pesquisa_evasao_preview(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.claim_pesquisa_evasao_preview(uuid,uuid)',
    'EXECUTE'
  ),
  'reaplicacao deve preservar ACL service-only do claim'
);
select public.assert_true(
  has_function_privilege(
    'service_role',
    'public.registrar_resultado_pesquisa_evasao_envio(uuid,uuid,uuid,uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.registrar_resultado_pesquisa_evasao_envio(uuid,uuid,uuid,uuid,text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.pesquisa_evasao_claim_snapshot(uuid,boolean,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.pesquisa_evasao_claim_snapshot(uuid,boolean,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.confirmar_resultado_pesquisa_evasao_envio(uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.confirmar_resultado_pesquisa_evasao_envio(uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'reaplicacao deve preservar ACL service-only dos helpers'
);
select public.assert_true(
  to_regprocedure(
    'public.registrar_resultado_pesquisa_evasao_envio(uuid,uuid,text,text,text)'
  ) is null,
  'reaplicacao deve remover a assinatura antiga do registrador'
);
select public.assert_true(
  (
    select count(*) = 5
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pesquisa_evasao_previews'
      and column_name in (
        'envio_status_tentativa',
        'provider_message_id_tentativa',
        'envio_erro_sanitizado_tentativa',
        'envio_iniciado_em',
        'envio_finalizado_em'
      )
  ),
  'reaplicacao deve preservar colunas historicas da tentativa'
);
select public.assert_true(
  (
    select convalidated
    from pg_constraint
    where conrelid = 'public.pesquisa_evasao_previews'::regclass
      and conname =
        'pesquisa_evasao_previews_envio_status_tentativa_check'
  ),
  'reaplicacao deve preservar constraint validada de status da tentativa'
);
select public.assert_true(
  (
    select i.indisunique
      and i.indnatts = 1
      and a.attname = 'publico'
      and pg_get_expr(i.indpred, i.indrelid) = 'ativo'
    from pg_index i
    join pg_attribute a
      on a.attrelid = i.indrelid
     and a.attnum = i.indkey[0]
    where i.indexrelid =
      'public.pesquisa_evasao_templates_publico_ativo_uidx'::regclass
  ),
  'reaplicacao deve reparar indice ativo homonimo com definicao errada'
);
select public.assert_true(
  (
    select c.confrelid = 'public.pesquisa_evasao'::regclass
      and c.confdeltype = 'a'
      and c.convalidated
    from pg_constraint c
    where c.conrelid = 'public.pesquisa_evasao_previews'::regclass
      and c.conname = 'pesquisa_evasao_previews_pesquisa_id_fkey'
  ),
  'reaplicacao deve reparar FK homonima e remover ON DELETE CASCADE'
);

\echo PESQUISA_EVASAO_CLAIM_PG17_OK
