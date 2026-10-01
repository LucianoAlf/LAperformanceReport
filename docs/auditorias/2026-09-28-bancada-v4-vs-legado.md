# Bancada de repetição — caixa da Sol: caminho legado × V4 (28/09/2026)

**O que é:** repetição, **somente leitura**, dos lançamentos que a equipe aprovou com "pode", passando
cada um pelos dois caminhos de casamento de fatura do caixa da Sol e comparando o resultado com a
fatura que ficou de fato vinculada à movimentação.

- **Script:** [`scripts/bancada-sol-v4-vs-legado.mjs`](../../scripts/bancada-sol-v4-vs-legado.mjs)
- **Nada foi gravado em produção.** Cada caso roda em `BEGIN … ROLLBACK`; as cópias "com data do caso"
  das RPCs vivem em `pg_temp` e somem com o rollback. Nada criado em `public`. Na VPS, só `cat` de log.
- **Sem PII neste arquivo:** casos citados pelo id curto (8 caracteres) da movimentação em
  `caixa_movimentacoes`. O detalhe caso a caso (com nomes) fica fora do repo (`SAIDA_JSON`).

## ⚠️ Leia antes do placar: o gabarito favorece o legado

O gabarito são os lançamentos aprovados por humano em `sol_caixa_lancamento_auditoria`. **Quase todos
nasceram de um card montado pelo próprio caminho legado**: a equipe aprovou (ou corrigiu) o que o
legado mostrou. Quando o legado escolhia uma fatura plausível, o humano tendia a aprovar; então
"concordar com o gabarito" mede, em parte, "concordar com o legado". Os casos em que **os três
caminhos concordam entre si e divergem do gabarito** (seção "Gabarito suspeito") são o sinal mais
claro disso.

## Método

### Conjunto de casos

| etapa | n |
|---|---:|
| Linhas do gabarito com `movimentacao_id` (distintas) | 403 |
| − apagadas depois (`caixa_movimentacoes` não tem mais a linha) | 10 |
| − registros de correção (não são lançamento de comprovante) | 1 |
| − saídas / sem tipo | 11 |
| − lojinha (não tem fatura de parcela para casar) | 20 |
| − itens de lote multi-aluno (fora do escopo desta bancada) | 56 |
| − mensagem de origem não recuperável | 4 |
| **Casos na bancada (parcela + passaporte, entrada, aluno único)** | **301** |
| … com fatura vinculada no gabarito | 262 |
| … sem fatura vinculada no gabarito | 39 |

Estorno: a única operação de estorno registrada caiu nos filtros acima.

### Texto humano recuperado

O `caixa.log` **não guarda** a legenda nem o texto das mensagens (só contagens). A fonte do texto foi
`logs/whatsapp-group-observe.jsonl` do perfil da Sol, que registra o corpo de toda mensagem de grupo
com `messageId`. O `origem_message_id` do gabarito casou com **398 de 403** mensagens.

| origem do texto | casos |
|---|---:|
| legenda da própria mídia | 129 |
| mensagem de texto "irmã" (mesmo remetente, −150 s a +120 s da mídia) | 171 |
| nenhum texto | 1 |

390 dos 398 lançamentos vieram de **mídia** (foto/PDF); só 8 de texto puro.

### Os caminhos comparados

- **A — legado.** Nome extraído do texto com as funções do próprio runtime (`_alunoRotulado` →
  `_alunoFromCaption` → `nomePlausivel`), competência com `extrairCompetenciaTexto`, valor = valor
  aprovado. Decisão reproduzida do bloco `tentarCanonica` de `caixa-financeiro.cjs`: canônica
  (`sol_caixa_parcela_canonica_env_v1` com `as_of` = dia do caso); com competência declarada, só aceita
  se a fatura for daquele mês, senão cai em `sol_caixa_casar_parcela`; sem competência, cai em
  `casar_parcela` exceto para taxa/passaporte. Guarda de rótulo (`_mesmaPessoa`) aplicada.
