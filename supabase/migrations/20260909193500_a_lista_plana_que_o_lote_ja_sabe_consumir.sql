-- A LISTA PLANA: uma linha por FATURA, que é o que o caixa grava.
--
-- 🔴 POR QUE ELA FALTAVA. O resolver do pagamento inteiro devolve `alunos[]`,
--    cada um com `faturas[]` — a forma certa para o card que a consultora lê
--    ("Davi: Harmonia 149 + Guitarra 380 + Teclado 367 + Canto 394"). Mas quem
--    grava é `sol_caixa_lancar_recebimento_lote_v1`, e ele insere **uma
--    movimentação por item da lista**, com um `fatura_id` cada. Sem projeção,
--    N alunos × N faturas nunca chegava ao caixa: era o buraco que fazia o
--    lançamento da Mayra (2 alunos, 5 faturas) morrer no meio.
--
-- ✅ O CAMINHO DE APROVAÇÃO NÃO PRECISOU MUDAR — conferido no texto vivo:
--    `sol_caixa_validar_multi_aluno_snapshot_v1` percorre `p_itens` e valida
--    cada um pelo **próprio** `canonical_fatura_id` + `emusys_student_id`, sem
--    exigir um aluno por linha. Duas linhas do mesmo aluno com faturas
--    diferentes passam limpo. E a invariante do lote compara
--    `itens gravados = itens do payload`, que continua verdadeira com a lista
--    plana. Ou seja: o contrato do "pode" já suportava isto; faltava alguém
--    entregar na forma certa.
--
-- ⚠️ ISTO É PROJEÇÃO, NÃO REGRA. Nenhuma condição de negócio é reavaliada aqui:
--    quem escolhe fatura é a composta/canônica/casador, quem valida no "pode" é
--    o snapshot, quem grava é o lote. Reimplementar qualquer uma delas seria a
--    causa-raiz das duplicatas de renovação.
--
-- ⚠️ AS TRÊS VIAS ENTREGAM FORMAS DIFERENTES e a normalização mora aqui, num
--    lugar só: a composta devolve o item já no formato do caixa (com `fatura`
--    aninhada), a canônica e o casador devolvem a fatura **crua**. Normalizar
--    no bridge deixaria a regra em JavaScript.
--
-- ⚠️ O RESGATE DO VALOR DECLARADO SEM VÍNCULO É DELIBERADO e limitado. Desconto
--    negociado (caso Jhon/CG, 01/09) não casa com fatura nenhuma e o legado o
--    lançava sem vínculo — vincular a fatura errada suja a carteira do aluno,
--    que é pior que não vincular. Aqui isso só vale quando o humano ESCREVEU o
--    valor e o aluno é identificável; ambiguidade e aluno inexistente seguem
--    recusa. O `sol_caixa_responsavel_aluno` é reusado justamente para não ter
--    uma segunda regra de identidade.

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
    if v_motivo = 'nome_ambiguo' and v_alu->'candidatos' is null then
      v_resp := sol_caixa_responsavel_aluno(p_unidade_id,
                  coalesce(v_alu->>'aluno_nome', v_ent->>'aluno_nome'));
    end if;

    return jsonb_build_object(
      'ok', false, 'motivo', v_motivo,
      'ordem', v_alu->>'ordem',
      'aluno_nome', coalesce(v_alu->>'aluno_nome', v_ent->>'aluno_nome'),
      'valor_declarado', v_alu->'valor_declarado',
      'valor_encontrado', v_alu->'valor_encontrado',
      'candidatos', coalesce(v_alu->'candidatos', v_resp->'candidatos'));
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
  from public, anon;
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
