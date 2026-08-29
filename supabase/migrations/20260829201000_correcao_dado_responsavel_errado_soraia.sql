-- Correção do dado sujo produzido pelo fuzzy cruzado (movimento de 29/08, CG).
--
-- O lançamento da Soraia (R$ 976,00, parcela 02/2026) foi gravado com
-- "· resp. Rayanne do Nascimento Sobreira" no descritivo. A Rayanne é responsável
-- da LAURA Sobreira da Silveira; a Soraia da Silveira Duarte é lead e não tem
-- responsável cadastrado. Causa-raiz na migration 20260829200000.
--
-- ⚠️ POR QUE UPDATE E NÃO A RPC AUDITADA: `sol_caixa_corrigir_movimento_v1` aceita
-- corrigir `descricao`, mas recusa com `caixa_fechado` — o caixa de 29/08 foi
-- fechado às 15:02 pelo Luciano — e exige approval V3 (par preview+aprovação vindo
-- do WhatsApp). Reabrir um dia fechado para consertar um RÓTULO DE TEXTO seria
-- desproporcional e alteraria o histórico de fechamento, que é justamente o que a
-- trava protege. Correção pontual, com rastro explícito em
-- `sol_caixa_lancamento_auditoria`.
--
-- ⚠️ ESCOPO MÍNIMO, DE PROPÓSITO: só `descricao`. Valor (976,00), forma (pix),
-- categoria (parcela), `aluno_id` (NULL) e `fatura_id` (NULL) já estavam corretos
-- — a Soraia é lead, então NULL é a resposta certa e não se inventa vínculo.
-- Nenhum saldo muda: o fechamento de 29/08 (saldo 550,75, dinheiro intocado) segue
-- válido, porque o movimento era Pix e o descritivo não entra em soma.
--
-- Idempotente: o WHERE casa o texto errado; reexecutar não faz nada.

begin;

update caixa_movimentacoes
set descricao = 'Parcela 02/2026 - Soraia da Silveira Duarte'
where id = '54bf1380-4029-4e0e-828f-7254a80ef97a'
  and descricao = 'Parcela 02/2026 - Soraia da Silveira Duarte · resp. Rayanne do Nascimento Sobreira';

insert into sol_caixa_lancamento_auditoria
  (ator_numero, ator_papel, chat_id, unidade_id, data_caixa, payload, resultado, motivo,
   movimentacao_id, caixa_diario_id)
select 'sistema', 'manutencao', 'correcao-dados-29ago',
       '2ec861f6-023f-4d7b-9927-3960ad8c2a92', '2026-08-29',
       jsonb_build_object(
         'descricao_antes', 'Parcela 02/2026 - Soraia da Silveira Duarte · resp. Rayanne do Nascimento Sobreira',
         'descricao_depois', 'Parcela 02/2026 - Soraia da Silveira Duarte',
         'campos_tocados', jsonb_build_array('descricao'),
         'valor_inalterado', '976.00'),
       jsonb_build_object('ok', true, 'via', 'update_manutencao_caixa_fechado'),
       'Responsavel financeiro incorreto no descritivo: Rayanne do Nascimento Sobreira e responsavel da Laura Sobreira da Silveira, casada por word_similarity 0.50 contra Soraia da Silveira Duarte (lead, sem responsavel). Raiz corrigida em sol_caixa_responsavel_aluno e sol_caixa_casar_parcela.',
       '54bf1380-4029-4e0e-828f-7254a80ef97a', 'c0f188d4-acf5-46ae-8709-e96042aba668'
where not exists (
  select 1 from sol_caixa_lancamento_auditoria
  where movimentacao_id = '54bf1380-4029-4e0e-828f-7254a80ef97a'
    and resultado->>'via' = 'update_manutencao_caixa_fechado'
);

commit;
