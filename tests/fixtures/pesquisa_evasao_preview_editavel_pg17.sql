\set ON_ERROR_STOP on

begin;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create table public.usuarios (
  id integer primary key,
  auth_user_id uuid not null,
  nome text not null,
  ativo boolean not null default true
);

create table public.pesquisa_evasao_previews (
  id uuid primary key,
  evasao_id integer not null,
  unidade_id uuid not null,
  usuario_id integer not null references public.usuarios(id),
  auth_user_id uuid not null,
  assinatura_id uuid,
  template_id uuid not null,
  caixa_id integer not null,
  modo_teste boolean not null default true,
  destinatario_tipo text not null,
  telefone_destino text not null,
  mensagem_renderizada text not null,
  payload_hash text not null,
  idempotency_key uuid not null unique,
  expira_em timestamptz not null,
  consumido_em timestamptz,
  criado_em timestamptz not null default now()
);

create table public.pesquisa_evasao (
  id uuid primary key,
  preview_id uuid unique references public.pesquisa_evasao_previews(id),
  mensagem_renderizada text
);

insert into public.usuarios (id, auth_user_id, nome)
values
  (1, '10000000-0000-0000-0000-000000000001', 'Operador Fixture'),
  (2, '10000000-0000-0000-0000-000000000002', 'Outro Operador');

insert into public.pesquisa_evasao_previews (
  id, evasao_id, unidade_id, usuario_id, auth_user_id, template_id, caixa_id,
  destinatario_tipo, telefone_destino, mensagem_renderizada, payload_hash,
  idempotency_key, expira_em, consumido_em
)
values (
  '20000000-0000-0000-0000-000000000001', 1001,
  '30000000-0000-0000-0000-000000000001', 1,
  '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', 3, 'teste', '5521999999999',
  'Texto legado com preview', 'hash-legado',
  '50000000-0000-0000-0000-000000000001', now() + interval '10 minutes', now()
);

insert into public.pesquisa_evasao (id, preview_id, mensagem_renderizada)
values
  ('60000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Texto legado com preview'),
  ('60000000-0000-0000-0000-000000000002', null, 'Pesquisa sem preview');

