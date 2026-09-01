-- CASO Jhon/CG 01/09 17:09-17:12: multi-aluno com DESCONTO NEGOCIADO em loop.
-- O conteudo aplicado em producao esta na migration
-- `multi_aluno_valor_declarado_lanca_sem_vinculo` (via MCP); este arquivo e o
-- espelho versionado. Racional completo no cabecalho daquela migration e em
-- tests/sol-runtime/README.md (multi-com-desconto-negociado-e2e).
--
-- Resumo: no fluxo de UM aluno, valor divergente da fatura e AVISO +
-- lancamento sem vinculo; no multi era bloqueio eterno (resolver exigia bater
-- no centavo com fatura canonica — desconto negociado nao bate nunca). O fix
-- espelha o single: item com `declarado_pelo_humano` (runtime seta so quando o
-- valor esta LITERALMENTE no texto escrito) e sem fatura correspondente entra
-- SEM vinculo (aluno vinculado, canonical_fatura_id null — o INSERT do lote ja
-- tolerava); o validador de snapshot pula a revalidacao de fatura desses
-- itens; soma x total continua obrigatoria; divisao DERIVADA continua
-- fail-closed; "pode" humano continua obrigatorio.
--
-- (replace-com-guarda sobre pg_get_functiondef de sol_caixa_resolver_multi_aluno_v1
-- e sol_caixa_validar_multi_aluno_snapshot_v1 + revoke anon pos-recriacao;
-- idempotente: ancora 0 = ja aplicada.)

-- Idempotente: ancora com 0 ocorrencias = ja aplicada (via MCP em 01/09).

do $$
declare
  v_def text := pg_get_functiondef((select oid from pg_proc where proname='sol_caixa_resolver_multi_aluno_v1' and pronamespace='public'::regnamespace)::regprocedure);
  v_anc text := $anc$    if v_esc is null or v_valor is null or v_valor <= 0 then
      return jsonb_build_object(
        'ok', false,
        'motivo', 'item_nao_validado',
        'ordem', v_ordem,
        'aluno_nome', v_alu.nome
      );
    end if;$anc$;
  v_new text := $new$    if v_valor is null or v_valor <= 0 then
      return jsonb_build_object(
        'ok', false,
        'motivo', 'item_nao_validado',
        'ordem', v_ordem,
        'aluno_nome', v_alu.nome
      );
    end if;
    if v_esc is null then
      if coalesce((v_item->>'declarado_pelo_humano')::boolean, false) then
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
          'descricao', null,
          'fatura', null
        ));
        continue;
      end if;
      return jsonb_build_object(
        'ok', false,
        'motivo', 'item_nao_validado',
        'ordem', v_ordem,
        'aluno_nome', v_alu.nome
      );
    end if;$new$;
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n = 1 then
    execute replace(v_def, v_anc, v_new);
    execute format('revoke execute on function %s from anon, public',
      (select oid::regprocedure from pg_proc where proname='sol_caixa_resolver_multi_aluno_v1' and pronamespace='public'::regnamespace));
  end if;
end $$;

do $$
declare
  v_def text := pg_get_functiondef((select oid from pg_proc where proname='sol_caixa_validar_multi_aluno_snapshot_v1' and pronamespace='public'::regnamespace)::regprocedure);
  v_anc text := $anc$    if v_nome is null or v_id is null or v_valor is null or v_valor <= 0 then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_item_incompleto', 'ordem', v_ordem);
    end if;$anc$;
  v_new text := $new$    if v_nome is null or v_valor is null or v_valor <= 0
       or (v_id is null and not coalesce((v_item->>'declarado_pelo_humano')::boolean, false)) then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_item_incompleto', 'ordem', v_ordem);
    end if;
    if v_id is null then
      v_soma := v_soma + v_valor;
      continue;
    end if;$new$;
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n = 1 then
    execute replace(v_def, v_anc, v_new);
    execute format('revoke execute on function %s from anon, public',
      (select oid::regprocedure from pg_proc where proname='sol_caixa_validar_multi_aluno_snapshot_v1' and pronamespace='public'::regnamespace));
  end if;
end $$;

