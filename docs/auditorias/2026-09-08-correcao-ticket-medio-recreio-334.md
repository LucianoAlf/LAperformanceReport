# Correção do ticket médio de agosto/2026 — Recreio

Data da confirmação: 08/09/2026.

## Resultado correto

O fechamento confirmado pela secretaria do Recreio é:

```text
alunos ativos = 344
alunos pagantes = 334
matrículas ativas = 422
MRR contratual = R$ 144.749,17
denominador do ticket = 334
ticket médio = R$ 144.749,17 / 334 = R$ 433,38
```

`alunos_pagantes` e `ticket_denominador_pagantes` continuam sendo campos com
semânticas independentes. Eles apenas têm o mesmo valor neste fechamento porque
a base financeira confirmada para agosto também contém os 334 pagantes,
incluindo os inadimplentes. A correção não cria fallback global de uma medida
para a outra.

## Causa raiz

A retificação acadêmica de 05/09 corrigiu nove saídas que só ocorreram em
setembro. O fechamento passou de 335 ativos e 325 pagantes para 344 ativos e 334
pagantes. Nesse momento, os snapshots ficaram corretamente em R$ 433,38.

A migration financeira seguinte (`20260905192929`) separou corretamente os
campos administrativo e financeiro, mas congelou como denominador financeiro o
número anterior à reposição: 325. Como o MRR já era o retificado de
R$ 144.749,17, o sistema passou a calcular R$ 445,38.

A evolução dos snapshots comprova a regressão:

| Domínio | Versão correta | Versão que regrediu | Estado antes desta correção |
| --- | --- | --- | --- |
| `alunos_executivo` | v4: 334 / R$ 433,38 | v5: 325 / R$ 445,38 | v6: 325 / R$ 445,38 |
| `relatorio_gerencial` | v5: 334 / R$ 433,38 | v6: 325 / R$ 445,38 | v7: 325 / R$ 445,38 |
| `relatorio_admin_mensal` | v5: 334 / R$ 433,38 | v6: 325 / R$ 445,38 | v7: 325 / R$ 445,38 |

Os nove alunos repostos em agosto foram Caetano Leão Barradas, Abraão Teles
Seabra, David Kayat A. Mansour, Gabriel Ferreira Marques Machado, Sara Ferreira
Machado, Isabella Boscardini Moreira, Lara Carvalho Rocha, Olivia Carvalho
Rocha e Lucas Tavares de Mello Costa.

## Correção

A migration `corrige_ticket_agosto_2026_recreio_334_pagantes`:

- exige como precondição os snapshots 6/7/7, com hashes válidos e o estado
  quebrado 325/R$ 445,38;
- cria versões append-only 7/8/8 dos três snapshots, sem alterar ou apagar o
  histórico;
- corrige todas as cópias do ticket e do denominador dentro do payload
  gerencial;
- atualiza somente os campos financeiros aditivos de `dados_mensais`, mantendo
  os campos legados já corretos;
- grava quatro registros em `fechamento_mensal_auditoria` e um registro em
  `automacao_log`;
- valida os leitores `get_relatorio_admin_mensal_rico_v1`,
  `get_relatorio_gerencial_canonico_v1` e `get_financeiro_faturas_emusys` antes
  de concluir a transação;
- exige que Barra permaneça em R$ 446,30 e Campo Grande em R$ 398,87.

## Provas automatizadas

- teste de contrato da migration: constantes, equação, append-only, auditoria e
  não regressão das outras unidades;
- fixture PostgreSQL real em Docker, iniciada no estado quebrado 6/7/7 e
  validada no estado corrigido 7/8/8;
- teste do formatador mensal com resumo divergente, provando que o texto usa o
  indicador financeiro canônico de R$ 433,38.

## Aplicação e prova em produção

A migration foi aplicada em 08/09/2026 às 17:24:42 UTC. A transação publicou os
seguintes snapshots, todos com `payload_hash` válido:

| Domínio | Versão | Snapshot |
| --- | ---: | --- |
| `alunos_executivo` | 7 | `b031f0d3-cbb1-4352-b750-cf685aeb84f3` |
| `relatorio_gerencial` | 8 | `a96bb42a-b6c4-4c2d-abf4-f7f5cfeeb5ad` |
| `relatorio_admin_mensal` | 8 | `78f7e8b7-eed2-4509-ae4c-6a638af487af` |

Os três consumidores do Recreio foram relidos depois do commit da transação:

| Leitor | Pagantes | Denominador | MRR | Ticket |
| --- | ---: | ---: | ---: | ---: |
| `get_relatorio_admin_mensal_rico_v1` | 334 | 334 | R$ 144.749,17 | R$ 433,38 |
| `get_relatorio_gerencial_canonico_v1` | 334 | 334 | — | R$ 433,38 |
| `get_financeiro_faturas_emusys` | — | 334 | R$ 144.749,17 | R$ 433,38 |

A prova de não regressão no leitor mensal também foi repetida em produção:
Barra permaneceu em R$ 446,30 e Campo Grande em R$ 398,87. A operação gravou
quatro linhas de auditoria e uma execução `ok` em `automacao_log`.
