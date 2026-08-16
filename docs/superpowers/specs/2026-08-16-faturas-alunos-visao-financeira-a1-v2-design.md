# Faturas de Alunos — Visão Financeira A1 v2

Data: 16/08/2026

Status: design aprovado; aguardando revisão deste documento antes do plano de implementação

Projeto: LA Report
Supabase: `ouqwbbermlzqqvtqwlul`

## Decisão de produto

A rota dedicada `/app/faturas` evolui de uma lista de inadimplência para a
visão global de faturas de alunos. Ela continua fora de contas a pagar, fluxo
de caixa e estratégia financeira; trata o ciclo de cada fatura de aluno.

O desenho aprovado é **A1 — Faturas + Operação**:

- página dedicada como fonte principal;
- estados financeiros visíveis: Todas, Pagas, Em aberto, Em atraso D+0, A
  vencer e Canceladas;
- cobrança é uma visão operacional dentro da página, não a definição de uma
  fatura;
- reconciliação financeira fica em Faturas, não na lista genérica de Alunos;
- Alunos e Comercial preservam atalhos para o mesmo contexto.

Esta é a evolução de produto da página A+C v1 já publicada. A v1 permanece
como registro da entrega operacional anterior; esta é a especificação vigente
para a expansão financeira.

## Universos e regras de negócio

| Conceito | Regra | Uso |
|---|---|---|
| Todas as faturas | todos os status do período | consulta financeira |
| Pagas | `status='paga'` | recebimentos e histórico |
| Em aberto | `status='aberta'`, vencidas ou a vencer | consulta financeira |
| Em atraso D+0 | aberta com vencimento anterior à data de corte | alerta financeiro |
| A vencer | aberta com vencimento igual ou posterior à data de corte | acompanhamento |
| Cobrar agora D+2 | subconjunto elegível de D+0 | equipe/Sol |
| Reconciliação | origem ou identidade incompleta | trabalho financeiro, nunca cobrança |

Os nomes **Em atraso · D+0** e **Cobrar agora · D+2** são obrigatórios na
interface. D+0 é um fato financeiro: venceu. D+2 é uma decisão operacional:
só após dois dias de atraso e todos os gates de segurança.

A Sol continua consumindo apenas o universo D+2 pelo contrato canônico de
inadimplência. A visualização D+0 não dispara nem autoriza mensagens.

## Período, grão e identidade

- Grão da tabela: uma linha por `unidade_id + canonical_fatura_id`.
- IDs Emusys são válidos somente junto de `unidade_id`.
- Duas matrículas ou dois cursos podem produzir duas faturas para a mesma
  pessoa; nome nunca deduplica uma fatura.
- A operação inicia em **3 competências**: mês selecionado e dois anteriores.
- A consulta financeira oferece **Mês** e **3 competências**. Intervalo livre
  e carteira de ex-alunos são uma fase posterior.
- Evadidos, inativos, ex-alunos e trancados ficam fora de **Cobrar agora ·
  D+2**. Podem aparecer no histórico financeiro do recorte, sempre rotulados
  como não elegíveis para cobrança ativa.

## Leitura financeira canônica

Criar uma RPC autenticada versionada, proposta como:

```sql
public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_modo_periodo text,
  p_status text
) returns jsonb
```

Ela é a leitura global de faturas. Não substitui
`get_inadimplencia_canonica`, que permanece como contrato operacional da Sol.

A RPC deve:

1. selecionar somente o último `sync_runs` live, completo e publicado de cada
   competência pedida;
2. ler `sync_run_items` desse run, nunca o espelho mutável como fonte de
   decisão;
3. enriquecer por `unidade_id + emusys_matricula_id`, nunca por nome;
4. devolver totais, linhas, frescor por competência e itens de reconciliação;
5. verificar unidade autorizada antes de devolver dados financeiros;
6. revogar `PUBLIC`/`anon` e conceder somente aos papéis autorizados.

O retorno terá, no mínimo:

