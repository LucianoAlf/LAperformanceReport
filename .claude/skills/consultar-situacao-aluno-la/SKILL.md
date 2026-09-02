---
name: consultar-situacao-aluno-la
description: Consultar a situação operacional de alunos no LA Report pela RPC canônica get_situacao_alunos_v1/_resumo_v1 (compartilhada por TOM, Sol, Lia e app). Usar para perguntas de completude de cadastro, anamnese, comunidade WhatsApp, inadimplência, aviso prévio, fila de renovação e pendências por unidade. Proíbe SELECT direto em alunos para essas perguntas.
---

# Consultar a situação do aluno LA

Ler e seguir integralmente a skill canônica:

**.agents/skills/consultar-situacao-aluno-la/SKILL.md**

Não duplicar regras neste adaptador. Se houver divergência, a skill em
**.agents/skills** prevalece.

Regras de negócio de KPI (pagante, churn, ticket, aviso prévio, fechamento)
vivem em `references/mapa-de-fontes.md` da skill `sol-la-report-business-rules`
(§5b descreve a RPC; o mapa continua sendo a fonte para métricas mensais).
