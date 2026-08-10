-- A renovacao da Catarina Petrolongo (Recreio) esta na competencia errada.
--
-- O QUE ACONTECEU: existiam dois registros. O 3178 veio do webhook do Emusys,
-- com renovacao_primeira_aula_novo_ciclo preenchida e competencia julho; o 3280
-- foi lancado a mao em 02/06, sem a data da 1a aula, e por isso caiu em junho
-- (classificarRenovacaoPorCompetencia usa dataMovimento quando nao ha 1a aula).
-- Alguem DELETOU o 3178 -- o do webhook, que era o correto. Sobrou o manual.
--
-- Efeito: o relatorio de julho lista a Catarina (o snapshot foi tirado quando o
-- 3178 ainda existia) e a tabela nao tem mais esse registro. Foi esse caso que
-- levou a ADM do Recreio a remover o nome dela a mao do relatorio, achando que
-- ela era de junho. Ela e de julho.
--
-- PROVA (GET /matriculas?aluno_id=667, contrato_atual):
--   contrato 2535, data_original_primeira_aula = 2026-07-03
--   mensalidade 480 - desconto_condicional 61,05 = 418,95, que e exatamente o
--   valor_parcela_novo do registro (399 -> 418,95).
-- Pela regra confirmada (competencia = mes da 1a aula do novo ciclo), julho.
--
-- Preenche tambem renovacao_primeira_aula_novo_ciclo, que estava nula: sem ela o
-- registro nao carrega a evidencia da propria classificacao, e um recalculo
-- futuro o jogaria de volta para junho.
--
-- LICAO: DELETE em movimentacoes_admin deixa o snapshot mensal apontando para um
-- registro inexistente e nao ha rastro de por que. Por isso duplicata agora e
-- ANULADA (coluna `anulado`, 20260810134205), nunca deletada.

do $$
declare
  v_afetados integer;
begin
  update public.movimentacoes_admin
     set competencia_referencia = date '2026-07-01',
         renovacao_primeira_aula_novo_ciclo = date '2026-07-03',
         renovacao_antecipada = true,
         renovacao_status = 'antecipada_confirmada',
         updated_at = now()
   where id = 3280
     and tipo = 'renovacao'
     and not anulado
     and competencia_referencia = date '2026-06-01';

  get diagnostics v_afetados = row_count;

  if v_afetados <> 1 then
    raise exception 'CORRECAO_CATARINA_INESPERADA: esperado 1 linha, afetado %', v_afetados;
  end if;
end $$;
