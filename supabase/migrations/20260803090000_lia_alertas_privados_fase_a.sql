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

create or replace function public.fn_lia_renderizar_alerta_pesquisa(
  p_tipo text,
  p_aluno_nome text,
  p_unidade_nome text
)
returns table (
  template_codigo text,
  template_versao integer,
  mensagem_renderizada text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base_url text;
  v_link text;
begin
  select rtrim(config.app_base_url, '/')
  into v_base_url
  from public.lia_alertas_configuracao config
  where config.id = 1;

  if v_base_url is null then
    raise exception 'configuracao_lia_ausente';
  end if;

  v_link := v_base_url || '/app/sucesso-aluno';
  template_versao := 1;

  case p_tipo
    when 'resposta_nova' then
      template_codigo := 'lia_evasao_resposta_nova';
      mensagem_renderizada := format(
        E'🔔 *Resposta recebida — Pesquisa de evasão*\n\nAluno: %s\nUnidade: %s\n\nA família respondeu à pesquisa que você enviou. O conteúdo permanece protegido no LA Report.\n\n👉 %s',
        p_aluno_nome,
        p_unidade_nome,
        v_link
      );
    when 'rodada_nova_pos_revisao' then
      template_codigo := 'lia_evasao_rodada_nova_pos_revisao';
      mensagem_renderizada := format(
        E'🔔 *Nova rodada após revisão*\n\nAluno: %s\nUnidade: %s\n\nA família enviou novo conteúdo depois da revisão. O caso voltou para a fila e precisa de uma nova leitura.\n\n👉 %s',
        p_aluno_nome,
        p_unidade_nome,
        v_link
      );
    when 'opt_out' then
      template_codigo := 'lia_evasao_opt_out';
      mensagem_renderizada := format(
        E'🔕 *Família recusou novos contatos — Pesquisa de evasão*\n\nAluno: %s\nUnidade: %s\n\nA família pediu para não receber novas mensagens desta pesquisa. O caso foi bloqueado para follow-up.\n\n👉 %s',
        p_aluno_nome,
        p_unidade_nome,
        v_link
      );
    else
      raise exception 'tipo_alerta_lia_invalido';
  end case;

  return next;
end;
$function$;

create or replace function public.fn_lia_criar_evento_alerta(
  p_tipo text,
  p_ambiente text,
  p_pesquisa_id uuid,
  p_analise_versao integer,
  p_operador_usuario_id integer,
  p_aluno_nome text,
  p_unidade_id uuid,
  p_unidade_nome text,
  p_ocorrido_em timestamptz,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_evento_id uuid;
  v_alerta_id uuid;
  v_usuario_ativo boolean;
  v_destino_id uuid;
  v_destino text;
  v_producao_liberada boolean;
  v_template_codigo text;
  v_template_versao integer;
  v_mensagem text;
  v_status text;
  v_motivo text;
begin
  insert into public.lia_pesquisa_eventos (
    tipo,
    ambiente,
    pesquisa_id,
    analise_versao,
    operador_usuario_id,
    aluno_nome_snapshot,
    unidade_id,
    unidade_nome_snapshot,
    ocorrido_em,
    idempotency_key
  ) values (
    p_tipo,
    p_ambiente,
    p_pesquisa_id,
    p_analise_versao,
    p_operador_usuario_id,
    p_aluno_nome,
    p_unidade_id,
    p_unidade_nome,
    p_ocorrido_em,
    p_idempotency_key
  )
  on conflict do nothing
  returning id into v_evento_id;

  if v_evento_id is null then
    return null;
  end if;

  select
    usuario.ativo,
    destino.id,
    destino.destino_normalizado
  into
    v_usuario_ativo,
    v_destino_id,
    v_destino
  from public.usuarios usuario
  left join public.lia_destinos_privados destino
    on destino.usuario_id = usuario.id
   and destino.canal = 'whatsapp'
   and destino.ativo
  where usuario.id = p_operador_usuario_id;

  select config.alertas_producao_liberados
  into v_producao_liberada
  from public.lia_alertas_configuracao config
  where config.id = 1;

  select
    render.template_codigo,
    render.template_versao,
    render.mensagem_renderizada
  into
    v_template_codigo,
    v_template_versao,
    v_mensagem
  from public.fn_lia_renderizar_alerta_pesquisa(
    p_tipo,
    p_aluno_nome,
    p_unidade_nome
  ) render;

  if not coalesce(v_usuario_ativo, false) then
    v_status := 'fila_administrativa';
    v_motivo := 'operador_inativo_ou_ausente';
  elsif v_destino_id is null then
    v_status := 'fila_administrativa';
    v_motivo := 'destino_ausente';
  elsif p_ambiente = 'teste' then
    v_status := 'pendente';
  elsif coalesce(v_producao_liberada, false) then
    v_status := 'pendente';
  else
    v_status := 'aguardando_liberacao';
  end if;

  insert into public.lia_alertas_privados (
    evento_id,
    destinatario_usuario_id,
    destino_id,
    destino_snapshot,
    template_codigo,
    template_versao,
    mensagem_renderizada,
    status,
    motivo_pendencia
  ) values (
    v_evento_id,
    p_operador_usuario_id,
    case when v_status = 'fila_administrativa' then null else v_destino_id end,
    case when v_status = 'fila_administrativa' then null else v_destino end,
    v_template_codigo,
    v_template_versao,
    case when v_status = 'fila_administrativa' then null else v_mensagem end,
    v_status,
    v_motivo
  )
  returning id into v_alerta_id;

  return v_alerta_id;
end;
$function$;

create or replace function public.fn_lia_evento_pesquisa_evasao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_modo_teste boolean;
  v_operador_usuario_id integer;
  v_aluno_nome text;
  v_unidade_id uuid;
  v_unidade_nome text;
  v_tipo text;
  v_idempotency_key text;
begin
  if new.pesquisa_id is null
     or new.analise_versao is null
     or new.direcao <> 'entrada'
     or new.resolution_status <> 'resolvida'
     or new.substantividade not in ('conteudo_substantivo', 'opt_out') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.substantividade is not distinct from new.substantividade then
    return new;
  end if;

  select
    pesquisa.modo_teste,
    pesquisa.executado_por_usuario_id,
    pesquisa.aluno_nome,
    pesquisa.unidade_id,
    unidade.nome
  into
    v_modo_teste,
    v_operador_usuario_id,
    v_aluno_nome,
    v_unidade_id,
    v_unidade_nome
  from public.pesquisa_evasao pesquisa
  join public.unidades unidade on unidade.id = pesquisa.unidade_id
  where pesquisa.id = new.pesquisa_id;

  if not found or v_modo_teste then
    return new;
  end if;

  if new.substantividade = 'opt_out' then
    v_tipo := 'opt_out';
    v_idempotency_key := format(
      'opt_out:%s:%s',
      new.pesquisa_id,
      new.analise_versao
    );
  elsif exists (
    select 1
    from public.pesquisa_evasao_analises anterior
    where anterior.pesquisa_id = new.pesquisa_id
      and anterior.versao < new.analise_versao
      and anterior.status = 'revisada'
  ) then
    v_tipo := 'rodada_nova_pos_revisao';
    v_idempotency_key := format(
      'rodada_nova_pos_revisao:%s:%s',
      new.pesquisa_id,
      new.analise_versao
    );
  else
    v_tipo := 'resposta_nova';
    v_idempotency_key := format(
      'resposta_nova:%s:%s',
      new.pesquisa_id,
      new.analise_versao
    );
  end if;

  perform public.fn_lia_criar_evento_alerta(
    v_tipo,
    'producao',
    new.pesquisa_id,
    new.analise_versao,
    v_operador_usuario_id,
    v_aluno_nome,
    v_unidade_id,
    v_unidade_nome,
    coalesce(new.provider_created_at, new.recebido_em, now()),
    v_idempotency_key
  );

  return new;
end;
$function$;

drop trigger if exists trg_lia_evento_pesquisa_evasao
  on public.pesquisa_evasao_mensagens;
create trigger trg_lia_evento_pesquisa_evasao
after insert or update of substantividade
on public.pesquisa_evasao_mensagens
for each row execute function public.fn_lia_evento_pesquisa_evasao();

revoke all on function public.fn_lia_renderizar_alerta_pesquisa(text, text, text)
  from public, anon, authenticated;
revoke all on function public.fn_lia_criar_evento_alerta(
  text, text, uuid, integer, integer, text, uuid, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.fn_lia_evento_pesquisa_evasao()
  from public, anon, authenticated;

grant execute on function public.fn_lia_renderizar_alerta_pesquisa(text, text, text)
  to service_role;
grant execute on function public.fn_lia_criar_evento_alerta(
  text, text, uuid, integer, integer, text, uuid, text, timestamptz, text
) to service_role;

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
  'Destinos privados governados da Lia; nunca resolvidos de cadastro operacional em runtime.';
comment on table public.lia_pesquisa_eventos is
  'Fatos imutaveis e sem conteudo da resposta para alertas da pesquisa de evasao.';
comment on table public.lia_alertas_privados is
  'Outbox privada da Lia. Producao nasce bloqueada ate piloto aceito pelo Alf.';
