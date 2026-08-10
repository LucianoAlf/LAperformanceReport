# Duplicatas de renovação — apuração contra a API do Emusys

**Data:** 2026-08-10 · **Escopo:** os 45 alunos que tinham 2+ renovações vigentes em 2026 (93 registros)
**Resultado:** 41 registros anulados (39 + 2), 5 alunos mantidos com 2 renovações de propósito.

## O critério: contrato, não valor

O Emusys **abre um `contrato_id` novo a cada renovação**, e as parcelas seguintes passam a apontar para ele. Contando, por matrícula, os contratos que estreiam em 2026, sai o número real de renovações do aluno no ano.

A leva anterior (`20260810134205`) usou o **valor da parcela** — renovação muda o que o aluno paga. Funcionou para os 5 casos daquela leva, mas não escala:

| Falha do critério de valor | Caso real |
|---|---|
| Renovação **sem reajuste** não produz degrau | Marcello Fernandes: 417 → 417 |
| Juros e multa inflam `valor_pago` e criam degrau falso | Pedro Henrique: 367 → **456,61** em fev era juros |
| Parcela dividida vira duas linhas na mesma competência | Esther França: **406 + 54** em jul |

O critério de contrato é imune aos três.

⚠️ **`valor_original` não serve para nada aqui** — é valor de tabela (todo Campo Grande = 447). Só o líquido (`valor_original − desconto_fixo − desconto_condicional`) reflete o que foi contratado.

## Qual registro fica

O de **competência mais próxima da estreia do contrato novo**. Em 24 dos 36 alunos a competência bate exatamente. Nos outros 12 ela é *anterior* — é renovação antecipada: a equipe lança quando negocia, e o contrato só começa quando o anterior termina.

No empate, fica o registro mais **completo** (valor preenchido + status confirmado). Sem isso a Letícia Vasconcelos perderia o registro confirmado de 420 → 462 e ficaria com um pendente vazio — os dois são de fev/2026 e equidistantes da estreia (abr).

## Os 5 que continuam com 2 registros — de propósito

| Aluno | Por quê |
|---|---|
| Pérola Madeira, Gabriel Mello, Kamilly Azevedo, Maria Clara Monteiro | Têm **2 matrículas** com 2 contratos novos: as duas renovações são reais |
| Carlos Eduardo Garcia | 4 matrículas ativas, os 2 registros em cursos diferentes (Canto e Contrabaixo). Bolsista (mensalidade 0), sem parcela para confirmar — **decisão da unidade** |

A Pérola era o caso que mais parecia duplicata óbvia — 2 registros no mesmo mês, mesmo curso, mesmo valor — e não era: são as matrículas **519 e 520** renovando juntas. É a razão de o critério contar contrato *por matrícula*, e não por aluno.

## Efeito nas métricas

A duplicata inflava o **denominador** da taxa de renovação, e boa parte dos registros excedentes era `pendente_validacao` — então a taxa estava subestimada. Junho+julho depois da correção:

| Unidade | Renovações | Confirmadas | Taxa |
|---|---|---|---|
| Recreio | 33 | 33 | 100,0% |
| Barra | 16 | 15 | 93,8% |
| Campo Grande | 56 | 52 | 92,9% |

Snapshots mensais já fechados **não mudam** — a correção vale para leitura viva e para os meses ainda abertos.

## Onde a anulação é respeitada

`movimentacoes_admin_vigentes` (view) filtra `anulado = false`. Consomem ela: `get_dados_retencao_ia`, `get_programa_fideliza_dados`, `get_relatorio_admin_mensal_rico_base_v1`, `montar_relatorio_admin_mensal_payload_base_v1` e — desde `20260810162000` — `get_kpis_alunos_financeiro_vivo_canonico`, que calcula o **reajuste médio**.

Continuam lendo a tabela crua, de propósito, 5 funções de **legado versionado**: `get_dados_relatorio_coordenacao_legado_20260711`, `get_dados_relatorio_gerencial_legacy_p19/p20/p21_20260707` e `get_kpis_professor_periodo_base_legado_20260713`.

