# Contrato assinado no LA Report — desenho vigente

## Objetivo

Fazer o LA Report refletir, sem escrita no Emusys, o estado de assinatura do contrato atual de cada matrícula. A Ficha do Aluno mostra o estado somente leitura e `get_situacao_alunos_v1` entrega a consolidação por pessoa com frescura suficiente para o TOM.

## Fonte e limite comprovado

Desde 05/09/2026, `GET /matriculas?status=ativa` devolve `contrato_atual.contrato_assinado=true` para assinatura manual e eletrônica. O payload não ganhou `modo_assinatura` nem `data_assinatura`; o normalizador continua lendo o mesmo booleano.

- `true` confirma que o contrato atual está assinado, sem informar modo ou data;
- `false` significa que a assinatura ainda não foi concluída;
- `false` não distingue contrato nunca enviado de escola já assinada aguardando o aluno;
- o LA Report registra `contrato_status_observado_em`, nunca uma data de assinatura inventada.

## Persistência e reconciliação

`aluno_contratos_emusys` preserva o grão `(unidade_id, emusys_matricula_id, contrato_emusys_id)`. IDs do Emusys nunca são usados sem a unidade. `contrato_assinatura_sync_execucoes` registra todas as rodadas como `running`, `succeeded` ou `failed`.

A Edge `sync-contratos-assinatura-emusys` pagina `status=ativa&limite=50&token=...`, valida o lote completo e publica por RPC transacional. O cron mantém a guarda `skipped_fresh`. Uma chamada extraordinária pode usar `force=1`, mas somente com `x-sync-token` válido; o bypass não altera horários, persistência, logging nem cálculo de frescura.

## Regra por pessoa

São relevantes todas as matrículas acadêmicas ativas cujo curso não possua `cursos.is_projeto_banda=true`.

Precedência:

1. `dispensado`: nenhuma matrícula acadêmica relevante;
2. `nao_verificado`: rodada não fresca, matrícula sem ID seguro ou sem observação;
3. `sem_contrato`: ao menos uma relevante sem `contrato_atual`;
4. `nao_assinado`: todas foram verificadas e ao menos uma veio com `contrato_assinado=false`;
5. `assinado`: todas as relevantes vieram com `contrato_assinado=true`.

Uma pessoa com dois cursos só fica `assinado` quando os dois contratos relevantes estão assinados. Banda, coral e atividade extra são dispensados exclusivamente pela flag do curso, nunca por nome.

## Contrato da RPC

`get_situacao_alunos_v1` preserva `tem_data_contrato` e acrescenta:

- `contrato_assinatura_status text`;
- `contratos_assinados_todos boolean`;
- `contratos_relevantes integer`;
- `contratos_assinados integer`;
- `contratos_nao_assinados integer`;
- `contratos_sem_contrato integer`;
- `contratos_nao_verificados integer`;
- `contrato_status_observado_em timestamptz`;
- `contrato_reconciliado_em timestamptz`;
- `contrato_dado_fresco boolean`.

Sem frescura, o estado público é `nao_verificado`. O TOM pode cobrar `nao_assinado` e `sem_contrato`, mas não pode atribuir a etapa ou o responsável pela pendência.

## Interface

O cabeçalho e a aba Acadêmico mostram `Contrato assinado`, `Não assinado`, `Sem contrato no Emusys`, `Contrato não verificado` ou `Contrato dispensado`. O estado é somente leitura. A observação informa quando o LA Report viu o dado; as datas de início e fim continuam explicitamente descritas como período de aulas, não assinatura.

## Rollout

As oito matrículas de contraprova do Recreio — `32`, `78`, `169`, `328`, `394`, `409`, `167` e `416` — devem permanecer `true` no canário operacional. Na medição de 05/09/2026, o total das três unidades passou de 138 assinadas / 1.030 falsas para 933 assinadas / 238 não assinadas.

O LA Report está liberado para o TOM depois da publicação desta versão e de uma reconciliação fresca nas três unidades. O acionamento de `CONTRATO_NA_PAUTA` continua fora deste repositório.
