-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- CORRECAO (Alfredo pegou, 14/07): fabio_registrar_envio_notificacao marcava 'enviada' no
-- INSTANTE DO CLAIM, antes de qualquer tentativa real de envio. Se o WhatsApp/app falhar no
-- meio, a linha ja diz "enviado" — e o dedup diario bloqueia RETRY pro resto do dia. Pior que
-- duplicar: perde mensagem em silencio.
--
-- Semantica nova: processando -> enviada | falhou. O proprio STATUS funciona como lock —
-- so reclama o dia se status='falhou' (retry legitimo) ou 'processando' ha mais de 10min
-- (worker provavelmente morreu no meio). Nunca reclama 'enviada'.
alter table public.fabio_notificacoes
  add column if not exists tentativas integer not null default 1,
  add column if not exists last_error text;

alter table public.fabio_notificacoes drop constraint if exists fabio_notificacoes_status_check;
alter table public.fabio_notificacoes add constraint fabio_notificacoes_status_check
  check (status in ('processando','enviada','falhou','pulada_preferencia'));

drop function if exists public.fabio_registrar_envio_notificacao(integer,text,text,text,text,text);

-- 1) CLAIM: reserva o dia. So volta id se conseguiu (row nova, ou 'falhou'/'processando travado').
create or replace function public.fabio_claim_notificacao(
  p_professor_id integer, p_tipo text, p_categoria text, p_canal text, p_corpo text, p_titulo text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  v_id uuid;
begin
  insert into public.fabio_notificacoes
    (professor_id, tipo, categoria, canal, corpo, titulo, status, tentativas)
  values
    (p_professor_id, p_tipo, p_categoria, p_canal, p_corpo, p_titulo, 'processando', 1)
  on conflict (professor_id, tipo, dia_referencia) where tipo in ('briefing_matinal','pendencia_registro')
  do update set
    status = 'processando',
    tentativas = fabio_notificacoes.tentativas + 1,
    corpo = excluded.corpo,      -- reprocessa com conteudo fresco, nao o congelado da 1a tentativa
    titulo = excluded.titulo,
    canal = excluded.canal,
    last_error = null
  where fabio_notificacoes.status = 'falhou'
     or (fabio_notificacoes.status = 'processando' and fabio_notificacoes.criado_em < now() - interval '10 minutes')
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', true, 'claimed', false);  -- ja enviado, ou outro worker processando agora
  end if;
  return jsonb_build_object('ok', true, 'claimed', true, 'notificacao_id', v_id);
end;
$function$;

-- 2) marca sucesso (so depois do envio de verdade ter confirmado)
create or replace function public.fabio_marcar_notificacao_enviada(p_notificacao_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.fabio_notificacoes set status='enviada', enviada_em=now()
  where id = p_notificacao_id and status = 'processando';
$$;

-- 3) marca falha (libera retry no proximo tick)
create or replace function public.fabio_marcar_notificacao_falhou(p_notificacao_id uuid, p_erro text)
returns void language sql security definer set search_path = public as $$
  update public.fabio_notificacoes set status='falhou', last_error=p_erro
  where id = p_notificacao_id and status = 'processando';
$$;

revoke all on function public.fabio_claim_notificacao(integer,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.fabio_marcar_notificacao_enviada(uuid) from public, anon, authenticated;
revoke all on function public.fabio_marcar_notificacao_falhou(uuid,text) from public, anon, authenticated;
grant execute on function public.fabio_claim_notificacao(integer,text,text,text,text,text) to service_role, fabio_agent;
grant execute on function public.fabio_marcar_notificacao_enviada(uuid) to service_role, fabio_agent;
grant execute on function public.fabio_marcar_notificacao_falhou(uuid,text) to service_role, fabio_agent;
