-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- dados estruturados p/ o texto de fechamento (o worker formata com montarTextoFechamento)
create or replace function public.sol_caixa_dados_fechamento(p_caixa_diario_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','public' as $fn$
  with c as (
    select cd.*, u.nome as unidade_nome from public.caixas_diarios cd
    join public.unidades u on u.id=cd.unidade_id where cd.id=p_caixa_diario_id
  ),
  cofre_ent as (select coalesce(sum(valor),0) s from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='cofre' and tipo='entrada'),
  cofre_sai as (select coalesce(sum(valor),0) s from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='cofre' and tipo='saida')
  select jsonb_build_object(
    'unidadeNome', (select unidade_nome from c),
    'data', to_char((select data_caixa from c), 'DD/MM/YYYY'),
    'saldoInicial', (select saldo_inicial_cofre from c),
    'cofreEntradas', coalesce((select jsonb_agg(jsonb_build_object('valor',valor,'descricao',descricao) order by created_at)
        from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='cofre' and tipo='entrada'), '[]'::jsonb),
    'cofreSaidas', coalesce((select jsonb_agg(jsonb_build_object('valor',valor,'descricao',descricao) order by created_at)
        from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='cofre' and tipo='saida'), '[]'::jsonb),
    'vendasPorForma', jsonb_build_object(
      'dinheiro', coalesce((select sum(valor) from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and forma_pagamento='dinheiro'),0),
      'pix',      coalesce((select sum(valor) from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and forma_pagamento='pix'),0),
      'cartao',   coalesce((select sum(valor) from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and forma_pagamento='cartao'),0),
      'cheque',   coalesce((select sum(valor) from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and forma_pagamento='cheque'),0),
      'transferencia', coalesce((select sum(valor) from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and forma_pagamento='transferencia'),0)
    ),
    'detalhes', coalesce((select jsonb_agg(jsonb_build_object(
        'forma', forma_pagamento, 'valor', valor,
        'cartaoInfo', case when forma_pagamento='cartao' and cartao_modalidade='credito' then 'Credito '||coalesce(cartao_parcelas,1)||'x'
                           when forma_pagamento='cartao' and cartao_modalidade='debito' then 'Debito' else null end,
        'descricao', descricao) order by created_at)
      from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda'), '[]'::jsonb),
    'saldoFinal', (select coalesce(saldo_final_conferido, saldo_final_calculado, saldo_inicial_cofre) from c),
    'conferidoPor', (select fechado_por from c)
  );
$fn$;
revoke all on function public.sol_caixa_dados_fechamento(uuid) from public, anon, authenticated;
grant execute on function public.sol_caixa_dados_fechamento(uuid) to service_role;

-- helper de autorizacao (mesma regra do lancar)
create or replace function public.sol_caixa_ator_ok(p_unidade uuid, p_num text)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public' as $fn$
  select case
    when coalesce((select autoriza_qualquer_membro from public.sol_caixa_unidade_policy where unidade_id=p_unidade), false)
      then (p_num is not null and length(p_num) >= 8)
    else exists (select 1 from public.sol_caixa_autorizados a where a.unidade_id=p_unidade and a.numero=p_num and a.ativo)
  end;
$fn$;

-- ABRIR (carry-over do dia anterior)
create or replace function public.sol_caixa_abrir(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $fn$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_conf text := coalesce(nullif(p_payload->>'conferido_por',''), 'Sol');
  v_motivo text; v_caixa uuid; v_status text; v_saldo numeric;
begin
  if v_unidade is null then v_motivo:='unidade_invalida';
  elsif not public.sol_caixa_ator_ok(v_unidade, v_num) then v_motivo:='ator_nao_autorizado';
  end if;
  if v_motivo is null then
    select id, status into v_caixa, v_status from public.caixas_diarios where unidade_id=v_unidade and data_caixa=v_data;
    if v_caixa is not null and v_status='aberto' then
      return jsonb_build_object('ok',true,'ja_aberto',true,'caixa_diario_id',v_caixa);
    elsif v_caixa is not null then v_motivo:='caixa_ja_existe_hoje'; end if;
  end if;
  if v_motivo is not null then
    insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,unidade_id,data_caixa,payload,resultado,motivo)
      values(v_num,v_papel,p_payload->>'chat_id',v_unidade,v_data,p_payload,'abrir_recusado',v_motivo);
    return jsonb_build_object('ok',false,'motivo',v_motivo,'data',v_data);
  end if;
  select saldo_final_conferido into v_saldo from public.caixas_diarios
    where unidade_id=v_unidade and data_caixa<v_data and status='fechado' order by data_caixa desc limit 1;
  v_saldo := coalesce(v_saldo,0);
  insert into public.caixas_diarios(unidade_id,data_caixa,status,saldo_inicial_cofre,saldo_final_calculado,aberto_por)
    values(v_unidade,v_data,'aberto',v_saldo,v_saldo,v_conf) returning id into v_caixa;
  insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,unidade_id,data_caixa,payload,resultado,caixa_diario_id)
    values(v_num,v_papel,p_payload->>'chat_id',v_unidade,v_data,p_payload,'aberto',v_caixa);
  return jsonb_build_object('ok',true,'caixa_diario_id',v_caixa,'saldo_inicial',v_saldo,'data',v_data);
end $fn$;
revoke all on function public.sol_caixa_abrir(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_abrir(jsonb) to service_role;

-- FECHAR (calcula saldo do cofre; conferido_por = quem confirmou)
create or replace function public.sol_caixa_fechar(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $fn$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_conf text := coalesce(nullif(p_payload->>'conferido_por',''), 'Sol');
  v_motivo text; v_caixa uuid; v_ini numeric; v_ent numeric; v_sai numeric; v_fim numeric;
begin
  if v_unidade is null then v_motivo:='unidade_invalida';
  elsif not public.sol_caixa_ator_ok(v_unidade, v_num) then v_motivo:='ator_nao_autorizado';
  end if;
  if v_motivo is null then
    select id, saldo_inicial_cofre into v_caixa, v_ini from public.caixas_diarios
      where unidade_id=v_unidade and data_caixa=v_data and status='aberto' order by aberto_em desc limit 1;
    if v_caixa is null then v_motivo:='caixa_nao_aberto'; end if;
  end if;
  if v_motivo is not null then
    insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,unidade_id,data_caixa,payload,resultado,motivo)
      values(v_num,v_papel,p_payload->>'chat_id',v_unidade,v_data,p_payload,'fechar_recusado',v_motivo);
    return jsonb_build_object('ok',false,'motivo',v_motivo,'data',v_data);
  end if;
  select coalesce(sum(valor),0) into v_ent from public.caixa_movimentacoes where caixa_diario_id=v_caixa and ambiente='cofre' and tipo='entrada';
  select coalesce(sum(valor),0) into v_sai from public.caixa_movimentacoes where caixa_diario_id=v_caixa and ambiente='cofre' and tipo='saida';
  v_fim := coalesce(v_ini,0) + v_ent - v_sai;
  update public.caixas_diarios set status='fechado', saldo_final_calculado=v_fim, saldo_final_conferido=v_fim,
     fechado_por=v_conf, fechado_em=now(), updated_at=now() where id=v_caixa;
  insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,unidade_id,data_caixa,payload,resultado,caixa_diario_id)
    values(v_num,v_papel,p_payload->>'chat_id',v_unidade,v_data,p_payload,'fechado',v_caixa);
  return jsonb_build_object('ok',true,'caixa_diario_id',v_caixa,'saldo_final',v_fim,'conferido_por',v_conf);
end $fn$;
revoke all on function public.sol_caixa_fechar(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_fechar(jsonb) to service_role;