- **B — V4 (`sol_caixa_resolver_envelope_v1`, cópia com `as_of`).** Três variantes de envelope:
  - **B-shadow**: campos que o **modelo** extraiu, lidos das linhas `roteador_v4_shadow`
    (`lancamento_por_texto`/`lancamento_multi_aluno`) cujo `texto` é o texto humano do caso,
    montados com `montarEnvelopeV4` do runtime. O modelo **não** foi chamado.
  - **B-shadow normalizado**: igual, mas categoria fora do vocabulário do banco vira filtro vazio
    (ver achado 2).
  - **B-mesma entrada**: envelope com o **mesmo nome que o legado extraiu**, valor aprovado,
    categoria do gabarito e competência do texto. Isola o resolvedor do modelo.
  - **B-nome canônico**: igual ao anterior, mas com o nome **como gravado no gabarito** (limite
    superior — o nome já passou por um humano e pelo legado).

Classes: **acertou** (mesma fatura), **outra fatura** (PERIGOSO), **parcial** (conjunto de faturas
diferente do gabarito, com interseção), **não achou** (fail-closed), **sem vínculo coerente**
(gabarito sem fatura e o caminho também não vinculou), **vinculou / gabarito sem vínculo** (o caminho
propõe uma fatura onde o humano lançou sem vínculo — indeterminado), **erro** (nenhum caso).

## Placar

### Todos os 301 casos

| classe | A legado | B mesma entrada | B nome canônico |
|---|---:|---:|---:|
| acertou | **231** | 228 | **245** |
| outra fatura (PERIGOSO) | 15 | 5 | 5 |
| parcial | 0 | 1 | 2 |
| não achou (fail-closed) | 16 | 40 | 21 |
| sem vínculo coerente | 8 | 0 | 0 |
| vinculou / gabarito sem vínculo | 30 | 27 | 28 |
| fora do escopo (A: fluxo multi) | 1 | — | — |

Acertos sobre os 262 casos com fatura no gabarito: A 231 (88%), B-mesma 228 (87%), B-canônico 245 (94%).

Por período (acertos / casos):

| período | casos | com fatura | A | B mesma | B canônico |
|---|---:|---:|---:|---:|---:|
| agosto | 100 | 74 | 61 | 64 | 71 |
| 01–14/09 | 130 | 121 | 110 | 108 | 113 |
| 15–28/09 | 71 | 67 | 60 | 56 | 61 |

### Subconjunto com extração real do modelo (76 casos)

Só existe saída do modelo quando o roteador em sombra leu o texto — isto é, texto **de mensagem**
(nunca legenda de mídia) e só desde 08/09, quando o log passou a guardar o `texto`.

| classe | A legado | B-shadow (cru) | B-shadow normalizado | B mesma | B canônico |
|---|---:|---:|---:|---:|---:|
| acertou | 67 | 47 | **64** | 66 | 68 |
| outra fatura (PERIGOSO) | 3 | 1 | 1 | 1 | 1 |
| não achou | 2 | 24 | 7 | 7 | 6 |
| vinculou / gabarito sem vínculo | 3 | 3 | 3 | 2 | 1 |
| sem vínculo coerente | 1 | 0 | 0 | 0 | 0 |
| sem extração do modelo | — | 1 | 1 | — | — |

## Achados

1. **O V4 erra menos de fatura, e recusa mais.** Com a mesma entrada, B escolheu fatura errada em
   5 casos contra 15 do legado — e **4 dos 5 são casos em que os três caminhos concordam contra o
   gabarito** (ver "Gabarito suspeito"). Em compensação B recusa 40 vezes contra 16. É a troca que o
   desenho do resolvedor promete: "não achei" no lugar de chute.
