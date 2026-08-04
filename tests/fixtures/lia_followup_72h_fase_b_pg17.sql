\set ON_ERROR_STOP on

do $guard$
declare
  v_database text := current_database();
  v_sentinel text := current_setting('pesquisa_evasao.fixture_sentinel', true);
begin
  if v_database !~ '^pesquisa_evasao_fixture_[0-9a-f]{16}$' then
    raise exception 'FIXTURE_GUARD_DATABASE: %', v_database;
  end if;
  if v_sentinel is null or not exists (
    select 1
    from fixture_safety.sentinel
    where secret = v_sentinel
      and database_name = v_database
  ) then
    raise exception 'FIXTURE_GUARD_SENTINEL';
  end if;
end;
$guard$;

drop schema public cascade;
create schema public;

do $roles$
declare
  v_role text;
begin
  foreach v_role in array array[
    'anon', 'authenticated', 'service_role', 'fabio_agent',
    'lia_acesso_restrito', 'mila_acesso_restrito',
    'sol_acesso_restrito', 'maria_lareport_rpc', 'ml_jobs'
  ] loop
    if not exists (select 1 from pg_roles where rolname = v_role) then
      execute format('create role %I nologin', v_role);
    end if;
  end loop;
end;
$roles$;

create schema auth;
create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '');
$$;
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create schema cron;
create table cron.job (
  jobid bigserial primary key,
  jobname text not null unique,
  schedule text not null,
  command text not null
);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint language plpgsql as $$
declare v_jobid bigint;
begin
  insert into cron.job(jobname, schedule, command)
  values (p_name, p_schedule, p_command)
  on conflict (jobname) do update
    set schedule = excluded.schedule, command = excluded.command
  returning jobid into v_jobid;
  return v_jobid;
end;
$$;
create or replace function cron.unschedule(p_jobid bigint)
returns boolean language plpgsql as $$
begin
  delete from cron.job where jobid = p_jobid;
  return found;
end;
$$;

create table public.usuarios (
  id integer primary key,
  nome text not null,
  ativo boolean not null default true,
  auth_user_id uuid
);
create table public.whatsapp_caixas (
  id integer primary key,
  nome text not null,
  ativo boolean not null default true,
  provedor text not null,
  uazapi_url text,
  uazapi_token text
);
create table public.unidades (
  id uuid primary key,
  nome text not null
);
create table public.movimentacoes_admin (
  id integer primary key,
  aluno_nome text
);
create table public.pesquisa_evasao (
  id uuid primary key,
  evasao_id integer not null references public.movimentacoes_admin(id),
  unidade_id uuid not null references public.unidades(id),
  aluno_nome text not null,
  modo_teste boolean not null default false,
  executado_por_usuario_id integer references public.usuarios(id),
  envio_status text not null default 'enviado',
  resposta_status text not null default 'sem_resposta',
  resposta_valida boolean not null default false,
  opt_out_em timestamptz,
  enviado_em timestamptz,
  conteudo_novo_desde_revisao boolean not null default false
);
create table public.pesquisa_evasao_analises (
  id uuid primary key,
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  versao integer not null,
  status text not null,
  unique (pesquisa_id, versao)
);
create table public.pesquisa_evasao_mensagens (
  id uuid primary key,
  pesquisa_id uuid references public.pesquisa_evasao(id),
  direcao text not null,
  tipo text not null,
  resolution_status text not null,
  substantividade text not null,
  analise_versao integer,
  provider_created_at timestamptz,
  recebido_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
create or replace function public.fixture_assert(p_ok boolean, p_message text)
returns void language plpgsql as $fixture$
begin
  if not p_ok then
    raise exception 'FIXTURE_ASSERT: %', p_message;
  end if;
end;
$fixture$;

create or replace function public.fn_pesquisa_evasao_usuario_interno_ativo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.usuarios usuario
      where usuario.auth_user_id = auth.uid()
        and usuario.ativo = true
    );
$function$;

insert into public.usuarios(id, nome, ativo, auth_user_id) values
  (2, 'Luciano Alf', true, '00000000-0000-4000-8000-000000000002'),
  (29, 'Jéssica', true, '00000000-0000-4000-8000-000000000029'),
  (30, 'Fabi', true, '00000000-0000-4000-8000-000000000030'),
  (31, 'Operador inativo', false, '00000000-0000-4000-8000-000000000031');
