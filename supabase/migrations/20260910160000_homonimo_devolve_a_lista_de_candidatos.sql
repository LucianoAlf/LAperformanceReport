-- HOMONIMO VOLTAVA SEM A LISTA: `jsonb 'null'` NAO E SQL NULL.
--
-- 🔴 O DEFEITO. A funcao promete "nao sei qual Davi, e aqui estao os N Davis".
--    Medido em producao em 10/09: `sol_caixa_responsavel_aluno(CG,'Alice')`
--    devolve 7 candidatos e o resolver entregava `candidatos: null`. A recusa
--    funcionava (a propriedade de seguranca vale); o que nao chegava era a
--    saida para a consultora.
--
-- 🔴 A CAUSA. `sol_caixa_resolver_pagamento_v1` monta o item com
--    `jsonb_build_object(..., 'candidatos', v_composto->'candidatos')`. Quando
--    a composta nao tem candidatos, isso grava o JSON `null` — que NAO e SQL
--    NULL. Entao `v_alu->'candidatos' is null` era SEMPRE falso, o resgate
--    nunca disparava, e o `coalesce` do fim devolvia o proprio `jsonb 'null'`
--    em vez de cair no segundo argumento.
--
-- ⚠️ MESMA FAMILIA de `<>` com NULL e de `is distinct from`: comparacao com
--    NULL dentro de guarda faz a prova passar vazia. Aqui a guarda nao passou
--    vazia — ela nunca abriu.
--
-- ⚠️ Reproduzido IGUAL no container do ensaio ("alex", 60 homonimos): e defeito
--    de codigo, nao de ambiente. Minha assercao de ambiguidade provava o
--    `motivo` e nunca a lista — assercao que nao olha nao protege.
--
-- ⚠️ AUTOCONTIDA: `create or replace` puro, sem depender do estado em que
--    encontra a funcao.

