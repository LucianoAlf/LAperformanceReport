# Ticket médio de agosto: separação entre pagantes administrativos e base financeira

Data da correcao: 05/09/2026.

## Raiz do erro

A retificacao academica de agosto recompôs nove alunos que sairam apenas em
setembro. Ela atualizou corretamente o fechamento para 344 alunos ativos, 334
pagantes administrativos, 422 matriculas e churn de 8,38%.

O defeito teve duas camadas:

1. A retificação usou os 334 pagantes administrativos como denominador do
   ticket. Isso calculou `144.749,17 / 334 = 433,38` e substituiu a fotografia
   financeira fechada, cujo denominador correto era 325.
2. Mesmo depois de restaurar 325 no snapshot, alguns leitores descartavam o
   denominador explícito e voltavam a dividir o MRR por `alunos_pagantes`.

Ativos, pagantes administrativos e denominador financeiro do ticket são três
medidas diferentes. Nenhuma delas pode ser usada como atalho para outra.

## Contrato corrigido

- `alunos_pagantes`: KPI administrativo do fechamento de alunos.
- `alunos_pagantes_administrativos`: alias explícito publicado pela RPC.
- `ticket_denominador_pagantes`: quantidade da base financeira usada no ticket.
- `mrr_contratual`: receita contratual da mesma base financeira, incluindo
  parcelas pagas e inadimplentes conforme a regra canônica.
- `ticket_medio_contratual`: `mrr_contratual / ticket_denominador_pagantes`
  (R$ 445,38).

Para o Recreio em agosto, os valores coexistem sem conflito:

```text
alunos_pagantes = 334
ticket_denominador_pagantes = 325
mrr_contratual = 144749.17
ticket_medio_contratual = 445.38
```

`get_kpis_alunos_canonicos` preserva o KPI administrativo e publica o
denominador financeiro separadamente. Os snapshots e `dados_mensais` carregam
os campos financeiros aditivos. Os consumidores do Dashboard, Gestão Mensal,
Administrativo e relatório mensal usam o denominador financeiro; não existe
mais fallback de ticket por `alunos_pagantes`.

`dados_mensais.ticket_medio` e `faturamento_estimado` foram preservados como
campos legados acoplados. Os campos aditivos acima sao a fonte de fallback para
o financeiro; os leitores principais usam o snapshot canonico versionado.

## Contraprova em producao

Depois das migrations
`20260905192929_separa_base_financeira_ticket_recreio` e
`20260905195222_separa_pagantes_admin_denominador_ticket_rpc`. A migration
`20260905200225_restaura_acl_sol_kpis_ticket` preserva o acesso direto da Sol à
RPC pública e mantém a implementação-base restrita ao `service_role`.
A migration `20260905203015_remove_fallback_pagantes_admin_ticket` remove o
último fallback efetivo que ainda aceitava `alunos_pagantes` ou a cobertura
incidental de faturas como divisor. Ela não regrava dados: apenas substitui a
função de leitura.

| Unidade | Pagantes administrativos | MRR contratual | Denominador financeiro | Ticket médio |
| --- | ---: | ---: | ---: | ---: |
| Barra | 256 | R$ 114.251,65 | 256 | R$ 446,30 |
| Campo Grande | 382 | R$ 152.368,64 | 382 | R$ 398,87 |
| Recreio | 334 | R$ 144.749,17 | 325 | R$ 445,38 |

O mês aberto também prova que os campos não são sinônimos: em setembro, no
Recreio, a RPC devolveu 328 pagantes administrativos e denominador financeiro
327, mantendo o ticket financeiro em R$ 453,25.

No fechamento de agosto do Recreio, a mesma resposta canônica agora entrega
simultaneamente 344 ativos, 334 pagantes administrativos, 325 no denominador
financeiro, MRR de R$ 144.749,17 e ticket de R$ 445,38.

Os snapshots anteriores não foram alterados nem apagados. O backfill publicou
novas versões append-only para Barra e Campo Grande; o snapshot já corrigido do
Recreio foi preservado. A trilha foi gravada em
`fechamento_mensal_auditoria`.

As colunas legadas de `dados_mensais` continuam disponíveis por
compatibilidade. Os leitores novos priorizam
`ticket_denominador_pagantes`, `mrr_contratual` e
`ticket_medio_contratual`, impedindo que uma alteração futura na contagem
administrativa recalcule o ticket financeiro.

## Regra fail-closed

Para competência fechada, o leitor financeiro aceita somente
`financeiro_ticket_contratual.ticket_denominador_pagantes` ou
`ticket_denominador_pagantes` no snapshot `alunos_executivo`. Ele nunca usa
`alunos_pagantes`, `alunos_pagantes_canonicos`, alunos ativos ou quantidade de
pessoas encontradas nas faturas como substituto.

Se um fechamento legado não tiver o denominador financeiro explícito, os
campos de ticket e denominador retornam `null`, com a fonte
`indisponivel_sem_denominador_financeiro_explicito`. No consolidado, a ausência
em uma unidade torna o ticket total indisponível; não se publica uma média
parcial como se representasse as três unidades.

Para competência aberta, a origem é
`get_kpis_alunos_financeiro_vivo_canonico`: ela conta pessoas elegíveis com MRR
contratual, incluindo pagas e inadimplentes. O KPI administrativo de pagantes
continua publicado separadamente e não participa dessa divisão.

O relatório mensal também preserva essa fronteira: a RPC de faturas pode
enriquecer o valor efetivamente recebido, mas não sobrescreve MRR contratual,
denominador financeiro nem ticket vindos de `get_kpis_alunos_canonicos`.
