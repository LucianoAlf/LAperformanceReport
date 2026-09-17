-- Checkpoint 3 — classificação explícita antes/depois da política de grupo.
--
-- Extensão estrita do contrato sanitizado existente. Não cria acesso ao Caixa,
-- não concede SELECT e não transporta texto/identidade. A migration falha se a
-- função viva não tiver exatamente os dois anchors esperados.

do $migration$
declare
  v_function regprocedure := to_regprocedure('public.sol_caixa_governanca_registrar_v1(jsonb)');
  v_before text;
  v_after text;
begin
  if v_function is null then
    raise exception 'SOL_GOVERNANCA_CP3_BASE_AUSENTE';
  end if;

  select pg_get_functiondef(v_function) into v_before;
  if position('''relevance_decided''' in v_before) > 0
     and position('''relevance''' in v_before) > 0 then
    return;
  end if;

  v_after := replace(
    v_before,
    '''message_observed'',''redelivery_observed'',''route_decided'',''tool_selected''',
    '''message_observed'',''redelivery_observed'',''relevance_decided'',''contained_with_reason'',''route_decided'',''tool_selected'''
  );
  v_after := replace(
    v_after,
    '''action'',''outcome'',''reason_code'',''media_kind'',',
    '''action'',''outcome'',''reason_code'',''media_kind'',''relevance'','
  );

  if v_after = v_before
     or position('''relevance_decided''' in v_after) = 0
     or position('''contained_with_reason''' in v_after) = 0
     or position('''relevance''' in v_after) = 0 then
    raise exception 'SOL_GOVERNANCA_CP3_ANCHOR_DIVERGENTE';
  end if;

  execute v_after;
end
$migration$;

comment on function public.sol_caixa_governanca_registrar_v1(jsonb) is
  'Ledger sanitizado do Caixa: CP3 aceita classificação de relevância e contenção por política, sem texto ou identidade.';
