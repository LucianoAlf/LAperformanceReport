-- RAIZ do "card com a fatura errada" no caixa da Sol (Kailane/Barra, 31/08 16:28).
--
-- CASO REAL: comprovante de R$ 399 (Taxa de Matrícula = "passaporte", vencendo
-- no próprio dia). A aluna também tinha uma Parcela 08/2026 de R$ 460 vencida em
-- 15/08. A Sol montou o card com a PARCELA: "Atrasada há 16 dias — hoje com
-- multa/mora R$ 471,65" + "o comprovante (R$ 399) difere do valor da parcela".
-- A consultora respondeu três vezes que estava errado.
--
-- POR QUE: a cascata de escolha desta função tem o ramo `atrasada` em PRIMEIRO
-- lugar e ele **não olha `p_valor`** — o valor do comprovante só era usado no
-- ramo 2 (fatura já paga). Ou seja, existindo qualquer parcela vencida, ela
-- ganhava de uma fatura cujo valor batia EXATAMENTE com o que foi pago.
--
-- PROVADO em produção antes do fix (aluno com duas faturas abertas de valores
-- diferentes): `sol_caixa_parcela_canonica(..., 'Davi Guilherme ...', 460)`
-- devolvia a atrasada de R$ 355 com `motivo_escolha = 'atrasada'`.
--
-- REGRA NOVA: **valor exato manda**. Se UMA única fatura da janela bate no
-- centavo com o valor do comprovante (em qualquer das leituras de valor:
-- contratado, sem desconto condicional, com multa/mora de hoje, ou pago), ela é
-- a escolhida — antes de qualquer heurística de atraso. É o mesmo princípio já
-- adotado no runtime: evidência forte vence heurística.
--
-- ⚠️ AMBIGUIDADE NÃO ESCOLHE: com 2+ faturas de mesmo valor (comum — mensalidade
-- se repete todo mês), o ramo novo NÃO decide e a cascata antiga roda intacta.
-- Isso mantém zero regressão para o caso mais frequente.
--
-- ⚠️ Aplicado por replace COM GUARDA sobre o corpo vivo, nunca transcrito à mão:
-- a função tem regra financeira (descontos, multa, janela) que não se deve
-- reescrever de memória.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.sol_caixa_parcela_canonica(uuid,text,numeric,date)'::regprocedure);
  v_anc_decl text := '  v_status_env text;';
  v_new_decl text := '  v_status_env text;
  v_n_valor int;';
  v_anc text := '  select x into v_esc from jsonb_array_elements(v_itens) x
   where x->>''status'' = ''aberta'' and coalesce((x->''cobranca''->>''d0'')::boolean,false)
   order by (x->>''data_vencimento'')::date limit 1;
  if v_esc is not null then v_motivo := ''atrasada''; end if;';
  v_new text := '  -- RAIZ (31/08): valor exato do comprovante manda sobre "a mais atrasada".
  -- Sem isto, quem tem parcela vencida recebia o card dela mesmo pagando outra
  -- coisa (caso Kailane/Barra: taxa de R$ 399 virou parcela de R$ 460 atrasada).
  -- So decide quando o casamento e UNICO; empate cai na cascata antiga.
  if p_valor is not null then
    select count(*) into v_n_valor
    from jsonb_array_elements(v_itens) x
    where coalesce(x->>''status'','''') <> ''cancelada''
      and (
        abs(coalesce((x->''valores''->>''valor_com_desconto'')::numeric, -1) - p_valor) < 0.01
        or abs(coalesce((x->''valores''->>''valor_sem_desconto_condicional'')::numeric, -1) - p_valor) < 0.01
        or abs(coalesce((x->''valores''->>''valor_hoje'')::numeric, -1) - p_valor) < 0.01
        or abs(coalesce((x->''valores''->>''valor_pago'')::numeric, -1) - p_valor) < 0.01
      );
    if v_n_valor = 1 then
      select x into v_esc
      from jsonb_array_elements(v_itens) x
      where coalesce(x->>''status'','''') <> ''cancelada''
        and (
          abs(coalesce((x->''valores''->>''valor_com_desconto'')::numeric, -1) - p_valor) < 0.01
          or abs(coalesce((x->''valores''->>''valor_sem_desconto_condicional'')::numeric, -1) - p_valor) < 0.01
          or abs(coalesce((x->''valores''->>''valor_hoje'')::numeric, -1) - p_valor) < 0.01
          or abs(coalesce((x->''valores''->>''valor_pago'')::numeric, -1) - p_valor) < 0.01
        )
      limit 1;
      if v_esc is not null then v_motivo := ''valor_exato''; end if;
    end if;
  end if;

  if v_esc is null then
  select x into v_esc from jsonb_array_elements(v_itens) x
   where x->>''status'' = ''aberta'' and coalesce((x->''cobranca''->>''d0'')::boolean,false)
   order by (x->>''data_vencimento'')::date limit 1;
  if v_esc is not null then v_motivo := ''atrasada''; end if;
  end if;';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n <> 1 then
    raise exception 'ANCORA cascata atrasada: esperava 1 ocorrencia, achei %. Corpo mudou - revisar.', v_n;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_anc_decl, ''))) / length(v_anc_decl);
  if v_n <> 1 then
    raise exception 'ANCORA declare: esperava 1 ocorrencia, achei %.', v_n;
  end if;
  v_def := replace(v_def, v_anc_decl, v_new_decl);
  v_def := replace(v_def, v_anc, v_new);
  execute v_def;
end $$;

revoke execute on function public.sol_caixa_parcela_canonica(uuid,text,numeric,date) from anon;

commit;
