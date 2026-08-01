-- Automatiza o fechamento mensal: ultimo dia do mes, 22:00 BRT.
--
-- Ate 31/07/2026 o fechamento era 100% manual. Junho foi gravado a mao em 30/06
-- 23:05 BRT e julho em 31/07 21:12 BRT, ambos via SQL direto. Se ninguem lembrasse,
-- o mes virava sem retrato -- e as RPCs recalculam sobre o estado ATUAL do banco,
-- entao rodar depois da virada ja produz numero errado (nao ha como reconstruir).
--
-- FUSO: o pg_cron roda em UTC. `0 1 1 * *` (dia 1, 01:00 UTC) = ultimo dia do mes
-- anterior as 22:00 BRT, para QUALQUER mes -- 31, 30, 28 ou 29 dias. Validado em 14
-- meses consecutivos + fev/2028 e fev/2032 (bissextos): todos caem no ultimo dia as
-- 22:00 BRT. Nao e preciso saber quantos dias o mes tem; o Postgres resolve.
-- O Brasil nao tem horario de verao desde 2019 (BRT = UTC-3 fixo); ainda assim a
-- funcao revalida o dia em BRT e aborta se nao for o ultimo, entao uma eventual
-- volta do DST nao grava competencia errada -- so deixa de gravar, e o log avisa.
--
-- COMPETENCIA: as 22:00 BRT do ultimo dia, em BRT ainda e o mes corrente. Logo a
-- competencia e o mes de `now() at time zone 'America/Sao_Paulo'` -- e NAO o mes
-- anterior. Diferente de `capturar_carteira_professores_competencia_anterior`, que
-- dispara 03:30 UTC do dia 1 (= 00:30 BRT do dia 1, ja no mes seguinte).
--
-- auth.role(): `get_kpis_professor_periodo_canonico_v2` -- alcancada via
-- get_dados_relatorio_gerencial -- so libera com `auth.role() = 'service_role'`.
-- Ela NAO aceita `session_user = 'postgres'` como escape, diferente de outras
-- funcoes do sistema. O pg_cron roda como postgres com auth.role() NULL, entao sem
-- assumir o papel o fechamento falha em relatorio_gerencial. Foi exatamente o que
-- aconteceu na primeira tentativa manual de 31/07 (nada foi gravado, abortou limpo).
--
-- IDEMPOTENTE: se a competencia ja tem snapshot aprovado/fechado, retorna
-- `ja_fechado` sem erro. `gravar_snapshot_fechamento_mensal` lanca excecao nesse
-- caso, e sem esta guarda uma reexecucao encheria o log de falha.

create or replace function public.fechar_competencia_mensal_automatico()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje_brt date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ultimo_dia date;
  v_ano integer;
  v_mes integer;
  v_ja_existe integer;
  v_snapshot jsonb;
  v_compat jsonb;
begin
  v_ultimo_dia := (date_trunc('month', v_hoje_brt) + interval '1 month - 1 day')::date;

  -- Guarda de data: so roda no ultimo dia do mes em BRT. Protege contra disparo em
  -- data errada por reagendamento manual, mudanca de fuso ou execucao avulsa.
  if v_hoje_brt <> v_ultimo_dia then
    return jsonb_build_object(
      'ok', true,
      'ignorado', true,
      'motivo', 'execucao permitida apenas no ultimo dia do mes (BRT)',
      'hoje_brt', v_hoje_brt,
      'ultimo_dia_brt', v_ultimo_dia
    );
  end if;

  v_ano := extract(year from v_hoje_brt)::integer;
  v_mes := extract(month from v_hoje_brt)::integer;

  select count(*) into v_ja_existe
  from public.fechamento_mensal_snapshots s
  where s.ano = v_ano
    and s.mes = v_mes
    and s.status in ('aprovado', 'fechado');

  if v_ja_existe > 0 then
    return jsonb_build_object(
      'ok', true,
      'ja_fechado', true,
      'ano', v_ano,
      'mes', v_mes,
      'linhas_existentes', v_ja_existe
    );
  end if;

  -- Assume service_role apenas dentro desta transacao (is_local = true).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- p_confirmar_alertas = true: os alertas esperados na virada sao
  -- `dados_mensais_ausente` e `competencia_sem_registro` -- a competencia ainda nao
  -- foi materializada, o que e normal. Bloqueios continuam abortando a gravacao.
  v_snapshot := public.gravar_snapshot_fechamento_mensal(
    v_ano,
    v_mes,
    null,
    format('fechamento automatico %s/%s - cron ultimo dia 22h BRT', v_mes, v_ano),
    true
  );

  v_compat := public.atualizar_dados_mensais_por_snapshot(v_ano, v_mes, null, false);

  return jsonb_build_object(
    'ok', true,
    'ano', v_ano,
    'mes', v_mes,
    'executado_em_brt', now() at time zone 'America/Sao_Paulo',
    'snapshots_gravados', v_snapshot->'snapshot_count',
    'dados_mensais_linhas', v_compat->'linhas_atualizadas'
  );
end;
$function$;

revoke all on function public.fechar_competencia_mensal_automatico() from public, anon, authenticated;
grant execute on function public.fechar_competencia_mensal_automatico() to service_role;

comment on function public.fechar_competencia_mensal_automatico() is
  'Fechamento mensal automatico. Roda pelo cron `fechamento-mensal-automatico` (0 1 1 * * UTC = ultimo dia do mes 22:00 BRT). Idempotente; aborta se nao for o ultimo dia em BRT.';
