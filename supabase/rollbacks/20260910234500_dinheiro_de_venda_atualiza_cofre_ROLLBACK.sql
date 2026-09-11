-- ROLLBACK OPERACIONAL — dinheiro de venda volta a nao alterar o cofre.
--
-- Aplicar junto com o rollback do commit da aplicacao/Edge. Preserva o helper
-- interno e o trigger porque as funcoes do caixa passam a depender deles, mas
-- restaura integralmente a semantica anterior: apenas ambiente='cofre' entra
-- no saldo fisico. Nao apaga nem recria movimentacoes financeiras.

begin;

create or replace function public.sol_caixa_saldo_fisico_v1(p_caixa_diario_id uuid)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select coalesce(c.saldo_inicial_cofre, 0)
       + coalesce(sum(m.valor) filter (
           where m.tipo = 'entrada'
             and m.ambiente = 'cofre'
             and m.forma_pagamento = 'dinheiro'
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
        and ambiente = 'cofre'
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

  select coalesce(sum(valor) filter (where ambiente='cofre' and tipo='entrada' and forma_pagamento='dinheiro'),0),
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

update public.caixas_diarios c
   set saldo_final_calculado = public.sol_caixa_saldo_fisico_v1(c.id),
       updated_at = now()
 where c.status = 'aberto'
   and c.data_caixa = (now() at time zone 'America/Sao_Paulo')::date;

do $check$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.sol_caixa_saldo_fisico_v1(uuid)'::regprocedure);
  if v_def not like '%m.ambiente = ''cofre''%'
     or v_def like '%m.tipo = ''entrada'' and m.forma_pagamento = ''dinheiro''%' then
    raise exception 'rollback_formula_anterior_nao_restaurada';
  end if;
end;
$check$;

commit;
