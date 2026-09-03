-- Reparo do rótulo dos 2 lançamentos do lote de 02/09 10:20 BRT (Campo Grande),
-- gravados ANTES do fix da migration 20260902215535_lote_descricao_diz_de_quem.
--
-- Contexto: o lote multi-aluno gravava `descricao` sem identificar a pessoa. A
-- Mayra (ADM CG) relatou isso em 02/09 sobre o lote das 16:53 (Arthur e Daniel
-- Da Hora Marinho), que já foi reparado às 18:56 junto com o fix da função.
-- Este par das 10:20 do MESMO dia passou despercebido e continuou só com o curso.
--
-- ⚠️ OS NOMES NÃO SÃO INFERIDOS: saem de `sol_caixa_lote_itens_v1`
-- (lote 1ab141e7-7828-4129-a6a7-30801eb15d35), que guardou `aluno_nome` e
-- `responsavel_financeiro` no ato do lançamento. O texto final aplica a MESMA
-- regra da função corrigida: nome anexado quando não está contido na base, e
-- responsável idem. A Lidiane é aluna de Bateria E responsável financeira da
-- filha Manuela — por isso o item dela não leva "· resp.", exatamente o caso
-- "responsável de si mesmo" que a função evita.
--
-- ⚠️ POR QUE UPDATE E NÃO A RPC AUDITADA: o caixa de 02/09 da CG está FECHADO
-- (caixa_diario 7ef4120b-1e35-4fbd-8f95-61880f420aff) e
-- `sol_caixa_corrigir_movimento_v1` recusa com `caixa_fechado`, além de exigir
-- approval V3 vindo do WhatsApp. Reabrir um dia fechado para consertar rótulo de
-- texto seria desproporcional e alteraria o histórico de fechamento — que é o que
-- a trava protege. Mesmo caminho já usado em 20260829201000 (caso Soraia).
--
-- ⚠️ ESCOPO MÍNIMO: só `descricao`. Valor (377,00 cada), forma (pix), categoria,
-- `aluno_id` (235 e 268) e `fatura_id` já estavam corretos. Nenhum saldo muda —
-- descrição não entra em soma, e ambos são Pix.
--
-- Idempotente: o WHERE casa o texto antigo; reexecutar não faz nada.

begin;

update caixa_movimentacoes
set descricao = 'Parcela 09/2026 do curso de Bateria - Lidiane Maria Barbosa Lima Dias'
where id = '9dbac55a-f9c5-474b-81e2-314924fa45b3'
  and descricao = 'Parcela 09/2026 do curso de Bateria';

update caixa_movimentacoes
set descricao = 'Parcela 09/2026 do curso de Guitarra - Manuela Lima Dias · resp. Lidiane Maria Barbosa Lima Dias'
where id = '786bb968-8fc8-405f-9614-754f12fa6f55'
  and descricao = 'Parcela 09/2026 do curso de Guitarra';

insert into sol_caixa_lancamento_auditoria
  (ator_numero, ator_papel, chat_id, unidade_id, data_caixa, payload, resultado, motivo,
   movimentacao_id, caixa_diario_id)
select 'sistema', 'manutencao', 'correcao-dados-03set',
       '2ec861f6-023f-4d7b-9927-3960ad8c2a92', '2026-09-02',
       jsonb_build_object(
         'descricao_antes', v.antes,
         'descricao_depois', v.depois,
         'campos_tocados', jsonb_build_array('descricao'),
         'valor_inalterado', '377.00',
         'fonte_do_nome', 'sol_caixa_lote_itens_v1 (lote 1ab141e7-7828-4129-a6a7-30801eb15d35)'),
       jsonb_build_object('ok', true, 'via', 'update_manutencao_caixa_fechado'),
       'Lote multi-aluno gravado antes do fix 20260902215535: a descricao saia sem identificar a pessoa, so com o curso, e a tela do caixa mostra a descricao. Nome e responsavel restaurados do proprio registro do lote. Raiz corrigida em sol_caixa_lancar_recebimento_lote_v1.',
       v.mov_id::uuid, '7ef4120b-1e35-4fbd-8f95-61880f420aff'
from (values
  ('9dbac55a-f9c5-474b-81e2-314924fa45b3',
   'Parcela 09/2026 do curso de Bateria',
   'Parcela 09/2026 do curso de Bateria - Lidiane Maria Barbosa Lima Dias'),
  ('786bb968-8fc8-405f-9614-754f12fa6f55',
   'Parcela 09/2026 do curso de Guitarra',
   'Parcela 09/2026 do curso de Guitarra - Manuela Lima Dias · resp. Lidiane Maria Barbosa Lima Dias')
) as v(mov_id, antes, depois)
where not exists (
  select 1 from sol_caixa_lancamento_auditoria a
  where a.movimentacao_id = v.mov_id::uuid
    and a.resultado like '%update_manutencao_caixa_fechado%'
);

commit;
