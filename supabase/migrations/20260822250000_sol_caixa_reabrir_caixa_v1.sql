-- `sol_caixa_reabrir_caixa_v1` — reabertura do caixa do DIA pela Sol, com autorização
-- do grupo oficial. Decisão do Alf, 2026-08-22 (~15:45), durante incidente real na Barra.
--
-- O INCIDENTE: às 15:30 o Arthur respondeu "pode" ao preview de fechamento e o caixa de
-- 22/08 fechou — com o expediente ainda rolando. Às 15:36 a Krissya mandou um comprovante
-- real (Ethan, R$ 460 pix); a Sol recusou ("caixa não está aberto"), a Krissya autorizou
-- reabrir, e a Sol — CORRETAMENTE — consultou antes de mexer, tentou a rotina interna,
-- recebeu permission denied para o papel dela e RECUSOU contornar com SQL direto.
-- A capability não existia: a spec V3 de abrir/fechar deixou reabertura explicitamente
-- fora de escopo ("fluxo humano usa caixa_reaberturas_log") — e a realidade cobrou no
-- mesmo dia. Fechamento acidental é evento normal da operação; reabrir não pode ser
-- cirurgia de admin.
--
-- POLÍTICA (decisão do Alf): qualquer membro do GRUPO FINANCEIRO OFICIAL pode autorizar
-- abrir, fechar e REABRIR — é o caminho `sol_caixa_autorizar_payload_v1` → grupo oficial
-- mapeado + policy `autoriza_qualquer_membro`. Fora do grupo oficial, fail-closed.
--
-- GUARDAS:
--   - motivo OBRIGATÓRIO (vai para caixa_reaberturas_log, que já guarda snapshot
--     completo do caixa e das movimentações no momento da reabertura);
--   - só o caixa do PRÓPRIO DIA (BRT) — reabrir dia anterior continua manual/admin
--     (mexer no passado conversa com fechamento retroativo e relatórios já enviados);
--   - advisory xact lock por unidade+data (mesmo padrão do abrir/fechar V3);
--   - limpa fechado_em/fechado_por/saldo_final_conferido (a CHECK
--     caixas_diarios_fechamento_consistente exige coerência — provado em 22/08 de manhã);
--   - auditoria em sol_caixa_lancamento_auditoria (resultado 'reaberto').
--
-- ⚠️ NOTA PARA O RUNTIME V3 DE ABRIR/FECHAR (Alfredo, antes do deploy de segunda):
-- o ledger `sol_caixa_v3_caixa_operacoes_v1` tem UNIQUE (unidade, data, operacao).
-- Depois de uma reabertura, um `fechar_v3` devolveria o resultado ANTIGO pela
-- idempotência em vez de fechar de novo. Hoje não afeta (o fechamento corrente é pelo
-- trilho legado); ao levar reabertura para o V3, a idempotência precisa considerar a
-- geração da reabertura (ex.: incluir reaberturas_count na chave ou validar status).

create or replace function public.sol_caixa_reabrir_caixa_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data_caixa','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_motivo text := nullif(btrim(p_payload->>'motivo'),'');
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_reaberto_por text := coalesce(nullif(btrim(p_payload->>'autorizado_por'),''), 'Sol (grupo oficial)');
  v_auth jsonb;
  v_caixa public.caixas_diarios%rowtype;
  v_movs jsonb;
begin
  if v_unidade is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_invalida');
  elsif v_motivo is null or length(v_motivo) < 5 then
    return jsonb_build_object('ok', false, 'motivo', 'motivo_obrigatorio');
  elsif v_data <> v_hoje then
    return jsonb_build_object('ok', false, 'motivo', 'reabertura_so_do_dia_corrente',
      'detalhe', 'reabrir dia anterior e operacao manual/admin');
  end if;

  v_auth := public.sol_caixa_autorizar_payload_v1(v_unidade, p_payload, 'reabrir_caixa');
  if not coalesce((v_auth->>'autorizado')::boolean, false) then
    insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,unidade_id,data_caixa,payload,resultado,motivo)
    values (v_num, v_papel, coalesce(p_payload->>'grupo_jid',p_payload->>'chat_id'), v_unidade, v_data, p_payload, 'recusado', 'reabrir_nao_autorizado');
    return jsonb_build_object('ok', false, 'motivo', 'reabrir_nao_autorizado', 'auth', v_auth);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_unidade::text || ':' || v_data::text || ':reabrir', 0));

  select * into v_caixa from public.caixas_diarios
  where unidade_id = v_unidade and data_caixa = v_data
  for update;

  if v_caixa.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'caixa_inexistente_no_dia');
  elsif v_caixa.status = 'aberto' then
    return jsonb_build_object('ok', true, 'ja_aberto', true, 'caixa_diario_id', v_caixa.id,
      'saldo_inicial', v_caixa.saldo_inicial_cofre);
  elsif v_caixa.status <> 'fechado' then
    return jsonb_build_object('ok', false, 'motivo', 'status_inesperado', 'status', v_caixa.status);
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) into v_movs
  from public.caixa_movimentacoes m where m.caixa_diario_id = v_caixa.id;

  insert into public.caixa_reaberturas_log(
    caixa_diario_id, unidade_id, data_caixa, motivo, reaberto_por, reaberto_em,
    fechado_em_anterior, fechado_por_anterior,
    saldo_final_conferido_anterior, saldo_final_calculado_anterior,
    observacoes_anteriores, caixa_snapshot, movimentacoes_snapshot)
  values (
    v_caixa.id, v_unidade, v_data, v_motivo, v_reaberto_por, now(),
    v_caixa.fechado_em, v_caixa.fechado_por,
    v_caixa.saldo_final_conferido, v_caixa.saldo_final_calculado,
    v_caixa.observacoes, to_jsonb(v_caixa), v_movs);

  update public.caixas_diarios
     set status = 'aberto',
         fechado_em = null,
         fechado_por = null,
         saldo_final_conferido = null,
         observacoes = coalesce(observacoes || ' · ', '') ||
           'Reaberto ' || to_char(now() at time zone 'America/Sao_Paulo','DD/MM HH24:MI') ||
           ' por ' || v_reaberto_por || ': ' || v_motivo,
         updated_at = now()
   where id = v_caixa.id;

  insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,unidade_id,data_caixa,payload,resultado,caixa_diario_id)
  values (v_num, v_papel, coalesce(p_payload->>'grupo_jid',p_payload->>'chat_id'), v_unidade, v_data, p_payload, 'reaberto', v_caixa.id);

  return jsonb_build_object('ok', true, 'reaberto', true, 'caixa_diario_id', v_caixa.id,
    'saldo_inicial', v_caixa.saldo_inicial_cofre,
    'fechado_por_anterior', v_caixa.fechado_por,
    'motivo', v_motivo);
end;
$function$;

revoke all on function public.sol_caixa_reabrir_caixa_v1(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_reabrir_caixa_v1(jsonb) to service_role, sol_acesso_restrito;
