# Assinatura eletrônica de contrato — contrato de leitura do TOM

## Estado do rollout

**BLOQUEADO PARA COBRANÇA / somente observação.** A persistência, a reconciliação, a RPC e a Ficha do Aluno permanecem ativas, mas o TOM não deve cobrar contrato. O `false` da API também representa contrato assinado manualmente e renovação automática sem nova assinatura eletrônica; portanto, nenhum corte de legado consegue separar pendência real.

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

Contraprova tela a tela no Recreio, confrontada com a reconciliação da API das 05:10 de 05/09/2026 (`origem='api_reconciliacao'`):

| Matrícula | Aluno | API `contrato_assinado` | Tela do Emusys |
|---:|---|:---:|---|
| 32 | Beatriz Souto Machado | `false` | Assinado · modo manual · 23/05/2026 |
| 78 | Josué Salazar N. G. Poças | `false` | Assinado · modo manual · 07/08/2026 |
| 169 | Nathan Leggett de Moura | `false` | Assinado · modo manual · 28/05/2026 |
| 328 | Lucas Cseko e Silva | `false` | Assinado · modo manual · 02/07/2026 |
| 394 | Catarina Petrolongo Pinto Abreu | `false` | Assinado · modo manual · 23/06/2026 |
| 409 | Manuela Chermont (Garage Band) | `false` | Assinado · modo manual · 17/06/2026 |
| 167 | Bruna Silva de Sá Vale | `true` | Assinado eletronicamente |
| 416 | Yuri de Souza Ribeiro | `true` | Assinado eletronicamente |

Resultado observado: seis de seis assinaturas manuais retornaram `false`; duas de duas assinaturas eletrônicas retornaram `true`. Assim, `true` é evidência positiva confiável de assinatura eletrônica. `false` significa apenas **sem assinatura eletrônica informada pela API**: pode haver assinatura manual e não é pendência. `contrato_status_observado_em` é quando o LA Report viu o estado; não é data jurídica da assinatura.

Renovações são automáticas no Emusys: quem assinou uma vez não necessariamente assina outra vez na renovação. Logo, uma renovação com `false` também não pode ser cobrada como contrato pendente.

## Persistência

Tabela `public.aluno_contratos_emusys`, grão `(unidade_id, emusys_matricula_id, contrato_emusys_id)`:

| Campo | Tipo | Significado |
|---|---|---|
| `unidade_id` | `uuid` | Unidade do Emusys; parte obrigatória da identidade. |
| `emusys_matricula_id` | `text` | ID da matrícula dentro da unidade. |
| `emusys_aluno_id` | `text nullable` | ID do aluno dentro da unidade, para rastreio. |
| `aluno_id` | `integer nullable` | Vínculo local, quando encontrado. |
| `contrato_emusys_id` | `text nullable` | ID do contrato atual; nulo é a linha sentinela “matrícula observada sem contrato”. |
| `contrato_assinado` | `boolean nullable` | Booleano cru do fluxo eletrônico do Emusys; `false` não exclui assinatura manual. Nulo somente quando não existe contrato atual. |
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
| `contratos_assinados_todos` | `boolean nullable` | `true` somente se todas as matrículas relevantes vieram com evidência positiva de assinatura eletrônica; `false` não significa contrato pendente. Nulo se não verificado ou dispensado. |
| `contratos_relevantes` | `integer` | Matrículas acadêmicas ativas exigidas. |
| `contratos_assinados` | `integer` | Relevantes observadas com `true`, isto é, assinatura eletrônica confirmada. |
| `contratos_nao_assinados` | `integer` | Nome técnico legado: conta relevantes observadas com `false`; não significa contrato não assinado nem pendência. |
| `contratos_sem_contrato` | `integer` | Relevantes observadas sem `contrato_atual`. |
| `contratos_nao_verificados` | `integer` | Relevantes sem ID seguro ou sem observação. |
| `contrato_status_observado_em` | `timestamptz nullable` | Observação mais antiga entre as matrículas relevantes; não é assinatura. |
| `contrato_reconciliado_em` | `timestamptz nullable` | Conclusão da última rodada válida no dia BRT da referência. |
| `contrato_dado_fresco` | `boolean` | `true` somente com rodada do dia e sem matrícula relevante não verificada. |

Enquanto o fornecedor não expuser modo e data de assinatura, chamar com `p_apenas_pendentes=false` apenas para observação. O status `sem_assinatura_eletronica` nunca entra na pauta como pendência. Nem frescura nem corte por data tornam `false` seguro para cobrança.

Se `contrato_dado_fresco=false` ou o status for `nao_verificado`, o TOM deve dizer “não conferi contratos hoje” e não cobrar ninguém.

## Estados

- `assinado`: todas as matrículas acadêmicas ativas relevantes vieram com `contrato_assinado=true`; significa assinatura eletrônica confirmada. Não informa a data real da assinatura.
- `sem_assinatura_eletronica`: ao menos uma matrícula relevante veio com `false`. Pode estar assinada manualmente e não significa pendência.
- `sem_contrato`: ao menos uma matrícula relevante foi observada sem `contrato_atual`. Não significa matrícula inativa.
- `nao_verificado`: falta rodada fresca, ID seguro ou observação completa. Não autoriza afirmar assinado ou pendente.
- `dispensado`: não existe matrícula acadêmica relevante porque todas estão explicitamente dispensadas. Não significa contrato assinado.

## Regra por pessoa

A pessoa fica `assinado` somente quando **todas** as matrículas acadêmicas ativas relevantes têm evidência positiva de assinatura eletrônica. Um aluno de dois cursos não fica verde com apenas um `true`. Esse estado é confirmação positiva; qualquer outro estado é inconclusivo para cobrança.

A precedência é: `dispensado` → `nao_verificado` → `sem_contrato` → `sem_assinatura_eletronica` → `assinado`. Nenhum dos quatro primeiros estados autoriza cobrança automática.

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

Nas três unidades há 1.030 matrículas com `false`, incluindo contratos assinados manualmente. O recorte de contrato **não pode ser ativado enquanto o Emusys não expuser modo e data de assinatura** no `contrato_atual`. Não é uma questão de definir corte de legado: o dado atual não distingue assinado manualmente de não assinado.

Antes de mudar este documento para `ATIVO` e religar o TOM:

1. aguardar o fornecedor expor `modo_assinatura` e `data_assinatura` dentro de `contrato_atual` no `GET /matriculas`;
2. reconferir as mesmas oito matrículas da tabela acima;
3. confirmar que as seis assinaturas manuais aparecem como assinadas e preservam modo/data;
4. definir a nova regra por pessoa usando os campos efetivamente entregues;
5. manter o recorte de contrato bloqueado para cobrança enquanto modo e data de assinatura não forem expostos.

O pedido ao fornecedor já foi feito. A persistência atual deve ser mantida: ela preserva a série observada e permitirá comparar o campo novo quando a API passar a expô-lo.
