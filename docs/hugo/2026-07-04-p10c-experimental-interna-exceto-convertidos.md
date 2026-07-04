# P10C — Régua de "experimental interna" passa a preservar quem converteu

**Data:** 2026-07-04
**Migration:** `supabase/migrations/20260704140000_p10c_experimental_interna_exceto_convertidos.sql`
**RPC alterada:** `get_conciliacao_experimentais_v2`
**Origem:** Clayton reportou que a experimental do Recreio caiu de 47 → 43 depois da leva de migrations de 03/07 (P10B).

---

## O problema (o que a P10B fez de errado)

A migration anterior (`20260703190000_p10b`) passou a **excluir do funil comercial** experimentais classificadas como "internas". O critério era um único sinal do payload do Emusys:

```
interna = (aluno.id_lead = 0) E (aluno.id_aluno > 0)
```

**O que `id_lead = 0` significa:** o Emusys só cria um lead novo (`id_lead > 0`) quando a pessoa é **totalmente desconhecida**. Se ela já existe no cadastro por **qualquer** motivo, o Emusys reaproveita o `id_aluno` e manda `id_lead = 0`. Esse sinal é ambíguo — engloba 3 situações com a mesma "cara":

1. **Aluno ativo** trocando/adicionando instrumento → remanejamento interno de verdade ✅ (cortar certo)
2. **Ex-aluno que voltou** (win-back) → é comercial ❌ (estava sendo cortado errado)
3. **Familiar** (ex: mãe de aluno que virou aluna) → é comercial ❌ (cortado errado)

A régua não olhava se a pessoa **converteu de fato**, só se ela já tinha cadastro antes.

## Validação de negócio

Krissya (líder do comercial) confirmou por áudio a regra correta:

> "É pra contar como experimental sim, pro comercial, pq ele é um cliente que pode converter ou não. Ele não conta como novo lead, mas tem que contar como experimental."

## A correção (P10C)

Acrescenta uma condição: só é "interna" quem **NÃO converteu no mês**.

```
interna = (id_lead = 0) E (id_aluno > 0) E (NÃO converteu no mês)

onde "converteu no mês" = matrícula nova no período OU valor_passaporte > 0
```

Reaproveita dado que já existe na tabela `alunos` (via FK `emusys_experimentais_raw.aluno_id`) — sem coluna nova, sem backfill, sem tocar em ingestão/webhook. Como a RPC roda **ao vivo** a cada consulta, o join encontra a matrícula assim que ela chega; não precisa reprocessar nada.

Alteração aplicada em **2 pontos** da função (a flag `experimental_interna_emusys` é calculada duas vezes: CTE `eventos` = detalhe por evento, CTE `raw_por_unidade` = resumo agregado). Uma única mudança lógica, colada nos dois lugares porque o código já duplicava a regra.

## Casos provados (Recreio / junho 2026)

| Raw | Aluno | id_aluno | Curso | Matrícula no mês | Passaporte | Resultado |
|---|---|---|---|---|---|---|
| 3 | Gael dos Santos Lima | 1402 | Guitarra | 08/06 | R$440 | volta a **contar** |
| 4 | Gael dos Santos Lima | 1402 | Teclado | 08/06 | R$440 | volta a **contar** |
| 21 | Flávia Santiago de Oliveira | 2052 | Teclado | 12/06 | R$400 | volta a **contar** |
| 42 | Guilherme Ferreira Muniz | 333 | Violino | 26/08/2021 (antiga) | — | segue **interno** (correto) |

- Gael = ex-aluno (Bateria trancada desde 2024) que voltou; fez 2 experimentais no mesmo dia de 2 instrumentos diferentes (não é duplicata).
- Flávia = mãe de aluno (já era responsável no Emusys) que virou aluna.
- Guilherme = aluno ativo desde 2021 (`qtd_contratos=4`), testando outro instrumento, sem passaporte → continua corretamente fora do funil comercial.

## Levantamento nas 3 unidades (SELECT-only, antes de aplicar)

Casos marcados "interno" em jun/2026 e se convertiam:

| Unidade | Casos "interno" | Convertidos (resgatados) |
|---|---|---|
| CG | 6 (incl. José Demétrio x2, todos alunos/trancados) | 0 |
| Barra | 1 (Júlia Corrêa, trancada) | 0 |
| Recreio | 4 | **3** (Gael x2 + Flávia) |

Os 4 casos de CG/Barra que não bateram FK em `alunos` foram checados na API do Emusys (`emusys_api_payload`): todos são matrículas **trancadas** testando outro instrumento — não converteram, seguem corretamente internos. Impacto real da correção: **cirúrgico, só +3 no Recreio.**

## Resultado validado (após aplicar)

| Unidade | Realizadas antes → depois | Internas antes → depois |
|---|---|---|
| **Recreio** | 43 → **46** | 4 → **1** |
| CG | 14 → 14 | 3 → 3 |
| Barra | 18 → 18 | 1 → 1 |

**Recreio/junho fecha em 46 experimentais** — número que a costura anterior já apontava como correto (43 + Gael 2 + Flávia 1).

## Escopo e impacto

- Afeta **apenas** o funil de experimental/conversão (denominador de experimentais realizadas, taxa exp→matrícula, crédito do professor que deu a experimental).
- **NÃO afeta** faturamento, MRR, ticket médio ou contagem de matrículas — Gael e Flávia já contavam normalmente nesses números (matrícula REGULAR, `is_segundo_curso=false`, valor > 0).

## Limitações conhecidas (não bloqueantes)

A checagem de conversão é **por pessoa**, não por curso testado. Casos raros ainda podem escapar:
- Pessoa faz N experimentais de instrumentos diferentes no mês e matricula em só 1 → a régua credita as N como convertidas (creditando professores que não converteram).
- Passaporte pago no mês sem relação com a experimental específica.
Fechar esses gaps exige vincular a conversão ao **curso testado** — correção mais profunda, fora do escopo deste ajuste.

## Ratificação pendente

Aplicado com OK do Hugo e validação da Krissya (comercial). Recomenda-se ratificação formal do **Alf/Luciano** por ser regra de KPI comercial. Reversão é trivial (`CREATE OR REPLACE` restaurando o corpo da P10B).
