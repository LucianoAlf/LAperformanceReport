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
    set schedule = excluded.schedule,
        command = excluded.command
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

create table public.pesquisa_evasao (
  id uuid primary key,
  unidade_id uuid not null references public.unidades(id),
  aluno_nome text not null,
  modo_teste boolean not null default false,
  executado_por_usuario_id integer references public.usuarios(id)
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

insert into public.usuarios(id, nome, ativo, auth_user_id) values
  (2, 'Luciano Alf', true, '00000000-0000-4000-8000-000000000002'),
  (29, 'Jessica', true, '00000000-0000-4000-8000-000000000029'),
  (30, 'Fabi', true, '00000000-0000-4000-8000-000000000030'),
  (31, 'Operador inativo', false, '00000000-0000-4000-8000-000000000031');

insert into public.whatsapp_caixas(
  id, nome, ativo, provedor, uazapi_url, uazapi_token
) values (
  3,
  'Lia - Sucesso do Aluno',
  true,
  'uazapi',
  'https://fixture.invalid',
  'FIXTURE-INVALIDA'
);

\ir ../../supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql
\ir ../../supabase/migrations/20260803210000_lia_alertas_dispatcher_edge.sql

select public.fixture_assert(
  not has_table_privilege('authenticated', 'public.lia_destinos_privados', 'select'),
  'authenticated nao pode ler destinos'
);
select public.fixture_assert(
  not has_table_privilege('anon', 'public.lia_alertas_privados', 'select'),
  'anon nao pode ler outbox'
);
select public.fixture_assert(
  has_table_privilege('service_role', 'public.lia_destinos_privados', 'select'),
  'service_role precisa ler destinos'
);
select public.fixture_assert(
  (select count(*) from public.lia_destinos_privados where ativo) = 3,
  'os tres destinos governados precisam existir'
);
select public.fixture_assert(
  (select alertas_producao_liberados = false
   from public.lia_alertas_configuracao where id = 1),
  'producao precisa nascer bloqueada'
);
select public.fixture_assert(
  not exists (
    select 1
    from public.lia_alertas_privados
    where caixa_id <> 3
  ),
  'toda entrega da Fase A deve auditar caixa_id=3'
);

insert into public.unidades(id, nome) values
  ('20000000-0000-4000-8000-000000000001', 'Barra');

insert into public.pesquisa_evasao(
  id, unidade_id, aluno_nome, modo_teste, executado_por_usuario_id
) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Aluno Um', false, 29),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Aluno Audio', false, 29),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Aluno Rodada', false, 29),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'Aluno Optout', false, 29),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'Aluno Dois Fatos', false, 29),
  ('10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', 'Aluno Teste', true, 29),
  ('10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', 'Aluno Sem Operador', false, null),
  ('10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', 'Aluno Operador Inativo', false, 31);

insert into public.pesquisa_evasao_analises(id, pesquisa_id, versao, status) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'rascunho'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 1, 'rascunho'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 1, 'revisada'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 2, 'rascunho'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', 1, 'rascunho'),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', 1, 'rascunho'),
  ('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000006', 1, 'rascunho'),
  ('30000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000007', 1, 'rascunho'),
  ('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000008', 1, 'rascunho');

-- Dois fragmentos substantivos da mesma rodada geram um evento.
insert into public.pesquisa_evasao_mensagens(
  id, pesquisa_id, direcao, tipo, resolution_status, substantividade, analise_versao
) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'entrada', 'texto', 'resolvida', 'conteudo_substantivo', 1),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'entrada', 'texto', 'resolvida', 'conteudo_substantivo', 1);

update public.pesquisa_evasao_analises
set status = 'revisada'
where id = '30000000-0000-4000-8000-000000000001';

insert into public.pesquisa_evasao_mensagens(
  id, pesquisa_id, direcao, tipo, resolution_status, substantividade, analise_versao
) values
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'entrada', 'texto', 'resolvida', 'conteudo_substantivo', 1);

