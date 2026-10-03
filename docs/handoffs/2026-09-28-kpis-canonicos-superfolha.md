# Handoff — Indicadores canônicos de alunos por unidade/mês para o Super Folha

**Data:** 2026-09-28 · **Status:** proposta — nada implementado. Aguarda OK do Alf.
**Contexto:** o Super Folha calculará CAC, CRC, ticket, LTV, LTV/CAC e insumos de ponto de equilíbrio (RTV). O **gasto** (aquisição, retenção) vem do Super Folha; os **números de aluno** vêm daqui, das fontes canônicas abaixo.

Regra-ouro deste documento: **a Super Folha não monta SELECT em cima de `alunos`, `movimentacoes_admin` ou `emusys_faturas`**. Ela lê RPCs canônicas e exports assinados — os mesmos números que a nossa UI mostra.

---

## 1. Indicadores — fonte, regra, vigência, cuidados

Tabela-mãe. "RPC Ops" = `get_kpis_alunos_admin_operacional(p_unidade_id, p_ano, p_mes)` — é a RPC que alimenta a tela de KPIs do admin e o snapshot de fechamento. `p_unidade_id=NULL` devolve o consolidado.

| Indicador | Fonte canônica | Regra (quem entra / quem sai) | Desde quando vale | Cuidados |
|---|---|---|---|---|
| **Alunos ativos** | RPC Ops → `alunos_ativos` (fechado: `dados_mensais.alunos_ativos`) | **Pessoas** com matrícula acadêmica ativa. Sai: trancado; matrícula **só de banda/coral** não conta; `is_segundo_curso` não duplica a pessoa | Regra corrente validada em 08/08/2026 | É contagem de **pessoas**, não de linhas de `alunos` (uma pessoa pode ter 2 matrículas) |
| **Alunos pagantes** | RPC Ops → `alunos_pagantes` (fechado: `dados_mensais.alunos_pagantes`) | Pessoa única com mensalidade efetiva. Sai: bolsista integral **e parcial**, isento/cortesia, valor_parcela=0, projeto banda/coral, trancado, 2º curso (não duplica) | idem | "Pagante − Ativo" não é erro: ativo inclui bolsista/cortesia. Referência medida: Barra 246/244, CG 417/387, REC 336/326 |
| **Novas matrículas** | RPC Ops → `novas_matriculas` (fechado: `dados_mensais.novas_matriculas`) | Matrículas criadas na competência (mês/ano). É denominador oficial do CAC | idem | Conta **matrículas**, não pessoas — aluno que entra em 2 cursos conta 2 |
| **Evasões** | RPC Ops / `movimentacoes_admin_vigentes` (`tipo IN ('evasao','nao_renovacao')`) | Dedup canônica `DISTINCT ON (nome, unidade, ano, mes)`. Sai: aviso prévio, trancamento, transferência interna entre unidades, atividades extras (banda, coral, Power Kids, Minha Banda, GarageBand, Percussion Kids) | idem | Tabelas `evasoes`/`evasoes_v2`/`renovacoes` **não existem mais** — não usar |
| **Churn** | `dados_mensais.churn_rate` / derivável | `evasoes / alunos_pagantes × 100` | idem | A fórmula antiga (sobre ativos + novos) foi **descartada** em 08/08/2026 |
| **Ticket médio** | `dados_mensais.ticket_medio` | Soma das mensalidades contratuais dos pagantes ÷ **pessoas** pagantes. 2º curso entra no **numerador**, não no denominador. Sai: bolsistas, banda/coral, passaporte (receita à parte — `ticket_medio_passaporte`/`faturamento_passaporte`) | idem | Existe também `ticket_medio_contratual`/`mrr_contratual` em `dados_mensais` — ticket por fatura de competência foi validado pelo Alf mas **não implementado**; não improvisar |
| **Permanência (meses)** | `dados_mensais.tempo_permanencia` / `get_tempo_permanencia(unidade, ano, mes)` | Média de meses de permanência sobre `alunos_historico`, por unidade | idem | Coluna é `tempo_permanencia` (int); `banda_permanencia_meses` existe para o módulo banda |
| **Inadimplência** | `dados_mensais.inadimplencia` / wrapper canônico (`sol_inadimplencia_v1`) | % = pessoas inadimplentes ÷ pagantes × 100, por fatura vencida | idem | Nunca montar SELECT em `emusys_faturas` direto — a Sol lê a mesma RPC |
| **Alunos em banda** | derivado: `alunos` ⨝ `cursos.is_projeto_banda=true` (cursos: Minha Banda, Power Kids, GarageBand; Coral é `is_projeto_banda` mas não é "banda") | Pessoas com matrícula de banda ativa. Medido set/2026: **Barra 14, CG 37, REC 54** | — | `dados_mensais.matriculas_banda` conta **matrículas**; pessoa ≠ matrícula |
| **Pagantes em banda** | banda ∩ pagantes (pela matrícula **regular** da mesma pessoa) | Banda quase nunca cobra por si (`valor_parcela=0`); quem paga banda paga pela matrícula regular | — | Medido set/2026: **14/31/53** (98 de 105). 1 matrícula de banda com valor R$437 é anomalia |
| **Professores que dão aula** | `aulas_emusys` (espelho Emusys, carga diária) | Aulas por `data_aula`, `unidade_id`, `duracao_minutos`; canceladas = `cancelada=true` | espelho vivo | Identificar por `professor_id`/`emusys_professor_id`, **nunca por nome** |
| **Produtores de banda** | `banda.produtor_professor_id` → `professores.id` | Papel **canônico** do módulo bandas: cada banda ativa tem seu produtor | módulo bandas 24/08/2026 | Medido: Barra 2, CG 7, REC 6 produtores (28 bandas ativas). "Ensaio de banda" e "professor-produtor" são papéis distintos |
| **Horas de banda / professor / mês** | `aulas_emusys` tipo `turma` + `cursos.is_projeto_banda` | ⚠️ Regra de dedup **obrigatória**: cada ensaio grava 1 linha `tipo='turma'` + N linhas `tipo='individual'` (uma por aluno). Horas = só as `turma` (ou `COUNT DISTINCT sessão`). Dur. 50 min | — | Somar tudo **multiplica por ~4** (ex.: set mediu 998 "aulas" Minha Banda = ~233 sessões reais) |
| **Custo de retenção (CRC)** | ❌ **não existe no LA Report** | Não temos livro de despesa de retenção; quem detém o gasto é o Super Folha | — | Entregamos só o denominador (`alunos_ativos`). Não usar caixa/Emusys como proxy — é incompleto |

