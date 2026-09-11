-- Caixa diario: toda entrada recebida em dinheiro altera o saldo fisico.
--
-- Uma venda em dinheiro continua com ambiente='venda' para aparecer no resumo
-- comercial, mas a mesma linha tambem participa do saldo do cofre por causa da
-- forma_pagamento='dinheiro'. Nao criamos movimento espelho e nao duplicamos o
-- ledger. Pix/cartao/cheque/transferencia continuam sem alterar o cofre.
--
-- Incidente que falsificou a regra (10/09/2026): saldo inicial 62,80 + venda em
-- dinheiro 450,00 aparecia nos recebimentos, mas o fechamento continuava 62,80.

create or replace function public.sol_caixa_saldo_fisico_v1(p_caixa_diario_id uuid)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select coalesce(c.saldo_inicial_cofre, 0)
       + coalesce(sum(m.valor) filter (
           where m.tipo = 'entrada' and m.forma_pagamento = 'dinheiro'
         ), 0)
       - coalesce(sum(m.valor) filter (
           where m.tipo = 'saida'
             and m.ambiente = 'cofre'
             and m.forma_pagamento = 'dinheiro'
         ), 0)
  from public.caixas_diarios c
  left join public.caixa_movimentacoes m on m.caixa_diario_id = c.id
  where c.id = p_caixa_diario_id
  group by c.id, c.saldo_inicial_cofre;
$function$;

revoke all on function public.sol_caixa_saldo_fisico_v1(uuid)
  from public, anon, authenticated, service_role;

comment on function public.sol_caixa_saldo_fisico_v1(uuid) is
  'Calcula saldo fisico: inicial + toda entrada em dinheiro - saida de cofre em dinheiro. Funcao interna.';

create or replace function public.sol_caixa_recalcular_cofre(p_caixa_diario_id uuid)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_saldo numeric;
begin
  if p_caixa_diario_id is null then
    return null;
  end if;

  v_saldo := public.sol_caixa_saldo_fisico_v1(p_caixa_diario_id);

  if v_saldo is not null then
    update public.caixas_diarios
       set saldo_final_calculado = v_saldo,
           updated_at = now()
     where id = p_caixa_diario_id;
  end if;

  return v_saldo;
end;
$function$;

create or replace function public.trg_caixa_movimentacao_recalcula_saldo()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.sol_caixa_recalcular_cofre(old.caixa_diario_id);
    return old;
  end if;

  perform public.sol_caixa_recalcular_cofre(new.caixa_diario_id);

  if tg_op = 'UPDATE' and old.caixa_diario_id is distinct from new.caixa_diario_id then
    perform public.sol_caixa_recalcular_cofre(old.caixa_diario_id);
  end if;

  return new;
end;
$function$;

revoke all on function public.trg_caixa_movimentacao_recalcula_saldo()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_caixa_movimentacao_recalcula_saldo
  on public.caixa_movimentacoes;
create trigger trg_caixa_movimentacao_recalcula_saldo
after insert or delete or update of caixa_diario_id, tipo, ambiente, forma_pagamento, valor
on public.caixa_movimentacoes
for each row execute function public.trg_caixa_movimentacao_recalcula_saldo();