```text
schema_version
status: ok | partial | stale | incomplete | error
periodo: { modo, competencias[] }
freshness: { last_sync_at, fresh_until, competencias_stale[] }
summary: { todas, pagas, abertas, em_atraso_d0, a_vencer, canceladas, cobrar_d2 }
items[]
reconciliation: { source_missing, identidade_invalida, validacao, forma_pagamento_ausente }
```

`get_faturas_alunos_financeiro_v1` e `get_inadimplencia_canonica` compartilham
uma função pura de valores monetários. Não haverá duas fórmulas de juros no
sistema.

## Valores da fatura

O Emusys fornece `valor_original`, `desconto_fixo`,
`desconto_condicional`, `desconto_aplicado`, `juros_e_multa` e `valor_pago`.
Na UI, as três faixas precisam ficar claras para a equipe e para o cliente:

| Rótulo | Regra | Exibição |
|---|---|---|
| Com desconto | `valor_original - desconto_fixo - desconto_condicional` | valor que seria pago em dia |
| Sem desconto condicional | `valor_original - desconto_fixo` | base após perder a pontualidade |
| Valor hoje | base vencida + multa 2% + mora 1% ao mês pro rata | aberta vencida |
| Valor pago | `valor_pago` do Emusys | paga; não é dívida atual |

Regra aprovada em 16/08/2026:

1. desconto fixo permanece após o vencimento;
2. somente o desconto condicional é perdido;
3. juros e multa incidem sobre a base sem desconto condicional;
4. cada cálculo é arredondado por fatura, em centavos, antes de somar;
5. `desconto_aplicado` e `juros_e_multa` do Emusys ficam como evidência da
   origem, sem criar fórmula concorrente;
6. a fórmula contratual é canônica até o snapshot preservar o juro dinâmico
   ao vivo com confiança;
7. antes de publicar, uma amostra de faturas vencidas é comparada item a item
   com `GET /faturas` ao vivo; toda diferença precisa de explicação.

Para fatura a vencer, **Valor hoje** equivale ao valor com desconto enquanto a
condição vigora. Para paga, a coluna se torna **Valor pago** e não finge ser o
valor atual de uma dívida.

## Forma de pagamento

Forma de pagamento tem duas semânticas e a tela não pode misturá-las:

| Estado | Rótulo de UI | Fonte |
|---|---|---|
| Paga | Pago via | `payload.forma_pagamento_transacao` da fatura |
| Aberta | Forma prevista | contrato/cobrança automática da matrícula |
| Sem cobertura | Forma não informada | reconciliação; sem palpite |

Exemplos: boleto, cheque, Pix, Pix automático, cartão de crédito, cartão
recorrente e cobrança automática. A tela preserva o texto da fonte. Uma forma
prevista jamais aparece como pagamento confirmado.

Levantamento de 16/08/2026: `forma_pagamento_transacao` existe no payload de
902 de 1.096 faturas de agosto. Para as abertas, a forma prevista local cobre
96 de 180; as demais aparecem como **Forma não informada** e entram em
reconciliação.

## Interface A1

### Cabeçalho e filtros

- título: **Faturas de Alunos**;
- subtítulo: **Visão financeira e operação de cobrança**;
- unidade, modo/período e botão **Atualizar agora**;
- faixa persistente de frescor: último sync, validade, status e origem;
- filtros de busca, período, status, curso, forma de pagamento e avançados.

Todos os filtros usam componentes globais do design system (`Select`,
`Popover`/menu). Não usar `<select>` nativo do Windows.

### Abas e cards

Abas: Todas as faturas, Pagas, Em aberto, Em atraso · D+0, A vencer,
Canceladas, Cobrar agora · D+2 e Reconciliação financeira.

Os cards mostram contagem e valor para Todas, Pagas, Em aberto, Em atraso D+0,
A vencer e a fila D+2. O card D+2 mostra pessoas elegíveis, não transforma
automaticamente o total D+0 em mensagem de cobrança.

### Tabela e detalhe

Colunas principais:

