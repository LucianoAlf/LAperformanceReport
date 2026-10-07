-- VALOR DIVERGENTE NO LOTE MULTI-ALUNO (07/10/2026, Recreio)
--
-- Pix de R$ 863,20 com a legenda "parcela de outubro, A - R$ 431,60 / B - R$ 431,60".
-- As duas faturas de outubro estavam ABERTAS com R$ 489,92 cada (venceu 05/10, pagou
-- 07/10: perdeu o desconto de pontualidade e entrou juros). A escola autorizou cobrar
-- sem juros. O resolver devolvia `valor_declarado_nao_bate` e a Sol recusava o lote
-- inteiro ("não lanço parcialmente"). Com UM aluno a Sol já monta o card com valor
-- divergente; com vários, agora também:
--
--   • sol_caixa_resolver_pagamento_itens_v1: item que casou aluno + competência +
--     categoria com UMA fatura (aberta ou paga) e só difere no valor volta casado,
--     com `divergencia_valor`, `valor_fatura` e os campos que explicam a diferença.
--     A resposta é `ok:false, motivo:'valor_divergente', itens:[...]` — runtime
--     antigo trata como recusa comum (ordem migration → runtime é segura).
--     Soma ≠ comprovante, aluno ambíguo/não encontrado, competência/categoria que
--     não fecham e 2+ faturas candidatas continuam recusando.
--   • sol_caixa_validar_multi_aluno_snapshot_v1: item com divergência só passa com
--     `divergencia_aceita` + `divergencia_motivo` (≥ 3 caracteres) e com a fatura
--     ainda no valor que o card mostrou (`valor_fatura`). Lança o valor que ENTROU,
--     vinculado à fatura, e grava fatura/pago/diferença/motivo na descrição e no
--     snapshot (`divergencia`). Item sem divergência: idêntico.
--
-- Base viva lida em 07/10/2026 (SELECT-only): resolver md5 3415f646…, validador
-- md5 a2e2a380…. CREATE OR REPLACE preserva a ACL viva (postgres, service_role,
-- sol_acesso_restrito); conferir no readback. Nenhuma baixa no Emusys.
-- Rollback: supabase/rollbacks/20261007150000_sol_multi_valor_divergente_ROLLBACK.sql