insert into public.whatsapp_caixas(
  id, nome, ativo, provedor, uazapi_url, uazapi_token
) values (
  3, 'Lia - Sucesso do Aluno', true, 'uazapi',
  'https://fixture.invalid', 'FIXTURE-INVALIDA'
);
insert into public.unidades(id, nome) values
  ('20000000-0000-4000-8000-000000000001', 'Barra'),
  ('20000000-0000-4000-8000-000000000002', 'Recreio');

\ir ../../supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql
\ir ../../supabase/migrations/20260803210000_lia_alertas_dispatcher_edge.sql
\ir ../../supabase/migrations/20260803124500_lia_alertas_utf8_correcao.sql
\ir ../../supabase/migrations/20260804090000_lia_followup_72h_fase_b.sql
\ir ../../supabase/migrations/20260804123000_lia_followup_listagem_somente_producao.sql
\ir ../../supabase/migrations/20260804173000_lia_followup_resumo_renderizar_itens_teste.sql

select public.fixture_assert(
  not has_table_privilege(
    'authenticated', 'public.pesquisa_evasao_followup_acoes', 'select'
  ),
  'authenticated nao pode ler tabela de acao diretamente'
);
select public.fixture_assert(
  has_table_privilege(
    'service_role', 'public.lia_followup_resumos', 'select'
  ),
  'service_role precisa ler resumos'
);
select public.fixture_assert(
  (select followup_72h_liberado = false
   from public.lia_alertas_configuracao where id = 1),
  'Fase B precisa nascer bloqueada'
);
select public.fixture_assert(
  not exists (
    select 1 from cron.job
    where jobname like '%followup%'
  ),
  'migration estrutural nao pode criar cron de follow-up'
);

insert into public.movimentacoes_admin(id, aluno_nome) values
  (1, 'Ezequiel FernandoFerreira de almeida'),
  (2, 'Abertura sem resposta'),
  (3, 'Opt-out'),
  (4, 'Resposta válida'),
  (5, 'Caso da Fabi'),
  (6, 'Pesquisa teste'),
  (7, 'Ação manual'),
  (8, 'Vence depois das nove');

insert into public.pesquisa_evasao(
  id, evasao_id, unidade_id, aluno_nome, modo_teste,
  executado_por_usuario_id, envio_status, resposta_status,
  resposta_valida, opt_out_em, enviado_em
) values
  ('10000000-0000-4000-8000-000000000001', 1, '20000000-0000-4000-8000-000000000001', 'Ezequiel FernandoFerreira de almeida', false, 29, 'enviado', 'sem_resposta', false, null, '2026-08-03 13:55:54.975241+00'),
  ('10000000-0000-4000-8000-000000000002', 2, '20000000-0000-4000-8000-000000000001', 'Abertura sem resposta', false, 29, 'enviado', 'sem_resposta', false, null, '2026-08-01 12:00:00+00'),
  ('10000000-0000-4000-8000-000000000003', 3, '20000000-0000-4000-8000-000000000001', 'Opt-out', false, 29, 'enviado', 'recusada_opt_out', false, '2026-08-04 12:00:00+00', '2026-08-01 12:00:00+00'),
  ('10000000-0000-4000-8000-000000000004', 4, '20000000-0000-4000-8000-000000000001', 'Resposta válida', false, 29, 'enviado', 'pronta_para_revisao', true, null, '2026-08-01 12:00:00+00'),
  ('10000000-0000-4000-8000-000000000005', 5, '20000000-0000-4000-8000-000000000002', 'Caso da Fabi', false, 30, 'enviado', 'sem_resposta', false, null, '2026-08-01 12:00:00+00'),
  ('10000000-0000-4000-8000-000000000006', 6, '20000000-0000-4000-8000-000000000001', 'Pesquisa teste', true, 29, 'enviado', 'sem_resposta', false, null, '2026-08-01 12:00:00+00'),
  ('10000000-0000-4000-8000-000000000007', 7, '20000000-0000-4000-8000-000000000001', 'Ação manual', false, 29, 'enviado', 'sem_resposta', false, null, clock_timestamp() - interval '4 days'),
  ('10000000-0000-4000-8000-000000000008', 8, '20000000-0000-4000-8000-000000000001', 'Vence depois das nove', false, 29, 'enviado', 'sem_resposta', false, null, '2026-08-04 13:00:00+00');

