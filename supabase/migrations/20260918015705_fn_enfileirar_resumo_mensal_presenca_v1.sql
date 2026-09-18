-- Enfileira o resumo MENSAL de presenca para os destinatarios do tipo
-- 'presenca_resumo_mensal'. Mesmo padrao do diario: dry_run por default,
-- idempotencia por (tipo, jid, data_dia) e rota escolhida pelo destinatario
-- (caixa_id null = bridge nativa da Sol; preenchido = envio pela caixa).
--
-- TROCA ATOMICA: quando p_desativar_diario e true e o enfileiramento deu certo,
-- desativa o destinatario do consolidado DIARIO com o mesmo jid. A ordem importa:
-- se o insert falhar, nada e desativado e a Fabi continua recebendo o diario.
-- Nunca desativa em dry_run.
create or replace function public.fn_enfileirar_resumo_mensal_presenca_v1(
  p_ano integer default null,
  p_mes integer default null,
  p_dry_run boolean default true,
  p_desativar_diario boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_ano integer;
  v_mes integer;
  v_competencia date;
  v_txt text;
  v_d record;
  v_id bigint;
  v_out jsonb := '[]'::jsonb;
  v_enfileirou boolean := false;
  v_desativados integer := 0;
begin
  -- default: mes anterior ao de hoje (BRT), que e o caso do cron do dia 1
  if p_ano is null or p_mes is null then
    v_competencia := date_trunc('month',
      ((now() at time zone 'America/Sao_Paulo')::date - interval '1 month'))::date;
    v_ano := extract(year from v_competencia)::integer;
    v_mes := extract(month from v_competencia)::integer;
  else
    v_ano := p_ano;
    v_mes := p_mes;
    v_competencia := make_date(v_ano, v_mes, 1);
  end if;

  v_txt := public.fn_texto_resumo_mensal_presenca_v1(v_ano, v_mes);
  if v_txt is null or btrim(v_txt) = '' then
    return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO',
      'competencia', to_char(v_competencia, 'MM/YYYY'));
  end if;

  for v_d in
    select d.id, d.nome, d.jid, d.caixa_id
    from public.whatsapp_destinatarios_relatorio d
    where d.tipo = 'presenca_resumo_mensal' and d.ativo
    order by d.id
  loop
    if p_dry_run then
      v_out := v_out || jsonb_build_object(
        'destinatario', v_d.nome, 'jid', v_d.jid, 'caixa_id', v_d.caixa_id,
        'dry_run', true, 'tamanho_texto', length(v_txt));
      continue;
    end if;

    if exists (
      select 1 from public.fila_relatorios_sol_hermes
      where tipo_relatorio = 'presenca_resumo_mensal'
        and jid = v_d.jid
        and data_dia = v_competencia
        and status <> 'erro'
    ) then
      v_out := v_out || jsonb_build_object(
        'destinatario', v_d.nome, 'pulado', 'ja enfileirado para esta competencia');
      continue;
    end if;

    insert into public.fila_relatorios_sol_hermes
      (tipo_relatorio, origem, unidade_id, unidade_nome, jid, grupo_nome,
       texto, status, agendada_para, data_dia, tentativas, metadata)
    values
      ('presenca_resumo_mensal', 'auto_cron', null, 'Consolidado mensal',
       v_d.jid, v_d.nome, v_txt, 'sol_pendente', now(), v_competencia, 0,
       jsonb_build_object(
         'rota', case when v_d.caixa_id is null then 'sol_hermes_native' else 'uazapi_caixa' end,
         'caixa_id', v_d.caixa_id,
         'fonte', 'fn_presenca_resumo_mensal_v1',
         'competencia', to_char(v_competencia, 'MM/YYYY'),
         'regra_versao', 'presenca-resumo-mensal-v1'))
    returning id into v_id;

    v_enfileirou := true;
    v_out := v_out || jsonb_build_object(
      'destinatario', v_d.nome, 'fila_id', v_id, 'caixa_id', v_d.caixa_id,
      'tamanho_texto', length(v_txt));
  end loop;

  -- troca: so desliga o diario dela depois que o mensal entrou na fila
  if p_desativar_diario and not p_dry_run and v_enfileirou then
    update public.whatsapp_destinatarios_relatorio d
       set ativo = false
     where d.tipo = 'presenca_pendencias_consolidado'
       and d.ativo
       and d.jid in (
         select j.jid from public.whatsapp_destinatarios_relatorio j
         where j.tipo = 'presenca_resumo_mensal' and j.ativo
       );
    get diagnostics v_desativados = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'competencia', to_char(v_competencia, 'MM/YYYY'),
    'dry_run', p_dry_run,
    'enfileirou', v_enfileirou,
    'diarios_desativados', v_desativados,
    'regra_versao', 'presenca-resumo-mensal-v1',
    'destinatarios', v_out);
end;
$function$;

revoke all on function public.fn_enfileirar_resumo_mensal_presenca_v1(integer, integer, boolean, boolean) from public, anon;
grant execute on function public.fn_enfileirar_resumo_mensal_presenca_v1(integer, integer, boolean, boolean) to service_role;;