CREATE OR REPLACE FUNCTION public.sol_caixa_resolver_pagamento_itens_v1(p_unidade_id uuid, p_itens jsonb, p_valor_total numeric, p_competencia date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- valor divergente com fatura única (20261007150000)
  v_vfat     numeric;
  v_comp_it  text;
  v_cat_it   text;
  v_cat_ok   boolean;
  v_div_n    int := 0;
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

    -- 🔴 VALOR DIVERGENTE COM FATURA ÚNICA (07/10/2026, Recreio). Pix de dois
    -- irmãos pago dois dias depois do vencimento: cada um casou aluno +
    -- competência + categoria com UMA fatura aberta, só o valor diferia (perdeu o
    -- desconto de pontualidade, entrou juros; a escola autorizou sem juros). A
    -- recusa "não lanço parcialmente" deixava o dinheiro fora do caixa. Aqui o
    -- item volta CASADO com a fatura, com o valor que ENTROU e o sinal
    -- `divergencia_valor`; quem decide é a equipe (motivo) e o "pode". Todo o
    -- resto continua recusando: mais de uma fatura candidata, competência ou
    -- categoria que não fecham, fatura cancelada.
    if v_motivo = 'valor_declarado_nao_bate'
       and jsonb_typeof(v_alu->'faturas') = 'array'
       and jsonb_array_length(v_alu->'faturas') = 1 then
      v_fat := v_alu->'faturas'->0;
      v_f := coalesce(v_fat->'fatura', v_fat);
      v_valor := nullif(v_ent->>'valor', '')::numeric;
      v_vfat := nullif(v_alu->>'valor_encontrado', '')::numeric;
      v_comp := coalesce(nullif(v_fat->>'competencia', ''), nullif(v_f->>'competencia', ''));
      if v_comp is not null and v_comp !~ '^[0-9]{2}/[0-9]{4}$' then
        v_comp := to_char(v_comp::date, 'MM/YYYY');
      end if;
      v_comp_it := nullif(btrim(coalesce(v_ent->>'competencia', '')), '');
      if v_comp_it is not null and v_comp_it !~ '^[0-9]{2}/[0-9]{4}$' then
        v_comp_it := case when v_comp_it ~ '^[0-9]{4}-[0-9]{2}' then to_char((left(v_comp_it, 7) || '-01')::date, 'MM/YYYY') else null end;
      end if;
      v_comp_it := coalesce(v_comp_it, to_char(coalesce(p_competencia,
        date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date), 'MM/YYYY'));
      v_cat_it := lower(coalesce(nullif(v_ent->>'categoria', ''), 'parcela'));
      v_cat_ok := (v_cat_it = 'parcela' and coalesce(v_f->>'tipo_fatura', '') = 'parcela')
               or (v_cat_it in ('passaporte', 'matricula')
                   and coalesce(v_f->>'tipo_fatura', '') in ('passaporte_taxa_matricula', 'matricula'));
      if nullif(coalesce(v_fat->>'canonical_fatura_id', v_f->>'canonical_fatura_id'), '') is not null
         and coalesce(v_f->>'status', '') in ('aberta', 'paga')
         and coalesce(v_valor, 0) > 0 and coalesce(v_vfat, 0) > 0
         and v_comp is not null and v_comp = v_comp_it
         and v_cat_ok then
        v_ordem := v_ordem + 1;
        v_soma  := v_soma + v_valor;
        v_div_n := v_div_n + 1;
        v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
          'ordem', v_ordem,
          'aluno_nome', coalesce(v_fat->>'aluno_nome', v_alu->>'aluno_nome'),
          'responsavel_financeiro', coalesce(v_fat->>'responsavel_financeiro',
                                             v_alu->>'responsavel_financeiro'),
          'valor', v_valor,
          'categoria', v_cat_it,
          'competencia', v_comp,
          'canonical_fatura_id', coalesce(v_fat->>'canonical_fatura_id', v_f->>'canonical_fatura_id'),
          'descricao', coalesce(v_fat->>'descricao', v_f->>'descricao'),
          'sem_vinculo_fatura', false,
          'declarado_pelo_humano', false,
          'divergencia_valor', true,
          'valor_fatura', v_vfat,
          'fatura', jsonb_build_object(
            'canonical_fatura_id', coalesce(v_fat->>'canonical_fatura_id', v_f->>'canonical_fatura_id'),
            'descricao', v_f->>'descricao',
            'tipo_fatura', v_f->>'tipo_fatura',
            'competencia', v_f->>'competencia',
            'status', v_f->>'status',
            'data_pagamento', v_f->>'data_pagamento',
            'forma_pagamento', v_f->'forma_pagamento',
            'valor_pago', v_f->>'valor_pago',
            'valor_hoje', v_f->>'valor_hoje',
            -- só para o card explicar a diferença em código (sem inventar)
            'data_vencimento', v_f->>'data_vencimento',
            'vencida', v_f->'vencida',
            'dias_atraso', v_f->'dias_atraso',
            'valor_com_desconto', v_f->>'valor_da_parcela',
            'valor_sem_desconto_condicional', v_f->>'valor_sem_desconto_condicional')));
        continue;
      end if;
      -- casou a fatura, mas não a competência/categoria do item: diz isso.
      if v_comp is not null and v_comp is distinct from v_comp_it then
        v_motivo := 'competencia_item_divergente';
      elsif not coalesce(v_cat_ok, false) then
        v_motivo := 'categoria_item_invalida';
      end if;
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

  -- Item com valor divergente NUNCA sai como ok: o runtime monta o card com a
  -- diferença e pede o motivo à equipe. Runtime antigo trata como recusa comum.
  if v_div_n > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'valor_divergente',
      'divergencias', v_div_n, 'itens', v_linhas,
      'soma_itens', v_soma, 'valor_total', p_valor_total);
  end if;

  return jsonb_build_object('ok', true, 'itens', v_linhas,
    'soma_itens', v_soma, 'valor_total', p_valor_total,
    'alunos', jsonb_array_length(coalesce(v_pag->'alunos', '[]'::jsonb)));