create or replace function public.sol_caixa_dados_fechamento(p_caixa_diario_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with c as (
    select cd.*, u.nome as unidade_nome
    from public.caixas_diarios cd
    join public.unidades u on u.id = cd.unidade_id
    where cd.id = p_caixa_diario_id
  )
  select jsonb_build_object(
    'unidadeNome', (select unidade_nome from c),
    'data', to_char((select data_caixa from c), 'DD/MM/YYYY'),
    'saldoInicial', (select saldo_inicial_cofre from c),
    'cofreEntradas', coalesce((
      select jsonb_agg(jsonb_build_object('valor', valor, 'descricao', descricao) order by created_at)
      from public.caixa_movimentacoes
      where caixa_diario_id = p_caixa_diario_id
        and tipo = 'entrada'
        and forma_pagamento = 'dinheiro'
    ), '[]'::jsonb),
    'cofreSaidas', coalesce((
      select jsonb_agg(jsonb_build_object('valor', valor, 'descricao', descricao) order by created_at)
      from public.caixa_movimentacoes
      where caixa_diario_id = p_caixa_diario_id
        and ambiente = 'cofre'
        and tipo = 'saida'
        and forma_pagamento = 'dinheiro'
    ), '[]'::jsonb),
    'vendasPorForma', jsonb_build_object(
      'dinheiro', coalesce((select sum(valor) from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and tipo='entrada' and forma_pagamento='dinheiro'),0),
      'pix', coalesce((select sum(valor) from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and tipo='entrada' and forma_pagamento='pix'),0),
      'cartao', coalesce((select sum(valor) from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and tipo='entrada' and forma_pagamento='cartao'),0),
      'cheque', coalesce((select sum(valor) from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and tipo='entrada' and forma_pagamento='cheque'),0),
      'transferencia', coalesce((select sum(valor) from public.caixa_movimentacoes where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and tipo='entrada' and forma_pagamento='transferencia'),0)
    ),
    'detalhes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'forma', forma_pagamento,
        'valor', valor,
        'cartaoInfo', case
          when forma_pagamento='cartao' and cartao_modalidade='credito' then 'Credito '||coalesce(cartao_parcelas,1)||'x'
          when forma_pagamento='cartao' and cartao_modalidade='debito' then 'Debito'
          else null
        end,
        'descricao', descricao
      ) order by created_at)
      from public.caixa_movimentacoes
      where caixa_diario_id=p_caixa_diario_id and ambiente='venda' and tipo='entrada'
    ), '[]'::jsonb),
    'saldoFinal', public.sol_caixa_saldo_fisico_v1(p_caixa_diario_id),
    'conferidoPor', (select fechado_por from c)
  );
$function$;

create or replace function public.sol_caixa_snapshot_abertura_fechamento_v3(
  p_unidade_id uuid,
  p_data_caixa date,
  p_operacao text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_op text := lower(coalesce(p_operacao,''));
  v_caixa public.caixas_diarios%rowtype;
  v_anterior public.caixas_diarios%rowtype;
  v_pendente public.caixas_diarios%rowtype;
  v_entradas numeric := 0;
  v_saidas numeric := 0;
  v_contagens jsonb := '{}'::jsonb;
  v_saldo numeric := 0;
begin
  if p_unidade_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_invalida');
  elsif p_data_caixa is null then
    return jsonb_build_object('ok', false, 'motivo', 'data_caixa_invalida');
  elsif v_op not in ('abrir_caixa','fechar_caixa') then
    return jsonb_build_object('ok', false, 'motivo', 'operacao_invalida');
  end if;

  if v_op = 'abrir_caixa' then
    select * into v_caixa from public.caixas_diarios
    where unidade_id = p_unidade_id and data_caixa = p_data_caixa;
    if v_caixa.id is not null then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_caixa_ja_existe', 'caixa_diario_id', v_caixa.id);
    end if;

    select * into v_pendente from public.caixas_diarios
    where unidade_id = p_unidade_id and data_caixa < p_data_caixa and status = 'aberto'
    order by data_caixa desc limit 1;
    if v_pendente.id is not null then
      v_saldo := public.sol_caixa_saldo_fisico_v1(v_pendente.id);
      return jsonb_build_object('ok', false, 'motivo', 'fechamento_pendente_dia_anterior',
        'pendencia', jsonb_build_object('caixa_diario_id',v_pendente.id,'data_caixa',v_pendente.data_caixa,'saldo_final_calculado',v_saldo));
    end if;

    select * into v_anterior from public.caixas_diarios
    where unidade_id = p_unidade_id and data_caixa < p_data_caixa and status = 'fechado'
    order by data_caixa desc limit 1;
    v_saldo := coalesce(v_anterior.saldo_final_conferido, v_anterior.saldo_final_calculado, 0);
    return jsonb_build_object('ok', true, 'snapshot', jsonb_build_object(
      'operacao','abrir_caixa','unidade_id',p_unidade_id,'data_caixa',p_data_caixa,
      'caixa_hoje',null,'caixa_anterior_aberto',null,
      'ultimo_fechado_id',v_anterior.id,'ultimo_fechado_data',v_anterior.data_caixa,
      'saldo_inicial_proposto',v_saldo
    ));
  end if;

  select * into v_caixa from public.caixas_diarios
  where unidade_id = p_unidade_id and data_caixa = p_data_caixa and status = 'aberto'
  order by aberto_em desc limit 1;
  if v_caixa.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'snapshot_caixa_nao_aberto');
  end if;

  select coalesce(sum(valor) filter (where tipo='entrada' and forma_pagamento='dinheiro'),0),
         coalesce(sum(valor) filter (where ambiente='cofre' and tipo='saida' and forma_pagamento='dinheiro'),0)
    into v_entradas, v_saidas
  from public.caixa_movimentacoes where caixa_diario_id = v_caixa.id;
  select coalesce(jsonb_object_agg(ambiente, quantidade), '{}'::jsonb) into v_contagens
  from (select ambiente, count(*)::int as quantidade from public.caixa_movimentacoes where caixa_diario_id=v_caixa.id group by ambiente) q;
  v_saldo := public.sol_caixa_saldo_fisico_v1(v_caixa.id);
  return jsonb_build_object('ok', true, 'snapshot', jsonb_build_object(
    'operacao','fechar_caixa','unidade_id',p_unidade_id,'data_caixa',p_data_caixa,
    'caixa_diario_id',v_caixa.id,'status',v_caixa.status,
    'saldo_inicial_cofre',v_caixa.saldo_inicial_cofre,'cofre_entradas',v_entradas,
    'cofre_saidas',v_saidas,'saldo_final_calculado',v_saldo,
    'movimentos_por_ambiente',v_contagens
  ));