---

## 2. Mês fechado × mês aberto — onde o número mora

| Estado | Onde está | Quem escreve |
|---|---|---|
| **Aberto** (mês corrente) | RPC Ops ao vivo (`get_kpis_alunos_admin_operacional`) | calculado na hora |
| **Fechado** | `dados_mensais` (linha unidade×mês) + `fechamento_mensal_snapshots` (payload+`payload_hash`, `fonte` = RPC que gerou) | `snapshot_dados_mensais` / `fechar_dados_mensais` |
| **Retificado** | `fechamento_mensal_retificacoes` + snapshot novo com `status='retificado'` e versão maior | RPCs `aplicar_retificacao_*` |

**Qual valor vale:** o snapshot `fechado` de **maior versão** (ou `aprovado`→`retificado`). A tabela guarda o histórico inteiro — a retificação **não sobrescreve**, ela acrescenta versão. `payload_hash` é a prova de integridade da linha.

**Cobertura real hoje:** snapshots de fechamento existem para **jun, jul, ago/2026** (jun = aprovado; jul/ago = fechado). Jan–mai **não têm snapshot** — só `dados_mensais`.

## 3. Jan–mai × jun–set/2026 — a mesma regra?

**Não é idêntico, e a diferença é de infraestrutura, não de conceito:**

| Janela | O que existe | Caveat |
|---|---|---|
| **Jan–mai** | só `dados_mensais` (3 linhas/mês = 3 unidades), gravadas na época | **Pré-correção de 08/08/2026** — anteriores à revisão das regras (trancado ≠ ativo; só-banda ≠ ativo; churn novo). Podem carregar a régua velha. Sem snapshot/audit |
| **Jun–ago** | `dados_mensais` + snapshots com hash, auditoria e retificações | Já sob a régua corrigida. **É a janela de confiança** |
| **Set** | RPC ao vivo (mês aberto) | muda até fechar |

**Recomendação honesta:** para CAC/LTV retroativo, trate jan–mai como **dado legado** (rotule `status_fechamento='legado'`). Se a série histórica precisar ser retificada sob a régua nova, é um passo separado aprovado pelo Alf — não se recalcula mês fechado em silêncio.

## 4. CAC e LTV — já calculamos?

