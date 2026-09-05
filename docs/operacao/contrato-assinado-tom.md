# Contrato assinado — contrato de leitura do TOM

## Estado do rollout

**SHADOW / observação.** A persistência, a reconciliação, a RPC e a Ficha do Aluno podem ser publicadas, mas o TOM não deve cobrar contrato ainda. A ativação depende da validação humana de um caso assinado e um não assinado e da definição do corte para contratos legados em papel.

O recorte antigo baseado em `tem_data_contrato` continua existindo por compatibilidade, mas não comprova assinatura e não deve ser usado para reativar a cobrança.

## Fonte e limites

A fonte é exclusivamente `GET https://api.emusys.com.br/v1/matriculas?status=ativa`, autenticado com `?token=`. O LA Report nunca escreve no Emusys.

O Emusys expõe `contrato_atual.contrato_assinado:boolean`. Não expõe:

- data real da assinatura;
- modo eletrônico ou manual;
- data de assinatura manual;
- data em que a assinatura foi solicitada;
- assinatura da escola;
- estado “aguardando assinatura do aluno”.

Por isso, `false` não autoriza dizer “nunca enviado” nem “aguardando o responsável”. Significa somente “o Emusys não informa este contrato como assinado”. `contrato_status_observado_em` é quando o LA Report viu o estado; não é data jurídica da assinatura.

## Persistência

Tabela `public.aluno_contratos_emusys`, grão `(unidade_id, emusys_matricula_id, contrato_emusys_id)`:

| Campo | Tipo | Significado |
|---|---|---|
| `unidade_id` | `uuid` | Unidade do Emusys; parte obrigatória da identidade. |
| `emusys_matricula_id` | `text` | ID da matrícula dentro da unidade. |
| `emusys_aluno_id` | `text nullable` | ID do aluno dentro da unidade, para rastreio. |
| `aluno_id` | `integer nullable` | Vínculo local, quando encontrado. |
| `contrato_emusys_id` | `text nullable` | ID do contrato atual; nulo é a linha sentinela “matrícula observada sem contrato”. |
| `contrato_assinado` | `boolean nullable` | Booleano cru do Emusys; nulo somente quando não existe contrato atual. |
| `contrato_status_observado_em` | `timestamptz` | Quando o LA Report observou o estado. Não é data de assinatura. |
| `origem` | `text` | `snapshot_backfill` ou `api_reconciliacao`. |
| `payload_hash` | `text nullable` | Rastro técnico sem duplicar o payload pessoal. |

Execuções ficam em `public.contrato_assinatura_sync_execucoes`. O TOM não lê sucesso de `pg_cron`; lê a conclusão real `status='succeeded'` dessa tabela, exposta pela RPC. `running` é rodada aberta e `failed` contém `erro` e `completed_at`.

## RPC do TOM

Continuar chamando:

```text
get_situacao_alunos_v1(
  p_unidade_id uuid,
  p_referencia date,
  p_apenas_pendentes boolean
)
```

Os campos existentes permanecem com a mesma semântica. Em especial, `tem_data_contrato:boolean` continua dizendo apenas se existe data de início do período contratual.

Campos novos por pessoa:

| Campo | Tipo | Uso |
|---|---|---|
| `contrato_assinatura_status` | `text` | Estado canônico descrito abaixo. |
| `contratos_assinados_todos` | `boolean nullable` | `true` somente se todas as matrículas relevantes estão assinadas; nulo se não verificado ou dispensado. |
| `contratos_relevantes` | `integer` | Matrículas acadêmicas ativas exigidas. |
| `contratos_assinados` | `integer` | Relevantes observadas com `true`. |
| `contratos_nao_assinados` | `integer` | Relevantes observadas com `false`. |
| `contratos_sem_contrato` | `integer` | Relevantes observadas sem `contrato_atual`. |
| `contratos_nao_verificados` | `integer` | Relevantes sem ID seguro ou sem observação. |
| `contrato_status_observado_em` | `timestamptz nullable` | Observação mais antiga entre as matrículas relevantes; não é assinatura. |
| `contrato_reconciliado_em` | `timestamptz nullable` | Conclusão da última rodada válida no dia BRT da referência. |
| `contrato_dado_fresco` | `boolean` | `true` somente com rodada do dia e sem matrícula relevante não verificada. |

