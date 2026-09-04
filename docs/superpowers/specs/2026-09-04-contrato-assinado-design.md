# Contrato assinado no LA Report — desenho aprovado

## Objetivo

Fazer o LA Report refletir, sem escrita no Emusys e sem inferência jurídica, o estado de assinatura do contrato atual de cada matrícula. A Ficha do Aluno passa a mostrar a verdade da fonte e `get_situacao_alunos_v1` passa a entregar ao TOM um estado confiável e sua frescura. O TOM permanece em observação até a validação humana dos contratos legados.

## Limite comprovado da fonte

O `GET /matriculas?status=ativa` expõe apenas `contrato_atual.contrato_assinado:boolean` sobre assinatura. Uma varredura dos nomes de campos em 1.168 matrículas ativas das três unidades não encontrou modo eletrônico/manual, data da assinatura manual, data de solicitação, assinatura da escola ou estado aguardando aluno. O OpenAPI expõe somente `/matriculas` para contrato.

Consequências:

- `true` significa que o Emusys informa contrato assinado;
- `false` significa somente que o Emusys não o informa como assinado; não significa “nunca enviado” nem “aguardando aluno”;
- o LA Report registra `contrato_status_observado_em`, nunca `contrato_assinado_em`;
- não são modelados modo, data manual ou estágio intermediário.

## Persistência e granularidade

A tabela `aluno_contratos_emusys` tem grão `(unidade_id, emusys_matricula_id, contrato_emusys_id)`. `contrato_emusys_id` pode ser nulo exclusivamente para representar uma matrícula ativa observada sem `contrato_atual`. O vínculo local `aluno_id` é opcional para que órfãos da integração não sejam descartados.

Campos de negócio:

- `contrato_assinado boolean`: obrigatório quando existe contrato e nulo quando não existe;
- `contrato_status_observado_em timestamptz`: última vez em que aquele estado foi visto;
- `origem text`: `snapshot_backfill` ou `api_reconciliacao`;
- `payload_hash text`: trilha técnica sem duplicar dados pessoais.

A tabela é fechada para clientes. Somente `service_role` escreve; leitura operacional ocorre por RPC autorizada.

As execuções ficam em `contrato_assinatura_sync_execucoes`, com estados `running`, `succeeded` e `failed`, contagens, páginas, erro e timestamps. Falha deixa registro; ausência de sucesso fresco também é tratada como estado não verificado.

## Reconciliação e frescura

A Edge Function `sync-contratos-assinatura-emusys`:

1. aceita somente chamada técnica autorizada;
2. seleciona uma unidade por slug;
3. chama `GET /matriculas?status=ativa&limite=50&token=...`;
4. segue o cursor até `tem_mais=false`;
5. faz upsert pelo grão completo, sempre incluindo a unidade;
6. registra sucesso ou falha de forma durável.

Cada unidade é executada separadamente antes das 06:00 BRT. O dado é fresco somente quando existe execução `succeeded` concluída na data civil de referência em `America/Sao_Paulo`. Não haver sucesso hoje prevalece sobre o último booleano armazenado: o estado público vira `nao_verificado`.

## Backfill

A migration preenche `aluno_contratos_emusys` a partir de `emusys_matriculas_estado_atual.payload_snapshot`, sem consultar nem escrever no Emusys. Só entram snapshots cujo campo `contrato_atual.contrato_assinado` seja booleano; matrículas observadas sem `contrato_atual` recebem a linha sentinela de contrato nulo. O backfill não altera `alunos`.

## Regra por pessoa

São relevantes todas as linhas operacionais ativas cujo curso não tenha `cursos.is_projeto_banda=true`. Esse indicador é a dispensa explícita já usada para banda, coral e atividades extras; o catálogo atual dispensado deve ser documentado.

Precedência conservadora do estado por pessoa:

1. `dispensado`: nenhuma matrícula acadêmica relevante;
2. `nao_verificado`: rodada da unidade não está fresca, matrícula sem ID seguro ou matrícula sem observação;
3. `sem_contrato`: ao menos uma matrícula relevante foi observada sem `contrato_atual`;
4. `nao_assinado`: todas foram verificadas, todas têm contrato, e ao menos uma possui `contrato_assinado=false`;
5. `assinado`: todas as matrículas relevantes possuem `contrato_assinado=true`.

A pessoa só fica verde quando todas as matrículas acadêmicas relevantes estão assinadas. O instante exposto na pessoa é o menor `contrato_status_observado_em` entre as matrículas relevantes, pois a leitura é tão fresca quanto seu componente mais antigo.

## Contrato da RPC

`get_situacao_alunos_v1` preserva `tem_data_contrato` e recebe campos aditivos:

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

Nenhum desses campos entra automaticamente em `pendencias` durante o rollout sombra. O TOM só volta a cobrar após a ativação explícita do legado.

## Interface

O cabeçalho da Ficha do Aluno mostra um selo somente leitura: `Contrato assinado`, `Não assinado no Emusys`, `Sem contrato no Emusys`, `Não verificado` ou `Contrato dispensado`. O selo inclui tooltip/frescor sem sugerir data jurídica.

Na aba Acadêmico, a seção Contrato repete o estado e `Observado pelo LA Report em ...`. Abaixo das datas editáveis aparece: “Início e fim representam o período das aulas; não comprovam assinatura.” O estado não pode ser editado.

## Rollout

O lançamento inicial é `shadow`. A persistência, a RPC e a interface entram no ar, mas o recorte de contrato do TOM continua desativado. A ativação exige:

1. nome confirmado pela equipe de um contrato assinado;
2. nome confirmado de um contrato não assinado;
3. confronto dos dois com a API;
4. definição documentada do corte para contratos antigos em papel;
5. observação sem cobranças automáticas.