2. **O modelo põe o rótulo da unidade em `categoria`.** Em 17 dos 24 "não achou" do B-shadow, o campo
   `categoria` veio `"la cg"` / `"kids cg"` (da legenda "PG parcela 09/2026 aluno X - Kids CG") e o
   filtro de categoria zerou o universo (`nenhuma_fatura_aberta`). Descartando categoria fora do
   vocabulário, B-shadow sobe de 47 para 64 acertos em 76 — praticamente o mesmo que o legado (67).
   ⚠️ O log de sombra guarda só os campos **singulares**; o envelope real usa `itens[].categorias`
   quando o modelo preenche `itens`, que o log não registra. Então o número "cru" pode ser pior que a
   produção, e o normalizado pode ser melhor — os dois limitam o valor real.
3. **Nome exato é o principal motivo de recusa do B.** "aluno_nao_encontrado" (18) e
   "nenhuma_combinacao_fecha" (10) dominam as recusas do B-mesma. Com o nome canônico elas caem para
   4 e 9. Caso ilustrativo reproduzido (ba40d04a): a pessoa tem duas matrículas e o **nome cadastrado
   difere entre elas** ("… Silveira" × "… da Silveira"); o filtro de igualdade exata do resolvedor
   (`upper(btrim(aluno)) = …`) tira a fatura certa do universo e a soma não fecha. O legado acha pela
   canônica, que resolve por similaridade.
4. **O legado erra de fatura principalmente pelo `casar_parcela` com competência declarada** (9 dos 15
   perigosos vêm de `casar_competencia`). Parte disso é artefato do replay (limitação 3), mas a forma
   do erro é real: `casar_parcela` ordena por "mês declarado" e depois "valor mais próximo" entre as
   faturas **abertas**, e quando a certa já está paga ele devolve a próxima aberta.
5. **Latência:** o trilho agent-first não foi mais rápido que o legado na mensagem→card.

## Listas nominais (id curto da movimentação)

**B-mesma acerta e A erra (4):** 0fafb5ca, e66a0193, 199f5539, 9f44c804 — todos com A em "outra fatura".

**A acerta e B-mesma erra (7):** b1a5aa17 (outra fatura), 10518476, 939f8998, 11df9b10
(`nenhuma_fatura_aberta`), 559141eb (`combinacao_ambigua`), ba40d04a, 77d6c325
(`nenhuma_combinacao_fecha`).

**B-canônico acerta e A erra:** 21 casos. **A acerta e B-canônico erra:** 7 casos.

**No subconjunto do modelo (76):** B-shadow normalizado acerta e A erra — 9f44c804. A acerta e
B-shadow normalizado erra — ae0a5947 (sem extração), b4ddac68 e 77d6c325 (`nenhuma_combinacao_fecha`;
em b4ddac68 o valor extraído pelo modelo difere do aprovado), df0291f2 (modelo classificou como
`venda`, valor diferente). Contra o B-shadow **cru**, o legado acerta 20 casos que o B erra (quase
todos pelo achado 2).

## Casos PERIGOSOS (fatura diferente da do gabarito)

### Gabarito suspeito — A, B-mesma e B-canônico escolhem a MESMA fatura alternativa

| caso | data | o que difere |
|---|---|---|
| b3920a89 | 21/08 | gabarito aponta parcela de 07 de outra pessoa; os três escolhem parcela 08 |
| 6b310c77 | 26/08 | gabarito: taxa de matrícula de uma pessoa; os três: passaporte de outra |
| 06d4dfbb | 08/09 | gabarito: passaporte; os três: parcela 09 da mesma matrícula |
| fc48d8af | 17/09 | mesma matrícula e mês, fatura "irmã" (duas faturas do mesmo mês) — B-shadow também escolhe esta |

Três caminhos independentes em concordância sugerem erro no vínculo gravado, não nos caminhos.
Merecem conferência humana antes de contar como erro de qualquer um.

### Só do legado (A)