select public.fixture_assert(
  (select count(*) from public.lia_pesquisa_eventos
   where pesquisa_id = '10000000-0000-4000-8000-000000000001') = 1,
  'uma rodada nao pode gerar dois alertas'
);
select public.fixture_assert(
  (select array_agg(distinct destinatario_usuario_id)
   from public.lia_alertas_privados alerta
   join public.lia_pesquisa_eventos evento on evento.id = alerta.evento_id
   where evento.pesquisa_id = '10000000-0000-4000-8000-000000000001') = array[29],
  'nao pode haver notificacao cruzada'
);

-- Audio indeterminado nao gera evento; a classificacao posterior gera um.
insert into public.pesquisa_evasao_mensagens(
  id, pesquisa_id, direcao, tipo, resolution_status, substantividade, analise_versao
) values
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'entrada', 'audio', 'resolvida', 'indeterminado', 1);
select public.fixture_assert(
  not exists (
    select 1 from public.lia_pesquisa_eventos
    where pesquisa_id = '10000000-0000-4000-8000-000000000002'
  ),
  'audio indeterminado nao pode alertar'
);
update public.pesquisa_evasao_mensagens
set substantividade = 'conteudo_substantivo'
where id = '40000000-0000-4000-8000-000000000004';
select public.fixture_assert(
  (select count(*) from public.lia_pesquisa_eventos
   where pesquisa_id = '10000000-0000-4000-8000-000000000002') = 1,
  'audio substantivo precisa alertar depois da transcricao'
);

-- Rodada posterior a revisao recebe o alerta prioritario.
insert into public.pesquisa_evasao_mensagens(
  id, pesquisa_id, direcao, tipo, resolution_status, substantividade, analise_versao
) values
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', 'entrada', 'texto', 'resolvida', 'conteudo_substantivo', 2);
select public.fixture_assert(
  (select tipo from public.lia_pesquisa_eventos
   where pesquisa_id = '10000000-0000-4000-8000-000000000003') = 'rodada_nova_pos_revisao',
  'rodada nova apos revisao precisa de alerta prioritario'
);

-- Opt-out e resposta sao fatos independentes na mesma rodada.
insert into public.pesquisa_evasao_mensagens(
  id, pesquisa_id, direcao, tipo, resolution_status, substantividade, analise_versao
) values
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004', 'entrada', 'texto', 'resolvida', 'opt_out', 1),
  ('40000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000005', 'entrada', 'texto', 'resolvida', 'conteudo_substantivo', 1),
  ('40000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000005', 'entrada', 'texto', 'resolvida', 'opt_out', 1);
select public.fixture_assert(
  (select count(*) from public.lia_pesquisa_eventos
   where pesquisa_id = '10000000-0000-4000-8000-000000000004'
     and tipo = 'opt_out') = 1,
  'opt-out deve gerar apenas o fato de recusa'
);
select public.fixture_assert(
  (select array_agg(tipo order by tipo) from public.lia_pesquisa_eventos
   where pesquisa_id = '10000000-0000-4000-8000-000000000005') =
    array['opt_out', 'resposta_nova'],
  'conteudo e opt-out precisam coexistir na mesma rodada'
);

-- Teste comum nunca entra na outbox produtiva.
insert into public.pesquisa_evasao_mensagens(
  id, pesquisa_id, direcao, tipo, resolution_status, substantividade, analise_versao
) values
  ('40000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000006', 'entrada', 'texto', 'resolvida', 'conteudo_substantivo', 1);
select public.fixture_assert(
  not exists (
    select 1 from public.lia_pesquisa_eventos
    where pesquisa_id = '10000000-0000-4000-8000-000000000006'
  ),
  'teste comum nao pode entrar na outbox produtiva'
);

-- Operador ausente ou inativo vai para fila administrativa, sem destino.
insert into public.pesquisa_evasao_mensagens(
  id, pesquisa_id, direcao, tipo, resolution_status, substantividade, analise_versao
) values
  ('40000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000007', 'entrada', 'texto', 'resolvida', 'conteudo_substantivo', 1),
  ('40000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000008', 'entrada', 'texto', 'resolvida', 'conteudo_substantivo', 1);
