-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 018-notificacoes-lease-e-referencia.sql
-- Camada de TRANSPORTE das notificações do Fábio: lease de verdade + chave por
-- referência. Ver o arquivo versionado em supabase/migrations/ para o cabeçalho
-- completo (bug do relógio, corte antigo/novo, catraca e os dois landmines).

drop function if exists public.fabio_claim_notificacao(integer, text, text, text, text, text);
drop function if exists public.fabio_marcar_notificacao_enviada(uuid);
drop function if exists public.fabio_marcar_notificacao_falhou(uuid, text);

alter table public.fabio_notificacoes
  add column if not exists lease_token          uuid,
  add column if not exists lease_expira_em      timestamptz,
  add column if not exists proxima_tentativa_em timestamptz,
  add column if not exists envio_recibo         text;

comment on column public.fabio_notificacoes.lease_token is
  'Dono da tentativa de entrega. Toda escrita de conclusão exige este token (spec 7.5).';
comment on column public.fabio_notificacoes.lease_expira_em is
  'Prazo do lease, carimbado NA REIVINDICAÇÃO. Antes a janela media criado_em.';
comment on column public.fabio_notificacoes.envio_recibo is
  'Id da mensagem devolvido pelo canal. Prova que saiu, independente da escrita seguinte.';

update public.fabio_notificacoes
   set lease_expira_em = coalesce(criado_em, now()) + interval '10 minutes'
 where status = 'processando' and lease_expira_em is null;

alter table public.fabio_notificacoes
  drop constraint if exists fabio_notificacoes_tipo_check;
alter table public.fabio_notificacoes
  add constraint fabio_notificacoes_tipo_check
  check (tipo = any (array[
    'briefing_matinal','pendencia_registro','experimental_nova',
    'reagendamento','outro','devolutiva_pronta','devolutiva_destinatario']));

create unique index if not exists uq_fabio_notif_por_referencia
  on public.fabio_notificacoes (referencia_tipo, referencia_id, canal)
  where referencia_tipo is not null and referencia_id is not null;

comment on index public.uq_fabio_notif_por_referencia is
  'Uma notificação por (referência, canal). Par obrigatório do ON CONFLICT de fabio_claim_notificacao_por_referencia.';

