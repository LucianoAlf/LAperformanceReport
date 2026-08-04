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

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

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
  'Fechamento mensal automatico. Roda pelo cron `fechamento-mensal-automatico` (0 1 1 * * UTC = ultimo dia do mes 22:00 BRT). Idempotente; aborta se nao for o ultimo dia em BRT.';;