select public.fixture_assert(
  (select count(*)
   from public.lia_alertas_privados alerta
   join public.lia_pesquisa_eventos evento on evento.id = alerta.evento_id
   where evento.pesquisa_id in (
     '10000000-0000-4000-8000-000000000007',
     '10000000-0000-4000-8000-000000000008'
   )
     and alerta.status = 'fila_administrativa'
     and alerta.destino_snapshot is null) = 2,
  'operador ausente ou inativo precisa ir para fila administrativa'
);

-- RPCs de transporte: ACL, janela, claim atomico e desfechos terminais.
select public.fixture_assert(
  not has_function_privilege(
    'authenticated',
    'public.claim_lia_alerta_privado(uuid,uuid)',
    'execute'
  ),
  'authenticated nao pode executar claim'
);
select public.fixture_assert(
  has_function_privilege(
    'service_role',
    'public.claim_lia_alerta_privado(uuid,uuid)',
    'execute'
  ),
  'service_role precisa executar claim'
);
select public.fixture_assert(
  public.fn_lia_janela_envio_permitida('2026-08-03 10:00:00-03'),
  '10h BRT precisa estar na janela'
);
select public.fixture_assert(
  not public.fn_lia_janela_envio_permitida('2026-08-03 20:00:00-03'),
  '20h BRT precisa estar fora da janela'
);

select set_config('request.jwt.claim.role', 'service_role', false);

update public.lia_alertas_privados alerta
set status = 'pendente'
from public.lia_pesquisa_eventos evento
where evento.id = alerta.evento_id
  and evento.pesquisa_id = '10000000-0000-4000-8000-000000000001';

create temp table fixture_claim_um as
select *
from public.fn_lia_claim_alerta_privado_em(
  '50000000-0000-4000-8000-000000000001',
  (
    select alerta.id
    from public.lia_alertas_privados alerta
    join public.lia_pesquisa_eventos evento on evento.id = alerta.evento_id
    where evento.pesquisa_id = '10000000-0000-4000-8000-000000000001'
  ),
  '2026-08-03 10:00:00-03'
);

create temp table fixture_claim_dois as
select *
from public.fn_lia_claim_alerta_privado_em(
  '50000000-0000-4000-8000-000000000002',
  (select alerta_id from fixture_claim_um),
  '2026-08-03 10:00:01-03'
);

select public.fixture_assert(
  (select count(*) from fixture_claim_um) = 1
  and (select count(*) from fixture_claim_dois) = 0,
  'dois workers nao podem reclamar a mesma entrega'
);

select public.fixture_assert(
  public.concluir_lia_alerta_privado(
    (select alerta_id from fixture_claim_um),
    (select claim_token from fixture_claim_um),
    'FIXTURE-MSG-1'
  ),
  'conclusao precisa reconhecer o claim'
);
select public.fixture_assert(
  (select status = 'enviado'
   from public.lia_alertas_privados
   where id = (select alerta_id from fixture_claim_um)),
  'conclusao precisa marcar enviado'
);

-- Um processamento abandonado nunca e reaberto automaticamente.
update public.lia_alertas_privados alerta
set status = 'processando',
    claimed_em = '2026-08-03 09:00:00-03',
    worker_id = '50000000-0000-4000-8000-000000000003',
    claim_token = '50000000-0000-4000-8000-000000000004'
from public.lia_pesquisa_eventos evento
where evento.id = alerta.evento_id
  and evento.pesquisa_id = '10000000-0000-4000-8000-000000000002';

update public.lia_alertas_privados alerta
set status = 'pendente'
from public.lia_pesquisa_eventos evento
where evento.id = alerta.evento_id
  and evento.pesquisa_id = '10000000-0000-4000-8000-000000000003';

create temp table fixture_claim_ambiguo as
select *
from public.fn_lia_claim_alerta_privado_em(
  '50000000-0000-4000-8000-000000000005',
  (
    select alerta.id
    from public.lia_alertas_privados alerta
    join public.lia_pesquisa_eventos evento on evento.id = alerta.evento_id
    where evento.pesquisa_id = '10000000-0000-4000-8000-000000000003'
  ),
  '2026-08-03 10:00:00-03'
);