create or replace function public.fabio_claim_notificacao_por_referencia(
  p_professor_id   integer,
  p_tipo           text,
  p_categoria      text,
  p_canal          text,
  p_corpo          text,
  p_referencia_tipo text,
  p_referencia_id  text,
  p_titulo         text default null,
  p_lease_minutos  integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id    uuid;
  v_token uuid := gen_random_uuid();
begin
  if p_referencia_tipo is null or p_referencia_id is null then
    raise exception 'referencia_tipo e referencia_id são obrigatórios neste claim';
  end if;

  insert into public.fabio_notificacoes
    (professor_id, tipo, categoria, canal, corpo, titulo,
     referencia_tipo, referencia_id,
     status, tentativas, lease_token, lease_expira_em)
  values
    (p_professor_id, p_tipo, p_categoria, p_canal, p_corpo, p_titulo,
     p_referencia_tipo, p_referencia_id,
     'processando', 1, v_token, now() + make_interval(mins => p_lease_minutos))
  on conflict (referencia_tipo, referencia_id, canal)
    where referencia_tipo is not null and referencia_id is not null
  do update set
    status               = 'processando',
    tentativas           = fabio_notificacoes.tentativas + 1,
    corpo                = excluded.corpo,
    titulo               = excluded.titulo,
    lease_token          = excluded.lease_token,
    lease_expira_em      = excluded.lease_expira_em,
    last_error           = null
  where
    (fabio_notificacoes.status = 'falhou'
      and (fabio_notificacoes.proxima_tentativa_em is null
           or fabio_notificacoes.proxima_tentativa_em <= now()))
    or (fabio_notificacoes.status = 'processando'
      and fabio_notificacoes.lease_expira_em is not null
      and fabio_notificacoes.lease_expira_em < now())
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', true, 'claimed', false);
  end if;
  return jsonb_build_object('ok', true, 'claimed', true,
                            'notificacao_id', v_id, 'lease_token', v_token);
end;
$function$;

comment on function public.fabio_claim_notificacao_por_referencia is
  'Claim de notificação chaveada por referência (ex.: uma devolutiva). Devolve lease_token — quem conclui precisa dele.';

create or replace function public.fabio_claim_notificacao(
  p_professor_id integer,
  p_tipo         text,
  p_categoria    text,
  p_canal        text,
  p_corpo        text,
  p_titulo       text default null,
  p_com_token    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id    uuid;
  v_token uuid := case when p_com_token then gen_random_uuid() else null end;
begin
  insert into public.fabio_notificacoes
    (professor_id, tipo, categoria, canal, corpo, titulo, status, tentativas,
     lease_token, lease_expira_em)
  values
    (p_professor_id, p_tipo, p_categoria, p_canal, p_corpo, p_titulo, 'processando', 1,
     v_token, now() + interval '10 minutes')
  on conflict (professor_id, tipo, dia_referencia, canal)
    where tipo in ('briefing_matinal','pendencia_registro')
  do update set
    status          = 'processando',
    tentativas      = fabio_notificacoes.tentativas + 1,
    corpo           = excluded.corpo,
    titulo          = excluded.titulo,
    canal           = excluded.canal,
    lease_token     = excluded.lease_token,
    lease_expira_em = excluded.lease_expira_em,
    last_error      = null
  where
    (p_com_token or fabio_notificacoes.lease_token is null)
    and (
      fabio_notificacoes.status = 'falhou'
      or (fabio_notificacoes.status = 'processando'
          and fabio_notificacoes.lease_expira_em is not null
          and fabio_notificacoes.lease_expira_em < now())
    )
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', true, 'claimed', false);
  end if;
  return jsonb_build_object('ok', true, 'claimed', true,
                            'notificacao_id', v_id, 'lease_token', v_token);
end;
$function$;

create or replace function public.fabio_marcar_notificacao_enviada(
  p_notificacao_id uuid,
  p_lease_token    uuid default null,
  p_recibo         text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer;
begin
  update public.fabio_notificacoes
     set status       = 'enviada',
         enviada_em   = now(),
         envio_recibo = coalesce(p_recibo, envio_recibo)
   where id = p_notificacao_id
     and status = 'processando'
     and ((p_lease_token is null and lease_token is null)
          or (p_lease_token is not null
              and lease_token = p_lease_token
              and lease_expira_em > now()));
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;

create or replace function public.fabio_marcar_notificacao_falhou(
  p_notificacao_id uuid,
  p_erro           text,
  p_lease_token    uuid default null,
  p_backoff_segundos integer default 0
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer;
begin
  update public.fabio_notificacoes
     set status               = 'falhou',
         last_error           = p_erro,
         proxima_tentativa_em = case when p_backoff_segundos > 0
                                     then now() + make_interval(secs => p_backoff_segundos)
                                     else proxima_tentativa_em end
   where id = p_notificacao_id
     and status = 'processando'
     and ((p_lease_token is null and lease_token is null)
          or (p_lease_token is not null
              and lease_token = p_lease_token
              and lease_expira_em > now()));
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;

comment on function public.fabio_marcar_notificacao_enviada is
  'Conclui a entrega. Devolve false quando o lease não é mais do chamador — nesse caso, descartar o trabalho, não reenviar.';

grant execute on function
  public.fabio_claim_notificacao(integer, text, text, text, text, text, boolean),
  public.fabio_claim_notificacao_por_referencia(integer, text, text, text, text, text, text, text, integer),
  public.fabio_marcar_notificacao_enviada(uuid, uuid, text),
  public.fabio_marcar_notificacao_falhou(uuid, text, uuid, integer)
to service_role, fabio_agent;
