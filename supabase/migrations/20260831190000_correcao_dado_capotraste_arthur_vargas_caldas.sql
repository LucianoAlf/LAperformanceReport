-- Correção do dado sujo do capotraste (movimento de 31/08, Barra, R$ 40).
--
-- A legenda dizia "Venda capotraste para o aluno Arthur Vargas", mas a guarda de
-- remetente descartou o aluno declarado (o ADM que enviou também se chama Arthur
-- — homônimo), e a correção "Aluno foi Arthur Vargas Caldas" foi extraída com o
-- "foi" grudado. Resultado: descricao "Lojinha - foi Arthur Vargas Caldas" e
-- lançamento SEM vínculo, apesar de o aluno existir (alunos.id = 1653, ativo).
-- Causa-raiz corrigida no runtime da Sol em 31/08 (patch raiz-31ago: rótulo de
-- aluno vence a heurística de remetente + extrator tira o lixo verbal).
--
-- ⚠️ POR QUE UPDATE E NÃO A RPC AUDITADA: `sol_caixa_corrigir_movimento_v1`
-- exige o par preview+aprovação V3 vindo do WhatsApp. O Arthur ABRIU essa
-- correção pelo fluxo auditado às 17:58 UTC (movimento_operacao_preview_enviado),
-- mas o restart do bridge para o deploy do fix comeu a pendência em memória
-- antes do "pode" dele. Correção pontual de escopo mínimo, com rastro explícito.
--
-- ⚠️ ESCOPO MÍNIMO: descricao + aluno_id. Valor (40,00), forma (cartao) e
-- categoria (lojinha) já estavam corretos. Nenhum saldo muda.
--
-- Idempotente: o WHERE casa o texto errado; reexecutar não faz nada.

begin;

update caixa_movimentacoes
set descricao = 'Lojinha - Arthur Vargas Caldas',
    aluno_id = 1653
where id = '52104c69-1228-4d42-ae83-02af3791cf3c'
  and descricao = 'Lojinha - foi Arthur Vargas Caldas';

insert into sol_caixa_lancamento_auditoria
  (ator_numero, ator_papel, chat_id, unidade_id, data_caixa, payload, resultado, motivo,
   movimentacao_id, caixa_diario_id)
select 'sistema', 'manutencao', 'correcao-dados-31ago',
       '368d47f5-2d88-4475-bc14-ba084a9a348e', '2026-08-31',
       jsonb_build_object(
         'descricao_antes', 'Lojinha - foi Arthur Vargas Caldas',
         'descricao_depois', 'Lojinha - Arthur Vargas Caldas',
         'aluno_id_antes', null,
         'aluno_id_depois', 1653,
         'campos_tocados', jsonb_build_array('descricao', 'aluno_id'),
         'valor_inalterado', '40.00'),
       jsonb_build_object('ok', true, 'via', 'update_manutencao_caixa_aberto')::text,
       'Prefixo "foi" grudado no nome pelo extrator de nome-tardio e vinculo perdido pela guarda de remetente (homonimo). Aluno confirmado: Arthur Vargas Caldas (id 1653, ativo, Barra). Raiz corrigida no runtime (patch raiz-31ago); a correcao V3 aberta pelo Arthur as 17:58 UTC foi perdida no restart do deploy.',
       '52104c69-1228-4d42-ae83-02af3791cf3c', 'c7381868-4b6c-4791-aa2d-e2b8fb542331'
where not exists (
  select 1 from sol_caixa_lancamento_auditoria
  -- `resultado` e' text no schema; o marcador via LIKE evita depender de cast
  where movimentacao_id = '52104c69-1228-4d42-ae83-02af3791cf3c'
    and resultado like '%update_manutencao_caixa_aberto%'
);

commit;