end;
$function$;

create or replace function public.sol_caixa_fechar(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_conf text := coalesce(nullif(p_payload->>'conferido_por',''), 'Sol');
  v_motivo text;
  v_caixa uuid;
  v_fim numeric;
begin
  if v_unidade is null then v_motivo := 'unidade_invalida';
  elsif not public.sol_caixa_ator_ok(v_unidade, v_num) then v_motivo := 'ator_nao_autorizado';
  end if;

  if v_motivo is null then
    select id into v_caixa
    from public.caixas_diarios
    where unidade_id=v_unidade and data_caixa=v_data and status='aberto'
    order by aberto_em desc limit 1
    for update;
    if v_caixa is null then v_motivo := 'caixa_nao_aberto'; end if;
  end if;

  if v_motivo is not null then
    insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,unidade_id,data_caixa,payload,resultado,motivo)
      values(v_num,v_papel,p_payload->>'chat_id',v_unidade,v_data,p_payload,'fechar_recusado',v_motivo);
    return jsonb_build_object('ok',false,'motivo',v_motivo,'data',v_data);
  end if;

  v_fim := public.sol_caixa_saldo_fisico_v1(v_caixa);
  update public.caixas_diarios
     set status='fechado', saldo_final_calculado=v_fim, saldo_final_conferido=v_fim,
         fechado_por=v_conf, fechado_em=now(), updated_at=now()
   where id=v_caixa;
  insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,unidade_id,data_caixa,payload,resultado,caixa_diario_id)
    values(v_num,v_papel,p_payload->>'chat_id',v_unidade,v_data,p_payload,'fechado',v_caixa);
  return jsonb_build_object('ok',true,'caixa_diario_id',v_caixa,'saldo_final',v_fim,'conferido_por',v_conf);
end;
$function$;