1. aluno / curso / matrícula;
2. competência;
3. situação;
4. vencimento;
5. **Com desconto**;
6. **Sem desconto condicional**;
7. **Valor hoje** ou **Valor pago**;
8. pagamento, com selo **Forma prevista** ou **Pago via**;
9. detalhe.

Em tela compacta, as três faixas monetárias e a forma de pagamento continuam
no detalhe, sem esconder situação nem vencimento.

## Frescor, fila e atualização

A tela permanece acessível quando o snapshot envelhece, mas dado velho nunca
é apresentado como pronto para cobrança:

| Estado | Consulta financeira | Cobrar agora D+2 |
|---|---|---|
| `ok` | dados confirmados | habilitado se os demais gates passarem |
| `partial` | dados conhecidos + pendências | somente confirmados e elegíveis |
| `stale` | fotografia datada e sinalizada | desabilitado |
| `incomplete` / `error` | erro e última fotografia identificada | desabilitado |

O worker financeiro atual roda a cada minuto, mas só processa trabalhos já
enfileirados. A evolução inclui um produtor controlado:

- competência atual: tentativa inicial a cada 15 minutos;
- duas anteriores: tentativa inicial a cada 60 minutos;
- uma competência por vez, com backoff para 429;
- atualização manual recebe prioridade, sem furar a fila;
- um job só é sucesso depois do snapshot completo das três unidades;
- 429, ID de matrícula inválido ou unidade incompleta vão para retry ou
  quarentena, nunca para sucesso silencioso.

Não há hoje webhook financeiro do Emusys integrado ao projeto. Se a origem
disponibilizar um, ele apenas enfileira a competência afetada; nunca grava uma
baixa diretamente nem pula a reconciliação.

## Reconciliação financeira dentro da página

A aba de reconciliação mostra listas e ações seguras por fatura:

- `source_missing`: reconsultar competência; nunca marcar como paga;
- identidade inválida: expor IDs e abrir a correção de vínculo apropriada;
- erro de validação: explicar motivo e permitir novo sync controlado;
- forma ausente: mostrar falta de cobertura sem inventar método;
- contato pendente: abrir ficha do aluno, sem liberar mensagem.

Esses itens não entram em totais confirmados, D+0 ou D+2 enquanto origem ou
identidade estiverem pendentes.

## Compatibilidade e fronteiras

Esta entrega não altera:

- `sol_caixa_lancar_recebimento`;
- `sol_caixa_abrir`;
- `sol_caixa_fechar`;
- `sol_caixa_casar_parcela`;
- envio de WhatsApp da Sol;
- pagamento, renegociação, cancelamento ou baixa de fatura;
- LA Teacher, agenda, presença ou domínio pedagógico.

A Sol segue consumindo `get_inadimplencia_canonica`. A alteração da fórmula
monetária chega a ela apenas pela função compartilhada e depois de reconciliação
controlada.

## Critérios de aceitação

1. cada aba retorna o universo correto por status; D+0 não vira D+2;
2. a tabela mostra os três valores e o rótulo correto de pagamento;
3. desconto fixo permanece e apenas o condicional é perdido;
4. paga mostra valor e meio efetivamente liquidados;
5. aberta sem forma não recebe valor inferido;
6. `source_missing` não vira paga nem compõe cobrança;
7. stale permite consulta identificada, mas bloqueia D+2;
8. fila respeita limite, backoff e não publica sucesso parcial;
9. browser não lê tabela de snapshot diretamente;
10. filtros do design system preservam estado na URL;
11. testes cobrem IDs repetidos entre unidades, segundo curso, desconto fixo e
    condicional,
    paga, vencida, a vencer, formas prevista/confirmada/ausente e frescor;
12. prova final compara amostra contra Emusys e valida DOM, console e reload.

## Risco residual

`juros_e_multa` do Emusys é dinâmico por consulta, mas o snapshot atual pode
gravá-lo como zero. A fórmula contratual continua como regra exibida até o sync
preservar essa evidência de modo confiável. A amostra ao vivo é gate de
publicação.
