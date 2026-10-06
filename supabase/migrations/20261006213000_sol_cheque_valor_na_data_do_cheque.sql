-- CHEQUE PRÉ-DATADO PARA O VENCIMENTO VALE COM DESCONTO (06/10/2026, CG)
--
-- Famílias de CG pagam todo mês com cheque pré-datado para o dia do vencimento, no
-- valor com o desconto de pontualidade (ex.: R$ 387 de R$ 447). O malote chega ao
-- grupo dias depois; o validador media a parcela HOJE (vencida, sem desconto) e
-- recusava o cheque certo. O runtime manda `cheque_data_ref` (bom-para ou data do
-- depósito) em cada item; com essa data até o vencimento e a parcela aberta, vale o
-- `valor_com_desconto`. Item sem `cheque_data_ref` segue idêntico.
--
-- Base: 20261006200000 (aplicada hoje). Rollback: reaplicar a definição da
-- 20261006200000 (supabase/rollbacks/20261006213000_..._ROLLBACK.sql).

CREATE OR REPLACE FUNCTION public.sol_caixa_validar_multi_aluno_snapshot_v1(p_unidade_id uuid, p_itens jsonb, p_valor_total numeric, p_as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_as_of date := coalesce(p_as_of, (now() at time zone 'America/Sao_Paulo')::date);
  v_item jsonb;
  v_env jsonb;
  v_fatura jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_ordem integer := 0;
  v_nome text;
  v_id text;
  v_categoria text;
  v_competencia text;
  v_status_preview text;
  v_valor numeric;
  v_valor_atual numeric;
  v_competencia_fatura text;
  v_soma numeric := 0;
  v_status_env text;
  v_alu record;
  -- 1 cheque → N faturas (20261006200000)
  v_fid text;
  v_f jsonb;
  v_soma_f numeric;
  v_val_f numeric;
  v_fats jsonb;
  v_status_f text;
  -- data do cheque (bom-para/depósito), 20261006213000
  v_ref date;
begin
  if p_unidade_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_invalida');
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'multi_aluno_exige_dois_itens');
  end if;
  if p_valor_total is null or p_valor_total <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'valor_total_invalido');
  end if;

  v_env := public.sol_faturas_alunos_v1(
    p_unidade_id,
    extract(year from v_as_of)::int,
    extract(month from v_as_of)::int,
    'janela_3',
    'todas',
    v_as_of
  );
  v_status_env := v_env->>'status';
  if v_status_env is null or v_status_env not in ('ok','partial') then
    return jsonb_build_object('ok', false, 'motivo', 'fonte_indisponivel', 'status_fonte', v_status_env);
  end if;

  -- Janela do preview (29/09/2026): item com fatura em competência futura (teto +2 meses).
  declare
    v_fim_item date;
    v_env_ext  jsonb;
  begin
    select max(to_date('01/' || y.c, 'DD/MM/YYYY')) into v_fim_item
      from jsonb_array_elements(p_itens) x,
           lateral (select nullif(trim(coalesce(x->>'competencia','')), '') as c) y
     where y.c ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
       and (nullif(trim(coalesce(x->>'canonical_fatura_id','')), '') is not null
            or jsonb_typeof(x->'fatura_ids') = 'array');
    if v_fim_item is not null then
      v_fim_item := least(v_fim_item, (date_trunc('month', v_as_of) + interval '2 month')::date);
    end if;
    if v_fim_item is not null and v_fim_item > date_trunc('month', v_as_of)::date then
      v_env_ext := public.sol_faturas_alunos_v1(
        p_unidade_id, extract(year from v_fim_item)::int, extract(month from v_fim_item)::int,
        'janela_3', 'todas', v_as_of);
      if coalesce(v_env_ext->>'status', '') not in ('ok', 'partial') then
        return jsonb_build_object('ok', false, 'motivo', 'fonte_indisponivel',
          'status_fonte', v_env_ext->>'status', 'competencia_estendida', to_char(v_fim_item, 'MM/YYYY'));
      end if;
      v_env := jsonb_set(v_env, '{items}',
        coalesce(v_env->'items', '[]'::jsonb) || coalesce((
          select jsonb_agg(i2) from jsonb_array_elements(coalesce(v_env_ext->'items', '[]'::jsonb)) i2
           where not exists (select 1 from jsonb_array_elements(coalesce(v_env->'items', '[]'::jsonb)) i1
                              where i1->>'canonical_fatura_id' = i2->>'canonical_fatura_id')), '[]'::jsonb));
    end if;
  end;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    v_nome := nullif(trim(coalesce(v_item->>'aluno_nome','')), '');
    v_id := nullif(trim(coalesce(v_item->>'canonical_fatura_id','')), '');
    v_categoria := lower(coalesce(nullif(v_item->>'categoria',''), 'parcela'));
    v_competencia := nullif(trim(coalesce(v_item->>'competencia','')), '');
    v_valor := nullif(v_item->>'valor','')::numeric;
    v_status_preview := nullif(v_item->'fatura'->>'status','');
    v_ref := case when coalesce(v_item->>'cheque_data_ref','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                  then (v_item->>'cheque_data_ref')::date end;

    if v_nome is null or v_valor is null or v_valor <= 0
       or (v_id is null and not coalesce((v_item->>'declarado_pelo_humano')::boolean, false)
           -- coalesce: sem a chave, jsonb_typeof é NULL e o "not (...)" viraria NULL,
           -- apagando a recusa do item incompleto (lógica ternária do SQL).
           and not coalesce(jsonb_typeof(v_item->'fatura_ids') = 'array'
                            and jsonb_array_length(v_item->'fatura_ids') >= 2, false)) then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_item_incompleto', 'ordem', v_ordem);
    end if;

    -- Aluno resolvido para TODO item (declarado incluído): a guarda de primeiro
    -- nome vale igual, e o lote nunca grava item de aluno inexistente/arquivado.
    select a.id, a.nome, a.emusys_student_id, a.responsavel_nome,
           word_similarity(unaccent(lower(v_nome)), unaccent(lower(a.nome_normalizado)))::numeric as sim
      into v_alu
      from public.alunos a
     where a.unidade_id = p_unidade_id
       and a.nome_normalizado is not null
       and public.sol_caixa_aluno_pode_pagar_v1(a.status, a.unidade_id, a.emusys_student_id)
       and public.sol_nome_mesma_pessoa_v1(v_nome, a.nome_normalizado)
     order by word_similarity(unaccent(lower(v_nome)), unaccent(lower(a.nome_normalizado))) desc, a.id
     limit 1;

    if v_alu.id is null or coalesce(v_alu.sim,0) < 0.45 then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_aluno_nao_encontrado', 'ordem', v_ordem);
    end if;

    -- 1 CHEQUE → N FATURAS (06/10/2026, Recreio: um cheque da mãe pagando as
    -- parcelas de dois irmãos). O item traz `fatura_ids` (2+) e vira UMA
    -- movimentação ligada às N faturas (caixa_movimentacao_faturas) — o Super Folha
    -- casa o depósito por número E valor, então duas movimentações com o mesmo
    -- cheque nunca casariam. Cada fatura é revalidada como no item comum (existe na
    -- unidade, não cancelada, status do preview, valor de hoje, categoria, aluno que
    -- pode pagar) e a SOMA tem de fechar com o valor do item no centavo.
    if jsonb_typeof(v_item->'fatura_ids') = 'array' and jsonb_array_length(v_item->'fatura_ids') >= 2 then
      v_soma_f := 0;
      v_fats := '[]'::jsonb;
      for v_fid in select value from jsonb_array_elements_text(v_item->'fatura_ids') loop
        v_f := null;
        select x into v_f
          from jsonb_array_elements(coalesce(v_env->'items','[]'::jsonb)) x
         where x->>'canonical_fatura_id' = v_fid
           and coalesce(x->>'status','') <> 'cancelada'
         limit 1;
        if v_f is null then
          return jsonb_build_object('ok', false, 'motivo', 'snapshot_fatura_nao_encontrada', 'ordem', v_ordem);
        end if;
        if not exists (
          select 1 from public.alunos a
           where a.unidade_id = p_unidade_id
             and a.emusys_student_id = v_f->>'emusys_student_id'
             and public.sol_caixa_aluno_pode_pagar_v1(a.status, a.unidade_id, a.emusys_student_id)) then
          return jsonb_build_object('ok', false, 'motivo', 'snapshot_aluno_nao_encontrado', 'ordem', v_ordem);
        end if;
        select nullif(s->>'status','') into v_status_f
          from jsonb_array_elements(coalesce(v_item->'faturas','[]'::jsonb)) s
         where s->>'canonical_fatura_id' = v_fid
         limit 1;
        if v_status_f is not null and v_status_f <> coalesce(v_f->>'status','') then
          return jsonb_build_object('ok', false, 'motivo', 'snapshot_status_fatura_mudou', 'ordem', v_ordem);
        end if;
        v_val_f := coalesce(
          case when v_f->>'status' = 'paga' then nullif(v_f->'valores'->>'valor_pago','')::numeric end,
          nullif(v_f->'valores'->>'valor_hoje','')::numeric,
          nullif(v_f->'valores'->>'valor_com_desconto','')::numeric
        );
        -- Cheque com data até o vencimento: vale o valor com desconto (20261006213000).
        if v_ref is not null and coalesce(v_f->>'status','') = 'aberta'
           and nullif(v_f->>'data_vencimento','') is not null and v_ref <= (v_f->>'data_vencimento')::date
           and nullif(v_f->'valores'->>'valor_com_desconto','') is not null then
          v_val_f := (v_f->'valores'->>'valor_com_desconto')::numeric;
        end if;
        if v_val_f is null then
          return jsonb_build_object('ok', false, 'motivo', 'snapshot_valor_fatura_mudou', 'ordem', v_ordem);
        end if;
        if v_categoria in ('passaporte','matricula')
           and coalesce(v_f->>'tipo_fatura','') not in ('passaporte_taxa_matricula','matricula') then
          return jsonb_build_object('ok', false, 'motivo', 'snapshot_categoria_mudou', 'ordem', v_ordem);
        end if;
        if v_categoria = 'parcela' and coalesce(v_f->>'tipo_fatura','') <> 'parcela' then
          return jsonb_build_object('ok', false, 'motivo', 'snapshot_categoria_mudou', 'ordem', v_ordem);
        end if;
        v_soma_f := v_soma_f + v_val_f;
        v_fats := v_fats || jsonb_build_array(jsonb_build_object(
          'canonical_fatura_id', v_fid, 'descricao', v_f->>'descricao',
          'competencia', v_f->>'competencia', 'status', v_f->>'status'));
      end loop;
      if abs(v_soma_f - v_valor) > 0.01 then
        return jsonb_build_object('ok', false, 'motivo', 'snapshot_valor_fatura_mudou', 'ordem', v_ordem,
          'valor_preview', v_valor, 'valor_atual', v_soma_f);
      end if;
      v_soma := v_soma + v_valor;
      v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
        'ordem', v_ordem,
        'aluno_nome', v_alu.nome,
        'aluno_id', null,
        'responsavel_financeiro', v_alu.responsavel_nome,
        'valor', v_valor,
        'categoria', v_categoria,
        'competencia', v_competencia,
        'canonical_fatura_id', null,
        'fatura_ids', v_item->'fatura_ids',
        'faturas', v_fats,
        'descricao', coalesce(nullif(v_item->>'descricao',''), initcap(v_categoria) || ' - ' || v_alu.nome)
      ));
      continue;
    end if;

    if v_id is null then
      -- Item declarado pelo humano sem vínculo de fatura (desconto negociado):
      -- não há fatura a revalidar; a soma contra o total segura a aritmética.
      -- O item ENTRA no snapshot devolvido — é sobre este array que a RPC do
      -- lote insere caixa_movimentacoes. O `continue` sem append foi o que
      -- deixou o R$ 1.290 do Davi fora do caixa em 01/09 (aprovado e não gravado).
      v_soma := v_soma + v_valor;
      v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
        'ordem', v_ordem,
        'aluno_nome', v_alu.nome,
        'aluno_id', v_alu.id,
        'responsavel_financeiro', v_alu.responsavel_nome,
        'valor', v_valor,
        'categoria', v_categoria,
        'competencia', v_competencia,
        'canonical_fatura_id', null,
        'sem_vinculo_fatura', true,
        'declarado_pelo_humano', true,
        'descricao', coalesce(nullif(v_item->>'descricao',''),
          initcap(v_categoria) || ' - ' || v_alu.nome || ' · valor declarado, sem vínculo de fatura')
      ));
      continue;
    end if;

    select x into v_fatura
      from jsonb_array_elements(coalesce(v_env->'items','[]'::jsonb)) x
     where x->>'canonical_fatura_id' = v_id
       and x->>'emusys_student_id' = v_alu.emusys_student_id
       and coalesce(x->>'status','') <> 'cancelada'
     limit 1;

    if v_fatura is null then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_fatura_nao_encontrada', 'ordem', v_ordem);
    end if;

    if v_status_preview is not null and v_status_preview <> coalesce(v_fatura->>'status','') then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_status_fatura_mudou', 'ordem', v_ordem);
    end if;

    v_valor_atual := coalesce(
      case when v_fatura->>'status' = 'paga' then nullif(v_fatura->'valores'->>'valor_pago','')::numeric end,
      nullif(v_fatura->'valores'->>'valor_hoje','')::numeric,
      nullif(v_fatura->'valores'->>'valor_com_desconto','')::numeric
    );
    -- 🔴 CHEQUE PRÉ-DATADO PARA O VENCIMENTO (CG 06/10/2026): a família paga com
    -- cheque para o dia 5 no valor COM desconto de pontualidade; o malote chega dias
    -- depois e a régua de hoje (parcela vencida) recusava o cheque certo. Com a data
    -- do cheque (bom-para ou depósito) até o vencimento, vale o valor com desconto.
    if v_ref is not null and coalesce(v_fatura->>'status','') = 'aberta'
       and nullif(v_fatura->>'data_vencimento','') is not null and v_ref <= (v_fatura->>'data_vencimento')::date
       and nullif(v_fatura->'valores'->>'valor_com_desconto','') is not null
       and abs((v_fatura->'valores'->>'valor_com_desconto')::numeric - v_valor) <= 0.01 then
      v_valor_atual := (v_fatura->'valores'->>'valor_com_desconto')::numeric;
    end if;
    if v_valor_atual is null or abs(v_valor_atual - v_valor) > 0.01 then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_valor_fatura_mudou', 'ordem', v_ordem, 'valor_preview', v_valor, 'valor_atual', v_valor_atual);
    end if;

    if v_categoria in ('passaporte','matricula')
       and coalesce(v_fatura->>'tipo_fatura','') not in ('passaporte_taxa_matricula','matricula') then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_categoria_mudou', 'ordem', v_ordem);
    end if;
    if v_categoria = 'parcela' and coalesce(v_fatura->>'tipo_fatura','') <> 'parcela' then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_categoria_mudou', 'ordem', v_ordem);
    end if;

    v_competencia_fatura := case
      when nullif(v_fatura->>'competencia','') is null then null
      else to_char((v_fatura->>'competencia')::date, 'MM/YYYY')
    end;
    if v_competencia is not null and v_competencia_fatura is not null and v_competencia <> v_competencia_fatura then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_competencia_mudou', 'ordem', v_ordem);
    end if;

    v_soma := v_soma + v_valor;
    v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
      'ordem', v_ordem,
      'aluno_nome', v_alu.nome,
      'aluno_id', v_alu.id,
      'responsavel_financeiro', v_alu.responsavel_nome,
      'valor', v_valor,
      'categoria', v_categoria,
      'competencia', coalesce(v_competencia_fatura, v_competencia),
      'canonical_fatura_id', v_id,
      'descricao', v_fatura->>'descricao',
      'fatura', jsonb_build_object(
        'canonical_fatura_id', v_id,
        'descricao', v_fatura->>'descricao',
        'tipo_fatura', v_fatura->>'tipo_fatura',
        'competencia', v_fatura->>'competencia',
        'status', v_fatura->>'status',
        'data_pagamento', v_fatura->>'data_pagamento',
        'forma_pagamento', v_fatura->'forma_pagamento',
        'valor_pago', v_fatura->'valores'->>'valor_pago',
        'valor_hoje', v_fatura->'valores'->>'valor_hoje'
      )
    ));
  end loop;

  if abs(v_soma - p_valor_total) > 0.01 then
    return jsonb_build_object('ok', false, 'motivo', 'snapshot_soma_divergente', 'soma_itens', v_soma, 'valor_total', p_valor_total);
  end if;
  -- Invariante do contrato: o snapshot devolve EXATAMENTE um item por item de
  -- entrada — é sobre ele que o lote insere. Se divergir, melhor recusar aqui.
  if jsonb_array_length(v_resultados) <> jsonb_array_length(p_itens) then
    return jsonb_build_object('ok', false, 'motivo', 'snapshot_itens_incompletos',
      'itens_entrada', jsonb_array_length(p_itens), 'itens_snapshot', jsonb_array_length(v_resultados));
  end if;
  return jsonb_build_object('ok', true, 'itens', v_resultados, 'soma_itens', v_soma, 'valor_total', p_valor_total);
end;
$function$;
