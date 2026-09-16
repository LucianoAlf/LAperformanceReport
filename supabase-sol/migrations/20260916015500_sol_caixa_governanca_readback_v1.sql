-- Leitura estreita e sanitizada do ledger shadow do Caixa.
--
-- A anon key continua sem SELECT nas tabelas. O acesso ocorre somente por esta
-- RPC security definer, autenticada pelo token opaco já usado pelo control
-- plane, com janela e volume fail-closed. Nenhum dado financeiro, texto de
-- conversa, identidade ou segredo existe nas tabelas lidas.

create or replace function public.sol_caixa_governanca_readback_v1(
  p_token_id text,
  p_access_token text,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_limite integer default 5000
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_eventos integer;
  v_resultado jsonb;
begin
  if not public.sol_governanca_writer_autorizado_v1(p_token_id, p_access_token) then
    raise exception using errcode = '42501', message = 'SOL_GOVERNANCA_READER_INVALIDO';
  end if;

  if p_inicio is null
     or p_fim is null
     or p_inicio >= p_fim
     or p_inicio < now() - interval '35 days'
     or p_fim > now() + interval '5 minutes'
     or p_fim - p_inicio > interval '3 days'
     or p_limite < 1
     or p_limite > 10000 then
    raise exception using errcode = '22023', message = 'SOL_GOVERNANCA_READER_JANELA_INVALIDA';
  end if;

  select count(*)::integer
    into v_eventos
    from public.sol_caixa_governanca_eventos_v1 e
   where e.occurred_at >= p_inicio
     and e.occurred_at < p_fim;

  if v_eventos > p_limite then
    raise exception using errcode = '54000', message = 'SOL_GOVERNANCA_READER_LIMITE_EXCEDIDO';
  end if;

  with eventos as materialized (
    select e.event_key, e.episode_id, e.event_type, e.occurred_at,
           e.unit_code, e.source, e.message_kind, e.key_id, e.details
      from public.sol_caixa_governanca_eventos_v1 e
     where e.occurred_at >= p_inicio
       and e.occurred_at < p_fim
     order by e.occurred_at, e.event_key
  ), episodios as materialized (
    select e.episode_id,
           min(e.occurred_at) as first_event_at,
           max(e.occurred_at) as last_event_at,
           count(*)::integer as event_count,
           count(*) filter (where e.event_type = 'correlation_gap')::integer as gap_count,
           exists (
             select 1
               from public.sol_caixa_governanca_eventos_v1 terminal
              where terminal.episode_id = e.episode_id
                and terminal.event_type = 'episode_closed'
           ) as closed
      from eventos e
     group by e.episode_id
  ), por_unidade as (
    select e.unit_code,
           count(distinct e.episode_id)::integer as episodes,
           count(*)::integer as events,
           count(*) filter (where e.event_type = 'episode_closed')::integer as terminal_events,
           count(*) filter (where e.event_type = 'correlation_gap')::integer as gaps
      from eventos e
     group by e.unit_code
  )
  select jsonb_build_object(
    'ok', true,
    'schema_version', 1,
    'generated_at', clock_timestamp(),
    'window', jsonb_build_object('start', p_inicio, 'end', p_fim, 'limit', p_limite),
    'counts', jsonb_build_object(
      'events', v_eventos,
      'episodes', (select count(*) from episodios),
      'closed_episodes', (select count(*) from episodios where closed),
      'open_episodes', (select count(*) from episodios where not closed),
      'gaps', (select coalesce(sum(gap_count), 0) from episodios)
    ),
    'by_unit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unit_code', u.unit_code,
        'episodes', u.episodes,
        'events', u.events,
        'terminal_events', u.terminal_events,
        'gaps', u.gaps
      ) order by u.unit_code)
      from por_unidade u
    ), '[]'::jsonb),
    'episodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'episode_id', ep.episode_id,
        'first_event_at', ep.first_event_at,
        'last_event_at', ep.last_event_at,
        'event_count', ep.event_count,
        'gap_count', ep.gap_count,
        'closed', ep.closed
      ) order by ep.first_event_at, ep.episode_id)
      from episodios ep
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_key', e.event_key,
        'episode_id', e.episode_id,
        'event_type', e.event_type,
        'occurred_at', e.occurred_at,
        'unit_code', e.unit_code,
        'source', e.source,
        'message_kind', e.message_kind,
        'key_id', e.key_id,
        'details', e.details
      ) order by e.occurred_at, e.event_key)
      from eventos e
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$function$;

revoke all on function public.sol_caixa_governanca_readback_v1(text,text,timestamptz,timestamptz,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.sol_caixa_governanca_readback_v1(text,text,timestamptz,timestamptz,integer)
  to anon, authenticated;

comment on function public.sol_caixa_governanca_readback_v1(text,text,timestamptz,timestamptz,integer) is
  'Readback sanitizado e limitado do ledger shadow do Caixa; não concede SELECT direto nem expõe payload financeiro.';
