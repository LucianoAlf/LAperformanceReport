-- ROLLBACK de 20261006200000_sol_lote_cheque_varias_faturas.sql: volta o validador do
-- lote à definição viva de 06/10/2026 (pg_get_functiondef, verbatim). Antes de rodar:
-- desligar `lote_multi_fatura` no cheques.json da Sol (senão o "pode" de um lote com
-- cheque de irmãos é recusado com snapshot_item_incompleto — recusa segura, sem gravar).

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
       and nullif(trim(coalesce(x->>'canonical_fatura_id','')), '') is not null;
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

    if v_nome is null or v_valor is null or v_valor <= 0
       or (v_id is null and not coalesce((v_item->>'declarado_pelo_humano')::boolean, false)) then
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