- **CAC: não.** O gasto de aquisição não mora aqui (ver §6). Nós entregamos o denominador `novas_matriculas`; o SF faz `gasto ÷ novas_matriculas`.
- **LTV: parcial.** `LTV = ticket_medio × tempo_permanencia` — as duas pernas existem em `dados_mensais` por unidade/mês. Existe `get_historico_ltv(p_unidade_id)` por aluno. **Não há** um `ltv` materializado por competência — a fórmula é canônica, o produto é derivado.
- **CRC, LTV/CAC, RTV: não são métricas nossas.** O SF compõe; nós garantimos denominadores canônicos.

## 5. Bandas — horas de aula por professor/unidade/mês

**Dá, e a identificação é estável.** Espelho `aulas_emusys`:

- Sessão de banda = linha `tipo='turma'` com `curso_emusys_id` em `cursos.is_projeto_banda` (ou `banda_curso_depara`: Power Kids 25, Minha Banda 33, GarageBand 38);
- chave de sessão = `data_hora_inicio` + `professor` + `sala_nome` (dedup das linhas `individual` — 1 sessão = N linhas de aluno);
- professor sem nome: `aulas_emusys.emusys_professor_id` → `professores.emusys_id`, ou o `professor_id` interno (uuid/int estável). Nome não vai;
- cancelada = `cancelada=true` (excluir); remarcada = `reagendada`.

## 6. Tráfego pago — tem unidade?

**Não nativamente.** `google_ads_metricas_diarias` / `meta_ads_metricas_diarias` / `vw_ads_gasto_diario_v1` trazem dia, `campanha_id`, `campanha_nome`, gasto — **sem `unidade_id`**.

| Via de atribuição | Estado |
|---|---|
| Tag no nome da campanha (Google) | existe e é confiável: `[CG]…`, `[BARRA]…`, `[RECREIO]…` |
| Meta Ads | campanha "…Todas as unidades" — **não atribuível** a uma unidade; pede regra de rateio declarada ou fica consolidada |
| `campanhas.unidade_id` | é da nossa ferramenta de disparo WhatsApp, **não** é o gasto de tráfego — não confundir |

Nunca inferir unidade por palpite de nome. Regra de rateio para campanhas multi-unidade precisa ser combinada explicitamente (ou o gasto fica na linha "consolidado").

## 7. Caminho de leitura — o que criar

**Não existe hoje** um export de indicadores para o SF (os exports atuais são `export-contas-receber`, `export-financeiro-lancamentos`, `export-caixa-movimentacoes` — todos `x-super-folha-sync-secret`).

**Proposta:** `export-kpis-mensais` — POST, segredo compartilhado, `{ competencia:"YYYY-MM-01", unidade_id?, incluir_fonte?:true }`. Uma linha por unidade×competência:

```json
{
  "competencia":"2026-08-01","unidade_id":"…","unidade_codigo":"CG",
  "status_fechamento":"fechado|aberto|legado","versao":2,"fonte":"fechamento_mensal_snapshots",
  "capturado_em":"…","retificado_em":"…","payload_hash":"…",
  "alunos_ativos":417,"alunos_pagantes":387,"novas_matriculas":41,
  "evasoes":9,"churn_rate":2.33,"ticket_medio":447.00,
  "tempo_permanencia_meses":14.2,"inadimplencia_pct":3.1,
  "matriculas_banda":37,"pagantes_em_banda":31,
  "horas_banda_mes":null,"professores_aula":null,"produtores_banda":7
}
```

E uma linha auxiliar por professor: `{competencia, unidade_id, emusys_professor_id, horas_banda, sessoes_banda, e_produtor}` — horas por `turma` dedupada, `e_produtor` por `banda.produtor_professor_id`.

**Para o SF ler, falta criar (após OK do Alf):**
1. `export-kpis-mensais` (edge, segredo) lendo `dados_mensais`+snapshots para fechados e RPC Ops para abertos;
2. bloco banda/professor (dedup turma×individual);
3. atribuição tráfego→unidade por tag de campanha, com linha "consolidado" para Meta "Todas";
4. `status_fechamento='legado'` explícito para jan–mai (ou retificação, se aprovada).

**Não fazer:** CAC/LTV não se calculam aqui; nada de rateio de tráfego inventado; jan–mai não se reescreve sem trilha de retificação.

---

# Resposta ao aceite da Super Folha (2026-09-28)

> **Entregue 28/09:** RPC `kpis_mensais_export_v1` + helper `_kpis_mensais_export_sessoes`
> (migration `20260928120000`), edge `export-kpis-mensais` (deployada, `verify_jwt=false`,
> segredo `x-super-folha-sync-secret` — aceita `SUPER_FOLHA_KPIS_SECRET` com fallback ao
> segredo de contas a receber já combinado). Números verificados ao vivo: ago→`fechado`
> (REC v2, `fonte_snapshot=retificacao_agosto_2026_recreio_v1`), jan–mai→`legado`,
> set→`aberto`. Uso: `POST {competencia:"2026-08", unidade_id?}` — resposta
> `{success, manifesto, linhas[], professores[]}`; `fone_norm` sai como
> `professor_fone_hmac` (HMAC-SHA256 `professor-fone-v1:`+E164, chave=segredo).

