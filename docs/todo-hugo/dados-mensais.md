# dados_mensais — Referência

## O que é
Tabela de **snapshot mensal** com KPIs por unidade. Gerada automaticamente pelo pg_cron (`snapshot_dados_mensais`) no dia 1 de cada mês. Pode ser recalculada manualmente.

## Campos

| Campo | Descrição | Fonte de cálculo |
|---|---|---|
| `alunos_ativos` | Total de alunos ativos (sem segundo curso) | `alunos` WHERE status='ativo' AND is_segundo_curso=false |
| `alunos_pagantes` | Alunos que pagam (tipo_matricula.conta_como_pagante) | `alunos` + `tipos_matricula` |
| `matriculas_ativas` | Total de matrículas (inclui segundo curso + banda) | `alunos` WHERE status='ativo' |
| `matriculas_banda` | Matrículas em projeto banda | `alunos` + `cursos` WHERE is_projeto_banda=true |
| `matriculas_2_curso` | Matrículas de segundo curso | `alunos` WHERE is_segundo_curso=true |
| `novas_matriculas` | Novas matrículas no mês | `leads` WHERE convertido AND data_contato no mês (**BUG: deveria usar data_matricula de alunos**) |
| `evasoes` | Evasões + não renovações no mês | `movimentacoes_admin` WHERE tipo IN (evasao, nao_renovacao) |
| `churn_rate` | Taxa de churn (evasões / pagantes mês anterior) | Calculado |
| `ticket_medio` | Ticket médio (só tipos com entra_ticket_medio) | `alunos` + `tipos_matricula` |
| `taxa_renovacao` | Taxa de renovação | Calculado |
| `tempo_permanencia` | Tempo médio de permanência (meses) | `alunos` AVG(tempo_permanencia_meses) |
| `inadimplencia` | % inadimplência | Calculado |
| `faturamento_estimado` | Faturamento estimado (MRR) | Soma valor_parcela dos ativos |
| `saldo_liquido` | Novas matrículas - evasões | Calculado |
| `ticket_medio_passaporte` | Ticket médio passaporte | Calculado |
| `faturamento_passaporte` | Faturamento passaporte | Calculado |

## Onde é usado

### Analytics (Gestão Mensal)
- **Aba Gestão/Alunos**: Alunos Ativos, Pagantes, LAMK/EMLA, Banda, Novas Matrículas, Evasões, Saldo Líquido, Bolsistas
- **Aba Financeiro**: Ticket Médio, MRR, ARR, LTV, Faturamento Previsto/Realizado, Inadimplência, Reajuste
- **Aba Retenção**: Churn Rate, Taxa de Renovação, Tempo de Permanência

### Dashboard
- KPIs resumidos de alunos, ticket médio, faturamento

### Administrativo (visão histórica)
- Matrículas Ativas, Banda, 2º Curso (quando olhando mês passado)

### Professores
- Comparativos de matrículas entre meses (TabProfessoresNew)

### Alertas de Retenção
- Dados para alertas de churn

## Fontes de dados

| Período | Fonte |
|---|---|
| Mês atual | Tempo real (tabela `alunos` direto) |
| Meses passados | Snapshot `dados_mensais` |

## Como atualizar
- **Automático**: pg_cron roda no dia 1 de cada mês
- **Manual**: RPC `snapshot_dados_mensais(p_ano, p_mes)` — recalcula todas as unidades
- **Botão** (a implementar): Recalcular por unidade específica na página de Alunos e Analytics

## Bug conhecido
O campo `novas_matriculas` conta da tabela `leads` por `data_contato`, quando deveria contar da tabela `alunos` por `data_matricula`. Corrigir na RPC `snapshot_dados_mensais`.
