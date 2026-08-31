-- Lançamento perdido no restart do deploy (Kailane/Barra, 31/08 16:31).
--
-- A Kailane aprovou com "pode" às 16:31:51 e o lançamento NÃO aconteceu:
-- `caixa.log` registra `pode_sem_pendencia` porque o bridge tinha sido
-- reiniciado 27 s antes (16:31:24) para o deploy do dia, e naquele momento as
-- pendências ainda viviam só na memória do processo. A causa está corrigida
-- (reidratação do ledger V3, PR #284) — mas a pendência deste caso já expirou a
-- janela de 30 min, então não há o que reidratar: é dado a repor.
--
-- O dinheiro entrou: comprovante "Sua compra foi aprovada — R$ 399,00", cartão
-- de crédito, e o Emusys já registra a fatura como PAGA hoje
-- (emusys_fatura_id 15447, "Taxa de Matrícula do curso de Canto", pago via
-- Cartão de Crédito, data_pagamento 2026-08-31).
--
-- ⚠️ POR QUE UPDATE/INSERT E NÃO A RPC AUDITADA: `sol_caixa_lancar_recebimento`
-- exige o par preview+approval V3 vindo do WhatsApp, e o preview foi justamente
-- o que se perdeu. A autorização humana EXISTIU e está registrada (mensagem
-- "pode" da Kailane, 16:31:51, no log e no grupo). Reponho com escopo mínimo e
-- rastro explícito em `sol_caixa_lancamento_auditoria`.
--
-- ⚠️ CATEGORIA `passaporte`, não `parcela`: a fatura casada por valor exato é a
-- Taxa de Matrícula (`tipo_fatura = passaporte_taxa_matricula`), que é o que a
-- legenda da Kailane dizia ("PASSAPORTE R$399,00 2x"). O card original trouxe a
-- parcela de R$ 460 atrasada — o erro que a migration 20260831210000 corrige.
--
-- Idempotente: o WHERE NOT EXISTS impede segunda inserção.

begin;

insert into caixa_movimentacoes
  (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
   forma_pagamento, categoria, descricao, valor, criado_por, responsavel,
   cartao_modalidade, cartao_parcelas, aluno_id, fatura_id)
select 'c7381868-4b6c-4791-aa2d-e2b8fb542331', '368d47f5-2d88-4475-bc14-ba084a9a348e',
       '2026-08-31', 'venda', 'entrada',
       'cartao', 'passaporte', 'Passaporte/Taxa de Matrícula - Luiza Silva Araújo', 399.00,
       'sol-agente:manutencao:sistema',
       'Kailane autorizou (16:31) · reposto por manutenção após restart do bridge',
       'credito', 2, 2469, 'dab46aea-8935-4a18-9a3d-c5bef7e12069'
where not exists (
  select 1 from caixa_movimentacoes
  where caixa_diario_id = 'c7381868-4b6c-4791-aa2d-e2b8fb542331'
    and valor = 399.00 and aluno_id = 2469
);

insert into sol_caixa_lancamento_auditoria
  (ator_numero, ator_papel, chat_id, unidade_id, data_caixa, payload, resultado, motivo,
   movimentacao_id, caixa_diario_id)
select 'sistema', 'manutencao', 'correcao-dados-31ago',
       '368d47f5-2d88-4475-bc14-ba084a9a348e', '2026-08-31',
       jsonb_build_object(
         'valor', '399.00', 'forma', 'cartao', 'categoria', 'passaporte',
         'aluno_id', 2469, 'fatura_id', 'dab46aea-8935-4a18-9a3d-c5bef7e12069',
         'emusys_fatura_id', '15447',
         'aprovacao_humana', 'Kailane, mensagem "pode" em 2026-08-31 16:31:51 BRT'),
       jsonb_build_object('ok', true, 'via', 'reposicao_lancamento_perdido_no_restart')::text,
       'O "pode" da Kailane caiu em pode_sem_pendencia porque o bridge foi reiniciado 27s antes para deploy e as pendencias viviam so em memoria. Causa corrigida pela reidratacao do ledger V3 (PR #284); esta pendencia expirou a janela e foi reposta a mao. Fatura confirmada paga no Emusys (15447, Taxa de Matricula, cartao de credito, 31/08).',
       m.id, 'c7381868-4b6c-4791-aa2d-e2b8fb542331'
from caixa_movimentacoes m
where m.caixa_diario_id = 'c7381868-4b6c-4791-aa2d-e2b8fb542331'
  and m.valor = 399.00 and m.aluno_id = 2469
  and not exists (
    select 1 from sol_caixa_lancamento_auditoria a
    where a.movimentacao_id = m.id
      and a.resultado like '%reposicao_lancamento_perdido_no_restart%'
  );

commit;