select public.fixture_assert(
  (select alerta.status = 'fila_administrativa'
          and alerta.motivo_pendencia = 'processamento_abandonado'
   from public.lia_alertas_privados alerta
   join public.lia_pesquisa_eventos evento on evento.id = alerta.evento_id
   where evento.pesquisa_id = '10000000-0000-4000-8000-000000000002'),
  'processando abandonado precisa ir para fila administrativa'
);

select public.fixture_assert(
  public.falhar_lia_alerta_privado(
    (select alerta_id from fixture_claim_ambiguo),
    (select claim_token from fixture_claim_ambiguo),
    'provider_confirmacao_ambigua',
    true
  ),
  'falha ambigua precisa reconhecer o claim'
);
select public.fixture_assert(
  (select status = 'resultado_ambiguo'
   from public.lia_alertas_privados
   where id = (select alerta_id from fixture_claim_ambiguo))
  and not exists (
    select 1 from public.lia_alertas_privados
    where id = (select alerta_id from fixture_claim_ambiguo)
      and status = 'pendente'
  ),
  'resultado ambiguo nao pode voltar a pendente'
);

do $fixture_invalid_code$
begin
  begin
    perform public.falhar_lia_alerta_privado(
      gen_random_uuid(),
      gen_random_uuid(),
      'bridge_timeout',
      false
    );
    raise exception 'FIXTURE_ASSERT: bridge_timeout deveria ser rejeitado';
  exception
    when others then
      if sqlerrm <> 'erro_codigo_invalido' then
        raise;
      end if;
  end;
end;
$fixture_invalid_code$;

-- Destino alterado entre enqueue e claim falha fechado.
update public.lia_alertas_privados alerta
set status = 'pendente'
from public.lia_pesquisa_eventos evento
where evento.id = alerta.evento_id
  and evento.pesquisa_id = '10000000-0000-4000-8000-000000000004';
update public.lia_destinos_privados set ativo = false where usuario_id = 29;
select *
from public.fn_lia_claim_alerta_privado_em(
  '50000000-0000-4000-8000-000000000006',
  (
    select alerta.id
    from public.lia_alertas_privados alerta
    join public.lia_pesquisa_eventos evento on evento.id = alerta.evento_id
    where evento.pesquisa_id = '10000000-0000-4000-8000-000000000004'
  ),
  '2026-08-03 10:00:00-03'
);
select public.fixture_assert(
  (select alerta.status = 'fila_administrativa'
   from public.lia_alertas_privados alerta
   join public.lia_pesquisa_eventos evento on evento.id = alerta.evento_id
   where evento.pesquisa_id = '10000000-0000-4000-8000-000000000004'),
  'destino inativo precisa falhar fechado antes do claim'
);
update public.lia_destinos_privados set ativo = true where usuario_id = 29;

-- Piloto usa somente pesquisa de teste, destino governado do Alf e nao libera producao.
create temp table fixture_piloto as
select public.enfileirar_lia_alerta_piloto(
  '10000000-0000-4000-8000-000000000006',
  'resposta_nova'
) as alerta_id;
select public.fixture_assert(
  (select alerta.destinatario_usuario_id = 2
          and alerta.destino_snapshot = '5521981278047'
          and evento.ambiente = 'teste'
   from public.lia_alertas_privados alerta
   join public.lia_pesquisa_eventos evento on evento.id = alerta.evento_id
   where alerta.id = (select alerta_id from fixture_piloto)),
  'piloto deve forcar o destino governado do Alf'
);
select public.fixture_assert(
  (select alertas_producao_liberados = false
   from public.lia_alertas_configuracao where id = 1),
  'piloto nao pode liberar alertas produtivos'
);

-- A fila administrativa e visivel a interno ativo sem expor snapshots privados.
select set_config('request.jwt.claim.role', 'authenticated', false);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002',
  false
);
select public.fixture_assert(
  (select count(*)
   from public.listar_lia_alertas_pendencias_administrativas(50)) >= 1,
  'usuario interno ativo precisa ver a fila administrativa sanitizada'
);

select 'PESQUISA_EVASAO_CLAIM_PG17_OK';
select 'LIA_ALERTAS_PRIVADOS_FASE_A_PG17_OK';
