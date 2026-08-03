-- Lia / Fase A: outbox privada, governada e bloqueada por padrao.
-- Esta migration nao instala worker, nao envia WhatsApp e nao libera alertas
-- produtivos. A liberacao so pode existir em migration posterior ao piloto.

create table public.lia_destinos_privados (
  id uuid primary key default gen_random_uuid(),
  usuario_id integer not null references public.usuarios(id),
  canal text not null default 'whatsapp'
    check (canal = 'whatsapp'),
  destino_normalizado text not null
    check (destino_normalizado ~ '^[0-9]{12,15}$'),
  fonte_verificacao text not null,
  verificado_em timestamptz not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  desativado_em timestamptz,
  check ((ativo and desativado_em is null) or not ativo)
);

create unique index lia_destinos_privados_usuario_ativo_uidx
  on public.lia_destinos_privados (usuario_id, canal)
  where ativo;

create table public.lia_alertas_configuracao (
  id smallint primary key default 1 check (id = 1),
  app_base_url text not null
    check (app_base_url ~ '^https://'),
  alertas_producao_liberados boolean not null default false,
  atualizado_em timestamptz not null default now()
);

create table public.lia_pesquisa_eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'resposta_nova',
    'rodada_nova_pos_revisao',
    'opt_out'
  )),
  ambiente text not null check (ambiente in ('producao', 'teste')),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  analise_versao integer not null check (analise_versao > 0),
  operador_usuario_id integer references public.usuarios(id),
  aluno_nome_snapshot text not null,
  unidade_id uuid not null references public.unidades(id),
  unidade_nome_snapshot text not null,
  ocorrido_em timestamptz not null,
  idempotency_key text not null unique,
  criado_em timestamptz not null default now()
);

create unique index lia_pesquisa_eventos_resposta_rodada_uidx
  on public.lia_pesquisa_eventos (
    pesquisa_id,
    analise_versao,
    ambiente
  )
  where tipo in ('resposta_nova', 'rodada_nova_pos_revisao');

create unique index lia_pesquisa_eventos_opt_out_rodada_uidx
  on public.lia_pesquisa_eventos (
    pesquisa_id,
    analise_versao,
    ambiente
  )
  where tipo = 'opt_out';

create table public.lia_alertas_privados (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null unique
    references public.lia_pesquisa_eventos(id),
  destinatario_usuario_id integer references public.usuarios(id),
  destino_id uuid references public.lia_destinos_privados(id),
  destino_snapshot text,
  template_codigo text not null,
  template_versao integer not null default 1 check (template_versao > 0),
  mensagem_renderizada text,
  status text not null check (status in (
    'aguardando_liberacao',
    'pendente',
    'processando',
    'enviado',
    'falha',
    'resultado_ambiguo',
    'fila_administrativa'
  )),
  motivo_pendencia text,
  tentativas integer not null default 0 check (tentativas >= 0),
  worker_id uuid,
  claim_token uuid,
  claimed_em timestamptz,
  provider_message_id text,
  enviado_em timestamptz,
  erro_codigo text,
  expurgado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (
    status not in ('aguardando_liberacao', 'pendente', 'processando')
    or (
      destinatario_usuario_id is not null
      and destino_id is not null
      and destino_snapshot is not null
      and mensagem_renderizada is not null
    )
  )
);

create index lia_alertas_privados_claim_idx
  on public.lia_alertas_privados (status, criado_em, id)
  where status = 'pendente';

create index lia_alertas_privados_admin_idx
  on public.lia_alertas_privados (atualizado_em desc, id)
  where status in ('fila_administrativa', 'falha', 'resultado_ambiguo');

alter table public.lia_destinos_privados enable row level security;
alter table public.lia_alertas_configuracao enable row level security;
alter table public.lia_pesquisa_eventos enable row level security;
alter table public.lia_alertas_privados enable row level security;

revoke all on table public.lia_destinos_privados
  from public, anon, authenticated;
revoke all on table public.lia_alertas_configuracao
  from public, anon, authenticated;
revoke all on table public.lia_pesquisa_eventos
  from public, anon, authenticated;
revoke all on table public.lia_alertas_privados
  from public, anon, authenticated;

grant all on table public.lia_destinos_privados to service_role;
grant all on table public.lia_alertas_configuracao to service_role;
grant all on table public.lia_pesquisa_eventos to service_role;
grant all on table public.lia_alertas_privados to service_role;

do $block$
declare
  v_role text;
begin
  foreach v_role in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito',
    'maria_lareport_rpc',
    'ml_jobs'
  ] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format(
        'revoke all on table public.lia_destinos_privados, public.lia_alertas_configuracao, public.lia_pesquisa_eventos, public.lia_alertas_privados from %I',
        v_role
      );
    end if;
  end loop;
end;
$block$;

do $block$
declare
  v_usuarios_validos integer;
begin
  select count(*)
  into v_usuarios_validos
  from public.usuarios
  where id in (2, 29, 30)
    and ativo = true;

  if v_usuarios_validos <> 3 then
    raise exception
      'destinos governados exigem usuarios ativos 2, 29 e 30; encontrados %',
      v_usuarios_validos;
  end if;
end;
$block$;

insert into public.lia_destinos_privados (
  usuario_id,
  destino_normalizado,
  fonte_verificacao,
  verificado_em
) values
  (2, '5521981278047', 'decisao_alf_2026_08_02', '2026-08-02 00:00:00-03'),
  (29, '5521984695110', 'decisao_alf_2026_08_02', '2026-08-02 00:00:00-03'),
  (30, '5521994696489', 'decisao_alf_2026_08_02', '2026-08-02 00:00:00-03');

insert into public.lia_alertas_configuracao (
  id,
  app_base_url,
  alertas_producao_liberados
) values (
  1,
  'https://la-performance-report.vercel.app',
  false
);

create or replace function public.expurgar_lia_alertas_privados()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_expurgados integer;
begin
  update public.lia_alertas_privados
  set destino_snapshot = null,
      mensagem_renderizada = null,
      expurgado_em = now(),
      atualizado_em = now()
  where status in ('enviado', 'falha', 'resultado_ambiguo', 'fila_administrativa')
    and atualizado_em < now() - interval '30 days'
    and expurgado_em is null;

  get diagnostics v_expurgados = row_count;
  return v_expurgados;
end;
$function$;

revoke all on function public.expurgar_lia_alertas_privados()
  from public, anon, authenticated;
grant execute on function public.expurgar_lia_alertas_privados()
  to service_role;

do $block$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname = 'lia-alertas-privados-expurgo-diario'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'lia-alertas-privados-expurgo-diario',
    '20 6 * * *',
    'select public.expurgar_lia_alertas_privados();'
  );
end;
$block$;

comment on table public.lia_destinos_privados is
  'Destinos privados governados da Lia; nunca resolvidos de usuarios.telefone em runtime.';
comment on table public.lia_pesquisa_eventos is
  'Fatos imutaveis e sem conteudo da resposta para alertas da pesquisa de evasao.';
comment on table public.lia_alertas_privados is
  'Outbox privada da Lia. Producao nasce bloqueada ate piloto aceito pelo Alf.';