Enquanto o rollout estiver em shadow, chamar com `p_apenas_pendentes=false` e observar os campos novos sem adicioná-los à pauta. Quando o legado for ativado, só cobrar linhas com `contrato_dado_fresco=true` e status `nao_assinado` ou `sem_contrato`.

Se `contrato_dado_fresco=false` ou o status for `nao_verificado`, o TOM deve dizer “não conferi contratos hoje” e não cobrar ninguém.

## Estados

- `assinado`: todas as matrículas acadêmicas ativas relevantes vieram com `contrato_assinado=true`. Não informa quando nem como assinaram.
- `nao_assinado`: ao menos uma matrícula relevante veio com `false`. Não distingue nunca enviado de assinatura em andamento.
- `sem_contrato`: ao menos uma matrícula relevante foi observada sem `contrato_atual`. Não significa matrícula inativa.
- `nao_verificado`: falta rodada fresca, ID seguro ou observação completa. Não autoriza afirmar assinado ou pendente.
- `dispensado`: não existe matrícula acadêmica relevante porque todas estão explicitamente dispensadas. Não significa contrato assinado.

## Regra por pessoa

A pessoa fica `assinado` somente quando **todas** as matrículas acadêmicas ativas relevantes estão assinadas. Um aluno de dois cursos não fica verde com apenas um contrato assinado. A escolha é conservadora porque o ato existe no grão matrícula/contrato, enquanto o TOM apresenta pessoas.

A precedência é: `dispensado` → `nao_verificado` → `sem_contrato` → `nao_assinado` → `assinado`. Assim, dado incompleto nunca é transformado em cobrança.

## Dispensa de banda, coral e atividades extras

Uma matrícula é dispensada somente quando seu curso possui `cursos.is_projeto_banda=true`. Não há inferência por nome no cálculo. No catálogo verificado durante a implementação, essa flag cobre Canto Coral, Circuito de Férias 1 e 2, GarageBand, Minha Banda Para Sempre, Percussion Kids, Power Kids e Teoria Musical.

Se uma nova atividade precisar de dispensa, a classificação do curso deve ser corrigida explicitamente; o TOM não deve manter uma lista paralela.

## Frequência e frescura

Horários diários em `America/Sao_Paulo`:

- principal: Campo Grande 05:00, Recreio 05:10, Barra 05:20;
- retry condicional: Campo Grande 05:30, Recreio 05:40, Barra 05:50.

O retry responde `skipped_fresh` quando a rodada principal já concluiu. Cada rodada pagina com limite 50 até `tem_mais=false`, respeita 60 requisições/minuto e só publica o lote depois de validar todas as páginas.

Qualquer falha após a abertura da rodada grava `failed`. Sem `succeeded` no dia BRT, `contrato_reconciliado_em` fica nulo, `contrato_dado_fresco=false` e a leitura pública falha para `nao_verificado`.

## Backfill e legado

O backfill inicial usa apenas `emusys_matriculas_estado_atual.payload_snapshot`; não chama a API e não altera `alunos`. Snapshot com contrato malformado ou sem booleano não vira “sem contrato”: fica sem observação confiável.

Há centenas de `false`, e contratos antigos assinados em papel podem estar nesse grupo. O corte de legado ainda não está definido. Antes de mudar este documento para `ATIVO` e religar o TOM:

1. registrar o nome confirmado pela equipe de um aluno assinado e confrontar com a API;
2. registrar o nome confirmado de um aluno não assinado e confrontar com a API;
3. definir por unidade/data quais contratos em papel são dispensados ou tratados fora da automação;
4. observar uma janela sem cobrança e revisar falsos positivos;
5. ativar o recorte de contrato em mudança separada e explícita.

Os casos técnicos Théo, matrícula 865 da Barra (`true`), e Giulia, matrícula 867 (`false`), provaram a diferença do booleano na auditoria da API. Eles não substituem o registro formal do corte de legado para ativar cobranças.
