-- M10 — Espelho das planilhas do recital no Drive (edge recital-sheets-sync)
--
-- A edge reescreve as planilhas a partir do banco. Estas 3 tabelas guardam o
-- pouco que a planilha nao sabe derivar: ONDE fica a pasta "Recital 2026" da
-- unidade, QUEM recebe a planilha geral (lista configuravel de e-mails) e o
-- resultado de cada professor (pasta/planilha criada, share feito, sem e-mail).
--
-- Ordem do ciclo (decisao do Alf): LER -> APLICAR -> REESCREVER. Na Fase 1 a
-- planilha esta protegida (so o dono edita), entao "aplicar" e so deteccao:
-- a edge le a aba, conta divergencias contra o que vai escrever (alguem editou
-- por fora?) e loga — nunca aceita edicao de planilha como verdade. Na Fase 2
-- a mesma ordem passa a aplicar os campos editaveis antes de reescrever.

create table if not exists public.evento_sheets_destino (
  id                    bigint generated always as identity primary key,
  evento_id             bigint not null unique references public.evento(id) on delete cascade,
  unidade_id            uuid not null references public.unidades(id),
  -- pasta "Recital 2026" da unidade (Barra: 11Gb_klDaisjWlTyeF_YvwjLG57aMeAOK).
  -- NULL = a edge resolve pela cadeia Raiz → <nome da unidade> → "Recital 2026"
  -- (cria se faltar) e cacheia aqui — ninguem precisa caçar id de pasta a mao.
  pasta_recital_id      text,
  -- e-mails da equipe da unidade que recebem a planilha geral (acesso explicito,
  -- NAO por heranca de pasta — a pasta da unidade hoje so tem o dono)
  emails_equipe         text[] not null default '{}',
  -- preenchidos pela edge na 1a corrida
  planilha_geral_id     text,
  ativo                 boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.evento_sheets_destino is
  'Configuracao do espelho Sheets por evento: pasta "Recital 2026" da unidade + '
  'e-mails da equipe que recebem a planilha geral. A edge recital-sheets-sync '
  'so espelha eventos com uma linha aqui.';

create table if not exists public.evento_sheets_professor (
  id                    bigint generated always as identity primary key,
  evento_id             bigint not null references public.evento(id) on delete cascade,
  professor_id          integer not null references public.professores(id),
  unidade_id            uuid not null references public.unidades(id),
  pasta_id              text,        -- pasta do professor (criada pela edge se faltar)
  planilha_id           text,        -- planilha "Meus alunos"
  email                 text,        -- e-mail usado no share (snapshot; usuarios.email)
  status                text not null default 'pendente'
    check (status in ('pendente', 'ok', 'sem_email', 'erro')),
  ultimo_erro           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (evento_id, professor_id)
);
comment on table public.evento_sheets_professor is
  'Estado do espelho por professor: pasta/planilha criadas, e-mail do share e o '
  'ultimo erro. sem_email = professor sem usuarios.email vinculado — a equipe '
  'cadastra e a proxima corrida resolve.';

create table if not exists public.evento_sheets_corrida (
  id                    bigint generated always as identity primary key,
  evento_id             bigint not null references public.evento(id) on delete cascade,
  unidade_id            uuid not null references public.unidades(id),
  origem                text not null default 'cron' check (origem in ('cron', 'manual')),
  iniciado_em           timestamptz not null default now(),
  duracao_ms            integer,
  planilhas_escritas    integer not null default 0,
  professores_ok        integer not null default 0,
  divergencias_lidas    integer not null default 0,  -- celulas diferentes na leitura previa
  erros                 jsonb not null default '[]'::jsonb
);
comment on table public.evento_sheets_corrida is
  'Uma linha por ciclo do recital-sheets-sync — auditoria operacional da equipe '
  '(a audit_log cobre dado de aluno; isto cobre a saude do sync em si).';

-- RLS: mesma regra das tabelas irmaes — unidade propria ou admin
alter table public.evento_sheets_destino   enable row level security;
alter table public.evento_sheets_professor enable row level security;
alter table public.evento_sheets_corrida   enable row level security;

create policy evento_sheets_destino_escopo on public.evento_sheets_destino
  for all using (is_admin() or unidade_id in (select get_user_unidade_ids()))
  with check (is_admin() or unidade_id in (select get_user_unidade_ids()));
create policy evento_sheets_professor_escopo on public.evento_sheets_professor
  for all using (is_admin() or unidade_id in (select get_user_unidade_ids()))
  with check (is_admin() or unidade_id in (select get_user_unidade_ids()));
create policy evento_sheets_corrida_escopo on public.evento_sheets_corrida
  for all using (is_admin() or unidade_id in (select get_user_unidade_ids()))
  with check (is_admin() or unidade_id in (select get_user_unidade_ids()));

-- updated_at automatico (mesmo padrao das tabelas do evento)
create trigger trg_evento_sheets_destino_touch
  before update on public.evento_sheets_destino
  for each row execute function public.fn_evento_touch();
create trigger trg_evento_sheets_professor_touch
  before update on public.evento_sheets_professor
  for each row execute function public.fn_evento_touch();

-- auditoria no audit_log existente (origem = quem chamou a edge)
create trigger trg_audit_evento_sheets_destino
  after insert or update or delete on public.evento_sheets_destino
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_sheets_professor
  after insert or update or delete on public.evento_sheets_professor
  for each row execute function public.fn_evento_audit_log();

-- ─────────── cron: a cada 15 min, fora do minuto cheio ───────────
-- Mesmo segredo da familia recital (recital_drive_edge_token, validado pela RPC
-- validar_token_recital_drive_v1) — uma credencial de sync interno por contexto.
do $do$
declare
  v_command text;
begin
  if exists (select 1 from cron.job where jobname = 'recital-sheets-sync') then
    perform cron.unschedule('recital-sheets-sync');
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets where name = 'recital_drive_edge_token'
  ) then
    raise notice 'Cron recital-sheets-sync nao criado: secret recital_drive_edge_token ausente no Vault.';
    return;
  end if;

  v_command := $cron$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/recital-sheets-sync',
      headers := jsonb_build_object(
        'x-sync-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'recital_drive_edge_token'
          limit 1
        ),
        'Content-Type', 'application/json'
      ),
      body := '{"origem":"cron"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$;

  perform cron.schedule('recital-sheets-sync', '4,19,34,49 * * * *', v_command);
end;
$do$;
