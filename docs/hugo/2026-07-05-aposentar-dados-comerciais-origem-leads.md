# Aposentadoria — `dados_comerciais` e `origem_leads` (+ fix do alerta Conversão Baixa)

Data: 2026-07-05. Contexto: descoberto durante o desenho da feature de atribuição Meta Ads
(o UPDATE em `leads` que a feature faria dispararia os triggers de inflação dessas tabelas —
investigamos e decidimos resolver a raiz antes de prosseguir).

## Resumo executivo

Duas tabelas de agregação comercial eram **zumbis**: escritas a cada UPDATE em `leads` por
triggers incrementais bugados (contavam +1 sem descontar o estado anterior → **inflação de
3-17×** confirmada), mas praticamente sem leitor vivo. Foram **aposentadas via rename `_legado`**
(nenhum dado apagado), os triggers removidos, e o único consumidor vivo (alerta "Conversão
Baixa" do Dashboard) migrado para **cálculo vivo** de `leads`.

**O sistema de leads não mudou em nada** — cadastro, pipeline, KPIs do Dashboard já eram
cálculo vivo. A única diferença visível: o alerta "Conversão Baixa" agora calcula sobre a base
correta.

## Evidência da inflação (total_leads: dados_comerciais × contagem real em `leads`)

| Competência | Unidade | `dados_comerciais` | Real | Inflado |
|---|---|---|---|---|
| Mar/2026 | Campo Grande | 7.306 | 421 | **17×** |
| Mar/2026 | Recreio | 4.566 | 280 | 16× |
| Abr/2026 | Campo Grande | 2.141 | 471 | 4,5× |
| Jul/2026 | Campo Grande | 132 | 45 | 3× |

Causa: `sync_leads_to_dados_comerciais()` e `sync_leads_to_origem_leads()` disparavam em
**qualquer** UPDATE de `leads` (e o `upsert_lead()` do webhook Emusys atualiza muito), sempre
com `delta = +1`. Ironia: as funções corretas e idempotentes (`consolidar_dados_comerciais_mes`,
`consolidar_origem_leads_mes`) **já existiam** no banco, mas nunca foram agendadas — código órfão.

## Mapa de consumidores (verificado antes de mexer)

| Consumidor | Tabela | Estado |
|---|---|---|
| `vw_kpis_comercial_historico` | dados_comerciais | View **morta** no frontend (ninguém consome) — segue o rename automaticamente |
| `vw_alertas_inteligentes` → alerta CONVERSAO_BAIXA | dados_comerciais | **Único vivo** — migrado pra cálculo vivo |
| Qualquer coisa | origem_leads | **Ninguém** (100% morta) |
| Fechamento mensal (`dados_mensais` + `fechamento_mensal_snapshots`) | — | **Não toca** nessas tabelas (confirmado nas 6 funções de fechamento) — histórico canônico intacto |
| Sol/BI agent (`bi-agent-lamusic`) | — | Zero referências |
| Frontend (`src/`) | — | Zero referências diretas |
| Crons | — | Nenhum |

## O que foi feito (3 migrations, nesta ordem)

1. **`20260705054754_alerta_conversao_baixa_calculo_vivo`** — recria `vw_alertas_inteligentes`
   com CTE `conversao_realtime` lendo `leads` direto. Fórmula espelha o Dashboard:
   denominador = leads com `experimental_realizada=true` no mês; numerador = destes, os com
   `status IN ('matriculado','convertido')`. Threshold mantido (< 13,5%; crítico < 10%).
2. **`20260705054819_drop_triggers_inflacao_...`** — `DROP TRIGGER tr_sync_leads_comerciais`
   e `tr_sync_leads_origem` (defs de rollback no comentário da migration). As funções
   `sync_leads_to_*` ficam no banco, órfãs.
3. **`20260705054925_aposenta_dados_comerciais_origem_leads_legado`** —
   `dados_comerciais` → `dados_comerciais_legado`, `origem_leads` → `origem_leads_legado`,
   com `COMMENT ON TABLE` explicando. Dados 100% preservados.

## Antes × Depois

| Item | Antes | Depois |
|---|---|---|
| Alerta "Conversão Baixa" (CG, jul) | 0,0% sobre base furada (9 experimentais registradas vs 35 reais) | 0,0% sobre base real (35) — igual por coincidência do início do mês, mas passa a disparar na hora certa |
| Demais cards do Dashboard | Cálculo vivo | Inalterados |
| UPDATE em `leads` | Inflava 2 tabelas a cada edição | Não infla nada |
| `dados_comerciais` / `origem_leads` | Escritas o tempo todo, quase não lidas | Congeladas como `*_legado` |

## Rollback

```sql
ALTER TABLE dados_comerciais_legado RENAME TO dados_comerciais;
ALTER TABLE origem_leads_legado RENAME TO origem_leads;
CREATE TRIGGER tr_sync_leads_comerciais AFTER INSERT OR DELETE OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION sync_leads_to_dados_comerciais();
CREATE TRIGGER tr_sync_leads_origem AFTER INSERT OR DELETE OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION sync_leads_to_origem_leads();
-- e reaplicar a versão anterior da vw_alertas_inteligentes (def antiga no histórico de migrations)
```

## Pendências / fase 2 (opcional, não urgente)

- Dropar de vez `*_legado` + `vw_kpis_comercial_historico` + funções órfãs
  (`sync_leads_to_*`, `consolidar_*_mes`) depois de um período de observação.
- Tabelas de metas fragmentadas (`metas`, `metas_comerciais`, `metas_legado`) seguem como
  candidatas a aposentadoria — apontadas na auditoria de data science (fiscal-mila), fora do
  escopo desta mudança.
