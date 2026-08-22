-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create table if not exists public.sol_caixa_unidade_policy (
  unidade_id uuid primary key,
  autoriza_qualquer_membro boolean not null default false,
  atualizado_em timestamptz not null default now()
);
alter table public.sol_caixa_unidade_policy enable row level security;
revoke all on public.sol_caixa_unidade_policy from anon, authenticated;

-- Barra: qualquer membro do grupo pode autorizar (decisao do Alf 15/08)
insert into public.sol_caixa_unidade_policy (unidade_id, autoriza_qualquer_membro)
values ('368d47f5-2d88-4475-bc14-ba084a9a348e', true)
on conflict (unidade_id) do update set autoriza_qualquer_membro=excluded.autoriza_qualquer_membro, atualizado_em=now();

-- atualiza a RPC: bloco de autorizacao respeita a policy da unidade
create or replace function public.sol_caixa_lancar_recebimento(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path to 'pg_catalog','public' as $fn$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date,
                          (now() at time zone 'America/Sao_Paulo')::date);
  v_valor numeric := nullif(p_payload->>'valor','')::numeric;
  v_forma text := lower(coalesce(p_payload->>'forma',''));
  v_categoria text := lower(coalesce(nullif(p_payload->>'categoria',''),'parcela'));
  v_aluno text := nullif(trim(coalesce(p_payload->>'aluno','')),'');
  v_desc text := nullif(trim(coalesce(p_payload->>'descricao','')),'');
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_modal text := nullif(p_payload->>'cartao_modalidade','');
  v_parc int := nullif(p_payload->>'cartao_parcelas','')::int;
  v_qualquer boolean;
  v_caixa uuid; v_mov uuid; v_status text; v_mov_existe uuid;
  v_res text; v_motivo text;
begin
  if v_key is not null then
    select status, movimentacao_id into v_status, v_mov_existe
      from public.sol_caixa_ingestao_recebimentos where idempotency_key = v_key;
    if v_status = 'lancado' then
      return jsonb_build_object('ok', true, 'ja_lancado', true, 'movimentacao_id', v_mov_existe);
    end if;
  end if;

  if v_unidade is null then v_motivo := 'unidade_invalida';
  elsif v_valor is null or v_valor <= 0 then v_motivo := 'valor_invalido';
  elsif v_forma not in ('dinheiro','pix','cartao','cheque','transferencia','outro') then v_motivo := 'forma_invalida';
  elsif v_categoria !~ '^[a-z0-9_-]+$' or length(v_categoria) < 2 then v_motivo := 'categoria_invalida';
  end if;

  if v_motivo is null then
    select autoriza_qualquer_membro into v_qualquer
      from public.sol_caixa_unidade_policy where unidade_id = v_unidade;
    if coalesce(v_qualquer, false) then
      if v_num is null or length(v_num) < 8 then v_motivo := 'ator_sem_numero'; end if;
    elsif not exists (select 1 from public.sol_caixa_autorizados a
                      where a.unidade_id = v_unidade and a.numero = v_num and a.ativo) then
      v_motivo := 'ator_nao_autorizado';
    end if;
  end if;

  if v_motivo is null then
    select id into v_caixa from public.caixas_diarios
      where unidade_id = v_unidade and data_caixa = v_data and status = 'aberto'
      order by aberto_em desc limit 1;
    if v_caixa is null then v_motivo := 'caixa_nao_aberto'; end if;
  end if;

  if v_motivo is not null then
    v_res := 'recusado';
    insert into public.sol_caixa_lancamento_auditoria
      (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
       idempotency_key, unidade_id, data_caixa, payload, resultado, motivo)
    values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
       p_payload->>'preview_message_id', v_key, v_unidade, v_data, p_payload, v_res, v_motivo);
    return jsonb_build_object('ok', false, 'motivo', v_motivo, 'data', v_data);
  end if;

  if v_desc is null or length(v_desc) < 3 then
    v_desc := trim(concat_ws(' ', initcap(v_categoria),
                             case when v_aluno is not null then '- '||v_aluno end));
    if length(v_desc) < 3 then v_desc := 'Recebimento via Sol'; end if;
  end if;

  if v_forma <> 'cartao' then v_modal := null; v_parc := null;
  elsif v_modal is null then v_modal := 'credito'; end if;
  if v_modal = 'debito' then v_parc := null; end if;

  insert into public.caixa_movimentacoes
    (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
     forma_pagamento, categoria, descricao, valor, criado_por,
     cartao_modalidade, cartao_parcelas)
  values
    (v_caixa, v_unidade, v_data, 'venda', 'entrada',
     v_forma, v_categoria, v_desc, v_valor,
     concat_ws(':', 'sol-agente', v_papel, v_num), v_modal, v_parc)
  returning id into v_mov;

  if v_key is not null then
    update public.sol_caixa_ingestao_recebimentos
      set status = 'lancado', movimentacao_id = v_mov, lancado_em = now(),
          lancado_por = v_num, valor_extraido = v_valor, forma_extraida = v_forma,
          categoria_extraida = v_categoria, aluno_extraido = v_aluno,
          preview_message_id = coalesce(preview_message_id, p_payload->>'preview_message_id'),
          atualizado_em = now()
      where idempotency_key = v_key;
  end if;

  insert into public.sol_caixa_lancamento_auditoria
    (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
     idempotency_key, unidade_id, data_caixa, payload, resultado, motivo,
     movimentacao_id, caixa_diario_id)
  values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
     p_payload->>'preview_message_id', v_key, v_unidade, v_data, p_payload, 'lancado', null,
     v_mov, v_caixa);

  return jsonb_build_object('ok', true, 'movimentacao_id', v_mov,
    'caixa_diario_id', v_caixa, 'valor', v_valor, 'forma', v_forma,
    'categoria', v_categoria, 'descricao', v_desc, 'data', v_data);
end $fn$;
revoke all on function public.sol_caixa_lancar_recebimento(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_lancar_recebimento(jsonb) to service_role;