⚠️ **Nada é deletado.** Foi um `DELETE` que produziu o caso **Catarina Petrolongo**, cuja renovação o relatório de julho lista e o banco não tem mais.

## Como reproduzir

`scripts/auditar-duplicatas-renovacao-emusys.mjs`. Lê `outputs/emusys-snapshots/alvos.json` (a lista de alunos com 2+ renovações vigentes, extraída do banco), chama `GET /faturas?aluno_id=N` por aluno respeitando o rate limit de **60 req/min por IP**, e grava `relatorio-contratos.json`.

⚠️ Entrada e saída ficam em `outputs/emusys-snapshots/`, que é **gitignored de propósito** — trazem nome de aluno e histórico de pagamento. O script é versionado; os dados, não.

Query que monta o `alvos.json`:

```sql
select m.aluno_id, a.nome, a.emusys_student_id, u.nome as unidade
from public.movimentacoes_admin m
join public.alunos a on a.id = m.aluno_id
join public.unidades u on u.id = m.unidade_id
where m.tipo = 'renovacao' and not m.anulado
  and m.competencia_referencia >= '2026-01-01'
group by 1, 2, 3, 4
having count(*) > 1;
```

## Evidência aluno a aluno

Contratos no formato `id:primeira→última [valores líquidos]`.