-- A saida atualizava o cache com a formula antiga depois que o trigger ja
-- havia calculado o valor certo. Manter o retorno e a auditoria do contrato
-- existente, mas delegar o saldo a uma unica fonte canonica.
create or replace function public.sol_caixa_lancar_saida(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_valor numeric := nullif(p_payload->>'valor','')::numeric;
  v_forma text := lower(coalesce(p_payload->>'forma',''));
  v_categoria text := lower(coalesce(nullif(p_payload->>'categoria',''),'despesa'));
  v_desc text := nullif(trim(coalesce(p_payload->>'descricao','')),'');
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_env text := nullif(trim(coalesce(p_payload->>'enviado_por','')),'');
  v_aut text := nullif(trim(coalesce(p_payload->>'autorizado_por','')),'');
  v_resp text;
  v_caixa uuid;
  v_mov uuid;
  v_mov_existe uuid;
  v_motivo text;
  v_saldo numeric;
  v_v3 jsonb;
begin
  if v_key is not null then
    select movimentacao_id into v_mov_existe
      from public.sol_caixa_lancamento_auditoria
      where idempotency_key = v_key
        and resultado = 'saida_lancada'
        and movimentacao_id is not null
      order by criado_em desc
      limit 1;
    if v_mov_existe is not null then
      return jsonb_build_object('ok', true, 'ja_lancado', true, 'movimentacao_id', v_mov_existe);
    end if;
  end if;

  if v_unidade is null then v_motivo := 'unidade_invalida';
  elsif v_valor is null or v_valor <= 0 then v_motivo := 'valor_invalido';
  elsif v_forma <> 'dinheiro' then v_motivo := 'saida_cofre_so_dinheiro';
  elsif v_categoria !~ '^[a-z0-9_-]+$' or length(trim(v_categoria)) < 2 then v_motivo := 'categoria_invalida';
  elsif not public.sol_caixa_ator_ok(v_unidade, v_num) then v_motivo := 'ator_nao_autorizado';
  end if;

  if v_motivo is null then
    select id into v_caixa
    from public.caixas_diarios
    where unidade_id = v_unidade
      and data_caixa = v_data
      and status = 'aberto'
    order by aberto_em desc
    limit 1;
    if v_caixa is null then v_motivo := 'caixa_nao_aberto'; end if;
  end if;

  if v_motivo is null then
    v_v3 := public.sol_caixa_v3_validar_approval_v1(p_payload, 'lancar_saida');
    if not coalesce((v_v3->>'ok')::boolean, false) then
      v_motivo := coalesce(v_v3->>'motivo', 'approval_v3_invalido');
    end if;
  end if;

  if v_motivo is not null then
    insert into public.sol_caixa_lancamento_auditoria
      (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
       idempotency_key, unidade_id, data_caixa, payload, resultado, motivo)
    values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
       p_payload->>'preview_message_id', v_key, v_unidade, v_data, p_payload, 'saida_recusada', v_motivo);
    return jsonb_build_object('ok', false, 'motivo', v_motivo, 'data', v_data);
  end if;

  if v_desc is null or length(v_desc) < 3 then
    v_desc := initcap(v_categoria);
  end if;

  v_resp := case
    when v_aut is not null and v_env is not null and lower(v_aut) is distinct from lower(v_env)
      then v_aut || ' (aut.) · ' || v_env || ' (env.) · via Sol'
    when v_aut is not null then v_aut || ' · via Sol'
    when v_env is not null then v_env || ' · via Sol'
    else 'Sol (agente)' end;

  insert into public.caixa_movimentacoes
    (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
     forma_pagamento, categoria, descricao, valor, criado_por, responsavel)
  values
    (v_caixa, v_unidade, v_data, 'cofre', 'saida',
     v_forma, v_categoria, v_desc, v_valor,
     concat_ws(':', 'sol-agente', v_papel, v_num), v_resp)
  returning id into v_mov;

  v_saldo := public.sol_caixa_recalcular_cofre(v_caixa);

  insert into public.sol_caixa_lancamento_auditoria
    (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
     idempotency_key, unidade_id, data_caixa, payload, resultado, motivo,
     movimentacao_id, caixa_diario_id)
  values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
     p_payload->>'preview_message_id', v_key, v_unidade, v_data, p_payload, 'saida_lancada', null,
     v_mov, v_caixa);

  return jsonb_build_object('ok', true, 'movimentacao_id', v_mov,
    'caixa_diario_id', v_caixa, 'valor', v_valor, 'forma', v_forma,
    'categoria', v_categoria, 'descricao', v_desc, 'responsavel', v_resp,
    'data', v_data, 'tipo', 'saida', 'ambiente', 'cofre', 'saldo_final', v_saldo);
end;
$function$;