## Ajuste 1 — `novos_alunos` vs `novas_matriculas` ✅ com ressalva de nome

Descoberta canônica: **o campo `novas_matriculas` da RPC já conta pessoas** — a implementação é `count(distinct pessoa_key)` excluindo 2º curso, bolsista, banda e transferência. Ou seja, o nosso `novas_matriculas` **é** o `novos_alunos` que vocês querem.

Contrato final entrega as duas colunas:

| Coluna | Definição | Fonte |
|---|---|---|
| `novos_alunos` | pessoas novas no mês (distinct pessoa_key, sem 2º curso/bolsista/banda/transferência) | RPC `novas_matriculas` (já é pessoa) |
| `novas_matriculas` | linhas de matrícula novas (mesma régua, sem o `distinct`) — inclui 2º curso da mesma pessoa | derivação nova no export |

CAC usa `novos_alunos`; `novas_matriculas` fica para conferência.

## Ajuste 2 — tráfego por unidade ✅ removido

Item 3 de "falta criar" retirado. Vocês já têm o gasto por unidade.

## Ajuste 3 — chave do professor

**Sem nome, a chave natural que temos é telefone.** Estado real do cadastro:

| Candidata | Cobertura | Veredito |
|---|---|---|
| `professores.emusys_id` | **0/59 preenchido** | ❌ coluna morta |
| `aulas_emusys.emusys_professor_id` | 10.232/10.234 aulas de set | ✅ existe nas aulas, mas não é FK pro cadastro |
| `professor_id` (interno) | 100% | ✅ estável — nossa PK |
| `telefone_whatsapp` | 51/59 | ⚠️ 86% |
| CPF | não existe no nosso cadastro | ❌ |

**Recomendação:** emitimos `professor_id` + `emusys_professor_id` + `hmac_sha256(telefone_whatsapp)` por linha. O SF tenta o match automático por telefone-HMAC; onde não casar (8 sem telefone), o de-para é manual único na ficha do colaborador (vocês guardam nosso `professor_id`). Se preferirem zero trabalho manual, entregamos **também** a linha agregada unidade×mês sem professor — as duas coisas convivem no mesmo export.

## Ajuste 4 — jan–mai `status_fechamento='legado'` → **REVERTIDO em 03/10/2026**

~~Confirmado, sem reapuração.~~ **O Alf autorizou em 03/10/2026 a reapuração de
jan–mai sob a régua corrigida de 08/08** (migration `20261003120000_reapuracao_kpis_alunos_jan_mai_2026`).
Desde então jan–mai emitem `status_fechamento='fechado'`, `versao=1`, com
`retificado_em` preenchido: 30 snapshots `fechado` (5 meses × 3 unidades × domínios
`alunos_admin`+`alunos_executivo`), 15 registros em `fechamento_mensal_retificacoes`
guardando a linha legada de `dados_mensais` em `evidencias.dados_mensais_anterior`
(a versão legada **não** foi apagada — está na trilha), e `dados_mensais` atualizado
com os valores corrigidos. Jan/2026 saiu de `alunos_ativos=0` para 267 BARRA /
389 CG / 347 REC. Mai precisou de reabertura transacional da competência
(`fechado` desde 07/06) só para a leitura do canônico vivo — restaurada na mesma tx.
Detalhe residual: jan–abr emitem `fonte_kpis='preliminar'` (competência nunca foi
fechada formalmente — exigiria os 6 domínios); mai emite `fonte_kpis='dados_mensais'`.
Super Folha deve reler jan–mai via `kpis-alunos-sync`.

**Retificação v2 — posição AS-OF (04/10/2026, migrations `20261004120000` +
`20261004130000`).** A v1 tinha um defeito que a Super Folha apontou na releitura:
ativos/pagantes/permanência saíam **idênticos nos 5 meses e iguais a out/2026**
(267/263/13,5 BARRA…), porque o canônico recomputava a posição sobre a base
atual. A v2 reconstrói a base **como estava no fim de cada mês**
(`movimentacoes_admin_vigentes` + `data_saida` + `alunos_historico` + bound de
`updated_at`, mesma régua de pessoa do admin): jan BARRA passa a 224 ativos /
224 pagantes / perm. 18,2 e os meses variam entre si (CG 475→503, REC 303→341).
Métricas de fluxo ficam como na v1 (evasões, MRR/faturamento da competência);
churn/ticket/LTV/permanência foram derivados com o denominador corrigido.
Referência de fidelidade: CG fev as-of = 489 vs 485 da versão legada que a
Super Folha guardava (0,8% — a régua pré-08/08 era diferente). Trilha: 30
snapshots **versão 2** `fechado` + 15 retificações (`payload_v1` preservado em
`evidencias`) + `dados_mensais` atualizado; a v1 não foi apagada.

