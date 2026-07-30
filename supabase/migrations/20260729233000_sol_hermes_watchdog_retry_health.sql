-- Sol/Hermes report watchdog: retry seguro + health real da fila nativa.
-- Não envia mensagens. Só destrava/reagenda itens claramente retryáveis da fila
-- public.fila_relatorios_sol_hermes, para o worker Hermes nativo enviar no ciclo normal.

create or replace function public.sol_hermes_report_error_retryavel(p_erro text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_erro, '') ~* '(whatsapp bridge error\s*\(50[234]\)|not connected to whatsapp|not connected|connection|econn|socket|timeout|timed out|fetch failed|network|unavailable|temporar|no session|restart the session|session status|not as expected)';
$$;

create or replace function public.sol_hermes_report_watchdog(
  p_max_tentativas integer default 8,
  p_stuck_minutes integer default 5,
  p_retry_window_minutes integer default 180,
  p_max_backoff_minutes integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started_at timestamptz := now();
  v_unstuck integer := 0;
  v_retry integer := 0;
  v_pending_overdue integer := 0;
  v_stuck_enviando integer := 0;
  v_retryable_errors integer := 0;
  v_nonretry_errors integer := 0;
  v_last_sent timestamptz;
  v_status text;
begin
  -- Itens que ficaram presos em envio voltam para a fila, sem duplicar envio:
  -- só volta se ainda não há message_id/enviada_em e ainda está abaixo do teto.
  with moved as (
    update public.fila_relatorios_sol_hermes f
       set status = 'sol_pendente',
           agendada_para = v_started_at + interval '30 seconds',
           erro = coalesce(nullif(f.erro, ''), 'watchdog: destravado de sol_enviando'),
           metadata = coalesce(f.metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'watchdog_last_action', 'unstuck_sol_enviando',
                  'watchdog_last_at', v_started_at,
                  'watchdog_previous_status', 'sol_enviando'
                )
     where f.status = 'sol_enviando'
       and f.enviada_em is null
       and f.message_id is null
       and f.tentativas < p_max_tentativas
       and coalesce(f.ultima_tentativa_em, f.agendada_para, f.created_at) < v_started_at - (p_stuck_minutes::text || ' minutes')::interval
     returning 1
  )
  select count(*) into v_unstuck from moved;

  -- Erros recentes e claramente temporários voltam para sol_pendente com backoff curto.
  -- Janela curta evita reenviar relatório velho já recuperado manualmente no dia seguinte.
  with moved as (
    update public.fila_relatorios_sol_hermes f
       set status = 'sol_pendente',
           agendada_para = v_started_at + ((least(p_max_backoff_minutes, greatest(1, f.tentativas + 1)))::text || ' minutes')::interval,
           metadata = coalesce(f.metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'watchdog_last_action', 'retry_retryable_error',
                  'watchdog_last_at', v_started_at,
                  'watchdog_previous_status', 'erro',
                  'watchdog_previous_error', left(coalesce(f.erro, ''), 500)
                )
     where f.status = 'erro'
       and f.enviada_em is null
       and f.message_id is null
       and f.tentativas < p_max_tentativas
       and f.created_at >= v_started_at - (p_retry_window_minutes::text || ' minutes')::interval
       and public.sol_hermes_report_error_retryavel(f.erro)
     returning 1
  )
  select count(*) into v_retry from moved;

  select count(*)
    into v_pending_overdue
  from public.fila_relatorios_sol_hermes f
  where f.status = 'sol_pendente'
    and f.agendada_para < v_started_at - interval '10 minutes'
    and f.created_at >= v_started_at - interval '3 days';

  select count(*)
    into v_stuck_enviando
  from public.fila_relatorios_sol_hermes f
  where f.status = 'sol_enviando'
    and coalesce(f.ultima_tentativa_em, f.agendada_para, f.created_at) < v_started_at - (p_stuck_minutes::text || ' minutes')::interval
    and f.created_at >= v_started_at - interval '3 days';

  select count(*)
    into v_retryable_errors
  from public.fila_relatorios_sol_hermes f
  where f.status = 'erro'
    and f.tentativas < p_max_tentativas
    and f.created_at >= v_started_at - (p_retry_window_minutes::text || ' minutes')::interval
    and public.sol_hermes_report_error_retryavel(f.erro);

  select count(*)
    into v_nonretry_errors
  from public.fila_relatorios_sol_hermes f
  where f.status = 'erro'
    and f.created_at >= v_started_at - interval '3 days'
    and not public.sol_hermes_report_error_retryavel(f.erro);

  select max(enviada_em)
    into v_last_sent
  from public.fila_relatorios_sol_hermes
  where status = 'enviada';

  v_status := case
    when v_pending_overdue > 0 or v_stuck_enviando > 0 or v_retryable_errors > 0 then 'warning'
    else 'ok'
  end;

  return jsonb_build_object(
    'success', true,
    'status', v_status,
    'startedAt', v_started_at,
    'unstuck', v_unstuck,
    'retryScheduled', v_retry,
    'pendingOverdue', v_pending_overdue,
    'stuckSending', v_stuck_enviando,
    'retryableErrorsRemaining', v_retryable_errors,
    'nonRetryableErrorsRecent', v_nonretry_errors,
    'lastSentAt', v_last_sent,
    'note', 'Watchdog nao envia WhatsApp; apenas reabre itens Sol/Hermes seguros para retry pelo worker normal.'
  );
end;
$$;

comment on function public.sol_hermes_report_watchdog(integer, integer, integer, integer)
is 'Watchdog seguro da fila Sol/Hermes: destrava sol_enviando e reagenda erros temporarios recentes sem enviar diretamente.';

revoke all on function public.sol_hermes_report_error_retryavel(text) from public;
revoke all on function public.sol_hermes_report_watchdog(integer, integer, integer, integer) from public;
grant execute on function public.sol_hermes_report_error_retryavel(text) to authenticated, service_role;
grant execute on function public.sol_hermes_report_watchdog(integer, integer, integer, integer) to service_role;

create index if not exists idx_fila_sol_hermes_watchdog_retry
  on public.fila_relatorios_sol_hermes (created_at, agendada_para)
  where status in ('erro', 'sol_enviando', 'sol_pendente');

-- Atualiza a saúde operacional para olhar também a fila nativa Sol/Hermes.
create or replace function public.get_saude_syncs_emusys()
 returns table(sync_tipo text, unidade_id uuid, unidade_codigo text, unidade_nome text, ultima_execucao timestamp with time zone, idade_horas numeric, tolerancia_horas numeric, status_real text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with cfg as (
    select * from (values
      ('matriculas', 30::numeric),
      ('presenca',   50::numeric),
      ('professores',192::numeric),
      ('faturas',    30::numeric),
      ('relatorio_diario', 26::numeric)
    ) as t(sync_tipo, tol)
  ),
  cod as (
    select id, nome,
      case id
        when '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid then 'cg'
        when '95553e96-971b-4590-a6eb-0201d013c14d'::uuid then 'recreio'
        when '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid then 'barra'
      end as codigo
    from public.unidades
  ),
  matriculas as (
    select 'matriculas'::text as sync_tipo, j.unidade_id, max(j.ultima_sincronizacao_emusys) as ultima, null::text as forcar_status
    from public.aluno_jornada_matricula_disciplina j
    where j.fonte_ultima_atualizacao = 'sync-matriculas-emusys'
    group by j.unidade_id
  ),
  presenca as (
    select 'presenca'::text as sync_tipo, l.unidade_id, max(l.executado_em) as ultima, null::text as forcar_status
    from public.emusys_sync_log l
    group by l.unidade_id
  ),
  professores as (
    select 'professores'::text as sync_tipo, null::uuid as unidade_id, max(created_at) as ultima, null::text as forcar_status
    from public.professores_sync_log
  ),
  faturas as (
    select 'faturas'::text as sync_tipo, null::uuid as unidade_id, max(synced_at) as ultima, null::text as forcar_status
    from public.emusys_faturas
  ),
  relatorio_rows as (
    select status, created_at, agendada_para, enviada_em, tentativas
    from public.fila_relatorios_whatsapp
    union all
    select
      case
        when status = 'sol_pendente' then 'pendente'
        when status = 'sol_enviando' then 'enviando'
        else status
      end as status,
      created_at,
      agendada_para,
      enviada_em,
      tentativas
    from public.fila_relatorios_sol_hermes
  ),
  relatorio_last as (
    select max(enviada_em) filter (where status = 'enviada') as ultima
    from relatorio_rows
  ),
  relatorio_stats as (
    select
      count(*) filter (
        where status = 'falhou'
          and created_at >= greatest(coalesce((select ultima from relatorio_last), now() - interval '3 days'), now() - interval '3 days')
      ) as falhas,
      count(*) filter (
        where status in ('pendente','erro','enviando')
          and created_at >= greatest(coalesce((select ultima from relatorio_last), now() - interval '3 days'), now() - interval '3 days')
          and (tentativas >= 8 or agendada_para < now() - interval '3 hours')
      ) as presos,
      (select ultima from relatorio_last) as ultima
    from relatorio_rows
  ),
  relatorio_diario as (
    select
      'relatorio_diario'::text as sync_tipo,
      null::uuid as unidade_id,
      ultima,
      case
        when falhas > 0 or presos > 0 then 'falhou'
        when ultima is not null then 'ok'
        else null
      end as forcar_status
    from relatorio_stats
  ),
  base as (
    select sync_tipo, unidade_id, ultima, forcar_status from matriculas
    union all select sync_tipo, unidade_id, ultima, forcar_status from presenca
    union all select sync_tipo, unidade_id, ultima, forcar_status from professores
    union all select sync_tipo, unidade_id, ultima, forcar_status from faturas
    union all select sync_tipo, unidade_id, ultima, forcar_status from relatorio_diario
  )
  select
    b.sync_tipo,
    b.unidade_id,
    c.codigo as unidade_codigo,
    coalesce(c.nome, 'Global') as unidade_nome,
    b.ultima as ultima_execucao,
    case when b.ultima is null then null
         else round(extract(epoch from (now() - b.ultima))/3600.0, 1) end as idade_horas,
    cfg.tol as tolerancia_horas,
    coalesce(
      b.forcar_status,
      case
        when b.sync_tipo = 'faturas' then 'sem_cron'
        when b.ultima is null then 'nunca'
        when extract(epoch from (now() - b.ultima))/3600.0 <= cfg.tol then 'ok'
        else 'atrasado'
      end
    ) as status_real
  from base b
  left join cfg on cfg.sync_tipo = b.sync_tipo
  left join cod c on c.id = b.unidade_id;
$function$;

-- Um watchdog a cada 5 minutos cobre preflight antes dos crons 20:00/20:05 BRT
-- sem aumentar muito a pressão de jobs. Não contém token nem chamada externa.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sol-hermes-report-watchdog-5min') then
    perform cron.unschedule('sol-hermes-report-watchdog-5min');
  end if;
end $$;

select cron.schedule(
  'sol-hermes-report-watchdog-5min',
  '*/5 * * * *',
  $$select public.sol_hermes_report_watchdog();$$
);