insert into public.pesquisa_evasao_mensagens(
  id, pesquisa_id, direcao, tipo, resolution_status, substantividade
) values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'entrada', 'texto', 'resolvida', 'abertura'
);

set request.jwt.claim.role = 'service_role';

create temp table fixture_followup_piloto as
select public.enfileirar_lia_followup_piloto(
  '10000000-0000-4000-8000-000000000006'
) as alerta_id;

select public.fixture_assert(
  exists (
    select 1
    from fixture_followup_piloto piloto
    join public.lia_alertas_privados alerta on alerta.id = piloto.alerta_id
    where alerta.mensagem_renderizada like '%Pesquisa teste — Barra — enviada em 01/08 09:00%'
  ),
  'PILOT_LIST_RENDERED_OK'
);

select public.fixture_assert(
  (select estado_visivel = 'aguardando_resposta'
   from public.fn_pesquisa_evasao_followup_estado(
     '2026-08-06 13:55:53.975241+00'
   ) where pesquisa_id = '10000000-0000-4000-8000-000000000001'),
  '71h59m59s precisa aguardar'
);
select public.fixture_assert(
  (select estado_visivel = 'followup_pendente'
   from public.fn_pesquisa_evasao_followup_estado(
     '2026-08-06 13:55:54.975241+00'
   ) where pesquisa_id = '10000000-0000-4000-8000-000000000001'),
  'EZEQUIEL_DUE_AT_72H_OK'
);
select public.fixture_assert(
  (select interagiu_sem_resposta_valida and followup_pendente
   from public.fn_pesquisa_evasao_followup_estado('2026-08-07 12:00:00+00')
   where pesquisa_id = '10000000-0000-4000-8000-000000000002'),
  'NON_SUBSTANTIVE_STAYS_PENDING_OK'
);
select public.fixture_assert(
  not exists (
    select 1
    from public.fn_pesquisa_evasao_followup_estado('2026-08-07 12:00:00+00')
    where pesquisa_id = '10000000-0000-4000-8000-000000000006'
  ),
  'TEST_MODE_EXCLUDED_FROM_READ_MODEL_OK'
);
select public.fixture_assert(
  not exists (
    select 1
    from public.fn_pesquisa_evasao_followup_estado('2026-08-07 12:00:00+00')
    where pesquisa_id in (
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000006'
    )
      and followup_pendente
  ),
  'OPT_OUT_BLOCKS_FOLLOWUP_OK'
);

set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000029';
select * from public.registrar_followup_pesquisa_evasao_v1(
  '10000000-0000-4000-8000-000000000007',
  'realizado',
  'whatsapp',
  'Contato realizado pela fixture'
);
select public.fixture_assert(
  exists (
    select 1 from public.pesquisa_evasao_followup_acoes
    where pesquisa_id = '10000000-0000-4000-8000-000000000007'
      and operador_usuario_id = 29
      and operador_auth_user_id = '00000000-0000-4000-8000-000000000029'
      and acao = 'realizado'
      and canal = 'whatsapp'
  ),
  'MANUAL_ACTION_AUDIT_OK'
);

set request.jwt.claim.role = 'service_role';
set request.jwt.claim.sub = '';
update public.lia_alertas_configuracao
set alertas_producao_liberados = true,
    followup_72h_liberado = true;

select * from public.produzir_lia_resumos_followup_72h(
  '2026-08-06 13:55:54.975241+00'
);
select public.fixture_assert(
  not exists (
    select 1 from public.lia_followup_resumo_itens
    where pesquisa_id = '10000000-0000-4000-8000-000000000001'
  ),
  'EZEQUIEL_NEXT_DAILY_SUMMARY_OK'
);

