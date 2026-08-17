-- Corrige o motivo derivado depois do enriquecimento canônico.
--
-- O snapshot da fatura pode vir sem forma de pagamento, enquanto o estado
-- atual da matrícula no Emusys já possui a forma. O enriquecedor preenche a
-- forma, mas a versão anterior mantinha o motivo antigo e deixava a fatura
-- artificialmente na reconciliação.

create or replace function public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_mes integer default extract(month from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_modo_periodo text default 'janela_3'::text,
  p_status text default 'todas'::text,
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
  v_item jsonb;
  v_enriched jsonb;
  v_motivos jsonb;
  v_filtrados jsonb;
  v_reconciliacao jsonb;
  v_main_items jsonb := '[]'::jsonb;
  v_reconciliation_items jsonb := '[]'::jsonb;
  v_unidade_id uuid;
  v_fatura_id bigint;
  v_decisoes text[];
  v_categoria text;
  v_fora_historico integer := 0;
  v_fora_avulso integer := 0;
  v_resolvidas integer := 0;
  v_source_missing integer := 0;
  v_identidade integer := 0;
  v_status integer := 0;
  v_validacoes integer := 0;
  v_forma integer := 0;
  v_contato integer := 0;
  v_total integer := 0;
  v_motivo text;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_20260817(
    p_unidade_id, p_ano, p_mes, p_modo_periodo, p_status, p_as_of_date
  );

  select coalesce(jsonb_agg(public.financeiro_enriquecer_fatura_item(value) order by ord), '[]'::jsonb)
    into v_main_items
  from jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) with ordinality as rows(value, ord);
  v_payload := jsonb_set(v_payload, '{items}', v_main_items, true);

  for v_item in select value from jsonb_array_elements(coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb)) as rows(value) loop
    v_enriched := public.financeiro_enriquecer_fatura_item(v_item);
    v_unidade_id := nullif(v_enriched->>'unidade_id', '')::uuid;
    v_fatura_id := nullif(v_enriched->>'emusys_fatura_id', '')::bigint;
    v_motivos := coalesce(v_enriched->'motivos', '[]'::jsonb);

    -- Se a forma foi encontrada no enriquecimento (Emusys atual ou decisão
    -- manual), não manter a pendência antiga originada no snapshot.
    if nullif(btrim(v_enriched #>> '{forma_pagamento,nome}'), '') is not null then
      select coalesce(jsonb_agg(motivo), '[]'::jsonb)
        into v_motivos
      from jsonb_array_elements_text(v_motivos) as motivos(motivo)
      where motivo <> 'forma_pagamento_ausente';
      v_enriched := jsonb_set(v_enriched, '{motivos}', v_motivos, true);
    end if;

    v_categoria := case
      when lower(coalesce(v_enriched #>> '{aluno,estado_operacional}', '')) in ('evadido', 'inativo', 'trancado', 'trancada')
        or v_motivos ? 'historico_ex_aluno' then 'historico_ex_aluno'
      when v_motivos ? 'registro_nao_aluno'
        or (
          v_enriched->>'emusys_matricula_id' is null
          and (
            coalesce(nullif(btrim(v_enriched->>'emusys_student_id'), ''), '1') in ('0', '1')
            or lower(coalesce(v_enriched->>'descricao', '')) like '%passaporte%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%estoque%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%caderno%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%clips%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%coach%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%palheta%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%rateio entre unidades%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%ingresso%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%locacao%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%locaÃ§Ã£o%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%bora gravar%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%emprestimo%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%emprÃ©stimo%'
          )
        ) then 'registro_nao_aluno'
      else null
    end;

    if v_categoria = 'historico_ex_aluno' then
      v_fora_historico := v_fora_historico + 1;
      continue;
    elsif v_categoria = 'registro_nao_aluno' then
      v_fora_avulso := v_fora_avulso + 1;
      continue;
    end if;

    select coalesce(array_agg(distinct d.tipo_decisao), '{}'::text[])
      into v_decisoes
    from public.financeiro_fatura_reconciliacao_decisoes d
    where d.unidade_id = v_unidade_id
      and d.emusys_fatura_id = v_fatura_id;

    select coalesce(jsonb_agg(motivo), '[]'::jsonb)
      into v_filtrados
    from jsonb_array_elements_text(v_motivos) as motivos(motivo)
    where not (
      (motivo = 'source_missing' and (
        'pagamento_confirmado' = any(v_decisoes)
        or 'renovacao' = any(v_decisoes)
        or 'trancamento' = any(v_decisoes)
        or 'ultima_parcela_aviso_previo' = any(v_decisoes)
        or 'conferido_sem_cobranca' = any(v_decisoes)
      ))
      or (motivo = 'forma_pagamento_ausente' and 'forma_pagamento_manual' = any(v_decisoes))
      or ('conferido_sem_cobranca' = any(v_decisoes))
    );

    if jsonb_array_length(v_filtrados) = 0 then
      if cardinality(v_decisoes) > 0 then v_resolvidas := v_resolvidas + 1; end if;
      continue;
    end if;

    v_enriched := jsonb_set(v_enriched, '{motivos}', v_filtrados, true);
    v_reconciliation_items := v_reconciliation_items || jsonb_build_array(v_enriched);
    v_total := v_total + 1;

    for v_motivo in select value from jsonb_array_elements_text(v_filtrados) as motivos(value) loop
      if v_motivo = 'source_missing' then v_source_missing := v_source_missing + 1;
      elsif v_motivo = 'identidade_invalida' then v_identidade := v_identidade + 1;
      elsif v_motivo = 'status_desconhecido' then v_status := v_status + 1;
      elsif v_motivo = 'validacao_origem' then v_validacoes := v_validacoes + 1;
      elsif v_motivo = 'forma_pagamento_ausente' then v_forma := v_forma + 1;
      elsif v_motivo = 'contato_pendente' then v_contato := v_contato + 1;
      end if;
    end loop;
  end loop;

  v_reconciliacao := jsonb_build_object(
    'source_missing', v_source_missing,
    'identidade_invalida', v_identidade,
    'status_desconhecido', v_status,
    'validacoes_origem', v_validacoes,
    'forma_pagamento_ausente', v_forma,
    'contato_pendente', v_contato,
    'total', v_total,
    'resolvidas_manualmente', v_resolvidas,
    'fora_operacao', jsonb_build_object(
      'historico_ex_aluno', v_fora_historico,
      'registro_nao_aluno', v_fora_avulso,
      'total', v_fora_historico + v_fora_avulso
    ),
    'items', v_reconciliation_items
  );

  v_payload := jsonb_set(v_payload, '{reconciliation}', v_reconciliacao, true);
  v_payload := jsonb_set(
    v_payload,
    '{status}',
    to_jsonb(case
      when coalesce((v_payload #>> '{freshness,competencias_stale}')::integer, 0) > 0 then 'stale'
      when v_total > 0 then 'partial'
      else 'ok'
    end),
    true
  );
  return v_payload;
end;
$function$;
