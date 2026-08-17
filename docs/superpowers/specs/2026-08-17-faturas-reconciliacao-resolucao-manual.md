# Especificação — Reconciliação de faturas resolvida na operação

## Objetivo

Permitir que a equipe resolva, na página **Faturas de Alunos**, as inconsistências financeiras que são operacionais, sem transformar uma decisão humana em pagamento confirmado no Emusys e sem manter ex-alunos ou lançamentos avulsos na fila de cobrança.

## Regras

1. A fatura continua canônica no `sync_run_items`; a decisão da equipe é um complemento auditável.
2. `source_missing` não significa pago. A equipe registra o motivo operacional e a fatura não muda de status.
3. Forma de pagamento escolhida no LA Report atualiza o cadastro local e grava `matriculas_campos_fixados`, para sobreviver ao próximo sync.
4. Toda decisão exige unidade, matrícula/fatura Emusys quando disponíveis, tipo, observação, autor e horário.
5. Cruzamentos usam `unidade_id + identificador Emusys`; nunca nome isolado.
6. Ex-aluno, matrícula inativa/trancada e lançamento financeiro sem aluno não aparecem na fila principal de reconciliação. Permanecem no histórico informativo.
7. A reconciliação não altera `sync_run_items`, não marca fatura como paga e não muda os totais canônicos.
8. A equipe vê nome, unidade, competência, situação, motivo e ação; IDs técnicos ficam no detalhe.

## Decisões permitidas

- Pagamento confirmado pela unidade;
- Renovação / primeira parcela em nova data;
- Trancamento;
- Última parcela / aviso prévio;
- Conferido — não cobrar nesta competência;
- Forma de pagamento manual, com seleção da tabela ativa de formas de pagamento.

## Resultado esperado

Após a decisão, a pendência sai da fila operacional no próximo carregamento, mas continua rastreável em auditoria e não altera a verdade financeira do Emusys.