| Unidade | Aluno | Reg. | Renov. reais | Matrículas | Mantidos | Anulados | Contratos |
|---|---|---|---|---|---|---|---|
| Barra | Esther Araújo Marques França | 2 | 1 | 1 | 2908 | 3132 | mat 399: 506:2024-05→2025-04 [417/437] → 802:2025-05→2026-04 [410/460] → 1143:2026-05→2027-04 [54/406/410/460] |
| Barra | Mauricio Cabral Liberato de Matos Junior | 2 | 1 | 1 | 3127 | 2781 | mat 410: 518:2024-05→2025-04 [417] → 801:2025-05→2026-04 [460] → 1131:2026-05→2027-04 [510] |
| Barra | Paulo Roberto Lopes Filho | 2 | 1 | 1 | 3164 | 3137 | mat 236: 281:2023-06→2024-05 [437] → 526:2024-06→2025-05 [470] → 833:2025-06→2026-05 [518] → 1182:2026-06→2027-05 [570] |
| Barra | Pérola Madeira Maturano | 2 | 2 | 2 | 46, 45 | — | mat 519: 689:2025-02→2026-01 [350] → 1017:2026-02→2027-01 [345/355/375]<br>mat 520: 690:2025-02→2026-01 [350] → 1016:2026-02→2027-01 [375] |
| Campo Grande | Alexandre Ayres Filho | 2 | 1 | 1 | 2798 | 2829 | mat 890: 1234:2021-02→2022-01 [265] → 1471:2022-03→2023-03 [287] → 2015:2023-04→2024-03 [307] → 2518:2024-04→2025-03 [320] → 3324:2025-04→2026-03 [360] → 4046:2026-04→2027-03 [399] |
| Campo Grande | Ana Victoria Padiglione Rosa | 2 | 1 | 1 | 2564 | 2457 | mat 2132: 3266:2025-04→2026-03 [50/338.04/375] → 3944:2026-04→2027-03 [41/348.99/416] |
| Campo Grande | Antônio José da Silva Delgado | 2 | 1 | 1 | 3246 | 2870 | mat 2282: 3609:2025-08→2026-07 [387] → 4215:2026-08→2027-07 [429] |
| Campo Grande | Arthur Rocha de Almeida | 2 | 1 | 1 | 2440 | 263 | mat 1644: 2414:2024-02→2025-01 [300] → 3192:2025-02→2026-01 [213/300] → 3849:2026-02→2026-04 [297/337] |
| Campo Grande | Arthur Serpa Arcoverde | 2 | 1 | 1 | 2725 | 2577 | mat 2153: 3307:2025-04→2026-03 [367] → 4012:2026-04→2027-03 [407] |
| Campo Grande | Carlos Eduardo Garcia do Nascimento | 2 | ? | 4 | 3237, 3229 | — | Bolsista (mensalidade 0), sem parcela emitida. 4 matrículas ativas e os 2 registros em cursos diferentes — **decisão da unidade** |
| Campo Grande | Davi Gabriel de Souza Apolinário | 2 | 1 | 1 | 2559 | 2458 | mat 2133: 3267:2025-03→2026-02 [357] → 3943:2026-03→2027-02 [267/357] |
| Campo Grande | David Lucca Neves do Carmo | 2 | 1 | 1 | 2710 | 2571 | mat 1436: 2044:2023-05→2024-03 [357] → 2530:2024-04→2025-03 [380] → 3187:2025-04→2026-03 [422] → 4002:2026-04→2027-03 [468] |
| Campo Grande | Ester Soares Gomes Christianes | 3 | 1 | 4 | 3067 | 2770, 2995 | mat 0: 0:2020-03→2020-03 [245]<br>mat 15: 677:2020-01→2020-02 [245] → 1052:2020-04→2021-03 [245] → 1276:2021-04→2021-04 [245]<br>mat 346: 737:2020-01→2020-02 [40]<br>mat 1471: 2123:2023-06→2024-05 [297] → 2617:2024-06→2025-05 [326] → 3432:2025-06→2026-05 [365] → 4119:2026-06→2027-05 [407] |
| Campo Grande | Gabriel Mello Leal Rabelo de Oliveira | 2 | 2 | 2 | 2728, 3140 | — | mat 1726: 2569:2024-05→2025-04 [317] → 3321:2025-05→2026-04 [367] → 4014:2026-05→2027-04 [33/367]<br>mat 1897: 2883:2024-09→2025-08 [293] → 3522:2025-09→2026-08 [334] → 4186:2026-09→2027-08 [371] |
| Campo Grande | Isabela Paixão Figueiredo | 3 | 1 | 1 | 3225 | 2871, 3104 | mat 1868: 2811:2024-07→2025-06 [337] → 3495:2025-07→2026-06 [380] → 4201:2026-07→2027-06 [427] |
| Campo Grande | Isabella Christina Pereira dos Santos | 2 | 1 | 1 | 2557 | 2459 | mat 2135: 3270:2025-04→2026-03 [317] → 3942:2026-04→2026-05 [357] |
| Campo Grande | Jonathan Carlos Souza Junior | 2 | 1 | 1 | 3245 | 3099 | mat 2267: 3582:2025-08→2026-07 [327/387] → 4214:2026-09→2027-07 [429] |
| Campo Grande | Kamilly Azevedo da Silva | 2 | 2 | 2 | 2452, 2562 | — | mat 2010: 3079:2025-02→2026-01 [297/307/347] → 3693:2026-02→2027-01 [387]<br>mat 2121: 3243:2025-03→2026-02 [167/307/347/356.53] → 3945:2026-03→2027-02 [347] |
| Campo Grande | Luana Ferreira de Souza | 2 | 1 | 1 | 3376 | 2994 | mat 2186: 3373:2025-05→2026-04 [327/387] → 4252:2026-07→2027-06 [430] |
| Campo Grande | Luciene de Almeida Correa de Souza | 2 | 1 | 1 | 3243 | 2873 | mat 2264: 3576:2025-08→2026-07 [327] → 4212:2026-08→2027-07 [367] |
| Campo Grande | Luiza Pimentel Oliveira Barbosa | 2 | 1 | 2 | 3242 | 3103 | mat 2262: 3574:2025-07→2026-06 [347/358] → 4211:2026-08→2027-07 [387]<br>mat 2465: 3922:2026-02→2027-01 [350] |
| Campo Grande | Marcello Fernandes Junior | 2 | 1 | 3 | 3142 | 3274 | mat 1251: 1796:2023-03→2023-07 [320] → 2242:2023-09→2024-08 [337] → 2890:2024-09→2025-08 [370] → 3659:2025-09→2026-08 [427]<br>mat 1323: 1869:2023-03→2023-08 [287] → 2243:2023-09→2024-08 [300] → 2816:2024-09→2025-08 [330] → 3532:2025-09→2026-08 [370] → 4242:2026-09→2027-08 [417]<br>mat 2293: 3628:2025-08→2026-03 [170] |
| Campo Grande | Maria Flor Silva Da Conceiçao | 2 | 1 | 1 | 2569 | 2709 | mat 1611: 2370:2024-02→2025-01 [250] → 3139:2025-02→2026-02 [300] → 3960:2026-03→2027-02 [348] |
| Campo Grande | Maria Luisa Silva da Conceição | 2 | 1 | 1 | 2567 | 2708 | mat 1610: 2369:2024-02→2025-01 [250] → 3138:2025-02→2026-02 [300] → 3959:2026-03→2027-02 [348] |
| Campo Grande | Maria Rita Porfirio da Conceição | 2 | 1 | 1 | 2568 | 2707 | mat 1612: 2371:2024-02→2025-01 [250] → 3137:2025-02→2026-02 [300] → 3961:2026-03→2027-02 [348] |
| Campo Grande | Marina de Albuquerque Bulhões Silva | 2 | 1 | 3 | 2848 | 3087 | mat 285: 724:2020-01→2020-05 [245] → 1081:2020-06→2021-06 [245] → 1321:2021-07→2022-01 [265]<br>mat 948: 1336:2021-07→2021-12 [225]<br>mat 1732: 2587:2024-04→2025-03 [167/307/337] → 3397:2025-05→2026-04 [337] → 4075:2026-05→2027-04 [377] |
| Campo Grande | Pedro Gabriel da França Rocha Pinto | 2 | 1 | 2 | 3100 | 2840 | mat 332: 836:2020-01→2020-07 [285] → 1111:2020-08→2021-07 [285] → 1346:2021-08→2022-07 [287] → 1617:2022-08→2023-07 [287] → 2226:2023-08→2024-07 [300] → 2754:2024-08→2025-07 [330] → 3596:2025-08→2026-07 [311.25/373]<br>mat 962: 1359:2021-08→2022-07 [267] → 1616:2022-08→2023-07 [277] → 2202:2023-08→2024-07 [297] → 2740:2024-08→2025-07 [327] → 3579:2025-08→2026-07 [306.26/320/370] → 4213:2026-08→2027-07 [412] |
| Campo Grande | Pedro Henrique Argeu Costa da Silva | 3 | 1 | 3 | 3117 | 2769, 2917 | mat 775: 1009:2020-02→2021-01 [20/265/300/320] → 1254:2021-02→2021-06 [62.11/100/165/245/265]<br>mat 1039: 1503:2022-04→2022-09 [87/200/287]<br>mat 1830: 2748:2024-06→2025-05 [30/300/330] → 3430:2025-06→2026-07 [7.93/367/368.68] → 4179:2026-08→2027-07 [407] |
| Campo Grande | Priscila Amaro da Silva | 2 | 1 | 1 | 2455 | 2558 | mat 1258: 1803:2023-02→2023-12 [297] → 2361:2024-01→2024-12 [307] → 3123:2025-01→2026-01 [307] → 3919:2026-02→2027-01 [33.46/213.54/347] |
| Campo Grande | Rebeca dos Santos Gregório Pinto | 2 | 1 | 1 | 2573 | 2719 | mat 902: 1267:2021-03→2022-02 [267] → 1479:2022-03→2023-02 [287] → 1976:2023-03→2024-02 [300] → 2564:2024-03→2025-02 [300/318] → 3293:2025-03→2026-02 [357] → 3965:2026-03→2027-02 [380] |
| Recreio | Arthur de Carvalho Rodrigues Frota Almeida | 2 | 1 | 1 | 3525 | 3463 | mat 1296: 2111:2025-09→2026-08 [395] → 2621:2026-09→2027-08 [434.5] |
| Recreio | Arthur Quinteiro Artacho | 2 | ? | 1 | 3452, 3528 | — | Mensalidade **15** (simbólica), sem parcela emitida. O 2º registro é de **2027-05**, fora de 2026 — não entra na taxa do ano |
| Recreio | Daniel Cardoso Poggio Contardo | 2 | 1 | 1 | 2400 | 121 | mat 1120: 1791:2025-02→2026-01 [385] → 2249:2026-02→2027-01 [427.35] |
| Recreio | Daniel Duque Vianna | 2 | 1 | 1 | 3407 | 3330 | mat 994: 1567:2024-07→2025-06 [350] → 2042:2025-07→2026-06 [385]. Matrícula **inativa**; `contrato_atual` = 2572, mensalidade **405** — bate com o registro de ago (3407). O de jul trazia 423,50, valor inexistente em contrato |
| Recreio | Enrico Florenzano | 2 | 1 | 1 | 3450 | 3532 | mat 1020: 1620:2024-08→2025-07 [395] → 2085:2025-08→2026-07 [442.4] → 2633:2026-08→2027-07 [473.36] |
| Recreio | Gabriel Vidal França de Carvalho | 2 | 1 | 1 | 3446 | 3524 | mat 1010: 1598:2024-08→2025-07 [375] → 2080:2025-08→2026-07 [423.75] → 2615:2026-08→2027-07 [453.41] |
| Recreio | Gael Rodrigues Martins | 2 | 1 | 1 | 3204 | 3282 | mat 652: 868:2022-07→2023-06 [395] → 1175:2023-07→2024-06 [410] → 1521:2024-07→2025-06 [425] → 2002:2025-07→2026-06 [463.25] → 2540:2026-07→2027-06 [495.67] |
| Recreio | João Francisco Quintella de Macedo Mayer | 2 | 1 | 1 | 3526 | 3469 | mat 833: 1253:2023-09→2024-08 [385] → 1633:2024-09→2025-08 [412] → 2133:2025-09→2026-08 [444.96] → 2622:2026-09→2027-08 [462.75] |
| Recreio | Letícia Ferreira Vasconcelos | 2 | 1 | 1 | 2463 | 227 | mat 1158: 1855:2025-02→2026-01 [420] → 2320:2026-04→2027-03 [462] |
| Recreio | Lohan Marques Boente | 2 | 1 | 1 | 3411 | 3324 | mat 510: 644:2021-12→2022-12 [365] → 1002:2023-01→2023-12 [385] → 1383:2024-08→2025-07 [405] → 2035:2025-08→2026-07 [453.6] → 2576:2026-08→2027-07 [498.96] |
| Recreio | Maria Clara Monteiro de Carvalho | 2 | 2 | 3 | 3331, 3503 | — | mat 721: 1016:2023-02→2024-01 [355] → 1342:2024-02→2025-01 [305] → 1779:2025-02→2026-01 [335.5] → 2246:2026-02→2027-01 [375.76]<br>mat 828: 1242:2023-08→2024-07 [295] → 1577:2024-08→2025-07 [340] → 2043:2025-08→2026-07 [374] → 2596:2026-08→2027-07 [407.66]<br>mat 1452: 2440:2026-05→2026-06 [13/797] |
| Recreio | Maria Eduarda Quinteiro Artacho | 2 | ? | 1 | 3453, 3529 | — | Mensalidade **15** (simbólica), sem parcela emitida. O 2º registro é de **2027-05**, fora de 2026 — não entra na taxa do ano |
| Recreio | Noah Ciccarelli Artacho Pincelli | 2 | 1 | 1 | 3345 | 3451 | Bolsista (mensalidade 0), sem parcela emitida. Os 2 registros são **idênticos** (2026-08, Guitarra, pendente) e ele tem 1 matrícula (675) — mantido o original |
| Recreio | Pietra Sucena Novaes Calvo Bueno | 2 | 1 | 1 | 3436 | 3523 | mat 662: 901:2022-08→2023-07 [375] → 1174:2023-08→2024-07 [385] → 1582:2024-08→2025-07 [168.5/221/362.9/389.5/410] → 2049:2025-08→2026-07 [427.9/428.8] → 2607:2026-08→2027-07 [470.69] |
| Recreio | Sofia Gonçalves Copello Moraes | 2 | 1 | 1 | 3527 | 3465 | mat 683: 939:2022-09→2023-08 [420] → 1245:2023-09→2024-08 [440] → 1632:2024-09→2025-08 [484] → 2118:2025-09→2026-08 [508.2] → 2623:2026-09→2027-08 [543.77] |