end $function$;

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
  -- valor divergente aceito pela equipe (20261007150000)
  v_div boolean;
  v_vfat numeric;
  v_mdiv text;
  v_desc_div text;
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

    v_div := coalesce((v_item->>'divergencia_valor')::boolean, false)
          or coalesce((v_item->>'divergencia_aceita')::boolean, false);
    v_vfat := null; v_mdiv := null;
    -- 🔴 VALOR DIVERGENTE (07/10/2026): só com a fatura exata, o motivo escrito
    -- pela equipe e o valor da fatura que o card mostrou. Sem motivo, não lança.
    if v_div then
      v_mdiv := left(nullif(btrim(coalesce(v_item->>'divergencia_motivo', '')), ''), 200);
      v_vfat := case when coalesce(v_item->>'valor_fatura', '') ~ '^[0-9]+([.][0-9]+)?$'
                     then (v_item->>'valor_fatura')::numeric end;
      if v_id is null or jsonb_typeof(v_item->'fatura_ids') = 'array'
         or coalesce(v_vfat, 0) <= 0 then
        return jsonb_build_object('ok', false, 'motivo', 'snapshot_divergencia_incompleta', 'ordem', v_ordem);
      end if;
      if not coalesce((v_item->>'divergencia_aceita')::boolean, false)
         or v_mdiv is null or length(v_mdiv) < 3 then
        return jsonb_build_object('ok', false, 'motivo', 'snapshot_divergencia_sem_motivo', 'ordem', v_ordem);
      end if;
    end if;

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
    if not v_div and v_ref is not null and coalesce(v_fatura->>'status','') = 'aberta'
       and nullif(v_fatura->>'data_vencimento','') is not null and v_ref <= (v_fatura->>'data_vencimento')::date
       and nullif(v_fatura->'valores'->>'valor_com_desconto','') is not null
       and abs((v_fatura->'valores'->>'valor_com_desconto')::numeric - v_valor) <= 0.01 then
      v_valor_atual := (v_fatura->'valores'->>'valor_com_desconto')::numeric;
    end if;
    -- Divergência aceita: a FATURA tem de continuar com o valor que o card
    -- mostrou; o valor lançado é o que entrou (v_valor).
    if v_valor_atual is null or abs(v_valor_atual - case when v_div then v_vfat else v_valor end) > 0.01 then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_valor_fatura_mudou', 'ordem', v_ordem,
        'valor_preview', case when v_div then v_vfat else v_valor end, 'valor_atual', v_valor_atual);
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

    v_desc_div := null;
    if v_div then
      v_desc_div := coalesce(v_fatura->>'descricao', initcap(v_categoria) || ' - ' || v_alu.nome)
        || ' · fatura R$ ' || replace(to_char(v_vfat, 'FM9999990.00'), '.', ',')
        || ' · pago R$ ' || replace(to_char(v_valor, 'FM9999990.00'), '.', ',')
        || ' · dif. ' || case when v_valor < v_vfat then '-' else '+' end
        || 'R$ ' || replace(to_char(abs(v_valor - v_vfat), 'FM9999990.00'), '.', ',')
        || ' · motivo (equipe): ' || v_mdiv;
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
      'descricao', coalesce(v_desc_div, v_fatura->>'descricao'),
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
    -- só o item com divergência ganha a chave: o resto fica byte a byte igual
    ) || case when v_div then jsonb_build_object('divergencia', jsonb_build_object(
        'valor_fatura', v_vfat, 'valor_pago', v_valor,
        'diferenca', round(v_valor - v_vfat, 2), 'motivo', v_mdiv)) else '{}'::jsonb end);
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