| caso | data | via | natureza | observação |
|---|---|---|---|---|
| 0fafb5ca | 18/08 | canônica | mesma matrícula, **outro mês** | B acerta |
| 75639aed | 29/08 | canônica | passaporte → parcela da mesma matrícula | B recusa |
| c54a98f1 | 14/09 | canônica | **pessoa diferente** (outro aluno da unidade, parcela futura) | B-canônico acerta, B-mesma recusa |
| e66a0193 | 24/08 | casar_competencia | mesma pessoa, outro curso, parcela futura em aberto | provável artefato (lim. 3); B acerta |
| 199f5539 | 25/08 | casar_competencia | mesma matrícula, parcela futura em aberto | provável artefato; B acerta |
| 49578fc7 | 05/09 | casar_competencia | **pessoa diferente**, parcela futura em aberto | provável artefato; B-canônico acerta |
| 3abec916 | 05/09 | casar_competencia | **pessoa diferente**, parcela futura em aberto | provável artefato; B-canônico acerta |
| 2ab1a67a | 05/09 | casar_competencia | mesma matrícula, mês declarado (08) ≠ gabarito (09) | B recusa |
| 477b13ee | 09/09 | casar_competencia | mesma pessoa, outra matrícula, parcela futura | provável artefato; B dá "parcial" |
| 9f44c804 | 10/09 | casar_competencia | mesma matrícula, parcela futura | provável artefato; B acerta |
| 51e9cf20 | 18/09 | casar_competencia | mesma matrícula e mês, fatura irmã | B recusa (`combinacao_ambigua`) |

"Provável artefato": `casar_parcela` lê o status **de hoje**; a fatura certa, aberta no dia do
lançamento, hoje está paga, e o casador pula para a próxima aberta. Não dá para afirmar que o legado
erraria no dia — mas a forma do erro (pular para a próxima aberta) é a mesma do bug de 24/09 que
motivou o "PASSO 0" dessa função.

### Só do V4

| caso | data | variante | natureza |
|---|---|---|---|
| b1a5aa17 | 05/09 | B-mesma e B-canônico | mesma matrícula, **outro mês** (09 no lugar de 08); o legado acerta |
| 477b13ee | 09/09 | B-mesma e B-canônico (parcial) | soma fechou com as parcelas de **duas** matrículas da mesma pessoa; o gabarito tem uma |
| 1b822d53 | 14/09 | B-canônico (parcial) | soma fechou com parcelas de dois cursos da mesma pessoa; o gabarito tem uma |

Nos dois "parcial" o resolvedor achou uma combinação **única no centavo** que não era a lançada —
a unicidade da soma não protege quando duas matrículas da mesma pessoa têm parcelas iguais ou
complementares.

## Latência (do `caixa.log`)

Mensagem de origem → card, **só casos aprovados** (card identificado pelo `preview_message_id`).
Trilho "agent_first" = houve `agent_first_resolveu` / `preview_agent_first_singular` /
`agent_first_midia_estruturada` no mesmo chat entre a mensagem e o card.

| período | trilho | n | mediana (s) | p90 (s) |
|---|---|---:|---:|---:|
| até 31/08 | legado | 89 | 33,0 | 94,5 |
| 01–14/09 | legado | 103 | 27,5 | 40,5 |
| 15–27/09 | legado | 45 | 37,2 | 55,8 |
| 15–27/09 | agent_first | 3 | 45,8 | 109,6 |

Último `msg` do chat → card, **todos os cards** do log:

| período | trilho | n | mediana (s) | p90 (s) |
|---|---|---:|---:|---:|
| até 31/08 | legado | 203 | 28,4 | 94,1 |
| 01–14/09 | legado | 201 | 27,3 | 40,3 |
| 15–27/09 | legado | 111 | 35,7 | 48,6 |
| 15–27/09 | agent_first | 12 | 46,3 | 84,0 |
| 28/09 | legado | 1 | 11,2 | 11,2 |
| 28/09 | agent_first | 2 | 50,1 | 60,2 |

