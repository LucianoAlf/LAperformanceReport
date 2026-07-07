# Pendências e Bloqueadores — LA Report / Sol

## Bloqueadores atuais

### P8/P11 — Snapshot `dados_mensais`

Status:

- ✅ Migration v3 aprovada como desenho técnico.
- ✅ SELECT-only liberado.
- 🚫 Produção travada.

Proibido ainda:

- migration;
- ALTER/CREATE/UPDATE/DELETE/INSERT;
- backfill;
- cron;
- produção.

Próximo passo: rodar `verificacao-p8-p11-select-only.md`, revisar resultado e só depois decidir staging/migration.

---

## Pendências de regra

### Ticket Médio — numerador precisa vir de fatura por competência, não de `alunos.valor_parcela`

✅ **Resolvido em 2026-07-07 (Alf):** o denominador "por pessoa" (P3) estava correto — não mudou. O problema era a fonte do numerador: o código hoje (view `vw_kpis_gestao_mensal`, `AlunosPage.tsx`, `kpisAlunosVivosCanonicos.ts`, `TabProfessoresNew.tsx`) usa o campo cadastral estático `alunos.valor_parcela`, mas a regra final exige o valor da **fatura da competência** (`GET /faturas`): `valor_pago` se paga; valor devido atualizado (sem desconto de pontualidade perdido + juros/multa) se aberta/inadimplente. Regra completa em `regras-canonicas.md`.

🔧 **Pendência técnica:** implementar fonte de fatura-por-competência (provavelmente sync de `/faturas`, hoje não existe — só testado manualmente) para alimentar o numerador nos 4 pontos de código acima. Sem isso, o ticket médio continua usando o valor cadastral em vez do valor real da competência. Mapeamento técnico completo: `.claude/memory/pendencias-2026-07-07-ticket-medio-metodologia.md`.

### Taxa de renovação

❓ Confirmar se `aviso_previo` entra no denominador.

Não tratar como regra fechada.

### Taxa de conversão geral do funil

❓ Confirmar denominador:

- `novas / total_leads`; ou
- `novas / leads_com_exp`.

Não alterar dashboard/funil sem validação.

---

## Pendências técnicas importantes

- Padronizar `cursos.is_coral` e remover filtro por nome.
- Padronizar Kids/School por `idade_atual` onde hoje usa `classificacao`.
- Corrigir fonte de data de experimental para data realizada, não `data_contato`.
- Remover `evasoes_v2` como fonte viva.
- Corrigir qualquer `COUNT(*)` usado para alunos ativos/pagantes quando deveria ser pessoa.
