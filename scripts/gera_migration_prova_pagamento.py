# Gera a migration que adiciona prova_pagamento na canonica de faturas.
# Edita o corpo vivo (extraido do banco) com substituicoes exatas e verifica
# que cada ancora aparece uma unica vez.

body = open('.tmp_out_canonica_live.sql', encoding='utf-8').read()

def troca(antigo: str, novo: str, nome: str) -> None:
    global body
    n = body.count(antigo)
    assert n == 1, f'{nome}: ancora aparece {n}x'
    body = body.replace(antigo, novo)

# --- 1. itens_reconciliacao: prova_pagamento + motivo pagamento_detectado ---
antigo1 = """  itens_reconciliacao as (
    select a.*,
      array_remove(array[
        case when a.source_missing and not a.substituta_viva then 'source_missing' end,
        case when a.identidade_invalida then 'identidade_invalida' end,
        case when not a.status_suportado then 'status_desconhecido' end,
        case when jsonb_array_length(a.validation_issues) > 0 then 'validacao_origem' end,
        case when a.forma_pagamento_nome is null then 'forma_pagamento_ausente' end,
        case when a.canonical_contact_status is not null
          and a.canonical_contact_status <> 'resolved' then 'contato_pendente' end
      ]::text[], null) as motivos
    from avaliadas a
    where (a.source_missing and not a.substituta_viva)"""

novo1 = """  itens_reconciliacao as (
    select a.*,
      coalesce(pp.tem_caixa, false) or coalesce(pp.tem_lancamento, false) as pagamento_detectado,
      pp.prova_pagamento,
      array_remove(array[
        case
          when a.source_missing and not a.substituta_viva
               and not (coalesce(pp.tem_caixa, false) or coalesce(pp.tem_lancamento, false))
            then 'source_missing'
          when a.source_missing and not a.substituta_viva
            then 'pagamento_detectado_fora_origem'
        end,
        case when a.identidade_invalida then 'identidade_invalida' end,
        case when not a.status_suportado then 'status_desconhecido' end,
        case when jsonb_array_length(a.validation_issues) > 0 then 'validacao_origem' end,
        case when a.forma_pagamento_nome is null then 'forma_pagamento_ausente' end,
        case when a.canonical_contact_status is not null
          and a.canonical_contact_status <> 'resolved' then 'contato_pendente' end
      ]::text[], null) as motivos
    from avaliadas a
    -- Prova de pagamento fora do snapshot: baixa manual no caixa linkada a
    -- fatura, ou lancamento bancario que a Rose reconciliou no Emusys
    -- (fatura_id exposto desde 23/09). So' roda para itens da fila.
    left join lateral (
      select
        exists (
          select 1 from public.caixa_movimentacoes m
          join public.emusys_faturas ef on ef.id = m.fatura_id
          where ef.unidade_id = a.unidade_id
            and ef.emusys_fatura_id = a.emusys_fatura_id
            and m.tipo = 'entrada'
        ) as tem_caixa,
        exists (
          select 1 from public.financeiro_emusys_lancamentos l
          where l.unidade_id = a.unidade_id
            and l.emusys_fatura_id = a.emusys_fatura_id
            and l.natureza = 'entrada' and l.sumiu_em is null
        ) as tem_lancamento,
        jsonb_build_object(
          'caixa', coalesce((
            select jsonb_agg(jsonb_build_object(
              'valor', m.valor,
              'data', m.data_movimento,
              'forma', m.forma_pagamento
            ) order by m.data_movimento)
            from public.caixa_movimentacoes m
            join public.emusys_faturas ef on ef.id = m.fatura_id
            where ef.unidade_id = a.unidade_id
              and ef.emusys_fatura_id = a.emusys_fatura_id
              and m.tipo = 'entrada'
          ), '[]'::jsonb),
          'lancamentos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'valor', l.valor,
              'data', l.data,
              'forma', l.forma_pagamento_descricao
            ) order by l.data)
            from public.financeiro_emusys_lancamentos l
            where l.unidade_id = a.unidade_id
              and l.emusys_fatura_id = a.emusys_fatura_id
              and l.natureza = 'entrada' and l.sumiu_em is null
          ), '[]'::jsonb)
        ) as prova_pagamento
    ) pp on true
    where (a.source_missing and not a.substituta_viva)"""

troca(antigo1, novo1, 'itens_reconciliacao')