Tempo interno do resolvedor agent-first (`agent_first_resolveu.ms`): mediana 6,6 s (01–14/09, n=6),
11,0 s (15–27/09, n=10), 9,2 s (28/09, n=1).

A latência de mídia inclui OCR, visão e espera da legenda irmã; não é o tempo da RPC.

## Limitações — o que não deu para reproduzir e por quê

1. **Viés do gabarito a favor do legado** (acima).
2. **Saída do modelo só existe para 76 dos 301 casos.** O roteador em sombra só processa mensagem de
   texto, não legenda de mídia, e só grava o `texto` desde 08/09. Os outros 225 casos do V4 foram
   rodados com envelope **montado da mesma entrada do legado** (B-mesma) ou do nome gravado
   (B-canônico) — mede o **resolvedor**, não o modelo.
3. **Tempo não volta inteiro.** As RPCs ganharam `as_of` (cópias em `pg_temp`), mas os dados são os
   de hoje: status de fatura (aberta/paga), `sol_caixa_aluno_pode_pagar_v1` (janela de 90 dias contra
   `now()`), cadastro de alunos e responsáveis. O `casar_parcela` é o mais afetado: ele só enxerga
   faturas **abertas hoje**. Os perigosos do legado via `casar_competencia` que escolhem parcela
   futura em aberto estão marcados como "provável artefato".
4. **Frescor da fonte neutralizado no replay.** A canônica julga o frescor pela sincronização **de
   hoje**; todo caso de agosto saía `fonte_indisponivel` (86 casos) por construção. A cópia de replay
   aceita `stale` como fresco (no legado e, por simetria, no resolvedor, onde só muda o rótulo do
   "não achou"). Numa primeira rodada sem esse ajuste o legado tinha 170 acertos; com ele, 231.
5. **O legado tem caminhos que a bancada não reproduz:** OCR/visão do comprovante (pagador,
   `extrairValorOcr`), identificação por pagador (`sol_caixa_aluno_por_responsavel`), aluno novo pelo
   funil (`identificarAlunoNovoFn`), fluxo multi-aluno e correções humanas no card antes do "pode".
   O valor usado é o **aprovado**, não o lido do comprovante — otimista para os dois lados.
6. **Categoria do gabarito** foi usada como categoria do legado e do B-mesma/B-canônico (o legado real
   usa a interpretação do comprovante). Otimista.
7. **Texto humano por proximidade.** Quando a mídia veio sem legenda, o texto é a mensagem do mesmo
   remetente mais próxima (−150 s/+120 s); pode, raramente, ser a legenda de outro comprovante.
8. **Lotes multi-aluno (56) e lojinha (20) ficaram fora.** São justamente onde o V4 tem desenho
   diferente (combinação no centavo sobre vários alunos) — merecem bancada própria.
9. **"Vinculou / gabarito sem vínculo" não é erro nem acerto.** 19 dos 30 do legado são de agosto,
   quando o caixa ainda não gravava vínculo com fatura em boa parte dos lançamentos; nenhuma das
   faturas propostas está vinculada a outra movimentação.
10. **Latência do agent-first com n pequeno** (3 casos aprovados, 14 cards) e, desde 28/09, parte do
    trilho do agente passa pela ferramenta na ponte, que não emite `preview_enviado` com o mesmo
    formato.

## Como rodar de novo

```bash
# credenciais: as mesmas do `npm run mapa:banco` (.env.local + supabase/.temp/pooler-url)
CAIXA_LOG=/tmp/caixa.log OBSERVE_LOG=/tmp/observe.jsonl SAIDA_JSON=/tmp/bancada.json \
  node scripts/bancada-sol-v4-vs-legado.mjs
```

Sem `CAIXA_LOG`/`OBSERVE_LOG`, o script lê os logs por `ssh lahq cat`. Resultados por caso ficam em
cache (`CACHE_JSON`, padrão no diretório temporário) para retomar se a conexão cair. Duração medida:
~25 min para 301 casos (uma conexão, sequencial).