select * from public.produzir_lia_resumos_followup_72h(
  '2026-08-07 12:00:10+00'
);
select public.fixture_assert(
  exists (
    select 1 from public.lia_followup_resumo_itens item
    join public.lia_followup_resumos resumo on resumo.id = item.resumo_id
    where item.pesquisa_id = '10000000-0000-4000-8000-000000000001'
      and resumo.data_corte_brt = date '2026-08-07'
      and resumo.operador_usuario_id = 29
  ),
  'EZEQUIEL_NEXT_DAILY_SUMMARY_OK'
);
select public.fixture_assert(
  not exists (
    select 1 from public.lia_followup_resumo_itens
    where pesquisa_id = '10000000-0000-4000-8000-000000000008'
  ),
  'AFTER_NINE_WAITS_NEXT_DAY_OK'
);

select * from public.produzir_lia_resumos_followup_72h(
  '2026-08-07 12:00:40+00'
);
select public.fixture_assert(
  (select count(*) from public.lia_followup_resumos
   where data_corte_brt = date '2026-08-07') = 2,
  'DAILY_IDEMPOTENCY_OK'
);
select public.fixture_assert(
  not exists (
    select 1
    from public.lia_followup_resumo_itens item
    join public.lia_followup_resumos resumo on resumo.id = item.resumo_id
    join public.pesquisa_evasao pesquisa on pesquisa.id = item.pesquisa_id
    where resumo.ambiente = 'producao'
      and resumo.operador_usuario_id <> pesquisa.executado_por_usuario_id
  ),
  'OPERATOR_ISOLATION_OK'
);

select * from public.produzir_lia_resumos_followup_72h(
  '2026-08-07 13:00:00+00'
);
select public.fixture_assert(
  not exists (
    select 1 from public.lia_followup_resumo_itens
    where pesquisa_id = '10000000-0000-4000-8000-000000000008'
  ),
  'AFTER_NINE_WAITS_NEXT_DAY_OK'
);

select * from public.produzir_lia_resumos_followup_72h(
  '2026-08-08 12:00:10+00'
);
select public.fixture_assert(
  exists (
    select 1 from public.lia_followup_resumo_itens item
    join public.lia_followup_resumos resumo on resumo.id = item.resumo_id
    where item.pesquisa_id = '10000000-0000-4000-8000-000000000008'
      and resumo.data_corte_brt = date '2026-08-08'
  ),
  'AFTER_NINE_WAITS_NEXT_DAY_OK'
);

update public.pesquisa_evasao
set resposta_valida = true,
    resposta_status = 'pronta_para_revisao'
where id = '10000000-0000-4000-8000-000000000005';

select *
from public.fn_lia_claim_alerta_privado_em(
  '50000000-0000-4000-8000-000000000001',
  (
    select alerta.id
    from public.lia_alertas_privados alerta
    join public.lia_followup_resumos resumo
      on resumo.id = alerta.followup_resumo_id
    where resumo.operador_usuario_id = 30
      and resumo.data_corte_brt = date '2026-08-07'
  ),
  '2026-08-07 12:05:00+00'
);
select public.fixture_assert(
  exists (
    select 1
    from public.lia_followup_resumo_itens item
    join public.lia_followup_resumos resumo on resumo.id = item.resumo_id
    where item.pesquisa_id = '10000000-0000-4000-8000-000000000005'
      and item.cancelamento_motivo = 'resposta_valida'
  )
  and exists (
    select 1
    from public.lia_alertas_privados alerta
    join public.lia_followup_resumos resumo
      on resumo.id = alerta.followup_resumo_id
    where resumo.operador_usuario_id = 30
      and alerta.status = 'cancelado'
      and alerta.tentativas = 0
  ),
  'RESPONSE_BEFORE_CLAIM_CANCELS_OK'
);

select 'EZEQUIEL_DUE_AT_72H_OK';
select 'EZEQUIEL_NEXT_DAILY_SUMMARY_OK';
select 'AFTER_NINE_WAITS_NEXT_DAY_OK';
select 'DAILY_IDEMPOTENCY_OK';
select 'NON_SUBSTANTIVE_STAYS_PENDING_OK';
select 'OPT_OUT_BLOCKS_FOLLOWUP_OK';
select 'RESPONSE_BEFORE_CLAIM_CANCELS_OK';
select 'OPERATOR_ISOLATION_OK';
select 'MANUAL_ACTION_AUDIT_OK';
select 'PILOT_LIST_RENDERED_OK';
select 'LIA_FOLLOWUP_72H_FASE_B_PG17_OK';
select 'PESQUISA_EVASAO_CLAIM_PG17_OK';
