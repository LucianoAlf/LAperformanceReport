-- Fecha as duas duplicatas que sobraram do lote por contrato (20260810141701).
-- As duas ficaram de fora la porque nao tem parcela emitida no Emusys -- Noah e
-- bolsista (mensalidade 0) e a matricula do Daniel esta inativa -- entao o
-- criterio "contrato que estreia em 2026" nao alcancava nenhuma das duas. A
-- evidencia veio por outro caminho, e e igualmente objetiva:
--
--   Noah (mov 3451): os dois registros sao IDENTICOS -- mesma competencia
--   (2026-08), mesmo curso (Guitarra), mesmo status (pendente_validacao), e ele
--   tem UMA matricula (675). Dois lancamentos identicos nao podem ser duas
--   renovacoes distintas da mesma matricula. Fica o mais antigo (3345,
--   03/07), que e o original; 3451 (28/07) e a reentrega.
--
--   Daniel Duque (mov 3330): o contrato_atual da matricula 994 e o 2572, com
--   mensalidade 405 -- exatamente o valor do registro de agosto (3407, 385 ->
--   405), que ainda por cima carrega o emusys_matricula_id. O registro de julho
--   dizia 385 -> 423,50, valor que nao existe em contrato nenhum dele.
--
-- Sobram 5 alunos com 2 renovacoes vigentes em 2026, todos de proposito:
-- Perola, Gabriel Mello, Kamilly e Maria Clara tem 2 MATRICULAS com 2 contratos
-- novos (renovacao dupla legitima), e Carlos Eduardo tem 4 matriculas ativas com
-- os 2 registros em cursos diferentes (Canto e Contrabaixo) -- plausivel, e ele
-- e bolsista, entao nao ha parcela para confirmar. Fica para a unidade decidir.

do $$
declare
  v_afetados integer;
begin
  update public.movimentacoes_admin m
     set anulado = true,
         anulado_motivo = case m.id
           when 3451 then 'Duplicata: registro identico ao 3345 (mesma competencia 2026-08, mesmo curso, mesmo status) e o aluno tem uma unica matricula (675). Mantido o original 3345.'
           when 3330 then 'Duplicata: o contrato atual da matricula 994 e o 2572, mensalidade 405 -- valor do registro de agosto (3407), que tem o emusys_matricula_id. Este registro trazia 423,50, valor inexistente em contrato. Mantido 3407.'
         end,
         anulado_em = now(),
         anulado_por = 'auditoria-emusys-contratos-2026-08-10'
   where m.id in (3451, 3330)
     and m.tipo = 'renovacao'
     and not m.anulado;

  get diagnostics v_afetados = row_count;

  if v_afetados <> 2 then
    raise exception 'ANULACAO_RENOVACAO_CONTAGEM_INESPERADA: esperado 2, afetado %', v_afetados;
  end if;
end $$;