-- Claim legado deliberadamente minimo: o teste prova que a RPC nova delega,
-- preserva a assinatura antiga e copia a auditoria na mesma transacao.
create or replace function public.claim_pesquisa_evasao_preview(
  p_preview_id uuid,
  p_auth_user_id uuid
)
returns table (
  pesquisa_id uuid,
  preview_id uuid,
  evasao_id integer,
  aluno_id integer,
  unidade_id uuid,
  modo_teste boolean,
  destinatario_tipo text,
  aluno_nome text,
  aluno_curso text,
  aluno_professor text,
  tempo_permanencia_meses integer,
  data_evasao date,
  motivo_cadastrado text,
  telefone_destino text,
  mensagem_renderizada text,
  caixa_id integer,
  idempotency_key uuid,
  envio_status text,
  provider_message_id text,
  executado_por_usuario_id integer,
  executado_por_auth_user_id uuid,
  assinatura_id uuid,
  assinatura_nome text,
  template_id uuid,
  template_versao integer,
  deve_despachar boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_preview public.pesquisa_evasao_previews%rowtype;
  v_pesquisa_id uuid;
  v_dispatch boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PESQUISA_EVASAO_ACESSO_NEGADO' using errcode = '42501';
  end if;

  select * into v_preview
  from public.pesquisa_evasao_previews
  where id = p_preview_id
  for update;

  if not found then
    raise exception 'PESQUISA_EVASAO_PREVIEW_NAO_ENCONTRADA';
  end if;
  if v_preview.auth_user_id is distinct from p_auth_user_id then
    raise exception 'PESQUISA_EVASAO_PREVIEW_AUTOR_INVALIDO' using errcode = '42501';
  end if;

  select pe.id into v_pesquisa_id
  from public.pesquisa_evasao pe
  where pe.preview_id = p_preview_id;

  if v_pesquisa_id is null then
    v_pesquisa_id := gen_random_uuid();
    update public.pesquisa_evasao_previews
    set consumido_em = clock_timestamp()
    where id = p_preview_id;
    insert into public.pesquisa_evasao(id, preview_id, mensagem_renderizada)
    values (v_pesquisa_id, p_preview_id, v_preview.mensagem_renderizada);
    v_dispatch := true;
  else
    v_dispatch := false;
  end if;

  return query select
    v_pesquisa_id, v_preview.id, v_preview.evasao_id, 9001,
    v_preview.unidade_id, v_preview.modo_teste, v_preview.destinatario_tipo,
    'Aluno Fixture'::text, 'Curso'::text, 'Professor'::text, 6,
    current_date, 'Motivo'::text, v_preview.telefone_destino,
    (select pp.mensagem_renderizada from public.pesquisa_evasao_previews pp where pp.id = p_preview_id),
    v_preview.caixa_id, v_preview.idempotency_key, 'enviando'::text, null::text,
    v_preview.usuario_id, v_preview.auth_user_id, v_preview.assinatura_id,
    'Equipe LA'::text, v_preview.template_id, 2, v_dispatch;
end
$$;

revoke all on function public.claim_pesquisa_evasao_preview(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_pesquisa_evasao_preview(uuid, uuid)
  to service_role;

\ir /workspace/supabase/migrations/20260803220000_pesquisa_evasao_preview_editavel.sql

create or replace function public.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end
$$;

select public.assert_true(
  (select mensagem_template_original = 'Texto legado com preview'
          and payload_hash_original = 'hash-legado'
   from public.pesquisa_evasao_previews
   where id = '20000000-0000-0000-0000-000000000001'),
  'backfill da preview legada falhou'
);
select public.assert_true(
  (select mensagem_template_original_snapshot = 'Texto legado com preview'
          and payload_hash_original_snapshot = 'hash-legado'
          and payload_hash_snapshot = 'hash-legado'
   from public.pesquisa_evasao
   where id = '60000000-0000-0000-0000-000000000001'),
  'backfill da pesquisa vinculada falhou'
);
select public.assert_true(
  (select mensagem_template_original_snapshot is null
          and payload_hash_original_snapshot is null
          and mensagem_editada = false
   from public.pesquisa_evasao
   where id = '60000000-0000-0000-0000-000000000002'),
  'linha sem preview recebeu auditoria inventada'
);

-- Reaplicacao precisa preservar o backfill e as constraints validadas.
\ir /workspace/supabase/migrations/20260803220000_pesquisa_evasao_preview_editavel.sql
select public.assert_true(
  (select count(*) = 2
   from pg_constraint
   where conrelid = 'public.pesquisa_evasao_previews'::regclass
     and conname in (
       'pesquisa_evasao_previews_mensagem_editavel_check',
       'pesquisa_evasao_previews_auditoria_edicao_check'
     )
     and convalidated),
  'reaplicacao nao preservou constraints validadas'
);

-- A Edge anterior continua inserindo durante a janela entre migration e deploy.
insert into public.pesquisa_evasao_previews (
  id, evasao_id, unidade_id, usuario_id, auth_user_id, template_id, caixa_id,
  destinatario_tipo, telefone_destino, mensagem_renderizada, payload_hash,
  idempotency_key, expira_em
) values (
  '20000000-0000-0000-0000-000000000010', 1010,
  '30000000-0000-0000-0000-000000000001', 1,
  '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', 3, 'teste', '5521999999999',
  'Insercao da Edge anterior', 'hash-edge-anterior', gen_random_uuid(),
  now() + interval '10 minutes'
);
select public.assert_true(
  (select mensagem_template_original = mensagem_renderizada
          and payload_hash_original = payload_hash
   from public.pesquisa_evasao_previews
   where id = '20000000-0000-0000-0000-000000000010'),
  'migration quebrou a Edge anterior durante a janela de rollout'
);

set request.jwt.claim.role = 'service_role';

create or replace function public.criar_preview_editavel(
  p_id uuid,
  p_evasao integer,
  p_texto text,
  p_hash text
)
returns void
language sql
as $$
  insert into public.pesquisa_evasao_previews (
    id, evasao_id, unidade_id, usuario_id, auth_user_id, template_id, caixa_id,
    destinatario_tipo, telefone_destino, mensagem_renderizada, payload_hash,
    idempotency_key, expira_em, mensagem_template_original,
    payload_hash_original
  ) values (
    p_id, p_evasao, '30000000-0000-0000-0000-000000000001', 1,
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 3, 'teste', '5521999999999',
    p_texto, p_hash, gen_random_uuid(), now() + interval '10 minutes', p_texto, p_hash
  )
$$;

select public.criar_preview_editavel(
  '20000000-0000-0000-0000-000000000002', 1002, 'Texto sem edicao', 'hash-2'
);
create temporary table claim_sem_edicao as
select * from public.claim_pesquisa_evasao_preview_editavel(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Texto sem edicao', 'hash-2'
);
select public.assert_true(
  (select count(*) = 1 and bool_and(deve_despachar) from claim_sem_edicao),
  'claim sem edicao deve retornar uma linha e autorizar despacho'
);
select public.assert_true(
  (select mensagem_editada = false
          and editado_por_usuario_id is null
          and editado_por_auth_user_id is null
          and editado_em is null
   from public.pesquisa_evasao_previews
   where id = '20000000-0000-0000-0000-000000000002'),
  'texto intacto inventou editor'
);

select public.criar_preview_editavel(
  '20000000-0000-0000-0000-000000000003', 1003, 'Texto original', 'hash-3-original'
);
create temporary table claim_editado as
select * from public.claim_pesquisa_evasao_preview_editavel(
  '20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'Texto final aprovado', 'hash-3-final'
);
select public.assert_true(
  (select count(*) = 1 and bool_and(deve_despachar) from claim_editado),
  'claim editado deve retornar uma linha e autorizar despacho'
);
select public.assert_true(
  (select mensagem_template_original = 'Texto original'
          and mensagem_renderizada = 'Texto final aprovado'
          and mensagem_editada
          and editado_por_usuario_id = 1
          and editado_por_auth_user_id = '10000000-0000-0000-0000-000000000001'
          and editado_em is not null
   from public.pesquisa_evasao_previews
   where id = '20000000-0000-0000-0000-000000000003'),
  'preview editada perdeu original, final ou autor'
);
select public.assert_true(
  (select mensagem_template_original_snapshot = 'Texto original'
          and mensagem_renderizada = 'Texto final aprovado'
          and mensagem_editada
          and mensagem_editada_por_usuario_id = 1
          and payload_hash_original_snapshot = 'hash-3-original'
          and payload_hash_snapshot = 'hash-3-final'
   from public.pesquisa_evasao
   where preview_id = '20000000-0000-0000-0000-000000000003'),
  'pesquisa nao recebeu os snapshots da edicao'
);

create temporary table claim_repetido as
select * from public.claim_pesquisa_evasao_preview_editavel(
  '20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'Texto final aprovado', 'hash-3-final'
);
select public.assert_true(
  (select count(*) = 1 and bool_and(not deve_despachar) from claim_repetido),
  'segundo clique com o mesmo texto nao pode despachar novamente'
);

do $$
begin
  perform public.claim_pesquisa_evasao_preview_editavel(
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Outra versao', 'outro-hash'
  );
  raise exception 'ASSERTION FAILED: texto divergente foi aceito';
exception
  when serialization_failure then null;
end
$$;

create or replace function public.falhar_claim_fixture()
returns trigger
language plpgsql
as $$
begin
  if new.preview_id = '20000000-0000-0000-0000-000000000004' then
    raise exception 'FALHA_POSTERIOR_FIXTURE';
  end if;
  return new;
end
$$;
create trigger falhar_claim_fixture
before insert on public.pesquisa_evasao
for each row execute function public.falhar_claim_fixture();
select public.criar_preview_editavel(
  '20000000-0000-0000-0000-000000000004', 1004, 'Original rollback', 'hash-4'
);
do $$
begin
  perform public.claim_pesquisa_evasao_preview_editavel(
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'Final que deve reverter', 'hash-4-final'
  );
  raise exception 'ASSERTION FAILED: trigger de rollback nao disparou';
exception
  when others then
    if sqlerrm <> 'FALHA_POSTERIOR_FIXTURE' then
      raise;
    end if;
end
$$;
select public.assert_true(
  (select mensagem_renderizada = 'Original rollback'
          and payload_hash = 'hash-4'
          and mensagem_editada = false
          and editado_em is null
          and consumido_em is null
   from public.pesquisa_evasao_previews
   where id = '20000000-0000-0000-0000-000000000004'),
  'excecao posterior nao reverteu texto, hash e auditoria'
);
drop trigger falhar_claim_fixture on public.pesquisa_evasao;

select public.assert_true(
  has_function_privilege(
    'service_role',
    'public.claim_pesquisa_evasao_preview_editavel(uuid,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.claim_pesquisa_evasao_preview_editavel(uuid,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.claim_pesquisa_evasao_preview_editavel(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'ACL da RPC editavel nao e service-only'
);
select public.assert_true(
  to_regprocedure('public.claim_pesquisa_evasao_preview(uuid,uuid)') is not null
  and has_function_privilege(
    'service_role', 'public.claim_pesquisa_evasao_preview(uuid,uuid)', 'EXECUTE'
  ),
  'claim legado foi removido ou perdeu acesso do service_role'
);

\echo PESQUISA_EVASAO_PREVIEW_EDITAVEL_PG17_OK
rollback;
