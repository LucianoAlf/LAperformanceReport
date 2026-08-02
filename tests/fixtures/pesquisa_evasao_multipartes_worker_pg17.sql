\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create function auth.role()
returns text language sql stable
as $$ select current_setting('request.jwt.claim.role', true) $$;

create schema vault;
create table vault.decrypted_secrets (
  name text primary key,
  decrypted_secret text
);
insert into vault.decrypted_secrets values
  ('sync_presenca_edge_token', 'fixture-token-interno');

create schema cron;
create table cron.job (
  jobid bigserial primary key,
  jobname text unique not null,
  schedule text not null,
  command text not null
);
create function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into cron.job(jobname, schedule, command)
  values (p_name, p_schedule, p_command)
  returning jobid into v_id;
  return v_id;
end;
$$;
create function cron.unschedule(p_name text)
returns boolean language plpgsql as $$
begin
  delete from cron.job where jobname = p_name;
  return found;
end;
$$;

create table public.whatsapp_caixas (id integer primary key);
insert into public.whatsapp_caixas values (3);

create table public.pesquisa_evasao (
  id uuid primary key default gen_random_uuid(),
  modo_teste boolean not null default false,
  caixa_id integer references public.whatsapp_caixas(id),
  telefone_destino_snapshot text,
  envio_status text not null default 'enviado',
  resposta_status text not null default 'sem_resposta',
  enviado_em timestamptz not null default now(),
  status text not null default 'enviado',
  resposta_texto text,
  resposta_tipo text,
  respondido_em timestamptz,
  pronta_para_revisao_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pesquisa_evasao_mensagens (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid references public.pesquisa_evasao(id),
  caixa_id integer not null references public.whatsapp_caixas(id),
  direcao text not null,
  provider_message_id text,
  telefone_normalizado text not null,
  tipo text not null,
  texto text,
  audio_storage_path text,
  provider_created_at timestamptz,
  recebido_em timestamptz not null default now(),
  resolution_status text not null default 'pendente',
  substantividade text not null default 'pendente',
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key uuid not null unique default gen_random_uuid(),
  criado_em timestamptz not null default now()
);

create table public.pesquisa_evasao_transcricoes (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.pesquisa_evasao_mensagens(id),
  versao integer not null check (versao > 0),
  status text not null default 'pendente',
  texto text,
  erro_codigo text,
  modelo text,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz,
  unique (mensagem_id, versao)
);

create table public.pesquisa_evasao_analises (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  versao integer not null check (versao > 0),
  texto_consolidado text,
  status text not null default 'rascunho',
  revisor_usuario_id integer,
  revisado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (pesquisa_id, versao)
);

\ir ../../supabase/migrations/20260801190000_pesquisa_evasao_multipartes_constraints.sql

insert into public.pesquisa_evasao (
  id, caixa_id, telefone_destino_snapshot, resposta_ingestao_versao
) values (
  '10000000-0000-4000-8000-000000000001', 3, '5521999990001', 'multipartes_v2'
), (
  '10000000-0000-4000-8000-000000000002', 3, '5521999990002', 'legado_v1'
), (
  '10000000-0000-4000-8000-000000000003', 3, '5521999990003', 'multipartes_v2'
);
update public.pesquisa_evasao
set resposta_status = 'pronta_para_revisao'
where id = '10000000-0000-4000-8000-000000000003';

\ir ../../supabase/migrations/20260801191500_pesquisa_evasao_consolidacao_worker.sql

insert into public.pesquisa_evasao_mensagens (
  pesquisa_id, caixa_id, direcao, provider_message_id,
  telefone_normalizado, tipo, texto, resolution_status, substantividade
) values (
  '10000000-0000-4000-8000-000000000001', 3, 'entrada', 'provider-v2-1',
  '5521999990001', 'texto', 'conteúdo válido', 'resolvida', 'conteudo_substantivo'
), (
  '10000000-0000-4000-8000-000000000002', 3, 'entrada', 'provider-v1-1',
  '5521999990002', 'texto', 'legado intacto', 'resolvida', 'conteudo_substantivo'
);

do $$
declare
  v_total integer;
  v_delay numeric;
begin
  select count(*), extract(epoch from min(executar_apos) - now())
  into v_total, v_delay
  from public.pesquisa_evasao_processamento;
  if v_total <> 1 or v_delay < 55 or v_delay > 65 then
    raise exception 'fila inicial incorreta: total %, delay %', v_total, v_delay;
  end if;
end;
$$;

update public.pesquisa_evasao_processamento set executar_apos = now() - interval '1 second';
set request.jwt.claim.role = 'service_role';
do $$
declare v_total integer;
begin
  select count(*) into v_total
  from public.claim_pesquisas_evasao_processamento(gen_random_uuid(), 25);
  if v_total <> 1 then
    raise exception 'claim deveria retornar uma linha, retornou %', v_total;
  end if;
end;
$$;
reset request.jwt.claim.role;

insert into public.pesquisa_evasao_transcricoes (mensagem_id, versao, status)
select id, 1, 'pendente'
from public.pesquisa_evasao_mensagens
where provider_message_id = 'provider-v2-1';
update public.pesquisa_evasao_transcricoes
set status = 'concluida', texto = 'transcrição concluída'
where versao = 1;

do $$
begin
  if not exists (
    select 1 from public.pesquisa_evasao_processamento
    where pesquisa_id = '10000000-0000-4000-8000-000000000001'
      and locked_at is null
      and motivo = 'transcricao_finalizada'
  ) then
    raise exception 'transcrição não reagendou a conversa';
  end if;
  if (select count(*) from cron.job where jobname = 'processar-conversa-evasao-cada-minuto') <> 1 then
    raise exception 'cron interno não foi criado de forma única';
  end if;
end;
$$;

\ir ../../supabase/migrations/20260801192000_pesquisa_evasao_opt_out.sql

do $$
begin
  if not (select resposta_valida from public.pesquisa_evasao
          where id = '10000000-0000-4000-8000-000000000003') then
    raise exception 'backfill não preservou resposta válida preexistente';
  end if;
  if (select resposta_ingestao_versao from public.pesquisa_evasao
      where id = '10000000-0000-4000-8000-000000000002') <> 'legado_v1' then
    raise exception 'migration ativou multipartes indevidamente';
  end if;
end;
$$;

insert into public.pesquisa_evasao_mensagens (
  pesquisa_id, caixa_id, direcao, provider_message_id,
  telefone_normalizado, tipo, texto, resolution_status, substantividade
) values (
  '10000000-0000-4000-8000-000000000001', 3, 'entrada', 'provider-optout-1',
  '5521999990001', 'texto', 'não me mande mais mensagens', 'resolvida', 'opt_out'
);

do $$
begin
  if not exists (
    select 1 from public.pesquisa_evasao
    where id = '10000000-0000-4000-8000-000000000001'
      and resposta_status = 'recusada_opt_out'
      and resposta_valida = false
      and opt_out_provider_message_id = 'provider-optout-1'
      and opt_out_em is not null
  ) then
    raise exception 'opt-out não foi persistido corretamente';
  end if;
  if exists (
    select 1 from public.pesquisa_evasao_processamento
    where pesquisa_id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'opt-out permaneceu na fila de análise';
  end if;
end;
$$;

do $$
begin
  begin
    update public.pesquisa_evasao
    set resposta_status = 'coletando'
    where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'proteção de opt-out não bloqueou reabertura';
  exception
    when others then
      if sqlerrm not like '%pesquisa_evasao_opt_out%' then
        raise;
      end if;
  end;
end;
$$;

select 'PESQUISA_EVASAO_MULTIPARTES_WORKER_PG17_OK';
