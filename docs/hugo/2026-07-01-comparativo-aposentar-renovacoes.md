# Comparativo Antes × Depois — Aposentar tabela `renovacoes` (Fase 2)

> Não consigo recuperar as imagens que você enviou (prints ficam só no chat, não comigo).
> Este documento tem os **valores** de cada print que registrei + o **depois** medido no banco.
> Serve melhor que as imagens pra validar: são os números reais.

Data: 2026-07-01. Escopo: Fase 2 (reapontar leitura pra `movimentacoes_admin`).

## Resumo executivo

A maioria das telas **NÃO muda**, porque já usavam a fonte canônica (`movimentacoes_admin`)
ou porque o componente que lia a tabela legada é órfão (fora de navegação). O **único número
que muda visivelmente** é o card "Contratos vencendo sem renovação" no Dashboard — e muda pra
melhor (passa a descontar quem já renovou).

## Tela a tela

### 1. Ficha do Aluno → aba Histórico → "Histórico de Renovações" (Adriana Christine)
| | Valor |
|---|---|
| Antes (seu print) | RENOVACAO 400 → 447 (Últimas Mov.) · Histórico de Renovações: 01/07/2026, 400 → 447, **+11.8%** |
| Depois (medido) | **Idêntico** — 400 → 447, +11.8% |
| O que mudou | Só a **fonte**: a seção "Histórico de Renovações" agora lê `movimentacoes_admin` (antes lia a tabela legada). Visual igual. |
| Veredito | ✅ IGUAL |

### 2. Analytics (aba Gestão) — o print "Analytics"
| Card | Antes (print) | Depois |
|---|---|---|
| Renovações | 33 | **33** (inalterado) |
| Taxa Renovação | 100% | 100% |
| Cancelamentos / Não Renovações / Total Evasões | 5 / 0 / 5 | iguais |
| Churn / MRR Perdido / Aviso Prévio / Tempo Permanência | 0.6% / R$1.945 / 10 / 16 | iguais |
| Fonte | `retencaoOperacionalCanonica` → `movimentacoes_admin` (canônico) | **não tocada** — nunca leu a tabela legada |
| Veredito | ✅ IGUAL (não afetado pela Fase 2) | |

> Observação: existe um componente `GestaoMensal/TabRetencao.tsx` que **lia** a tabela legada e
> foi reapontado, mas ele é **órfão** (não está montado em nenhuma tela). A aba que você vê é a
> **Gestão**, que usa o canônico. Por isso os números aqui não mudam.

### 3. Dashboard → Alertas Inteligentes
| Alerta | Antes (print) | Depois (medido) |
|---|---|---|
| Contratos vencendo sem renovação — Recreio | 20 | **20** |
| Contratos vencendo sem renovação — Campo Grande | 10 | **9** ⬇️ |
| Contratos vencendo sem renovação — Barra | 7 | **7** |
| Renovações pendentes este mês — Recreio / CG | 23 / 12 | 23 / 12 (iguais) |
| Veredito | | ✅ CG 10→9 é a **correção** (antes o cálculo estava quebrado e contava todos; agora desconta quem já renovou nos últimos 90 dias). Os outros 6 tipos de alerta intactos. |

### 4. Dashboard (topo) — Taxa Renovação 100%
Vem de `useMetasKPI` (canônico), não da tabela legada. ✅ IGUAL.

### 5. Administrativo → Programa Fideliza+ (Ranking)
| Dupla | Antes (print) | Depois |
|---|---|---|
| Gabi & Jhon (CG) | Renovação 100% · Reajuste 13.2% | **iguais** |
| Fefe & Dai (Recreio) | Renovação 25% · Reajuste 8% | iguais |
| Duda & Arthur (Barra) | Renovação 50% · Reajuste 10.3% | iguais |
| Fonte | Front sobrescreve com o **canônico** (`aplicarMetricasFidelizaCanonicas`) | a RPC mudou por dentro, mas a **tela usa o canônico** |
| Veredito | ✅ IGUAL | |

> Prova de que a tela usa o canônico: a RPC `get_programa_fideliza_dados`, mesmo depois de
> reapontada, retorna CG 87% / Recreio 100% / Barra 0% — **diferente** dos 100%/25%/50% que a
> tela mostra. Logo a tela não usa a RPC pra esses números.

## Conclusão

- **Muda visivelmente:** só Dashboard → "Contratos vencendo" CG 10→9 (correção).
- **Fica idêntico:** Ficha do aluno, Analytics/Gestão, Dashboard (taxa), Fideliza+.
- Tudo o mais foi higiene em código órfão/morto (sem tela).
- A tabela `renovacoes` está 100% legada (nada lê nem escreve nela). Falta só a Fase 3 (renomear
  para `renovacoes_legado`, nunca dropar), em sessão separada com seu OK.