create or replace function public.sol_caixa_resolver_pagamento_itens_v1(
  p_unidade_id  uuid,
  p_itens       jsonb,     -- [{aluno_nome, valor?, declarado_pelo_humano?}, ...]
  p_valor_total numeric,
  p_competencia date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_pag    jsonb;
  v_alu    jsonb;
  v_fat    jsonb;
  v_f      jsonb;
  v_ent    jsonb;
  v_resp   jsonb;
  v_linhas jsonb := '[]'::jsonb;
  v_ordem  int := 0;
  v_soma   numeric := 0;
  v_valor  numeric;
  v_comp   text;
  v_motivo text;
begin
  v_pag := sol_caixa_resolver_pagamento_v1(p_unidade_id, p_itens, p_valor_total, p_competencia);

  if v_pag->>'motivo' = 'itens_ausentes' then
    return jsonb_build_object('ok', false, 'motivo', 'itens_ausentes');
  end if;

  for v_alu in
    select x from jsonb_array_elements(coalesce(v_pag->'alunos', '[]'::jsonb)) x
     order by (x->>'ordem')::int
  loop
    v_ent := p_itens->(((v_alu->>'ordem')::int) - 1);

    ------------------------------------------------------------------ resolveu
    if coalesce((v_alu->>'ok')::boolean, false) then
      for v_fat in select f from jsonb_array_elements(coalesce(v_alu->'faturas', '[]'::jsonb)) f loop
        -- a composta aninha a fatura em `fatura`; canonica/casador entregam crua
        v_f := coalesce(v_fat->'fatura', v_fat);
        v_valor := coalesce(
          nullif(v_fat->>'valor', '')::numeric,
          nullif(v_f->>'valor_pago', '')::numeric,
          nullif(v_f->>'valor_hoje', '')::numeric,
          nullif(v_f->>'valor_da_parcela', '')::numeric);

        -- competência sai ora como 'MM/YYYY' (item da composta), ora como data
        -- ISO (fatura crua). Uma forma só chega ao caixa.
        v_comp := coalesce(nullif(v_fat->>'competencia', ''), nullif(v_f->>'competencia', ''));
        if v_comp is not null and v_comp !~ '^[0-9]{2}/[0-9]{4}$' then
          v_comp := to_char(v_comp::date, 'MM/YYYY');
        end if;

        if v_valor is null or v_valor <= 0 then
          return jsonb_build_object('ok', false, 'motivo', 'item_nao_validado',
            'ordem', v_alu->>'ordem', 'aluno_nome', v_alu->>'aluno_nome');
        end if;

        v_ordem := v_ordem + 1;
        v_soma  := v_soma + v_valor;
        v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
          'ordem', v_ordem,
          'aluno_nome', coalesce(v_fat->>'aluno_nome', v_alu->>'aluno_nome'),
          'responsavel_financeiro', coalesce(v_fat->>'responsavel_financeiro',
                                             v_alu->>'responsavel_financeiro'),
          'valor', v_valor,
          'categoria', coalesce(nullif(v_fat->>'categoria', ''),
            case coalesce(v_f->>'tipo_fatura', '')
              when 'parcela' then 'parcela'
              when 'passaporte_taxa_matricula' then 'passaporte'
              when 'matricula' then 'matricula'
              else 'outro' end),
          'competencia', v_comp,
          'canonical_fatura_id', coalesce(v_fat->>'canonical_fatura_id',
                                          v_f->>'canonical_fatura_id'),
          'descricao', coalesce(v_fat->>'descricao', v_f->>'descricao'),
          'sem_vinculo_fatura', false,
          'declarado_pelo_humano', false,
          -- o snapshot compara status/valor/competência daqui contra o vivo
          'fatura', jsonb_build_object(
            'canonical_fatura_id', coalesce(v_fat->>'canonical_fatura_id', v_f->>'canonical_fatura_id'),
            'descricao', v_f->>'descricao',
            'tipo_fatura', v_f->>'tipo_fatura',
            'competencia', v_f->>'competencia',
            'status', v_f->>'status',
            'data_pagamento', v_f->>'data_pagamento',
            'forma_pagamento', v_f->'forma_pagamento',
            'valor_pago', v_f->>'valor_pago',
            'valor_hoje', v_f->>'valor_hoje')));
      end loop;
      continue;
    end if;

    ------------------------------------------------------------- não resolveu
    v_motivo := coalesce(v_alu->>'motivo', 'item_nao_validado');

    -- Resgate ESTREITO: só desconto negociado escrito pelo humano.
    if coalesce((v_ent->>'declarado_pelo_humano')::boolean, false)
       and v_motivo in ('valor_declarado_nao_bate', 'sem_fatura_que_bata')
       and coalesce(nullif(v_ent->>'valor', '')::numeric, 0) > 0 then
      v_resp := sol_caixa_responsavel_aluno(p_unidade_id, v_ent->>'aluno_nome');
      if coalesce((v_resp->>'ok')::boolean, false) then
        v_valor := (v_ent->>'valor')::numeric;
        v_ordem := v_ordem + 1;
        v_soma  := v_soma + v_valor;
        v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
          'ordem', v_ordem,
          'aluno_nome', coalesce(v_resp->>'aluno_nome', v_ent->>'aluno_nome'),
          'responsavel_financeiro', v_resp->>'responsavel_nome',
          'valor', v_valor,
          'categoria', coalesce(nullif(v_ent->>'categoria', ''), 'parcela'),
          'competencia', to_char(coalesce(p_competencia,
            date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date), 'MM/YYYY'),
          'canonical_fatura_id', null,
          'descricao', null,
          'sem_vinculo_fatura', true,
          'declarado_pelo_humano', true,
          'fatura', null));
        continue;
      end if;
      -- aluno não identificável: a recusa dele é mais informativa que a minha
      v_motivo := case when v_resp->>'motivo' = 'ambiguo' then 'nome_ambiguo'
                       else coalesce(v_resp->>'motivo', v_motivo) end;
    end if;

    -- "não sei qual Davi" sem dizer QUANTOS Davis deixa a consultora sem saída.
    -- A composta recusa por ambiguidade mas não devolve a lista; buscá-la aqui
    -- custa uma chamada e só no caminho de RECUSA, que já é o caminho lento.
    if v_motivo = 'nome_ambiguo' and jsonb_typeof(v_alu->'candidatos') is distinct from 'array' then
      v_resp := sol_caixa_responsavel_aluno(p_unidade_id,
                  coalesce(v_alu->>'aluno_nome', v_ent->>'aluno_nome'));
    end if;

    return jsonb_build_object(
      'ok', false, 'motivo', v_motivo,
      'ordem', v_alu->>'ordem',
      'aluno_nome', coalesce(v_alu->>'aluno_nome', v_ent->>'aluno_nome'),
      'valor_declarado', v_alu->'valor_declarado',
      'valor_encontrado', v_alu->'valor_encontrado',
      'candidatos', case
         when jsonb_typeof(v_alu->'candidatos')  = 'array' then v_alu->'candidatos'
         when jsonb_typeof(v_resp->'candidatos') = 'array' then v_resp->'candidatos'
         else null end);
  end loop;

  -- Aritmética por último e sem perdão: lote parcial não existe.
  if p_valor_total is not null and abs(v_soma - p_valor_total) > 0.01 then
    return jsonb_build_object('ok', false, 'motivo', 'soma_itens_divergente',
      'soma_itens', v_soma, 'valor_total', p_valor_total);
  end if;
  if jsonb_array_length(v_linhas) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'itens_nao_validados');
  end if;

  return jsonb_build_object('ok', true, 'itens', v_linhas,
    'soma_itens', v_soma, 'valor_total', p_valor_total,
    'alunos', jsonb_array_length(coalesce(v_pag->'alunos', '[]'::jsonb)));
end $function$;

revoke execute on function public.sol_caixa_resolver_pagamento_itens_v1(uuid, jsonb, numeric, date)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_resolver_pagamento_itens_v1(uuid, jsonb, numeric, date)
  to service_role, sol_acesso_restrito;

comment on function public.sol_caixa_resolver_pagamento_itens_v1(uuid, jsonb, numeric, date) is
  'Projeta sol_caixa_resolver_pagamento_v1 na lista PLANA que o lote grava: uma '
  'linha por fatura, no formato que sol_caixa_validar_multi_aluno_snapshot_v1 e '
  'sol_caixa_lancar_recebimento_lote_v1 ja consomem. Nao reavalia regra de '
  'negocio nenhuma. Resgata valor declarado sem vinculo (desconto negociado) '
  'so quando o humano escreveu o valor e o aluno e identificavel.';

-- ROLLBACK: drop function public.sol_caixa_resolver_pagamento_itens_v1(uuid,jsonb,numeric,date);
--           (o bridge volta a `sol_caixa_resolver_multi_aluno_v1` trocando
--            `resolverMultiFn` no criarHandlerFinanceiro — env var, não deploy)