create or replace function public.sol_caixa_abrir(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_conf text := coalesce(nullif(p_payload->>'conferido_por',''), 'Sol');
  v_motivo text;
  v_caixa uuid;
  v_status text;
  v_saldo numeric;
  v_pend record;
begin
  if v_unidade is null then v_motivo := 'unidade_invalida';
  elsif not public.sol_caixa_ator_ok(v_unidade, v_num) then v_motivo := 'ator_nao_autorizado';
  end if;

  if v_motivo is null then
    select id, status into v_caixa, v_status
    from public.caixas_diarios where unidade_id=v_unidade and data_caixa=v_data;
    if v_caixa is not null and v_status='aberto' then
      return jsonb_build_object('ok',true,'ja_aberto',true,'caixa_diario_id',v_caixa);
    elsif v_caixa is not null then
      v_motivo := 'caixa_ja_existe_hoje';
    end if;
  end if;

  if v_motivo is null then
    select cd.id, cd.data_caixa, public.sol_caixa_saldo_fisico_v1(cd.id) as saldo_pendente
      into v_pend
      from public.caixas_diarios cd
     where cd.unidade_id=v_unidade and cd.data_caixa<v_data and cd.status='aberto'
       and cd.data_caixa >= v_data - 3
     order by cd.data_caixa desc limit 1;
    if v_pend.id is not null then v_motivo := 'fechamento_pendente_dia_anterior'; end if;
  end if;

  if v_motivo is not null then
    insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,unidade_id,data_caixa,payload,resultado,motivo)
      values(v_num,v_papel,p_payload->>'chat_id',v_unidade,v_data,p_payload,'abrir_recusado',v_motivo);
    return jsonb_build_object('ok',false,'motivo',v_motivo,'data',v_data)
      || case when v_motivo='fechamento_pendente_dia_anterior' then
           jsonb_build_object('pendencia', jsonb_build_object(
             'caixa_diario_id', v_pend.id,
             'data_caixa', v_pend.data_caixa,
             'saldo_final_calculado', v_pend.saldo_pendente))
         else '{}'::jsonb end;
  end if;

  select saldo_final_conferido into v_saldo
  from public.caixas_diarios
  where unidade_id=v_unidade and data_caixa<v_data and status='fechado'
  order by data_caixa desc limit 1;
  v_saldo := coalesce(v_saldo,0);
  insert into public.caixas_diarios(unidade_id,data_caixa,status,saldo_inicial_cofre,saldo_final_calculado,aberto_por)
    values(v_unidade,v_data,'aberto',v_saldo,v_saldo,v_conf) returning id into v_caixa;
  insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,unidade_id,data_caixa,payload,resultado,caixa_diario_id)
    values(v_num,v_papel,p_payload->>'chat_id',v_unidade,v_data,p_payload,'aberto',v_caixa);
  return jsonb_build_object('ok',true,'caixa_diario_id',v_caixa,'saldo_inicial',v_saldo,'data',v_data)
    || (select case when count(*) = 0 then '{}'::jsonb else jsonb_build_object('pendencias_antigas',
           jsonb_build_object('quantidade', count(*), 'mais_recente', max(cd2.data_caixa))) end
        from public.caixas_diarios cd2
        where cd2.unidade_id = v_unidade and cd2.status = 'aberto' and cd2.data_caixa < v_data);
end;
$function$;

-- Corrige somente caixas ainda abertos no dia corrente. Fechamentos historicos
-- nao sao reescritos por esta migration.
update public.caixas_diarios c
   set saldo_final_calculado = public.sol_caixa_saldo_fisico_v1(c.id),
       updated_at = now()
 where c.status = 'aberto'
   and c.data_caixa = (now() at time zone 'America/Sao_Paulo')::date
   and c.saldo_final_calculado is distinct from public.sol_caixa_saldo_fisico_v1(c.id);

do $check$
declare
  v_abertos_divergentes integer;
begin
  if to_regprocedure('public.sol_caixa_saldo_fisico_v1(uuid)') is null then
    raise exception 'saldo_fisico_v1_nao_criado';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.caixa_movimentacoes'::regclass
      and tgname = 'trg_caixa_movimentacao_recalcula_saldo'
      and not tgisinternal
  ) then
    raise exception 'trigger_recalculo_nao_criado';
  end if;

  if has_function_privilege('anon', 'public.sol_caixa_saldo_fisico_v1(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sol_caixa_saldo_fisico_v1(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.sol_caixa_saldo_fisico_v1(uuid)', 'EXECUTE') then
    raise exception 'helper_interno_exposto';
  end if;

  select count(*) into v_abertos_divergentes
  from public.caixas_diarios c
  where c.status = 'aberto'
    and c.data_caixa = (now() at time zone 'America/Sao_Paulo')::date
    and c.saldo_final_calculado is distinct from public.sol_caixa_saldo_fisico_v1(c.id);

  if v_abertos_divergentes <> 0 then
    raise exception 'caixas_abertos_ainda_divergentes=%', v_abertos_divergentes;
  end if;
end;
$check$;