# --- 2. resumo_reconciliacao: source_missing desconta detectados + novo contador ---
antigo2 = """      count(*) filter (where source_missing and not substituta_viva)::integer as source_missing,"""
novo2 = """      count(*) filter (where source_missing and not substituta_viva and not pagamento_detectado)::integer as source_missing,
      count(*) filter (where 'pagamento_detectado_fora_origem' = any(motivos))::integer as pagamento_detectado,"""
troca(antigo2, novo2, 'resumo_reconciliacao')

# --- 3. reconciliation json: emite o contador novo ---
antigo3 = """      'source_missing', rr.source_missing,"""
novo3 = """      'source_missing', rr.source_missing,
      'pagamento_detectado', rr.pagamento_detectado,"""
troca(antigo3, novo3, 'reconciliation json')

# --- 4. item da fila: emite prova_pagamento ---
antigo4 = """          'motivos', to_jsonb(i.motivos),
          'validation_issues', i.validation_issues,
          'source_missing_reason', i.source_missing_reason,"""
novo4 = """          'motivos', to_jsonb(i.motivos),
          'prova_pagamento', i.prova_pagamento,
          'validation_issues', i.validation_issues,
          'source_missing_reason', i.source_missing_reason,"""
troca(antigo4, novo4, 'item json')

# --- monta a migration ---
header = """-- 23/09/2026 — a fila de reconciliacao passa a enxergar a prova de pagamento
-- que JA existe no sistema, em vez de perguntar a equipe "o que foi conferido?"
-- quando o caixa ou o Emusys ja responderam.
--
-- prova_pagamento por item: { caixa: [{valor,data,forma}], lancamentos: [...] }
--   caixa       <- caixa_movimentacoes.fatura_id (link humano/Sol ou backfill)
--   lancamentos <- financeiro_emusys_lancamentos.emusys_fatura_id (a conciliacao
--                  da Rose, exposta pela API desde 23/09)
--
-- Semantica: source_missing + prova => motivo 'pagamento_detectado_fora_origem'
-- (sai do balde "fatura nao observada" — o dinheiro entrou, falta a origem
-- confirmar) e alimenta o contador novo 'pagamento_detectado'. Sem prova, nada
-- muda: source_missing continua pedindo decisao humana. Nenhum item some —
-- quem tinha prova continua listado com a evidencia anexada.
--
-- Pós-condicao sem md5 do corpo: o hash mudou de proposito; a checagem vira
-- estrutural (campo novo + ACL + ramo de fallback intactos).

"""

post = """
;

revoke all on function public.get_faturas_alunos_financeiro_v1_canonica_20260817(uuid,integer,integer,text,text,date) from public, anon;
grant execute on function public.get_faturas_alunos_financeiro_v1_canonica_20260817(uuid,integer,integer,text,text,date) to authenticated, service_role;

do $pos$
declare
  v_sig text := 'public.get_faturas_alunos_financeiro_v1_canonica_20260817(uuid,integer,integer,text,text,date)';
  v_def text := pg_get_functiondef(v_sig::regprocedure);
  v_falhas text[] := '{}';
begin
  if v_def not like '%prova_pagamento%' then
    v_falhas := v_falhas || 'campo prova_pagamento ausente no corpo';
  end if;
  if v_def not like '%pagamento_detectado_fora_origem%' then
    v_falhas := v_falhas || 'motivo pagamento_detectado_fora_origem ausente';
  end if;
  if has_function_privilege('anon', v_sig, 'EXECUTE') then
    v_falhas := v_falhas || 'executavel por anon';
  end if;
  if not has_function_privilege('authenticated', v_sig, 'EXECUTE') then
    v_falhas := v_falhas || 'authenticated PERDEU execute (a tela do financeiro depende dele)';
  end if;
  if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
    v_falhas := v_falhas || 'service_role SEM execute';
  end if;
  if v_def not like '%fallback_cadastro_pre_espelho%' then
    v_falhas := v_falhas || 'o ramo fallback_cadastro_pre_espelho sumiu';
  end if;
  if array_length(v_falhas,1) > 0 then
    raise exception E'POS-CONDICAO prova_pagamento NAO FECHOU:\n  %', array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'prova_pagamento ok: campo, motivo, ACL e fallback conferidos';
end $pos$;
"""

out = header + body + post
open('supabase/migrations/20260923170000_reconciliacao_prova_pagamento.sql', 'w', encoding='utf-8').write(out)
print('migration escrita:', len(out), 'chars')