**Mudança de semântica do export (mesmo contrato):** para meses com snapshot
fechado, os campos de alunos vêm do **payload congelado** (merge
`alunos_executivo || alunos_admin`), não mais do canônico vivo — `fechado`
passa a significar "o valor que foi congelado", não "recomputa na hora".
`fonte_kpis` ganha o valor `'snapshot_fechado'` nesses meses (jan–mai inclusive;
antes era `'preliminar'`/`'dados_mensais'`). Efeito colateral honesto: jun–set
podem diferir centesimalmente do que uma releitura viva mostraria — o payload é
o que foi capturado no fechamento/retificação (ex.: ago CG churn 7,87 congelado
vs 8,14 que o vivo recomputava). Sem snapshot, nada muda (canônico vivo).

---

## Contrato final — `export-kpis-mensais`

`POST { competencia: "YYYY-MM-01", unidade_id?: uuid }` · header `x-super-folha-sync-secret`

**Bloco 1 — linha unidade×competência** (`fonte` diz de onde cada número saiu):

```json
{"competencia":"2026-08-01","unidade_id":"2ec861f6-…","unidade_codigo":"CG",
 "status_fechamento":"fechado","versao":1,"fonte":"fechamento_mensal_snapshots",
 "capturado_em":"2026-09-01T01:00:00Z","retificado_em":null,"payload_hash":"08b39fbb…",
 "alunos_ativos":410,"alunos_pagantes":382,"novos_alunos":25,"novas_matriculas":null,
 "evasoes":32,"churn_rate":8.14,"ticket_medio":398.28,
 "tempo_permanencia_meses":19.0,"inadimplencia_pct":1.57,
 "matriculas_banda":41,"pagantes_em_banda":null}
```

**Bloco 2 — linha professor×competência** (horas banda dedupadas por sessão `turma`):

```json
{"competencia":"2026-08-01","unidade_codigo":"CG","professor_id":"…",
 "emusys_professor_id":123,"professor_fone_hmac":"…",
 "horas_banda":12.5,"sessoes_banda":15,"e_produtor_banda":true}
```

+ linha agregada `{"unidade_codigo":"CG","horas_banda_total":…,"horas_aula_total":…}` por competência (fallback sem professor).

**Regra de `status_fechamento`:** `fechado` (snapshot não-preview, maior versão — campos de alunos vêm do payload congelado, `fonte_kpis='snapshot_fechado'`) · `legado` (só `dados_mensais`, sem snapshot) · `aberto` (sem snapshot nem `dados_mensais`, RPC viva).

## Exemplo real — ago/2026 (fechado, de `dados_mensais`+snapshots)

| unidade | ativos | pagantes | novos_alunos | evasões | churn% | ticket | perm. (m) | inadimpl.% | matr. banda |
|---|---|---|---|---|---|---|---|---|---|
| BARRA | 260 | 256 | 20 | 6 | 2,32 | 447,94 | 13,5 | 3,91 | 13 |
| CG | 410 | 382 | 25 | 32 | 8,14 | 398,28 | 19,0 | 1,57 | 41 |
| REC | 344 | 334 | 23 | 29 | 8,68 | 433,38 | 15,0 | 0,31 | 52 |

## Exemplo real — set/2026 (aberto, RPC viva em 28/09)

| unidade | ativos | pagantes | novos_alunos | trancados | bols.int/parc | matr. banda | cobertura identidade |
|---|---|---|---|---|---|---|---|
| BARRA | 266 | 262 | 16 | 1 | 3/1 | 14 | 99,28% (3 pend.) |
| CG | 395 | 368 | 15 | 7 | 15/11 | 41 | 98,94% (8 pend.) |
| REC | 350 | 339 | 17 | 3 | 6/5 | 56 | 100% |

Set ainda muda todo dia — churn/ticket/inadimplência saem no fechamento; `pagantes_em_banda` e `novas_matriculas` (linhas) entram na primeira versão do export (não existem materializados hoje — medido em 28/09: banda-pagante foi 14/31/53).
